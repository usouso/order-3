// ACT13-QA-01 regression. Its server, contexts and evidence are separate from independent QA.
const { chromium } = require('C:/Users/nonus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const N = require('../outputs/order-3/notes-core.js');
const root = path.resolve(__dirname,'../outputs/order-3');
const out = path.resolve(__dirname,'act13-fix-browser');
fs.mkdirSync(out,{recursive:true});
const report = { checks:[], errors:[], cases:[] };
const server = http.createServer((req,res)=>{
  const file = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!['index.html','styles.css','notes.css','game.js','notes.js','notes-core.js'].includes(file)) { res.writeHead(204); res.end(); return; }
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(root,file)));
});
let browser, url;
const pass = text => { report.checks.push(text); console.log(`PASS ${text}`); };
const raw = page => page.evaluate(key=>localStorage.getItem(key),N.KEY);
const read = async page => JSON.parse(await raw(page));
const note = async (page,id) => (await read(page)).notes.find(n=>n.id===id);
const saved = page => page.waitForFunction(()=>document.getElementById('notes-save-status').textContent==='この端末に下書き保存済み');
async function start(page) { await page.goto(url); await page.locator('#modal-button').click(); await page.locator('#notes-button').click(); }
async function reload(page) { await page.reload(); await page.locator('#modal-button').click(); await page.locator('#notes-button').click(); }
const visible = page => page.evaluate(()=>({body:document.getElementById('notes-body').value,kind:document.querySelector('[name="note-kind"]:checked').value,attached:document.getElementById('notes-attach').checked,scene:document.getElementById('notes-scene').textContent}));
async function hooks(page) {
  await page.evaluate(()=>{
    window.handoffs=[]; window.copies=[];
    window.nativeOpen=window.open;
    window.open=(initial,target)=>{const item={initial,target}; handoffs.push(item); return {set opener(value){item.opener=value;},location:{replace(value){item.url=value; if(window.afterPopupNavigate) afterPopupNavigate();}}};};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copies.push(text);}}});
  });
}
async function clickShare(page) { await page.locator('#notes-share').click(); }
async function main() {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); url=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:700,height:900}});
  context.on('page',page=>{page.on('pageerror',error=>report.errors.push(error.message));});
  const a=await context.newPage(); await start(a); await hooks(a);
  await a.locator('#notes-body').fill('元の本文 A 🧭'); await saved(a);
  const original=(await read(a)).notes[0], id=original.id, visibleA=await visible(a);
  const b=await context.newPage(); await start(b); await hooks(b);
  await b.locator('#notes-body').fill('別タブで追記した新しい本文 B'); await b.locator('input[value="bug"]').check();
  await b.evaluate(()=>{game.turn=4;}); await b.locator('#notes-scene-update').click(); await saved(b);
  const newest=await note(b,id); assert.equal(newest.scene.turn,4); assert.equal(newest.kind,'bug');
  await a.locator('#notes-conflict').waitFor({state:'visible'});
  for(let count=0;count<3;count++) {
    const before=await raw(a); await clickShare(a);
    assert.equal(await raw(a),before,'blocked share is read-only');
    assert.deepEqual(await visible(a),visibleA,'stale editor is not silently replaced');
    assert.equal(await a.evaluate(()=>handoffs.length),0);
    assert((await a.locator('#notes-share-status').innerText()).includes('共有画面は開いていません'));
  }
  await a.screenshot({path:path.join(out,'stale-share-blocked.png')});
  report.cases.push({name:'stale repeated share',original,expected:newest,actual:await note(a,id),visible:await visible(a)});
  await reload(a); await reload(b); assert.deepEqual(await note(a,id),newest); assert.deepEqual(await note(b,id),newest);
  for(const page of [a,b]) { const fields=await visible(page); assert.equal(fields.body,newest.body); assert.equal(fields.kind,newest.kind); assert(fields.scene.includes('TURN: 04')); }
  pass('A/B same-ID body, kind and scene changes survive three stale share clicks and both tab reloads');

  // A delayed/missing storage event cannot bypass the share-time comparison.
  const delayed=await context.newPage();
  await delayed.addInitScript(()=>window.addEventListener('storage',event=>event.stopImmediatePropagation(),true));
  await start(delayed); await hooks(delayed); const delayedVisible=await visible(delayed);
  await b.locator('#notes-body').fill('C: storageイベント未到達でも保存を守る'); await b.locator('input[value="idea"]').check(); await b.locator('#notes-attach').uncheck(); await saved(b);
  const revisionC=await note(b,id);
  await clickShare(delayed); assert.equal(await delayed.evaluate(()=>handoffs.length),0); assert.deepEqual(await visible(delayed),delayedVisible); assert.deepEqual(await note(delayed,id),revisionC);
  // Explicit list Edit accepts the latest content. Repeat handoffs must not change its content timestamp.
  await delayed.locator('#notes-list button').click(); assert.equal((await visible(delayed)).body,revisionC.body);
  for(let count=0;count<2;count++) {
    await clickShare(delayed); const handed=await note(delayed,id), sent=await delayed.evaluate(()=>handoffs.at(-1));
    assert(N.sameContent(handed,revisionC)); assert.equal(handed.updatedAt,revisionC.updatedAt); assert.equal(handed.createdAt,original.createdAt);
    assert.equal(new URL(sent.url).searchParams.get('body'),N.markdown(revisionC)); assert.equal(sent.opener,null);
  }
  await reload(delayed); await reload(b); assert(N.sameContent(await note(b,id),revisionC)); assert.equal((await note(b,id)).share.state,'handoff-opened');
  pass('preflight reads storage without events; explicit Edit resolves conflict; repeated normal handoffs preserve content timestamps');

  // Normal pending input is an intentional content change; share flushes it once and sends exactly what is visible.
  await hooks(b); await b.locator('#notes-body').fill('D: 保存待ちの入力をそのまま共有 🧭');
  await b.locator('input[value="impression"]').check(); await b.locator('#notes-attach').check();
  await clickShare(b); const revisionD=await note(b,id), sentD=await b.evaluate(()=>handoffs.at(-1));
  assert.equal(revisionD.body,(await visible(b)).body); assert.equal(revisionD.kind,'impression'); assert(revisionD.scene);
  assert.equal(new URL(sentD.url).searchParams.get('body'),N.markdown(revisionD));
  const durableAfterD=await raw(b); await b.evaluate(()=>{window.open=()=>null;}); await clickShare(b);
  assert.equal(await raw(b),durableAfterD,'popup failure cannot update metadata or content');
  assert((await b.locator('#notes-share-status').innerText()).includes('開けません'));
  await b.locator('#notes-body').fill('E: popupが失敗しても手で編集した本文を保存'); await clickShare(b);
  assert.equal((await note(b,id)).body,'E: popupが失敗しても手で編集した本文を保存');
  assert.deepEqual((await note(b,id)).share,revisionD.share);
  pass('pending intentional edits share the visible body/kind/scene; popup failure never creates handoff metadata');

  // Deterministic interleaving: another write lands after URL creation but before metadata recording.
  await reload(a); await hooks(a); const beforeOpen=await note(a,id), visibleBeforeOpen=await visible(a);
  await a.evaluate(key=>{
    window.afterPopupNavigate=()=>{
      const payload=JSON.parse(localStorage.getItem(key)), old=payload.notes[0];
      const changed={...old,body:'F: popup中に別の保存が先行',kind:'bug',scene:null,updatedAt:new Date(Date.parse(old.updatedAt)+1000).toISOString(),share:{state:'local-only',handoffOpenedAt:null,externalUrl:null}};
      payload.notes[0]=changed; localStorage.setItem(key,JSON.stringify(payload)); window.afterPopupNavigate=null;
    };
  },N.KEY);
  await clickShare(a); const revisionF=await note(a,id), sentBeforeF=await a.evaluate(()=>handoffs.at(-1));
  assert.equal(revisionF.body,'F: popup中に別の保存が先行'); assert.equal(revisionF.kind,'bug'); assert.equal(revisionF.scene,null); assert.equal(revisionF.share.state,'local-only');
  assert.equal(new URL(sentBeforeF.url).searchParams.get('body'),N.markdown(beforeOpen)); assert.deepEqual(await visible(a),visibleBeforeOpen);
  assert((await a.locator('#notes-share-status').innerText()).includes('クリック時の入力内容'));
  const beforeRetry=await raw(a); await clickShare(a); assert.equal(await raw(a),beforeRetry); assert.equal(await a.evaluate(()=>handoffs.length),1);
  await reload(a); await reload(b); assert(N.sameContent(await note(a,id),revisionF)); assert(N.sameContent(await note(b,id),revisionF));
  pass('update between popup navigation and metadata write keeps the new revision and explains which text was handed off');

  // A genuine edit after a handoff also wins over older metadata arriving later.
  await hooks(a); await clickShare(a); const handedF=await note(a,id);
  await b.locator('#notes-body').fill('G: 共有が済んだ後の別タブ編集'); await b.locator('input[value="idea"]').check(); await saved(b);
  const revisionG=await note(b,id);
  await a.evaluate(({key,old})=>window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify({schemaVersion:1,notes:[old]})})),{key:N.KEY,old:handedF});
  assert(N.sameContent(await note(a,id),revisionG)); await clickShare(a); assert(N.sameContent(await note(a,id),revisionG));
  await reload(a); await reload(b); assert.equal((await visible(a)).body,revisionG.body); assert.equal((await visible(b)).body,revisionG.body);
  pass('a real other-tab edit after sharing survives delayed old metadata and a later stale click');

  // Long bodies use the same immutable clicked snapshot for title-only handoff and complete rescue.
  await hooks(a); const longBody='長い本文 🧭 & #\n'.repeat(1000);
  await a.locator('#notes-body').fill(longBody); await clickShare(a); const longRevision=await note(a,id), sentLong=await a.evaluate(()=>handoffs.at(-1));
  assert.deepEqual([...new URL(sentLong.url).searchParams.keys()],['title']); assert.equal(await a.evaluate(()=>copies.at(-1)),N.markdown(longRevision));
  await reload(b); await b.locator('#notes-body').fill('長文の後にBで更新'); await b.locator('input[value="bug"]').check(); await b.locator('#notes-attach').check(); await saved(b);
  const afterLong=await note(b,id); const copyCount=await a.evaluate(()=>copies.length); await clickShare(a);
  assert(N.sameContent(await note(a,id),afterLong)); assert.equal(await a.evaluate(()=>handoffs.length),1); assert.equal(await a.evaluate(()=>copies.length),copyCount);
  pass('long title-only sharing retains the full snapshot; a stale long editor is blocked without copying or overwriting');

  // Quota, unknown format and corruption still allow explicit text rescue without destructive writes.
  await reload(a); await hooks(a);
  await a.locator('#notes-new').click();
  await a.evaluate(()=>{window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};navigator.clipboard.writeText=async()=>{throw new Error('clipboard denied');};});
  const stableRaw=await raw(a); await a.locator('#notes-body').fill(longBody+'未保存'); await clickShare(a);
  assert.equal(await raw(a),stableRaw); assert(await a.locator('#notes-error').isVisible());
  assert((await a.locator('#notes-rescue').inputValue()).includes(longBody+'未保存'));
  await a.keyboard.press('Escape'); assert(await a.locator('#notes-close-choice').isVisible());
  await a.locator('#notes-close-back').click();
  await a.evaluate(()=>{Storage.prototype.setItem=window.savedSetItem;}); await a.locator('#notes-save').click(); await saved(a);
  const recovered=(await read(a)).notes.find(n=>n.body===longBody+'未保存'); assert(recovered); assert.equal(recovered.share.state,'handoff-opened');
  for(const invalid of ['{broken',JSON.stringify({schemaVersion:99,notes:[]})]) {
    await a.evaluate(({key,value})=>localStorage.setItem(key,value),{key:N.KEY,value:invalid}); await clickShare(a);
    assert.equal(await raw(a),invalid); assert(await a.locator('#notes-error').isVisible()); assert.equal(await a.locator('#notes-body').inputValue(),longBody+'未保存');
  }
  pass('quota/clipboard failure keeps unsaved long text and close protection; corrupt/unknown payloads remain untouched on sharing');
  await context.close();
  assert.deepEqual(report.errors,[]); report.status='PASS';
  console.log('ORDER//3 stale-share regressions passed');
}
main().catch(error=>{report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(out,'share-regression-report.json'),JSON.stringify(report,null,2));
  await browser?.close(); server.close();
});
