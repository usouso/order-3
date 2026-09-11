const SIZE = 6;
const GAME_VERSION = "ACT 14a";
const SPEED_ORDER = { fast: 0, normal: 1, slow: 2 };
const SPEED_LABEL = { fast: "FAST", normal: "NORMAL", slow: "SLOW" };
const WALLS = [{ x: 2, y: 2 }, { x: 3, y: 3 }];

const cardDefs = {
  forward_cut: {
    ownerId: "rook", name: "踏み込み斬り", speed: "normal",
    text: "上下左右へ1マス接近後、上下左右に隣接する敵へ3ダメージ。",
    target: "enemy", range: 2, categories: ["attack", "mobility"]
  },
  interpose: {
    ownerId: "rook", name: "割って入る", speed: "fast",
    text: "味方へ最大2マス接近し、両者に装甲2。",
    target: "allyOther", range: 2, categories: ["defense", "mobility"]
  },
  shield_lock: {
    ownerId: "rook", name: "盾を固める", speed: "fast",
    text: "自身に装甲5。隣接する味方への次の攻撃を肩代わり。",
    target: "self", range: 0, categories: ["defense"]
  },
  pommel_break: {
    ownerId: "rook", name: "柄打ち", speed: "normal",
    text: "隣接する敵に2ダメージ。装甲と、このターンに予告された詠唱を解除。",
    target: "enemy", range: 1, categories: ["control", "attack"]
  },
  quickshot: {
    ownerId: "vale", name: "速射", speed: "fast",
    text: "射程3。敵に2ダメージ。",
    target: "enemy", range: 3, categories: ["attack"]
  },
  pinning_arrow: {
    ownerId: "vale", name: "縫い留め", speed: "fast",
    text: "射程4。1ダメージを与え、このターンの移動を封じる。",
    target: "enemy", range: 4, categories: ["control", "attack"]
  },
  backstep_shot: {
    ownerId: "vale", name: "離脱射撃", speed: "normal",
    text: "射程3。2ダメージ後、対象から離れる方向へ1マス移動。",
    target: "enemy", range: 3, categories: ["attack", "mobility"]
  },
  hunters_mark: {
    ownerId: "vale", name: "狩人の印", speed: "slow",
    text: "射程4。次に受ける攻撃のダメージを+3。",
    target: "enemy", range: 4, categories: ["control"], categoryDetail: "印"
  },
  arc_spark: {
    ownerId: "iona", name: "連鎖火花", speed: "slow",
    text: "射程3。対象に3ダメージ。上下左右に隣接する敵へ2ダメージ。対象が帯電していれば、その値だけ隣接ダメージ増加（最大+2）。連鎖時に帯電を消費。",
    target: "enemy", range: 3, categories: ["attack"]
  },
  phase_step: {
    ownerId: "iona", name: "位相交換", speed: "fast",
    text: "射程3。自身と味方1人の位置を交換。",
    target: "allyOther", range: 3, categories: ["mobility"]
  },
  null_sigil: {
    ownerId: "iona", name: "無効印", speed: "fast",
    text: "射程3。味方に結界。次の状態異常か地形ダメージを無効化。",
    target: "ally", range: 3, categories: ["defense"]
  },
  ember_rune: {
    ownerId: "iona", name: "火種の罠", speed: "normal",
    text: "射程3。空きマスに罠を設置。敵が踏むと3ダメージを与え、その移動の残り歩数を失わせる。発動後に消滅。",
    target: "empty", range: 3, categories: ["trap", "control"]
  }
};

const ownerMeta = {
  rook: { name: "ルーク", role: "前衛", color: "#55d6c8" },
  vale: { name: "ヴェイル", role: "射手", color: "#74a7ff" },
  iona: { name: "イオナ", role: "術師", color: "#a891ff" }
};

const cardCategoryMeta = {
  attack: { label: "攻撃", icon: "blade" },
  defense: { label: "防御", icon: "shield" },
  mobility: { label: "機動", icon: "arrows" },
  control: { label: "妨害", icon: "knot" },
  trap: { label: "罠", icon: "floor-diamond" }
};

const statusMeta = {
  guard: {
    order: 1, label: "装甲", short: unit => `盾${unit.guard}`,
    active: unit => unit.guard > 0, shape: "shield", tone: "amber",
    detail: unit => unit.persistentGuard
      ? `装甲${unit.guard}。受けるダメージを先にこの値まで吸収し、吸収した分だけ減少。反撃姿勢の残りは次に別の行動を始める時に終了。`
      : `装甲${unit.guard}。受けるダメージを先にこの値まで吸収し、吸収した分だけ減少。残りはターン終了で消える。`
  },
  ward: {
    order: 2, label: "結界", short: () => "結",
    active: unit => unit.ward === true, shape: "double-ring", tone: "violet",
    detail: () => "次の状態異常か地形ダメージを1回無効。無効にした時に消費し、未使用なら持ち越す。"
  },
  rooted: {
    order: 3, label: "移動不能", short: () => "鎖",
    active: unit => unit.rooted === true, shape: "linked-square", tone: "blue",
    detail: () => "このターンは移動できない。行動そのものは取り消さず、ターン終了で解除。"
  },
  marked: {
    order: 4, label: "標的（狩人の印）", short: () => "標",
    active: unit => unit.marked === true, shape: "crosshair-circle", tone: "yellow",
    detail: () => "次に味方側から攻撃を受ける時、そのダメージ+3。発動時に消費し、未発動なら持ち越す。"
  },
  exposed: {
    order: 5, label: "露出", short: () => "露",
    active: unit => unit.exposed === true, shape: "warning-triangle", tone: "rose",
    detail: () => "次に敵側からダメージを受ける時、そのダメージ+1。適用時に消費し、未発動なら持ち越す。"
  },
  charge: {
    order: 6, label: "帯電", short: unit => `⚡${unit.charge}`,
    active: unit => unit.charge > 0, shape: "lightning", tone: "orange",
    detail: unit => `帯電${unit.charge}。このターンに実際に回復したHP（最大2）。連鎖火花の上下左右に隣接する敵へのダメージへ${unit.charge}加算。連鎖先がある時に消費し、ターン終了でも消える。`
  }
};

let pinnedStatusPopover = null;

const game = {
  turn: 1,
  phase: "planning",
  units: [],
  deck: [],
  discard: [],
  hand: [],
  queue: [],
  intents: [],
  hostileRunes: [],
  emberRunes: [],
  selectedInstanceId: null,
  mode: "technique",
  moveUnitId: null,
  flashUnitId: null,
  log: [],
  instanceCounter: 0,
  timelineCursor: -1,
  previewIndex: null,
  activeForecast: null,
  lastResolvedState: null
};

const el = {
  board: document.querySelector("#battlefield"),
  statusPopover: document.querySelector("#board-status-popover"),
  hand: document.querySelector("#hand"),
  intents: document.querySelector("#intent-list"),
  squad: document.querySelector("#squad-list"),
  log: document.querySelector("#combat-log"),
  turn: document.querySelector("#turn-number"),
  instruction: document.querySelector("#instruction"),
  cancel: document.querySelector("#cancel-selection"),
  modeBar: document.querySelector("#mode-bar"),
  techniqueMode: document.querySelector("#technique-mode"),
  moveMode: document.querySelector("#move-mode"),
  modeHelp: document.querySelector("#mode-help"),
  pips: document.querySelector("#command-pips"),
  queue: document.querySelector("#order-queue"),
  timeline: document.querySelector("#action-timeline"),
  timelineDetail: document.querySelector("#timeline-detail-panel"),
  idleUnits: document.querySelector("#idle-units"),
  previewFinal: document.querySelector("#preview-final"),
  undo: document.querySelector("#undo-button"),
  execute: document.querySelector("#execute-button"),
  modal: document.querySelector("#modal"),
  modalTitle: document.querySelector("#modal-title"),
  modalBody: document.querySelector("#modal-body"),
  modalButton: document.querySelector("#modal-button"),
  help: document.querySelector("#help-button")
};

function makeUnits() {
  return [
    makeUnit("rook", "ルーク", "R", "player", 11, 1, 4, "前衛"),
    makeUnit("vale", "ヴェイル", "V", "player", 8, 0, 5, "射手"),
    makeUnit("iona", "イオナ", "I", "player", 7, 2, 5, "術師"),
    makeUnit("pursuer", "追跡獣", "P", "enemy", 8, 4, 2, "追跡"),
    makeUnit("bastion", "城壁兵", "B", "enemy", 12, 4, 0, "防御"),
    makeUnit("cantor", "詠唱師", "C", "enemy", 7, 5, 0, "詠唱")
  ];
}

function makeUnit(id, name, icon, side, hp, x, y, role) {
  return {
    id, name, icon, side, role, hp, maxHp: hp, x, y,
    guard: 0, ward: false, rooted: false, marked: false,
    exposed: false, coveringId: null, counter: 0, persistentGuard: false,
    channelCancelled: false, charge: 0
  };
}

function resetGame() {
  game.turn = 1;
  game.phase = "planning";
  game.units = makeUnits();
  game.discard = [];
  game.hand = [];
  game.queue = [];
  game.hostileRunes = [];
  game.emberRunes = [];
  game.selectedInstanceId = null;
  game.mode = "technique";
  game.moveUnitId = null;
  game.log = [];
  game.instanceCounter = 0;
  game.timelineCursor = -1;
  game.previewIndex = null;
  game.activeForecast = null;
  game.lastResolvedState = null;
  game.deck = shuffle(Object.keys(cardDefs).map(cardId => makeCardInstance(cardId)));
  drawToFive();
  game.intents = buildEnemyIntents();
  addLog("作戦開始。敵の行動はすべて予告されます。", true);
  render();
}

