/* Play log, comments and export are independent of the combat engine and DOM. Nothing here uses the network. */
(function (root) {
  "use strict";
  // The pre-ACT26 notes key is read only. No code in this file writes or removes it.
  const KEY = "order3.playtestNotes.v1";
  const KINDS = { impression: "感想", idea: "改善案", bug: "不具合" };
  const LEGACY_MARKER = "order3.playlog.v1.legacyExportedAt";
  const LEGACY_RAW_LIMIT = 200000;
  const clone = value => JSON.parse(JSON.stringify(value));
  let fallbackSequence = 0;
  /* ACT26 play log: seeded shuffle source, per-run recorder and local run store. No DOM, no network. */
  // The "v1" in the key prefix names the storage namespace, not the schema version: v1 and v2 runs share it.
  const PLAYLOG_PREFIX = "order3.playlog.v1.run.";
  // ACT30 writes schema v2 (no speed; enemy seed, enemy piles and slot-numbered enemy intents). Schema v1 runs (ACT26-29) stay readable.
  const PLAYLOG_SCHEMA = 2;
  const PLAYLOG_SCHEMAS = Object.freeze([1, 2]);
  const runSchema = run => run && typeof run === "object" && !Array.isArray(run) && Object.hasOwn(run, "schemaVersion") ? run.schemaVersion : 1;
  const PLAYLOG_LIMITS = Object.freeze({ runs: 20, chars: 1500000, turns: 60, comments: 50, commentCodePoints: 140 });
  // The dialog warns once the stored runs exceed 80% of the character limit. The limit itself is unchanged.
  const PLAYLOG_WARN_CHARS = PLAYLOG_LIMITS.chars * 0.8;
  // New turns and comments may use the character limit less this reserve; export marks and deletions may use all of it,
  // so a device filled by play can always record an export (which then makes runs evictable) or a deletion.
  const PLAYLOG_RESERVED_CHARS = 1000;
  // Web Locks name of one run. With Web Locks every write of a run is one read -> apply -> write of its latest stored copy under this lock.
  const PLAYLOG_LOCK_PREFIX = "order3.playlog.run.";
  // A tab that wrote keeps the lock this much longer, so its write has reached the other tabs' copies of localStorage before one of
  // them takes the lock and reads (the lock hand-over and the storage update travel separately between tabs). A timing margin, not a
  // guarantee: longer than one Windows scheduler quantum (about 15.6 ms), but a fully saturated CPU can still delay the update further.
  const PLAYLOG_LOCK_SETTLE_MS = 20;
  // Removing an old run at the limit waits at most this long for that run's lock.
  const PLAYLOG_LOCK_EVICT_WAIT_MS = 2000;
  const MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;

  // mulberry32. The generator state after n draws is seed + n * 0x6D2B79F5, so {seed, calls} fully restores it.
  function rngValue(seed, index) {
    let t = ((seed >>> 0) + Math.imul(index + 1, 0x6D2B79F5)) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function createRng(seed, calls = 0) {
    return { seed: seed >>> 0, calls, next() { const value = rngValue(this.seed, this.calls); this.calls += 1; return value; } };
  }
  const isUint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF;
  function chooseSeed(env = globalThis) {
    if (isUint32(env.ORDER3_TEST_SEED)) return env.ORDER3_TEST_SEED;
    if (env.crypto?.getRandomValues) return env.crypto.getRandomValues(new Uint32Array(1))[0];
    return (Date.now() ^ Math.floor((env.performance?.now?.() || 0) * 1000)) >>> 0;
  }
  const minuteStamp = ms => new Date(Math.floor(ms / 60000) * 60000).toISOString().slice(0, 16) + "Z";
  const layoutClass = width => width < 480 ? "narrow" : width < 900 ? "medium" : "wide";
  const codePoints = text => Array.from(String(text)).length;
  function commentText(text) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return { ok: false, reason: "empty" };
    if (/[\r\n]/.test(trimmed) || [0x2028, 0x2029].some(code => trimmed.includes(String.fromCharCode(code)))) return { ok: false, reason: "newline" };
    if (codePoints(trimmed) > PLAYLOG_LIMITS.commentCodePoints) return { ok: false, reason: "too-long" };
    return { ok: true, text: trimmed };
  }
  function newRunId(cryptoObject = globalThis.crypto) {
    if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
    return `run-${Date.now().toString(36)}-${(++fallbackSequence).toString(36)}`;
  }

  // Plain, whitelisted copies. Unknown fields never enter a log.
  const cellRecord = cell => ({ x: cell.x, y: cell.y });
  const unitRecord = unit => ({ id: unit.id, hp: unit.hp, x: unit.x, y: unit.y, guard: unit.guard, rooted: unit.rooted, marked: unit.marked });
  // Schema v2 queue record (ACT30): the speed key is gone.
  function queueRecord(action) {
    return { instanceId: action.instanceId ?? action.instance?.instanceId, cardId: action.cardId, mode: action.mode, actorId: action.actorId,
      targetId: action.targetId ?? null, target: action.target ? cellRecord(action.target) : null };
  }
  function commentContextRecord(context) {
    const selection = context?.selection;
    const preview = context?.preview || {};
    return {
      selection: selection ? { instanceId: selection.instanceId, cardId: selection.cardId, mode: selection.mode, moveUnitId: selection.moveUnitId ?? null } : null,
      queue: (context?.queue || []).map(queueRecord),
      preview: { kind: preview.kind || "current", eventIndex: Number.isInteger(preview.eventIndex) ? preview.eventIndex : null, eventKey: preview.eventKey ?? null },
      battle: context?.battle ?? null
    };
  }
  const PHASE_LABEL = { planning: "計画中", resolving: "作戦解決中", ended: "戦闘終了" };
  const PREVIEW_LABEL = { current: "現在盤面", "selection-before": "選択した命令の直前", final: "全行動後の最終予測" };
  // The resolution number of the previewed event as the battle screen names it (味方② / 敵②), from its key: an ally order
  // ("player-<card instance>") is numbered by its place in the queue, an enemy order ("enemy-<enemy card instance>", ACT30) by
  // enemySlots (enemy card instanceId -> slot ①②③ of that turn's committed enemy orders). Null when it cannot be told.
  const SLOT_MARK = ["①", "②", "③"];
  function commentEventLabel(context, enemySlots = {}) {
    const key = context?.preview?.eventKey;
    if (typeof key !== "string") return null;
    const mark = number => SLOT_MARK[number - 1] || String(number);
    if (key.startsWith("player-")) {
      const index = (context.queue || []).findIndex(item => `player-${item.instanceId}` === key);
      return index >= 0 ? `味方${mark(index + 1)}` : null;
    }
    const instanceId = key.startsWith("enemy-") ? key.slice("enemy-".length) : null;
    const slot = instanceId && plainObject(enemySlots) && Object.hasOwn(enemySlots, instanceId) ? enemySlots[instanceId] : null;
    return Number.isInteger(slot) && slot >= 1 && slot <= 3 ? `敵${mark(slot)}` : null;
  }
  // One-line scene text; names maps cardId to the displayed card name, enemySlots maps an enemy card instanceId to its slot number.
  function commentSceneLine(comment, names = {}, enemySlots = {}) {
    const { context } = comment;
    const parts = [`TURN ${String(comment.turn).padStart(2, "0")}`];
    const eventLabel = commentEventLabel(context, enemySlots);
    if (comment.phase === "resolving") parts.push(`作戦解決中${eventLabel ? ` ${eventLabel}` : ""}`);
    else if (comment.phase === "ended") parts.push(context.battle === "victory" ? "勝利" : context.battle === "defeat" ? "敗北" : PHASE_LABEL.ended);
    else {
      parts.push(PHASE_LABEL.planning);
      if (context.selection) parts.push(`選択: ${names[context.selection.cardId] || context.selection.cardId}`);
      parts.push(`命令 ${context.queue.length}件`);
      parts.push(context.preview.kind === "event-after" ? `${eventLabel || "予測表示中の行動"}の直後` : PREVIEW_LABEL[context.preview.kind] || context.preview.kind);
    }
    return parts.join("｜");
  }
  // Short label for comment lists: "TURN 03 計画中".
  function commentPhaseLabel(comment) {
    const phase = comment.phase === "ended"
      ? comment.context?.battle === "victory" ? "勝利" : comment.context?.battle === "defeat" ? "敗北" : PHASE_LABEL.ended
      : PHASE_LABEL[comment.phase] || comment.phase;
    return `TURN ${String(comment.turn).padStart(2, "0")} ${phase}`;
  }

  // Pre-ACT26 notes: read once, never written. Only whitelisted fields leave the device, with times cut to the minute.
  const minuteOrNull = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? minuteStamp(Date.parse(value)) : null;
  const shortOrNull = value => typeof value === "string" ? value.slice(0, 200) : null;
  const intOrNull = value => Number.isInteger(value) ? value : null;
  const plainObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  function legacySceneRecord(scene) {
    if (!plainObject(scene)) return null;
    const selection = plainObject(scene.selection) ? scene.selection : null;
    const preview = plainObject(scene.preview) ? scene.preview : null;
    return {
      capturedAt: minuteOrNull(scene.capturedAt), gameVersion: shortOrNull(scene.gameVersion), turn: intOrNull(scene.turn), phase: shortOrNull(scene.phase),
      selection: selection ? { cardId: shortOrNull(selection.cardId), cardName: shortOrNull(selection.cardName), mode: shortOrNull(selection.mode),
        moveUnitId: shortOrNull(selection.moveUnitId) } : null,
      orders: (Array.isArray(scene.orders) ? scene.orders : []).filter(plainObject).slice(0, 3).map(order => ({ index: intOrNull(order.index),
        cardId: shortOrNull(order.cardId), actor: shortOrNull(order.actor), action: shortOrNull(order.action), mode: shortOrNull(order.mode),
        speed: shortOrNull(order.speed), target: shortOrNull(order.target) })),
      preview: preview ? { kind: shortOrNull(preview.kind), eventIndex: intOrNull(preview.eventIndex), eventKey: shortOrNull(preview.eventKey),
        label: shortOrNull(preview.label) } : null
    };
  }
  // { present, status: 'none'|'unavailable'|'parsed'|'unreadable', notes, raw, chars }
  function readLegacyNotes(getStorage) {
    let raw;
    try { raw = getStorage().getItem(KEY); } catch { return { present: false, status: "unavailable", notes: [], raw: null, chars: 0 }; }
    if (typeof raw !== "string") return { present: false, status: "none", notes: [], raw: null, chars: 0 };
    let data = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    const readable = data?.schemaVersion === 1 && Array.isArray(data.notes)
      && data.notes.every(note => plainObject(note) && Object.hasOwn(KINDS, note.kind) && typeof note.body === "string");
    if (!readable) return { present: true, status: "unreadable", notes: [], raw, chars: raw.length };
    const notes = data.notes.map(note => ({ kind: note.kind, body: note.body, createdAt: minuteOrNull(note.createdAt),
      updatedAt: minuteOrNull(note.updatedAt), scene: legacySceneRecord(note.scene) }));
    return { present: true, status: "parsed", notes, raw: null, chars: raw.length };
  }
  function legacyNotesRecord(legacy) {
    if (!legacy?.present) return null;
    if (legacy.status === "parsed") return { status: "parsed", notes: clone(legacy.notes), raw: null };
    const rawTruncated = legacy.raw.length > LEGACY_RAW_LIMIT;
    return { status: "unreadable", notes: [], raw: rawTruncated ? legacy.raw.slice(0, LEGACY_RAW_LIMIT) : legacy.raw, rawTruncated };
  }

  // Schema validation shared by the page, the recorder and work/tools/read-order3log.mjs.
  function validator() {
    const errors = [];
    const fail = (path, message) => { if (errors.length < 20) errors.push(`${path}: ${message}`); return false; };
    const obj = (value, path, keys) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "object expected");
      const extra = Object.keys(value).filter(key => !keys.includes(key));
      const missing = keys.filter(key => !Object.hasOwn(value, key));
      if (extra.length) return fail(path, `unknown keys ${extra.join(",")}`);
      if (missing.length) return fail(path, `missing keys ${missing.join(",")}`);
      return true;
    };
    const arr = (value, path, each, max = Infinity) => {
      if (!Array.isArray(value)) return fail(path, "array expected");
      if (value.length > max) return fail(path, `more than ${max} items`);
      return value.every((item, index) => each(item, `${path}[${index}]`));
    };
    const str = (value, path, max = 200) => typeof value === "string" && value.length <= max || fail(path, "string expected");
    const optStr = (value, path) => value === null || str(value, path);
    const int = (value, path, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(value) && value >= min && value <= max || fail(path, "integer expected");
    const bool = (value, path) => typeof value === "boolean" || fail(path, "boolean expected");
    const oneOf = (value, path, options) => options.includes(value) || fail(path, `one of ${options.join("|")} expected`);
    const minute = (value, path) => typeof value === "string" && MINUTE.test(value) || fail(path, "YYYY-MM-DDTHH:MMZ expected");
    const cell = (value, path) => obj(value, path, ["x", "y"]) && int(value.x, `${path}.x`, 0, 5) && int(value.y, `${path}.y`, 0, 5);
    const cells = (value, path) => arr(value, path, cell, 36);
    const unit = (value, path) => obj(value, path, ["id", "hp", "x", "y", "guard", "rooted", "marked"]) && str(value.id, `${path}.id`)
      && int(value.hp, `${path}.hp`, 0, 99) && int(value.x, `${path}.x`, 0, 5) && int(value.y, `${path}.y`, 0, 5)
      && int(value.guard, `${path}.guard`, 0, 999) && bool(value.rooted, `${path}.rooted`) && bool(value.marked, `${path}.marked`);
    const speed = (value, path) => oneOf(value, path, ["fast", "normal", "slow"]);
    const queue = (value, path) => obj(value, path, ["instanceId", "cardId", "mode", "actorId", "targetId", "target", "speed"])
      && str(value.instanceId, `${path}.instanceId`) && str(value.cardId, `${path}.cardId`)
      && oneOf(value.mode, `${path}.mode`, ["technique", "move", "legacy"]) && str(value.actorId, `${path}.actorId`)
      && optStr(value.targetId, `${path}.targetId`) && (value.target === null || cell(value.target, `${path}.target`)) && speed(value.speed, `${path}.speed`);
    const card = (value, path) => obj(value, path, ["instanceId", "cardId"]) && str(value.instanceId, `${path}.instanceId`) && str(value.cardId, `${path}.cardId`);
    const intent = (value, path) => obj(value, path, ["actorId", "id", "speed", "targetId", "cells"]) && str(value.actorId, `${path}.actorId`)
      && str(value.id, `${path}.id`) && speed(value.speed, `${path}.speed`) && optStr(value.targetId, `${path}.targetId`) && cells(value.cells, `${path}.cells`);
    const battle = (value, path) => value === null || oneOf(value, path, ["victory", "defeat"]);
    const ids = (value, path) => arr(value, path, (id, itemPath) => str(id, itemPath), 12);
    // deckOrder/discardOrder are instanceId orders, so a hand order that changes the discard pile is caught at its own turn.
    const start = (value, path) => obj(value, path, ["rngCalls", "units", "hostileRunes", "emberRunes", "hand", "deckCount", "discardCount", "deckOrder", "discardOrder", "intents"])
      && int(value.rngCalls, `${path}.rngCalls`) && arr(value.units, `${path}.units`, unit, 12) && cells(value.hostileRunes, `${path}.hostileRunes`)
      && cells(value.emberRunes, `${path}.emberRunes`) && arr(value.hand, `${path}.hand`, card, 12) && int(value.deckCount, `${path}.deckCount`, 0, 99)
      && int(value.discardCount, `${path}.discardCount`, 0, 99) && ids(value.deckOrder, `${path}.deckOrder`) && ids(value.discardOrder, `${path}.discardOrder`)
      && arr(value.intents, `${path}.intents`, intent, 12);
    const commit = (value, path) => value === null || (obj(value, path, ["planMs", "undoCount", "returnCount", "handOrder", "queue"])
      && int(value.planMs, `${path}.planMs`) && int(value.undoCount, `${path}.undoCount`) && int(value.returnCount, `${path}.returnCount`)
      && ids(value.handOrder, `${path}.handOrder`) && arr(value.queue, `${path}.queue`, queue, 3));
    const event = (value, path) => obj(value, path, ["key", "kind", "speed", "status", "reason"]) && str(value.key, `${path}.key`)
      && oneOf(value.kind, `${path}.kind`, ["player", "enemy"]) && speed(value.speed, `${path}.speed`)
      && oneOf(value.status, `${path}.status`, ["resolved", "cancelled"]) && str(value.reason, `${path}.reason`, 1000);
    const result = (value, path) => value === null || (obj(value, path, ["events", "units", "hostileRunes", "emberRunes", "battle", "deckOrder", "discardOrder"])
      && arr(value.events, `${path}.events`, event, 12) && arr(value.units, `${path}.units`, unit, 12)
      && cells(value.hostileRunes, `${path}.hostileRunes`) && cells(value.emberRunes, `${path}.emberRunes`) && battle(value.battle, `${path}.battle`)
      && ids(value.deckOrder, `${path}.deckOrder`) && ids(value.discardOrder, `${path}.discardOrder`));
    const turn = (value, path) => obj(value, path, ["turn", "start", "commit", "result"]) && int(value.turn, `${path}.turn`, 1, 999)
      && start(value.start, `${path}.start`) && commit(value.commit, `${path}.commit`) && result(value.result, `${path}.result`)
      // The recorder writes a result only onto a committed turn, so a result without a commit is not a recorder output.
      && (value.commit !== null || value.result === null || fail(`${path}.result`, "null expected without commit"));
    const selection = (value, path) => value === null || (obj(value, path, ["instanceId", "cardId", "mode", "moveUnitId"])
      && str(value.instanceId, `${path}.instanceId`) && str(value.cardId, `${path}.cardId`)
      && oneOf(value.mode, `${path}.mode`, ["technique", "move"]) && optStr(value.moveUnitId, `${path}.moveUnitId`));
    const preview = (value, path) => obj(value, path, ["kind", "eventIndex", "eventKey"])
      && oneOf(value.kind, `${path}.kind`, ["current", "selection-before", "event-after", "final", "resolving"])
      && (value.eventIndex === null || int(value.eventIndex, `${path}.eventIndex`, 0, 12)) && optStr(value.eventKey, `${path}.eventKey`);
    const comment = (value, path) => obj(value, path, ["commentId", "turn", "phase", "ms", "text", "context"]) && str(value.commentId, `${path}.commentId`, 40)
      && int(value.turn, `${path}.turn`, 1, 999) && oneOf(value.phase, `${path}.phase`, ["planning", "resolving", "ended"]) && int(value.ms, `${path}.ms`)
      && (commentText(value.text).ok && commentText(value.text).text === value.text || fail(`${path}.text`, "1-140 code points without newline expected"))
      && obj(value.context, `${path}.context`, ["selection", "queue", "preview", "battle"]) && selection(value.context.selection, `${path}.context.selection`)
      && arr(value.context.queue, `${path}.context.queue`, queue, 3) && preview(value.context.preview, `${path}.context.preview`)
      && battle(value.context.battle, `${path}.context.battle`);
    const run = (value, path) => obj(value, path, ["runId", "gameVersion", "startedAt", "rng", "seed", "layout", "status", "updatedAt", "exportedAt", "truncated", "turns", "comments"])
      && (str(value.runId, `${path}.runId`, 80) && /^[A-Za-z0-9_-]{1,80}$/.test(value.runId) || fail(`${path}.runId`, "id characters expected"))
      && str(value.gameVersion, `${path}.gameVersion`, 40) && minute(value.startedAt, `${path}.startedAt`) && oneOf(value.rng, `${path}.rng`, ["mulberry32"])
      && (isUint32(value.seed) || fail(`${path}.seed`, "uint32 expected")) && oneOf(value.layout, `${path}.layout`, ["narrow", "medium", "wide"])
      && oneOf(value.status, `${path}.status`, ["playing", "victory", "defeat"]) && minute(value.updatedAt, `${path}.updatedAt`)
      && (value.exportedAt === null || minute(value.exportedAt, `${path}.exportedAt`)) && bool(value.truncated, `${path}.truncated`)
      && arr(value.turns, `${path}.turns`, turn, PLAYLOG_LIMITS.turns) && arr(value.comments, `${path}.comments`, comment, PLAYLOG_LIMITS.comments)
      // The recorder sets truncated only when a turn starts with the turn limit already recorded, so any shorter run is not a recorder output.
      && (!value.truncated || value.turns.length === PLAYLOG_LIMITS.turns || fail(`${path}.truncated`, `true only with ${PLAYLOG_LIMITS.turns} recorded turns`));
    // Schema v2 (ACT30). The v1 rules above are unchanged; a run with a schemaVersion key is checked by these instead.
    const slot = (value, path) => int(value, path, 1, 3);
    const enemyIds = (value, path) => arr(value, path, (id, itemPath) => str(id, itemPath), 20);
    const queue2 = (value, path) => obj(value, path, ["instanceId", "cardId", "mode", "actorId", "targetId", "target"])
      && str(value.instanceId, `${path}.instanceId`) && str(value.cardId, `${path}.cardId`)
      && oneOf(value.mode, `${path}.mode`, ["technique", "move", "legacy"]) && str(value.actorId, `${path}.actorId`)
      && optStr(value.targetId, `${path}.targetId`) && (value.target === null || cell(value.target, `${path}.target`));
    const intent2 = (value, path) => obj(value, path, ["slot", "instanceId", "id", "actorId", "targetId", "cells"]) && slot(value.slot, `${path}.slot`)
      && str(value.instanceId, `${path}.instanceId`) && str(value.id, `${path}.id`) && str(value.actorId, `${path}.actorId`)
      && optStr(value.targetId, `${path}.targetId`) && cells(value.cells, `${path}.cells`);
    const start2 = (value, path) => obj(value, path, ["rngCalls", "units", "hostileRunes", "emberRunes", "hand", "deckCount", "discardCount", "deckOrder", "discardOrder", "intents",
      "enemyRngCalls", "enemyHand", "enemyDeckOrder", "enemyDiscardOrder"])
      && int(value.rngCalls, `${path}.rngCalls`) && arr(value.units, `${path}.units`, unit, 12) && cells(value.hostileRunes, `${path}.hostileRunes`)
      && cells(value.emberRunes, `${path}.emberRunes`) && arr(value.hand, `${path}.hand`, card, 12) && int(value.deckCount, `${path}.deckCount`, 0, 99)
      && int(value.discardCount, `${path}.discardCount`, 0, 99) && ids(value.deckOrder, `${path}.deckOrder`) && ids(value.discardOrder, `${path}.discardOrder`)
      && arr(value.intents, `${path}.intents`, intent2, 3) && int(value.enemyRngCalls, `${path}.enemyRngCalls`) && arr(value.enemyHand, `${path}.enemyHand`, card, 5)
      && enemyIds(value.enemyDeckOrder, `${path}.enemyDeckOrder`) && enemyIds(value.enemyDiscardOrder, `${path}.enemyDiscardOrder`);
    const commit2 = (value, path) => value === null || (obj(value, path, ["planMs", "undoCount", "returnCount", "handOrder", "queue"])
      && int(value.planMs, `${path}.planMs`) && int(value.undoCount, `${path}.undoCount`) && int(value.returnCount, `${path}.returnCount`)
      && ids(value.handOrder, `${path}.handOrder`) && arr(value.queue, `${path}.queue`, queue2, 3));
    const event2 = (value, path) => obj(value, path, ["key", "kind", "slot", "status", "reason"]) && str(value.key, `${path}.key`)
      && oneOf(value.kind, `${path}.kind`, ["player", "enemy"]) && slot(value.slot, `${path}.slot`)
      && oneOf(value.status, `${path}.status`, ["resolved", "cancelled"]) && str(value.reason, `${path}.reason`, 1000);
    const result2 = (value, path) => value === null || (obj(value, path, ["events", "units", "hostileRunes", "emberRunes", "battle", "deckOrder", "discardOrder", "enemyDeckOrder", "enemyDiscardOrder"])
      && arr(value.events, `${path}.events`, event2, 6) && arr(value.units, `${path}.units`, unit, 12)
      && cells(value.hostileRunes, `${path}.hostileRunes`) && cells(value.emberRunes, `${path}.emberRunes`) && battle(value.battle, `${path}.battle`)
      && ids(value.deckOrder, `${path}.deckOrder`) && ids(value.discardOrder, `${path}.discardOrder`)
      && enemyIds(value.enemyDeckOrder, `${path}.enemyDeckOrder`) && enemyIds(value.enemyDiscardOrder, `${path}.enemyDiscardOrder`));
    const turn2 = (value, path) => obj(value, path, ["turn", "start", "commit", "result"]) && int(value.turn, `${path}.turn`, 1, 999)
      && start2(value.start, `${path}.start`) && commit2(value.commit, `${path}.commit`) && result2(value.result, `${path}.result`)
      && (value.commit !== null || value.result === null || fail(`${path}.result`, "null expected without commit"));
    const comment2 = (value, path) => obj(value, path, ["commentId", "turn", "phase", "ms", "text", "context"]) && str(value.commentId, `${path}.commentId`, 40)
      && int(value.turn, `${path}.turn`, 1, 999) && oneOf(value.phase, `${path}.phase`, ["planning", "resolving", "ended"]) && int(value.ms, `${path}.ms`)
      && (commentText(value.text).ok && commentText(value.text).text === value.text || fail(`${path}.text`, "1-140 code points without newline expected"))
      && obj(value.context, `${path}.context`, ["selection", "queue", "preview", "battle"]) && selection(value.context.selection, `${path}.context.selection`)
      && arr(value.context.queue, `${path}.context.queue`, queue2, 3) && preview(value.context.preview, `${path}.context.preview`)
      && battle(value.context.battle, `${path}.context.battle`);
    const run2 = (value, path) => obj(value, path, ["schemaVersion", "runId", "gameVersion", "startedAt", "rng", "seed", "enemySeed", "layout", "status", "updatedAt", "exportedAt", "truncated", "turns", "comments"])
      && oneOf(value.schemaVersion, `${path}.schemaVersion`, [2])
      && (str(value.runId, `${path}.runId`, 80) && /^[A-Za-z0-9_-]{1,80}$/.test(value.runId) || fail(`${path}.runId`, "id characters expected"))
      && str(value.gameVersion, `${path}.gameVersion`, 40) && minute(value.startedAt, `${path}.startedAt`) && oneOf(value.rng, `${path}.rng`, ["mulberry32"])
      && (isUint32(value.seed) || fail(`${path}.seed`, "uint32 expected")) && (isUint32(value.enemySeed) || fail(`${path}.enemySeed`, "uint32 expected"))
      && oneOf(value.layout, `${path}.layout`, ["narrow", "medium", "wide"])
      && oneOf(value.status, `${path}.status`, ["playing", "victory", "defeat"]) && minute(value.updatedAt, `${path}.updatedAt`)
      && (value.exportedAt === null || minute(value.exportedAt, `${path}.exportedAt`)) && bool(value.truncated, `${path}.truncated`)
      && arr(value.turns, `${path}.turns`, turn2, PLAYLOG_LIMITS.turns) && arr(value.comments, `${path}.comments`, comment2, PLAYLOG_LIMITS.comments)
      && (!value.truncated || value.turns.length === PLAYLOG_LIMITS.turns || fail(`${path}.truncated`, `true only with ${PLAYLOG_LIMITS.turns} recorded turns`));
    const anyRun = (value, path) => runSchema(value) === 1 ? run(value, path) : run2(value, path);
    const optInt = (value, path) => value === null || int(value, path, 0, 999);
    const optMinute = (value, path) => value === null || minute(value, path);
    const legacyScene = (value, path) => value === null || (obj(value, path, ["capturedAt", "gameVersion", "turn", "phase", "selection", "orders", "preview"])
      && optMinute(value.capturedAt, `${path}.capturedAt`) && optStr(value.gameVersion, `${path}.gameVersion`) && optInt(value.turn, `${path}.turn`)
      && optStr(value.phase, `${path}.phase`)
      && (value.selection === null || obj(value.selection, `${path}.selection`, ["cardId", "cardName", "mode", "moveUnitId"])
        && ["cardId", "cardName", "mode", "moveUnitId"].every(key => optStr(value.selection[key], `${path}.selection.${key}`)))
      && arr(value.orders, `${path}.orders`, (order, orderPath) => obj(order, orderPath, ["index", "cardId", "actor", "action", "mode", "speed", "target"])
        && optInt(order.index, `${orderPath}.index`) && ["cardId", "actor", "action", "mode", "speed", "target"].every(key => optStr(order[key], `${orderPath}.${key}`)), 3)
      && (value.preview === null || obj(value.preview, `${path}.preview`, ["kind", "eventIndex", "eventKey", "label"])
        && optInt(value.preview.eventIndex, `${path}.preview.eventIndex`)
        && ["kind", "eventKey", "label"].every(key => optStr(value.preview[key], `${path}.preview.${key}`))));
    const legacyNote = (value, path) => obj(value, path, ["kind", "body", "createdAt", "updatedAt", "scene"]) && oneOf(value.kind, `${path}.kind`, Object.keys(KINDS))
      && (typeof value.body === "string" || fail(`${path}.body`, "string expected")) && optMinute(value.createdAt, `${path}.createdAt`)
      && optMinute(value.updatedAt, `${path}.updatedAt`) && legacyScene(value.scene, `${path}.scene`);
    const legacy = (value, path) => {
      if (value === null) return true;
      const keys = Object.hasOwn(value || {}, "rawTruncated") ? ["status", "notes", "raw", "rawTruncated"] : ["status", "notes", "raw"];
      return obj(value, path, keys) && oneOf(value.status, `${path}.status`, ["parsed", "unreadable"])
        && arr(value.notes, `${path}.notes`, legacyNote) && (value.raw === null || typeof value.raw === "string" && value.raw.length <= LEGACY_RAW_LIMIT || fail(`${path}.raw`, "string expected"))
        && (!Object.hasOwn(value, "rawTruncated") || bool(value.rawTruncated, `${path}.rawTruncated`))
        // parsed carries notes only; unreadable carries the original string only.
        && (value.status === "parsed" ? value.raw === null || fail(`${path}.raw`, "null expected when parsed")
          : value.raw !== null && value.notes.length === 0 || fail(`${path}.notes`, "raw only when unreadable"));
    };
    const log = (value, path) => {
      if (value?.format !== "order3log") return fail(`${path}.format`, "order3log expected");
      if (!PLAYLOG_SCHEMAS.includes(value.schemaVersion)) return fail(`${path}.schemaVersion`, `unsupported ${JSON.stringify(value.schemaVersion)}`);
      // A v1 file (exported by ACT28/29) holds only v1 runs; a v2 file may mix v1 and v2 runs.
      return obj(value, path, ["format", "schemaVersion", "exportedAt", "exportedBy", "runs", "legacyNotes"]) && minute(value.exportedAt, `${path}.exportedAt`)
        && str(value.exportedBy, `${path}.exportedBy`, 40) && arr(value.runs, `${path}.runs`, value.schemaVersion === 1 ? run : anyRun) && legacy(value.legacyNotes, `${path}.legacyNotes`);
    };
    return { errors, run: anyRun, log };
  }
  // A deletion hits only the comment the confirmation showed: same id, text, turn and ms.
  const sameComment = (item, shown) => Boolean(item && shown) && item.commentId === shown.commentId && item.text === shown.text
    && item.turn === shown.turn && item.ms === shown.ms;
  // A run as exported equals the run now when nothing but exportedAt differs.
  const sameRunContent = (a, b) => Boolean(a && b) && firstDifference({ ...a, exportedAt: null }, { ...b, exportedAt: null }) === null;
  const commentNumber = item => Number(String(item.commentId).slice(1)) || 0;
  function validateRun(run) { const check = validator(); const ok = Boolean(check.run(run, "run")); return { ok: ok && !check.errors.length, errors: check.errors }; }
  function validateLog(log) { const check = validator(); const ok = Boolean(check.log(log, "log")); return { ok: ok && !check.errors.length, errors: check.errors }; }
  // An export file is always schema v2 (ACT30 and later); its runs keep their own version, so v1 and v2 runs can share one file.
  function buildLogEnvelope(runs, { exportedAt = minuteStamp(Date.now()), exportedBy, legacyNotes = null } = {}) {
    return { format: "order3log", schemaVersion: PLAYLOG_SCHEMA, exportedAt, exportedBy, runs: clone(runs), legacyNotes: legacyNotes === null ? null : clone(legacyNotes) };
  }
  // First differing leaf between two plain JSON values, for replay checkpoints.
  function firstDifference(expected, actual, path = "") {
    if (Object.is(expected, actual)) return null;
    const bothObjects = expected && actual && typeof expected === "object" && typeof actual === "object" && Array.isArray(expected) === Array.isArray(actual);
    if (!bothObjects) return { path: path || "(root)", expected, actual };
    if (Array.isArray(expected) && expected.length !== actual.length) {
      for (let index = 0; index < Math.min(expected.length, actual.length); index += 1) {
        const inner = firstDifference(expected[index], actual[index], `${path}[${index}]`);
        if (inner) return inner;
      }
      return { path: `${path}.length`, expected: expected.length, actual: actual.length };
    }
    const keys = Array.isArray(expected) ? expected.map((_, index) => index) : [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
    for (const key of keys) {
      const inner = firstDifference(expected[key], actual[key], Array.isArray(expected) ? `${path}[${key}]` : path ? `${path}.${key}` : String(key));
      if (inner) return inner;
    }
    return null;
  }

  // One localStorage key per run. Unreadable or unknown-version keys are listed as a count and never touched.
  function createRunStore(getStorage) {
    const parsed = new Map(); // key -> { raw, run } so repeated writes do not re-validate unchanged runs.
    function readEntry(key, raw) {
      const cached = parsed.get(key);
      if (cached && cached.raw === raw) return cached.run;
      let data = null;
      try { data = JSON.parse(raw); } catch { data = null; }
      // Entries of both schema versions are read; the entry version must equal its run's version (a v1 run keeps a v1 entry).
      const run = PLAYLOG_SCHEMAS.includes(data?.schemaVersion) && data.schemaVersion === runSchema(data.run) && Object.keys(data).length === 2 && validateRun(data.run).ok
        && key === PLAYLOG_PREFIX + data.run.runId ? data.run : null;
      parsed.set(key, { raw, run });
      return run;
    }
    function entries(storage) {
      const runs = [];
      let unreadable = 0;
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (typeof key === "string" && key.startsWith(PLAYLOG_PREFIX)) keys.push(key);
      }
      for (const key of keys) {
        const raw = storage.getItem(key);
        const run = typeof raw === "string" ? readEntry(key, raw) : null;
        if (run) runs.push({ key, run, chars: raw.length });
        else unreadable += 1;
      }
      return { runs, unreadable };
    }
    const exportedSinceChange = run => run.exportedAt !== null && run.exportedAt >= run.updatedAt;
    const older = (a, b) => a.run.startedAt.localeCompare(b.run.startedAt) || a.run.updatedAt.localeCompare(b.run.updatedAt) || a.run.runId.localeCompare(b.run.runId);
    // Comment-free runs first, then runs exported since their last change, then runs the caller also allows (runs in the file being marked).
    const removableRun = (run, evictable) => !run.comments.length || exportedSinceChange(run) || Boolean(evictable?.(run));
    return {
      removableRun,
      list() {
        const { runs, unreadable } = entries(getStorage());
        return { runs: runs.sort(older).map(entry => clone(entry.run)), unreadable };
      },
      // Stored characters counted the same way as the limit (the stored value length).
      usage() {
        const { runs, unreadable } = entries(getStorage());
        const chars = runs.reduce((sum, entry) => sum + entry.chars, 0);
        return { runs: runs.length, chars, unreadable, nearLimit: chars > PLAYLOG_WARN_CHARS };
      },
      // options: the run id kept from eviction (older callers), or { protect: run ids kept, limit: characters (default the full limit),
      // evict: false to evict nothing and return the runs that would have to go as candidates, evictable: extra removable runs }.
      write(run, options = run.runId) {
        const { protect = [], limit = PLAYLOG_LIMITS.chars, evict = true, evictable = null } = plainObject(options) ? options : { protect: [options] };
        try {
          const storage = getStorage();
          // The entry version is the run's own version, so a schema v1 run keeps a v1 entry when it is marked or a comment is deleted.
          const value = JSON.stringify({ schemaVersion: runSchema(run), run });
          if (value.length > limit) return { ok: false, error: "limit", evicted: [] };
          const others = entries(storage).runs.filter(entry => entry.run.runId !== run.runId);
          let count = others.length + 1;
          let chars = others.reduce((sum, entry) => sum + entry.chars, value.length);
          const removable = others.filter(entry => !protect.includes(entry.run.runId));
          const candidates = [...removable.filter(entry => !entry.run.comments.length).sort(older),
            ...removable.filter(entry => entry.run.comments.length && exportedSinceChange(entry.run)).sort(older),
            ...removable.filter(entry => entry.run.comments.length && !exportedSinceChange(entry.run) && evictable?.(entry.run)).sort(older)];
          const plan = [];
          while ((count > PLAYLOG_LIMITS.runs || chars > limit) && candidates.length) {
            const entry = candidates.shift();
            plan.push(entry);
            count -= 1;
            chars -= entry.chars;
          }
          // Evicting cannot make room: keep every stored run and leave this one in memory.
          if (count > PLAYLOG_LIMITS.runs || chars > limit) return { ok: false, error: "limit", evicted: [] };
          if (plan.length && !evict) return { ok: false, error: "limit", evicted: [], candidates: plan.map(entry => entry.run.runId) };
          for (const entry of plan) storage.removeItem(entry.key);
          storage.setItem(PLAYLOG_PREFIX + run.runId, value);
          return { ok: true, error: "", evicted: plan.map(entry => entry.run.runId) };
        } catch (err) {
          return { ok: false, error: err?.name === "QuotaExceededError" ? "quota" : "unavailable", evicted: [] };
        }
      },
      remove(runId) {
        try { getStorage().removeItem(PLAYLOG_PREFIX + runId); return true; } catch { return false; }
      },
      // The stored copy of one run, or null when absent, unreadable or of an unknown format. Read only; throws when storage cannot be read.
      read(runId) {
        const key = PLAYLOG_PREFIX + runId;
        const raw = getStorage().getItem(key);
        return typeof raw === "string" ? readEntry(key, raw) : null;
      }
    };
  }

  // Hooks receive detached plain copies from game.js. A run is stored only after its first commit or comment.
  // locks: a Web Locks LockManager. With it, every write of a run (this tab's turns and comments, a comment deletion, an export mark,
  // removing an old run at the limit) reads that run's latest stored copy, applies this tab's change and writes, all while holding
  // the run's lock; no whole copy kept in memory is written back. Without it, or once the lock API has failed, the earlier method
  // (merge before each whole-run save) is used and the export confirmation warns about tidying records in several tabs at once.
  function createRecorder({ getStorage, now = () => Date.now(), clock = () => globalThis.performance?.now?.() ?? Date.now(), runId = () => newRunId(),
    locks = null, settleMs = PLAYLOG_LOCK_SETTLE_MS } = {}) {
    const store = createRunStore(getStorage || (() => { throw new Error("no storage"); }));
    const FULL_CHARS = PLAYLOG_LIMITS.chars;
    const CONTENT_CHARS = PLAYLOG_LIMITS.chars - PLAYLOG_RESERVED_CHARS;
    let run = null;
    let persisted = false;
    let startedClock = 0;
    let planning = { startedClock: 0, undoCount: 0, returnCount: 0 };
    let storage = { state: "memory", error: "" };
    let mergedRemoved = 0; // comments removed because another tab deleted them, not yet taken by the display
    // Highest comment number this run has used. Only the tab playing a run adds its comments, so a deleted id is never given again.
    let commentSequence = 0;
    // New turns or comments not yet written: such a write may not use the reserved characters.
    let contentUnwritten = false;
    // Without Web Locks: comment ids of this run as this tab last wrote them, and no change in memory since that write.
    let savedIds = new Set();
    let synced = false;
    // With Web Locks: one session per battle. confirmed is the run as last read or written under its lock (written again when its key
    // is gone); pending are this tab's changes not yet written. A write already queued for the previous battle still completes.
    let lockManager = locks && typeof locks.request === "function" ? locks : null;
    let session = null;
    const listeners = new Set();
    // Listener faults stay here, so a display refresh can never stop the log.
    const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* display only */ } } };
    // exportedAt holds minutes only, so any change after an export clears it: a same-minute change must not look exported.
    const touchRun = (target, stamp) => { target.updatedAt = stamp; target.exportedAt = null; };
    const turnRecord = (target, turn) => target?.turns.findLast(item => item.turn === turn) || null;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    // One change of this tab's run. It is applied to memory now. Without Web Locks save() then writes the whole run; with Web Locks it
    // is kept and applied again to the latest stored copy under the run's lock. change returns false when it changes nothing.
    function changeRun(change, { content = true, touches = true } = {}) {
      const stamp = minuteStamp(now());
      let resolve = null;
      const op = {
        content,
        done: new Promise(done => { resolve = done; }),
        settle: value => resolve(value),
        apply(target) {
          const result = change(target);
          if (touches && result !== false) touchRun(target, stamp);
          return result;
        }
      };
      const result = op.apply(run);
      if (result !== false) {
        if (touches) synced = false;
        if (content) contentUnwritten = true;
      }
      if (lockManager && session && result !== false) session.pending.push(op);
      else op.settle({ written: false, result });
      return { op, result };
    }

    /* With Web Locks */
    // Runs task while this tab holds the run's lock and resolves with task's value as soon as it returns. After a write the lock is
    // kept settleMs longer, so the write reaches every tab's copy of localStorage before another tab can take the lock and read (the
    // lock hand-over and the storage update travel separately). Rejects when the lock API fails or the task throws.
    function underLock(id, options, task) {
      return new Promise((resolve, reject) => {
        Promise.resolve().then(() => lockManager.request(PLAYLOG_LOCK_PREFIX + id, options, async lock => {
          const { value, wrote } = await task(lock);
          resolve(value);
          if (wrote) await wait(settleMs);
        })).catch(reject);
      });
    }
    // This tab's memory becomes the given stored copy with the changes not yet written applied again.
    function adopt(base) {
      const fresh = clone(base);
      for (const op of session.pending) op.apply(fresh);
      const present = new Set(fresh.comments.map(item => item.commentId));
      const removed = run.comments.filter(item => !present.has(item.commentId)).length;
      const changed = removed > 0 || fresh.exportedAt !== run.exportedAt;
      const exportedAt = fresh.exportedAt !== null && fresh.exportedAt !== run.exportedAt;
      commentSequence = fresh.comments.reduce((max, item) => Math.max(max, commentNumber(item)), commentSequence);
      run = fresh;
      mergedRemoved += removed;
      return { removed, exportedAt, changed };
    }
    // Removes runs that a write at the limit needs gone, each under its own lock and only while its latest copy is still removable.
    // A run whose lock another tab holds right now is left stored. True when something is gone.
    async function evictLocked(candidates, evictable = null) {
      let removed = false;
      for (const id of candidates) {
        try {
          // Wait a moment for a run another tab (or this one) is writing; give up rather than wait on a tab that may be waiting for this run.
          const controller = typeof AbortController === "function" ? new AbortController() : null;
          const timer = controller ? setTimeout(() => controller.abort(), PLAYLOG_LOCK_EVICT_WAIT_MS) : null;
          const gone = await underLock(id, controller ? { signal: controller.signal } : { ifAvailable: true }, async lock => {
            clearTimeout(timer);
            if (!lock) return { value: false, wrote: false };
            const latest = store.read(id);
            if (!latest) return { value: true, wrote: false };
            const wrote = store.removableRun(latest, evictable) && store.remove(id);
            return { value: wrote, wrote };
          });
          removed = gone || removed;
        } catch { /* left stored */ }
      }
      return removed;
    }
    // Writes the pending changes of a session: read the latest stored copy, apply them, write; all under the run's lock.
    async function writeSession(current) {
      for (let attempt = 0; ; attempt += 1) {
        const ops = current.pending.slice();
        if (!ops.length) return { value: undefined, wrote: false };
        let stored = null, next = null, results = [], written;
        try {
          stored = store.read(current.runId);
          next = clone(stored || current.confirmed);
          results = ops.map(op => op.apply(next));
          written = store.write(next, { protect: [current.runId, run?.runId], limit: ops.some(op => op.content) ? CONTENT_CHARS : FULL_CHARS, evict: false });
        } catch {
          written = { ok: false, error: "unavailable", evicted: [] };
        }
        if (!written.ok && written.candidates?.length && attempt < PLAYLOG_LIMITS.runs && await evictLocked(written.candidates)) continue;
        if (written.ok) {
          current.pending.splice(0, ops.length);
          current.confirmed = next;
          current.written = true;
        } else if (stored) {
          current.confirmed = clone(stored);
          current.written = true;
        }
        ops.forEach((op, index) => op.settle({ written: written.ok, result: results[index] }));
        if (current === session && run) {
          const before = storage;
          const merged = adopt(current.confirmed);
          storage = written.ok ? { state: "saved", error: "" } : { state: "memory", error: written.error };
          if (written.ok) contentUnwritten = current.pending.some(op => op.content);
          if (merged.changed || before.state !== storage.state || before.error !== storage.error) notify();
        }
        return { value: undefined, wrote: written.ok };
      }
    }
    function flush(current) {
      if (current.queued) return current.queued;
      const queued = underLock(current.runId, {}, () => {
        current.queued = null;
        return writeSession(current);
      }).catch(() => {
        if (current.queued === queued) current.queued = null;
        if (current !== session) for (const op of current.pending.splice(0)) op.settle({ written: false, result: undefined });
        lockFailed();
      });
      current.queued = queued;
      current.tail = queued;
      return queued;
    }
    // The lock API failed: this recorder continues without Web Locks and writes what this battle has not written yet.
    function lockFailed() {
      if (!lockManager) return;
      lockManager = null;
      const active = session;
      session = null;
      if (!active || !run || active.runId !== run.runId) return;
      const pending = active.pending.splice(0);
      savedIds = new Set(active.written ? active.confirmed.comments.map(item => item.commentId) : []);
      synced = active.written && !pending.length;
      save();
      for (const op of pending) op.settle({ written: storage.state === "saved", result: undefined });
      notify();
    }
    // A run other than this tab's current one: its latest stored copy is read, changed and written under its lock (with the full
    // character limit). change returns false when the latest copy is not what the caller meant. Resolves { found, changed, ok, error }.
    function changeStored(id, change, evictable = null) {
      return underLock(id, {}, async () => {
        for (let attempt = 0; ; attempt += 1) {
          let stored;
          try { stored = store.read(id); } catch { return { value: { found: false, changed: false, ok: false, error: "unavailable" }, wrote: false }; }
          if (!stored) return { value: { found: false, changed: false, ok: false, error: "" }, wrote: false };
          const next = clone(stored);
          if (change(next) === false) return { value: { found: true, changed: false, ok: false, error: "" }, wrote: false };
          const written = store.write(next, { protect: [id, run?.runId], evict: false, evictable });
          if (!written.ok && written.candidates?.length && attempt < PLAYLOG_LIMITS.runs && await evictLocked(written.candidates, evictable)) continue;
          return { value: { found: true, changed: true, ok: written.ok, error: written.error }, wrote: written.ok };
        }
      });
    }
    // exportedRuns are the runs as they went into the file; a run is marked only while its latest copy equals that copy apart from exportedAt.
    async function markLocked(exportedRuns, stamp) {
      const exported = new Map(exportedRuns.map(item => [item.runId, item]));
      const currentCopy = run ? exported.get(run.runId) : undefined;
      if (run) exported.delete(run.runId);
      const inFile = item => exported.has(item.runId) && sameRunContent(item, exported.get(item.runId));
      let ok = true;
      const skipped = [];
      try {
        // Stored runs first: at the storage limit their export mark is what lets the current run's save evict one of them.
        for (const [id, copy] of exported) {
          const outcome = await changeStored(id, target => {
            if (!sameRunContent(target, copy)) return false;
            target.exportedAt = stamp;
            return true;
          }, inFile);
          if (outcome.error && !outcome.ok) ok = false;
          else if (outcome.found && !outcome.changed) skipped.push(id);
        }
      } catch {
        lockFailed();
        return markDirect(exportedRuns, stamp);
      }
      if (currentCopy && run) {
        if (!sameRunContent(run, currentCopy)) skipped.push(currentCopy.runId);
        else {
          const { op } = changeRun(target => {
            if (!sameRunContent(target, currentCopy)) return false;
            target.exportedAt = stamp;
            return true;
          }, { content: false, touches: false });
          if (persisted && session) {
            flush(session);
            const { written, result } = await op.done;
            if (!written) ok = false;
            if (result === false) skipped.push(currentCopy.runId);
          }
        }
      }
      notify();
      return { ok, skipped };
    }
    // Resolves { deleted, changed, saved }. changed: the run no longer holds the comment as shown, so nothing was deleted.
    async function removeLocked(commentId, targetRunId, shown) {
      const matches = item => item.commentId === commentId && (!shown || sameComment(item, shown));
      if (run && targetRunId === run.runId) {
        if (!run.comments.some(matches)) return { deleted: false, changed: true, saved: false };
        const { op } = changeRun(target => {
          const before = target.comments.length;
          target.comments = target.comments.filter(item => !matches(item));
          return target.comments.length !== before;
        }, { content: false });
        notify();
        if (!persisted || !session) return { deleted: true, changed: false, saved: !persisted || storage.state === "saved" };
        flush(session);
        const { written } = await op.done;
        return { deleted: true, changed: false, saved: written };
      }
      let outcome;
      try {
        outcome = await changeStored(targetRunId, target => {
          if (!target.comments.some(matches)) return false;
          target.comments = target.comments.filter(item => item.commentId !== commentId);
          touchRun(target, minuteStamp(now()));
          return true;
        });
      } catch {
        lockFailed();
        return removeDirect(targetRunId, shown);
      }
      notify();
      if (outcome.error && !outcome.found) return { deleted: false, changed: false, saved: false };
      if (!outcome.changed) return { deleted: false, changed: true, saved: false };
      return { deleted: outcome.ok, changed: false, saved: outcome.ok };
    }

    /* Without Web Locks */
    // Another tab's export confirmation can delete comments of this run or record its export in the stored copy.
    // Take those in, so this tab's next write does not undo them. Comments this tab added since its last write stay.
    function merge() {
      const result = { removed: 0, exportedAt: false };
      if (!run || !persisted) return result;
      let stored;
      try { stored = store.read(run.runId); } catch { return result; }
      // Absent (evicted), unreadable or unknown data gives nothing to take in and is not read as deletions.
      if (!stored) return result;
      commentSequence = stored.comments.reduce((max, item) => Math.max(max, commentNumber(item)), commentSequence);
      const present = new Set(stored.comments.map(item => item.commentId));
      const gone = new Set([...savedIds].filter(id => !present.has(id)));
      if (gone.size) {
        const before = run.comments.length;
        run.comments = run.comments.filter(item => !gone.has(item.commentId));
        for (const id of gone) savedIds.delete(id);
        result.removed = before - run.comments.length;
        if (result.removed) {
          if (stored.updatedAt > run.updatedAt) run.updatedAt = stored.updatedAt;
          run.exportedAt = null;
        }
      }
      // A newer export mark is taken only while this tab has nothing unwritten, so the mark covers what this tab holds.
      if (synced && stored.exportedAt !== null && stored.exportedAt >= stored.updatedAt && (run.exportedAt === null || stored.exportedAt > run.exportedAt)) {
        run.exportedAt = stored.exportedAt;
        if (stored.updatedAt > run.updatedAt) run.updatedAt = stored.updatedAt;
        result.exportedAt = true;
      }
      mergedRemoved += result.removed;
      return result;
    }
    // Writes this tab's run: with Web Locks as a locked read -> apply -> write of the pending changes, otherwise merge then write whole.
    function save(evictable = null) {
      if (!run || !persisted) return;
      if (lockManager && session) { flush(session); return; }
      const merged = merge();
      const written = store.write(run, { protect: [run.runId], limit: contentUnwritten ? CONTENT_CHARS : FULL_CHARS, evictable });
      storage = written.ok ? { state: "saved", error: "" } : { state: "memory", error: written.error };
      if (written.ok) {
        savedIds = new Set(run.comments.map(item => item.commentId));
        synced = true;
        contentUnwritten = false;
      }
      if (merged.removed) notify();
    }
    // Records that an export of these runs started. The browser cannot confirm the file was saved.
    // exportedRuns are the runs as they went into the file. A run is marked only while its stored copy (or, for this tab's run,
    // its memory) still equals that copy apart from exportedAt; a run changed after the file was built stays unexported (skipped).
    function markDirect(exportedRuns, stamp) {
      const exported = new Map(exportedRuns.map(item => [item.runId, item]));
      const currentCopy = run ? exported.get(run.runId) : undefined;
      if (run) exported.delete(run.runId);
      // At the limit a run of this file that equals its copy may be removed to make room for another run's mark.
      const inFile = item => exported.has(item.runId) && sameRunContent(item, exported.get(item.runId));
      let ok = true;
      const skipped = [];
      // Stored runs first: at the storage limit their export mark is what lets the current run's save evict one of them.
      if (exported.size) {
        try {
          for (const item of store.list().runs) {
            if (!exported.has(item.runId)) continue;
            if (!sameRunContent(item, exported.get(item.runId))) { skipped.push(item.runId); continue; }
            // Removed by an earlier mark's write in this loop: not written back.
            if (!store.read(item.runId)) continue;
            item.exportedAt = stamp;
            if (!store.write(item, { protect: [run?.runId ?? null], evictable: inFile }).ok) ok = false;
          }
        } catch { ok = false; }
      }
      if (currentCopy) {
        if (sameRunContent(clone(run), currentCopy)) {
          run.exportedAt = stamp;
          synced = false;
          save(inFile);
          if (persisted && storage.state !== "saved") ok = false;
          // A deletion from another tab taken in by that save changed the run after the file was built and cleared the mark.
          if (run.exportedAt !== stamp) skipped.push(run.runId);
        } else skipped.push(run.runId);
      }
      notify();
      return { ok, skipped };
    }
    // shown: the comment as the confirmation displayed it. When given, nothing is deleted unless the comment still has that text, turn and ms.
    function deleteDirect(commentId, targetRunId, shown) {
      const matches = item => item.commentId === commentId && (!shown || sameComment(item, shown));
      if (run && targetRunId === run.runId) {
        const { result } = changeRun(target => {
          const before = target.comments.length;
          target.comments = target.comments.filter(item => !matches(item));
          return target.comments.length !== before;
        }, { content: false });
        if (result === false) return false;
        save();
        notify();
        return !persisted || storage.state === "saved";
      }
      let stored;
      try { stored = store.list().runs.find(item => item.runId === targetRunId); } catch { return false; }
      if (!stored || !stored.comments.some(matches)) return false;
      stored.comments = stored.comments.filter(item => item.commentId !== commentId);
      touchRun(stored, minuteStamp(now()));
      const written = store.write(stored, { protect: [run?.runId ?? null] }).ok;
      notify();
      return written;
    }
    // The page first checks what the device holds now (this tab's run in memory, any other run in its stored copy), then deletes.
    function removeDirect(targetRunId, shown) {
      let fresh;
      if (run?.runId === targetRunId) fresh = run;
      else {
        try { fresh = store.read(targetRunId); } catch { fresh = undefined; }
      }
      if (fresh !== undefined && !sameComment(fresh?.comments.find(item => item.commentId === shown.commentId), shown)) return { deleted: false, changed: true, saved: false };
      const saved = deleteDirect(shown.commentId, targetRunId, shown);
      return { deleted: saved, changed: false, saved };
    }

    return {
      battleStart({ seed, enemySeed, gameVersion, width }) {
        const stamp = minuteStamp(now());
        run = { schemaVersion: PLAYLOG_SCHEMA, runId: runId(), gameVersion, startedAt: stamp, rng: "mulberry32", seed: seed >>> 0, enemySeed: enemySeed >>> 0,
          layout: layoutClass(width), status: "playing", updatedAt: stamp, exportedAt: null, truncated: false, turns: [], comments: [] };
        persisted = false;
        storage = { state: "memory", error: "" };
        savedIds = new Set();
        synced = false;
        contentUnwritten = false;
        commentSequence = 0;
        session = lockManager ? { runId: run.runId, confirmed: clone(run), written: false, pending: [], queued: null, tail: null } : null;
        startedClock = clock();
        planning = { startedClock, undoCount: 0, returnCount: 0 };
        notify();
      },
      turnStart({ turn, start }) {
        if (!run) return;
        planning = { startedClock: clock(), undoCount: 0, returnCount: 0 };
        changeRun(target => {
          // A copy already written by persistNow holds this turn; applying the change again must not add it twice.
          if (turnRecord(target, turn)) return false;
          if (target.turns.length >= PLAYLOG_LIMITS.turns) target.truncated = true;
          else target.turns.push({ turn, start: clone(start), commit: null, result: null });
        });
        save();
      },
      planEdit(kind) {
        if (kind === "undo") planning.undoCount += 1;
        else if (kind === "return") planning.returnCount += 1;
      },
      commit({ turn, handOrder, queue }) {
        if (!turnRecord(run, turn)) return;
        const record = { planMs: Math.max(0, Math.round(clock() - planning.startedClock)), undoCount: planning.undoCount,
          returnCount: planning.returnCount, handOrder: [...handOrder], queue: clone(queue) };
        changeRun(target => {
          const item = turnRecord(target, turn);
          if (!item) return false;
          item.commit = clone(record);
          return true;
        });
        persisted = true;
        save();
      },
      turnResolved({ turn, events, units, hostileRunes, emberRunes, battle, deckOrder, discardOrder, enemyDeckOrder, enemyDiscardOrder }) {
        if (!run) return;
        const result = clone({ events, units, hostileRunes, emberRunes, battle, deckOrder, discardOrder, enemyDeckOrder, enemyDiscardOrder });
        changeRun(target => {
          const item = turnRecord(target, turn);
          if (item?.commit) item.result = clone(result);
          if (battle) target.status = battle;
        });
        save();
      },
      addComment({ text, turn, phase, context }) {
        if (!run) return { ok: false, reason: "no-run" };
        const checked = commentText(text);
        if (!checked.ok) return checked;
        if (run.comments.length >= PLAYLOG_LIMITS.comments) return { ok: false, reason: "limit" };
        const sequence = run.comments.reduce((max, item) => Math.max(max, commentNumber(item)), commentSequence) + 1;
        const comment = { commentId: `c${sequence}`, turn, phase, ms: Math.max(0, Math.round(clock() - startedClock)), text: checked.text,
          context: commentContextRecord(context) };
        const check = validator();
        check.run({ ...run, comments: [comment] }, "run");
        if (check.errors.length) return { ok: false, reason: "invalid", errors: check.errors };
        changeRun(target => {
          if (target.comments.length >= PLAYLOG_LIMITS.comments || target.comments.some(item => item.commentId === comment.commentId)) return false;
          target.comments.push(clone(comment));
          return true;
        });
        commentSequence = sequence;
        persisted = true;
        save();
        notify();
        return { ok: true, comment: clone(comment) };
      },
      // shown: the comment as the confirmation displayed it. Without Web Locks returns a boolean, with Web Locks a Promise of one.
      deleteComment(commentId, targetRunId = run?.runId, shown = null) {
        if (lockManager) return removeLocked(commentId, targetRunId, shown).then(result => result.deleted && result.saved);
        return deleteDirect(commentId, targetRunId, shown);
      },
      // The export confirmation's 削除: { deleted, changed, saved } (a Promise with Web Locks). Nothing is deleted unless the device
      // still holds the comment as shown (id, text, turn and ms).
      removeComment(targetRunId, shown) {
        if (lockManager) return removeLocked(shown.commentId, targetRunId, shown);
        return removeDirect(targetRunId, shown);
      },
      // { ok, skipped } (a Promise with Web Locks).
      markExportedRuns(exportedRuns, stamp) {
        return lockManager ? markLocked(exportedRuns, stamp) : markDirect(exportedRuns, stamp);
      },
      // Marks these runs as they are now; for callers whose export holds exactly the stored and memory copies.
      markExported(runIds, stamp) {
        const ids = new Set(runIds);
        let stored = null;
        try { stored = store.list().runs.filter(item => ids.has(item.runId) && item.runId !== run?.runId); } catch { stored = null; }
        const result = (lockManager ? markLocked : markDirect)([...(stored || []), ...(run && ids.has(run.runId) ? [clone(run)] : [])], stamp);
        const done = value => value.ok && (stored !== null || [...ids].every(id => id === run?.runId));
        return typeof result?.then === "function" ? result.then(done) : done(result);
      },
      // Takes in another tab's comment deletions and export marks for this tab's run without writing (storage event).
      sync() {
        if (!lockManager || !session) {
          const merged = merge();
          if (merged.removed || merged.exportedAt) notify();
          return merged;
        }
        const none = { removed: 0, exportedAt: false };
        if (!run || !persisted) return none;
        let stored;
        try { stored = store.read(run.runId); } catch { return none; }
        if (!stored) return none;
        session.confirmed = clone(stored);
        session.written = true;
        const merged = adopt(stored);
        if (merged.changed) notify();
        return { removed: merged.removed, exportedAt: merged.exportedAt };
      },
      // Resolves once the writes queued so far for this tab's run have finished (at once without Web Locks).
      whenWritten() {
        return session?.tail ? session.tail.then(() => undefined, () => undefined) : Promise.resolve();
      },
      // The page is being hidden or left (pagehide) while a locked write still waits, for example because another tab holds this run's
      // lock: the page may be gone before the lock is granted. Writes the changes not yet written at once, without the lock, as one
      // synchronous read -> apply -> write of the latest stored copy. Such a write can overlap another tab's locked write, but a
      // turn or comment that would otherwise vanish with the page is kept. It removes no other run: removing one needs that run's
      // lock, so at the limit nothing is written and the run stays in memory. The changes stay queued, so a page that lives on writes
      // them again under the lock (every change applies idempotently, and an old run is removed there). True when something was written.
      persistNow() {
        if (!lockManager || !session || !run || !persisted || !session.pending.length) return false;
        const current = session;
        const ops = current.pending.slice();
        try {
          const next = clone(store.read(current.runId) || current.confirmed);
          ops.forEach(op => op.apply(next));
          const written = store.write(next, { protect: [current.runId], limit: ops.some(op => op.content) ? CONTENT_CHARS : FULL_CHARS, evict: false });
          return written.ok;
        } catch { return false; }
      },
      // Comments removed by merges since the last call, for a one-time notice.
      takeMergeNotice() {
        const removed = mergedRemoved;
        mergedRemoved = 0;
        return removed;
      },
      // Stored runs other than the one in this tab's memory, plus the unreadable key count. Null when storage cannot be read.
      storedRuns() {
        try {
          const { runs, unreadable } = store.list();
          return { runs: runs.filter(item => item.runId !== run?.runId), unreadable };
        } catch { return null; }
      },
      usage() {
        try { return store.usage(); } catch { return null; }
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      get run() { return run ? clone(run) : null; },
      get storage() { return { ...storage }; },
      get persisted() { return persisted; },
      // True while writes use Web Locks.
      get locked() { return Boolean(lockManager); },
      store
    };
  }

  // Export: the same object feeds validation, the on-screen JSON and the file.
  const two = value => String(value).padStart(2, "0");
  function exportFileName(date = new Date()) {
    return `order3-${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}.order3log`;
  }
  function buildExport({ runs, legacy = null, exportedBy, now = Date.now() }) {
    const exportedAt = minuteStamp(now);
    const log = buildLogEnvelope(runs.map(item => ({ ...item, exportedAt })), { exportedAt, exportedBy, legacyNotes: legacyNotesRecord(legacy) });
    return { log, check: validateLog(log), fileName: exportFileName(new Date(now)), exportedAt };
  }
  // UTF-8 JSON, gzip-compressed with CompressionStream when available. No custom header: readers detect 1f 8b.
  async function encodeLogFile(text, env = globalThis) {
    const bytes = new TextEncoder().encode(text);
    if (typeof env.CompressionStream !== "function") return { bytes, gzip: false };
    try {
      const stream = new env.CompressionStream("gzip");
      const writer = stream.writable.getWriter();
      // Read while writing so a large log cannot stall on backpressure.
      const written = writer.write(bytes).then(() => writer.close());
      const reader = stream.readable.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      await written;
      const out = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
      return { bytes: out, gzip: true };
    } catch {
      return { bytes, gzip: false };
    }
  }
  const exportedSinceChange = item => item.exportedAt !== null && item.exportedAt >= item.updatedAt;
  // "9/14 15:10開始｜勝利 TURN 11｜コメント 3件｜書き出し済み" in local time.
  function runListLabel(item, { current = false } = {}) {
    const started = new Date(Date.parse(item.startedAt));
    const lastTurn = item.turns.at(-1)?.turn;
    const status = item.status === "victory" ? "勝利" : item.status === "defeat" ? "敗北" : current ? "プレイ中" : "未決着";
    return [`${started.getMonth() + 1}/${started.getDate()} ${two(started.getHours())}:${two(started.getMinutes())}開始`,
      `${status}${lastTurn ? ` TURN ${two(lastTurn)}` : ""}`, `コメント ${item.comments.length}件`, ...(exportedSinceChange(item) ? ["書き出し済み"] : [])].join("｜");
  }

  const api = { KEY, KINDS, LEGACY_MARKER, LEGACY_RAW_LIMIT, clone, readLegacyNotes, legacyNotesRecord,
    PLAYLOG_PREFIX, PLAYLOG_SCHEMA, PLAYLOG_SCHEMAS, runSchema, PLAYLOG_LIMITS, PLAYLOG_WARN_CHARS, PLAYLOG_RESERVED_CHARS, PLAYLOG_LOCK_PREFIX, PLAYLOG_LOCK_SETTLE_MS, PLAYLOG_LOCK_EVICT_WAIT_MS, rngValue, createRng, chooseSeed, minuteStamp, layoutClass, codePoints, commentText,
    queueRecord, unitRecord, cellRecord, commentContextRecord, commentEventLabel, commentSceneLine, commentPhaseLabel, validateRun, validateLog, buildLogEnvelope, firstDifference,
    sameComment, sameRunContent, createRunStore, createRecorder, exportFileName, buildExport, encodeLogFile, exportedSinceChange, runListLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    // Web Locks when the browser has them; a navigator that cannot be read counts as none.
    let locks = null;
    try { locks = typeof root.navigator?.locks?.request === "function" ? root.navigator.locks : null; } catch { locks = null; }
    api.recorder = createRecorder({ getStorage: () => root.localStorage, locks });
    // Leaving or hiding the page while a locked write still waits (another tab holds the run's lock): write it now (ACT26B-QA-08).
    const persistNow = () => { try { api.recorder.persistNow(); } catch { /* the page keeps working */ } };
    root.addEventListener?.("pagehide", persistNow);
    root.document?.addEventListener?.("visibilitychange", () => { if (root.document.visibilityState === "hidden") persistNow(); });
    root.Order3Notes = api;
  }
})(globalThis);
