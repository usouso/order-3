/* Notes own their state. Only capturePlaytestScene() reads the game's public display context. */
(() => {
  "use strict";
  const N = Order3Notes;
  const $ = name => document.getElementById(`notes-${name}`);
  const dialog = $("dialog"), body = $("body"), trigger = $("button");
  const store = N.createStore(() => window.localStorage);
  const memory = new Map();
  let draft = null, openingScene = null, timer = null, dirty = false, rescued = false;
  let returnFocus = trigger;
  const placeholders = { impression: "面白かったこと、分かりにくかったこと…", idea: "こうなるとよい、と思ったこと…", bug: "期待したこと／実際に起きたこと…" };
  const say = (element, text) => { if (element.textContent !== text) element.textContent = text; };
  const status = text => say($("save-status"), text);
  const allNotes = () => {
    const notes = new Map(store.notes.map(note => [note.id, note]));
    for (const note of memory.values()) if (note.body.trim()) notes.set(note.id, N.clone(note));
    if (dirty && draft?.id && draft.body.trim()) notes.set(draft.id, N.clone(draft));
    return [...notes.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  };
  function setError() {
    $("error").hidden = !store.error;
    say($("error"), store.error ? `端末に保存できませんでした。内容はこの画面に残っています。${store.error}` : "");
    $("raw-actions").hidden = !store.error || store.raw === null;
    $("save").textContent = store.error ? "再試行（端末に保存）" : "端末に保存";
    if (store.error) status("端末への保存に失敗しています");
  }
  function drawList() {
    const saved = store.notes;
    const count = saved.length;
    trigger.textContent = `感想メモ${count ? ` ${count}` : ""}`;
    trigger.setAttribute("aria-label", `感想や改善案のメモを開く。端末保存${count}件`);
    $("count").textContent = `端末保存 ${count}件`;
    const list = $("list");
    list.replaceChildren();
    for (const note of allNotes()) {
      const row = document.createElement("li");
      const text = document.createElement("p");
      const brief = Array.from(note.body.replace(/\s+/g, " ")).slice(0, 65).join("");
      text.textContent = `${N.KINDS[note.kind]}｜${brief}`;
      const meta = document.createElement("small");
      const durable = saved.find(item => item.id === note.id);
      meta.textContent = `${new Date(note.updatedAt).toLocaleString("ja-JP")} / ${note.scene ? "場面あり" : "本文のみ"}${!durable || durable.updatedAt !== note.updatedAt ? " / このタブ内の未保存内容あり" : ""}`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "編集";
      edit.setAttribute("aria-label", `${N.KINDS[note.kind]}「${brief}」を編集`);
      edit.addEventListener("click", () => {
        flush();
        const current = allNotes().find(item => item.id === note.id);
        loadEditor(current);
        body.focus();
      });
      row.append(text, meta, edit);
      list.append(row);
    }
    if (!list.children.length) {
      const empty = document.createElement("li");
      empty.textContent = "メモはまだありません。";
      list.append(empty);
    }
  }
  function showScene() {
    $("scene").hidden = !$("attach").checked;
    $("scene").textContent = N.sceneText(draft?.scene || openingScene);
    $("scene-update").disabled = !$("attach").checked;
  }
  function clearRescue() {
    $("fallback").hidden = true;
    $("rescue").value = "";
    $("action-status").textContent = "";
    $("share-status").textContent = "";
    $("close-choice").hidden = true;
    $("conflict").hidden = true;
    rescued = false;
  }
  function updateBodyHints() {
    const length = Array.from(body.value).length;
    $("length").textContent = length > 8000 ? `${length}文字。長文も全文を保存します。共有時はコピー・書き出しを使います。` : `${length}文字`;
    for (const name of ["share", "copy", "export-one"]) $(name).disabled = !body.value.trim();
  }
  function loadEditor(note) {
    clearTimeout(timer); timer = null;
    clearRescue();
    if (note) {
      draft = N.clone(note);
      openingScene = note.scene ? N.clone(note.scene) : capturePlaytestScene();
      dirty = memory.has(note.id);
    } else {
      openingScene = capturePlaytestScene();
      draft = { id: null, kind: "impression", body: "", createdAt: null, updatedAt: null,
        scene: N.clone(openingScene), share: { state: "local-only", handoffOpenedAt: null, externalUrl: null } };
      dirty = false;
    }
    body.value = draft.body;
    document.querySelectorAll('[name="note-kind"]').forEach(radio => { radio.checked = radio.value === draft.kind; });
    body.placeholder = placeholders[draft.kind];
    $("attach").checked = Boolean(draft.scene);
    showScene(); updateBodyHints(); setError();
    status(store.error ? "端末への保存に失敗しています" : dirty ? "このタブ内に未保存の内容があります" : note ? "この端末に下書き保存済み" : "本文を入力すると自動保存します");
  }
  function changed() {
    clearTimeout(timer);
    if (!draft.id && body.value.length) {
      draft.id = N.newId();
      draft.createdAt = new Date().toISOString();
    }
    draft.body = body.value;
    draft.kind = document.querySelector('[name="note-kind"]:checked').value;
    draft.scene = $("attach").checked ? N.clone(openingScene) : null;
    draft.updatedAt = new Date().toISOString();
    body.placeholder = placeholders[draft.kind];
    dirty = true; rescued = false;
    if (draft.id) memory.set(draft.id, N.clone(draft));
    updateBodyHints(); showScene();
    status("保存中…");
    timer = setTimeout(flush, 500);
  }
  function flush() {
    clearTimeout(timer); timer = null;
    if (!draft || !dirty) return !store.error;
    if (!draft.body.trim()) {
      status("本文が空のため保存していません。以前保存したメモは残っています。");
      return true;
    }
    if (store.save(draft)) {
      draft = store.notes.find(note => note.id === draft.id);
      memory.delete(draft.id); dirty = false;
      status("この端末に下書き保存済み");
    } else {
      memory.set(draft.id, N.clone(draft));
      status("端末への保存に失敗しています");
    }
    setError(); drawList();
    return !store.error;
  }
  function finishClose() {
    $("close-choice").hidden = true;
    dialog.close();
    (returnFocus?.isConnected ? returnFocus : trigger).focus({ preventScroll: true });
  }
  function requestClose() {
    flush();
    if (store.error && dirty && draft?.body.trim() && !rescued) {
      $("close-choice").hidden = false;
      $("copy-close").focus();
    } else finishClose();
  }
  function fallback(text) {
    $("fallback").hidden = false;
    $("rescue").value = text;
    $("rescue").focus();
    $("rescue").select();
  }
  async function copyText(text) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      say($("action-status"), "全文をコピーしました。");
      return true;
    } catch {
      fallback(text);
      say($("action-status"), "自動コピーできませんでした。選択された全文をコピーしてください。");
      return false;
    }
  }
  async function copyCurrent() {
    if (!draft?.body.trim()) return false;
    const version = JSON.stringify(draft);
    const ok = await copyText(N.markdown(draft));
    const currentCopied = ok && version === JSON.stringify(draft);
    if (currentCopied) rescued = true;
    return currentCopied;
  }
  function download(text, name, type) {
    let url, link;
    try {
      url = URL.createObjectURL(new Blob([text], { type }));
      link = document.createElement("a");
      if (!("download" in link)) throw new Error("download unavailable");
      link.href = url; link.download = name;
      dialog.append(link); link.click();
      say($("action-status"), "書き出しを開始しました。保存先を確認してください。保存できない場合は全文をコピーできます。");
      // Browsers do not acknowledge disk-save success: keep a selectable fallback available.
      fallback(text);
      return true;
    } catch {
      fallback(text);
      say($("action-status"), "書き出しを開始できませんでした。選択された全文をコピーしてください。");
      return false;
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  function exportAll(format) {
    const notes = allNotes();
    const text = format === "json" ? JSON.stringify({ ...store.data, notes }, null, 2) : notes.map(N.markdown).join("\n---\n\n");
    download(text, `order3-notes.${format === "json" ? "json" : "md"}`, format === "json" ? "application/json" : "text/markdown;charset=utf-8");
  }
  function showConflict() {
    $("conflict").hidden = false;
    say($("conflict"), "別のタブでこのメモが更新されました。入力欄はそのまま保持しています。共有する前に、保存したメモの「編集」で新しい内容を確認してください。ここで本文・種類・場面を編集すると、この入力内容を保存します。");
  }
  function share() {
    if (!draft?.body.trim()) return;
    flush();
    // Do not rely on delivery of a storage event: check the durable record on every click.
    if (!dirty && store.load()) {
      const latest = store.notes.find(note => note.id === draft.id);
      if (latest && !N.sameContent(latest, draft) && !dirty) {
        showConflict(); drawList(); setError();
        say($("share-status"), "共有画面は開いていません。入力欄と別タブの保存内容が異なります。一覧の「編集」で内容を確認してから、もう一度「制作に送る」を押してください。");
        return;
      }
    }
    setError();
    const handoff = N.clone(draft);
    const payload = N.sharePayload(handoff);
    // Synchronous user activation is retained; sever opener before leaving about:blank.
    let popup = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (!popup) throw new Error("popup blocked");
      popup.opener = null;
      popup.location.replace(payload.url);
      const openedAt = new Date().toISOString();
      const recorded = dirty ? "unsaved" : store.recordHandoff(handoff, openedAt);
      // Sharing never marks content dirty or feeds a stale editor into save().
      if (N.sameContent(draft, handoff)) {
        draft.share = { state: "handoff-opened", handoffOpenedAt: openedAt, externalUrl: N.TARGET };
        if (dirty) memory.set(draft.id, N.clone(draft));
      }
      if (recorded === "changed" && !dirty) showConflict();
      setError(); drawList();
      say($("share-status"), `共有画面を開きました。GitHubで投稿を完了してください。${recorded === "changed" && !dirty ? "共有画面にはクリック時の入力内容を渡しました。その後に変わった端末の保存内容は変更していません。" : ""}${payload.long ? "メモが長いため本文は自動入力していません。全文をコピーまたはMarkdownで書き出し、貼り付けてください。" : ""}`);
    } catch {
      try { popup?.close(); } catch { /* No note data is discarded if browser access fails. */ }
      say($("share-status"), "共有画面を開けませんでした。メモは保持しています。コピーや書き出しで残し、もう一度お試しください。");
    }
    if (payload.long) copyText(payload.body);
  }
  trigger.addEventListener("click", event => {
    event.stopPropagation();
    returnFocus = document.activeElement;
    if (!draft) {
      const notes = store.notes;
      loadEditor(notes.find(note => note.id === store.data.activeNoteId) || notes[0] || null);
    } else if (!draft.id && !draft.body) loadEditor(null);
    drawList(); setError();
    dialog.showModal(); body.focus();
  });
  dialog.addEventListener("click", event => event.stopPropagation());
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll('button, textarea, input, [tabindex="0"]')]
      .filter(item => !item.disabled && item.getClientRects().length && (item.type !== "radio" || item.checked));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener("cancel", event => { event.preventDefault(); requestClose(); });
  $("close").addEventListener("click", requestClose);
  $("new").addEventListener("click", () => { flush(); loadEditor(null); drawList(); body.focus(); });
  body.addEventListener("input", changed);
  document.querySelectorAll('[name="note-kind"]').forEach(radio => radio.addEventListener("change", changed));
  $("attach").addEventListener("change", () => {
    if ($("attach").checked && !openingScene) openingScene = capturePlaytestScene();
    changed();
  });
  $("scene-update").addEventListener("click", () => { openingScene = capturePlaytestScene(); changed(); });
  $("save").addEventListener("click", () => {
    if (store.error && !dirty) { store.load(); setError(); drawList(); }
    flush();
  });
  $("copy").addEventListener("click", copyCurrent);
  $("copy-close").addEventListener("click", async () => { if (await copyCurrent()) finishClose(); });
  $("memory-close").addEventListener("click", finishClose);
  $("close-back").addEventListener("click", () => { $("close-choice").hidden = true; body.focus(); });
  $("export-one").addEventListener("click", () => download(N.markdown(draft), `order3-note-${draft.id}.md`, "text/markdown;charset=utf-8"));
  $("export-json").addEventListener("click", () => exportAll("json"));
  $("export-md").addEventListener("click", () => exportAll("md"));
  $("raw-copy").addEventListener("click", () => copyText(store.raw));
  $("raw-export").addEventListener("click", () => download(store.raw, "order3-notes-original.txt", "text/plain;charset=utf-8"));
  $("share").addEventListener("click", share);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("storage", event => {
    if (event.key !== N.KEY) return;
    store.receive(event.newValue);
    const incoming = draft && store.notes.find(note => note.id === draft.id);
    if (incoming && !N.sameContent(incoming, draft)) showConflict();
    setError(); drawList();
  });
  store.load(); setError(); drawList();
})();