function makeCardInstance(cardId) {
  game.instanceCounter += 1;
  return { cardId, instanceId: `card-${game.instanceCounter}` };
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function drawToFive() {
  while (game.hand.length < 5) {
    if (!game.deck.length) {
      if (!game.discard.length) break;
      game.deck = shuffle(game.discard);
      game.discard = [];
    }
    game.hand.push(game.deck.pop());
  }
}

function getUnit(id) {
  return game.units.find(unit => unit.id === id);
}

function living(side) {
  return game.units.filter(unit => unit.side === side && unit.hp > 0);
}

function unitAt(x, y) {
  return game.units.find(unit => unit.hp > 0 && unit.x === x && unit.y === y);
}

function isWall(x, y) {
  return WALLS.some(wall => wall.x === x && wall.y === y);
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

function isEmpty(x, y) {
  return inBounds(x, y) && !isWall(x, y) && !unitAt(x, y);
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isOrthogonallyAdjacent(a, b) {
  return distance(a, b) === 1;
}

function neighbors(pos) {
  return [
    { x: pos.x + 1, y: pos.y }, { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 }, { x: pos.x, y: pos.y - 1 }
  ].filter(cell => inBounds(cell.x, cell.y));
}

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function projectedLayout() {
  const positions = new Map(
    game.units
      .filter(unit => unit.hp > 0)
      .map(unit => [unit.id, { x: unit.x, y: unit.y }])
  );

  for (const action of game.queue) {
    if (action.mode === "move") {
      const current = positions.get(action.actorId);
      if (current && isOrthogonallyAdjacent(current, action.target)
        && isProjectedCellEmpty(action.target, positions, action.actorId)) {
        positions.set(action.actorId, { ...action.target });
      }
      continue;
    }

    if (action.mode === "technique") {
      const actorPos = positions.get(action.actorId);
      const targetPos = positions.get(action.targetId);
      if (!actorPos) continue;

      if (action.cardId === "forward_cut" && targetPos && distance(actorPos, targetPos) === 2) {
        const path = projectedPathToAdjacent(action.actorId, action.targetId, positions);
        if (path[0]) positions.set(action.actorId, { ...path[0] });
      }

      if (action.cardId === "interpose" && targetPos) {
        const path = projectedPathToAdjacent(action.actorId, action.targetId, positions).slice(0, 2);
        if (path.length) positions.set(action.actorId, { ...path[path.length - 1] });
      }

      if (action.cardId === "backstep_shot" && targetPos) {
        const options = neighbors(actorPos)
          .filter(cell => isProjectedCellEmpty(cell, positions, action.actorId))
          .sort((a, b) => distance(b, targetPos) - distance(a, targetPos));
        if (options[0]) positions.set(action.actorId, { ...options[0] });
      }

      if (action.cardId === "phase_step" && targetPos && distance(actorPos, targetPos) <= 3) {
        positions.set(action.actorId, { ...targetPos });
        positions.set(action.targetId, { ...actorPos });
      }
    }
  }
  return positions;
}

function isProjectedCellEmpty(cell, positions, exceptUnitId = null) {
  if (!inBounds(cell.x, cell.y) || isWall(cell.x, cell.y)) return false;
  return ![...positions.entries()].some(([unitId, pos]) =>
    unitId !== exceptUnitId && pos.x === cell.x && pos.y === cell.y
  );
}

function projectedPathToAdjacent(moverId, targetId, positions) {
  const start = positions.get(moverId);
  const target = positions.get(targetId);
  if (!start || !target) return [];
  const startKey = keyOf(start);
  const frontier = [{ ...start }];
  const cameFrom = new Map([[startKey, null]]);
  let end = null;

  while (frontier.length) {
    const current = frontier.shift();
    if (isOrthogonallyAdjacent(current, target)) {
      end = current;
      break;
    }
    for (const next of neighbors(current)) {
      const nextKey = keyOf(next);
      if (cameFrom.has(nextKey) || !isProjectedCellEmpty(next, positions, moverId)) continue;
      cameFrom.set(nextKey, current);
      frontier.push(next);
    }
  }

  if (!end) return [];
  const path = [];
  let current = end;
  while (current && keyOf(current) !== startKey) {
    path.unshift(current);
    current = cameFrom.get(keyOf(current));
  }
  return path;
}

function projectedUnitAt(x, y, positions = projectedLayout()) {
  return game.units.find(unit => {
    if (unit.hp <= 0) return false;
    const pos = positions.get(unit.id);
    return pos?.x === x && pos?.y === y;
  });
}

function isProjectedEmpty(x, y, positions = projectedLayout()) {
  return inBounds(x, y) && !isWall(x, y) && !projectedUnitAt(x, y, positions);
}

function nearestUnit(source, candidates) {
  return [...candidates].sort((a, b) => distance(source, a) - distance(source, b) || a.hp - b.hp)[0];
}

function farthestUnit(source, candidates) {
  return [...candidates].sort((a, b) => distance(source, b) - distance(source, a) || a.hp - b.hp)[0];
}

function buildEnemyIntents() {
  const intents = [];
  const players = living("player");
  if (!players.length) return intents;

  const pursuer = getUnit("pursuer");
  if (pursuer.hp > 0) {
    const phase = (game.turn - 1) % 3;
    if (phase === 0) {
      const target = nearestUnit(pursuer, players);
      intents.push(intent(pursuer, "stalk", "忍び寄る", "fast", target,
        "最も近い味方へ2マス移動。隣接すれば2ダメージ。"));
    } else if (phase === 1) {
      const target = farthestUnit(pursuer, players);
      intents.push(intent(pursuer, "pounce", "飛びかかり", "normal", target,
        "最も遠い味方へ3マス突進。隣接すれば4ダメージ。"));
    } else {
      const target = nearestUnit(pursuer, players);
      intents.push(intent(pursuer, "recover", "息を整える", "slow", target,
        "隣接時は2ダメージ。離れていれば1マス接近。"));
    }
  }

  const bastion = getUnit("bastion");
  if (bastion.hp > 0) {
    const phase = (game.turn - 1) % 3;
    if (phase === 0) {
      const allies = living("enemy").filter(unit => unit.id !== "bastion");
      const target = [...allies].sort((a, b) => a.hp - b.hp)[0] || bastion;
      intents.push(intent(bastion, "cover", "庇護", "fast", target,
        "最も傷ついた敵に装甲4。隣接中、その敵への攻撃を肩代わり。"));
    } else if (phase === 1) {
      const target = nearestUnit(bastion, players);
      intents.push(intent(bastion, "shield_drive", "盾の圧力", "normal", target,
        "最も近い味方へ1マス接近。隣接すれば3ダメージ＋露出。"));
    } else {
      intents.push(intent(bastion, "brace", "反撃姿勢", "slow", bastion,
        "装甲6。次に隣接攻撃を受けると、攻撃者へ4ダメージ。"));
    }
  }

  const cantor = getUnit("cantor");
  if (cantor.hp > 0) {
    const phase = (game.turn - 1) % 3;
    if (phase === 0) {
      const target = [...players].sort((a, b) => a.guard - b.guard || a.hp - b.hp)[0];
      const cells = [target, ...neighbors(target)].filter(cell => !isWall(cell.x, cell.y));
      const result = intent(cantor, "inscribe", "災印を刻む", "fast", target,
        "予告座標へ災印を固定。次ターンに同じ座標を起爆。", cells, { targetKind: "cells" });
      intents.push(result);
    } else if (phase === 1) {
      intents.push(intent(cantor, "detonate", "災印起爆", "slow", null,
        "災印のある全マスに4ダメージ。柄打ちで詠唱解除可能。", [...game.hostileRunes],
        { targetKind: "cells", channel: true }));
    } else {
      const target = [...players].sort((a, b) => a.hp - b.hp)[0];
      intents.push(intent(cantor, "drain", "生命吸収", "normal", target,
        "最も傷ついた味方に2ダメージ。敵側の負傷者を2回復。"));
    }
  }
  return intents;
}

function intent(actor, id, name, speed, target, description, cells = [], options = {}) {
  return { actorId: actor.id, id, name, speed, targetId: target?.id || null, description, cells, ...options };
}

function selectCard(instanceId) {
  if (game.phase !== "planning" || game.queue.length >= 3) return;
  game.selectedInstanceId = game.selectedInstanceId === instanceId ? null : instanceId;
  game.mode = "technique";
  game.moveUnitId = null;
  game.previewIndex = null;
  render();
}

function selectedCard() {
  return game.hand.find(card => card.instanceId === game.selectedInstanceId);
}

function selectedDef() {
  const card = selectedCard();
  return card ? cardDefs[card.cardId] : null;
}

function setMode(mode) {
  if (!selectedCard()) return;
  game.mode = mode;
  game.moveUnitId = null;
  render();
}

function getLegacy(ownerId) {
  if (ownerId === "rook") return { name: "遺志：守護", text: "生存中の味方1人に装甲2。", target: "ally", speed: "fast", categories: ["defense"] };
  if (ownerId === "vale") return { name: "遺志：照準", text: "敵1体に狩人の印。", target: "enemy", speed: "fast", range: 99, categories: ["control"], categoryDetail: "印" };
  return { name: "遺志：残響", text: "生存中の味方1人に結界。", target: "ally", speed: "fast", categories: ["defense"] };
}

function provisionalActionForSelection() {
  const card = selectedCard();
  const def = selectedDef();
  if (!card || !def || game.phase !== "planning") return null;
  const liveOwner = getUnit(def.ownerId);
  const legacy = !liveOwner || liveOwner.hp <= 0;
  if (game.mode === "move") {
    return {
      instance: card, cardId: card.cardId, mode: "move", actorId: game.moveUnitId,
      target: null, speed: "fast", label: `${game.moveUnitId ? getUnit(game.moveUnitId)?.name : "味方"}：移動`,
      provisional: true
    };
  }
  if (legacy) {
    const legacyDef = getLegacy(def.ownerId);
    return {
      instance: card, cardId: card.cardId, mode: "legacy", actorId: def.ownerId,
      targetId: null, speed: legacyDef.speed, label: legacyDef.name, provisional: true
    };
  }
  return {
    instance: card, cardId: card.cardId, mode: "technique", actorId: def.ownerId,
    targetId: null, target: null, speed: def.speed, label: `${liveOwner.name}：${def.name}`,
    provisional: true
  };
}

function selectionTimelineContext() {
  const action = provisionalActionForSelection();
  if (!action) return null;
  const events = buildResolutionEvents([...game.queue, action]);
  const eventIndex = events.findIndex(event => event.kind === "player" && event.payload === action);
  const forecastBefore = predictTimeline(events, eventIndex);
  return {
    action,
    eventKey: events[eventIndex]?.key,
    eventIndex,
    events,
    state: forecastBefore.final,
    snapshots: forecastBefore.snapshots
  };
}

function displayTimelineState() {
  const selection = selectionTimelineContext();
  if (selection) return selection.state;
  return selectedForecastState();
}

function validCells(providedContext = null) {
  const card = selectedCard();
  const def = selectedDef();
  if (!card || !def || game.phase !== "planning") return [];

  const context = providedContext || selectionTimelineContext();
  const state = context?.state;
  if (!state) return [];

  if (game.mode === "move") {
    if (!game.moveUnitId) return simLiving(state, "player").map(unit => ({ x: unit.x, y: unit.y }));
    const mover = simGetUnit(state, game.moveUnitId);
    if (!mover || mover.hp <= 0) return [];
    return neighbors(mover).filter(cell => simIsEmpty(state, cell.x, cell.y));
  }

  const liveOwner = getUnit(def.ownerId);
  const owner = simGetUnit(state, def.ownerId);
  if (!liveOwner || liveOwner.hp <= 0) {
    const legacy = getLegacy(def.ownerId);
    return targetsForState(state, null, legacy.target, legacy.range ?? 99, true);
  }
  if (!owner || owner.hp <= 0) return [];
  return targetsForState(state, owner, def.target, def.range, false);
}

function targetCandidatesForState(state, owner, type) {
  if (type === "self") return owner && owner.hp > 0 ? [owner] : [];
  if (type === "enemy") return simLiving(state, "enemy");
  if (type === "ally" || type === "allyOther") {
    return simLiving(state, "player")
      .filter(unit => type !== "allyOther" || !owner || unit.id !== owner.id);
  }
  if (type === "empty") {
    const cells = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (simIsEmpty(state, x, y)) cells.push({ x, y });
      }
    }
    return cells;
  }
  return [];
}

function targetsForState(state, owner, type, range, legacy) {
  return targetCandidatesForState(state, owner, type)
    .filter(candidate => legacy || type === "self" || !owner || distance(owner, candidate) <= range)
    .map(candidate => ({ x: candidate.x, y: candidate.y }));
}

function unavailableTechniqueTargetReason(context, shown, owner, legacy) {
  const candidates = targetCandidatesForState(context.state, owner, shown.target);
  const range = shown.range ?? 99;
  if (shown.target === "enemy") {
    return candidates.length
      ? `この命令の直前では射程${range}内に敵がいません。`
      : "対象になる生存敵がいません。";
  }
  if (shown.target === "ally" || shown.target === "allyOther") {
    return candidates.length
      ? `この命令の直前では射程${range}内に対象となる味方がいません。`
      : "対象になる生存中の味方がいません。";
  }
  if (shown.target === "empty") {
    return candidates.length
      ? `この命令の直前では射程${range}内に置ける空きマスがありません。`
      : "置ける空きマスがありません。";
  }
  if (shown.target === "self") return "この命令の直前では対象となる自身が生存していません。";
  return legacy ? "遺志の対象がありません。" : "固有技の対象がありません。";
}

function firstPriorDefeatEvent(context, unitId, startingHp) {
  let previousHp = startingHp;
  for (const snapshot of context.snapshots) {
    const currentHp = simGetUnit(snapshot.state, unitId)?.hp ?? 0;
    if (previousHp > 0 && currentHp <= 0) {
      return context.events.find(event => event.key === snapshot.eventKey) || null;
    }
    previousHp = currentHp;
  }
  return null;
}

function arcSparkBreakdown(state, target) {
  if (!state || !target || target.hp <= 0) return "";
  const charge = Math.min(2, target.charge || 0);
  const chained = simLiving(state, "enemy").filter(unit =>
    unit.id !== target.id && isOrthogonallyAdjacent(unit, target)
  );
  const primary = 3 + (target.marked ? 3 : 0);
  const primaryText = `本体${primary}${target.marked ? "（印+3）" : ""}`;
  const chainText = chained.length
    ? `隣接${chained.length}体へ各${2 + charge}${charge ? `（帯電+${charge}）` : ""}`
    : "連鎖先なし（帯電ボーナスなし）";
  return `${target.name}：${primaryText} / ${chainText}`;
}

function arcSparkSelectionBreakdowns() {
  const context = selectionTimelineContext();
  const state = context?.state;
  const actor = state ? simGetUnit(state, "iona") : null;
  if (!state || !actor || actor.hp <= 0) return [];
  return simLiving(state, "enemy")
    .filter(target => distance(actor, target) <= cardDefs.arc_spark.range)
    .map(target => arcSparkBreakdown(state, target));
}

function handleCellClick(x, y) {
  const card = selectedCard();
  const def = selectedDef();
  if (!card || !def || game.phase !== "planning") return;
  const valid = new Set(validCells().map(keyOf));
  if (!valid.has(`${x},${y}`)) return;

  const context = selectionTimelineContext();
  const selectionState = context?.state;
  if (!selectionState) return;

  if (game.mode === "move" && !game.moveUnitId) {
    const unit = simUnitAt(selectionState, x, y);
    if (unit?.side === "player") {
      game.moveUnitId = unit.id;
      render();
    }
    return;
  }

  const owner = getUnit(def.ownerId);
  let action;
  if (game.mode === "move") {
    action = {
      instance: card, cardId: card.cardId, mode: "move", actorId: game.moveUnitId,
      target: { x, y }, speed: "fast", label: `${getUnit(game.moveUnitId).name}：移動`
    };
  } else if (!owner || owner.hp <= 0) {
    const target = simUnitAt(selectionState, x, y);
    const legacy = getLegacy(def.ownerId);
    action = {
      instance: card, cardId: card.cardId, mode: "legacy", actorId: def.ownerId,
      targetId: target?.id, speed: legacy.speed, label: legacy.name
    };
  } else {
    const targetUnit = simUnitAt(selectionState, x, y);
    action = {
      instance: card, cardId: card.cardId, mode: "technique", actorId: def.ownerId,
      targetId: targetUnit?.id || null, target: { x, y }, speed: def.speed,
      label: `${owner.name}：${def.name}`
    };
  }

  game.hand = game.hand.filter(item => item.instanceId !== card.instanceId);
  game.queue.push(action);
  game.previewIndex = null;
  clearSelection();
  render();
}

function clearSelection() {
  game.selectedInstanceId = null;
  game.mode = "technique";
  game.moveUnitId = null;
  game.previewIndex = null;
}

function undoLast() {
  if (game.phase !== "planning" || !game.queue.length) return;
  const action = game.queue.pop();
  game.hand.push(action.instance);
  game.previewIndex = null;
  clearSelection();
  render();
}

function buildResolutionEvents(queue = game.queue, intents = game.intents) {
  return [
    ...queue.map((action, order) => ({
      kind: "player",
      speed: action.speed,
      order,
      key: `player-${action.instance.instanceId}`,
      payload: action
    })),
    ...intents.map((enemyIntent, order) => ({
      kind: "enemy",
      speed: enemyIntent.speed,
      order,
      key: `enemy-${enemyIntent.actorId}-${enemyIntent.id}`,
      payload: enemyIntent
    }))
  ].sort(compareResolutionEvents);
}

function compareResolutionEvents(a, b) {
  return SPEED_ORDER[a.speed] - SPEED_ORDER[b.speed]
    || (a.kind === b.kind ? a.order - b.order : a.kind === "player" ? -1 : 1);
}

function cloneCombatState(source = game) {
  return {
    units: source.units.map(unit => ({ ...unit })),
    hostileRunes: source.hostileRunes.map(cell => ({ ...cell })),
    emberRunes: source.emberRunes.map(cell => ({ ...cell })),
    cancelledEventKeys: [...(source.cancelledEventKeys || [])]
  };
}

function simGetUnit(state, id) {
  return state.units.find(unit => unit.id === id);
}

function simLiving(state, side) {
  return state.units.filter(unit => unit.side === side && unit.hp > 0);
}

function simUnitAt(state, x, y) {
  return state.units.find(unit => unit.hp > 0 && unit.x === x && unit.y === y);
}

function simIsEmpty(state, x, y) {
  return inBounds(x, y) && !isWall(x, y) && !simUnitAt(state, x, y);
}

function simBattleResult(state) {
  if (!simLiving(state, "enemy").length) return "victory";
  if (!simLiving(state, "player").length) return "defeat";
  return null;
}

function simPathToAdjacent(state, mover, target) {
  const startKey = keyOf(mover);
  const frontier = [{ x: mover.x, y: mover.y }];
  const cameFrom = new Map([[startKey, null]]);
  let end = null;

  while (frontier.length) {
    const current = frontier.shift();
    if (isOrthogonallyAdjacent(current, target)) {
      end = current;
      break;
    }
    for (const next of neighbors(current)) {
      const nextKey = keyOf(next);
      if (cameFrom.has(nextKey) || isWall(next.x, next.y)) continue;
      const occupant = simUnitAt(state, next.x, next.y);
      if (occupant && occupant.id !== mover.id) continue;
      cameFrom.set(nextKey, current);
      frontier.push(next);
    }
  }

  if (!end) return [];
  const path = [];
  let current = end;
  while (current && keyOf(current) !== startKey) {
    path.unshift(current);
    current = cameFrom.get(keyOf(current));
  }
  return path;
}

function simConsumeWard(target, effectName, outcome) {
  if (!target.ward) return false;
  target.ward = false;
  outcome.logs.push(`${target.name}の結界が「${effectName}」を無効化。`);
  return true;
}

function simDealDamage(state, targetId, amount, sourceId, options, outcome) {
  const originalTarget = simGetUnit(state, targetId);
  const source = simGetUnit(state, sourceId);
  if (!originalTarget || originalTarget.hp <= 0) return null;
  if (options.hazard && simConsumeWard(originalTarget, "地形ダメージ", outcome)) return originalTarget;

  let target = originalTarget;
  if (source?.side === "player" && target.side === "enemy" && target.id !== "bastion") {
    const bastion = simGetUnit(state, "bastion");
    if (bastion?.hp > 0 && bastion.coveringId === target.id && isOrthogonallyAdjacent(bastion, target)) {
      outcome.logs.push(`城壁兵が${target.name}への攻撃を肩代わり。`);
      target = bastion;
    }
  }
  if (source?.side === "enemy" && target.side === "player" && target.id !== "rook") {
    const rook = simGetUnit(state, "rook");
    if (rook?.hp > 0 && rook.coveringId === target.id && isOrthogonallyAdjacent(rook, target)) {
      outcome.logs.push(`ルークが${target.name}への攻撃を肩代わり。`);
      target = rook;
    }
  }

  let finalAmount = amount;
  if (source?.side === "player" && target.marked && !options.ignoreMark) {
    finalAmount += 3;
    target.marked = false;
    outcome.logs.push("狩人の印が発動。ダメージ+3。");
  }
  if (source?.side === "enemy" && target.exposed) {
    finalAmount += 1;
    target.exposed = false;
    outcome.logs.push("露出を突かれ、ダメージ+1。");
  }

  const absorbed = Math.min(target.guard, finalAmount);
  target.guard -= absorbed;
  const hpDamage = finalAmount - absorbed;
  target.hp = Math.max(0, target.hp - hpDamage);
  outcome.logs.push(`${target.name}に${hpDamage}ダメージ${absorbed ? `（装甲が${absorbed}吸収）` : ""}。`);
  if (target.hp <= 0) {
    target.coveringId = null;
    outcome.logs.push(`${target.name}が戦闘不能。`);
  }

  const canCounter = options.melee
    && source?.side === "player"
    && source.hp > 0
    && target.id === "bastion"
    && target.hp > 0
    && target.counter > 0
    && isOrthogonallyAdjacent(target, source);
  if (canCounter) {
    const counterDamage = target.counter;
    target.counter = 0;
    outcome.logs.push(`城壁兵の反撃。${source.name}へ${counterDamage}ダメージ。`);
    simDealDamage(state, source.id, counterDamage, target.id, { hostile: true }, outcome);
  }
  return target;
}

function simTriggerEmberRune(state, enemy, outcome) {
  const runeIndex = state.emberRunes.findIndex(cell => cell.x === enemy.x && cell.y === enemy.y);
  if (runeIndex < 0) return false;
  state.emberRunes.splice(runeIndex, 1);
  outcome.logs.push(`${enemy.name}が火種の罠を踏んだ。`);
  simDealDamage(state, enemy.id, 3, "iona", {}, outcome);
  outcome.logs.push("火種の罠で残り移動停止");
  return true;
}

function simHealWithCharge(unit, amount, outcome) {
  if (!unit || unit.hp <= 0 || amount <= 0) return 0;
  const healed = Math.min(amount, unit.maxHp - unit.hp);
  if (healed <= 0) return 0;
  unit.hp += healed;
  if (unit.side === "enemy") unit.charge = Math.min(2, (unit.charge || 0) + healed);
  outcome?.logs.push(`${unit.name}が${healed}回復。帯電${unit.charge}。`);
  return healed;
}

function simMoveToward(state, mover, target, steps, outcome) {
  if (mover.rooted) {
    outcome.logs.push(`${mover.name}は縫い留められ、移動できない。`);
    return;
  }
  const path = simPathToAdjacent(state, mover, target).slice(0, steps);
  for (const cell of path) {
    if (mover.hp <= 0) break;
    mover.x = cell.x;
    mover.y = cell.y;
    if (mover.side === "enemy" && simTriggerEmberRune(state, mover, outcome)) break;
  }
}

function cancelOutcome(outcome, reason) {
  outcome.status = "cancelled";
  outcome.reason = reason;
  outcome.logs.push(`取消：${reason}`);
  return outcome;
}

function resolveSimPlayer(state, event, context, outcome) {
  const action = event.payload;
  const def = cardDefs[action.cardId];
  const actor = simGetUnit(state, action.actorId);

  if (action.mode === "move") {
    if (!actor || actor.hp <= 0) return cancelOutcome(outcome, "行動者が戦闘不能");
    if (!isOrthogonallyAdjacent(actor, action.target)) return cancelOutcome(outcome, "移動先が隣接していない");
    if (!simIsEmpty(state, action.target.x, action.target.y)) return cancelOutcome(outcome, "移動先が占有されている");
    actor.x = action.target.x;
    actor.y = action.target.y;
    outcome.logs.push(`${actor.name}が1マス移動。`);
    return outcome;
  }

  if (action.mode === "legacy") {
    const target = simGetUnit(state, action.targetId);
    if (!target || target.hp <= 0) return cancelOutcome(outcome, "遺志の対象が戦闘不能");
    if (def.ownerId === "rook") {
      target.guard += 2;
      outcome.logs.push(`ルークの遺志。${target.name}に装甲2。`);
    } else if (def.ownerId === "vale") {
      target.marked = true;
      outcome.logs.push(`ヴェイルの遺志。${target.name}に狩人の印。`);
    } else {
      target.ward = true;
      outcome.logs.push(`イオナの遺志。${target.name}に結界。`);
    }
    return outcome;
  }

  if (!actor || actor.hp <= 0) return cancelOutcome(outcome, "行動者が戦闘不能");
  const target = action.targetId ? simGetUnit(state, action.targetId) : null;

  switch (action.cardId) {
    case "forward_cut":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (distance(actor, target) === 2) simMoveToward(state, actor, target, 1, outcome);
      if (!isOrthogonallyAdjacent(actor, target)) return cancelOutcome(outcome, "踏み込み後も射程外");
      simDealDamage(state, target.id, 3, actor.id, { melee: true }, outcome);
      return outcome;
    case "interpose":
      if (!target || target.hp <= 0 || target.side !== "player") return cancelOutcome(outcome, "守る味方がいない");
      simMoveToward(state, actor, target, 2, outcome);
      actor.guard += 2;
      target.guard += 2;
      outcome.logs.push(`${actor.name}と${target.name}に装甲2。`);
      return outcome;
    case "shield_lock": {
      actor.guard += 5;
      const adjacent = simLiving(state, "player").filter(unit => unit.id !== actor.id && isOrthogonallyAdjacent(actor, unit));
      actor.coveringId = adjacent[0]?.id || null;
      outcome.logs.push(`${actor.name}に装甲5${actor.coveringId ? `。${simGetUnit(state, actor.coveringId).name}を庇う` : ""}。`);
      return outcome;
    }
    case "pommel_break": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (!isOrthogonallyAdjacent(actor, target)) return cancelOutcome(outcome, "対象が上下左右の隣接外");
      target.guard = 0;
      target.counter = 0;
      target.persistentGuard = false;
      const channelEvent = context.events.slice(context.index + 1).find(item =>
        item.kind === "enemy" && item.payload.actorId === target.id && item.payload.channel
      );
      if (channelEvent && !state.cancelledEventKeys.includes(channelEvent.key)) {
        state.cancelledEventKeys.push(channelEvent.key);
        outcome.logs.push(`${target.name}の「${channelEvent.payload.name}」を詠唱解除。`);
      }
      simDealDamage(state, target.id, 2, actor.id, { melee: true }, outcome);
      return outcome;
    }
    case "quickshot":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (distance(actor, target) > 3) return cancelOutcome(outcome, "対象が射程外");
      simDealDamage(state, target.id, 2, actor.id, {}, outcome);
      return outcome;
    case "pinning_arrow":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (distance(actor, target) > 4) return cancelOutcome(outcome, "対象が射程外");
      simDealDamage(state, target.id, 1, actor.id, {}, outcome);
      if (target.hp > 0) target.rooted = true;
      return outcome;
    case "backstep_shot": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (distance(actor, target) > 3) return cancelOutcome(outcome, "対象が射程外");
      simDealDamage(state, target.id, 2, actor.id, {}, outcome);
      const options = neighbors(actor).filter(cell => simIsEmpty(state, cell.x, cell.y))
        .sort((a, b) => distance(b, target) - distance(a, target));
      if (options[0] && actor.hp > 0) {
        actor.x = options[0].x;
        actor.y = options[0].y;
      }
      return outcome;
    }
    case "hunters_mark":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (distance(actor, target) > 4) return cancelOutcome(outcome, "対象が射程外");
      target.marked = true;
      return outcome;
    case "arc_spark": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (distance(actor, target) > 3) return cancelOutcome(outcome, "対象が射程外");
      const chained = simLiving(state, "enemy").filter(unit => unit.id !== target.id && isOrthogonallyAdjacent(unit, target));
      const charge = Math.min(2, target.charge || 0);
      simDealDamage(state, target.id, 3, actor.id, {}, outcome);
      for (const other of chained) simDealDamage(state, other.id, 2 + charge, actor.id, { ignoreMark: true }, outcome);
      if (chained.length) {
        target.charge = 0;
        outcome.logs.push(`${target.name}の帯電${charge}を連鎖に消費。`);
      } else {
        outcome.logs.push("連鎖先なし（帯電ボーナスなし）");
      }
      return outcome;
    }
    case "phase_step": {
      if (!target || target.hp <= 0 || target.side !== "player") return cancelOutcome(outcome, "交換対象がいない");
      if (distance(actor, target) > 3) return cancelOutcome(outcome, "交換対象が射程外");
      const old = { x: actor.x, y: actor.y };
      actor.x = target.x; actor.y = target.y;
      target.x = old.x; target.y = old.y;
      return outcome;
    }
    case "null_sigil":
      if (!target || target.hp <= 0 || target.side !== "player") return cancelOutcome(outcome, "結界対象がいない");
      if (distance(actor, target) > 3) return cancelOutcome(outcome, "結界対象が射程外");
      target.ward = true;
      return outcome;
    case "ember_rune":
      if (!action.target || !simIsEmpty(state, action.target.x, action.target.y)) return cancelOutcome(outcome, "罠の設置先が占有されている");
      if (distance(actor, action.target) > 3) return cancelOutcome(outcome, "罠の設置先が射程外");
      state.emberRunes.push({ ...action.target });
      return outcome;
    default:
      return cancelOutcome(outcome, "未対応のカード効果");
  }
}

