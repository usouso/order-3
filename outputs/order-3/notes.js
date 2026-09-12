/* Notes own their state. Only capturePlaytestScene() reads the game's public display context. */
(() => {
  "use strict";
  const N = Order3Notes;
  const $ = name => document.getElementById(`notes-${name}`);
  const dialog = $("dialog"), body = $("body"), trigger = $("button");
  const store = N.createStore(() => window.localStorage);
  const memory = new Map();
  let draft = null, openingScene = null, timer = null, dirty = false, rescued = false;
  let returnFocus = trigger, prepared = null, editorScroll = 0, openBusy = false, awaitingReturn = false;
  const gameVersion = () => typeof GAME_VERSION === "string" ? GAME_VERSION : "ACT 17";
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
    $("length").textContent = length > 8000 ? `${length}文字。長文も全文を保存します。フォームへはコピー・書き出しで渡せます。` : `${length}文字`;
    for (const name of ["share", "copy", "export-one"]) $(name).disabled = !body.value.trim();
  }
  function loadEditor(note) {
    clearTimeout(timer); timer = null;
    leaveConfirmation(false);
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
    restoreGameDialogFocus(returnFocus, trigger);
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
    say($("conflict"), "別のタブでこのメモが更新されました。入力欄はそのまま保持しています。送る前に、保存したメモの「編集」で新しい内容を確認してください。ここで本文・種類・場面を編集すると、この入力内容を保存します。");
  }
  function leaveConfirmation(restore = true) {
    const wasOpen = !$("confirm").hidden;
    $("confirm").hidden = true;
    $("editor").hidden = false;
    $("list-area").hidden = false;
    $("all-actions").hidden = false;
    $("privacy").hidden = false;
    $("footer").hidden = false;
    if (restore && wasOpen) { $("dialog").querySelector(".notes-scroll").scrollTop = editorScroll; $("share").focus(); }
    prepared = null; awaitingReturn = false;
  }
  function showConfirmation() {
    if (!draft?.body.trim()) return;
    flush();
    // A storage event can arrive late; inspect the durable copy before taking a snapshot.
    if (!dirty && store.load()) {
      const latest = store.notes.find(note => note.id === draft.id);
      if (latest && !N.sameContent(latest, draft) && !dirty) {
        showConflict(); drawList(); setError();
        say($("share-status"), "確認画面は開いていません。入力欄と別タブの保存内容が異なります。一覧の「編集」で内容を確認してください。");
        return;
      }
    }
    setError();
    const snapshot = N.clone(draft), version = gameVersion(), key = N.formKey(snapshot, version);
    const previous = snapshot.share?.forms;
    const id = previous?.key === key ? previous.submissionId : N.newSubmissionId();
    const form = { key, submissionId: id, gameVersion: version,
      preparedAt: previous?.key === key && previous.preparedAt ? previous.preparedAt : new Date().toISOString() };
    prepared = { snapshot, form, payload: N.formPayload(snapshot, id, version),
      durableAtConfirm: store.notes.find(note => note.id === snapshot.id) || null };
    if (!dirty) {
      const recorded = store.recordForm(snapshot, form);
      if (recorded === "changed") { prepared = null; showConflict(); say($("share-status"), "メモが更新されました。送る内容をもう一度確認してください。"); return; }
      if (recorded === "saved" && N.sameContent(draft, snapshot)) draft.share = store.notes.find(note => note.id === draft.id).share;
      if (recorded === "error") setError();
    } else {
      draft.share = { ...draft.share, forms: { ...form, openedAt: previous?.key === key ? previous.openedAt || null : null, externalUrl: N.TARGET } };
      memory.set(draft.id, N.clone(draft));
    }
    editorScroll = dialog.querySelector(".notes-scroll").scrollTop;
    $("editor").hidden = true; $("list-area").hidden = true; $("all-actions").hidden = true;
    $("privacy").hidden = true; $("footer").hidden = true;
    $("confirm").hidden = false;
    $("confirm-scene").textContent = snapshot.scene ? "場面あり。保存時のゲーム版と場面を添付します。" : "場面なし。本文と最小限の記録だけを送ります。";
    $("confirm-mode").textContent = prepared.payload.long
      ? "メモが長いため、自動入力せず全文を貼り付けます。「送る全文をコピー」してからフォームを開き、「送るメモ」に貼り付けてください。"
      : "フォームの「送るメモ」に全文を事前入力します。内容を確認してから送信してください。";
    $("confirm-text").value = prepared.payload.body;
    $("confirm-status").textContent = store.error ? "端末への保存に失敗しています。このタブの全文は確認・コピー・書き出しできます。" : "";
    dialog.querySelector(".notes-scroll").scrollTop = 0;
    $("confirm-back").focus();
  }
  async function copyPrepared() {
    if (!prepared) return;
    const snapshot = prepared;
    const ok = await copyText(snapshot.payload.body);
    if (prepared === snapshot) say($("confirm-status"), ok
      ? "送る全文をコピーしました。フォームの「送るメモ」に貼り付けてください。"
      : "自動コピーできませんでした。下の全文を選択してコピーするか、書き出して残してください。");
  }
  function openForm() {
    if (!prepared || openBusy) return;
    if (!dirty) {
      if (!store.load()) { setError(); say($("confirm-status"), "保存状態を確認できません。内容をもう一度確認してください。"); return; }
      const latest = store.notes.find(note => note.id === prepared.snapshot.id);
      if (!N.sameContent(latest, prepared.snapshot)) { showConflict(); say($("confirm-status"), "メモが更新されました。送る内容をもう一度確認してください。"); return; }
    } else {
      if (!N.sameContent(draft, prepared.snapshot)) {
        say($("confirm-status"), "このタブのメモが更新されました。送る内容をもう一度確認してください。"); return;
      }
      if (store.load()) {
        const latest = store.notes.find(note => note.id === prepared.snapshot.id) || null;
        const prior = prepared.durableAtConfirm;
        if ((prior || latest) && !N.sameContent(prior, latest)) {
          showConflict(); say($("confirm-status"), "別のタブでメモが更新されました。送る内容をもう一度確認してください。"); return;
        }
      }
    }
    openBusy = true;
    const { snapshot, form, payload } = prepared;
    // Synchronous user activation is retained; sever opener before leaving about:blank.
    let popup = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (!popup) throw new Error("popup blocked");
      popup.opener = null;
      popup.location.replace(payload.url);
      const openedAt = new Date().toISOString();
      const recorded = dirty ? "unsaved" : store.recordForm(snapshot, form, openedAt);
      if (N.sameContent(draft, snapshot)) {
        draft.share = { ...draft.share, forms: { ...form, openedAt, externalUrl: N.TARGET } };
        if (dirty) memory.set(draft.id, N.clone(draft));
      }
      if (recorded === "changed" && !dirty) showConflict();
      setError(); drawList();
      awaitingReturn = true;
      say($("confirm-status"), `フォームを開きました。フォームの「送信」を押して完了してください。送信できたかはフォームの完了画面で確認できます。${recorded === "changed" ? "別タブの更新があり、保存履歴は変更していません。" : ""}${recorded === "error" ? "端末の履歴を保存できませんでした。" : ""}`);
    } catch {
      try { popup?.close(); } catch { /* No note data is discarded if browser access fails. */ }
      say($("confirm-status"), "フォームを開けませんでした。メモは保持しています。もう一度開くか、全文をコピー・書き出して残してください。");
    }
    setTimeout(() => { openBusy = false; }, 500);
  }
  trigger.addEventListener("click", event => {
    event.stopPropagation();
    returnFocus = trigger;
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
    if (event.repeat && !$("confirm").hidden && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); return; }
    if (event.key === "Escape") { event.preventDefault(); if (!$("confirm").hidden) leaveConfirmation(); else requestClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll('button, textarea, input, [tabindex="0"]')]
      .filter(item => !item.disabled && item.getClientRects().length && (item.type !== "radio" || item.checked));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener("cancel", event => { event.preventDefault(); if (!$("confirm").hidden) leaveConfirmation(); else requestClose(); });
  $("close").addEventListener("click", () => { if (!$("confirm").hidden) leaveConfirmation(); requestClose(); });
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
  $("share").addEventListener("click", showConfirmation);
  $("confirm-back").addEventListener("click", () => leaveConfirmation());
  $("confirm-copy").addEventListener("click", copyPrepared);
  $("confirm-export").addEventListener("click", () => { if (prepared) download(prepared.payload.body, `order3-send-${prepared.form.submissionId}.txt`, "text/plain;charset=utf-8"); });
  $("form-open").addEventListener("click", openForm);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    if (document.visibilityState === "visible" && awaitingReturn && !$("confirm").hidden) {
      awaitingReturn = false;
      say($("confirm-status"), "フォームで送信を完了しましたか。完了していなければ同じ内容で開き直せます。ゲーム側では送信結果を確認できません。");
      $("form-open").focus();
    }
  });
  window.addEventListener("storage", event => {
    if (event.key !== N.KEY) return;
    store.receive(event.newValue);
    const incoming = draft && store.notes.find(note => note.id === draft.id);
    if (incoming && !N.sameContent(incoming, draft)) showConflict();
    setError(); drawList();
  });
  store.load(); setError(); drawList();
})();
