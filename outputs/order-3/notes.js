/* Comment dialog and log export. Reads the game's comment context and the play-log recorder; nothing is sent over the network. */
(() => {
  "use strict";
  const N = Order3Notes;
  const recorder = N.recorder;
  const $ = name => document.getElementById(`notes-${name}`);
  const dialog = $("dialog"), trigger = $("button"), input = $("input"), recordButton = $("record"), live = $("live");
  const getStorage = () => window.localStorage;
  const gameVersion = () => typeof GAME_VERSION === "string" ? GAME_VERSION : "unknown";
  const pad = value => String(value).padStart(2, "0");
  const head = (text, length) => Array.from(text).slice(0, length).join("");
  const say = (element, text) => { if (element.textContent !== text) element.textContent = text; };
  const view = {
    scene: null, enemySlots: {}, runId: null, returnFocus: trigger, legacy: null, legacyIncluded: false, legacyExportedInTab: false,
    runs: [], selected: new Set(), unreadable: 0, storageReadable: true, exporting: false, deleting: false, escapeHandledAt: -1, mergeNotice: false, mergeNoticeSeen: false
  };
  const MERGE_NOTICE = "別のタブで削除されたコメントを反映しました。";
  const DELETE_CHANGED = "別のタブで内容が変わったため削除しませんでした。";
  const EXPORT_CHANGED = "書き出し中に記録が更新されたランは書き出し済みにしていません。もう一度書き出してください。";

  function safely(read, fallback) { try { return read(); } catch { return fallback; } }
  // Recorder calls that give a Promise with Web Locks and a plain value without them.
  async function safelyAsync(read, fallback) { try { return await read(); } catch { return fallback; } }
  const currentRun = () => safely(() => recorder.run, null);
  // game.js stops a run's log after a recorder fault; comments would then land on a run the game no longer follows.
  const recorderStopped = () => safely(() => typeof playlog !== "undefined" && Boolean(playlog.stopped), false);

  function updateTrigger() {
    const count = currentRun()?.comments.length || 0;
    say(trigger, count ? `ひとこと ${count}` : "ひとこと");
    const label = `ひとことコメントとプレイログ。このランのコメント${count}件`;
    if (trigger.getAttribute("aria-label") !== label) trigger.setAttribute("aria-label", label);
  }

  function inputState() {
    const run = currentRun();
    const value = input.value;
    const checked = N.commentText(value);
    const count = N.codePoints(value.trim());
    if (recorderStopped() || !run) return { ok: false, count, reason: "記録中に問題が起きたため、このランにはコメントを記録できません。" };
    if (run.comments.length >= N.PLAYLOG_LIMITS.comments) return { ok: false, count, reason: `このランのコメントは${N.PLAYLOG_LIMITS.comments}件までです。書き出し画面で削除すると記録できます。` };
    if (!value.length) return { ok: false, count, reason: "" };
    if (checked.reason === "empty") return { ok: false, count, reason: "空白だけでは記録できません。" };
    if (checked.reason === "newline") return { ok: false, count, reason: "改行は入れられません。" };
    if (checked.reason === "too-long") return { ok: false, count, reason: `${N.PLAYLOG_LIMITS.commentCodePoints}字を超えています。` };
    return { ok: true, count, reason: "" };
  }

  function renderInput() {
    const stateNow = inputState();
    say($("counter"), `${stateNow.count}/${N.PLAYLOG_LIMITS.commentCodePoints}`);
    say($("input-reason"), stateNow.reason);
    recordButton.disabled = !stateNow.ok;
    const invalid = String(Boolean(stateNow.reason));
    if (input.getAttribute("aria-invalid") !== invalid) input.setAttribute("aria-invalid", invalid);
  }

  function storageLines() {
    const lines = [];
    const run = currentRun();
    const status = safely(() => recorder.storage, { state: "memory", error: "unavailable" });
    if (recorderStopped() || !run) lines.push("記録中に問題が起きたため、このランの記録を停止しました。それまでの記録は書き出せます。");
    else if (status.error) lines.push(`${status.error === "limit" ? "端末の保存上限に達しました。" : ""}端末に保存できません。このタブを閉じると記録は消えます。閉じる前に書き出してください。`);
    else if (status.state === "saved") lines.push("このランの記録はこの端末に保存しています。");
    else lines.push("命令を実行するかコメントを記録すると、このランをこの端末に保存します。");
    if (safely(() => recorder.usage(), null)?.nearLimit) lines.push("端末の保存容量が残りわずかです。書き出すと古い記録を整理できます");
    if (view.mergeNotice) lines.push(MERGE_NOTICE);
    return lines;
  }

  function legacyExported() {
    return view.legacyExportedInTab || safely(() => getStorage().getItem(N.LEGACY_MARKER) !== null, false);
  }

  function renderMain() {
    const scene = view.scene;
    say($("scene"), scene ? N.commentSceneLine(scene, safely(() => commentCardNames(), {}), view.enemySlots) : "場面を取得できませんでした。");
    const count = currentRun()?.comments.length || 0;
    say($("run-count"), `このランのコメント ${count}件（書き出し画面で確認・削除できます）`);
    const storage = $("storage");
    const lines = storageLines();
    if ([...storage.children].map(item => item.textContent).join("\n") !== lines.join("\n")) {
      storage.replaceChildren(...lines.map(text => Object.assign(document.createElement("p"), { textContent: text })));
    }
    const legacy = view.legacy;
    $("legacy").hidden = !legacy?.present;
    if (legacy?.present) {
      const suffix = legacyExported() ? "（書き出し済み）" : "";
      say($("legacy"), legacy.status === "parsed"
        ? `以前の感想メモが ${legacy.notes.length}件あります。書き出し画面で一緒に書き出せます。${suffix}`
        : `読み取れない以前の感想メモの保存データがあります。書き出し画面で一緒に書き出せます。${suffix}`);
    }
    renderInput();
  }

  function showMain(focus = false) {
    $("export").hidden = true;
    $("main").hidden = false;
    renderMain();
    if (focus) $("export-open").focus();
  }

  // The comment's scene and the enemy order numbers (①②③ by enemy card) of that moment, read together.
  function captureScene() {
    view.scene = safely(() => captureCommentContext(), null);
    view.enemySlots = safely(() => commentEnemySlots(), {});
  }

  function openDialog() {
    view.returnFocus = trigger;
    // The scene is the moment the dialog opens, also when resolution goes on underneath.
    captureScene();
    view.runId = currentRun()?.runId ?? null;
    view.legacy = N.readLegacyNotes(getStorage);
    view.mergeNoticeSeen = view.mergeNotice;
    showMain();
    dialog.showModal();
    input.focus();
  }

  function closeDialog() {
    // A notice that was on screen while the dialog was open is done; one that arrived with this close stays for the next opening.
    if (view.mergeNoticeSeen) view.mergeNotice = false;
    view.mergeNoticeSeen = false;
    $("export").hidden = true;
    $("main").hidden = false;
    dialog.close();
    restoreGameDialogFocus(view.returnFocus, trigger);
  }

  function announce(text) {
    live.textContent = "";
    setTimeout(() => { live.textContent = text; }, 60);
  }

  function record() {
    const stateNow = inputState();
    if (!stateNow.ok || !view.scene) { renderInput(); return; }
    if (currentRun()?.runId !== view.runId) {
      captureScene();
      view.runId = currentRun()?.runId ?? null;
      renderMain();
      say($("input-reason"), "新しい戦闘が始まったため、場面を取り直しました。もう一度「記録する」を押してください。");
      return;
    }
    const result = safely(() => recorder.addComment({ text: input.value, ...view.scene }), { ok: false, reason: "invalid" });
    if (!result.ok) {
      renderInput();
      if (result.reason === "invalid") say($("input-reason"), "このコメントは記録できませんでした。");
      return;
    }
    const turn = result.comment.turn;
    input.value = "";
    closeDialog();
    // With Web Locks the comment is written a moment later; the announcement waits to say whether it was stored.
    safelyAsync(() => recorder.whenWritten(), null).then(() => {
      const stored = safely(() => recorder.storage.state === "saved", false);
      announce(`TURN ${pad(turn)} にコメントを記録しました${stored ? "" : "（端末には保存できていません。書き出してください）"}`);
    });
  }

  /* Export confirmation */
  function reloadRuns(keepSelection) {
    const current = currentRun();
    const stored = recorder.storedRuns ? recorder.storedRuns() : null;
    view.storageReadable = Boolean(stored);
    view.unreadable = stored?.unreadable || 0;
    const others = (stored?.runs || []).slice().reverse();
    view.runs = [...(current ? [{ run: current, current: true }] : []), ...others.map(run => ({ run, current: false }))];
    const ids = new Set(view.runs.map(item => item.run.runId));
    if (keepSelection) view.selected = new Set([...view.selected].filter(id => ids.has(id)));
    else view.selected = new Set(view.runs.filter(item => item.current || !N.exportedSinceChange(item.run)).map(item => item.run.runId));
  }

  function renderRuns() {
    const list = $("runs");
    const rows = view.runs.map(({ run, current }) => {
      const row = document.createElement("li");
      const label = document.createElement("label");
      label.className = "notes-check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = view.selected.has(run.runId);
      box.dataset.runId = run.runId;
      box.addEventListener("change", () => {
        if (box.checked) view.selected.add(run.runId); else view.selected.delete(run.runId);
        renderComments();
        exportChanged();
      });
      const text = document.createElement("span");
      text.textContent = N.runListLabel(run, { current });
      label.append(box, text);
      row.append(label);
      return row;
    });
    if (!rows.length) rows.push(Object.assign(document.createElement("li"), { textContent: "書き出せるランはありません。" }));
    list.replaceChildren(...rows);
    $("unreadable").hidden = view.storageReadable && !view.unreadable;
    say($("unreadable"), view.storageReadable ? `読めない記録 ${view.unreadable}件` : "端末の保存領域を読めないため、このタブの記録だけを表示しています。");
  }

  function renderComments() {
    const rows = [];
    for (const { run } of view.runs) {
      if (!view.selected.has(run.runId)) continue;
      for (const comment of run.comments) {
        const row = document.createElement("li");
        row.className = "notes-comment";
        const text = document.createElement("p");
        text.textContent = `${N.commentPhaseLabel(comment)}｜${comment.text}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "削除";
        remove.dataset.commentId = comment.commentId;
        remove.dataset.runId = run.runId;
        remove.setAttribute("aria-label", `「${head(comment.text, 20)}」のコメントを削除`);
        remove.addEventListener("click", () => deleteComment(run.runId, comment));
        row.append(text, remove);
        rows.push(row);
      }
    }
    if (!rows.length) rows.push(Object.assign(document.createElement("li"), { textContent: "書き出すコメントはありません。" }));
    $("comments").replaceChildren(...rows);
  }

  // shown is the comment as this list displayed it. If the device now holds something else under that id, or nothing, nothing is deleted.
  // With Web Locks the recorder checks this on the run's latest stored copy while holding its lock; without them the page checks first.
  async function deleteComment(runId, shown) {
    if (view.deleting) return;
    view.deleting = true;
    const { commentId } = shown;
    const buttons = [...$("comments").querySelectorAll("button")];
    const index = buttons.findIndex(button => button.dataset.commentId === commentId && button.dataset.runId === runId);
    const { changed, saved } = await safelyAsync(() => recorder.removeComment(runId, shown), { deleted: false, changed: false, saved: false });
    view.deleting = false;
    reloadRuns(true);
    const gone = !view.runs.find(item => item.run.runId === runId)?.run.comments.some(item => N.sameComment(item, shown));
    renderRuns();
    renderComments();
    exportChanged();
    say($("export-status"), changed ? DELETE_CHANGED
      : gone ? saved ? "コメントを削除しました。" : "コメントを削除しました。端末には保存できていません。" : "コメントを削除できませんでした。");
    const next = $("comments").querySelectorAll("button");
    (next[Math.min(index, next.length - 1)] || $("comments-title")).focus();
  }

  // Another tab changed stored runs: rebuild the lists only when what they show changed, keeping focus on the same control.
  function listSignature() {
    return JSON.stringify([view.storageReadable, view.unreadable, [...view.selected], view.runs.map(({ run, current }) =>
      [run.runId, N.runListLabel(run, { current }), run.comments.map(item => [item.commentId, N.commentPhaseLabel(item), item.text])])]);
  }
  function refreshExport() {
    if (!dialog.open || $("export").hidden || view.exporting) return;
    const before = listSignature();
    reloadRuns(true);
    if (listSignature() === before) return;
    const focused = document.activeElement;
    const inRuns = $("runs").contains(focused), inComments = $("comments").contains(focused);
    const index = inComments ? [...$("comments").querySelectorAll("button")].indexOf(focused) : -1;
    const { runId, commentId } = focused?.dataset || {};
    renderRuns();
    renderComments();
    exportChanged();
    if (inRuns) ($("runs").querySelector(`input[data-run-id="${CSS.escape(runId || "")}"]`) || $("export-title")).focus();
    else if (inComments) {
      const buttons = [...$("comments").querySelectorAll("button")];
      (buttons.find(button => button.dataset.runId === runId && button.dataset.commentId === commentId)
        || buttons[Math.min(Math.max(index, 0), buttons.length - 1)] || $("comments-title")).focus();
    }
  }

  function renderLegacy() {
    const legacy = view.legacy;
    const section = $("legacy-export");
    section.hidden = !legacy?.present;
    if (!legacy?.present) return;
    $("legacy-include").checked = view.legacyIncluded;
    const exported = legacyExported() ? "（書き出し済み）" : "";
    say($("legacy-label"), legacy.status === "parsed"
      ? `以前の感想メモ ${legacy.notes.length}件も含める${exported}`
      : `読み取れない以前の保存データ（${legacy.chars}文字）をそのまま含める${exported}`);
    const rows = legacy.status === "parsed" ? legacy.notes.map(note => {
      const row = document.createElement("li");
      const text = document.createElement("p");
      text.textContent = `${N.KINDS[note.kind]}｜${head(note.body.replace(/\s+/g, " "), 65)}`;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "全文";
      const body = document.createElement("p");
      body.className = "notes-body";
      body.textContent = note.body;
      details.append(summary, body);
      row.append(text, details);
      return row;
    }) : [];
    $("legacy-list").replaceChildren(...rows);
  }

  function buildCurrent() {
    const runs = view.runs.filter(item => view.selected.has(item.run.runId)).map(item => item.run);
    return N.buildExport({ runs, legacy: view.legacyIncluded ? view.legacy : null, exportedBy: gameVersion(), now: Date.now() });
  }

  function hasContent() {
    return view.runs.some(item => view.selected.has(item.run.runId)) || (view.legacyIncluded && view.legacy?.present);
  }

  function exportChanged() {
    $("export-run").disabled = view.exporting || !hasContent();
    if (!hasContent()) say($("export-status"), "書き出す内容を選んでください。");
    else if ($("export-status").textContent === "書き出す内容を選んでください。") say($("export-status"), "");
    if ($("json-details").open) $("json").value = JSON.stringify(buildCurrent().log, null, 2);
  }

  function openExport() {
    reloadRuns(false);
    view.legacy = N.readLegacyNotes(getStorage);
    view.legacyIncluded = Boolean(view.legacy.present) && !legacyExported();
    $("compress-note").hidden = typeof CompressionStream === "function";
    // Without Web Locks two tabs tidying the same records at once can lose content.
    $("lock-note").hidden = safely(() => recorder.locked, false);
    $("fallback").hidden = true;
    $("fallback-text").value = "";
    $("json-details").open = false;
    $("json").value = "";
    say($("export-status"), "");
    renderRuns();
    renderComments();
    renderLegacy();
    exportChanged();
    $("main").hidden = true;
    $("export").hidden = false;
    dialog.querySelector(".notes-scroll").scrollTop = 0;
    $("export-title").focus();
  }

  function download(bytes, name) {
    let url = null, link = null;
    try {
      if (typeof Blob !== "function" || typeof URL?.createObjectURL !== "function") throw new Error("blob unavailable");
      url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      link = document.createElement("a");
      if (!("download" in link)) throw new Error("download unavailable");
      link.href = url;
      link.download = name;
      link.hidden = true;
      dialog.append(link);
      link.click();
      return true;
    } catch {
      return false;
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function exportLog() {
    if (view.exporting || !hasContent()) return;
    view.exporting = true;
    $("export-run").disabled = true;
    try {
      const current = currentRun();
      if (current) view.runs = view.runs.map(item => item.current ? { run: current, current: true } : item);
      const built = buildCurrent();
      if (!built.check.ok) {
        say($("export-status"), `書き出せませんでした。記録の形式を確認できません（${built.check.errors[0] || "不明"}）。`);
        return;
      }
      const text = JSON.stringify(built.log);
      if ($("json-details").open) $("json").value = JSON.stringify(built.log, null, 2);
      const file = await N.encodeLogFile(text);
      if (!file.gzip) $("compress-note").hidden = false;
      if (!download(file.bytes, built.fileName)) {
        $("fallback").hidden = false;
        $("fallback-text").value = text;
        say($("export-status"), "ファイルを作れませんでした。下の全文をコピーして制作者に送ってください。ゲームからは送信されません。");
        $("fallback-text").focus();
        return;
      }
      // Only runs still equal to their copy in the file are marked; a run changed meanwhile (another tab, or this battle going on) is not.
      const { ok: marked, skipped } = await safelyAsync(() => recorder.markExportedRuns(built.log.runs, built.exportedAt), { ok: false, skipped: [] });
      if (built.log.legacyNotes) {
        view.legacyExportedInTab = true;
        safely(() => getStorage().setItem(N.LEGACY_MARKER, built.exportedAt), null);
        view.legacyIncluded = false;
      }
      reloadRuns(true);
      renderRuns();
      renderComments();
      renderLegacy();
      say($("export-status"), `${built.fileName} を書き出しました。保存したファイルを制作者に送ってください。ゲームからは送信されません。${marked ? "" : "書き出した記録を端末に残せませんでした。"}${skipped.length ? EXPORT_CHANGED : ""}`);
    } finally {
      view.exporting = false;
      exportChanged();
    }
  }

  async function copyFallback() {
    const area = $("fallback-text");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(area.value);
      say($("export-status"), "全文をコピーしました。制作者に送ってください。ゲームからは送信されません。");
    } catch {
      area.focus();
      area.select();
      say($("export-status"), "自動でコピーできませんでした。選択された全文をコピーしてください。");
    }
  }

  function handleEscape() {
    if (!$("export").hidden) showMain(true);
    else closeDialog();
  }

  trigger.addEventListener("click", event => {
    event.stopPropagation();
    openDialog();
  });
  dialog.addEventListener("click", event => event.stopPropagation());
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      view.escapeHandledAt = event.timeStamp;
      handleEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button, input, textarea, summary, [tabindex='0']")]
      .filter(item => !item.disabled && item.getClientRects().length && !item.closest("[hidden]"));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  // A close request without a keydown (for example a platform back gesture) takes the same steps once.
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (performance.now() - view.escapeHandledAt < 500 && view.escapeHandledAt >= 0) return;
    handleEscape();
  });
  input.addEventListener("input", renderInput);
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    // Enter that confirms an IME conversion is not a submit.
    if (event.isComposing || event.keyCode === 229 || event.repeat) return;
    record();
  });
  recordButton.addEventListener("click", record);
  $("close").addEventListener("click", closeDialog);
  $("export-open").addEventListener("click", openExport);
  $("export-back").addEventListener("click", () => showMain(true));
  $("export-run").addEventListener("click", exportLog);
  $("copy").addEventListener("click", copyFallback);
  $("legacy-include").addEventListener("change", () => {
    view.legacyIncluded = $("legacy-include").checked;
    exportChanged();
  });
  $("json-details").addEventListener("toggle", () => {
    if ($("json-details").open) $("json").value = JSON.stringify(buildCurrent().log, null, 2);
  });
  safely(() => recorder.subscribe(() => {
    updateTrigger();
    const removed = safely(() => recorder.takeMergeNotice(), 0) > 0;
    if (removed) view.mergeNotice = true;
    if (!dialog.open) return;
    if (!$("main").hidden) renderMain();
    else if (removed) {
      refreshExport();
      if (!view.exporting) say($("export-status"), MERGE_NOTICE);
    }
  }), null);
  // Another tab of this site wrote the play log: take in deletions and export marks of this tab's run, then refresh what is shown.
  window.addEventListener("storage", event => {
    if (event.storageArea && event.storageArea !== safely(() => window.localStorage, null)) return;
    if (event.key !== null && !String(event.key).startsWith(N.PLAYLOG_PREFIX)) return;
    safely(() => recorder.sync(), null);
    if (!dialog.open) return;
    if (view.mergeNotice) view.mergeNoticeSeen = true;
    if ($("export").hidden) renderMain();
    else refreshExport();
  });
  updateTrigger();
})();