function resolveSimEnemy(state, event, outcome) {
  const enemyIntent = event.payload;
  const actor = simGetUnit(state, enemyIntent.actorId);
  if (!actor || actor.hp <= 0) return cancelOutcome(outcome, "行動者が戦闘不能");

  if (state.cancelledEventKeys.includes(event.key)) {
    if (enemyIntent.id === "detonate") state.hostileRunes = [];
    return cancelOutcome(outcome, "柄打ちで詠唱解除");
  }

  if (actor.id === "bastion" && actor.persistentGuard && enemyIntent.id !== "brace") {
    actor.guard = 0;
    actor.counter = 0;
    actor.persistentGuard = false;
    outcome.logs.push("城壁兵の反撃姿勢が終了。");
  }

  const target = enemyIntent.targetId ? simGetUnit(state, enemyIntent.targetId) : null;
  switch (enemyIntent.id) {
    case "stalk":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      simMoveToward(state, actor, target, 2, outcome);
      if (actor.hp > 0 && isOrthogonallyAdjacent(actor, target)) simDealDamage(state, target.id, 2, actor.id, { hostile: true, melee: true }, outcome);
      return outcome;
    case "pounce":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      simMoveToward(state, actor, target, 3, outcome);
      if (actor.hp > 0 && isOrthogonallyAdjacent(actor, target)) simDealDamage(state, target.id, 4, actor.id, { hostile: true, melee: true }, outcome);
      else outcome.logs.push("追跡獣の飛びかかりは届かなかった。");
      return outcome;
    case "recover":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (isOrthogonallyAdjacent(actor, target)) simDealDamage(state, target.id, 2, actor.id, { hostile: true, melee: true }, outcome);
      else simMoveToward(state, actor, target, 1, outcome);
      return outcome;
    case "cover":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "庇護対象が戦闘不能");
      target.guard += 4;
      actor.coveringId = isOrthogonallyAdjacent(actor, target) ? target.id : null;
      return outcome;
    case "shield_drive":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      simMoveToward(state, actor, target, 1, outcome);
      if (actor.hp > 0 && target.hp > 0 && isOrthogonallyAdjacent(actor, target)) {
        simDealDamage(state, target.id, 3, actor.id, { hostile: true, melee: true }, outcome);
        if (target.hp > 0 && !simConsumeWard(target, "露出", outcome)) target.exposed = true;
      }
      return outcome;
    case "brace":
      actor.guard += 6;
      actor.counter = 4;
      actor.persistentGuard = true;
      return outcome;
    case "inscribe":
      state.hostileRunes = enemyIntent.cells.map(cell => ({ x: cell.x, y: cell.y }));
      return outcome;
    case "detonate": {
      const victims = simLiving(state, "player").filter(unit =>
        state.hostileRunes.some(cell => cell.x === unit.x && cell.y === unit.y)
      );
      for (const victim of victims) simDealDamage(state, victim.id, 4, actor.id, { hostile: true, hazard: true }, outcome);
      state.hostileRunes = [];
      return outcome;
    }
    case "drain": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      simDealDamage(state, target.id, 2, actor.id, { hostile: true }, outcome);
      const injured = simLiving(state, "enemy").filter(unit => unit.hp < unit.maxHp).sort((a, b) => a.hp - b.hp)[0];
      if (injured) simHealWithCharge(injured, 2, outcome);
      return outcome;
    }
    default:
      return cancelOutcome(outcome, "未対応の敵行動");
  }
}

