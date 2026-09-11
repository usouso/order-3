const fs = require("fs");
const vm = require("vm");
const path = require("path");
const outputDir = path.join(__dirname, "..", "outputs", "order-3");
const htmlSource = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
const styleSource = fs.readFileSync(path.join(outputDir, "styles.css"), "utf8");
const readmeSource = fs.readFileSync(path.join(outputDir, "README.md"), "utf8");
const designSource = fs.readFileSync(path.join(outputDir, "DESIGN.md"), "utf8");
const hiddenCssWins = /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important\s*;?[^}]*\}/s.test(styleSource);
const modeBarUsesGrid = /\.mode-bar\s*\{[^}]*display\s*:\s*grid\s*;/s.test(styleSource);

function startsHidden(selector) {
  if (!selector.startsWith("#")) return false;
  const id = selector.slice(1);
  const tag = htmlSource.match(new RegExp(`<[^>]+id=["']${id}["'][^>]*>`, "i"))?.[0] || "";
  return /\shidden(?:\s|>|=)/i.test(tag);
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...tokens) { tokens.forEach(token => this.values.add(token)); }
  remove(...tokens) { tokens.forEach(token => this.values.delete(token)); }
  toggle(token, force) {
    const shouldAdd = force === undefined ? !this.values.has(token) : Boolean(force);
    if (shouldAdd) this.values.add(token);
    else this.values.delete(token);
    return shouldAdd;
  }
  contains(token) { return this.values.has(token); }
}

class FakeElement {
  constructor(selector = "") {
    this.selector = selector;
    this.classList = new FakeClassList();
    this.style = { setProperty() {} };
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.hidden = startsHidden(selector);
    this.disabled = false;
    this.offsetWidth = 100;
    this._innerHTML = "";
    this.textContent = "";
    this.title = "";
    this.scrollIntoViewCalls = [];
  }
  set innerHTML(value) { this._innerHTML = value; this.children = []; }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  scrollIntoView(options) { this.scrollIntoViewCalls.push(options); }
}

const elements = new Map();
const document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
    return elements.get(selector);
  },
  createElement() { return new FakeElement(); }
};

function getComputedStyle(element) {
  if (element.hidden && hiddenCssWins) return { display: "none" };
  if (element.selector === "#mode-bar" && modeBarUsesGrid) return { display: "grid" };
  if (element.selector === "#modal") return { display: "grid" };
  return { display: "block" };
}

