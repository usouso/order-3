// ACT 14b real Chromium DOM / keyboard / touch verification. Artificial fixtures are labelled.
const {chromium}=require('C:/Users/nonus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const root=path.resolve(__dirname,'../outputs/order-3'), evidence=path.resolve(__dirname,'act14b-browser');
fs.mkdirSync(evidence,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!['index.html','styles.css','notes.css','game.js','notes-core.js','notes.js'].includes(file)){res.writeHead(204);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,file)));
});
const report={checks:[],layouts:[],catalog:[],errors:[],limits:['Physical 200% browser zoom untested','Actual screen-reader speech untested','Headless Chromium, not Safari/iOS','No human full play or real GitHub submission']};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
let browser;
const fingerprint=page=>page.evaluate(()=>JSON.stringify({game,randomCalls:window.randomCalls}));
const combatFingerprint=page=>page.evaluate(()=>JSON.stringify({units:game.units,queue:game.queue,intents:game.intents,hostileRunes:game.hostileRunes,emberRunes:game.emberRunes,randomCalls:window.randomCalls}));
async function openDisclosure(page,selector,key='Enter'){
  if(await page.locator(selector).evaluate(el=>el.open))return;
  const summary=page.locator(selector+' > summary');await summary.scrollIntoViewIfNeeded();await summary.focus();await summary.press(key);
  assert(await page.locator(selector).evaluate(el=>el.open),selector+' opened');
}
async function geometry(page,label){
  await page.evaluate(()=>window.scrollTo(0,0));
  const dimensions=await page.evaluate(()=>{
    const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,board:box('#battlefield'),timeline:box('#action-timeline'),hand:box('#hand'),card:box('#hand .card'),heading:getComputedStyle(document.querySelector('.execution-flow')).fontSize};
  });
  report.layouts.push({label,...dimensions});assert(dimensions.scrollWidth<=dimensions.width,label+' page overflow');assert.equal(dimensions.heading,'18px');
  if(dimensions.width===700)assert.equal(dimensions.card.width,155);
  if(dimensions.width===320)assert.equal(await page.locator('#hand').evaluate(el=>getComputedStyle(el).display),'grid');
  if(label.includes('closed')&&dimensions.width>=700)assert(dimensions.card.y<dimensions.height,label+' hand card top remains visible');
  if(dimensions.width===1280){const steps=await page.locator('.timeline-step').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().right));assert(steps.every(right=>right<=dimensions.timeline.right+1),'all six events fit');}
  return dimensions;
}
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:720},hasTouch:true});
  await context.addInitScript(()=>{window.randomCalls=0;const random=Math.random;Math.random=()=>{window.randomCalls++;return random();};});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))report.errors.push(m.text());});
  await page.goto(url);await page.locator('#modal-button').click();
  const catalog=await page.evaluate(()=>Object.entries(effectCatalog).filter(([,value])=>value.group!=='common').map(([id,value])=>({id,...value})));
  assert.equal(catalog.length,24);
  for(const width of [1280,700,320]){
    await page.setViewportSize({width,height:width===1280?720:900});await page.reload();await page.locator('#modal-button').click();
    await geometry(page,`${width} ordinary closed`);await page.screenshot({path:path.join(evidence,`${width}-ordinary-closed.png`),fullPage:true});
    const initial=await fingerprint(page);
    await page.locator('.intent-reference > summary').focus();await page.locator('.intent-reference > summary').press('Enter');
    await openDisclosure(page,'#intent-list [data-effect-id="stalk"]');
    assert((await page.locator('#intent-list [data-effect-id="stalk"]').innerText()).includes('予告時に距離が最短'));
    assert.equal(await fingerprint(page),initial,'queue zero enemy reference has no state/random effect');
    await page.locator('.intent-reference > summary').press('Space');
    await page.locator('#help-button').click();await openDisclosure(page,'.technique-index');
    for(const info of (width===1280?catalog:catalog.filter(x=>['drain','arc_spark','pommel_break','legacy_vale','ember_rune'].includes(x.id)))){
      const selector=`[data-disclosure="index-${info.id}"]`;
      const before=await fingerprint(page);await openDisclosure(page,selector,info.id.length%2?'Space':'Enter');
      const text=await page.locator(selector).innerText();assert(text.includes(info.short));for(const paragraph of info.detail)assert(text.includes(paragraph),info.id+' full paragraph');
      const paragraphs=await page.locator(selector+' > .effect-rules > p').evaluateAll(nodes=>nodes.map(n=>({font:parseFloat(getComputedStyle(n).fontSize),line:parseFloat(getComputedStyle(n).lineHeight),width:n.clientWidth,scroll:n.scrollWidth})));
      assert(paragraphs.every(p=>p.font>=11 && p.line>=p.font*1.5 && p.scroll<=p.width+1),info.id+' readable wrapping');
      assert.equal(await fingerprint(page),before,info.id+' disclosure non-interference');
      if(info.id==='drain'){
        for(const summary of await page.locator(selector+' > .effect-rules > .related-rules > .rule-detail > summary').all())await summary.click();
        assert((await page.locator(selector).innerText()).includes('未消費でもターン末で0'));
        await page.screenshot({path:path.join(evidence,`${width}-drain-help.png`)});
      }
      const close=await page.locator('#modal-button').boundingBox();assert(close.y>=0 && close.y+close.height<=(width===1280?720:900),'help close remains visible');
      await page.locator(selector+' > summary').focus();await page.locator(selector+' > summary').press('Enter');
      if(width===1280)report.catalog.push({id:info.id,fullExplanationRead:true,keyboard:true,wrapping:paragraphs});
    }
    await page.locator('#modal-button').focus();await page.keyboard.press('Tab');assert(await page.locator('#modal').evaluate(el=>el.contains(document.activeElement)),'Tab stays in help');
    await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#modal-button').evaluate(el=>el===document.activeElement),true,'reverse Tab returns to close');
    await page.keyboard.press('Escape');assert(await page.locator('#modal').isHidden());assert.equal(await page.locator('#help-button').evaluate(el=>el===document.activeElement),true);
    assert.equal(await fingerprint(page),initial,'whole help visit leaves game and random unchanged');
    // Artificial six-event worst-text fixture: all three long player cards, turn-three enemy intents.
    await page.evaluate(()=>{
      resetGame();game.turn=3;game.intents=buildEnemyIntents();game.queue=['shield_lock','pommel_break','arc_spark'].map(id=>({instance:makeCardInstance(id),cardId:id,mode:'technique',actorId:cardDefs[id].ownerId,targetId:id==='shield_lock'?'rook':'pursuer',speed:cardDefs[id].speed,label:cardDefs[id].name}));game.selectedInstanceId=null;game.previewIndex=null;render();
    });
    await geometry(page,`${width} six-event closed`);await page.screenshot({path:path.join(evidence,`${width}-six-events-closed.png`),fullPage:true});
    const drain=page.locator('.timeline-step').filter({has:page.locator('.timeline-action', {hasText:'生命吸収'})});
    const aria=await drain.getAttribute('aria-label'),visible=await drain.innerText();assert(aria.includes('実回復分の帯電')&&visible.includes('実回復分の帯電'));assert(visible.includes('合計上限2'));
    const before=await combatFingerprint(page);await drain.focus();await page.keyboard.press('Enter');assert.equal(await combatFingerprint(page),before);
    await openDisclosure(page,'#timeline-detail-panel [data-disclosure="timeline-drain"]');
    assert((await page.locator('#timeline-detail-panel').innerText()).includes('この計画の予測結果'));
    const step=await drain.boundingBox(),scroller=await page.locator('#action-timeline').boundingBox();assert(step.x>=scroller.x-1&&step.x+step.width<=scroller.x+scroller.width+1,'focused event fully visible');
    await page.screenshot({path:path.join(evidence,`${width}-drain-timeline.png`),fullPage:true});
    assert.equal(await page.locator('button button, button details, button summary').count(),0,'no nested controls');
    pass(`${width}px: closed layout, full rules, keyboard, wrapping, no state/random mutation`);
  }
  await page.setViewportSize({width:1280,height:720});
  // Artificial hand fixtures verify the actual selection / no-target / Legacy / ALT detail routes.
  for(const card of catalog.filter(x=>x.group==='card')){
    await page.evaluate(id=>{resetGame();game.intents=[];game.hand=[makeCardInstance(id)];render();},card.id);
    await page.locator('#hand .card').click();await openDisclosure(page,`#timeline-detail-panel [data-disclosure="selection-${card.id}"]`);
    assert((await page.locator('#timeline-detail-panel').innerText()).includes(card.short));
    assert.equal(await page.evaluate(()=>game.queue.length),0);
  }
  await page.evaluate(()=>{resetGame();game.intents=[];game.units.filter(u=>u.side==='enemy').forEach(u=>u.hp=0);game.hand=[makeCardInstance('arc_spark')];render();});
  await page.locator('#hand .card').click();await openDisclosure(page,'#timeline-detail-panel [data-disclosure="selection-arc_spark"]');assert((await page.locator('#mode-help').innerText()).includes('生存敵がいません'));
  await page.locator('#move-mode').click();await openDisclosure(page,'#timeline-detail-panel [data-disclosure="selection-move"]');assert((await page.locator('#timeline-detail-panel').innerText()).includes('固有技・遺志の代わり'));
  for(const [owner,id]of [['rook','forward_cut'],['vale','quickshot'],['iona','arc_spark']]){
    await page.evaluate(({owner,id})=>{resetGame();game.intents=[];getUnit(owner).hp=0;game.hand=[makeCardInstance(id)];render();},{owner,id});
    const ownerName=await page.evaluate(owner=>ownerMeta[owner].name,owner);assert.equal(await page.locator('#battlefield .unit-name').filter({hasText:ownerName}).count(),0,'HP0 owner remains absent');
    await page.locator('#hand .card').tap();assert((await page.locator('#hand .card').innerText()).includes('FAST'));
    await openDisclosure(page,`#timeline-detail-panel [data-disclosure="selection-legacy_${owner}"]`);assert((await page.locator('#timeline-detail-panel').innerText()).includes('距離に関係なく'));
    await page.locator('#move-mode').tap();await openDisclosure(page,'#timeline-detail-panel [data-disclosure="selection-move"]');
  }
  pass('all 12 selected cards, no target, 3 Legacy and ALT detail routes; touch selection');
  // Support status remains accessible at Guard 0; tapping it does not commit the selected card.
  await page.evaluate(()=>{resetGame();game.intents=[];getUnit('bastion').guard=0;getUnit('bastion').counter=4;getUnit('bastion').persistentGuard=true;getUnit('bastion').coveringId='cantor';render();});
  const statusBefore=await fingerprint(page);await page.locator('.unit-statuses[data-unit-id="bastion"]').tap();assert((await page.locator('#board-status-popover').innerText()).includes('残り1回'));assert((await page.locator('#board-status-popover').innerText()).includes('庇護：城壁兵→詠唱師'));assert.equal(await fingerprint(page),statusBefore);assert.equal(await page.locator('.unit-statuses[data-unit-id="bastion"] .status-chip').count(),0);
  pass('Guard 0 counter/cover auxiliary explanation, six-chip limit, touch does not commit');
  // One normal turn selected solely through UI, no injected HP, hand, intents or positions.
  await page.reload();await page.locator('#modal-button').click();
  for(let i=0;i<3;i++){await page.locator('#hand .card:not(:disabled)').first().click();await page.locator('#move-mode').click();await page.locator('#battlefield .cell.valid').first().click();await page.locator('#battlefield .cell.valid').first().click();}
  const ordinary=await page.evaluate(()=>({queue:game.queue,intents:game.intents,forecast:predictTimeline().final}));assert.equal(ordinary.queue.length,3);
  await page.locator('#execute-button').click();await page.locator('#help-button').click();await openDisclosure(page,'.technique-index');await openDisclosure(page,'[data-disclosure="index-drain"]');
  await page.waitForFunction(()=>game.phase==='planning'&&game.turn===2);assert.deepEqual(await page.evaluate(()=>game.lastResolvedState),ordinary.forecast);await page.locator('#modal-button').click();
  await page.screenshot({path:path.join(evidence,'ordinary-turn-2.png'),fullPage:true});report.ordinary=ordinary;pass('normal UI-only three-command turn; help remains readable during resolution, execution matches forecast');
  // Focused ACT 13 integration: old attached version retained; current/refreshed version and copy/share stay coherent.
  await page.evaluate(()=>{const timestamp='2026-09-11T12:00:00.000Z';const old={id:'act13-preserved',kind:'idea',body:'ACT 13で記録したメモ',createdAt:timestamp,updatedAt:timestamp,scene:{...capturePlaytestScene(),gameVersion:'ACT 13'},share:{state:'local-only',handoffOpenedAt:null,externalUrl:null}};localStorage.setItem(Order3Notes.KEY,JSON.stringify({schemaVersion:1,activeNoteId:old.id,notes:[old]}));});
  await page.reload();await page.locator('#modal-button').click();const beforeNotes=await page.evaluate(()=>JSON.stringify(game));
  await page.locator('#notes-button').click();assert((await page.locator('#notes-scene').innerText()).includes('ACT 13'));await page.locator('#notes-body').fill('ACT 13の本文だけ更新');await page.locator('#notes-save').click();
  let notes=await page.evaluate(()=>JSON.parse(localStorage.getItem(Order3Notes.KEY)).notes);assert.equal(notes[0].scene.gameVersion,'ACT 13');
  await page.locator('#notes-new').click();await page.locator('#notes-body').fill('ACT 14bの新しいメモ');await page.locator('#notes-save').click();notes=await page.evaluate(()=>JSON.parse(localStorage.getItem(Order3Notes.KEY)).notes);assert.equal(notes.find(n=>n.id!=='act13-preserved').scene.gameVersion,'ACT 14b');
  await page.locator('#notes-list button').last().click();await page.locator('#notes-scene-update').click();await page.locator('#notes-save').click();
  notes=await page.evaluate(()=>JSON.parse(localStorage.getItem(Order3Notes.KEY)).notes);assert.equal(notes.find(n=>n.id==='act13-preserved').scene.gameVersion,'ACT 14b');assert.equal(notes.find(n=>n.id==='act13-preserved').createdAt,'2026-09-11T12:00:00.000Z');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.testCopy=text}});window.open=()=>({opener:null,location:{replace(url){window.testShare=url;}}});});
  await page.locator('#notes-copy').click();await page.locator('#notes-share').click();const shared=await page.evaluate(()=>({copy:window.testCopy,url:window.testShare}));assert(shared.copy.includes('ゲーム版: ACT 14b'));assert.equal(new URL(shared.url).searchParams.get('body'),shared.copy);
  await page.locator('#notes-close').click();assert.equal(await page.evaluate(()=>JSON.stringify(game)),beforeNotes);
  await page.locator('#help-button').click();await page.locator('#notes-button').click();await page.keyboard.press('Escape');assert(await page.locator('#notes-dialog').evaluate(el=>!el.open));assert(await page.locator('#modal').isVisible());await page.locator('#modal-button').click();
  await page.reload();await page.locator('#modal-button').click();await page.locator('#notes-button').click();assert((await page.locator('#notes-scene').innerText()).includes('ACT 14b'));
  pass('notes: preserved ACT 13 scene, ACT 14b capture/refresh/copy/share/reload; help/notes focus coexistence');
  assert.deepEqual(report.errors,[]);report.status='PASS';await context.close();console.log('ORDER//3 ACT 14b browser tests passed');
}
main().catch(error=>{report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.close();});