function cellLabel(cell) {
  return `[${cell.x + 1},${cell.y + 1}]`;
}

function changedTerrain(beforeCells, afterCells) {
  const beforeKeys = new Set(beforeCells.map(keyOf));
  const afterKeys = new Set(afterCells.map(keyOf));
  return {
    added: afterCells.filter(cell => !beforeKeys.has(keyOf(cell))),
    removed: beforeCells.filter(cell => !afterKeys.has(keyOf(cell)))
  };
}

function buildStructuredChanges(before, after, outcome, event) {
  const groups = [];
  const unitChanges = after.units.map(unit => ({ unit, old: before.units.find(item => item.id === unit.id) })).filter(item => item.old);
  const damaged = unitChanges.filter(({ unit, old }) => unit.hp < old.hp);
  const healed = unitChanges.filter(({ unit, old }) => unit.hp > old.hp);
  const moved = unitChanges.filter(({ unit, old }) => unit.x !== old.x || unit.y !== old.y);
  const guard = unitChanges.filter(({ unit, old }) => unit.guard !== old.guard || unit.persistentGuard !== old.persistentGuard);
  const charged = unitChanges.filter(({ unit, old }) => (unit.charge || 0) !== (old.charge || 0));
  const statusDefs = [
    ["ward", "結界"], ["marked", "標的"], ["rooted", "移動不能"], ["exposed", "露出"]
  ];
  const statusDetails = [];
  const statusCounts = new Map();

  if (outcome.status === "cancelled") {
    groups.push({
      type: "cancel", priority: 100,
      summary: `取消：${outcome.reason}`,
      details: [`${event.kind === "enemy" ? "敵行動" : "味方命令"}を取消：${outcome.reason}`]
    });
  }

  if (damaged.length) {
    const total = damaged.reduce((sum, { unit, old }) => sum + old.hp - unit.hp, 0);
    const ko = damaged.filter(({ unit, old }) => old.hp > 0 && unit.hp <= 0).length;
    groups.push({
      type: "damage", priority: ko ? 90 : 80,
      summary: damaged.length === 1
        ? `${damaged[0].unit.name}に${damaged[0].old.hp - damaged[0].unit.hp}ダメージ${ko ? "・撃破" : ""}`
        : `${damaged.length}人に計${total}ダメージ${ko ? `（${ko}人撃破）` : ""}`,
      details: damaged.map(({ unit, old }) => `${unit.name} HP ${old.hp}→${unit.hp}${old.hp > 0 && unit.hp <= 0 ? "（撃破）" : ""}`)
    });
  }

  if (healed.length) {
    const total = healed.reduce((sum, { unit, old }) => sum + unit.hp - old.hp, 0);
    groups.push({
      type: "heal", priority: 80,
      summary: healed.length === 1 ? `${healed[0].unit.name}が${healed[0].unit.hp - healed[0].old.hp}回復` : `${healed.length}人が計${total}回復`,
      details: healed.map(({ unit, old }) => `${unit.name} HP ${old.hp}→${unit.hp}`)
    });
  }

  if (moved.length) {
    groups.push({
      type: "move", priority: 70,
      summary: moved.length === 1 ? `${moved[0].unit.name} ${cellLabel(moved[0].old)}→${cellLabel(moved[0].unit)}` : `${moved.length}人が位置変更`,
      details: moved.map(({ unit, old }) => `${unit.name} ${cellLabel(old)}→${cellLabel(unit)}`)
    });
  }

  if (guard.length) {
    groups.push({
      type: "guard", priority: 60,
      summary: guard.length === 1 ? `${guard[0].unit.name} 装甲${guard[0].old.guard}→${guard[0].unit.guard}` : `${guard.length}人の装甲変化`,
      details: guard.map(({ unit, old }) => `${unit.name} 装甲 ${old.guard}→${unit.guard}${unit.persistentGuard ? "（持続）" : ""}`)
    });
  }

  for (const { unit, old } of unitChanges) {
    for (const [property, label] of statusDefs) {
      if (unit[property] === old[property]) continue;
      const operation = unit[property] ? "付与" : "解除";
      statusDetails.push(`${unit.name}：${label}${operation}`);
      const countKey = `${label}${unit[property] ? "+" : "-"}`;
      statusCounts.set(countKey, (statusCounts.get(countKey) || 0) + 1);
    }
  }
  if (statusDetails.length) {
    groups.push({
      type: "status", priority: 60,
      summary: [...statusCounts.entries()].map(([label, count]) => `${label}${count}`).join(" / "),
      details: statusDetails
    });
  }

  if (charged.length) {
    groups.push({
      type: "charge", priority: 75,
      summary: charged.length === 1
        ? `${charged[0].unit.name} 帯電${charged[0].old.charge || 0}→${charged[0].unit.charge || 0}`
        : `${charged.length}人の帯電変化`,
      details: charged.map(({ unit, old }) => `${unit.name} 帯電 ${old.charge || 0}→${unit.charge || 0}`)
    });
  }

  if (outcome.logs?.includes("連鎖先なし（帯電ボーナスなし）")) {
    groups.push({
      type: "chain", priority: 75,
      summary: "連鎖先なし（帯電ボーナスなし）",
      details: ["上下左右に生存敵がいないため、帯電を消費しない"]
    });
  }

  if (outcome.logs?.includes("火種の罠で残り移動停止")) {
    groups.push({
      type: "move_stop", priority: 85,
      summary: "火種の罠で残り移動停止",
      details: ["火種の罠を踏んだため、この移動イベントの残り歩数を失った"]
    });
  }

  for (const { unit, old } of unitChanges) {
    if (unit.coveringId === old.coveringId) continue;
    if (old.coveringId) {
      const oldTarget = before.units.find(item => item.id === old.coveringId);
      groups.push({ type: "cover_end", priority: 60, summary: `${unit.name}の庇護終了`, details: [`${unit.name} → ${oldTarget?.name || old.coveringId} の庇護を終了`] });
    }
    if (unit.coveringId) {
      const newTarget = after.units.find(item => item.id === unit.coveringId);
      groups.push({ type: "cover_start", priority: 60, summary: `${unit.name}が${newTarget?.name || unit.coveringId}を庇護`, details: [`${unit.name} → ${newTarget?.name || unit.coveringId} を庇護`] });
    }
  }

  for (const { unit, old } of unitChanges) {
    if (unit.counter === old.counter) continue;
    const ready = unit.counter > old.counter;
    groups.push({
      type: ready ? "counter_ready" : "counter_consume", priority: 60,
      summary: ready ? `${unit.name} 反撃${unit.counter}を準備` : `${unit.name}の反撃を消費`,
      details: [`${unit.name} 反撃 ${old.counter}→${unit.counter}`]
    });
  }

  const terrain = [
    ["火種の罠", changedTerrain(before.emberRunes, after.emberRunes)],
    ["災印", changedTerrain(before.hostileRunes, after.hostileRunes)]
  ];
  for (const [label, change] of terrain) {
    if (change.added.length) {
      groups.push({
        type: "zone_add", priority: 50,
        summary: `${label}を${change.added.length === 1 ? cellLabel(change.added[0]) : `${change.added.length}マス`}に設置`,
        details: [`${label}を ${change.added.map(cellLabel).join(" / ")} に設置`]
      });
    }
    if (change.removed.length) {
      groups.push({
        type: "zone_remove", priority: 50,
        summary: `${label}${change.removed.length}マス消滅`,
        details: [`${label} ${change.removed.map(cellLabel).join(" / ")} が消滅`]
      });
    }
  }

  return groups.sort((a, b) => b.priority - a.priority);
}

function summarizeStructuredChanges(groups) {
  if (!groups.length) return "状態変化なし";
  const shown = groups.slice(0, 2).map(group => group.summary).join(" / ");
  return groups.length > 2 ? `${shown} / ＋他${groups.length - 2}種` : shown;
}

function predictTimeline(events = buildResolutionEvents(), eventLimit = events.length) {
  const state = cloneCombatState(game);
  const snapshots = [];
  for (let index = 0; index < Math.min(eventLimit, events.length); index += 1) {
    const event = events[index];
    const before = cloneCombatState(state);
    const outcome = { status: "resolved", reason: "", logs: [] };
    if (simBattleResult(state)) cancelOutcome(outcome, "戦闘終了");
    else if (event.kind === "player") resolveSimPlayer(state, event, { events, index }, outcome);
    else resolveSimEnemy(state, event, outcome);
    outcome.groups = buildStructuredChanges(before, state, outcome, event);
    outcome.summary = summarizeStructuredChanges(outcome.groups);
    outcome.details = outcome.groups.flatMap(group => group.details);
    snapshots.push({ eventKey: event.key, state: cloneCombatState(state), outcome });
  }
  return {
    events,
    initial: cloneCombatState(game),
    snapshots,
    final: snapshots.length ? cloneCombatState(snapshots[snapshots.length - 1].state) : cloneCombatState(game)
  };
}