const source = fs.readFileSync(path.join(outputDir, "game.js"), "utf8");
const tests = `
(async () => {
  pause = async () => {};
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const comparableState = state => JSON.stringify({
    units: state.units.map(unit => ({
      id: unit.id, hp: unit.hp, x: unit.x, y: unit.y, guard: unit.guard,
      ward: unit.ward, rooted: unit.rooted, marked: unit.marked,
      exposed: unit.exposed, coveringId: unit.coveringId, counter: unit.counter,
      persistentGuard: unit.persistentGuard, charge: unit.charge
    })),
    hostileRunes: state.hostileRunes,
    emberRunes: state.emberRunes
  });
  const queued = (cardId, actorId, targetId, speed = cardDefs[cardId].speed, extra = {}) => ({
    instance: makeCardInstance(cardId), cardId, mode: "technique", actorId, targetId, speed,
    label: cardDefs[cardId].name, ...extra
  });
  const assertControlsHidden = label => {
    assert(el.modeBar.hidden, label + ": mode bar should be hidden");
    assert(el.cancel.hidden, label + ": cancel selection should be hidden");
    assert(el.modeHelp.textContent === "", label + ": mode help should be empty");
    assert(getComputedStyle(el.modeBar).display === "none", label + ": computed mode-bar display should be none");
    assert(getComputedStyle(el.cancel).display === "none", label + ": computed cancel display should be none");
  };
  const unavailableGuidanceFragments = [
    "対象になる生存敵がいません", "内に敵がいません", "対象になる生存中の味方がいません",
    "対象となる味方がいません", "置ける空きマスがありません", "固有技の対象がありません"
  ];
  const assertNoUnavailableGuidance = label => {
    const renderedGuidance = el.modeHelp.textContent + " " + el.instruction.textContent;
    unavailableGuidanceFragments.forEach(fragment =>
      assert(!renderedGuidance.includes(fragment), label + ": stale unavailable guidance should be cleared: " + fragment));
  };
  const actorUnavailableFragments = [
    "実行不能：", "命令者が先に戦闘不能になります", "先行するNORMAL「生命吸収」", "この命令の直前に戦闘不能"
  ];
  const assertNoActorUnavailableGuidance = label => {
    const renderedGuidance = el.modeHelp.textContent + " " + el.instruction.textContent;
    actorUnavailableFragments.forEach(fragment =>
      assert(!renderedGuidance.includes(fragment), label + ": stale actor-unavailable guidance should be cleared: " + fragment));
  };
  const trapStopText = "火種の罠で残り移動停止";
  const resetTrapLane = (moverId = "pursuer", moverX = 4) => {
    resetGame();
    game.queue = [];
    game.intents = [];
    const target = getUnit("rook");
    const mover = getUnit(moverId);
    target.x = 0; target.y = 4;
    mover.x = moverX; mover.y = 4;
    return { target, mover, iona: getUnit("iona") };
  };

  resetGame();
  assert(game.units.length === 6, "six units should be created");
  assert(game.hand.length === 5, "opening hand should contain five cards");
  assert(game.intents.length === 3, "three enemies should announce intents");
  assert(game.intents.find(item => item.id === "cover").targetId === "cantor", "Bastion should protect Cantor");
  assert(game.intents.find(item => item.id === "inscribe").cells.length >= 3, "Cantor should telegraph an area");
  assert(!isOrthogonallyAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 }), "diagonal cells must not count as adjacent");
  assert(isOrthogonallyAdjacent({ x: 1, y: 1 }, { x: 2, y: 1 }), "orthogonal cells should count as adjacent");
  assert(renderUnit(getUnit("pursuer")).innerHTML.includes("8/8"), "enemy token should display numeric HP");
  renderIntents();
  assert(el.intents.children.every(card => card.innerHTML.includes("HP ")), "enemy intent cards should display numeric HP");

  {
    resetGame();
    const gridRook = getUnit("rook");
    const diagonalEnemy = getUnit("pursuer");
    diagonalEnemy.x = gridRook.x + 1;
    diagonalEnemy.y = gridRook.y - 1;
    const pommel = makeCardInstance("pommel_break");
    game.hand = [pommel];
    game.queue = [];
    game.selectedInstanceId = pommel.instanceId;
    assert(!validCells().some(cell => cell.x === diagonalEnemy.x && cell.y === diagonalEnemy.y), "an adjacent melee attack must not target diagonally");

    game.queue = [{
      instance: makeCardInstance("forward_cut"), cardId: "forward_cut", mode: "technique",
      actorId: "rook", targetId: "pursuer", speed: "fast"
    }];
    const stepped = projectedLayout();
    assert(stepped.get("rook").x !== gridRook.x || stepped.get("rook").y !== gridRook.y, "Forward Cut should preview its movement");
    assert(isOrthogonallyAdjacent(stepped.get("rook"), stepped.get("pursuer")), "Forward Cut must end orthogonally adjacent before attacking");
  }

  {
    resetGame();
    const guardTarget = getUnit("iona");
    guardTarget.x = 3; guardTarget.y = 4;
    game.queue = [{
      instance: makeCardInstance("interpose"), cardId: "interpose", mode: "technique",
      actorId: "rook", targetId: "iona", speed: "fast"
    }];
    assert(projectedLayout().get("rook").x === 2, "Interpose should preview Rook's approach");

    resetGame();
    const shotTarget = getUnit("pursuer");
    shotTarget.x = 0; shotTarget.y = 2;
    game.queue = [{
      instance: makeCardInstance("backstep_shot"), cardId: "backstep_shot", mode: "technique",
      actorId: "vale", targetId: "pursuer", speed: "fast"
    }];
    const retreated = projectedLayout().get("vale");
    assert(retreated.x === 1 && retreated.y === 5, "Backstep Shot should preview its retreat");

    resetGame();
    game.queue = [{
      instance: makeCardInstance("phase_step"), cardId: "phase_step", mode: "technique",
      actorId: "iona", targetId: "vale", speed: "fast"
    }];
    const swapped = projectedLayout();
    assert(swapped.get("iona").x === 0 && swapped.get("vale").x === 2, "Phase Step should preview both swapped positions");
  }

  const slowOrder = { instance: makeCardInstance("pommel_break"), cardId: "pommel_break", mode: "technique", actorId: "rook", speed: "slow" };
  const fastOrder = { instance: makeCardInstance("quickshot"), cardId: "quickshot", mode: "technique", actorId: "vale", speed: "fast" };
  game.queue = [slowOrder, fastOrder];
  const orderedEvents = buildResolutionEvents();
  assert(orderedEvents[0].payload === fastOrder, "fast allied action should appear first on timeline");
  assert(orderedEvents[1].kind === "enemy" && orderedEvents[4].payload === slowOrder, "timeline should merge enemy and allied actions by speed");
  renderTimeline();
  assert(el.timeline.children.length === orderedEvents.length, "timeline should render every scheduled action");

  resetGame();
  const pursuer = getUnit("pursuer");
  const vale = getUnit("vale");
  pursuer.marked = true;
  await dealDamage(pursuer, 2, vale);
  assert(pursuer.hp === 3 && !pursuer.marked, "mark should add three damage and be consumed");

  resetGame();
  const pinned = getUnit("pursuer");
  const pinActor = getUnit("vale");
  pinActor.x = 3; pinActor.y = 4;
  await resolvePlayerAction({ cardId: "pinning_arrow", mode: "technique", actorId: "vale", targetId: "pursuer" });
  assert(pinned.hp === 7 && pinned.rooted, "pinning arrow should damage and root");
  const oldPosition = { x: pinned.x, y: pinned.y };
  const farTarget = getUnit("iona");
  const oldHp = farTarget.hp;
  await resolveEnemyIntent({ actorId: "pursuer", id: "pounce", name: "test", speed: "normal", targetId: "iona" });
  assert(pinned.x === oldPosition.x && pinned.y === oldPosition.y, "rooted pursuer should not move");
  assert(farTarget.hp === oldHp, "rooted pounce should miss a distant target");

  resetGame();
  const iona = getUnit("iona");
  iona.ward = true;
  game.hostileRunes = [{ x: iona.x, y: iona.y }];
  const cantor = getUnit("cantor");
  const hpBefore = iona.hp;
  await resolveEnemyIntent({ actorId: "cantor", id: "detonate", name: "test", speed: "slow", targetId: null });
  assert(iona.hp === hpBefore && !iona.ward, "ward should cancel rune damage and be consumed");
  assert(game.hostileRunes.length === 0, "detonation should clear runes");

  resetGame();
  const rook = getUnit("rook");
  const startX = rook.x;
  await resolvePlayerAction({ cardId: "quickshot", mode: "move", actorId: "rook", target: { x: startX, y: rook.y - 1 } });
  assert(rook.y === 3, "fallback movement should move one tile");

  {
    resetGame();
    game.intents = [];
    const previewRook = getUnit("rook");
    const previewEnemy = getUnit("pursuer");
    previewEnemy.x = 4; previewEnemy.y = 4;
    const moveCard = makeCardInstance("quickshot");
    const attackCard = makeCardInstance("forward_cut");
    game.hand = [moveCard, attackCard];
    game.deck = [];
    game.discard = [];
    game.queue = [];

    game.selectedInstanceId = moveCard.instanceId;
    game.mode = "move";
    handleCellClick(1, 4);
    handleCellClick(2, 4);
    assert(previewRook.x === 1 && previewRook.y === 4, "planning must not mutate the real position");
    assert(projectedLayout().get("rook").x === 2, "queued movement should update the projected position");

    selectCard(attackCard.instanceId);
    assert(validCells().some(cell => cell.x === 4 && cell.y === 4), "second action should measure range from the projected position");
    handleCellClick(4, 4);
    assert(game.queue.length === 2, "move then attack should both enter the queue");

    game.phase = "resolving";
    await resolvePlayerAction(game.queue[0]);
    await resolvePlayerAction(game.queue[1]);
    assert(previewRook.x === 3 && previewRook.y === 4, "fallback move followed by Forward Cut should use the new position");
    assert(previewEnemy.hp === 5, "the queued attack should damage its target");
  }

  {
    resetGame();
    game.intents = [];
    getUnit("pursuer").x = 0;
    getUnit("pursuer").y = 2;
    game.queue = [queued("quickshot", "vale", "pursuer")];
    const before = comparableState(cloneCombatState(game));
    const forecast = predictTimeline();
    assert(comparableState(cloneCombatState(game)) === before, "forecasting must not mutate combat state");
    assert(forecast.snapshots.length === 1, "forecast should contain one snapshot per timeline event");
    const expected = comparableState(forecast.final);
    await executeTurn();
    assert(comparableState(game.lastResolvedState) === expected, "actual execution must apply the exact forecast state");
  }

  {
    resetGame();
    game.intents = [];
    const target = getUnit("pursuer");
    const adjacent = getUnit("bastion");
    target.x = 2; target.y = 4;
    adjacent.x = 3; adjacent.y = 4;
    game.queue = [
      queued("hunters_mark", "vale", "pursuer"),
      queued("arc_spark", "iona", "pursuer")
    ];
    const forecast = predictTimeline();
    assert(forecast.events[0].payload.cardId === "hunters_mark" && forecast.events[1].payload.cardId === "arc_spark",
      "same-speed SLOW cards should preserve friendly registration order");
    const predicted = simGetUnit(forecast.final, "pursuer");
    assert(predicted.hp === 2 && !predicted.marked, "slow mark then slow Arc Spark should deal six and consume mark");
    assert(simGetUnit(forecast.final, "bastion").hp === 10, "Arc Spark should deal two to an orthogonally adjacent enemy");
    await executeTurn();
    assert(comparableState(game.lastResolvedState) === comparableState(forecast.final), "mark combo execution should match forecast");
  }

  {
    resetGame();
    const protectedUnit = getUnit("iona");
    game.hostileRunes = [{ x: protectedUnit.x, y: protectedUnit.y }];
    game.intents = [intent(getUnit("cantor"), "detonate", "災印起爆", "slow", null,
      "test", [...game.hostileRunes], { targetKind: "cells", channel: true })];
    game.queue = [queued("null_sigil", "iona", "iona")];
    const forecast = predictTimeline();
    const predicted = simGetUnit(forecast.final, "iona");
    assert(predicted.hp === protectedUnit.hp && !predicted.ward, "ward should be consumed while preventing forecast rune damage");
    await executeTurn();
    assert(comparableState(game.lastResolvedState) === comparableState(forecast.final), "ward and detonation execution should match forecast");
  }

  {
    resetGame();
    game.intents = [];
    const target = getUnit("pursuer");
    target.x = 0; target.y = 2; target.hp = 2;
    game.queue = [
      queued("quickshot", "vale", "pursuer"),
      queued("quickshot", "vale", "pursuer")
    ];
    const forecast = predictTimeline();
    assert(simGetUnit(forecast.final, "pursuer").hp === 0, "first lethal attack should defeat its target");
    assert(forecast.snapshots[1].outcome.status === "cancelled" && forecast.snapshots[1].outcome.reason.includes("戦闘不能"),
      "follow-up attack should visibly forecast cancellation");
  }

  {
    resetGame();
    const rook = getUnit("rook");
    const cantor = getUnit("cantor");
    rook.x = 1; rook.y = 4;
    cantor.x = 2; cantor.y = 4;
    const victim = getUnit("iona");
    game.hostileRunes = [{ x: victim.x, y: victim.y }];
    game.intents = [intent(cantor, "detonate", "災印起爆", "slow", null,
      "test", [...game.hostileRunes], { targetKind: "cells", channel: true })];
    game.queue = [queued("pommel_break", "rook", "cantor")];
    const forecast = predictTimeline();
    assert(forecast.snapshots[1].outcome.status === "cancelled" && forecast.snapshots[1].outcome.reason.includes("柄打ち"),
      "Pommel should cancel the explicitly scheduled channel event");
    assert(simGetUnit(forecast.final, "iona").hp === victim.hp && forecast.final.hostileRunes.length === 0,
      "cancelled detonation should deal no damage and clear its runes");
    assert(!cantor.channelCancelled, "forecast cancellation must not leak into a future turn flag");
  }

  {
    resetGame();
    game.intents = [];
    const rook = getUnit("rook");
    const pursuer = getUnit("pursuer");
    const bastion = getUnit("bastion");
    rook.x = 1; rook.y = 1;
    pursuer.x = 2; pursuer.y = 1;
    bastion.x = 3; bastion.y = 1;
    bastion.coveringId = pursuer.id;
    bastion.counter = 4;
    bastion.persistentGuard = true;
    game.queue = [queued("forward_cut", "rook", "pursuer")];
    const forecast = predictTimeline();
    assert(simGetUnit(forecast.final, "rook").hp === rook.hp, "counter must not hit a non-adjacent attacker after cover redirection");
    assert(simGetUnit(forecast.final, "bastion").hp === 9, "cover should still redirect the melee damage to Bastion");
  }

  {
    resetGame();
    game.queue = [];
    game.intents = [intent(getUnit("bastion"), "brace", "反撃姿勢", "slow", getUnit("bastion"), "test")];
    const braced = predictTimeline().final;
    const predictedBastion = simGetUnit(braced, "bastion");
    assert(predictedBastion.guard === 6 && predictedBastion.persistentGuard, "brace guard should persist beyond turn cleanup");
    applyCombatState(braced);
    endTurnCleanup();
    assert(getUnit("bastion").guard === 6 && getUnit("bastion").persistentGuard, "turn cleanup must retain brace guard");
    game.intents = [intent(getUnit("bastion"), "cover", "庇護", "fast", getUnit("cantor"), "test")];
    const nextAction = predictTimeline().final;
    assert(simGetUnit(nextAction, "bastion").guard === 0 && !simGetUnit(nextAction, "bastion").persistentGuard,
      "brace guard should expire when Bastion's next action begins");
  }

  {
    resetGame();
    const announced = game.intents.find(item => item.id === "inscribe");
    const announcedCells = JSON.stringify(announced.cells.map(cell => ({ x: cell.x, y: cell.y })));
    const move = makeCardInstance("quickshot");
    game.queue = [{
      instance: move, cardId: "quickshot", mode: "move", actorId: "iona",
      target: { x: 3, y: 5 }, speed: "fast", label: "イオナ：移動"
    }];
    const forecast = predictTimeline();
    assert(JSON.stringify(forecast.final.hostileRunes) === announcedCells, "inscribe should remain fixed to the announced cells after movement");
    renderIntents();
    const cantorIntent = el.intents.children.find(card => card.innerHTML.includes("災印を刻む"));
    assert(cantorIntent.innerHTML.includes("TARGET：マス"), "rune intent UI should identify cells, not a tracked unit target");
  }

  {
    resetGame();
    const rook = getUnit("rook");
    const pursuer = getUnit("pursuer");
    rook.x = 1; rook.y = 4;
    pursuer.x = 4; pursuer.y = 4;
    game.intents = [intent(pursuer, "stalk", "忍び寄る", "fast", rook, "test")];
    const pommel = makeCardInstance("pommel_break");
    game.hand = [pommel];
    game.queue = [];
    game.selectedInstanceId = pommel.instanceId;
    const liveBefore = comparableState(cloneCombatState(game));
    const context = selectionTimelineContext();
    assert(context.eventIndex === 1 && context.events[0].kind === "enemy", "NORMAL provisional action should be inserted after a FAST enemy");
    assert(simGetUnit(context.state, "pursuer").x === 2, "selection state should include the FAST enemy movement");
    assert(validCells().some(cell => cell.x === 2 && cell.y === 4), "NORMAL melee should target an enemy that moved into range at execution time");
    assert(comparableState(cloneCombatState(game)) === liveBefore, "selection-time forecasting must not mutate live combat state");
    handleCellClick(2, 4);
    const actualIndex = buildResolutionEvents().findIndex(event => event.payload === game.queue[0]);
    assert(actualIndex === context.eventIndex, "provisional insertion index must match the committed action index");
  }

  {
    resetGame();
    const pursuer = getUnit("pursuer");
    pursuer.x = 2; pursuer.y = 4; pursuer.hp = 2;
    game.intents = [];
    game.queue = [queued("quickshot", "vale", "pursuer")];
    const pommel = makeCardInstance("pommel_break");
    game.hand = [pommel];
    game.selectedInstanceId = pommel.instanceId;
    assert(!validCells().some(cell => cell.x === 2 && cell.y === 4), "an enemy defeated before the provisional action must not be targetable");
  }

  {
    resetGame();
    game.intents = [];
    const first = {
      instance: makeCardInstance("quickshot"), cardId: "quickshot", mode: "move", actorId: "rook",
      target: { x: 2, y: 4 }, speed: "fast", label: "R1"
    };
    const second = {
      instance: makeCardInstance("quickshot"), cardId: "quickshot", mode: "move", actorId: "rook",
      target: { x: 2, y: 3 }, speed: "fast", label: "R2"
    };
    const selected = makeCardInstance("quickshot");
    game.hand = [selected];
    game.selectedInstanceId = selected.instanceId;
    game.queue = [first, second];
    const orderedState = selectionTimelineContext().state;
    game.queue = [second, first];
    const reversedState = selectionTimelineContext().state;
    assert(simGetUnit(orderedState, "rook").y === 3 && simGetUnit(reversedState, "rook").y === 4,
      "same-speed allied queue order should recompute the provisional pre-state");
  }

  {
    resetGame();
    const before = cloneCombatState(game);
    const after = cloneCombatState(game);
    simGetUnit(after, "pursuer").hp -= 3;
    simGetUnit(after, "vale").x += 1;
    simGetUnit(after, "iona").ward = true;
    simGetUnit(after, "rook").guard = 5;
    simGetUnit(after, "rook").coveringId = "vale";
    simGetUnit(after, "bastion").counter = 4;
    after.emberRunes.push({ x: 3, y: 5 });
    const event = { kind: "player", payload: { cardId: "shield_lock" } };
    const groups = buildStructuredChanges(before, after, { status: "resolved", reason: "" }, event);
    const types = new Set(groups.map(group => group.type));
    ["damage", "move", "status", "guard", "zone_add", "cover_start", "counter_ready"].forEach(type =>
      assert(types.has(type), "structured diff should include " + type));
    assert(summarizeStructuredChanges(groups).includes("＋他"), "timeline summary should announce omitted change types");
    const cancelGroups = buildStructuredChanges(before, before, { status: "cancelled", reason: "射程外" }, event);
    assert(cancelGroups[0].type === "cancel", "cancellation should be the highest-priority structured change");

    const areaAfter = cloneCombatState(before);
    simGetUnit(areaAfter, "rook").hp -= 2;
    simGetUnit(areaAfter, "vale").hp -= 3;
    simGetUnit(areaAfter, "iona").hp -= 4;
    areaAfter.hostileRunes = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const areaGroups = buildStructuredChanges(before, areaAfter, { status: "resolved", reason: "" }, { kind: "enemy", payload: { id: "detonate" } });
    assert(areaGroups.find(group => group.type === "damage").summary.includes("3人に計9ダメージ"),
      "multiple damage targets should aggregate into one meaningful group");
    assert(areaGroups.find(group => group.type === "zone_add").summary.includes("4マス"),
      "multiple terrain cells should aggregate into one meaningful group");
  }

  {
    resetGame();
    game.intents = [];
    game.queue = [queued("ember_rune", "iona", null, "normal", { target: { x: 3, y: 5 } })];
    let outcome = predictTimeline().snapshots[0].outcome;
    assert(outcome.groups.some(group => group.type === "zone_add") && !outcome.summary.includes("状態変化なし"),
      "Ember Rune should report terrain placement");

    resetGame();
    game.queue = [];
    game.intents = [game.intents.find(item => item.id === "inscribe")];
    outcome = predictTimeline().snapshots[0].outcome;
    assert(outcome.groups.some(group => group.type === "zone_add"), "Inscribe should report hostile rune placement");

    resetGame();
    game.queue = [];
    game.intents = [intent(getUnit("bastion"), "cover", "庇護", "fast", getUnit("cantor"), "test")];
    outcome = predictTimeline().snapshots[0].outcome;
    assert(outcome.groups.some(group => group.type === "guard") && outcome.groups.some(group => group.type === "cover_start"),
      "Cover should report both guard and covering relation");

    resetGame();
    getUnit("vale").x = 1; getUnit("vale").y = 3;
    game.queue = [queued("shield_lock", "rook", "rook")];
    game.intents = [];
    outcome = predictTimeline().snapshots[0].outcome;
    assert(outcome.groups.some(group => group.type === "guard") && outcome.groups.some(group => group.type === "cover_start"),
      "Shield Lock should report guard and its adjacent cover target");

    resetGame();
    game.queue = [];
    game.intents = [intent(getUnit("bastion"), "brace", "反撃姿勢", "slow", getUnit("bastion"), "test")];
    outcome = predictTimeline().snapshots[0].outcome;
    assert(outcome.groups.some(group => group.type === "counter_ready") && outcome.groups.some(group => group.type === "guard"),
      "Brace should report guard and prepared counter");
  }

  {
    resetGame();
    const rook = getUnit("rook");
    const bastion = getUnit("bastion");
    rook.ward = true;
    bastion.x = 3; bastion.y = 4;
    game.intents = [intent(bastion, "shield_drive", "盾の圧力", "normal", rook, "test")];
    game.queue = [queued("quickshot", "vale", "pursuer", "slow")];
    const forecast = predictTimeline();
    game.previewIndex = 0;
    renderTimeline();
    assert(forecast.snapshots[0].outcome.groups.length >= 3, "test event should create at least three structured groups");
    assert(el.timeline.children[0].innerHTML.includes("＋他"), "timeline body should show at most two groups plus other-type count");
    for (const group of forecast.snapshots[0].outcome.groups) {
      assert(el.timelineDetail.innerHTML.includes("data-change-type=\\\"" + group.type + "\\\""), "selected detail should expose every structured group");
    }
  }

  {
    resetGame();
    let context = timelineDisplayContext();
    const announced = game.intents.find(item => item.id === "inscribe");
    assert(unresolvedIntentCells(context).length === announced.cells.length, "initial stage should outline unresolved enemy cell intent");

    game.queue = [queued("quickshot", "vale", "pursuer")];
    const forecast = predictTimeline();
    const inscribeIndex = forecast.events.findIndex(event => event.kind === "enemy" && event.payload.id === "inscribe");
    game.previewIndex = inscribeIndex;
    context = timelineDisplayContext();
    assert(unresolvedIntentCells(context).length === 0, "resolved enemy event should no longer show a forecast outline");
    assert(context.state.hostileRunes.length === announced.cells.length, "resolved runes should remain as snapshot terrain state");
    game.previewIndex = null;
    assert(unresolvedIntentCells(timelineDisplayContext()).length === 0, "final forecast should contain no resolved intent outlines");

    resetGame();
    const cantor = getUnit("cantor");
    const rook = getUnit("rook");
    rook.x = 1; rook.y = 4;
    cantor.x = 2; cantor.y = 4;
    game.hostileRunes = [{ x: 2, y: 5 }];
    game.intents = [intent(cantor, "detonate", "災印起爆", "slow", null, "test", [...game.hostileRunes], { targetKind: "cells", channel: true })];
    game.queue = [queued("pommel_break", "rook", "cantor")];
    game.previewIndex = 0;
    assert(unresolvedIntentCells(timelineDisplayContext()).length === 0, "forecast-cancelled enemy event should not retain its outline");
  }

  {
    const speedCounts = Object.values(cardDefs).reduce((counts, def) => {
      counts[def.speed] = (counts[def.speed] || 0) + 1;
      return counts;
    }, {});
    assert(speedCounts.fast === 6 && speedCounts.normal === 4 && speedCounts.slow === 2,
      "the twelve cards should be distributed FAST 6 / NORMAL 4 / SLOW 2");
    assert(cardDefs.forward_cut.speed === "normal" && cardDefs.backstep_shot.speed === "normal",
      "Forward Cut and Backstep Shot should be NORMAL");
    assert(cardDefs.hunters_mark.speed === "slow" && cardDefs.hunters_mark.text.includes("+3"),
      "Hunter's Mark should be SLOW and grant +3");
    assert(cardDefs.arc_spark.speed === "slow" && cardDefs.arc_spark.text.includes("3ダメージ") && cardDefs.arc_spark.text.includes("2ダメージ"),
      "Arc Spark should be SLOW with 3/2 damage text");

    resetGame();
    game.hand = [makeCardInstance("forward_cut"), makeCardInstance("backstep_shot"), makeCardInstance("hunters_mark"), makeCardInstance("arc_spark")];
    renderHand();
    assert(el.hand.children[0].innerHTML.includes("speed normal") && el.hand.children[1].innerHTML.includes("speed normal"),
      "hand should show both changed NORMAL speeds");
    assert(el.hand.children[2].innerHTML.includes("speed slow") && el.hand.children[3].innerHTML.includes("speed slow"),
      "hand should show both changed SLOW speeds");
  }

  {
    resetGame();
    const rook = getUnit("rook");
    const pursuer = getUnit("pursuer");
    rook.x = 1; rook.y = 4;
    pursuer.x = 4; pursuer.y = 4;
    game.intents = [intent(pursuer, "stalk", "忍び寄る", "fast", rook, "test")];
    const forward = makeCardInstance("forward_cut");
    game.hand = [forward];
    game.queue = [];
    game.selectedInstanceId = forward.instanceId;
    let context = selectionTimelineContext();
    assert(context.action.speed === "normal" && context.events[0].kind === "enemy",
      "Forward Cut provisional event should be NORMAL after the FAST enemy move");
    renderTimeline();
    assert(el.timeline.children[context.eventIndex].innerHTML.includes("speed normal"),
      "provisional timeline should display Forward Cut as NORMAL");
    assert(validCells().some(cell => cell.x === 2 && cell.y === 4),
      "NORMAL Forward Cut should target the Pursuer at its post-FAST position");
    handleCellClick(2, 4);
    assert(game.queue[0].speed === "normal", "committed Forward Cut should retain NORMAL speed");
    renderTimeline();
    assert(el.timeline.children[1].innerHTML.includes("speed normal"), "committed timeline should display Forward Cut as NORMAL");

    resetGame();
    const vale = getUnit("vale");
    const movingPursuer = getUnit("pursuer");
    getUnit("iona").x = 5; getUnit("iona").y = 5;
    vale.x = 0; vale.y = 5;
    movingPursuer.x = 4; movingPursuer.y = 5;
    game.intents = [intent(movingPursuer, "stalk", "忍び寄る", "fast", vale, "test")];
    const backstep = makeCardInstance("backstep_shot");
    game.hand = [backstep];
    game.queue = [];
    game.selectedInstanceId = backstep.instanceId;
    context = selectionTimelineContext();
    assert(context.action.speed === "normal" && simGetUnit(context.state, "pursuer").x === 2,
      "Backstep Shot should select from the post-FAST enemy position");
    assert(validCells().some(cell => cell.x === 2 && cell.y === 5),
      "NORMAL Backstep Shot should target an enemy that moved into range");
  }

  {
    resetGame();
    const vale = getUnit("vale");
    const pursuer = getUnit("pursuer");
    getUnit("iona").x = 5; getUnit("iona").y = 5;
    vale.x = 0; vale.y = 5;
    pursuer.x = 2; pursuer.y = 5;
    game.queue = [queued("backstep_shot", "vale", "pursuer")];
    game.intents = [intent(pursuer, "pounce", "飛びかかり", "normal", vale, "test")];
    const forecast = predictTimeline();
    assert(forecast.events[0].payload.cardId === "backstep_shot" && forecast.events[1].payload.id === "pounce",
      "NORMAL Backstep Shot should resolve before a NORMAL enemy action");
    const retreatedVale = simGetUnit(forecast.snapshots[0].state, "vale");
    assert(retreatedVale.x !== vale.x || retreatedVale.y !== vale.y,
      "Backstep Shot should already have retreated before the enemy NORMAL snapshot");
  }

  {
    resetGame();
    const vale = getUnit("vale");
    const pursuer = getUnit("pursuer");
    vale.x = 3; vale.y = 4;
    pursuer.x = 4; pursuer.y = 2;
    game.queue = [queued("pinning_arrow", "vale", "pursuer")];
    game.intents = [intent(pursuer, "stalk", "忍び寄る", "fast", getUnit("rook"), "test")];
    const forecast = predictTimeline();
    assert(forecast.events[0].payload.cardId === "pinning_arrow" && forecast.events[1].payload.id === "stalk",
      "FAST Pinning Arrow should resolve before a FAST enemy action");
    assert(simGetUnit(forecast.snapshots[0].state, "pursuer").rooted, "Pinning Arrow should Root before enemy movement");
    assert(simGetUnit(forecast.final, "pursuer").x === pursuer.x && simGetUnit(forecast.final, "pursuer").y === pursuer.y,
      "the rooted FAST enemy should not move");
  }

  {
    resetGame();
    const rook = getUnit("rook");
    const cantor = getUnit("cantor");
    const bastion = getUnit("bastion");
    rook.x = 1; rook.y = 4;
    cantor.x = 2; cantor.y = 4;
    bastion.x = 2; bastion.y = 3;
    game.hostileRunes = [{ x: 1, y: 5 }];
    game.queue = [queued("pommel_break", "rook", "cantor")];
    game.intents = [
      intent(bastion, "cover", "庇護", "fast", cantor, "test"),
      intent(cantor, "detonate", "災印起爆", "slow", null, "test", [...game.hostileRunes], { targetKind: "cells", channel: true })
    ];
    const forecast = predictTimeline();
    assert(forecast.events.map(event => event.payload.id || event.payload.cardId).join(",") === "cover,pommel_break,detonate",
      "NORMAL Pommel should resolve after FAST Cover and before SLOW Channel");
    assert(simGetUnit(forecast.snapshots[1].state, "cantor").guard === 0,
      "Pommel should remove the guard granted by earlier FAST Cover");
    assert(forecast.snapshots[2].outcome.status === "cancelled", "Pommel should cancel the later SLOW channel");
  }

  {
    resetGame();
    const pursuer = getUnit("pursuer");
    const rook = getUnit("rook");
    pursuer.x = 4; pursuer.y = 4;
    rook.x = 1; rook.y = 4;
    game.intents = [intent(pursuer, "stalk", "忍び寄る", "fast", rook, "test")];
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.queue = [];
    game.selectedInstanceId = spark.instanceId;
    game.mode = "technique";
    const techniqueContext = selectionTimelineContext();
    assert(techniqueContext.action.speed === "slow" && techniqueContext.events[0].kind === "enemy",
      "Arc Spark technique should be a SLOW provisional event after FAST movement");
    assert(validCells().some(cell => cell.x === 2 && cell.y === 4), "SLOW Arc Spark technique should have a legal post-move target");

    game.mode = "move";
    game.moveUnitId = null;
    const moveContext = selectionTimelineContext();
    assert(moveContext.action.speed === "fast" && moveContext.eventIndex === 0,
      "converting the SLOW card to movement should insert a FAST provisional event");
    assert(simGetUnit(moveContext.state, "pursuer").x === 4, "FAST move selection should display the state before enemy FAST movement");
    renderTimeline();
    assert(el.timeline.children[moveContext.eventIndex].innerHTML.includes("speed fast"),
      "movement conversion should display FAST in the provisional timeline");
    assert(validCells().some(cell => cell.x === rook.x && cell.y === rook.y), "FAST movement conversion should allow selecting a living ally");
    game.moveUnitId = "rook";
    assert(validCells().some(cell => isOrthogonallyAdjacent(cell, rook)), "FAST movement conversion should expose a legal orthogonal destination");
  }

  {
    resetGame();
    const outcome = { logs: [] };
    let state = cloneCombatState(game);
    let enemy = simGetUnit(state, "pursuer");
    enemy.hp = enemy.maxHp - 2;
    assert(simHealWithCharge(enemy, 2, outcome) === 2 && enemy.hp === enemy.maxHp && enemy.charge === 2,
      "two actual healing should add two charge");

    state = cloneCombatState(game);
    enemy = simGetUnit(state, "pursuer");
    enemy.hp = enemy.maxHp - 1;
    assert(simHealWithCharge(enemy, 2, { logs: [] }) === 1 && enemy.charge === 1,
      "healing with only one missing HP should add one charge");

    state = cloneCombatState(game);
    enemy = simGetUnit(state, "pursuer");
    assert(simHealWithCharge(enemy, 2, { logs: [] }) === 0 && enemy.charge === 0,
      "overhealing a full enemy should add no charge");

    enemy.hp = enemy.maxHp - 4;
    simHealWithCharge(enemy, 1, { logs: [] });
    simHealWithCharge(enemy, 1, { logs: [] });
    simHealWithCharge(enemy, 1, { logs: [] });
    assert(enemy.charge === 2, "charge should cap at two across repeated healing");

    getUnit("pursuer").charge = 2;
    endTurnCleanup();
    assert(getUnit("pursuer").charge === 0, "charge should clear at turn end");
  }

  {
    const expectedSplash = [2, 3, 4];
    for (let charge = 0; charge <= 2; charge += 1) {
      resetGame();
      game.intents = [];
      const primary = getUnit("pursuer");
      const neighbor = getUnit("bastion");
      primary.x = 2; primary.y = 4; primary.charge = charge;
      neighbor.x = 3; neighbor.y = 4;
      if (charge === 2) neighbor.marked = true;
      getUnit("cantor").x = 5; getUnit("cantor").y = 0;
      game.queue = [queued("arc_spark", "iona", "pursuer")];
      const forecast = predictTimeline();
      assert(simGetUnit(forecast.final, "pursuer").hp === 5, "charge must not increase Arc Spark primary damage");
      assert(simGetUnit(forecast.final, "bastion").hp === 12 - expectedSplash[charge],
        "charge " + charge + " should produce splash " + expectedSplash[charge]);
      if (charge === 2) assert(simGetUnit(forecast.final, "bastion").marked,
        "a Mark on the chained neighbor should not add damage or be consumed");
      assert(simGetUnit(forecast.final, "pursuer").charge === 0, "a real chain should consume primary charge");
    }
  }

  {
    resetGame();
    const primary = getUnit("pursuer");
    const bastion = getUnit("bastion");
    const cantor = getUnit("cantor");
    const iona = getUnit("iona");
    primary.x = 2; primary.y = 4; primary.hp = 2;
    bastion.x = 3; bastion.y = 4;
    cantor.x = 2; cantor.y = 3;
    game.queue = [
      queued("hunters_mark", "vale", "pursuer"),
      queued("arc_spark", "iona", "pursuer")
    ];
    game.intents = [intent(cantor, "drain", "吸命", "normal", iona, "test")];
    const forecast = predictTimeline();
    assert(forecast.events[0].payload.id === "drain", "NORMAL Drain should resolve before the two SLOW commands");
    assert(simGetUnit(forecast.initial, "pursuer").charge === 0,
      "the pre-Drain timeline state should not display future charge");
    const afterDrain = forecast.snapshots[0];
    assert(simGetUnit(afterDrain.state, "pursuer").hp === 4 && simGetUnit(afterDrain.state, "pursuer").charge === 2,
      "Drain should turn HP2 into HP4 and charge2");
    assert(afterDrain.outcome.groups.some(group => group.type === "heal") && afterDrain.outcome.groups.some(group => group.type === "charge"),
      "Drain result should expose both healing and charge changes");
    assert(simGetUnit(forecast.final, "pursuer").hp === 0 && simGetUnit(forecast.final, "pursuer").charge === 0,
      "marked Arc Spark should deal six to the primary and consume charge despite KO");
    assert(simGetUnit(forecast.final, "bastion").hp === 8 && simGetUnit(forecast.final, "cantor").hp === 3,
      "charge2 should deal four to each orthogonal neighbor");
    const expected = comparableState(forecast.final);
    await executeTurn();
    assert(comparableState(game.lastResolvedState) === expected,
      "Drain, charge, marked chain, KO, and charge consumption should execute exactly as forecast");
  }

  {
    resetGame();
    game.intents = [];
    const primary = getUnit("pursuer");
    primary.x = 0; primary.y = 2; primary.charge = 2;
    getUnit("iona").x = 0; getUnit("iona").y = 5;
    getUnit("bastion").x = 4; getUnit("bastion").y = 0;
    getUnit("cantor").x = 5; getUnit("cantor").y = 0;
    game.queue = [queued("arc_spark", "iona", "pursuer")];
    const forecast = predictTimeline();
    const sparkOutcome = forecast.snapshots[0].outcome;
    assert(simGetUnit(forecast.final, "pursuer").charge === 2,
      "Arc Spark without a chain target should not consume charge before cleanup");
    assert(sparkOutcome.groups.some(group => group.type === "chain" && group.summary.includes("連鎖先なし")),
      "no-chain result should explicitly say the charge bonus was unavailable");
    const expected = comparableState(forecast.final);
    await executeTurn();
    assert(comparableState(game.lastResolvedState) === expected && getUnit("pursuer").charge === 0,
      "no-chain non-consumption and turn-end charge expiry should match execution");
  }

  {
    resetGame();
    game.intents = [];
    const primary = getUnit("pursuer");
    const orthogonal = getUnit("bastion");
    const diagonal = getUnit("cantor");
    primary.x = 1; primary.y = 4; primary.hp = 3; primary.charge = 2;
    orthogonal.x = 2; orthogonal.y = 4;
    diagonal.x = 2; diagonal.y = 3;
    getUnit("iona").x = 1; getUnit("iona").y = 5;
    game.queue = [queued("arc_spark", "iona", "pursuer")];
    const forecast = predictTimeline();
    assert(simGetUnit(forecast.final, "pursuer").hp === 0, "Arc Spark primary should be able to KO");
    assert(simGetUnit(forecast.final, "bastion").hp === 8,
      "an orthogonal enemy should still be chained after the primary is KO'd");
    assert(simGetUnit(forecast.final, "cantor").hp === 7,
      "a diagonal enemy must never be included in Arc Spark chaining");
  }

  {
    resetGame();
    const primary = getUnit("pursuer");
    const bastion = getUnit("bastion");
    const cantor = getUnit("cantor");
    primary.x = 2; primary.y = 4; primary.hp = 2;
    bastion.x = 3; bastion.y = 4;
    cantor.x = 2; cantor.y = 3;
    game.queue = [queued("hunters_mark", "vale", "pursuer")];
    game.intents = [intent(cantor, "drain", "吸命", "normal", getUnit("iona"), "test")];
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.selectedInstanceId = spark.instanceId;
    const context = selectionTimelineContext();
    assert(simGetUnit(context.state, "pursuer").charge === 2 && simGetUnit(context.state, "pursuer").marked,
      "Arc Spark selection pre-state should include earlier Drain charge and SLOW Mark");
    const breakdown = arcSparkBreakdown(context.state, simGetUnit(context.state, "pursuer"));
    assert(breakdown.includes("本体6（印+3）") && breakdown.includes("隣接2体へ各4（帯電+2）"),
      "target selection breakdown should show primary, mark, neighbor count, and charge bonus");
    renderControls();
    assert(el.modeHelp.textContent.includes("本体6") && el.modeHelp.textContent.includes("帯電+2"),
      "Arc Spark selection UI should display the dynamic breakdown");
    const chargedToken = renderUnit(simGetUnit(context.state, "pursuer"));
    assert(chargedToken.innerHTML.includes("⚡ 帯電2") && chargedToken.title.includes("ターン終了"),
      "board token should show charge value and its short lifetime explanation");
  }

  {
    resetGame();
    const pursuer = getUnit("pursuer");
    pursuer.x = 0; pursuer.y = 2; pursuer.hp = 2;
    game.queue = [queued("quickshot", "vale", "pursuer")];
    game.intents = [intent(pursuer, "recover", "息を整える", "slow", getUnit("rook"), "test")];
    const forecast = predictTimeline();
    assert(cardDefs.quickshot.speed === "fast" && simGetUnit(forecast.snapshots[0].state, "pursuer").hp === 0,
      "FAST Quickshot should remain a two-damage single-target finisher");
    assert(forecast.snapshots[1].outcome.status === "cancelled",
      "Quickshot KO should still cancel the defeated enemy's later action");
  }

  {
    assert(styleSource.includes("[hidden] { display: none !important; }"),
      "CSS should contain the global important hidden contract");
    resetGame();
    assertControlsHidden("initial render");
    assert(el.timelineDetail.hidden && getComputedStyle(el.timelineDetail).display === "none",
      "initial timeline detail should remain hidden with computed display none");

    game.intents = [];
    const primary = getUnit("pursuer");
    const neighbor = getUnit("bastion");
    primary.x = 2; primary.y = 4; primary.charge = 2; primary.marked = true;
    neighbor.x = 3; neighbor.y = 4;
    const spark = makeCardInstance("arc_spark");
    const quickshot = makeCardInstance("quickshot");
    game.hand = [spark, quickshot];

    selectCard(spark.instanceId);
    assert(!el.modeBar.hidden && !el.cancel.hidden, "Arc Spark selection should show mode controls");
    assert(getComputedStyle(el.modeBar).display === "grid", "selected mode bar should have computed grid display");
    assert(el.modeHelp.textContent.includes("追跡獣") && el.modeHelp.textContent.includes("本体6")
      && el.modeHelp.textContent.includes("隣接1体") && el.modeHelp.textContent.includes("帯電+2"),
      "Arc Spark selection should show only its current dynamic breakdown");

    selectCard(spark.instanceId);
    assertControlsHidden("same-card deselection");

    selectCard(spark.instanceId);
    el.cancel.listeners.click();
    assertControlsHidden("cancel button deselection");

    selectCard(spark.instanceId);
    selectCard(quickshot.instanceId);
    assert(!el.modeBar.hidden && getComputedStyle(el.modeBar).display === "grid", "switching cards should keep current selection controls visible");
    assert(el.modeHelp.textContent === "FASTで解決", "new card should replace the previous card's help");
    ["追跡獣", "本体", "隣接", "帯電", "連鎖先なし"].forEach(staleText =>
      assert(!el.modeHelp.textContent.includes(staleText), "switched-card help must remove stale text: " + staleText));

    game.selectedInstanceId = "removed-card-id";
    el.modeHelp.textContent = "追跡獣 本体6 隣接1体 帯電2 連鎖先なし";
    renderControls();
    assertControlsHidden("stale selected card id");
  }

  {
    resetGame();
    game.intents = [];
    const primary = getUnit("pursuer");
    primary.x = 2; primary.y = 4;
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.queue = [];
    selectCard(spark.instanceId);
    assert(!el.modeBar.hidden && el.modeHelp.textContent !== "", "selection should populate mode help before target confirmation");
    handleCellClick(2, 4);
    assert(game.queue.length === 1, "target confirmation should commit the selected card");
    assertControlsHidden("target confirmation");

    game.selectedInstanceId = spark.instanceId;
    el.modeHelp.textContent = "old final preview value";
    el.previewFinal.listeners.click();
    assertControlsHidden("final forecast");
  }

  {
    resetGame();
    game.intents = [];
    const primary = getUnit("pursuer");
    primary.x = 2; primary.y = 4;
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.queue = [];
    selectCard(spark.instanceId);
    handleCellClick(2, 4);
    let resolvingChecks = 0;
    pause = async () => {
      assert(game.phase === "resolving", "pause hook should observe resolving phase");
      assertControlsHidden("resolving event");
      resolvingChecks += 1;
    };
    await executeTurn();
    pause = async () => {};
    assert(resolvingChecks > 0, "execution test should inspect at least one resolving frame");
    assert(game.phase === "planning" && game.turn === 2, "execution should advance to the next planning turn");
    assertControlsHidden("next turn start");
  }

  {
    resetGame();
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.selectedInstanceId = spark.instanceId;
    game.phase = "ended";
    el.modeHelp.textContent = "stale ended value";
    renderControls();
    assertControlsHidden("battle ended");

    showHelp();
    assert(!el.modal.hidden && getComputedStyle(el.modal).display === "grid", "existing modal should remain visible when hidden is removed");
    el.modalButton.listeners.click();
    assert(el.modal.hidden && getComputedStyle(el.modal).display === "none", "existing modal hidden state should compute to display none");

    resetGame();
    game.intents = [];
    game.queue = [queued("quickshot", "vale", "pursuer")];
    game.previewIndex = 0;
    renderTimeline();
    assert(!el.timelineDetail.hidden && getComputedStyle(el.timelineDetail).display === "block",
      "selected timeline detail should still become visible");
    game.previewIndex = null;
    renderTimeline();
    assert(el.timelineDetail.hidden && getComputedStyle(el.timelineDetail).display === "none",
      "timeline detail should still hide without a selected event");
  }

  {
    resetGame();
    game.intents = [];
    const quickshot = makeCardInstance("quickshot");
    const shield = makeCardInstance("shield_lock");
    game.hand = [quickshot, shield];
    game.queue = [];
    selectCard(quickshot.instanceId);
    assert(validCells().length === 0, "out-of-range Quickshot should have no legal target cells");
    assert(el.modeHelp.textContent.includes("この命令の直前では射程3内に敵がいません。"),
      "out-of-range enemy technique should explain its actual range at the provisional pre-state");
    ["前の命令を変える", "別カードを選ぶ", "移動命令に変換", "選択解除"].forEach(actionText =>
      assert(el.modeHelp.textContent.includes(actionText), "zero-target help should name the existing action: " + actionText));
    assert(el.instruction.textContent === "固有技の対象がありません。移動へ切り替えるか、選択解除してください。",
      "battlefield instruction should replace the inert target prompt for a zero-target technique");
    assert(game.selectedInstanceId === quickshot.instanceId && game.mode === "technique"
      && game.moveUnitId === null && game.queue.length === 0 && game.hand.length === 2,
      "zero-target guidance must not switch mode, confirm, queue, or remove the selected card");

    setMode("move");
    assert(game.selectedInstanceId === quickshot.instanceId && game.mode === "move" && validCells().length > 0,
      "movement conversion should preserve selection and expose the existing living-ally choices");
    assert(el.modeHelp.textContent === "動かす味方を選択", "movement mode should replace zero-target technique help");
    assertNoUnavailableGuidance("movement conversion");
    setMode("technique");
    assert(validCells().length === 0 && el.modeHelp.textContent.includes("射程3内に敵がいません"),
      "returning to unchanged technique mode should restore the zero-target reason");

    selectCard(shield.instanceId);
    assert(validCells().length === 1 && el.modeHelp.textContent === "FASTで解決",
      "switching to a legal card should restore the unchanged normal selection help");
    assert(el.instruction.textContent === "この命令の直前：盾を固めるの対象を選んでください。",
      "a legal card should retain the existing target instruction");
    assertNoUnavailableGuidance("legal card switch");
    const rook = getUnit("rook");
    handleCellClick(rook.x, rook.y);
    assert(game.queue.length === 1, "legal target confirmation should still queue exactly one command");
    assertControlsHidden("ACT 06 target confirmation");
    assertNoUnavailableGuidance("target confirmation");

    el.previewFinal.listeners.click();
    assertControlsHidden("ACT 06 final forecast");
    assertNoUnavailableGuidance("final forecast");
    let resolvingChecks = 0;
    pause = async () => {
      assertControlsHidden("ACT 06 resolving");
      assertNoUnavailableGuidance("resolving");
      resolvingChecks += 1;
    };
    await executeTurn();
    pause = async () => {};
    assert(resolvingChecks > 0 && game.phase === "planning" && game.turn === 2,
      "ACT 06 execution should be observed and advance to the next turn");
    assertControlsHidden("ACT 06 next turn");
    assertNoUnavailableGuidance("next turn");

    game.phase = "ended";
    el.modeHelp.textContent = "この命令の直前では射程3内に敵がいません。";
    el.instruction.textContent = "固有技の対象がありません。";
    renderControls();
    assertControlsHidden("ACT 06 ended");
    assertNoUnavailableGuidance("ended phase");
  }

  {
    resetGame();
    game.intents = [];
    const quickshot = makeCardInstance("quickshot");
    game.hand = [quickshot];
    selectCard(quickshot.instanceId);
    assert(el.modeHelp.textContent.includes("射程3内に敵がいません"),
      "deselection regression should begin from zero-target guidance");
    selectCard(quickshot.instanceId);
    assertControlsHidden("ACT 06 same-card deselection");
    assertNoUnavailableGuidance("same-card deselection");
    selectCard(quickshot.instanceId);
    el.cancel.listeners.click();
    assertControlsHidden("ACT 06 cancel-button deselection");
    assertNoUnavailableGuidance("cancel-button deselection");
  }

  {
    resetGame();
    game.intents = [];
    for (const enemy of living("enemy")) enemy.hp = 0;
    const quickshot = makeCardInstance("quickshot");
    game.hand = [quickshot];
    selectCard(quickshot.instanceId);
    assert(validCells().length === 0 && el.modeHelp.textContent.includes("対象になる生存敵がいません。"),
      "an absent enemy population should be distinguished from an out-of-range enemy");
    assert(!el.modeHelp.textContent.includes("射程3内に敵がいません"),
      "enemy absence should report only one reason");
    assert(game.selectedInstanceId === quickshot.instanceId && game.mode === "technique" && game.queue.length === 0,
      "enemy absence must leave the selected technique unchanged and unqueued");
  }

  {
    resetGame();
    const rook = getUnit("rook");
    const pursuer = getUnit("pursuer");
    rook.x = 1; rook.y = 4;
    pursuer.x = 4; pursuer.y = 4;
    game.intents = [intent(pursuer, "stalk", "忍び寄る", "fast", rook, "test")];
    const pommel = makeCardInstance("pommel_break");
    game.hand = [pommel];
    game.queue = [];
    selectCard(pommel.instanceId);
    assert(validCells().some(cell => cell.x === 2 && cell.y === 4),
      "the post-FAST enemy position should remain a legal provisional target");
    assert(el.modeHelp.textContent === "NORMALで解決"
      && el.instruction.textContent === "この命令の直前：柄打ちの対象を選んでください。",
      "a target entering range before the command should keep the existing normal guidance");
    assertNoUnavailableGuidance("post-FAST legal enemy target");
  }

  {
    resetGame();
    game.intents = [];
    const pursuer = getUnit("pursuer");
    pursuer.x = 2; pursuer.y = 4; pursuer.hp = 2;
    getUnit("bastion").hp = 0;
    getUnit("cantor").hp = 0;
    const firstShot = queued("quickshot", "vale", "pursuer");
    const spark = makeCardInstance("arc_spark");
    game.queue = [firstShot];
    game.hand = [spark];
    selectCard(spark.instanceId);
    assert(validCells().length === 0 && el.modeHelp.textContent.includes("対象になる生存敵がいません。"),
      "a sole enemy defeated by an earlier command should produce target-absence guidance");
    assert(game.queue.length === 1 && game.selectedInstanceId === spark.instanceId,
      "the prior-KO warning must not mutate the command sequence or current selection");
    undoLast();
    selectCard(spark.instanceId);
    assert(validCells().some(cell => cell.x === 2 && cell.y === 4),
      "undoing the prior KO should restore the enemy as a legal Arc Spark target");
    assert(el.instruction.textContent === "この命令の直前：連鎖火花の対象を選んでください。",
      "undoing the prior KO should restore the existing normal target prompt");
    assertNoUnavailableGuidance("undo prior KO");
  }

  {
    resetGame();
    game.intents = [];
    const rook = getUnit("rook");
    rook.x = 0; rook.y = 0;
    getUnit("vale").x = 5; getUnit("vale").y = 5;
    getUnit("iona").x = 5; getUnit("iona").y = 4;
    const interpose = makeCardInstance("interpose");
    game.hand = [interpose];
    selectCard(interpose.instanceId);
    assert(validCells().length === 0 && el.modeHelp.textContent.includes("射程2内に対象となる味方がいません。"),
      "ally-target techniques should identify an unavailable ally rather than an enemy");
    assert(!el.modeHelp.textContent.includes("敵がいません") && !el.modeHelp.textContent.includes("空きマス"),
      "ally-target guidance must not use enemy or empty-cell reasons");
  }

  {
    resetGame();
    game.intents = [];
    const iona = getUnit("iona");
    iona.x = 0; iona.y = 0;
    const originalWallCount = WALLS.length;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (distance(iona, { x, y }) <= cardDefs.ember_rune.range && isEmpty(x, y)) WALLS.push({ x, y });
      }
    }
    const ember = makeCardInstance("ember_rune");
    game.hand = [ember];
    selectCard(ember.instanceId);
    assert(validCells().length === 0 && el.modeHelp.textContent.includes("射程3内に置ける空きマスがありません。"),
      "empty-cell techniques should identify unavailable empty cells rather than units");
    assert(!el.modeHelp.textContent.includes("敵がいません") && !el.modeHelp.textContent.includes("味方がいません"),
      "empty-cell guidance must not use enemy or ally reasons");
    WALLS.length = originalWallCount;
  }

  {
    resetGame();
    const iona = getUnit("iona");
    const pursuer = getUnit("pursuer");
    const cantor = getUnit("cantor");
    iona.hp = 2;
    pursuer.x = 2; pursuer.y = 3;
    game.intents = [intent(cantor, "drain", "生命吸収", "normal", iona, "test")];
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.queue = [];
    const liveBeforeSelection = comparableState(cloneCombatState(game));
    selectCard(spark.instanceId);
    const context = selectionTimelineContext();
    assert(context.action.mode === "technique" && context.action.speed === "slow",
      "a live Arc Spark owner should keep the printed technique and SLOW speed");
    assert(simGetUnit(context.state, "iona").hp === 0 && validCells(context).length === 0,
      "NORMAL Drain should defeat HP2 Iona before the provisional SLOW Arc Spark");
    assert(el.modeHelp.textContent.includes("実行不能：イオナは先行するNORMAL「生命吸収」で戦闘不能になります。"),
      "actor-unavailable guidance should name the owner and the existing lethal prior event");
    ["前の命令で守る／移動する", "別カード", "移動命令に変換", "選択解除"].forEach(actionText =>
      assert(el.modeHelp.textContent.includes(actionText), "actor-unavailable help should retain the existing category: " + actionText));
    assert(el.instruction.textContent === "命令者が先に戦闘不能になります。行動順か命令を組み直してください。",
      "battlefield instruction should prioritize the actor's prior defeat");
    assert(!el.modeHelp.textContent.includes("射程3内に敵がいません")
      && !el.modeHelp.textContent.includes("対象になる生存敵がいません")
      && !el.modeHelp.textContent.includes("ダメージ"),
      "actor defeat should be exclusive of target, range, and damage-breakdown reasons");
    assert(game.selectedInstanceId === spark.instanceId && game.mode === "technique"
      && game.moveUnitId === null && game.queue.length === 0 && game.hand.length === 1,
      "actor warning must not convert, move, confirm, queue, or remove the selected card");
    assert(comparableState(cloneCombatState(game)) === liveBeforeSelection,
      "actor warning and cause extraction must not mutate live combat state");
  }

  {
    resetGame();
    const iona = getUnit("iona");
    const pursuer = getUnit("pursuer");
    const cantor = getUnit("cantor");
    iona.hp = 2;
    pursuer.x = 2; pursuer.y = 3;
    game.intents = [intent(cantor, "drain", "生命吸収", "normal", iona, "test")];
    const interpose = makeCardInstance("interpose");
    const spark = makeCardInstance("arc_spark");
    game.hand = [interpose, spark];
    game.queue = [];
    selectCard(spark.instanceId);
    assert(el.modeHelp.textContent.includes("先行するNORMAL「生命吸収」"),
      "survival-replanning test should begin with the prior-defeat warning");
    selectCard(spark.instanceId);
    selectCard(interpose.instanceId);
    handleCellClick(iona.x, iona.y);
    assert(game.queue.length === 1 && game.queue[0].cardId === "interpose",
      "the existing FAST defense should be queued without special ACT 07 behavior");
    selectCard(spark.instanceId);
    const protectedContext = selectionTimelineContext();
    assert(simGetUnit(protectedContext.state, "iona").hp === 2 && validCells(protectedContext).some(cell => cell.x === 2 && cell.y === 3),
      "prior FAST guard should keep Iona alive and restore the in-range enemy target");
    assert(el.modeHelp.textContent.includes("SLOWで解決") && el.modeHelp.textContent.includes("追跡獣")
      && el.instruction.textContent === "この命令の直前：連鎖火花の対象を選んでください。",
      "survival should restore Arc Spark's existing speed, breakdown, and target prompt");
    assertNoActorUnavailableGuidance("protected Arc Spark");
    undoLast();
    selectCard(spark.instanceId);
    assert(validCells().length === 0 && el.modeHelp.textContent.includes("先行するNORMAL「生命吸収」"),
      "undoing the protective command should restore the same prior-defeat warning");
  }

  {
    resetGame();
    const iona = getUnit("iona");
    const pursuer = getUnit("pursuer");
    const bastion = getUnit("bastion");
    const cantor = getUnit("cantor");
    iona.hp = 3;
    pursuer.x = 2; pursuer.y = 3;
    game.intents = [intent(pursuer, "drain", "一撃目", "normal", iona, "test"),
      intent(bastion, "drain", "決定打", "normal", iona, "test"),
      intent(cantor, "drain", "追撃", "normal", iona, "test")];
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.queue = [];
    selectCard(spark.instanceId);
    assert(el.modeHelp.textContent.includes("先行するNORMAL「決定打」"),
      "multiple prior damage events should report the event that first changes HP to zero");
    assert(!el.modeHelp.textContent.includes("一撃目") && !el.modeHelp.textContent.includes("追撃"),
      "the actor warning should not list earlier nonlethal or later events");
  }

  {
    resetGame();
    game.intents = [];
    const iona = getUnit("iona");
    const pursuer = getUnit("pursuer");
    iona.hp = 2;
    pursuer.x = 2; pursuer.y = 3;
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.queue = [];
    selectCard(spark.instanceId);
    const normalContext = selectionTimelineContext();
    const artificialState = cloneCombatState(normalContext.state);
    simGetUnit(artificialState, "iona").hp = 0;
    const artificialContext = { ...normalContext, state: artificialState, snapshots: [] };
    const actualSelectionTimelineContext = selectionTimelineContext;
    selectionTimelineContext = () => artificialContext;
    renderControls();
    assert(el.modeHelp.textContent.includes("実行不能：イオナはこの命令の直前に戦闘不能です。"),
      "an artificial state without a matching lethal snapshot should use the safe fallback");
    assert(!el.modeHelp.textContent.includes("先行する"),
      "the fallback must not invent a causal event");
    selectionTimelineContext = actualSelectionTimelineContext;
    renderControls();
    assertNoActorUnavailableGuidance("fallback context restoration");
  }

  {
    resetGame();
    game.intents = [];
    getUnit("iona").hp = 0;
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    game.queue = [];
    selectCard(spark.instanceId);
    const legacyContext = selectionTimelineContext();
    assert(legacyContext.action.mode === "legacy" && legacyContext.action.speed === "fast",
      "a card whose owner is already defeated should retain the existing FAST legacy mode");
    assert(validCells(legacyContext).length === 2,
      "Iona's existing legacy should retain its living-ally target cells");
    assert(el.modeHelp.textContent === "持ち主が倒れたため、遺志として使用"
      && el.instruction.textContent === "この命令の直前：遺志：残響の対象を選んでください。",
      "an owner already defeated at selection start should keep the existing legacy guidance");
    assertNoActorUnavailableGuidance("existing legacy boundary");
  }

  {
    resetGame();
    const iona = getUnit("iona");
    const pursuer = getUnit("pursuer");
    const cantor = getUnit("cantor");
    iona.hp = 2;
    pursuer.x = 2; pursuer.y = 3;
    game.intents = [intent(cantor, "drain", "生命吸収", "normal", iona, "test")];
    const spark = makeCardInstance("arc_spark");
    const shield = makeCardInstance("shield_lock");
    game.hand = [spark, shield];
    game.queue = [];
    selectCard(spark.instanceId);
    assert(el.modeHelp.textContent.includes("実行不能：イオナ"),
      "clear-transition coverage should begin from actor-unavailable guidance");
    setMode("move");
    assertNoActorUnavailableGuidance("ACT 07 movement mode");
    setMode("technique");
    assert(el.modeHelp.textContent.includes("実行不能：イオナ"),
      "returning to unchanged technique mode should restore actor-unavailable guidance");
    selectCard(shield.instanceId);
    assert(validCells().length === 1 && el.modeHelp.textContent === "FASTで解決",
      "switching to a legal card should restore its unchanged normal guidance");
    assertNoActorUnavailableGuidance("ACT 07 other card");
    const rook = getUnit("rook");
    handleCellClick(rook.x, rook.y);
    assertControlsHidden("ACT 07 target confirmation");
    assertNoActorUnavailableGuidance("ACT 07 target confirmation");
    el.previewFinal.listeners.click();
    assertControlsHidden("ACT 07 final forecast");
    assertNoActorUnavailableGuidance("ACT 07 final forecast");
    let resolvingChecks = 0;
    pause = async () => {
      assertControlsHidden("ACT 07 resolving");
      assertNoActorUnavailableGuidance("ACT 07 resolving");
      resolvingChecks += 1;
    };
    await executeTurn();
    pause = async () => {};
    assert(resolvingChecks > 0 && game.phase === "planning" && game.turn === 2,
      "ACT 07 execution should be observed and reach the next planning turn");
    assertControlsHidden("ACT 07 next turn");
    assertNoActorUnavailableGuidance("ACT 07 next turn");
    game.phase = "ended";
    el.modeHelp.textContent = "実行不能：イオナは先行するNORMAL「生命吸収」で戦闘不能になります。";
    el.instruction.textContent = "命令者が先に戦闘不能になります。";
    renderControls();
    assertControlsHidden("ACT 07 ended");
    assertNoActorUnavailableGuidance("ACT 07 ended");
  }

  {
    resetGame();
    const iona = getUnit("iona");
    const pursuer = getUnit("pursuer");
    const cantor = getUnit("cantor");
    iona.hp = 2;
    pursuer.x = 2; pursuer.y = 3;
    game.intents = [intent(cantor, "drain", "生命吸収", "normal", iona, "test")];
    const spark = makeCardInstance("arc_spark");
    game.hand = [spark];
    selectCard(spark.instanceId);
    el.cancel.listeners.click();
    assertControlsHidden("ACT 07 cancel selection");
    assertNoActorUnavailableGuidance("ACT 07 cancel selection");
  }

  {
    assert(cardDefs.ember_rune.speed === "normal" && cardDefs.ember_rune.range === 3
      && cardDefs.ember_rune.target === "empty",
      "ACT 08 must preserve Ember Rune's NORMAL speed, range 3, and empty-cell target");
    assert(cardDefs.ember_rune.text === "射程3。空きマスに罠を設置。敵が踏むと3ダメージを与え、その移動の残り歩数を失わせる。発動後に消滅。",
      "Ember Rune card text should match the decided ACT 08 contract");
    assert(readmeSource.includes("現在解決中の移動イベントの残り歩数を失います")
      && readmeSource.includes("別の後続移動イベントは取り消しません"),
      "README should document the current-movement-only Ember Rune contract");
    assert(designSource.includes("remaining steps of only that movement event end")
      && designSource.includes("does not apply Root"),
      "DESIGN should document movement-local stopping without Root");

    const lane = resetTrapLane();
    game.queue = [queued("ember_rune", "iona", null, "normal", { target: { x: 3, y: 4 } })];
    game.intents = [intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test")];
    const forecast = predictTimeline();
    const pounceIndex = forecast.events.findIndex(event => event.kind === "enemy" && event.payload.id === "pounce");
    const pounceSnapshot = forecast.snapshots[pounceIndex];
    const stoppedPursuer = simGetUnit(pounceSnapshot.state, "pursuer");
    const untouchedRook = simGetUnit(pounceSnapshot.state, "rook");
    assert(stoppedPursuer.x === 3 && stoppedPursuer.y === 4 && stoppedPursuer.hp === 5,
      "a first-step NORMAL trap should deal 3 and stop Pounce on the entered cell");
    assert(untouchedRook.hp === untouchedRook.maxHp && pounceSnapshot.outcome.logs.includes("追跡獣の飛びかかりは届かなかった。"),
      "Pounce stopped while nonadjacent should keep the existing missed result and deal no attack damage");
    assert(pounceSnapshot.state.emberRunes.length === 0 && !stoppedPursuer.rooted,
      "the triggered trap should disappear without applying Root");
    assert(pounceSnapshot.outcome.logs.filter(message => message === trapStopText).length === 1,
      "one trap trigger should emit exactly one movement-stop result log");
    assert(pounceSnapshot.outcome.groups.filter(group => group.type === "move_stop"
      && group.summary === trapStopText).length === 1,
      "one trap trigger should produce exactly one structured movement-stop group");
    assert(pounceSnapshot.outcome.summary.includes(trapStopText),
      "the movement-stop group should remain visible in the compact timeline result");
    renderTimeline();
    assert(el.timeline.children[pounceIndex].innerHTML.includes(trapStopText),
      "the rendered enemy timeline event should display the trap movement stop");
    renderBoard();
    const forecastStopCell = el.board.children[4 * SIZE + 3];
    assert(forecastStopCell.children.length === 1 && forecastStopCell.children[0].innerHTML.includes("8→5"),
      "the final forecast board should show Pursuer stopped on the trap cell with predicted HP loss");
    const forecastFinal = comparableState(forecast.final);
    pause = async () => {};
    await executeTurn();
    assert(comparableState(game.lastResolvedState) === forecastFinal,
      "trap stopping position, HP, rune removal, and follow-up result should match forecast and execution");
    assert(game.log.filter(entry => entry.message === trapStopText).length === 1,
      "live execution should write exactly one movement-stop log entry");
    renderBoard();
    const executedStopCell = el.board.children[4 * SIZE + 3];
    assert(executedStopCell.children.length === 1 && executedStopCell.children[0].innerHTML.includes("5/8"),
      "the post-execution board should show the same stopped cell and HP");
  }

  {
    const lane = resetTrapLane();
    game.queue = [queued("ember_rune", "iona", null, "normal", { target: { x: 2, y: 4 } })];
    game.intents = [intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test")];
    const final = predictTimeline().final;
    assert(simGetUnit(final, "pursuer").x === 2 && simGetUnit(final, "pursuer").hp === 5,
      "a second-step NORMAL trap should stop Pounce on its own cell after 3 damage");
    assert(simGetUnit(final, "rook").hp === simGetUnit(final, "rook").maxHp && final.emberRunes.length === 0,
      "second-step nonadjacent stopping should prevent Pounce damage and consume the trap");
  }

  {
    const lane = resetTrapLane("pursuer", 3);
    game.queue = [queued("ember_rune", "iona", null, "normal", { target: { x: 1, y: 4 } })];
    game.intents = [intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test")];
    const forecast = predictTimeline();
    const pounceSnapshot = forecast.snapshots.find(snapshot => snapshot.eventKey.includes("pounce"));
    assert(simGetUnit(pounceSnapshot.state, "pursuer").x === 1 && simGetUnit(pounceSnapshot.state, "pursuer").hp === 5,
      "an adjacent trap cell should still deal 3 and end the current Pounce movement");
    assert(simGetUnit(pounceSnapshot.state, "rook").hp === 7,
      "Pounce should still deal its existing 4 damage when the stopped enemy is orthogonally adjacent");
    assert(pounceSnapshot.outcome.logs.filter(message => message === trapStopText).length === 1,
      "adjacent post-trap attack should not duplicate the movement-stop result");
  }

  {
    const lane = resetTrapLane("bastion", 2);
    game.queue = [queued("ember_rune", "iona", null, "normal", { target: { x: 1, y: 4 } })];
    game.intents = [intent(lane.mover, "shield_drive", "盾の圧力", "normal", lane.target, "test")];
    const forecast = predictTimeline();
    const driveSnapshot = forecast.snapshots.find(snapshot => snapshot.eventKey.includes("shield_drive"));
    const stoppedBastion = simGetUnit(driveSnapshot.state, "bastion");
    const struckRook = simGetUnit(driveSnapshot.state, "rook");
    assert(stoppedBastion.x === 1 && stoppedBastion.hp === 9 && driveSnapshot.state.emberRunes.length === 0,
      "Shield Drive should take 3, consume the trap, and end its current movement on the trap cell");
    assert(struckRook.hp === 8 && struckRook.exposed,
      "adjacent Shield Drive should still deal 3 and apply Exposed after the trap stop");
    assert(driveSnapshot.outcome.groups.filter(group => group.type === "move_stop").length === 1,
      "Shield Drive should report exactly one structured trap stop");
  }

  {
    const lane = resetTrapLane();
    game.queue = [queued("ember_rune", "iona", null, "normal", { target: { x: 3, y: 4 } })];
    game.intents = [intent(lane.mover, "stalk", "忍び寄る", "fast", lane.target, "test")];
    const forecast = predictTimeline();
    assert(forecast.events[0].payload.id === "stalk" && forecast.events[1].payload.cardId === "ember_rune",
      "FAST Stalk should resolve before a same-turn NORMAL Ember Rune placement");
    assert(simGetUnit(forecast.final, "pursuer").x === 2 && simGetUnit(forecast.final, "pursuer").hp === 8,
      "a later NORMAL trap must not retroactively stop or damage the earlier FAST movement");
    assert(forecast.final.emberRunes.some(cell => cell.x === 3 && cell.y === 4)
      && forecast.snapshots.every(snapshot => !snapshot.outcome.logs.includes(trapStopText)),
      "the post-movement trap should remain placed and report no trigger");
  }

  {
    const lane = resetTrapLane();
    game.emberRunes = [{ x: 3, y: 4 }];
    game.intents = [intent(lane.mover, "stalk", "忍び寄る", "fast", lane.target, "test")];
    const forecast = predictTimeline();
    const stalkSnapshot = forecast.snapshots[0];
    assert(simGetUnit(stalkSnapshot.state, "pursuer").x === 3 && simGetUnit(stalkSnapshot.state, "pursuer").hp === 5,
      "an already placed trap should stop FAST Stalk immediately after entry");
    assert(stalkSnapshot.state.emberRunes.length === 0
      && stalkSnapshot.outcome.groups.filter(group => group.type === "move_stop").length === 1,
      "a FAST trigger should consume the existing trap and report one movement stop");
  }

  {
    const lane = resetTrapLane();
    game.emberRunes = [{ x: 3, y: 4 }];
    const vale = getUnit("vale");
    vale.x = 4; vale.y = 5;
    game.queue = [queued("pinning_arrow", "vale", "pursuer")];
    game.intents = [intent(lane.mover, "stalk", "忍び寄る", "fast", lane.target, "test")];
    const forecast = predictTimeline();
    const stalkIndex = forecast.events.findIndex(event => event.kind === "enemy" && event.payload.id === "stalk");
    const stalkSnapshot = forecast.snapshots[stalkIndex];
    assert(simGetUnit(stalkSnapshot.state, "pursuer").x === 4
      && simGetUnit(stalkSnapshot.state, "pursuer").hp === 7
      && simGetUnit(stalkSnapshot.state, "pursuer").rooted,
      "Pinning Arrow should preserve its existing damage and Root while preventing Stalk movement");
    assert(stalkSnapshot.state.emberRunes.some(cell => cell.x === 3 && cell.y === 4)
      && !stalkSnapshot.outcome.logs.includes(trapStopText),
      "a trap should remain when the existing Root prevents movement onto it");
  }

  {
    const lane = resetTrapLane();
    game.emberRunes = [{ x: 4, y: 5 }];
    game.intents = [intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test")];
    const forecast = predictTimeline();
    const pounceSnapshot = forecast.snapshots[0];
    assert(simGetUnit(pounceSnapshot.state, "pursuer").x === 1 && simGetUnit(pounceSnapshot.state, "pursuer").hp === 8,
      "an off-path trap should not alter the existing Pounce path or HP");
    assert(simGetUnit(pounceSnapshot.state, "rook").hp === 7
      && pounceSnapshot.state.emberRunes.some(cell => cell.x === 4 && cell.y === 5),
      "an off-path trap should remain while the existing adjacent Pounce attack resolves");
    assert(!pounceSnapshot.outcome.logs.includes(trapStopText),
      "an off-path trap should not report a movement stop");
  }

  {
    const lane = resetTrapLane("pursuer", 1);
    game.emberRunes = [{ x: 2, y: 4 }];
    game.intents = [intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test")];
    const pounceSnapshot = predictTimeline().snapshots[0];
    assert(simGetUnit(pounceSnapshot.state, "pursuer").x === 1
      && simGetUnit(pounceSnapshot.state, "pursuer").hp === 8,
      "an enemy already adjacent to its target should not move or trigger a nearby trap");
    assert(simGetUnit(pounceSnapshot.state, "rook").hp === 7
      && pounceSnapshot.state.emberRunes.some(cell => cell.x === 2 && cell.y === 4),
      "a nonmoving adjacent enemy should keep its existing attack while leaving the trap untouched");
    assert(!pounceSnapshot.outcome.logs.includes(trapStopText),
      "a nonmoving enemy should not report a trap movement stop");
  }

  {
    const lane = resetTrapLane();
    game.emberRunes = [{ x: 3, y: 4 }, { x: 2, y: 4 }];
    game.intents = [intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test")];
    const forecast = predictTimeline();
    const pounceSnapshot = forecast.snapshots[0];
    assert(simGetUnit(pounceSnapshot.state, "pursuer").x === 3 && simGetUnit(pounceSnapshot.state, "pursuer").hp === 5,
      "the first trap on a movement path should stop that movement immediately");
    assert(pounceSnapshot.state.emberRunes.length === 1
      && pounceSnapshot.state.emberRunes[0].x === 2 && pounceSnapshot.state.emberRunes[0].y === 4,
      "only the first triggered trap should disappear; the later path trap should remain");
    assert(pounceSnapshot.outcome.logs.filter(message => message === trapStopText).length === 1,
      "multiple path traps should still produce one stop result in the current movement event");
  }

  {
    const lane = resetTrapLane();
    game.emberRunes = [{ x: 3, y: 4 }];
    game.intents = [
      intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test"),
      intent(lane.mover, "stalk", "二度目の移動", "slow", lane.target, "test")
    ];
    const forecast = predictTimeline();
    const firstSnapshot = forecast.snapshots[0];
    const secondSnapshot = forecast.snapshots[1];
    assert(simGetUnit(firstSnapshot.state, "pursuer").x === 3
      && firstSnapshot.outcome.logs.filter(message => message === trapStopText).length === 1,
      "the first movement event should stop on the triggered trap");
    assert(simGetUnit(secondSnapshot.state, "pursuer").x === 1 && !simGetUnit(secondSnapshot.state, "pursuer").rooted,
      "the same enemy should move normally in a separate later movement event");
    assert(simGetUnit(secondSnapshot.state, "rook").hp === 9
      && !secondSnapshot.outcome.logs.includes(trapStopText),
      "the later Stalk should retain its existing adjacent attack without a persistent stop state");
  }

  {
    const lane = resetTrapLane();
    game.emberRunes = [{ x: 3, y: 4 }];
    const simulated = cloneCombatState(game);
    const simulatedOutcome = { status: "resolved", reason: "", logs: [] };
    simMoveToward(simulated, simGetUnit(simulated, "pursuer"), simGetUnit(simulated, "rook"), 3, simulatedOutcome);
    pause = async () => {};
    await moveToward(lane.mover, lane.target, 3);
    assert(lane.mover.x === simGetUnit(simulated, "pursuer").x && lane.mover.y === simGetUnit(simulated, "pursuer").y
      && lane.mover.hp === simGetUnit(simulated, "pursuer").hp
      && JSON.stringify(game.emberRunes) === JSON.stringify(simulated.emberRunes),
      "the retained direct movement path should match the pure trap-stop position, HP, and rune removal");
    assert(lane.mover.x === 3 && lane.mover.hp === 5 && game.log.filter(entry => entry.message === trapStopText).length === 1,
      "the retained direct trap path should stop after the first entered trap and log it once");
    await moveToward(lane.mover, lane.target, 2);
    assert(lane.mover.x === 1 && !lane.mover.rooted,
      "a later direct movement call should proceed normally because the trap did not apply Root");
  }

  {
    const lane = resetTrapLane();
    game.queue = [queued("ember_rune", "iona", null, "normal", { target: { x: 3, y: 4 } })];
    game.intents = [intent(lane.mover, "pounce", "飛びかかり", "normal", lane.target, "test")];
    const forecast = predictTimeline();
    const events = buildResolutionEvents();
    pause = async () => {};
    for (const event of events) {
      if (event.kind === "player") await resolvePlayerAction(event.payload);
      else await resolveEnemyIntent(event.payload);
    }
    assert(comparableState(cloneCombatState(game)) === comparableState(forecast.final),
      "the retained direct player/enemy resolvers should match the pure full-event Ember Rune forecast");
    assert(game.log.filter(entry => entry.message === trapStopText).length === 1,
      "the retained direct full-event path should log exactly one movement stop");
  }

  {
    const boardCell = (x, y) => el.board.children[y * SIZE + x];
    resetGame();
    game.intents = [];
    const defeatedEnemy = getUnit("pursuer");
    const defeatedAlly = getUnit("iona");
    defeatedEnemy.x = 3; defeatedEnemy.y = 4; defeatedEnemy.hp = 0;
    defeatedAlly.x = 2; defeatedAlly.y = 5; defeatedAlly.hp = 0;
    renderBoard();
    assert(previewDisplayUnitAt(cloneCombatState(game), 3, 4) === undefined
      && previewDisplayUnitAt(cloneCombatState(game), 2, 5) === undefined,
      "ACT 09 display lookup should return neither defeated enemies nor defeated allies");
    assert(boardCell(3, 4).children.length === 0 && boardCell(2, 5).children.length === 0,
      "ACT 09 battlefield should create no unit DOM for HP0 records");
    assert(game.units.length === 6 && getUnit("pursuer").hp === 0 && getUnit("iona").hp === 0,
      "ACT 09 battlefield removal must retain all defeated records in live state");
    renderSquad();
    const ionaRow = el.squad.children.find(row => row.innerHTML.includes("イオナ"));
    assert(ionaRow && ionaRow.className.includes("down") && ionaRow.innerHTML.includes("0/7"),
      "a defeated ally should remain in SQUAD STATUS as down with zero HP");

    const shot = makeCardInstance("quickshot");
    game.hand = [shot];
    selectCard(shot.instanceId);
    assert(!validCells().some(cell => cell.x === 3 && cell.y === 4),
      "an HP0 enemy cell should remain excluded from attack targets");
  }

  {
    const boardCell = (x, y) => el.board.children[y * SIZE + x];
    resetGame();
    game.intents = [];
    const defeatedEnemy = getUnit("pursuer");
    defeatedEnemy.x = 2; defeatedEnemy.y = 4; defeatedEnemy.hp = 0;
    const ember = makeCardInstance("ember_rune");
    game.hand = [ember];
    game.queue = [];
    selectCard(ember.instanceId);
    assert(validCells().some(cell => cell.x === 2 && cell.y === 4),
      "a defeated enemy's cell should remain a legal empty-cell target");
    handleCellClick(2, 4);
    const trapCell = boardCell(2, 4);
    assert(game.queue.length === 1 && game.queue[0].cardId === "ember_rune"
      && game.queue[0].target.x === 2 && game.queue[0].target.y === 4,
      "Ember Rune should still be placeable on an HP0 enemy's cell");
    assert(trapCell.classList.contains("ember") && trapCell.children.length === 0,
      "an HP0 enemy's cell should display only the placed trap, not the defeated unit");
    assert(getUnit("pursuer").hp === 0,
      "placing a trap on the former cell must not delete or revive the defeated enemy record");
  }

  {
    const boardCell = (x, y) => el.board.children[y * SIZE + x];
    resetGame();
    game.intents = [];
    const defeatedRook = getUnit("rook");
    const vale = getUnit("vale");
    defeatedRook.x = 1; defeatedRook.y = 5; defeatedRook.hp = 0;
    vale.x = 0; vale.y = 5;
    const movementCard = makeCardInstance("quickshot");
    game.hand = [movementCard];
    game.queue = [];
    selectCard(movementCard.instanceId);
    setMode("move");
    handleCellClick(0, 5);
    assert(game.moveUnitId === "vale", "movement setup should select the living unit beside the HP0 cell");
    assert(validCells().some(cell => cell.x === 1 && cell.y === 5),
      "an HP0 ally's former cell should remain a legal movement destination");
    handleCellClick(1, 5);
    const occupiedFormerCell = boardCell(1, 5);
    assert(game.queue.length === 1 && game.queue[0].mode === "move"
      && game.queue[0].target.x === 1 && game.queue[0].target.y === 5,
      "a living ally should be able to queue movement onto an HP0 ally's former cell");
    assert(occupiedFormerCell.children.length === 1
      && occupiedFormerCell.children[0].className.includes("unit player")
      && occupiedFormerCell.children[0].innerHTML.includes("ヴェイル")
      && !occupiedFormerCell.children[0].innerHTML.includes("ルーク"),
      "the former cell should display only the predicted living mover");
    assert(getUnit("rook").hp === 0 && getUnit("rook").x === 1 && getUnit("rook").y === 5,
      "movement preview must retain the defeated ally record under the living displayed unit");
  }

  {
    const boardCell = (x, y) => el.board.children[y * SIZE + x];
    resetGame();
    game.intents = [];
    const target = getUnit("pursuer");
    target.x = 2; target.y = 4; target.hp = 3;
    const graze = queued("pinning_arrow", "vale", "pursuer", "fast");
    const lethal = queued("quickshot", "vale", "pursuer", "fast");
    const cancelledFollowUp = queued("arc_spark", "iona", "pursuer", "slow");
    game.queue = [graze, lethal, cancelledFollowUp];
    const forecast = predictTimeline();
    assert(simGetUnit(forecast.snapshots[0].state, "pursuer").hp === 2
      && simGetUnit(forecast.snapshots[1].state, "pursuer").hp === 0,
      "the ACT 09 preview fixture should have adjacent pre-lethal and lethal snapshots");
    assert(forecast.snapshots[2].outcome.status === "cancelled"
      && forecast.snapshots[2].outcome.reason === "対象が戦闘不能",
      "the existing post-KO command should remain cancelled for its defeated target");
    assert(forecast.final.units.length === 6 && simGetUnit(forecast.final, "pursuer").hp === 0,
      "forecast state should retain the HP0 record after lethal and cancelled events");

    game.previewIndex = 0;
    renderBoard();
    const beforeLethal = boardCell(2, 4);
    assert(beforeLethal.children.length === 1
      && beforeLethal.children[0].innerHTML.includes("3→2")
      && !beforeLethal.children[0].className.includes("predicted-ko"),
      "the pre-lethal snapshot should display the still-living projected unit without a KO class");
    game.previewIndex = 1;
    renderBoard();
    assert(boardCell(2, 4).children.length === 0,
      "the unit should disappear on the first lethal snapshot");
    game.previewIndex = null;
    renderBoard();
    assert(boardCell(2, 4).children.length === 0,
      "the final forecast should contain no full-body ghost or KO marker");
    game.previewIndex = 0;
    renderBoard();
    assert(boardCell(2, 4).children.length === 1,
      "returning to the pre-lethal snapshot should restore the living unit reversibly");
  }

  {
    const boardCell = (x, y) => el.board.children[y * SIZE + x];
    resetGame();
    game.intents = [];
    const target = getUnit("pursuer");
    target.x = 2; target.y = 4; target.hp = 2;
    game.queue = [queued("quickshot", "vale", "pursuer", "fast")];
    renderBoard();
    assert(boardCell(2, 4).children.length === 0,
      "a lethal queued command's final forecast should hide the defeated unit");
    undoLast();
    assert(game.queue.length === 0 && getUnit("pursuer").hp === 2
      && boardCell(2, 4).children.length === 1,
      "undoing the lethal command should restore the surviving live unit on the board");
  }

  {
    const boardCell = (x, y) => el.board.children[y * SIZE + x];
    resetGame();
    const rook = getUnit("rook");
    const cantor = getUnit("cantor");
    rook.hp = 1;
    game.queue = [{
      instance: makeCardInstance("quickshot"), cardId: "quickshot", mode: "move",
      actorId: "rook", target: { x: 1, y: 3 }, speed: "fast", label: "ルーク：移動"
    }];
    game.intents = [intent(cantor, "drain", "生命吸収", "normal", rook, "test")];
    const forecast = predictTimeline();
    assert(simGetUnit(forecast.final, "rook").x === 1 && simGetUnit(forecast.final, "rook").y === 3
      && simGetUnit(forecast.final, "rook").hp === 0,
      "origin-cell fixture should move a living unit before it is defeated");
    renderBoard();
    assert(!boardCell(1, 4).classList.contains("origin-cell")
      && boardCell(1, 3).children.length === 0,
      "origin-cell should not leave a death trace when the predicted moved unit is HP0");
  }

  {
    const boardCell = (x, y) => el.board.children[y * SIZE + x];
    resetGame();
    game.intents = [];
    const target = getUnit("pursuer");
    target.x = 2; target.y = 4; target.hp = 2;
    game.queue = [queued("quickshot", "vale", "pursuer", "fast")];
    let checkedLethalFrame = false;
    pause = async () => {
      if (getUnit("pursuer").hp <= 0) {
        checkedLethalFrame = true;
        assert(boardCell(2, 4).children.length === 0,
          "the resolving board should remove the unit from the lethal frame onward");
      }
    };
    await executeTurn();
    pause = async () => {};
    assert(checkedLethalFrame && game.phase === "planning" && game.turn === 2,
      "the lethal execution should be observed and continue to the next planning turn");
    assert(game.units.length === 6 && getUnit("pursuer").hp === 0
      && game.lastResolvedState.units.length === 6 && simGetUnit(game.lastResolvedState, "pursuer").hp === 0,
      "execution and lastResolvedState should retain the defeated enemy record");
    assert(boardCell(2, 4).children.length === 0
      && !game.intents.some(item => item.actorId === "pursuer"),
      "the HP0 enemy should stay absent from the next-turn board and enemy intents");
  }

  {
    const battlefieldTokens = () => el.board.children.flatMap(cell => cell.children)
      .filter(child => typeof child.className === "string" && child.className.includes("unit "));
    resetGame();
    game.units.filter(unit => unit.side === "enemy").forEach(unit => { unit.hp = 0; });
    finishBattle("victory");
    assert(game.phase === "ended" && el.modalTitle.textContent === "演習完了。"
      && battlefieldTokens().every(token => !token.className.includes("enemy")),
      "the victory modal background should contain no HP0 enemy unit DOM");
    assert(game.units.filter(unit => unit.side === "enemy").length === 3,
      "victory rendering must retain all defeated enemy state records");

    resetGame();
    game.units.filter(unit => unit.side === "player").forEach(unit => { unit.hp = 0; });
    finishBattle("defeat");
    assert(game.phase === "ended" && el.modalTitle.textContent === "部隊壊滅。"
      && battlefieldTokens().every(token => !token.className.includes("player")),
      "the defeat modal background should contain no HP0 allied unit DOM");
    assert(game.units.filter(unit => unit.side === "player").length === 3,
      "defeat rendering must retain all defeated allied state records");
  }

  {
    const uniqueIds = ["action-timeline", "timeline-detail-panel", "preview-final", "intent-list"];
    uniqueIds.forEach(id => assert(htmlSource.split('id="' + id + '"').length - 1 === 1,
      "ACT 10 should keep exactly one #" + id));
    const battleStart = htmlSource.indexOf('<section class="battle-layout">');
    const commandStart = htmlSource.indexOf('<section class="command-panel">');
    const timelinePosition = htmlSource.indexOf('id="action-timeline"');
    const intentPosition = htmlSource.indexOf('id="intent-list"');
    assert(battleStart >= 0 && timelinePosition > battleStart && timelinePosition < commandStart,
      "the only ACTION ORDER should be inside battle-layout and outside command-panel");
    assert(intentPosition > timelinePosition && intentPosition < commandStart,
      "the old intent list should be inside the execution panel after ACTION ORDER");
    const intentDetails = htmlSource.match(/<details class="intent-reference"([^>]*)>[\\s\\S]*?<div id="intent-list"/);
    assert(intentDetails && !/\\bopen\\b/.test(intentDetails[1]),
      "the native enemy-intent reference should be closed by default");
    assert(htmlSource.includes('左から順に実行 <span aria-hidden="true">01 → 02 → 03 → …</span>')
      && htmlSource.includes("FAST → NORMAL → SLOW")
      && htmlSource.includes("同速度は味方が先"),
      "the execution panel should state the large direction rule and the existing speed rule");
    assert(htmlSource.includes("上の実行順を読み、最大3枚を並べる"),
      "COMMAND HAND should describe inserting up to three cards into the execution order above");
    assert(/--cell-size:\\s*clamp\\(58px,\\s*4\\.7vw,\\s*68px\\)/.test(styleSource)
      && /\\.execution-flow\\s*\\{[^}]*font-size:\\s*18px/s.test(styleSource),
      "desktop CSS should keep the decided cell range and an 18px execution rule");
    assert(/grid-template-areas:\\s*"board execution"\\s*"board side"/s.test(styleSource)
      && /\\.action-timeline\\s*\\{[^}]*overflow-x:\\s*hidden/s.test(styleSource),
      "desktop CSS should place execution beside the board without ACTION ORDER overflow");
    assert(/@media \\(max-width:\\s*1050px\\)[\\s\\S]*grid-template-areas:[\\s\\S]*"board"[\\s\\S]*"execution"[\\s\\S]*"side"/.test(styleSource)
      && /@media \\(max-width:\\s*1050px\\)[\\s\\S]*\\.action-timeline\\s*\\{[^}]*overflow-x:\\s*auto/s.test(styleSource),
      "narrow CSS should use board, execution, side order and local timeline scrolling");
    assert(/@media \\(max-width:\\s*720px\\)[\\s\\S]*--cell-size:\\s*min\\(calc\\(\\(100vw - 86px\\) \\/ 6\\),\\s*54px\\)/.test(styleSource),
      "700px-class CSS should cap battlefield cells at 54px while retaining the 320px calculation");
  }

  {
    const plainText = html => html.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim();
    const renderFingerprint = () => JSON.stringify({
      units: game.units,
      queue: game.queue,
      intents: game.intents,
      hostileRunes: game.hostileRunes,
      emberRunes: game.emberRunes
    });
    resetGame();
    const selfOrder = queued("shield_lock", "rook", "rook", "fast");
    const targetOrder = queued("quickshot", "vale", "pursuer", "fast");
    const cellOrder = queued("ember_rune", "iona", null, "normal", { target: { x: 3, y: 4 } });
    game.queue = [selfOrder, targetOrder, cellOrder];
    const ordered = buildResolutionEvents();
    const beforeRender = renderFingerprint();
    renderTimeline();
    const afterRender = renderFingerprint();
    assert(ordered.length === 6 && el.timeline.children.length === 6,
      "three enemies plus three allied commands should render six mixed events");
    assert(beforeRender === afterRender,
      "rendering the ACT 10 execution lane must not mutate combat state, queue, intents, or traps");

    ordered.forEach((event, index) => {
      const step = el.timeline.children[index];
      const view = timelineEventView(event);
      const number = String(index + 1).padStart(2, "0");
      const side = event.kind === "enemy" ? "ENEMY" : "ALLY";
      const spokenSide = event.kind === "enemy" ? "敵" : "味方";
      const target = timelineTargetLabel(event);
      const visible = plainText(step.innerHTML);
      assert(step.dataset.eventKey === event.key
        && step.className.includes(event.kind)
        && visible.includes(number)
        && visible.includes(side)
        && visible.includes(view.name)
        && visible.includes(view.action)
        && visible.includes(SPEED_LABEL[event.speed])
        && visible.includes("対象：" + target),
        "each execution card should preserve event order and all fixed visible fields at " + number);
      const aria = step.getAttribute("aria-label");
      const orderedParts = [
        "順番" + number, spokenSide, view.name, view.action,
        SPEED_LABEL[event.speed], "対象" + target
      ];
      let previous = -1;
      orderedParts.forEach(part => {
        const position = aria.indexOf(part);
        assert(position > previous, "timeline aria fields should follow the visible order: " + part);
        previous = position;
      });
      assert(step.getAttribute("aria-controls") === "timeline-detail-panel"
        && step.getAttribute("aria-pressed") === "false",
        "each normal event button should expose detail control and unpressed state");
    });

    const lastStep = el.timeline.children[5];
    lastStep.listeners.focus();
    assert(lastStep.scrollIntoViewCalls.length === 1
      && lastStep.scrollIntoViewCalls[0].inline === "nearest",
      "focusing an execution event should scroll only as needed to reveal it");
  }

  {
    const plainText = html => html.replace(/<[^>]*>/g, "");
    const verifyIntentTurn = (turn, expectedById, hostileRunes = []) => {
      resetGame();
      game.turn = turn;
      game.queue = [];
      game.hostileRunes = hostileRunes.map(cell => ({ ...cell }));
      game.intents = buildEnemyIntents();
      const events = buildResolutionEvents();
      renderTimeline();
      renderIntents();

      Object.entries(expectedById).forEach(([intentId, fragments]) => {
        const enemyIntent = game.intents.find(item => item.id === intentId);
        const eventIndex = events.findIndex(event => event.kind === "enemy" && event.payload === enemyIntent);
        const step = el.timeline.children[eventIndex];
        const visible = plainText(step.innerHTML);
        const clauses = intentDescriptionClauses(enemyIntent);
        assert(clauses.join("。") + "。" === enemyIntent.description,
          intentId + " timeline clauses should reconstruct the unchanged intent.description");
        clauses.forEach(clause => {
          assert(visible.includes(clause) && step.getAttribute("aria-label").includes(clause),
            intentId + " should expose each original description clause visually and in aria");
        });
        fragments.forEach(fragment => assert(visible.includes(fragment),
          intentId + " should retain the decided source phrase: " + fragment));
        assert(visible.includes("対象：" + timelineTargetLabel(events[eventIndex]))
          && visible.includes(SPEED_LABEL[enemyIntent.speed]),
          intentId + " should source target and speed from the existing intent");
        assert(step.innerHTML.includes("<strong>"),
          intentId + " should high-contrast existing numeric or tactical keywords");
        const referenceCard = el.intents.children.find(card => card.innerHTML.includes(enemyIntent.name));
        assert(referenceCard && referenceCard.innerHTML.includes(enemyIntent.description)
          && referenceCard.innerHTML.includes("HP "),
          intentId + " should remain available with original prose and HP in the intent reference");
      });
    };

    verifyIntentTurn(1, {
      stalk: ["2マス移動", "隣接すれば2ダメージ"],
      inscribe: ["次ターンに同じ座標を起爆"]
    });
    verifyIntentTurn(2, {
      pounce: ["3マス突進", "隣接すれば4ダメージ"],
      shield_drive: ["1マス接近", "3ダメージ", "露出"],
      detonate: ["全マスに4ダメージ", "柄打ちで詠唱解除可能"]
    }, [{ x: 0, y: 4 }, { x: 1, y: 4 }]);
    assert(!el.timeline.children.find(step => step.innerHTML.includes("飛びかかり")).innerHTML.includes("柄打ち"),
      "Pounce must not invent Detonate's counter text");
    verifyIntentTurn(3, {
      brace: ["装甲6", "攻撃者へ4ダメージ"],
      drain: ["2ダメージ", "敵側の負傷者を2回復"]
    });
  }

  {
    const plainText = html => html.replace(/<[^>]*>/g, "");
    resetGame();
    game.intents = [];
    const pursuer = getUnit("pursuer");
    pursuer.x = 2; pursuer.y = 4;
    const selfOrder = queued("shield_lock", "rook", "rook", "fast");
    const moveInstance = makeCardInstance("quickshot");
    const moveOrder = {
      instance: moveInstance, cardId: "quickshot", mode: "move", actorId: "vale",
      target: { x: 1, y: 5 }, speed: "fast", label: "ヴェイル：移動"
    };
    const unitOrder = queued("quickshot", "vale", "pursuer", "fast");
    game.queue = [selfOrder, moveOrder, unitOrder];
    const events = buildResolutionEvents();
    renderTimeline();
    const selfStep = el.timeline.children[events.findIndex(event => event.payload === selfOrder)];
    const moveStep = el.timeline.children[events.findIndex(event => event.payload === moveOrder)];
    const unitStep = el.timeline.children[events.findIndex(event => event.payload === unitOrder)];
    assert(plainText(selfStep.innerHTML).includes("対象：ルーク"),
      "a self-target allied event should display its actor from the existing target");
    assert(plainText(moveStep.innerHTML).includes("対象：マス (2,6)"),
      "a movement event should display its existing one-based target coordinates");
    assert(plainText(unitStep.innerHTML).includes("対象：追跡獣"),
      "a unit-target allied event should display its existing target name");
    [selfStep, moveStep, unitStep].forEach(step => assert(plainText(step.innerHTML).includes("予測："),
      "confirmed allied events should distinguish their existing forecast result"));
  }

  {
    const plainText = html => html.replace(/<[^>]*>/g, "");
    resetGame();
    game.intents = [];
    const shot = makeCardInstance("quickshot");
    game.hand = [shot];
    game.queue = [];
    selectCard(shot.instanceId);
    const provisional = el.timeline.children[0];
    assert(plainText(provisional.innerHTML).includes("ALLY")
      && plainText(provisional.innerHTML).includes("対象：選択待ち")
      && plainText(provisional.innerHTML).includes("この命令の直前"),
      "a provisional allied event should retain side, target-waiting, and pre-command state");
    assert(provisional.getAttribute("aria-pressed") === "true"
      && provisional.getAttribute("aria-expanded") === "true"
      && provisional.getAttribute("aria-controls") === "timeline-detail-panel"
      && !el.timelineDetail.hidden,
      "the selected provisional event should expose its selected and expanded detail state");

    resetGame();
    game.intents = [];
    getUnit("vale").hp = 0;
    const legacyCard = makeCardInstance("quickshot");
    game.hand = [legacyCard];
    game.queue = [];
    selectCard(legacyCard.instanceId);
    const legacy = plainText(el.timeline.children[0].innerHTML);
    assert(legacy.includes("ALLY") && legacy.includes("ヴェイルの遺志")
      && legacy.includes("照準") && legacy.includes("対象：選択待ち"),
      "a provisional legacy event should keep its existing actor, action, and target-waiting semantics");
  }

  {
    const plainText = html => html.replace(/<[^>]*>/g, "");
    resetGame();
    game.intents = [];
    const pursuer = getUnit("pursuer");
    pursuer.x = 2; pursuer.y = 4; pursuer.hp = 2;
    const lethal = queued("quickshot", "vale", "pursuer", "fast");
    const cancelled = queued("arc_spark", "iona", "pursuer", "slow");
    game.queue = [lethal, cancelled];
    let events = buildResolutionEvents();
    renderTimeline();
    let cancelledStep = el.timeline.children[events.findIndex(event => event.payload === cancelled)];
    assert(cancelledStep.className.includes("cancelled")
      && plainText(cancelledStep.innerHTML).includes("取消：連鎖火花")
      && plainText(cancelledStep.innerHTML).includes("対象：追跡獣")
      && plainText(cancelledStep.innerHTML).includes("予測：取消：対象が戦闘不能")
      && cancelledStep.getAttribute("aria-label").includes("予測：取消：対象が戦闘不能"),
      "a cancelled allied event should keep its action, target, and full existing reason");

    game.previewIndex = 0;
    renderTimeline();
    const selectedStep = el.timeline.children[0];
    assert(selectedStep.getAttribute("aria-pressed") === "true"
      && selectedStep.getAttribute("aria-expanded") === "true"
      && !el.timelineDetail.hidden,
      "a planning-stage event should expose pressed and expanded state");

    const resolvingForecast = predictTimeline();
    game.activeForecast = resolvingForecast;
    game.phase = "resolving";
    game.timelineCursor = 0;
    game.previewIndex = 0;
    renderTimeline();
    const currentStep = el.timeline.children[0];
    assert(currentStep.getAttribute("aria-current") === "step"
      && currentStep.getAttribute("aria-expanded") === "true"
      && currentStep.getAttribute("aria-pressed") === "false",
      "the resolving event should expose current and expanded state without planning pressed state");
    resetGame();
  }

  process.stdout.write("ORDER//3 smoke tests passed\\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
`;

vm.runInNewContext(`${source}\n${tests}`, {
  document,
  getComputedStyle,
  htmlSource,
  styleSource,
  readmeSource,
  designSource,
  console,
  process,
  setTimeout() {},
  clearTimeout() {},
  Promise,
  Math
});
