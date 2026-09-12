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
  const api = { KEY, TARGET, FORM_ENTRY, LEGACY_TARGET, KINDS, clone, sameContent, parse, merge, createStore, newId,
    newSubmissionId, sceneText, markdown, sharePayload, formKey, formText, formPayload };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Order3Notes = api;
})(globalThis);