function currentForecast() {
  if (game.phase !== "planning" && game.activeForecast) return game.activeForecast;
  if (!game.queue.length) return null;
  return predictTimeline();
}

function selectedForecastState(forecast = currentForecast()) {
  if (!forecast) return null;
  if (Number.isInteger(game.previewIndex) && forecast.snapshots[game.previewIndex]) {
    return forecast.snapshots[game.previewIndex].state;
  }
  return forecast.final;
}

function timelineDisplayContext() {
  const selection = selectionTimelineContext();
  if (selection) {
    return {
      state: selection.state,
      events: selection.events,
      afterIndex: selection.eventIndex - 1,
      forecast: null,
      selection
    };
  }
  const forecast = currentForecast();
  if (forecast) {
    const afterIndex = Number.isInteger(game.previewIndex) && forecast.snapshots[game.previewIndex]
      ? game.previewIndex
      : forecast.events.length - 1;
    return {
      state: selectedForecastState(forecast),
      events: forecast.events,
      afterIndex,
      forecast,
      selection: null
    };
  }
  return {
    state: cloneCombatState(game),
    events: buildResolutionEvents(),
    afterIndex: -1,
    forecast: null,
    selection: null
  };
}

function forecastOutcomeByKey(forecast, eventKey) {
  if (!forecast) return null;
  const index = forecast.events.findIndex(event => event.key === eventKey);
  return index >= 0 ? forecast.snapshots[index]?.outcome || null : null;
}

function unresolvedIntentCells(context) {
  const baseForecast = context.forecast || currentForecast();
  return context.events.flatMap((event, index) => {
    if (index <= context.afterIndex || event.kind !== "enemy" || !event.payload.cells?.length) return [];
    const actor = simGetUnit(context.state, event.payload.actorId);
    if (!actor || actor.hp <= 0 || context.state.cancelledEventKeys.includes(event.key)) return [];
    const knownOutcome = forecastOutcomeByKey(baseForecast, event.key);
    if (knownOutcome?.status === "cancelled") return [];
    return event.payload.cells;
  });
}

function applyCombatState(state) {
  game.units = state.units.map(unit => ({ ...unit }));
  game.hostileRunes = state.hostileRunes.map(cell => ({ ...cell }));
  game.emberRunes = state.emberRunes.map(cell => ({ ...cell }));
}

async function executeTurn() {
  if (game.phase !== "planning" || !game.queue.length) return;
  const forecast = predictTimeline();
  game.activeForecast = forecast;
  game.phase = "resolving";
  clearSelection();
  render();
  addLog(`TURN ${String(game.turn).padStart(2, "0")}：命令を実行。`, true);

  const events = forecast.events;

  for (let index = 0; index < events.length; index += 1) {
    const snapshot = forecast.snapshots[index];
    game.timelineCursor = index;
    game.previewIndex = index;
    applyCombatState(snapshot.state);
    for (const message of snapshot.outcome.logs) addLog(message, snapshot.outcome.status === "cancelled" || message.includes("戦闘不能"));
    render();
    await pause(420);
  }

  game.timelineCursor = events.length;
  game.lastResolvedState = cloneCombatState(game);
  renderTimeline();

  if (battleResult()) {
    finishBattle(battleResult());
    return;
  }

  endTurnCleanup();
  game.turn += 1;
  game.timelineCursor = -1;
  game.previewIndex = null;
  game.activeForecast = null;
  game.intents = buildEnemyIntents();
  drawToFive();
  game.phase = "planning";
  addLog(`TURN ${String(game.turn).padStart(2, "0")}：新しい予告を確認。`, true);
  render();
}

async function resolvePlayerAction(action) {
  const def = cardDefs[action.cardId];
  const actor = getUnit(action.actorId);

  if (action.mode === "move") {
    if (!actor || actor.hp <= 0 || !isOrthogonallyAdjacent(actor, action.target) || !isEmpty(action.target.x, action.target.y)) {
      addLog(`${action.label}は実行できなかった。`);
      return;
    }
    actor.x = action.target.x;
    actor.y = action.target.y;
    addLog(`${actor.name}が1マス移動。`);
    render();
    return;
  }

  if (action.mode === "legacy") {
    const target = getUnit(action.targetId);
    if (!target || target.hp <= 0) {
      addLog("遺志の対象がいない。命令は失われた。");
      return;
    }
    if (def.ownerId === "rook") {
      target.guard += 2;
      addLog(`ルークの遺志。${target.name}に装甲2。`, true);
    } else if (def.ownerId === "vale") {
      target.marked = true;
      addLog(`ヴェイルの遺志。${target.name}に狩人の印。`, true);
    } else {
      target.ward = true;
      addLog(`イオナの遺志。${target.name}に結界。`, true);
    }
    render();
    return;
  }

  if (!actor || actor.hp <= 0) {
    addLog(`${ownerMeta[def.ownerId].name}は倒れている。${def.name}は不発。`);
    return;
  }
  const target = action.targetId ? getUnit(action.targetId) : null;
  addLog(`${actor.name}の「${def.name}」。`, true);

  switch (action.cardId) {
    case "forward_cut": {
      if (!target || target.hp <= 0) return fizzle("対象がいない。");
      if (distance(actor, target) === 2) await moveToward(actor, target, 1);
      if (isOrthogonallyAdjacent(actor, target)) await dealDamage(target, 3, actor, { melee: true });
      else fizzle("敵へ届かなかった。");
      break;
    }
    case "interpose": {
      if (!target || target.hp <= 0) return fizzle("守る味方がいない。");
      await moveToward(actor, target, 2);
      actor.guard += 2;
      target.guard += 2;
      addLog(`${actor.name}と${target.name}に装甲2。`);
      render();
      break;
    }
    case "shield_lock": {
      actor.guard += 5;
      const adjacentAllies = living("player").filter(unit => unit.id !== actor.id && isOrthogonallyAdjacent(actor, unit));
      actor.coveringId = adjacentAllies[0]?.id || null;
      addLog(`${actor.name}に装甲5${actor.coveringId ? `。${getUnit(actor.coveringId).name}を庇う` : ""}。`);
      render();
      break;
    }
    case "pommel_break": {
      if (!target || target.hp <= 0 || !isOrthogonallyAdjacent(actor, target)) return fizzle("敵が上下左右に隣接していない。");
      target.guard = 0;
      target.counter = 0;
      target.persistentGuard = false;
      target.channelCancelled = game.intents.some(item => item.actorId === target.id && item.channel);
      await dealDamage(target, 2, actor, { melee: true });
      addLog(`${target.name}の装甲${target.channelCancelled ? "と、このターンの詠唱" : ""}を解除。`);
      break;
    }
    case "quickshot": {
      if (!validRangedTarget(actor, target, 3)) return fizzle("射程外になった。");
      await dealDamage(target, 2, actor);
      break;
    }
    case "pinning_arrow": {
      if (!validRangedTarget(actor, target, 4)) return fizzle("射程外になった。");
      await dealDamage(target, 1, actor);
      if (target.hp > 0) {
        target.rooted = true;
        addLog(`${target.name}の移動を封じた。`);
      }
      render();
      break;
    }
    case "backstep_shot": {
      if (!validRangedTarget(actor, target, 3)) return fizzle("射程外になった。");
      await dealDamage(target, 2, actor);
      const options = neighbors(actor).filter(cell => isEmpty(cell.x, cell.y))
        .sort((a, b) => distance(b, target) - distance(a, target));
      if (options[0]) {
        actor.x = options[0].x;
        actor.y = options[0].y;
        addLog(`${actor.name}が間合いを取る。`);
        render();
      }
      break;
    }
    case "hunters_mark": {
      if (!validRangedTarget(actor, target, 4)) return fizzle("射程外になった。");
      target.marked = true;
      addLog(`${target.name}に狩人の印。次の攻撃+3。`);
      render();
      break;
    }
    case "arc_spark": {
      if (!validRangedTarget(actor, target, 3)) return fizzle("射程外になった。");
      const chained = living("enemy").filter(unit => unit.id !== target.id && isOrthogonallyAdjacent(unit, target));
      const charge = Math.min(2, target.charge || 0);
      await dealDamage(target, 3, actor);
      for (const other of chained) await dealDamage(other, 2 + charge, actor, { ignoreMark: true });
      if (chained.length) {
        target.charge = 0;
        addLog(`${target.name}の帯電${charge}を連鎖に消費。`);
      } else {
        addLog("連鎖先なし（帯電ボーナスなし）");
      }
      break;
    }
    case "phase_step": {
      if (!target || target.hp <= 0 || target.side !== "player" || distance(actor, target) > 3) return fizzle("交換対象がいない。");
      const old = { x: actor.x, y: actor.y };
      actor.x = target.x; actor.y = target.y;
      target.x = old.x; target.y = old.y;
      addLog(`${actor.name}と${target.name}が位置交換。`);
      render();
      break;
    }
    case "null_sigil": {
      if (!target || target.hp <= 0 || target.side !== "player" || distance(actor, target) > 3) return fizzle("結界対象がいない。");
      target.ward = true;
      addLog(`${target.name}に結界。`);
      render();
      break;
    }
    case "ember_rune": {
      if (!isEmpty(action.target.x, action.target.y) || distance(actor, action.target) > 3) return fizzle("罠を置けない。");
      game.emberRunes.push({ ...action.target });
      addLog("火種の罠を設置。敵が踏めば3ダメージ。 ");
      render();
      break;
    }
    default:
      break;
  }
}

function validRangedTarget(actor, target, range) {
  return target && target.hp > 0 && target.side === "enemy" && distance(actor, target) <= range;
}

function fizzle(message) {
  addLog(message);
}

async function resolveEnemyIntent(enemyIntent) {
  const actor = getUnit(enemyIntent.actorId);
  if (!actor || actor.hp <= 0) return;
  if (actor.id === "bastion" && actor.persistentGuard && enemyIntent.id !== "brace") {
    actor.guard = 0;
    actor.counter = 0;
    actor.persistentGuard = false;
  }
  const target = enemyIntent.targetId ? getUnit(enemyIntent.targetId) : null;
  addLog(`${actor.name}の「${enemyIntent.name}」。`, true);

  switch (enemyIntent.id) {
    case "stalk":
      if (!target || target.hp <= 0) return;
      await moveToward(actor, target, 2);
      if (actor.hp > 0 && isOrthogonallyAdjacent(actor, target)) await dealDamage(target, 2, actor, { hostile: true, melee: true });
      break;
    case "pounce":
      if (!target || target.hp <= 0) return;
      await moveToward(actor, target, 3);
      if (actor.hp > 0 && isOrthogonallyAdjacent(actor, target)) await dealDamage(target, 4, actor, { hostile: true, melee: true });
      else addLog("追跡獣の飛びかかりは届かなかった。", true);
      break;
    case "recover":
      if (!target || target.hp <= 0) return;
      if (isOrthogonallyAdjacent(actor, target)) await dealDamage(target, 2, actor, { hostile: true, melee: true });
      else await moveToward(actor, target, 1);
      break;
    case "cover": {
      if (!target || target.hp <= 0) return;
      target.guard += 4;
      actor.coveringId = isOrthogonallyAdjacent(actor, target) ? target.id : null;
      addLog(`${target.name}に装甲4${actor.coveringId ? "。城壁兵が肩代わり" : ""}。`);
      render();
      break;
    }
    case "shield_drive":
      if (!target || target.hp <= 0) return;
      await moveToward(actor, target, 1);
      if (actor.hp > 0 && target.hp > 0 && isOrthogonallyAdjacent(actor, target)) {
        await dealDamage(target, 3, actor, { hostile: true, melee: true });
        if (target.hp > 0 && !consumeWard(target, "露出")) {
          target.exposed = true;
          addLog(`${target.name}は露出。次の敵攻撃+1。`);
        }
      }
      break;
    case "brace":
      actor.guard += 6;
      actor.counter = 4;
      actor.persistentGuard = true;
      addLog(`${actor.name}に装甲6。隣接攻撃へ反撃を構える。`);
      render();
      break;
    case "inscribe":
      game.hostileRunes = enemyIntent.cells.map(cell => ({ x: cell.x, y: cell.y }));
      addLog(`${target?.name || "味方"}の周囲に災印が刻まれた。次ターンに起爆。`, true);
      render();
      break;
    case "detonate": {
      if (actor.channelCancelled) {
        addLog("詠唱が崩れ、災印は起爆しなかった。", true);
        actor.channelCancelled = false;
        game.hostileRunes = [];
        render();
        return;
      }
      const victims = living("player").filter(unit => game.hostileRunes.some(cell => cell.x === unit.x && cell.y === unit.y));
      if (!victims.length) addLog("災印は空のマスで爆発した。", true);
      for (const victim of victims) await dealDamage(victim, 4, actor, { hostile: true, hazard: true });
      game.hostileRunes = [];
      render();
      break;
    }
    case "drain": {
      if (!target || target.hp <= 0) return;
      await dealDamage(target, 2, actor, { hostile: true });
      const injured = living("enemy").filter(unit => unit.hp < unit.maxHp).sort((a, b) => a.hp - b.hp)[0];
      if (injured) {
        const healed = Math.min(2, injured.maxHp - injured.hp);
        injured.hp += healed;
        injured.charge = Math.min(2, (injured.charge || 0) + healed);
        addLog(`${injured.name}が${healed}回復。帯電${injured.charge}。`);
        render();
      }
      break;
    }
    default:
      break;
  }
}

