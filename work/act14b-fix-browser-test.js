// ACT14B-QA-01 regression. End states are explicit fixtures; subsequent navigation uses real UI.
const {chromium}=require('C:/Users/nonus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const baseline={
  "outsideModalHash": "95298f5d457f0d4d59c85de440a9bfee8a108ee17869347bcd9a370f75a41979",
  "helpMarkupHash": "3d27c44799bea31127bf10f23e5c0c0c1830a14c0b3bb189d3f41f88ab4de31c",
  "files": {
    "index.html": "a1cb019830795aa8b613150565ae59cba1c68a40e8c1f16f2bb0ccbb6f2bd26d",
    "styles.css": "7aaa6ce640992950f7863ccf555d216730a01578e889628880459f433b23e6af",
    "notes.css": "3fad64b380e75fd11aad1d5613fd3a5857d29bf17d325bbb836af780b1040832",
    "notes.js": "c512f3548e90a9b7b60983c3ae8560c87d0b73548f2dc82a921d7e079e552ffe",
    "notes-core.js": "e2b5f657d2a8aed3825d65ce9a7c39a3b91059f6934e3064f3753eacab700336",
    "README.md": "302c4a5f39b602caec52aa4daa485144abca441b2f155029ac64b79f3d5209d0",
    "DESIGN.md": "b6a49c1b3793459db7e31a5ce0d342679d021874d05b168d1181dd1a02b04c7f"
  }
};

