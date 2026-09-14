/* Storage and plain-text sharing are independent of the combat engine and DOM. */
(function (root) {
  "use strict";
  const KEY = "order3.playtestNotes.v1";
  const TARGET = "https://docs.google.com/forms/d/e/1FAIpQLSdlXmRTYuIASUMyvcYxg_OnziKKaA9I_T5FXlRXq9u3sJYs8g/viewform";
  const FORM_ENTRY = "entry.1309058111";
  const LEGACY_TARGET = "https://github.com/usouso/order-3/issues/new";
  const KINDS = { impression: "感想", idea: "改善案", bug: "不具合" };
  const clone = value => JSON.parse(JSON.stringify(value));
  const contentKey = note => JSON.stringify([note.id, note.kind, note.body, note.scene]);
  const sameContent = (a, b) => Boolean(a && b && contentKey(a) === contentKey(b));
  const revisionKey = note => { const { share, ...revision } = note; return JSON.stringify(revision); };
  const shareTime = note => Date.parse(note.share?.handoffOpenedAt) || 0;
  const formTime = note => Date.parse(note.share?.forms?.openedAt || note.share?.forms?.preparedAt) || 0;
  const validDate = value => typeof value === "string" && Number.isFinite(Date.parse(value));
  function validScene(scene) {
    return scene === null || (scene && validDate(scene.capturedAt) && typeof scene.gameVersion === "string"
      && Number.isInteger(scene.turn) && typeof scene.phase === "string" && Array.isArray(scene.orders)
      && scene.orders.length <= 3 && scene.orders.every(order => order && typeof order.action === "string"
        && typeof order.actor === "string" && typeof order.target === "string" && typeof order.speed === "string")
      && (scene.selection === null || (scene.selection && typeof scene.selection.cardName === "string"))
      && scene.preview && typeof scene.preview.label === "string");
  }
  function parse(raw) {
    if (raw === null) return { schemaVersion: 1, notes: [] };
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error("保存データを読めません。元データを上書きせず保持しています。"); }
    if (data?.schemaVersion !== 1) throw new Error("未対応の保存形式です。元データを上書きせず保持しています。");
    if (!Array.isArray(data.notes) || data.notes.some(note => !note || typeof note.id !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(note.id)
      || !Object.hasOwn(KINDS, note.kind) || typeof note.body !== "string" || !note.body.trim()
      || !validDate(note.createdAt) || !validDate(note.updatedAt) || !validScene(note.scene)
      || !note.share || !["local-only", "handoff-opened"].includes(note.share.state))) {
      throw new Error("保存データの内容を読めません。元データを上書きせず保持しています。");
    }
    return data;
  }
  function merge(...groups) {
    const byId = new Map();
    for (const note of groups.flat()) {
      const previous = byId.get(note.id);
      const newer = !previous || Date.parse(note.updatedAt) > Date.parse(previous.updatedAt)
        || (note.updatedAt === previous.updatedAt && revisionKey(note) > revisionKey(previous));
      const selected = clone(newer ? note : previous);
      // Handoff history cannot make an older content revision win a merge.
      if (sameContent(note, previous)) {
        selected.share = clone(shareTime(note) > shareTime(previous) ? note.share : previous.share);
        const forms = formTime(note) > formTime(previous) ? note.share?.forms : previous.share?.forms || note.share?.forms;
        if (forms) selected.share.forms = clone(forms);
      }
      byId.set(note.id, selected);
    }
    return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  }
  function createStore(getStorage) {
    let data = { schemaVersion: 1, notes: [] };
    let raw = null;
    let error = "";
    function read() {
      raw = getStorage().getItem(KEY);
      return parse(raw);
    }
    function fail(err) { error = err.message || "端末の保存領域を利用できません。"; return false; }
    return {
      get notes() { return clone(data.notes); },
      get data() { return clone(data); },
      get raw() { return raw; },
      get error() { return error; },
      load() {
        try { const latest = read(); data = { ...data, ...latest, notes: merge(data.notes, latest.notes) }; error = ""; return true; }
        catch (err) { return fail(err); }
      },
      save(note) {
        try {
          const latest = read();
          let saved = note?.body.trim() ? clone(note) : null;
          if (saved) {
            const previous = merge(data.notes, latest.notes).find(item => item.id === saved.id);
            saved.updatedAt = new Date(Math.max(Date.now(), Date.parse(saved.updatedAt), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
          }
          const candidate = { ...data, ...latest, notes: merge(data.notes, latest.notes, saved ? [saved] : []),
            ...(saved ? { activeNoteId: saved.id } : {}) };
          parse(JSON.stringify(candidate));
          getStorage().setItem(KEY, JSON.stringify(candidate));
          data = candidate; error = ""; return true;
        } catch (err) { return fail(err); }
      },
      recordHandoff(snapshot, openedAt) {
        try {
          const latest = read();
          const current = { ...data, ...latest, notes: merge(data.notes, latest.notes) };
          const note = current.notes.find(item => item.id === snapshot.id);
          data = current; error = "";
          // Re-read after opening the popup. A different revision is not this handoff.
          if (!sameContent(note, snapshot)) return "changed";
          const recorded = clone(note);
          if (Date.parse(openedAt) >= shareTime(note)) recorded.share = {
            ...note.share, state: "handoff-opened", handoffOpenedAt: openedAt, externalUrl: TARGET
          };
          const candidate = { ...current, notes: current.notes.map(item => item.id === recorded.id ? recorded : item) };
          parse(JSON.stringify(candidate));
          getStorage().setItem(KEY, JSON.stringify(candidate));
          data = candidate;
          return "saved";
        } catch (err) { fail(err); return "error"; }
      },
      recordForm(snapshot, form, openedAt = null) {
        try {
          const latest = read();
          const current = { ...data, ...latest, notes: merge(data.notes, latest.notes) };
          const note = current.notes.find(item => item.id === snapshot.id);
          data = current; error = "";
          if (!sameContent(note, snapshot)) return "changed";
          const recorded = clone(note);
          recorded.share = { ...note.share, forms: { ...form, openedAt: openedAt || (note.share?.forms?.key === form.key ? note.share.forms.openedAt : null) || null,
            externalUrl: TARGET } };
          const candidate = { ...current, notes: current.notes.map(item => item.id === recorded.id ? recorded : item) };
          parse(JSON.stringify(candidate));
          getStorage().setItem(KEY, JSON.stringify(candidate));
          data = candidate; return "saved";
        } catch (err) { fail(err); return "error"; }
      },
      // Storage-event reconciliation retains distinct notes after concurrent read/merge/write races.
      receive(incomingRaw) {
        try {
          const incoming = parse(incomingRaw);
          const latest = read();
          const merged = { ...data, ...incoming, ...latest, notes: merge(data.notes, incoming.notes, latest.notes) };
          if (JSON.stringify(merge(latest.notes)) !== JSON.stringify(merged.notes)) getStorage().setItem(KEY, JSON.stringify(merged));
          data = merged; error = ""; return true;
        } catch (err) { return fail(err); }
      }
    };
  }
  function newId(cryptoObject = globalThis.crypto) {
    return cryptoObject?.randomUUID ? cryptoObject.randomUUID()
      : `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  let fallbackSequence = 0;
  function newSubmissionId(cryptoObject = globalThis.crypto) {
    if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
    if (cryptoObject?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObject.getRandomValues(bytes);
      return `send-${Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("")}`;
    }
    return `send-${Date.now().toString(36)}-${(++fallbackSequence).toString(36)}`;
  }
  function sceneText(scene) {
    if (!scene) return "";
    return [`- ゲーム版: ${scene.gameVersion}`, `- TURN: ${String(scene.turn).padStart(2, "0")}`,
      `- 状態: ${scene.phase} / ${scene.preview.label}`,
      `- 選択: ${scene.selection ? `${scene.selection.cardName}（${scene.selection.mode === "move" ? "移動" : "技法"}）` : "なし"}`,
      ...scene.orders.map(order => `- 命令: ${String(order.index).padStart(2, "0")} ${order.actor}「${order.action}」${order.speed} → ${order.target}`)].join("\n");
  }
  function markdown(note) {
    return `<!-- order3-feedback:v1 note-id=${note.id} -->\n## 試遊メモ：${KINDS[note.kind]}\n\n${note.body}${note.scene ? `\n\n### 場面\n${sceneText(note.scene)}` : ""}\n`;
  }
  function sharePayload(note) {
    // Historical formatter remains available for validating old exports; the UI uses formPayload.
    const title = `[ORDER//3 メモ] ${KINDS[note.kind]}｜${Array.from(note.body.replace(/\s+/g, " ").trim()).slice(0, 48).join("")}`;
    const body = markdown(note);
    const url = new URL(LEGACY_TARGET);
    url.search = new URLSearchParams({ title, body }).toString();
    const long = url.href.length > 7000;
    if (long) url.search = new URLSearchParams({ title }).toString();
    return { url: url.href, body, long };
  }
  const formKey = (note, version) => JSON.stringify([note.id, note.kind, note.body, note.scene, version]);
  function formText(note, submissionId, version) {
    return `${note.body}${note.scene ? `\n\n【添付した場面】\n${sceneText(note.scene)}` : ""}\n\n【メモの記録】\n種類: ${KINDS[note.kind]}\nメモ番号: ${note.id}\n送信番号: ${submissionId}\n送信時のゲーム版: ${version}`;
  }
  function formPayload(note, submissionId, version) {
    const body = formText(note, submissionId, version);
    const url = new URL(TARGET);
    url.searchParams.set(FORM_ENTRY, body);
    const prefilled = url.href.length <= 1800;
    return { url: prefilled ? url.href : TARGET, body, long: !prefilled, prefilled };
  }
  /* ACT26 play log: seeded shuffle source, per-run recorder and local run store. No DOM, no network. */
  // The "v1" in the key prefix names the storage namespace, not the schema version: v1 and v2 runs share it.
  const PLAYLOG_PREFIX = "order3.playlog.v1.run.";
  // ACT30 writes schema v2 (no speed; enemy seed, enemy piles and slot-numbered enemy intents). Schema v1 runs (ACT26-29) stay readable.
  const PLAYLOG_SCHEMA = 2;
  const PLAYLOG_SCHEMAS = Object.freeze([1, 2]);
  const runSchema = run => run && typeof run === "object" && !Array.isArray(run) && Object.hasOwn(run, "schemaVersion") ? run.schemaVersion : 1;
  const PLAYLOG_LIMITS = Object.freeze({ runs: 20, chars: 1500000, turns: 60, comments: 50, commentCodePoints: 140 });
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
  // One-line scene text; names maps cardId to the displayed card name.
  function commentSceneLine(comment, names = {}) {
    const { context } = comment;
    const parts = [`TURN ${String(comment.turn).padStart(2, "0")}`];
    if (comment.phase === "resolving") parts.push(`作戦解決中${Number.isInteger(context.preview.eventIndex) ? ` 行動順 ${context.preview.eventIndex + 1}` : ""}`);
    else if (comment.phase === "ended") parts.push(context.battle === "victory" ? "勝利" : context.battle === "defeat" ? "敗北" : PHASE_LABEL.ended);
    else {
      parts.push(PHASE_LABEL.planning);
      if (context.selection) parts.push(`選択: ${names[context.selection.cardId] || context.selection.cardId}`);
      parts.push(`命令 ${context.queue.length}件`);
      parts.push(context.preview.kind === "event-after" ? `行動順 ${context.preview.eventIndex + 1} の直後` : PREVIEW_LABEL[context.preview.kind] || context.preview.kind);
    }
    return parts.join("｜");
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
    const legacyNote = (value, path) => obj(value, path, ["kind", "body", "createdAt", "updatedAt", "scene"]) && str(value.kind, `${path}.kind`)
      && (typeof value.body === "string" || fail(`${path}.body`, "string expected"));
    const legacy = (value, path) => {
      if (value === null) return true;
      const keys = Object.hasOwn(value || {}, "rawTruncated") ? ["status", "notes", "raw", "rawTruncated"] : ["status", "notes", "raw"];
      return obj(value, path, keys) && oneOf(value.status, `${path}.status`, ["parsed", "unreadable"])
        && arr(value.notes, `${path}.notes`, legacyNote) && (value.raw === null || typeof value.raw === "string" && value.raw.length <= 200000 || fail(`${path}.raw`, "string expected"))
        && (!Object.hasOwn(value, "rawTruncated") || bool(value.rawTruncated, `${path}.rawTruncated`));
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
  function validateRun(run) { const check = validator(); const ok = Boolean(check.run(run, "run")); return { ok: ok && !check.errors.length, errors: check.errors }; }
  function validateLog(log) { const check = validator(); const ok = Boolean(check.log(log, "log")); return { ok: ok && !check.errors.length, errors: check.errors }; }
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
    return {
      list() {
        const { runs, unreadable } = entries(getStorage());
        return { runs: runs.sort(older).map(entry => clone(entry.run)), unreadable };
      },
      write(run, currentRunId = run.runId) {
        try {
          const storage = getStorage();
          const value = JSON.stringify({ schemaVersion: runSchema(run), run });
          if (value.length > PLAYLOG_LIMITS.chars) return { ok: false, error: "limit", evicted: [] };
          const others = entries(storage).runs.filter(entry => entry.run.runId !== run.runId);
          let count = others.length + 1;
          let chars = others.reduce((sum, entry) => sum + entry.chars, value.length);
          const removable = others.filter(entry => entry.run.runId !== currentRunId);
          const candidates = [...removable.filter(entry => !entry.run.comments.length).sort(older),
            ...removable.filter(entry => entry.run.comments.length && exportedSinceChange(entry.run)).sort(older)];
          const evict = [];
          while ((count > PLAYLOG_LIMITS.runs || chars > PLAYLOG_LIMITS.chars) && candidates.length) {
            const entry = candidates.shift();
            evict.push(entry);
            count -= 1;
            chars -= entry.chars;
          }
          // Evicting cannot make room: keep every stored run and leave this one in memory.
          if (count > PLAYLOG_LIMITS.runs || chars > PLAYLOG_LIMITS.chars) return { ok: false, error: "limit", evicted: [] };
          for (const entry of evict) storage.removeItem(entry.key);
          storage.setItem(PLAYLOG_PREFIX + run.runId, value);
          return { ok: true, error: "", evicted: evict.map(entry => entry.run.runId) };
        } catch (err) {
          return { ok: false, error: err?.name === "QuotaExceededError" ? "quota" : "unavailable", evicted: [] };
        }
      },
      remove(runId) {
        try { getStorage().removeItem(PLAYLOG_PREFIX + runId); return true; } catch { return false; }
      }
    };
  }

  // Hooks receive detached plain copies from game.js. A run is stored only after its first commit or comment.
  function createRecorder({ getStorage, now = () => Date.now(), clock = () => globalThis.performance?.now?.() ?? Date.now(), runId = () => newRunId() } = {}) {
    const store = createRunStore(getStorage || (() => { throw new Error("no storage"); }));
    let run = null;
    let persisted = false;
    let startedClock = 0;
    let planning = { startedClock: 0, undoCount: 0, returnCount: 0 };
    let storage = { state: "memory", error: "" };
    const touch = () => { run.updatedAt = minuteStamp(now()); };
    const turnRecord = turn => run?.turns.findLast(item => item.turn === turn) || null;
    function save() {
      if (!run || !persisted) return;
      const written = store.write(run, run.runId);
      storage = written.ok ? { state: "saved", error: "" } : { state: "memory", error: written.error };
    }
    return {
      battleStart({ seed, enemySeed, gameVersion, width }) {
        const stamp = minuteStamp(now());
        run = { schemaVersion: PLAYLOG_SCHEMA, runId: runId(), gameVersion, startedAt: stamp, rng: "mulberry32", seed: seed >>> 0, enemySeed: enemySeed >>> 0,
          layout: layoutClass(width), status: "playing", updatedAt: stamp, exportedAt: null, truncated: false, turns: [], comments: [] };
        persisted = false;
        storage = { state: "memory", error: "" };
        startedClock = clock();
        planning = { startedClock, undoCount: 0, returnCount: 0 };
      },
      turnStart({ turn, start }) {
        if (!run) return;
        planning = { startedClock: clock(), undoCount: 0, returnCount: 0 };
        if (run.turns.length >= PLAYLOG_LIMITS.turns) run.truncated = true;
        else run.turns.push({ turn, start: clone(start), commit: null, result: null });
        touch();
        save();
      },
      planEdit(kind) {
        if (kind === "undo") planning.undoCount += 1;
        else if (kind === "return") planning.returnCount += 1;
      },
      commit({ turn, handOrder, queue }) {
        const record = turnRecord(turn);
        if (!record) return;
        record.commit = { planMs: Math.max(0, Math.round(clock() - planning.startedClock)), undoCount: planning.undoCount,
          returnCount: planning.returnCount, handOrder: [...handOrder], queue: clone(queue) };
        persisted = true;
        touch();
        save();
      },
      turnResolved({ turn, events, units, hostileRunes, emberRunes, battle, deckOrder, discardOrder, enemyDeckOrder, enemyDiscardOrder }) {
        const record = turnRecord(turn);
        if (record?.commit) record.result = clone({ events, units, hostileRunes, emberRunes, battle, deckOrder, discardOrder, enemyDeckOrder, enemyDiscardOrder });
        if (!run) return;
        if (battle) run.status = battle;
        touch();
        save();
      },
      addComment({ text, turn, phase, context }) {
        if (!run) return { ok: false, reason: "no-run" };
        const checked = commentText(text);
        if (!checked.ok) return checked;
        if (run.comments.length >= PLAYLOG_LIMITS.comments) return { ok: false, reason: "limit" };
        const sequence = run.comments.reduce((max, item) => Math.max(max, Number(item.commentId.slice(1)) || 0), 0) + 1;
        const comment = { commentId: `c${sequence}`, turn, phase, ms: Math.max(0, Math.round(clock() - startedClock)), text: checked.text,
          context: commentContextRecord(context) };
        const check = validator();
        check.run({ ...run, comments: [comment] }, "run");
        if (check.errors.length) return { ok: false, reason: "invalid", errors: check.errors };
        run.comments.push(comment);
        persisted = true;
        touch();
        save();
        return { ok: true, comment: clone(comment) };
      },
      deleteComment(commentId, targetRunId = run?.runId) {
        if (run && targetRunId === run.runId) {
          const before = run.comments.length;
          run.comments = run.comments.filter(item => item.commentId !== commentId);
          if (run.comments.length === before) return false;
          touch();
          save();
          return true;
        }
        const stored = store.list().runs.find(item => item.runId === targetRunId);
        if (!stored || !stored.comments.some(item => item.commentId === commentId)) return false;
        stored.comments = stored.comments.filter(item => item.commentId !== commentId);
        stored.updatedAt = minuteStamp(now());
        return store.write(stored, run?.runId ?? null).ok;
      },
      get run() { return run ? clone(run) : null; },
      get storage() { return { ...storage }; },
      get persisted() { return persisted; },
      store
    };
  }

  const api = { KEY, TARGET, FORM_ENTRY, LEGACY_TARGET, KINDS, clone, sameContent, parse, merge, createStore, newId,
    newSubmissionId, sceneText, markdown, sharePayload, formKey, formText, formPayload,
    PLAYLOG_PREFIX, PLAYLOG_SCHEMA, PLAYLOG_SCHEMAS, runSchema, PLAYLOG_LIMITS, rngValue, createRng, chooseSeed, minuteStamp, layoutClass, codePoints, commentText,
    queueRecord, unitRecord, cellRecord, commentContextRecord, commentSceneLine, validateRun, validateLog, buildLogEnvelope, firstDifference,
    createRunStore, createRecorder };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    api.recorder = createRecorder({ getStorage: () => root.localStorage });
    root.Order3Notes = api;
  }
})(globalThis);