function findPathToAdjacent(mover, target) {
  const startKey = `${mover.x},${mover.y}`;
  const queue = [{ x: mover.x, y: mover.y }];
  const cameFrom = new Map([[startKey, null]]);
  let end = null;

  while (queue.length) {
    const current = queue.shift();
    if (isOrthogonallyAdjacent(current, target)) {
      end = current;
      break;
    }
    for (const next of neighbors(current)) {
      const nextKey = keyOf(next);
      if (cameFrom.has(nextKey) || isWall(next.x, next.y)) continue;
      const occupant = unitAt(next.x, next.y);
      if (occupant && occupant.id !== mover.id) continue;
      cameFrom.set(nextKey, current);
      queue.push(next);
    }
  }

  if (!end) return [];
  const path = [];
  let current = end;
  while (current && keyOf(current) !== startKey) {
    path.unshift(current);
    current = cameFrom.get(keyOf(current));
  }
  return path;
}

async function moveToward(mover, target, steps) {
  if (mover.rooted) {
    addLog(`${mover.name}は縫い留められ、移動できない。`, true);
    return;
  }
  const path = findPathToAdjacent(mover, target).slice(0, steps);
  for (const cell of path) {
    if (mover.hp <= 0) break;
    mover.x = cell.x;
    mover.y = cell.y;
    render();
    await pause(150);
    if (mover.side === "enemy" && await triggerEmberRune(mover)) break;
  }
}

async function triggerEmberRune(enemy) {
  const index = game.emberRunes.findIndex(cell => cell.x === enemy.x && cell.y === enemy.y);
  if (index < 0) return false;
  game.emberRunes.splice(index, 1);
  addLog(`${enemy.name}が火種の罠を踏んだ。`, true);
  await dealDamage(enemy, 3, getUnit("iona"));
  addLog("火種の罠で残り移動停止", true);
  return true;
}

function consumeWard(target, effectName) {
  if (!target.ward) return false;
  target.ward = false;
  addLog(`${target.name}の結界が「${effectName}」を無効化。`, true);
  render();
  return true;
}

async function dealDamage(originalTarget, amount, source, options = {}) {
  if (!originalTarget || originalTarget.hp <= 0) return;
  if (options.hazard && consumeWard(originalTarget, "地形ダメージ")) return;

  let target = originalTarget;
  if (source?.side === "player" && target.side === "enemy" && target.id !== "bastion") {
    const bastion = getUnit("bastion");
    if (bastion?.hp > 0 && bastion.coveringId === target.id && isOrthogonallyAdjacent(bastion, target)) {
      addLog(`城壁兵が${target.name}への攻撃を肩代わり。`, true);
      target = bastion;
    }
  }
  if (source?.side === "enemy" && target.side === "player" && target.id !== "rook") {
    const rook = getUnit("rook");
    if (rook?.hp > 0 && rook.coveringId === target.id && isOrthogonallyAdjacent(rook, target)) {
      addLog(`ルークが${target.name}への攻撃を肩代わり。`, true);
      target = rook;
    }
  }

  let finalAmount = amount;
  if (source?.side === "player" && target.marked && !options.ignoreMark) {
    finalAmount += 3;
    target.marked = false;
    addLog("狩人の印が発動。ダメージ+3。", true);
  }
  if (source?.side === "enemy" && target.exposed) {
    finalAmount += 1;
    target.exposed = false;
    addLog("露出を突かれ、ダメージ+1。", true);
  }

  const absorbed = Math.min(target.guard, finalAmount);
  target.guard -= absorbed;
  const hpDamage = finalAmount - absorbed;
  target.hp = Math.max(0, target.hp - hpDamage);
  flash(target.id);
  addLog(`${target.name}に${hpDamage}ダメージ${absorbed ? `（装甲が${absorbed}吸収）` : ""}。`, hpDamage >= 3);
  render();
  await pause(180);

  if (target.hp <= 0) {
    target.coveringId = null;
    addLog(`${target.name}が戦闘不能。`, true);
    render();
  }

  if (options.melee && source?.side === "player" && target.id === "bastion" && target.hp > 0 && target.counter > 0 && isOrthogonallyAdjacent(target, source)) {
    const counterDamage = target.counter;
    target.counter = 0;
    addLog(`城壁兵の反撃。${source.name}へ${counterDamage}ダメージ。`, true);
    await dealDamage(source, counterDamage, target, { hostile: true });
  }
}

function flash(unitId) {
  game.flashUnitId = unitId;
  el.board.classList.remove("shake");
  void el.board.offsetWidth;
  el.board.classList.add("shake");
  setTimeout(() => {
    game.flashUnitId = null;
    el.board.classList.remove("shake");
    renderBoard();
  }, 260);
}

function endTurnCleanup() {
  for (const card of game.hand) game.discard.push(card);
  for (const action of game.queue) game.discard.push(action.instance);
  game.hand = [];
  game.queue = [];
  for (const unit of game.units) {
    if (!unit.persistentGuard) unit.guard = 0;
    unit.rooted = false;
    unit.coveringId = null;
    unit.channelCancelled = false;
    unit.charge = 0;
  }
}

function battleResult() {
  if (!living("enemy").length) return "victory";
  if (!living("player").length) return "defeat";
  return null;
}

function finishBattle(result) {
  game.phase = "ended";
  render();
  if (result === "victory") {
    showModal("演習完了。", `
      <p>敵部隊を制圧しました。今回は固定編成ですが、次の段階では戦闘後に仲間かカードを選び、部隊デッキを変化させます。</p>
      <p>何が強かったか、使いにくかったカードは何かを覚えておいてください。</p>
    `, "もう一度", "restart");
  } else {
    showModal("部隊壊滅。", `
      <p>敵の予告に対し、移動・防御・妨害のどこへ命令を使うかが鍵です。</p>
      <p>1ターン目に災印が置かれ、2ターン目に起爆します。「柄打ち」か「無効印」も試してください。</p>
    `, "再戦する", "restart");
  }
}

