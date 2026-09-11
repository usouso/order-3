// ACT 14b implementation audit. Artificial fixtures are not natural-play evidence.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const root=path.resolve(__dirname,"../outputs/order-3"), evidence=path.resolve(__dirname,"act14b-browser");
const product=fs.readFileSync(path.join(root,"game.js"),"utf8");
const baseline={
  "makeUnits": "f49381781c2ed75626e2bb7a20b5b1e2450668b901a397a7d56b763e1231b4b6",
  "makeUnit": "7398eccf2552c75a81692970128f507007dea6db014306034c237b45c4748d7d",
  "shuffle": "cfcb6c0c9372cd531bb05ea578b49e9372cf41c8f713485fd9483d1ab5c7a8cc",
  "drawToFive": "9ee96a8059b11e58e024babc980ccbcc7e62608edbcbfd9972fc9f833f252cfb",
  "validCells": "25c5ebd4ae58a15dc550ce7fdc391534c8b7f05c595872b937b05dd4a0c529aa",
  "targetCandidatesForState": "ec463a133ee33e7d49aba77138c939e83faabce2ba8dc393b26bd53189637024",
  "targetsForState": "0c2ed16aa87340e32ea89afcbe7a5fa79b5f9e70a7f63b320d9bfe1a3b62212e",
  "handleCellClick": "ecd484d191a2c4e2a2108731b6a54d511fdb2701f06cb13715f74928f8c85868",
  "buildResolutionEvents": "e87645e04c81a1b30f13ad7a27ae3d0804a6f85e3e67735715865744e25bd9cd",
  "compareResolutionEvents": "4bca460f0557bf436035a0c7beab498d57e654d7c8d0d6689a375591335cbd05",
  "cloneCombatState": "e340d892b0f8fbc185f68915172943a9b66f961f8d90c751e7f184a1db39a186",
  "simGetUnit": "0300295643251e902fa257e2a747639051e94e4cb2dcbe4dc661e3e7b4912bf8",
  "simLiving": "6e79aac098df305a727a17a0dacba58e895c3d5888a018f7349f367fac3745da",
  "simUnitAt": "6e19db0f6fd8db231e83a22ac8f71b708a8a500fe6587f0dcc5ba49204555eee",
  "simIsEmpty": "14571707fb4c04c3c0522327d90ac17e703118b81e50c4eff03469b2b7e32961",
  "simBattleResult": "eda7603b6f09dca007280ae85960be7a7c97574c0eac17390cdb34381b5bca78",
  "simPathToAdjacent": "e342a7f4d8e66678151f5737bdc722e888feb2a0eb62f4842f71a32af231f74b",
  "simConsumeWard": "b132393eb9fc97c9b654d5d5f9a6bea46bfeab6fa9bf3b62e5ae1254725e230d",
  "simDealDamage": "c6cfe36f414c0d9c721e979235759beb8882d0ced50ea4d3acc648509570b956",
  "simTriggerEmberRune": "c9f22eef07de11b710296e2d05c9ab442261a0fa6310a0ca4f3eb3d4ac202081",
  "simHealWithCharge": "21a9cf4c5803ca7cce798a115a01531c4f651cc869a2eb208cd8450cb6d77168",
  "simMoveToward": "47b0fd11b23dbcc69245fabe4972cda770752d752ddcaa82c3c09d862776d136",
  "resolveSimPlayer": "c56d106cec47d4f223f1e3a58816f77ec7443ce4a26b5a5b9c6d29383af656ff",
  "resolveSimEnemy": "1eb46ed10968899653a98d5480b9de611b753404140f15568dc06fd2eb4c9d04",
  "predictTimeline": "5f9eeacb85182d752ac6f92a7c5ce1c34b6711e016929d0e93314bcf8cc5ce52",
  "applyCombatState": "a96eca8393feb6b016e016c79258c2ca8256828a39b0dfe904cb068298520333",
  "executeTurn": "2b53a53ad66353083f9fca04f1de42e16e088f8848e67059adf31ccfb1cd8d7b",
  "resolvePlayerAction": "e23aa842e0bdc3770c235e8286014848b51e12283f344843c7bde869c8680978",
  "resolveEnemyIntent": "02d4444d8c6150cdf78ea4aa16300b5c6910951a579b28f2dd383e781d254b99",
  "findPathToAdjacent": "bfefdbafd4e103bb62c1b91e2906ef177fd9857304bdaaaa0a76d13cfe955acd",
  "moveToward": "3e90aa9dc2ac8bfff2e5810901b0ad6b3d358e9a467b88cd3ab884670edc0cfd",
  "triggerEmberRune": "7b3ed0cb55f428dee6d55f9d6459acde2c3b60b97c74169bbfea862aa6365dfa",
  "consumeWard": "07e26ef4398dcbc0dc3f8d3129dc3827daf627599ba31a23752c3e7ca6126fad",
  "dealDamage": "3f580fb371b8fa8b54b65d21b9482bc91ebfbb47b8b272a30d3b5ea08ab911a3",
  "endTurnCleanup": "71ac5178c5e3954ea4965031c7227a29f889a06dc437830acec296d106db17f4"
};
const functions=[...product.matchAll(/^(?:async )?function (\w+)\(/gm)];
for(const[name,hash]of Object.entries(baseline)){const i=functions.findIndex(m=>m[1]===name);assert(i>=0,name);assert.equal(crypto.createHash("sha256").update(product.slice(functions[i].index,functions[i+1]?.index??product.length).trim()).digest("hex"),hash,"ACT 14a unchanged combat function: "+name);}
const report={checks:["35 combat, targeting, ordering and execution function hashes unchanged from ACT 14a"],catalog:[],boundaries:[]};
const harness=fs.readFileSync(path.join(__dirname,"smoke-test.js"),"utf8").split("const tests = `")[0];
const runAudit = function () {
  const checks=report.checks;
  const check=(name,fn)=>{fn();checks.push(name);};
  const unit=id=>getUnit(id);
  const action=(id,targetId,extra={})=>({instance:makeCardInstance(id),cardId:id,mode:"technique",actorId:cardDefs[id].ownerId,targetId,speed:cardDefs[id].speed,label:cardDefs[id].name,...extra});
  const fresh=()=>{resetGame();game.intents=[];game.queue=[];game.hostileRunes=[];game.emberRunes=[];};
  const enemy=(id,actor,target)=>intent(unit(actor),id,effectCatalog[id].name,effectCatalog[id].speed,target?unit(target):null,effectCatalog[id].short);
  const get=(state,id)=>simGetUnit(state,id);
  const perform=(queue=[],intents=[])=>{game.queue=queue;game.intents=intents;const before=JSON.stringify(game);const prediction=predictTimeline();assert.equal(JSON.stringify(game),before);return prediction;};
  const records = {
    stalk: ["最大2マス","最短","届かなければ"],
    pounce: ["最大3マス","最長","飛び越えません"],
    recover: ["2ダメージ","最大1マス","開始時","回復"],
    cover: ["装甲+4","現在HP最少","距離制限なし","何度でも","ターン末"],
    shield_drive: ["3ダメージ","露出","元の対象","結界","倒れれば"],
    brace: ["装甲+6","近接反撃4","1回","次の城壁兵"],
    inscribe: ["各4ダメージ","装甲が最少","現在HP最少","最大5マス","置き換え","生存"],
    detonate: ["味方全員","地形ダメージ4","柄打ち","消えません"],
    drain: ["2ダメージ","現在HP","距離に関係なく","回復先","攻撃処理の後","回復0","回復1","回復2","合計上限2","全消費"],
    forward_cut: ["射程2","近接3ダメージ","隣接なら移動せず","経路","巻き戻しません"],
    interpose: ["2マス以内の他の味方","両者に装甲+2","射程再判定","肩代わりを付与しません"],
    shield_lock: ["装甲+5","何度でも","ヴェイル→イオナ","装甲0","元の対象","ターン末"],
    pommel_break: ["装甲と反撃準備","近接2ダメージ","後で行う","生命吸収","起爆イベント","ダメージだけ"],
    quickshot: ["射程3","2ダメージ","射程を再判定","射線遮断なし","近接反撃の対象外"],
    pinning_arrow: ["射程4","1ダメージ","元の対象","全ダメージ","ターン末"],
    backstep_shot: ["射程3","2ダメージ","最も遠い","攻撃だけ","倒しても","近づく"],
    hunters_mark: ["射程4","+3","連鎖分を除く","持ち越し","回数追加"],
    arc_spark: ["射程3","3ダメージ","2＋対象の帯電","本体攻撃の直前","倒しても","斜め","二段先","加算・消費しません","中心は移りません"],
    phase_step: ["射程3","自身と他の味方","両方が生存","壁や駒","各人物に残り"],
    null_sigil: ["射程3","自身を含む","露出付与か災印","1回","持越し","治療せず"],
    ember_rune: ["射程3","3ダメージ","罠1個","重ね置き","次ターン","移動不能を付けず","肩代わり","術者が倒れても"],
    legacy_rook: ["距離に関係なく","装甲+2","ターン終了","肩代わりは付与しません"],
    legacy_vale: ["距離に関係なく","+3","連鎖分を除く","持越し","ダメージはありません"]
  };
  records.legacy_iona=["距離に関係なく","結界","露出付与か災印","1回","持越し","戦闘不能"];
  check("24 effect contracts: independent effects, targeting, conditions and linked lifetime rules",()=>{
    assert.equal(Object.keys(records).length,24);
    for(const[id,fragments]of Object.entries(records)){
      const info=effectCatalog[id],full=[info.short,...info.detail].join(" ");
      for(const fragment of fragments)assert(full.includes(fragment),id+": "+fragment);
      info.rules.forEach(key=>assert(effectRules[key]?.text,key));
      if(cardDefs[id]) { assert.equal(cardDefs[id].text,info.short);assert.equal(cardDefs[id].speed,info.speed); }
      if(id.startsWith("legacy_")) { assert.equal(getLegacy(id.slice(7)).text,info.short);assert.equal(getLegacy(id.slice(7)).speed,info.speed); }
      report.catalog.push({id,name:info.name,speed:info.speed,short:info.short,conditions:info.detail,relatedRules:info.rules});
    }
    assert.equal(Object.keys(statusMeta).length,6);
    assert.equal(typeof arcSparkBreakdown,"undefined");
  });
  check("Drain fixed attack vs dynamic lowest-current-HP injured recipient; zero HP damage still heals 2",()=>{
    fresh();game.turn=3;
    Object.assign(unit("rook"),{hp:9});Object.assign(unit("vale"),{hp:7});Object.assign(unit("iona"),{hp:6,guard:2});
    Object.assign(unit("pursuer"),{hp:4});Object.assign(unit("bastion"),{hp:6});Object.assign(unit("cantor"),{hp:6});
    const drain=buildEnemyIntents().find(item=>item.id==="drain");assert.equal(drain.targetId,"iona");
    let p=perform([],[drain]);assert.equal(get(p.final,"iona").hp,6);assert.equal(get(p.final,"pursuer").hp,6);assert.equal(get(p.final,"pursuer").charge,2);assert.equal(get(p.final,"bastion").hp,6);
    unit("pursuer").hp=5;Object.assign(unit("vale"),{x:0,y:0});Object.assign(unit("cantor"),{x:0,y:2,hp:6});unit("rook").hp=1;
    p=perform([action("quickshot","cantor")],[drain]);
    assert.equal(get(p.final,"cantor").hp,6);assert.equal(get(p.final,"cantor").charge,2);assert.equal(get(p.final,"rook").hp,1);assert.equal(drain.targetId,"iona");
    report.boundaries.push({name:"fixed attack and dynamic heal",target:drain.targetId,outcome:p.snapshots.at(-1).outcome});
  });
  check("Drain actual healing 0/1/2, Charge cap and turn expiry",()=>{
    for(const[hp,expected]of [[7,0],[6,1],[5,2]]){
      fresh();unit("cantor").hp=hp;unit("cantor").charge=1;
      const p=perform([],[enemy("drain","cantor","rook")]);
      assert.equal(get(p.final,"cantor").hp,7);assert.equal(get(p.final,"cantor").charge,Math.min(2,1+expected));
    }
    applyCombatState(predictTimeline().final);endTurnCleanup();assert(game.units.every(u=>u.charge===0));
  });
  check("Spark neighbors, diagonal exclusion, lethal primary, preserved neighbor Mark and cover-center invariance",()=>{
    for(const adjacent of [true,false]){
      fresh();Object.assign(unit("iona"),{x:0,y:0});Object.assign(unit("pursuer"),{x:1,y:0,hp:2,charge:2});
      Object.assign(unit("bastion"),{x:adjacent?2:2,y:adjacent?0:1,marked:true});
      Object.assign(unit("cantor"),{x:5,y:5});
      const p=perform([action("arc_spark","pursuer")]);
      assert.equal(get(p.final,"pursuer").hp,0);assert.equal(get(p.final,"pursuer").charge,adjacent?0:2);
      assert.equal(get(p.final,"bastion").hp,adjacent?8:12);assert.equal(get(p.final,"bastion").marked,true);
    }
    fresh();Object.assign(unit("iona"),{x:0,y:0});Object.assign(unit("pursuer"),{x:1,y:0,marked:true,charge:2});
    Object.assign(unit("bastion"),{x:2,y:0,coveringId:"pursuer",guard:3});Object.assign(unit("cantor"),{x:5,y:5});
    const p=perform([action("arc_spark","pursuer")]);assert.equal(get(p.final,"pursuer").hp,8);assert.equal(get(p.final,"pursuer").marked,true);assert.equal(get(p.final,"bastion").hp,8);
    report.boundaries.push({name:"Spark cover",outcome:p.snapshots[0].outcome});
  });
  check("Shield Lock fixed adjacent Vale, repeated interception, distance pause/resume and Guard 0",()=>{
    fresh();Object.assign(unit("rook"),{x:0,y:0});Object.assign(unit("vale"),{x:1,y:0});Object.assign(unit("iona"),{x:0,y:1});
    const p=perform([action("shield_lock","rook")],[enemy("drain","cantor","vale"),enemy("drain","cantor","vale")]);
    assert.equal(get(p.final,"rook").coveringId,"vale");assert.equal(get(p.final,"rook").guard,1);assert.equal(get(p.final,"vale").hp,8);
    const state=p.final,rook=get(state,"rook"),vale=get(state,"vale"),outcome={logs:[]};
    rook.guard=0;vale.x=3;simDealDamage(state,"vale",1,"cantor",{},outcome);assert.equal(vale.hp,7);assert.equal(rook.hp,11);
    vale.x=1;simDealDamage(state,"vale",1,"cantor",{},outcome);assert.equal(rook.hp,10);assert.equal(vale.hp,7);
    applyCombatState(state);endTurnCleanup();assert.equal(unit("rook").coveringId,null);
  });
  check("Shield Drive Exposed stays on original target through cover; ward blocks only Exposed",()=>{
    for(const ward of [false,true]){
      fresh();Object.assign(unit("rook"),{x:0,y:0,coveringId:"vale"});Object.assign(unit("vale"),{x:1,y:0,ward});Object.assign(unit("bastion"),{x:2,y:0});
      const p=perform([],[enemy("shield_drive","bastion","vale")]);
      assert.equal(get(p.final,"rook").hp,8);assert.equal(get(p.final,"vale").hp,8);assert.equal(get(p.final,"vale").exposed,!ward);assert.equal(get(p.final,"vale").ward,false);
    }
  });
  check("Counter fired / Pommel cleared / next action ended are distinct, ranged adjacency cannot trigger",()=>{
    for(const id of ["forward_cut","pommel_break","quickshot"]){
      fresh();Object.assign(unit("rook"),{x:0,y:0});Object.assign(unit("vale"),{x:0,y:1});Object.assign(unit("bastion"),{x:1,y:0,guard:6,counter:4,persistentGuard:true});
      const p=perform([action(id,"bastion")]);
      const target=get(p.final,"bastion"),groups=p.snapshots[0].outcome.groups;
      if(id==="forward_cut"){assert.equal(unit("rook").hp-get(p.final,"rook").hp,4);assert(groups.some(g=>g.type==="counter_fired"));}
      if(id==="pommel_break"){assert.equal(target.hp,10);assert.equal(target.guard,0);assert(groups.some(g=>g.type==="counter_cleared"));assert(!groups.some(g=>g.type==="counter_fired"));}
      if(id==="quickshot"){assert.equal(target.counter,4);assert.equal(get(p.final,"vale").hp,8);}
    }
    fresh();Object.assign(unit("bastion"),{counter:4,persistentGuard:true,guard:0});
    const p=perform([],[enemy("cover","bastion","pursuer")]);assert(p.snapshots[0].outcome.groups.some(g=>g.type==="counter_end"));
    unit("bastion").counter=4;assert(auxiliaryStatusDetails(unit("bastion")).some(x=>x.includes("残り1回")));assert.equal(activeStatusEntries(unit("bastion")).length,0);
    fresh();Object.assign(unit("rook"),{x:0,y:0});Object.assign(unit("pursuer"),{x:1,y:0,guard:3});Object.assign(unit("bastion"),{x:1,y:1,coveringId:"pursuer",guard:6,counter:4,persistentGuard:true});
    const covered=perform([action("pommel_break","pursuer")]);assert.equal(get(covered.final,"pursuer").guard,0);assert.equal(get(covered.final,"bastion").guard,4);assert.equal(get(covered.final,"rook").hp,11);assert.equal(get(covered.final,"bastion").counter,4);
  });
  check("Movement boundaries: blocked Interpose armor, occupied/backward Backstep, Phase self+other",()=>{
    fresh();Object.assign(unit("rook"),{x:0,y:0});Object.assign(unit("vale"),{x:2,y:0});Object.assign(unit("pursuer"),{x:1,y:0});Object.assign(unit("bastion"),{x:0,y:1});
    let p=perform([action("interpose","vale")]);assert.equal(get(p.final,"rook").x,0);assert.equal(get(p.final,"rook").guard,2);assert.equal(get(p.final,"vale").guard,2);
    fresh();Object.assign(unit("vale"),{x:0,y:0});Object.assign(unit("pursuer"),{x:2,y:0});Object.assign(unit("rook"),{x:0,y:1});Object.assign(unit("bastion"),{x:5,y:5});
    p=perform([action("backstep_shot","pursuer")]);assert.equal(get(p.final,"vale").x,1);
    Object.assign(unit("iona"),{x:1,y:0});p=perform([action("backstep_shot","pursuer")]);assert.equal(get(p.final,"vale").x,0);
    fresh();Object.assign(unit("iona"),{x:0,y:0});Object.assign(unit("rook"),{x:1,y:0});Object.assign(unit("vale"),{x:0,y:1});unit("iona").ward=true;unit("rook").guard=2;
    p=perform([action("phase_step","rook")]);assert.equal(get(p.final,"iona").x,1);assert.equal(get(p.final,"rook").x,0);assert.equal(get(p.final,"iona").ward,true);assert.equal(get(p.final,"rook").guard,2);
    const targets=targetCandidatesForState(cloneCombatState(),unit("iona"),"allyOther");assert(targets.every(u=>u.side==="player" && u.id!=="iona"));
  });
  check("Inscribe fixed cells and guard-first targeting; Detonate player-only ward, cancellation and caster-death residue",()=>{
    fresh();unit("rook").guard=0;unit("vale").guard=1;unit("iona").guard=1;
    const inscribe=buildEnemyIntents().find(x=>x.id==="inscribe");assert(inscribe.cells.some(c=>c.x===unit("rook").x && c.y===unit("rook").y));
    const fixed=JSON.stringify(inscribe.cells.map(({x,y})=>({x,y})));
    let p=perform([action("quickshot",null,{mode:"move",actorId:"rook",target:{x:0,y:4}})],[inscribe]);assert.equal(JSON.stringify(p.final.hostileRunes),fixed);
    fresh();Object.assign(unit("rook"),{x:0,y:0,ward:true});Object.assign(unit("pursuer"),{x:1,y:0});game.hostileRunes=[{x:0,y:0},{x:1,y:0}];
    p=perform([],[enemy("detonate","cantor")]);assert.equal(get(p.final,"rook").hp,11);assert.equal(get(p.final,"rook").ward,false);assert.equal(get(p.final,"pursuer").hp,8);assert.equal(p.final.hostileRunes.length,0);
    unit("cantor").hp=0;p=perform([],[enemy("detonate","cantor")]);assert.equal(p.final.hostileRunes.length,2);
    fresh();Object.assign(unit("rook"),{x:0,y:0});Object.assign(unit("cantor"),{x:1,y:0});game.hostileRunes=[{x:0,y:0}];
    const detonate=enemy("detonate","cantor");detonate.channel=true;
    p=perform([action("pommel_break","cantor")],[detonate]);assert.equal(p.snapshots[0].state.hostileRunes.length,1);assert.equal(p.final.hostileRunes.length,0);assert.equal(p.snapshots[1].outcome.status,"cancelled");
    for(const id of ["inscribe","drain"]){ const e=enemy(id,"cantor","rook");e.cells=[];p=perform([action("pommel_break","cantor")],[e]);assert(!p.final.cancelledEventKeys.length); }
  });
  check("Stacked traps add 1→2 and trigger 2→1; source death persistence and covered damage",()=>{
    fresh();Object.assign(unit("iona"),{x:0,y:0});game.emberRunes=[{x:1,y:0}];
    let p=perform([action("ember_rune",null,{target:{x:1,y:0}})]);assert.equal(p.final.emberRunes.length,2);assert(p.snapshots[0].outcome.groups.some(g=>g.type==="zone_count"&&g.summary.includes("1→2")));
    fresh();Object.assign(unit("pursuer"),{x:0,y:0});Object.assign(unit("rook"),{x:3,y:0});Object.assign(unit("bastion"),{x:1,y:1,coveringId:"pursuer"});unit("iona").hp=0;game.emberRunes=[{x:1,y:0},{x:1,y:0}];
    p=perform([],[enemy("pounce","pursuer","rook")]);assert.equal(p.final.emberRunes.length,1);assert.equal(get(p.final,"pursuer").hp,8);assert.equal(get(p.final,"bastion").hp,9);assert.equal(get(p.final,"pursuer").x,1);assert(p.snapshots[0].outcome.groups.some(g=>g.type==="zone_count"&&g.summary.includes("2→1")));
    report.boundaries.push({name:"stacked covered trap",outcome:p.snapshots[0].outcome});
  });
  check("All 3 Legacy effects work at unlimited distance, FAST; dead target cancels; technique never auto-converts",()=>{
    for(const [owner,id,target] of [["rook","forward_cut","iona"],["vale","quickshot","cantor"],["iona","arc_spark","rook"]]){
      fresh();unit(owner).hp=0;const a=action(id,target,{mode:"legacy",speed:"fast"});const p=perform([a]);
      assert.equal(p.snapshots[0].outcome.status,"resolved");assert.equal(p.events[0].speed,"fast");
      assert.equal(get(p.final,target)[owner==="rook"?"guard":owner==="vale"?"marked":"ward"],owner==="rook"?2:true);
      unit(target).hp=0;assert.equal(perform([a]).snapshots[0].outcome.status,"cancelled");
      fresh();unit(owner).hp=0;assert.equal(perform([action(id,target)]).snapshots[0].outcome.status,"cancelled");
    }
  });
  check("Disclosure rendering at queue zero, selection, no targets, ALT and legacy never mutates combat/queue/intents/random",()=>{
    fresh();let randomCalls=0;const original=Math.random;Math.random=()=>{randomCalls++;return .5;};
    try {
      for(const id of Object.keys(records)) { const before=JSON.stringify(game);assert(renderEffectDetails(id,"audit").includes("効果の規則"));assert.equal(JSON.stringify(game),before); }
      showHelp();assert(el.modalBody.innerHTML.includes("全ての技の説明"));
      game.intents=buildEnemyIntents();game.previewIndex=0;renderTimeline();assert(!el.timelineDetail.hidden);assert(el.timelineDetail.innerHTML.includes("効果詳細"));
      const card=makeCardInstance("arc_spark");game.hand=[card];game.selectedInstanceId=card.instanceId;renderTimeline();assert(el.timelineDetail.innerHTML.includes('data-effect-id="arc_spark"'));
      game.units.filter(u=>u.side==="enemy").forEach(u=>u.hp=0);render();assert(el.timelineDetail.innerHTML.includes('data-effect-id="arc_spark"'));
      game.mode="move";renderTimeline();assert(el.timelineDetail.innerHTML.includes('data-effect-id="move"'));
      unit("iona").hp=0;game.mode="technique";renderTimeline();assert(el.timelineDetail.innerHTML.includes('data-effect-id="legacy_iona"'));
      assert.equal(randomCalls,0);
    } finally {Math.random=original;}
  });
};
vm.runInNewContext(harness+"\n"+product+"\n("+runAudit.toString()+")()",{require,__dirname,console,process,report,assert,Math,setTimeout(){},clearTimeout(){}});
fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,"audit.json"),JSON.stringify({...report,status:"PASS"},null,2));
console.log("ORDER//3 ACT 14b audit passed: "+report.catalog.length+" effects; "+report.checks.length+" groups");
