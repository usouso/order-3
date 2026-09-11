// Artificial boundary fixtures are recorded separately from ordinary UI play.
const { chromium } = require('C:/Users/nonus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname,'../outputs/order-3');
const evidence = path.resolve(__dirname,'act14a-browser');
fs.mkdirSync(evidence,{recursive:true});
const server = http.createServer((req,res)=>{
  const file = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!['index.html','styles.css','notes.css','game.js','notes-core.js','notes.js'].includes(file)) { res.writeHead(204); res.end(); return; }
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(root,file)));
});
const report = { fixtures:[], checks:[], errors:[] };
const pass = label=>{report.checks.push(label);console.log(`PASS ${label}`);};
let browser;
async function main() {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))report.errors.push(message.text());});
  await page.goto(url); await page.locator('#modal-button').click();
  for(const sample of [
    {name:'b1-lethal-trap',actor:'bastion',action:'shield_drive',actorHp:3,targetHp:11,expectedActor:0,expectedTarget:11,exposed:false,charge:0},
    {name:'b1-survives-trap',actor:'bastion',action:'shield_drive',actorHp:4,targetHp:11,expectedActor:1,expectedTarget:8,exposed:true,charge:0},
    {name:'b2-dead-target',actor:'cantor',action:'drain',actorHp:6,targetHp:0,expectedActor:6,expectedTarget:0,exposed:false,charge:0,cancelled:true},
    {name:'b2-target-killed-by-hit',actor:'cantor',action:'drain',actorHp:6,targetHp:1,expectedActor:7,expectedTarget:0,exposed:false,charge:1}
  ]) {
    const fixture = await page.evaluate(sample=>{
      resetGame();
      Object.assign(getUnit('rook'),{x:2,y:0,hp:sample.targetHp});
      Object.assign(getUnit(sample.actor),{hp:sample.actorHp,...(sample.actor==='bastion'?{x:0,y:0}:{})});
      game.emberRunes=sample.actor==='bastion'?[{x:1,y:0}]:[];
      const card=makeCardInstance('null_sigil');
      game.queue=[{instance:card,cardId:'null_sigil',mode:'technique',actorId:'iona',targetId:'iona',speed:'fast',label:'イオナ：無効印'}];
      game.intents=[intent(getUnit(sample.actor),sample.action,sample.action==='drain'?'生命吸収':'盾の圧力','normal',getUnit('rook'),'ACT 14a 人工境界fixture')];
      const before=JSON.stringify(game), forecast=predictTimeline(); render();
      return {before,afterForecast:JSON.stringify(game),forecast,version:GAME_VERSION};
    },sample);
    assert.equal(fixture.before,fixture.afterForecast); assert.equal(fixture.version,'ACT 14a');
    const forecast=fixture.forecast, enemy=forecast.snapshots.at(-1);
    const actor=enemy.state.units.find(unit=>unit.id===sample.actor),target=enemy.state.units.find(unit=>unit.id==='rook');
    assert.equal(actor.hp,sample.expectedActor); assert.equal(actor.charge,sample.charge);
    assert.equal(target.hp,sample.expectedTarget); assert.equal(target.exposed,sample.exposed);
    if(sample.cancelled) { assert.equal(enemy.outcome.status,'cancelled'); assert.equal(enemy.outcome.reason,'対象が戦闘不能'); }
    const name=sample.actor==='bastion'?'城壁兵':'詠唱師';
    const visibleActor=page.locator('#battlefield .unit-name').filter({hasText:name});
    assert.equal(await visibleActor.count(),sample.expectedActor>0?1:0);
    assert.equal(await page.locator('#battlefield .unit-name').filter({hasText:'ルーク'}).count(),sample.expectedTarget>0?1:0);
    await page.locator('#action-timeline .timeline-step').last().click();
    await page.screenshot({path:path.join(evidence,`${sample.name}-forecast.png`)});
    await page.locator('#execute-button').click();
    await page.waitForFunction(()=>game.phase==='planning' && game.turn===2);
    const executed=await page.evaluate(()=>({last:game.lastResolvedState,units:game.units,version:GAME_VERSION}));
    assert.deepEqual(executed.last,forecast.final);
    assert.equal(await visibleActor.count(),sample.expectedActor>0?1:0);
    assert.equal(await page.locator('#battlefield .unit-name').filter({hasText:'ルーク'}).count(),sample.expectedTarget>0?1:0);
    assert.equal(executed.units.find(unit=>unit.id===sample.actor).charge,0);
    await page.screenshot({path:path.join(evidence,`${sample.name}-executed.png`)});
    report.fixtures.push({type:'artificial fixture',sample,forecastActor:actor,forecastTarget:target,outcome:enemy.outcome,executed:executed.last});
  }
  pass('four artificial boundary fixtures: forecast equals normal execution; HP0 units absent before/after execution');

  // One ordinary opening turn, without injecting HP, positions, hand or enemy intents.
  await page.reload(); await page.locator('#modal-button').click();
  await page.locator('#hand .card').first().click(); await page.locator('#move-mode').click();
  await page.locator('#battlefield .cell.valid').first().click();
  await page.locator('#battlefield .cell.valid').first().click();
  const ordinary=await page.evaluate(()=>({startTurn:game.turn,queue:game.queue,forecast:predictTimeline().final,intents:game.intents}));
  assert.equal(ordinary.queue.length,1); assert.equal(ordinary.queue[0].mode,'move');
  await page.locator('#execute-button').click(); await page.waitForFunction(()=>game.phase==='planning' && game.turn===2);
  assert.deepEqual(await page.evaluate(()=>game.lastResolvedState),ordinary.forecast);
  await page.screenshot({path:path.join(evidence,'ordinary-turn-2.png')});
  report.ordinaryPlay={description:'one ordinary UI-controlled opening turn, universal movement',...ordinary};
  pass('ordinary UI-only opening turn advances to TURN 02 with the predicted result');

  // Version-related notes integration only; do not rerun unrelated ACT 13 fault suites.
  await page.evaluate(()=>{
    const timestamp='2026-09-11T12:00:00.000Z';
    const old={id:'act13-preserved',kind:'idea',body:'ACT 13で記録したメモ',createdAt:timestamp,updatedAt:timestamp,
      scene:{...capturePlaytestScene(),gameVersion:'ACT 13'},share:{state:'local-only',handoffOpenedAt:null,externalUrl:null}};
    localStorage.setItem(Order3Notes.KEY,JSON.stringify({schemaVersion:1,activeNoteId:old.id,notes:[old]}));
  });
  await page.reload(); await page.locator('#modal-button').click();
  const gameBeforeNotes=await page.evaluate(()=>JSON.stringify(game));
  await page.locator('#notes-button').click();
  assert.equal(await page.locator('#notes-body').inputValue(),'ACT 13で記録したメモ');
  assert((await page.locator('#notes-scene').innerText()).includes('ACT 13'));
  await page.locator('#notes-body').fill('ACT 13で記録したメモを本文だけ編集'); await page.locator('#notes-save').click();
  let notes=await page.evaluate(()=>JSON.parse(localStorage.getItem(Order3Notes.KEY)).notes);
  assert.equal(notes[0].scene.gameVersion,'ACT 13'); assert.equal(notes[0].id,'act13-preserved');
  await page.locator('#notes-new').click(); await page.locator('#notes-body').fill('ACT 14aの新しい場面'); await page.locator('#notes-save').click();
  notes=await page.evaluate(()=>JSON.parse(localStorage.getItem(Order3Notes.KEY)).notes);
  assert.equal(notes.length,2); assert.equal(notes.find(note=>note.id!=='act13-preserved').scene.gameVersion,'ACT 14a');
  assert.equal(notes.find(note=>note.id==='act13-preserved').scene.gameVersion,'ACT 13');
  await page.locator('#notes-list button').last().click();
  await page.locator('#notes-scene-update').click(); await page.locator('#notes-save').click();
  notes=await page.evaluate(()=>JSON.parse(localStorage.getItem(Order3Notes.KEY)).notes);
  const refreshed=notes.find(note=>note.id==='act13-preserved');
  assert.equal(refreshed.scene.gameVersion,'ACT 14a'); assert.equal(refreshed.createdAt,'2026-09-11T12:00:00.000Z');
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testCopy=text;}}});
    window.open=()=>({opener:null,location:{replace(url){window.testShare=url;}}});
  });
  await page.locator('#notes-copy').click(); await page.locator('#notes-share').click();
  const shared=await page.evaluate(()=>({copy:window.testCopy,url:window.testShare}));
  assert(shared.copy.includes('ゲーム版: ACT 14a')); assert.equal(new URL(shared.url).searchParams.get('body'),shared.copy);
  await page.locator('#notes-close').click(); assert.equal(await page.evaluate(()=>JSON.stringify(game)),gameBeforeNotes);
  await page.reload(); await page.locator('#modal-button').click(); await page.locator('#notes-button').click();
  assert((await page.locator('#notes-scene').innerText()).includes('ACT 14a'));
  report.notes={oldSnapshotPreservedOnEdit:true,newSnapshotVersion:'ACT 14a',explicitRefreshKeepsId:true,copyMatchesShare:true,reload:true};
  pass('notes: old scene preserved, new/refreshed scene ACT 14a, copy/share/reload and no combat mutation');
  assert.deepEqual(report.errors,[]); report.status='PASS'; await context.close();
  console.log('ORDER//3 ACT 14a browser tests passed');
}
main().catch(error=>{report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));
  await browser?.close(); server.close();
});