function addLog(message, important = false) {
  game.log.unshift({ turn: game.turn, message, important });
  game.log = game.log.slice(0, 30);
  renderLog();
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function render() {
  renderBoard();
  renderHand();
  renderIntents();
  renderSquad();
  renderQueue();
  renderTimeline();
  renderLog();
  renderControls();
}

function activeStatusEntries(unit) {
  return Object.entries(statusMeta)
    .filter(([, meta]) => meta.active(unit))
    .sort(([, a], [, b]) => a.order - b.order);
}

function statusFullDescription(key, unit) {
  const meta = statusMeta[key];
  return `${meta.label}：${meta.detail(unit)}`;
}

function statusAriaValue(key, unit, actual) {
  const meta = statusMeta[key];
  if (key === "guard" || key === "charge") {
    const current = unit[key];
    const previous = actual?.[key] || 0;
    return actual && previous !== current
      ? `${meta.label} ${previous}から${current}`
      : `${meta.label}${current}`;
  }
  return meta.label;
}

function statusChanged(key, unit, actual) {
  return Boolean(actual && actual[key] !== unit[key]);
}

function unitCellAriaLabel(unit, actual, projected, x, y, statuses = activeStatusEntries(unit)) {
  const hp = actual && actual.hp !== unit.hp
    ? `HP ${actual.hp}から${unit.hp}、最大${unit.maxHp}`
    : `HP ${unit.hp}/${unit.maxHp}`;
  return [
    `${x + 1}列 ${y + 1}行`,
    unit.side === "enemy" ? "敵" : "味方",
    unit.name,
    hp,
    ...statuses.map(([key]) => statusAriaValue(key, unit, actual)),
    projected ? "予測表示" : ""
  ].filter(Boolean).join("、");
}

function closeStatusPopover(clearPin = false) {
  if (clearPin) pinnedStatusPopover = null;
  el.statusPopover.hidden = true;
  el.statusPopover.setAttribute("aria-hidden", "true");
  el.statusPopover.innerHTML = "";
}

function showStatusPopover(unit, priorityKey = null, pin = false) {
  const statuses = activeStatusEntries(unit);
  if (!statuses.length) {
    closeStatusPopover(pin);
    return;
  }
  if (pin) pinnedStatusPopover = { unit: { ...unit }, priorityKey };
  const ordered = priorityKey
    ? [...statuses].sort(([keyA, metaA], [keyB, metaB]) =>
      (keyA === priorityKey ? -1 : keyB === priorityKey ? 1 : metaA.order - metaB.order))
    : statuses;
  el.statusPopover.innerHTML = `
    <div class="status-popover-heading"><strong>${unit.name}</strong><span>${pin ? "説明を固定中" : "有効な状態"}</span></div>
    <div class="status-popover-list">
      ${ordered.map(([key, meta]) => `
        <section class="status-popover-item tone-${meta.tone}" data-status="${key}">
          <strong>${meta.short(unit)}｜${meta.label}</strong>
          <p>${meta.detail(unit)}</p>
        </section>
      `).join("")}
    </div>
  `;
  el.statusPopover.hidden = false;
  el.statusPopover.setAttribute("aria-hidden", "true");
}

function restorePinnedStatusPopover() {
  if (pinnedStatusPopover) {
    showStatusPopover(pinnedStatusPopover.unit, pinnedStatusPopover.priorityKey, true);
    return;
  }
  closeStatusPopover(false);
}

function renderBoard() {
  closeStatusPopover(true);
  const valid = new Set(validCells().map(keyOf));
  const context = timelineDisplayContext();
  const previewState = context.state;
  const isPreview = Boolean(selectedCard() || currentForecast());
  const displayedHostileRunes = previewState.hostileRunes;
  const displayedEmberRunes = previewState.emberRunes;
  const intentCells = new Set(unresolvedIntentCells(context).map(keyOf));
  el.board.classList.toggle("resolving", game.phase !== "planning");
  el.board.innerHTML = "";

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${x + 1}列 ${y + 1}行`);
      if (isWall(x, y)) cell.classList.add("wall");
      if (valid.has(`${x},${y}`)) cell.classList.add("valid");
      if (intentCells.has(`${x},${y}`)) cell.classList.add("intent");
      if (displayedHostileRunes.some(rune => rune.x === x && rune.y === y)) cell.classList.add("rune");
      if (displayedEmberRunes.some(rune => rune.x === x && rune.y === y)) cell.classList.add("ember");
      const unit = previewDisplayUnitAt(previewState, x, y);
      if (isPreview) {
        const movedFromHere = game.units.some(item => {
          const predicted = simGetUnit(previewState, item.id);
          return item.hp > 0 && item.x === x && item.y === y
            && predicted && predicted.hp > 0
            && (predicted.x !== item.x || predicted.y !== item.y);
        });
        if (movedFromHere) cell.classList.add("origin-cell");
      }
      if (unit) {
        const actual = getUnit(unit.id);
        const hasMoved = Boolean(actual && (actual.x !== unit.x || actual.y !== unit.y));
        const projected = isPreview || hasMoved;
        const statuses = activeStatusEntries(unit);
        cell.setAttribute("aria-label", unitCellAriaLabel(unit, actual, projected, x, y, statuses));
        const token = renderUnit(unit, projected, actual, statuses);
        cell.appendChild(token);
        if (statuses.length) {
          const description = document.createElement("span");
          description.id = `status-desc-${unit.id}`;
          description.className = "sr-only status-description";
          description.textContent = statuses.map(([key]) => statusFullDescription(key, unit)).join(" ");
          cell.setAttribute("aria-describedby", description.id);
          cell.appendChild(description);
          cell.addEventListener("focus", () => showStatusPopover(unit));
          cell.addEventListener("blur", () => restorePinnedStatusPopover());
        }
      }
      cell.addEventListener("click", () => handleCellClick(x, y));
      el.board.appendChild(cell);
    }
  }
}

function previewDisplayUnitAt(state, x, y) {
  return state.units.find(unit => unit.hp > 0 && unit.x === x && unit.y === y);
}

function renderUnit(unit, projected = false, actual = unit, statuses = activeStatusEntries(unit)) {
  const token = document.createElement("div");
  const selected = game.moveUnitId === unit.id ? " selected-unit" : "";
  const hit = game.flashUnitId === unit.id ? " hit" : "";
  const preview = projected ? " projected-unit" : "";
  const ward = statuses.some(([key]) => key === "ward") ? " has-ward" : "";
  token.className = `unit ${unit.side}${selected}${hit}${preview}${ward}`;
  token.setAttribute("aria-hidden", "true");
  const hpChanged = actual && actual.hp !== unit.hp;
  const hpText = hpChanged ? `${actual.hp}→${unit.hp}` : `${unit.hp}/${unit.maxHp}`;
  token.innerHTML = `
    <div class="unit-icon">${unit.icon}</div>
    <div class="unit-name">${unit.name}</div>
    <div class="hp-track"><div class="hp-fill" style="width:${(unit.hp / unit.maxHp) * 100}%"></div></div>
    <div class="unit-hp-number${hpChanged ? " changed" : ""}"><span>HP</span> ${hpText}</div>
  `;
  if (statuses.length) {
    const surface = document.createElement("div");
    surface.className = "unit-statuses";
    surface.dataset.unitId = unit.id;
    statuses.forEach(([key, meta]) => {
      const chip = document.createElement("span");
      chip.className = `status-chip ${key} shape-${meta.shape} tone-${meta.tone}${statusChanged(key, unit, actual) ? " changed" : ""}`;
      chip.dataset.status = key;
      if (key === "guard" || key === "charge") {
        const symbol = key === "guard" ? "盾" : "⚡";
        chip.innerHTML = `<span class="status-symbol">${symbol}</span><b>${unit[key]}</b>`;
      } else {
        chip.textContent = meta.short(unit);
      }
      chip.addEventListener("mouseenter", () => showStatusPopover(unit, key));
      chip.addEventListener("mouseleave", () => restorePinnedStatusPopover());
      surface.appendChild(chip);
    });
    surface.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      showStatusPopover(unit, null, true);
    });
    token.addEventListener("mouseenter", () => showStatusPopover(unit));
    token.addEventListener("mouseleave", () => restorePinnedStatusPopover());
    token.appendChild(surface);
  }
  return token;
}

function categoryIconSvg(categoryKey) {
  const icon = cardCategoryMeta[categoryKey]?.icon;
  const paths = {
    blade: '<path d="M3 13 11.5 4.5 15 3l-1.5 3.5L5 15H3v-2Z" fill="currentColor"/><path d="m3.5 12.5 2 2" stroke="currentColor" stroke-width="1.5"/>',
    shield: '<path d="M9 2.5 15 5v4.2c0 3.4-2.1 5.6-6 7.3-3.9-1.7-6-3.9-6-7.3V5l6-2.5Z" fill="currentColor"/><path d="M9 5v8" stroke="Canvas" stroke-width="1.2" opacity=".72"/>',
    arrows: '<path d="M2.5 6h11m-3-3 3 3-3 3M15.5 12h-11m3 3-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    knot: '<rect x="2.5" y="3" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m6 7 6 4M12 7l-6 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/>',
    "floor-diamond": '<path d="M9 2.5 16 9l-7 6.5L2 9l7-6.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="9" r="2" fill="currentColor"/>'
  };
  return `<svg class="category-icon icon-${icon}" viewBox="0 0 18 18" aria-hidden="true" focusable="false">${paths[icon] || ""}</svg>`;
}

function cardCategoryLabel(shown, categoryKey) {
  const label = cardCategoryMeta[categoryKey]?.label || categoryKey;
  return shown.categoryDetail && categoryKey === "control"
    ? `${label}：${shown.categoryDetail}`
    : label;
}

function cardCategorySummary(shown) {
  const labels = shown.categories.map(key => cardCategoryLabel(shown, key));
  return [`主用途 ${labels[0]}`, labels[1] ? `副用途 ${labels[1]}` : ""].filter(Boolean).join("、");
}

function renderCardCategories(shown, moveMode) {
  return `
    <span class="card-category-block${moveMode ? " move-origin" : ""}" aria-hidden="true">
      ${moveMode ? '<span class="category-context">元の用途</span>' : ""}
      <span class="card-categories">
        ${shown.categories.map((key, index) => `
          <span class="card-category ${index === 0 ? "primary" : "secondary"} category-${key}">
            ${categoryIconSvg(key)}
            <span class="category-role">${index === 0 ? "主" : "＋"}</span>
            <b>${cardCategoryLabel(shown, key)}</b>
          </span>
        `).join("")}
      </span>
    </span>
  `;
}

function cardAriaLabel(def, shown, isLegacy, selected, moveMode) {
  const ownerName = ownerMeta[def.ownerId].name;
  const legacyText = isLegacy ? "遺志。" : "";
  const categoryText = cardCategorySummary(shown);
  const modeText = moveMode
    ? `移動命令として選択中。元の用途は${categoryText}。`
    : selected ? `${isLegacy ? "遺志" : "技法"}として選択中。${categoryText}。` : `${categoryText}。`;
  return `${ownerName}、${shown.name}。${legacyText}${modeText}${SPEED_LABEL[shown.speed]}。${shown.text} ALTで味方を1マス移動。`;
}

function renderHand() {
  el.hand.innerHTML = "";
  if (!game.hand.length) {
    el.hand.innerHTML = `<p class="command-copy">命令実行中…</p>`;
    return;
  }
  for (const instance of game.hand) {
    const def = cardDefs[instance.cardId];
    const owner = getUnit(def.ownerId);
    const isLegacy = !owner || owner.hp <= 0;
    const shown = isLegacy ? getLegacy(def.ownerId) : def;
    const selected = game.selectedInstanceId === instance.instanceId;
    const moveMode = selected && game.mode === "move";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card${selected ? " selected" : ""}${moveMode ? " move-mode" : ""}${isLegacy ? " legacy" : ""}`;
    button.style.setProperty("--owner-color", ownerMeta[def.ownerId].color);
    button.disabled = game.phase !== "planning" || game.queue.length >= 3;
    button.setAttribute("aria-label", cardAriaLabel(def, shown, isLegacy, selected, moveMode));
    button.innerHTML = `
      <span class="card-owner">${ownerMeta[def.ownerId].name} / ${ownerMeta[def.ownerId].role}</span>
      ${renderCardCategories(shown, moveMode)}
      <h3>${shown.name}</h3>
      <p>${shown.text}</p>
      <div class="card-bottom">
        <span class="card-move${moveMode ? " active-use-mode" : ""}">${moveMode ? `${categoryIconSvg("mobility")}<b>使用中：移動命令</b>` : "ALT：味方を1マス移動"}</span>
        ${isLegacy ? `<span class="legacy-tag">LEGACY</span>` : `<span class="speed ${shown.speed}">${SPEED_LABEL[shown.speed]}</span>`}
      </div>
    `;
    button.addEventListener("click", () => selectCard(instance.instanceId));
    el.hand.appendChild(button);
  }
}

function renderIntents() {
  el.intents.innerHTML = "";
  const forecastState = displayTimelineState();
  for (const item of game.intents) {
    const actor = getUnit(item.actorId);
    if (!actor || actor.hp <= 0) continue;
    const target = item.targetId ? getUnit(item.targetId) : null;
    const shownActor = forecastState?.units.find(unit => unit.id === actor.id) || actor;
    const cellTarget = item.targetKind === "cells"
      ? `TARGET：マス ${item.cells?.map(cell => `(${cell.x + 1},${cell.y + 1})`).join(" / ") || "なし"}`
      : null;
    const card = document.createElement("article");
    card.className = "intent-card";
    card.innerHTML = `
      <div class="intent-icon">${actor.icon}</div>
      <div>
        <h3><span>${actor.name}｜${item.name}</span><b class="intent-hp${shownActor.hp !== actor.hp ? " changed" : ""}">HP ${shownActor.hp !== actor.hp ? `${actor.hp}→${shownActor.hp}` : `${actor.hp}/${actor.maxHp}`}</b></h3>
        <p>${item.description}</p>
        <p class="intent-target">${cellTarget || (target ? `TARGET：${target.name}` : "TARGET：自身")}</p>
      </div>
      <span class="speed ${item.speed}">${SPEED_LABEL[item.speed]}</span>
    `;
    el.intents.appendChild(card);
  }
  if (!el.intents.children.length) el.intents.innerHTML = `<p class="command-copy">敵の行動なし</p>`;
}

function renderSquad() {
  el.squad.innerHTML = "";
  const forecastState = displayTimelineState();
  const actualPlayers = game.units.filter(item => item.side === "player");
  for (const actual of actualPlayers) {
    const unit = forecastState?.units.find(item => item.id === actual.id) || actual;
    const row = document.createElement("div");
    row.className = `squad-member${unit.hp <= 0 ? " down" : ""}`;
    const statuses = [unit.guard ? `装甲${unit.guard}` : "", unit.ward ? "結界" : "", unit.exposed ? "露出" : ""].filter(Boolean).join(" / ");
    const hpChanged = unit.hp !== actual.hp;
    row.innerHTML = `
      <div><span class="squad-name">${unit.name}</span> <span class="squad-role">${statuses || unit.role}</span></div>
      <span class="squad-hp${hpChanged ? " changed" : ""}">${hpChanged ? `${actual.hp}→${unit.hp}` : `${unit.hp}/${unit.maxHp}`}</span>
      <div class="mini-track"><div class="mini-fill" style="width:${(unit.hp / unit.maxHp) * 100}%"></div></div>
    `;
    el.squad.appendChild(row);
  }
}

function renderQueue() {
  el.queue.innerHTML = "";
  for (let i = 0; i < 3; i += 1) {
    const action = game.queue[i];
    const slot = document.createElement("div");
    slot.className = `queue-slot${action ? " filled" : ""}`;
    slot.innerHTML = action
      ? `<span class="queue-number">0${i + 1}</span>${action.label} <span class="speed ${action.speed}">${SPEED_LABEL[action.speed]}</span>`
      : `<span class="queue-number">0${i + 1}</span>命令待機`;
    el.queue.appendChild(slot);
  }

  el.pips.innerHTML = "";
  for (let i = 0; i < 3; i += 1) {
    const pip = document.createElement("span");
    pip.className = `command-pip${i >= game.queue.length ? " available" : ""}`;
    el.pips.appendChild(pip);
  }
}

function timelineTargetLabel(event) {
  const payload = event.payload;
  if (event.kind === "enemy") {
    if (payload.targetKind === "cells") {
      const cells = payload.cells?.map(cell => `(${cell.x + 1},${cell.y + 1})`).join(" / ") || "なし";
      return `マス ${cells}`;
    }
    if (payload.targetId) return getUnit(payload.targetId)?.name || payload.targetId;
    return "自身";
  }

  if (payload.provisional && !payload.targetId && !payload.target) return "選択待ち";
  if (payload.targetId) return getUnit(payload.targetId)?.name || payload.targetId;
  if (payload.target) return `マス (${payload.target.x + 1},${payload.target.y + 1})`;
  const def = cardDefs[payload.cardId];
  if (def?.target === "self") return getUnit(payload.actorId)?.name || ownerMeta[def.ownerId]?.name || "自身";
  return payload.provisional ? "選択待ち" : "自身";
}