const root=path.resolve(__dirname,'../outputs/order-3'),evidence=path.resolve(__dirname,'act14b-fix-browser');
fs.mkdirSync(evidence,{recursive:true});
const reproduction=process.argv.includes('--reproduce');
const product=fs.readFileSync(path.join(root,'game.js'),'utf8');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const outside=product.slice(0,product.indexOf('let modalReturnFocus = null;'))+'\n'+product.slice(product.indexOf('// Display-only, detached summaries'));
assert.equal(sha(outside),baseline.outsideModalHash,'all source outside modal control is unchanged');
const helpMarkup=product.slice(product.indexOf('  showModal("命令の組み方", `'),product.indexOf('  `, "戦場へ戻る", "close");')+'  `, "戦場へ戻る", "close");'.length);
assert.equal(sha(helpMarkup),baseline.helpMarkupHash,'Help text and markup unchanged');
for(const[file,hash]of Object.entries(baseline.files))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,file+' unchanged');
const report={checks:['source outside modal block, Help content and 7 product files byte-identical'],cases:[],errors:[],mode:reproduction?'before fix reproduction':'regression'};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const server=http.createServer((req,res)=>{
  const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!['index.html','styles.css','notes.css','game.js','notes-core.js','notes.js'].includes(file)){res.writeHead(204);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,file)));
});
let browser;
const state=page=>page.evaluate(()=>({title:el.modalTitle.textContent,body:el.modalBody.innerHTML,button:el.modalButton.textContent,action:el.modal.dataset.action??null,help:el.modal.dataset.help??null,hidden:el.modal.hidden,game:JSON.stringify(game),random:window.randomCalls,focus:document.activeElement.id,phase:game.phase,turn:game.turn}));
const battle=page=>page.evaluate(()=>({game:JSON.stringify(game),random:window.randomCalls}));
async function endFixture(page,result){
  await page.evaluate(result=>{game.units.filter(u=>u.side===(result==='victory'?'enemy':'player')).forEach(u=>u.hp=0);finishBattle(result);},result);
}
async function openViaKeyboard(page){
  await page.locator('#modal-button').focus();const path=[];
  for(let i=0;i<10;i++){await page.keyboard.press('Tab');path.push(await page.evaluate(()=>document.activeElement.id||document.activeElement.tagName));if(path.at(-1)==='help-button')break;}
  assert.equal(path.at(-1),'help-button','keyboard path to Help: '+JSON.stringify(path));
  await page.keyboard.press('Enter');assert.equal(await page.locator('#modal-title').innerText(),'命令の組み方');return path;
}
async function readDrain(page){
  for(const selector of ['.technique-index','[data-disclosure="index-drain"]']){
    if(!await page.locator(selector).evaluate(el=>el.open)){await page.locator(selector+' > summary').focus();await page.keyboard.press('Enter');}
  }
  assert((await page.locator('[data-disclosure="index-drain"]').innerText()).includes('実回復分の帯電'));
}
async function closeHelp(page,method){if(method==='Escape')await page.keyboard.press('Escape');else await page.locator('#modal-button').click();}
function restored(before,after,label){
  for(const key of ['title','body','button','action','hidden','game','random'])assert.deepEqual(after[key],before[key],label+' '+key);
  assert.equal(after.focus,'modal-button',label+' start/restart focus');
}
async function main(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.addInitScript(()=>{window.randomCalls=0;const random=Math.random;Math.random=()=>{window.randomCalls++;return random();};});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(['error','warning'].includes(m.type()))report.errors.push(m.text());});
  await page.goto(url);await page.locator('#modal-button').click();
  for(const result of ['victory','defeat'])for(const method of ['Escape','button']){
    await page.reload();await page.locator('#modal-button').click();await endFixture(page,result);const before=await state(page);
    const focusPath=await openViaKeyboard(page);await readDrain(page);await closeHelp(page,method);const after=await state(page);
    report.cases.push({name:result+' / '+method,before,after,focusPath});
    await page.screenshot({path:path.join(evidence,`${reproduction?'before-':'after-'}${result}-${method}.png`)});
    restored(before,after,result+' / '+method);
    await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>({turn:game.turn,phase:game.phase,hidden:el.modal.hidden,queue:game.queue.length})),{turn:1,phase:'planning',hidden:true,queue:0});
    pass(result+' '+method+' restores result and keyboard restart');
    if(reproduction)return;
  }
  for(const method of ['Escape','button']){
    await page.reload();const before=await state(page);await openViaKeyboard(page);await readDrain(page);await closeHelp(page,method);const after=await state(page);
    restored(before,after,'initial / '+method);
    await page.keyboard.press('Enter');assert(await page.locator('#modal').isHidden());assert.deepEqual(await battle(page),{game:before.game,random:before.random},'initial start only closes briefing');
  }
  pass('initial Help returns to unchanged briefing and explicit start');
  await page.reload();await page.locator('#modal-button').click();await page.locator('#hand .card').first().click();await page.locator('#move-mode').click();
  const planning=await battle(page);
  for(const method of ['Escape','button']){
    await page.locator('#help-button').click();await readDrain(page);
    const opened=await state(page);await page.evaluate(()=>{showHelp();showHelp();});assert.equal((await state(page)).body,opened.body);
    await closeHelp(page,method);assert(await page.locator('#modal').isHidden());assert.deepEqual(await battle(page),planning);assert.equal((await state(page)).focus,'help-button');
  }
  pass('ordinary planning, repeated/double Help, selected ALT and random unchanged');
  await page.reload();await page.locator('#modal-button').click();await endFixture(page,'victory');
  const victory=await state(page);
  for(let i=0;i<3;i++){
    await openViaKeyboard(page);await readDrain(page);await page.evaluate(()=>{showHelp();showHelp();});
    await page.locator('#notes-button').click();await page.locator('#notes-body').fill('Help復帰のメモ '+i);await page.locator('#notes-save').click();
    await page.keyboard.press('Escape');assert.equal(await page.locator('#notes-dialog').evaluate(el=>el.open),false);assert.equal((await state(page)).focus,'notes-button');
    assert.equal((await state(page)).title,'命令の組み方');
    await page.keyboard.press('Tab');assert(await page.locator('#modal').evaluate(el=>el.contains(document.activeElement)));
    await closeHelp(page,i%2?'button':'Escape');restored(victory,await state(page),'repeated result Help/notes '+i);
  }
  await page.keyboard.press('Enter');assert.equal((await state(page)).phase,'planning');
  await page.locator('#notes-button').click();assert.equal(await page.locator('#notes-body').inputValue(),'Help復帰のメモ 2');await page.keyboard.press('Escape');
  pass('result repeated/double Help, notes overlay/focus and saved-note retention after restart');
  await page.reload();await page.locator('#modal-button').click();
  await page.locator('#hand .card').first().click();await page.locator('#move-mode').click();await page.locator('#battlefield .cell.valid').first().click();await page.locator('#battlefield .cell.valid').first().click();
  const forecast=await page.evaluate(()=>predictTimeline().final);await page.locator('#execute-button').click();await page.locator('#help-button').click();await readDrain(page);
  await page.waitForFunction(()=>game.phase==='planning'&&game.turn===2);assert.deepEqual(await page.evaluate(()=>game.lastResolvedState),forecast);assert.equal((await state(page)).title,'命令の組み方');
  const resolved=await battle(page);await page.keyboard.press('Escape');assert(await page.locator('#modal').isHidden());assert.deepEqual(await battle(page),resolved);
  pass('ordinary UI turn resolves under Help; close keeps turn 2 and matches prediction');
  for(const result of ['victory','defeat'])for(const notes of [false,true]){
    await page.reload();await page.locator('#modal-button').click();
    await page.evaluate(result=>{
      resetGame();game.intents=[];game.queue=[];
      if(result==='victory'){
        Object.assign(getUnit('vale'),{x:0,y:0});Object.assign(getUnit('pursuer'),{x:1,y:0,hp:1});getUnit('bastion').hp=0;getUnit('cantor').hp=0;
        const instance=makeCardInstance('quickshot');game.queue=[{instance,cardId:'quickshot',actorId:'vale',targetId:'pursuer',mode:'technique',speed:'fast',label:'ヴェイル：速射'}];
      }else{
        getUnit('vale').hp=0;getUnit('iona').hp=0;getUnit('rook').hp=1;
        const instance=makeCardInstance('quickshot');game.queue=[{instance,cardId:'quickshot',actorId:'rook',target:{x:0,y:4},mode:'move',speed:'fast',label:'ルーク：移動'}];
        game.intents=[intent(getUnit('cantor'),'drain','生命吸収','normal',getUnit('rook'),effectCatalog.drain.short)];
      }render();
    },result);
    const forecast=await page.evaluate(()=>predictTimeline().final);
    await page.locator('#help-button').click();await readDrain(page);
    if(notes){await page.locator('#notes-button').click();await page.locator('#notes-body').fill('終局を待つメモ');await page.locator('#notes-save').click();}
    await page.evaluate(()=>{window.pendingExecution=executeTurn();});
    await page.waitForFunction(()=>game.phase==='ended');await page.evaluate(()=>window.pendingExecution);
    assert.deepEqual(await page.evaluate(()=>game.lastResolvedState),forecast);
    const latest=await state(page);assert.equal(latest.action,'restart');assert.equal(latest.hidden,false);assert.equal(latest.title,result==='victory'?'演習完了。':'部隊壊滅。');
    if(notes){assert(await page.locator('#notes-dialog').evaluate(el=>el.open));assert(await page.locator('#notes-dialog').evaluate(el=>el.contains(document.activeElement)));await page.keyboard.press('Escape');}
    const endBattle=await battle(page);await page.keyboard.press('Escape');assert.equal((await state(page)).title,latest.title);assert.equal((await state(page)).hidden,false);assert.deepEqual(await battle(page),endBattle);
    await openViaKeyboard(page);await readDrain(page);await closeHelp(page,notes?'button':'Escape');
    const after=await state(page);assert.equal(after.title,latest.title);assert.equal(after.action,'restart');assert.deepEqual(await battle(page),endBattle);
    report.cases.push({name:result+' arrives while Help'+(notes?' and notes':''),latest,after});
    await page.screenshot({path:path.join(evidence,`latest-${result}-${notes?'notes':'help'}.png`)});
    await page.keyboard.press('Enter');assert.equal((await state(page)).phase,'planning');assert.equal((await state(page)).turn,1);
    pass(result+' arrives during Help'+(notes?' + notes':'')+': latest result retained, restart explicit');
  }
  await page.reload();await page.locator('#modal-button').click();await endFixture(page,'victory');await openViaKeyboard(page);
  await page.evaluate(()=>finishBattle('defeat'));assert.equal((await state(page)).title,'部隊壊滅。');await openViaKeyboard(page);await closeHelp(page,'Escape');assert.equal((await state(page)).title,'部隊壊滅。');assert.equal((await state(page)).action,'restart');
  pass('new result invalidates saved older result');
  assert.deepEqual(report.errors,[]);report.status='PASS';await context.close();
}
main().catch(error=>{report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(evidence,reproduction?'before-fix.json':'report.json'),JSON.stringify(report,null,2));await browser?.close();server.close();});
