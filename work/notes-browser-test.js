const { chromium } = require('C:/Users/nonus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const N = require('../outputs/order-3/notes-core.js');
const root = path.resolve(__dirname, '../outputs/order-3');
const evidence = path.resolve(__dirname, process.env.ORDER3_BROWSER_EVIDENCE || 'act13-browser');
fs.mkdirSync(evidence, { recursive: true });
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.replace(/^\//, '') || 'index.html';
  if (!['index.html', 'styles.css', 'notes.css', 'game.js', 'notes.js', 'notes-core.js'].includes(name)) { res.writeHead(name === 'favicon.ico' ? 204 : 404); res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  let source = fs.readFileSync(path.join(root, name), 'utf8');
  // ACT 12 layout baseline: undo only this slice's topbar additions in the served test response.
  if (name === 'index.html' && req.url.includes('baseline')) source = source.replace(/<link rel="stylesheet" href="notes.css">/, '').replace(/<div class="topbar-tools">[\s\S]*?<\/div>/, '<button class="icon-button" id="help-button" aria-label="遊び方">?</button>').replace(/  <dialog id="notes-dialog"[\s\S]*?<\/dialog>/, '').replace(/  <script src="notes(?:-core)?\.js"><\/script>\n/g, '');
  res.end(source);
});
let browser;
const report = { geometry: [], checks: [], errors: [] };
function pass(name) { report.checks.push(name); console.log(`PASS ${name}`); }
async function gameFingerprint(page) {
  return page.evaluate(() => JSON.stringify({ game, valid: validCells(), forecast: currentForecast(), board: document.getElementById('battlefield').innerHTML, timeline: document.getElementById('action-timeline').innerHTML, hand: document.getElementById('hand').innerHTML }));
}
async function start(page, url) { await page.goto(url); await page.locator('#modal-button').click(); }
async function saved(page) { await page.waitForFunction(() => document.getElementById('notes-save-status').textContent === 'この端末に下書き保存済み'); }
async function payload(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), N.KEY); }
async function open(page) { await page.locator('#notes-button').click(); await page.waitForFunction(() => document.activeElement.id === 'notes-body'); }
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  await context.addInitScript(() => { Math.random = () => 0.5; });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.errors.push(message.text()); });
  const external = [];
  context.on('request', request => { if (!request.url().startsWith(url) && !request.url().startsWith('data:')) external.push(request.url()); });
  const geometry = () => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
    return { documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, board: rect('#battlefield'), hand: rect('#hand'), timeline: rect('#action-timeline') };
  };
  for (const width of [1280, 700, 320]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 900 });
    await start(page, `${url}?baseline`);
    const baseline = await page.evaluate(geometry);
    await start(page, url);
    const closed = await page.evaluate(geometry);
    assert.deepEqual(closed, baseline, `${width} closed layout must retain ACT 12 geometry`);
    const before = await gameFingerprint(page);
    await open(page);
    await page.locator('#notes-body').fill('検証用メモ 🧭\n</textarea><img src=x onerror=alert(1)>');
    await saved(page);
    const measured = await page.evaluate(() => {
      const d = document.getElementById('notes-dialog'), r = d.getBoundingClientRect(), body = document.getElementById('notes-body');
      return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, dialog: { x:r.x, y:r.y, width:r.width, height:r.height }, scrollWidth:d.scrollWidth, clientWidth:d.clientWidth, textareaFont:getComputedStyle(body).fontSize, labels:[...document.querySelectorAll('.notes-kinds label')].map(e => e.getBoundingClientRect().height) };
    });
    assert.equal(measured.documentWidth, width); assert(measured.dialog.x >= 0 && measured.dialog.x + measured.dialog.width <= width);
    assert(measured.scrollWidth <= measured.clientWidth); assert.equal(measured.textareaFont, '16px'); assert(measured.labels.every(h => h >= 44));
    assert.equal(await page.locator('#notes-dialog img').count(), 0);
    await page.screenshot({ path: path.join(evidence, `notes-${width}.png`) });
    await page.locator('#notes-export-md').focus();
    assert(await page.evaluate(() => {
      const row = document.activeElement.getBoundingClientRect();
      const footer = document.querySelector('.notes-footer').getBoundingClientRect();
      return row.top >= document.querySelector('.notes-header').getBoundingClientRect().bottom && row.bottom <= footer.top;
    }), `${width}: the final action scrolls clear of the footer`);
    // Native modal plus explicit boundary wrapping keeps keyboard focus in the dialog.
    await page.locator('#notes-close').focus(); await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'notes-copy');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'notes-close');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.activeElement.id), 'notes-button');
    assert.equal(await gameFingerprint(page), before); assert.deepEqual(await page.evaluate(geometry), closed);
    report.geometry.push({ width, closed, open: measured });
  }
  pass('1280/700/320 geometry, full-text safe DOM, modal keyboard trap, close focus, unchanged combat DOM/state');
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  const persisted = await payload(page); const original = persisted.notes[0];
  await page.locator('input[value="idea"]').check(); await page.locator('#notes-body').fill('改善案：次の手を考えたい 🧭'); await saved(page);
  let data = await payload(page); assert.equal(data.notes.length, persisted.notes.length); assert.equal(data.notes[0].id, original.id); assert.equal(data.notes[0].createdAt, original.createdAt); assert.deepEqual(data.notes[0].scene, original.scene); assert.equal(data.notes[0].kind, 'idea');
  await page.reload(); await page.locator('#modal-button').click(); await open(page); assert.equal(await page.locator('#notes-body').inputValue(), '改善案：次の手を考えたい 🧭');
  await page.locator('#notes-attach').uncheck(); await saved(page); assert.equal((await payload(page)).notes[0].scene, null);
  await page.locator('#notes-close').click(); const beforeReset = await payload(page); await page.evaluate(() => resetGame()); assert.deepEqual(await payload(page), beforeReset);
  await open(page); await page.locator('#notes-new').click(); await page.locator('input[value="bug"]').check(); await page.locator('#notes-body').fill('不具合の記録'); await saved(page); assert.equal((await payload(page)).notes[0].kind, 'bug');
  await page.locator('#notes-new').click(); await page.locator('#notes-body').fill('pagehideで保留を保存'); await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); assert((await payload(page)).notes.some(n => n.body === 'pagehideで保留を保存'));
  pass('ID-preserving edits, 3 kinds, reload active editor, scene OFF, reset persistence, pagehide flush');
  assert.deepEqual(external, []); pass('no external request during open/edit/autosave/reload/reset');
  // The following fake browser APIs measure outgoing URLs without posting test Issues.
  await page.evaluate(() => {
    window.testHandoffs = []; window.testCopies = [];
    window.open = (url, target) => { const record = { initial:url, target }; testHandoffs.push(record); return { set opener(value) { record.opener=value; }, location: { replace(value) { record.url=value; } } }; };
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value: { writeText: async text => { testCopies.push(text); } } });
  });
  await page.locator('#notes-body').fill('短文 🧭 & # ?\n</textarea>'); await saved(page);
  const shareBefore = await gameFingerprint(page); await page.locator('#notes-share').click();
  let out = await page.evaluate(() => testHandoffs.at(-1)); const shortURL = new URL(out.url);
  assert.equal(out.opener, null); assert.equal(shortURL.origin + shortURL.pathname, N.TARGET); assert.deepEqual([...shortURL.searchParams.keys()], ['title','body']);
  data = await payload(page); assert.equal(shortURL.searchParams.get('body'), N.markdown(data.notes[0])); assert.equal(data.notes[0].share.state, 'handoff-opened');
  assert((await page.locator('#notes-share-status').innerText()).includes('GitHubで投稿を完了してください')); assert.equal(await gameFingerprint(page), shareBefore);
  await page.locator('#notes-copy').click(); assert.equal(await page.evaluate(() => testCopies.at(-1)), shortURL.searchParams.get('body'));
  const longBody = '長文を途中で切らない 🧭\n'.repeat(900);
  await page.locator('#notes-body').fill(longBody); await saved(page); await page.locator('#notes-share').click();
  out = await page.evaluate(() => testHandoffs.at(-1)); assert.deepEqual([...new URL(out.url).searchParams.keys()], ['title']); assert((await page.evaluate(() => testCopies.at(-1))).includes(longBody));
  const downloadPromise = page.waitForEvent('download'); await page.locator('#notes-export-one').click(); const download = await downloadPromise; assert.equal(fs.readFileSync(await download.path(), 'utf8'), N.markdown((await payload(page)).notes[0]));
  pass('encoded short handoff, selected note only, long title-only URL, complete copy and Markdown download, no false submitted state');
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new Error('test denied'); };
    URL.createObjectURL = () => { throw new Error('test blocked download'); };
    window.open = () => null;
  });
  await page.locator('#notes-copy').click(); assert((await page.locator('#notes-rescue').inputValue()).includes(longBody));
  await page.locator('#notes-export-json').click(); const jsonRescue = JSON.parse(await page.locator('#notes-rescue').inputValue()); assert(jsonRescue.notes.some(n => n.body === longBody));
  await page.locator('#notes-share').click(); assert((await page.locator('#notes-share-status').innerText()).includes('開けません')); assert.equal(await page.locator('#notes-body').inputValue(), longBody);
  pass('clipboard/download/popup failure keeps full Japanese, emoji and HTML-like text');
  // Separate isolated origins/contexts keep failure fixtures away from real user storage.
  for (const failure of ['denied', 'quota', 'corrupt', 'unknown']) {
    const fault = await browser.newContext({ viewport:{width:320,height:900} });
    await fault.addInitScript(mode => {
      const key = 'order3.playtestNotes.v1';
      if (mode === 'corrupt') localStorage.setItem(key, '{broken');
      if (mode === 'unknown') localStorage.setItem(key, JSON.stringify({schemaVersion:99,notes:[]}));
      window.rawBefore = localStorage.getItem(key);
      window.testStorage = localStorage; window.testSetItem = Storage.prototype.setItem;
      if (mode === 'denied') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied','SecurityError'); } });
      if (mode === 'quota') Storage.prototype.setItem = () => { throw new DOMException('full','QuotaExceededError'); };
      Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText:async()=>{throw new Error('denied');}} });
    }, failure);
    const p = await fault.newPage(); await start(p,url); await open(p); await p.locator('#notes-body').fill(`未保存でも守る ${failure} 🧭`);
    await p.waitForFunction(() => !document.getElementById('notes-error').hidden);
    await p.locator('#notes-save').click(); assert.equal(await p.locator('#notes-count').innerText(), '端末保存 0件');
    await p.keyboard.press('Escape'); assert(await p.locator('#notes-close-choice').isVisible());
    await p.locator('#notes-copy-close').click(); assert(await p.locator('#notes-dialog').isVisible()); assert((await p.locator('#notes-rescue').inputValue()).includes(failure));
    await p.locator('#notes-memory-close').click(); await open(p); assert((await p.locator('#notes-body').inputValue()).includes(failure));
    await p.locator('#notes-export-json').click(); assert((await p.locator('#notes-rescue').inputValue()).includes(failure));
    if (['corrupt','unknown'].includes(failure)) { assert.equal(await p.evaluate(key => localStorage.getItem(key),N.KEY),await p.evaluate(()=>rawBefore)); await p.locator('#notes-raw-copy').click(); assert.equal(await p.locator('#notes-rescue').inputValue(), await p.evaluate(()=>rawBefore)); }
    await p.screenshot({ path:path.join(evidence,`failure-${failure}.png`) });
    await p.evaluate(mode => {
      if(mode === 'denied') Object.defineProperty(window,'localStorage',{configurable:true,value:window.testStorage});
      Storage.prototype.setItem=window.testSetItem;
      if(['corrupt','unknown'].includes(mode)) localStorage.removeItem('order3.playtestNotes.v1');
    },failure);
    await p.locator('#notes-save').click(); await saved(p); assert.equal((await payload(p)).notes.length,1);
    assert.equal(await p.locator('#notes-body').inputValue(),`未保存でも守る ${failure} 🧭`);
    await fault.close();
  }
  pass('storage denied/quota/corrupt/unknown protection, accurate count, failed close rescue and raw recovery');
  // Two real tabs exercise storage events, ID merge, and protection of an active editor.
  const multi = await browser.newContext(); const a = await multi.newPage(), b = await multi.newPage();
  await start(a,url); await start(b,url); await open(a); await open(b);
  await a.locator('#notes-body').fill('tab A'); await saved(a); await b.locator('#notes-body').fill('tab B'); await saved(b);
  await a.waitForFunction(() => document.getElementById('notes-count').textContent === '端末保存 2件');
  assert.equal((await payload(a)).notes.length,2); assert.equal(await a.locator('#notes-body').inputValue(),'tab A');
  await b.locator('#notes-list button').filter({hasText:'編集'}).last().click(); // oldest note A
  assert.equal(await b.locator('#notes-body').inputValue(),'tab A'); await b.locator('#notes-body').fill('tab B edits A'); await saved(b);
  await a.waitForFunction(() => !document.getElementById('notes-conflict').hidden); assert.equal(await a.locator('#notes-body').inputValue(),'tab A');
  await a.locator('#notes-close').click(); assert((await payload(a)).notes.some(n => n.body === 'tab B edits A'));
  await multi.close(); pass('real multi-tab ID merge and no silent editor replacement or stale close overwrite');

  const extra = await browser.newContext({ viewport:{width:700,height:900} });
  const e = await extra.newPage(); await start(e,url);
  await e.evaluate(() => { Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.keyboardCopy=text;}}}); });
  await e.locator('#notes-button').focus(); await e.keyboard.press('Enter');
  await e.keyboard.insertText('キーボードからの感想');
  await e.keyboard.press('Shift+Tab'); await e.keyboard.press('ArrowRight');
  assert.equal(await e.locator('input[name="note-kind"]:checked').inputValue(),'idea');
  await e.keyboard.press('Tab'); assert.equal(await e.evaluate(()=>document.activeElement.id),'notes-body');
  await e.keyboard.press('Tab'); assert.equal(await e.evaluate(()=>document.activeElement.id),'notes-attach');
  await e.keyboard.press('Space'); await saved(e); assert.equal((await payload(e)).notes[0].scene,null);
  for(let n=0;n<30 && await e.evaluate(()=>document.activeElement.id)!=='notes-save';n++) await e.keyboard.press('Tab');
  assert.equal(await e.evaluate(()=>document.activeElement.id),'notes-save'); await e.keyboard.press('Enter'); await e.keyboard.press('Tab'); await e.keyboard.press('Enter');
  assert((await e.evaluate(()=>keyboardCopy)).includes('キーボードからの感想'));
  await e.keyboard.press('Escape'); assert.equal(await e.evaluate(()=>document.activeElement.id),'notes-button');
  await open(e); await e.locator('#notes-new').click(); await e.locator('#notes-body').fill('  \n '); await e.locator('#notes-save').click();
  assert.equal((await payload(e)).notes.length,1); await e.locator('#notes-export-json').click();
  assert.equal(JSON.parse(await e.locator('#notes-rescue').inputValue()).notes.length,1);
  await e.locator('#notes-list button').click(); const originalScene=(await payload(e)).notes[0].scene;
  await e.locator('#notes-attach').check(); await saved(e); const sceneOn=(await payload(e)).notes[0].scene;
  assert(sceneOn && originalScene===null);
  await e.locator('#notes-close').click(); await e.evaluate(()=>{game.turn=3;render();}); await open(e);
  await e.locator('#notes-body').fill('場面を自動更新しない'); await saved(e); assert.deepEqual((await payload(e)).notes[0].scene,sceneOn);
  await e.locator('#notes-scene-update').click(); await saved(e); assert.equal((await payload(e)).notes[0].scene.turn,3);
  await e.locator('#notes-close').click();
  pass('keyboard-only input/kind/attachment/save/copy/close; empty draft exclusion; explicit scene refresh');

  // The same planned turn resolves with identical event sequence and pause requests while the dialog is open.
  // Use the real UI for one legal self-target command, then instrument only timing observations.
  await e.evaluate(() => { resetGame(); game.hand=[makeCardInstance('shield_lock')]; render(); });
  await e.locator('#hand .card').click();
  const selectedBefore = await gameFingerprint(e); await open(e); await e.locator('#notes-new').click(); await e.locator('#notes-body').fill('選択中の場面'); await saved(e);
  assert.equal((await payload(e)).notes[0].scene.preview.kind,'selection-before');
  await e.locator('#notes-close').click(); assert.equal(await gameFingerprint(e),selectedBefore);
  await e.locator('#battlefield .cell.valid').first().click();
  const prepared = await e.evaluate(()=>JSON.parse(JSON.stringify(game)));
  await e.evaluate(() => {
    window.requestedPauses=[];
    window.originalPause=pause;
    pause = async ms => { requestedPauses.push(ms); await originalPause(ms); };
    window.combatRun=executeTurn();
  });
  await e.evaluate(()=>combatRun);
  const baselineRun = await e.evaluate(()=>({state:JSON.parse(JSON.stringify(game)),pauses:requestedPauses}));
  await e.evaluate(prepared => { Object.assign(game,prepared); render(); window.requestedPauses=[]; window.combatRun=executeTurn(); },prepared);
  await open(e); await e.locator('#notes-new').click(); await e.locator('#notes-body').fill('解決中の場面を保持'); await e.locator('#notes-save').click();
  const captured=(await payload(e)).notes[0].scene; assert.equal(captured.preview.kind,'resolving');
  await e.evaluate(()=>combatRun); const duringRun = await e.evaluate(()=>({state:JSON.parse(JSON.stringify(game)),pauses:requestedPauses}));
  assert.deepEqual(duringRun,baselineRun); assert.deepEqual((await payload(e)).notes[0].scene,captured);
  await e.locator('#notes-close').click(); assert.equal(await e.evaluate(()=>game.turn),2);
  // Ended-state scene and the existing restart button preserve the notes namespace.
  await e.evaluate(()=>{ game.units.filter(unit=>unit.side==='enemy').forEach(unit=>{unit.hp=0;}); finishBattle('victory'); });
  await open(e); await e.locator('#notes-new').click(); await e.locator('#notes-body').fill('勝利後もメモ'); await saved(e); assert.equal((await payload(e)).notes[0].scene.phase,'ended');
  const endedNotes=await payload(e); await e.locator('#notes-close').click(); await e.locator('#modal-button').click(); assert.deepEqual(await payload(e),endedNotes);
  pass('selected-card scene/non-interference, uninterrupted real resolution with equal pause/event state, ended scene and restart retention');

  // Real popup behavior; intercept navigation before any request can reach GitHub.
  await extra.route('https://github.com/usouso/order-3/issues/new?*',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Test-only intercepted handoff</title>'}));
  await open(e); const popupPromise=extra.waitForEvent('page'); await e.locator('#notes-share').click(); const popup=await popupPromise;
  await popup.waitForURL('https://github.com/usouso/order-3/issues/new?*');
  assert.equal(await popup.evaluate(()=>window.opener),null); assert.equal(new URL(popup.url()).searchParams.get('body'),N.markdown((await payload(e)).notes[0]));
  await popup.close(); await extra.close(); pass('native popup with opener severed, fixed encoded destination intercepted without test Issue posting');
  assert.deepEqual(report.errors, []);
  fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));
  await context.close(); console.log('ORDER//3 browser notes tests passed');
}
main().catch(error => { console.error(error); fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({error:error.stack,report},null,2)); process.exitCode=1; }).finally(async()=>{ await browser?.close(); server.close(); });