function intentDescriptionClauses(enemyIntent) {
  return (enemyIntent.description || "")
    .split("。")
    .map(clause => clause.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function highlightIntentClause(clause) {
  return clause.replace(
    /(\d+|移動|接近|突進|ダメージ|次ターン|露出|装甲|帯電|柄打ち|解除|回復)/g,
    "<strong>$1</strong>"
  );
}

function timelineResultLabel(provisional, outcome, selection, index) {
  if (provisional) return "この命令の直前";
  if (outcome) return `予測：${outcome.summary}`;
  if (selection && index > selection.eventIndex) return "対象確定後に再予測";
  return "予測待ち";
}

function renderTimeline() {
  const selection = selectionTimelineContext();
  const forecast = selection ? null : currentForecast();
  const events = selection?.events || forecast?.events || buildResolutionEvents();
  el.timeline.innerHTML = "";

  if (!events.length) {
    el.timeline.innerHTML = `<div class="timeline-empty">行動はまだありません</div>`;
  }

  events.forEach((event, index) => {
    const view = timelineEventView(event);
    const provisional = Boolean(event.payload.provisional);
    const outcome = selection
      ? (index < selection.eventIndex ? selection.snapshots[index]?.outcome : null)
      : forecast?.snapshots[index]?.outcome;
    const step = document.createElement("button");
    step.type = "button";
    const isDone = game.timelineCursor >= 0 && index < game.timelineCursor;
    const isCurrent = game.phase === "resolving" && index === game.timelineCursor;
    const isSelected = provisional || (game.phase === "planning" && !selection && game.previewIndex === index);
    const cancelled = outcome ? outcome.status === "cancelled" : !view.canAct;
    const sideLabel = event.kind === "enemy" ? "ENEMY" : "ALLY";
    const spokenSide = event.kind === "enemy" ? "敵" : "味方";
    const targetLabel = timelineTargetLabel(event);
    const effectClauses = event.kind === "enemy" ? intentDescriptionClauses(event.payload) : [];
    const resultLabel = timelineResultLabel(provisional, outcome, selection, index);
    const orderLabel = String(index + 1).padStart(2, "0");
    step.className = `timeline-step ${event.kind}${provisional ? " provisional" : ""}${isDone ? " done" : ""}${isCurrent ? " current" : ""}${isSelected ? " selected" : ""}${cancelled ? " cancelled" : ""}`;
    step.dataset.eventKey = event.key;
    step.setAttribute("aria-label", [
      `順番${orderLabel}`,
      spokenSide,
      view.name,
      view.action,
      SPEED_LABEL[event.speed],
      `対象${targetLabel}`,
      ...effectClauses,
      resultLabel
    ].join("、"));
    step.setAttribute("aria-controls", "timeline-detail-panel");
    step.setAttribute("aria-expanded", String(Boolean(
      provisional || ((game.phase === "resolving" ? game.timelineCursor : game.previewIndex) === index && outcome)
    )));
    step.setAttribute("aria-pressed", String(Boolean(game.phase === "planning" && isSelected)));
    if (isCurrent) step.setAttribute("aria-current", "step");
    step.innerHTML = `
      <span class="timeline-index">${orderLabel}</span>
      <span class="timeline-side">${sideLabel}</span>
      <span class="timeline-name">${view.name}</span>
      <span class="timeline-action">${cancelled ? "取消：" : ""}${view.action}</span>
      <span class="speed ${event.speed}">${SPEED_LABEL[event.speed]}</span>
      <span class="timeline-target">対象：${targetLabel}</span>
      ${effectClauses.length ? `<span class="timeline-effects">${effectClauses.map(clause => `<span>${highlightIntentClause(clause)}。</span>`).join("")}</span>` : ""}
      <span class="timeline-result${outcome ? " predicted" : ""}">${resultLabel}</span>
    `;
    step.disabled = game.phase !== "planning" || provisional;
    step.addEventListener("focus", () => {
      step.scrollIntoView?.({ inline: "nearest", block: "nearest" });
    });
    step.addEventListener("click", () => {
      const baseForecast = currentForecast() || predictTimeline(buildResolutionEvents());
      const baseIndex = baseForecast.events.findIndex(item => item.key === event.key);
      clearSelection();
      game.previewIndex = baseIndex >= 0 ? baseIndex : null;
      render();
    });
    el.timeline.appendChild(step);
  });

  renderTimelineDetail(selection, forecast, events);
  el.previewFinal.disabled = game.phase !== "planning" || !forecast || Boolean(selection);
  el.previewFinal.classList.toggle("active", Boolean(forecast && !selection && game.previewIndex === null));

  const actorsWithOrders = new Set(
    game.queue
      .filter(action => action.mode !== "legacy")
      .map(action => action.actorId)
  );
  const idle = living("player").filter(unit => !actorsWithOrders.has(unit.id));
  el.idleUnits.innerHTML = idle.length
    ? `<span>待機：</span>${idle.map(unit => `<span class="idle-chip">${unit.icon} ${unit.name}｜行動なし</span>`).join("")}`
    : `<span>生存中の味方全員に命令あり</span>`;
}

function renderTimelineDetail(selection, forecast, events) {
  if (selection) {
    el.timelineDetail.hidden = false;
    el.timelineDetail.innerHTML = `
      <div class="timeline-detail-title"><span>この命令の直前</span><b>ORDER ${String(selection.eventIndex + 1).padStart(2, "0")} / ${SPEED_LABEL[selection.action.speed]}</b></div>
      <p>この時点の位置・HP・状態から対象を選択します。対象確定後に後続イベントを再予測します。</p>
    `;
    return;
  }

  const detailIndex = game.phase === "resolving" ? game.timelineCursor : game.previewIndex;
  const outcome = Number.isInteger(detailIndex) ? forecast?.snapshots[detailIndex]?.outcome : null;
  if (!outcome) {
    el.timelineDetail.hidden = true;
    el.timelineDetail.innerHTML = "";
    return;
  }
  const view = timelineEventView(events[detailIndex]);
  el.timelineDetail.hidden = false;
  el.timelineDetail.innerHTML = `
    <div class="timeline-detail-title"><span>${view.name}｜${view.action}</span><b>行動直後</b></div>
    <div class="timeline-detail-groups">
      ${outcome.groups.map(group => `
        <section data-change-type="${group.type}">
          <strong>${group.summary}</strong>
          ${group.details.map(detail => `<span>${detail}</span>`).join("")}
        </section>
      `).join("")}
    </div>
  `;
}

function timelineEventView(event) {
  if (event.kind === "enemy") {
    const enemyIntent = event.payload;
    const actor = getUnit(enemyIntent.actorId);
    return {
      icon: actor?.icon || "?",
      name: actor?.name || "敵",
      action: enemyIntent.name,
      canAct: Boolean(actor && actor.hp > 0)
    };
  }

  const action = event.payload;
  const def = cardDefs[action.cardId];
  if (action.mode === "legacy") {
    const owner = getUnit(def.ownerId);
    return {
      icon: owner?.icon || ownerMeta[def.ownerId].name.slice(0, 1),
      name: `${ownerMeta[def.ownerId].name}の遺志`,
      action: getLegacy(def.ownerId).name.replace("遺志：", ""),
      canAct: true
    };
  }

  const actor = getUnit(action.actorId);
  const fallbackOwner = getUnit(def.ownerId);
  return {
    icon: actor?.icon || fallbackOwner?.icon || "?",
    name: action.provisional ? "この命令" : actor?.name || "味方",
    action: action.mode === "move" ? (actor ? `${actor.name}：移動` : "移動（味方選択）") : def.name,
    canAct: action.provisional || Boolean(actor && actor.hp > 0)
  };
}

function renderLog() {
  el.log.innerHTML = game.log.map(entry => `
    <div class="log-entry${entry.important ? " important" : ""}">
      <span>T${String(entry.turn).padStart(2, "0")}</span><div>${entry.message}</div>
    </div>
  `).join("");
}

function renderControls() {
  el.turn.textContent = String(game.turn).padStart(2, "0");
  const card = selectedCard();
  const def = selectedDef();
  const selectionActive = game.phase === "planning" && Boolean(card && def);
  el.modeBar.hidden = !selectionActive;
  el.cancel.hidden = !selectionActive;
  el.modeHelp.textContent = "";
  el.techniqueMode.classList.toggle("active", game.mode === "technique");
  el.moveMode.classList.toggle("active", game.mode === "move");
  el.undo.disabled = game.phase !== "planning" || !game.queue.length;
  el.execute.disabled = game.phase !== "planning" || !game.queue.length;

  if (!selectionActive) {
    el.instruction.textContent = game.phase === "resolving"
      ? "命令と敵の行動を解決しています…"
      : game.queue.length
        ? (Number.isInteger(game.previewIndex)
          ? `行動順 ${String(game.previewIndex + 1).padStart(2, "0")} の直後を予測表示中。`
          : "全行動後の結果を予測表示中。カードを選ぶと命令を追加できます。")
        : "カードを選び、対象を指定してください。";
    return;
  }

  const owner = getUnit(def.ownerId);
  const legacy = !owner || owner.hp <= 0;
  if (game.mode === "move") {
    el.modeHelp.textContent = game.moveUnitId ? "隣接する空きマスを選択" : "動かす味方を選択";
    el.instruction.textContent = game.moveUnitId
      ? `この命令の直前：${getUnit(game.moveUnitId).name}の移動先を選んでください。`
      : "この命令の直前：移動させる味方を選んでください。";
  } else {
    const shown = legacy ? getLegacy(def.ownerId) : def;
    const selectionContext = selectionTimelineContext();
    const legalTargets = validCells(selectionContext);
    if (!legalTargets.length && selectionContext) {
      const selectionOwner = simGetUnit(selectionContext.state, def.ownerId);
      if (!legacy && owner.hp > 0 && (!selectionOwner || selectionOwner.hp <= 0)) {
        const causeEvent = firstPriorDefeatEvent(selectionContext, def.ownerId, owner.hp);
        const causeText = causeEvent
          ? `先行する${SPEED_LABEL[causeEvent.speed]}「${timelineEventView(causeEvent).action}」で戦闘不能になります。`
          : "この命令の直前に戦闘不能です。";
        el.modeHelp.textContent = `実行不能：${owner.name}は${causeText}前の命令で守る／移動するか、別カード、「移動命令に変換」、または選択解除で組み直せます。`;
        el.instruction.textContent = "命令者が先に戦闘不能になります。行動順か命令を組み直してください。";
        return;
      }
      const reason = unavailableTechniqueTargetReason(selectionContext, shown, selectionOwner, legacy);
      el.modeHelp.textContent = `${reason} 前の命令を変えるか、別カードを選ぶか、「移動命令に変換」または選択解除を選べます。`;
      el.instruction.textContent = "固有技の対象がありません。移動へ切り替えるか、選択解除してください。";
      return;
    }
    const sparkDetails = !legacy && card.cardId === "arc_spark" ? arcSparkSelectionBreakdowns() : [];
    el.modeHelp.textContent = legacy
      ? "持ち主が倒れたため、遺志として使用"
      : `${SPEED_LABEL[shown.speed]}で解決${sparkDetails.length ? `｜${sparkDetails.join(" ｜ ")}` : ""}`;
    el.instruction.textContent = `この命令の直前：${shown.name}の対象を選んでください。`;
  }
}

function showModal(title, body, buttonText, action = "close") {
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = body;
  el.modalButton.textContent = buttonText;
  el.modal.dataset.action = action;
  el.modal.hidden = false;
}

function showHelp() {
  showModal("命令の組み方", `
    <div class="brief-step"><b>1</b><span>カードをクリックし、光っている対象マスを選びます。</span></div>
    <div class="brief-step"><b>2</b><span>FAST → NORMAL → SLOWの順に解決。同速度では味方が先です。</span></div>
    <div class="brief-step"><b>3</b><span>カードを移動命令へ変える場合は、味方と移動先を順に選びます。</span></div>
    <p>駒の下部には、上段へ装甲・結界・移動不能、下段へ標的・露出・帯電を固定位置で表示します。</p>
    <p>駒にポインターを重ねるか、キーボードでマスを選ぶと、盤面の下に有効な状態の詳しい説明が出ます。</p>
  `, "戦場へ戻る", "close");
}

el.techniqueMode.addEventListener("click", () => setMode("technique"));
el.moveMode.addEventListener("click", () => setMode("move"));
el.cancel.addEventListener("click", () => { clearSelection(); render(); });
el.undo.addEventListener("click", undoLast);
el.execute.addEventListener("click", executeTurn);
el.previewFinal.addEventListener("click", () => {
  if (game.phase !== "planning" || !game.queue.length) return;
  game.previewIndex = null;
  clearSelection();
  render();
});
el.help.addEventListener("click", showHelp);
el.modalButton.addEventListener("click", () => {
  const action = el.modal.dataset.action;
  if (action === "restart") resetGame();
  el.modal.hidden = true;
  el.modal.dataset.action = "close";
});

document.addEventListener("click", event => {
  const target = event.target;
  if (target?.closest?.(".unit-statuses") || target?.closest?.("#board-status-popover")) return;
  if (pinnedStatusPopover) closeStatusPopover(true);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && pinnedStatusPopover) closeStatusPopover(true);
});

// Display-only, detached summaries for opt-in playtest notes. Never retain combat references.
function capturePlaytestScene() {
  const card = game.hand.find(item => item.instanceId === game.selectedInstanceId);
  const def = card && cardDefs[card.cardId];
  const selectionContext = game.phase === "planning" ? selectionTimelineContext() : null;
  let preview = { kind: "current", eventIndex: null, eventKey: null, label: "現在盤面" };
  if (game.phase === "resolving") {
    const index = game.timelineCursor;
    preview = { kind: "resolving", eventIndex: index >= 0 ? index : null,
      eventKey: game.activeForecast?.events[index]?.key || null, label: "作戦解決中" };
  } else if (selectionContext) {
    preview = { kind: "selection-before", eventIndex: selectionContext.eventIndex,
      eventKey: selectionContext.events[selectionContext.eventIndex]?.key || null, label: "選択した命令の直前" };
  } else if (game.phase === "planning" && game.queue.length) {
    const index = game.previewIndex;
    preview = Number.isInteger(index)
      ? { kind: "event-after", eventIndex: index, eventKey: buildResolutionEvents()[index]?.key || null,
          label: `行動順 ${index + 1} の直後` }
      : { kind: "final", eventIndex: null, eventKey: null, label: "全行動後の最終予測" };
  }
  return {
    capturedAt: new Date().toISOString(), gameVersion: GAME_VERSION, turn: game.turn, phase: game.phase,
    selection: def ? { cardId: card.cardId, cardName: getUnit(def.ownerId)?.hp <= 0 ? getLegacy(def.ownerId).name : def.name,
      mode: game.mode, moveUnitId: game.moveUnitId } : null,
    orders: game.queue.slice(0, 3).map((action, index) => ({
      index: index + 1, cardId: action.cardId, actor: getUnit(action.actorId)?.name || action.actorId,
      action: action.label, mode: action.mode, speed: SPEED_LABEL[action.speed],
      target: timelineTargetLabel({ kind: "player", payload: action })
    })),
    preview
  };
}

resetGame();
