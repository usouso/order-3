const SIZE = 6;
const GAME_VERSION = "ACT 27";
// Play-log schema v1 still requires a speed on queue, intent and event records. All actions share this one value; nothing reads it.
const UNIFORM_SPEED = "normal";
// Enemy order number by action id, fixed at turn start. It keeps the enemies' relative order from the former speed rule.
const ENEMY_SLOT = { stalk: 1, cover: 2, inscribe: 3, pounce: 1, shield_drive: 2, detonate: 3, brace: 1, drain: 2, recover: 3 };
const ENEMY_CYCLE = { pursuer: ["stalk", "pounce", "recover"], bastion: ["cover", "shield_drive", "brace"], cantor: ["inscribe", "detonate", "drain"] };
const SLOT_MARK = ["①", "②", "③"];
const WALLS = [{ x: 2, y: 2 }, { x: 3, y: 3 }];

// Display-only contracts. Combat resolution never reads this catalogue.
const effectRules = {
  distance: { name: "距離と移動", text: "射程は上下左右のマス数。接近は壁・生存駒を通らず、隣接する空き位置へ右→左→下→上の順で探します。足止めや経路なしなら動きません。罠で止まっても、生存して隣接なら攻撃できます。" },
  targets: { name: "敵予告の対象", text: "敵の対味方行動はターン開始時の最寄りの生存味方を固定。同距離ならHPが低い方、さらに同じならルーク→ヴェイル→イオナ。予告後は選び直さず、災印も予告座標に固定します。敵の番号①②③はターン開始時に決まり、計画中も解決中も変わりません。" },
  orders: { name: "順番と命令", text: "命令は 味方①→敵①→味方②→敵②→味方③→敵③ の順に解決。味方の番号は登録順、敵の番号は計画前に確定して上段に表示。命令のない枠は飛ばす。1～3命令で実行。対象は命令直前の予測で選び、実行時に戦闘不能・射程外・占有なら不発。全敵または全味方の戦闘不能で残りは取消。" },
  damage: { name: "ダメージ", text: "目印がある敵への次の味方由来ダメージに+3して目印を消費。装甲で全吸収しても消費します。その後装甲が吸収し、残りだけHPが減ります。" },
  guard: { name: "装甲", text: "装甲は加算でき、HPより先にダメージを吸収。残りはターン末に消えます。柄打ちは指定した敵の装甲を0にしてから攻撃します。" },
  rooted: { name: "足止め", text: "このターンの接近移動を止めます。攻撃は取り消さず、既に隣接していれば攻撃を受けます。ターン末に消えます。" },
  marked: { name: "目印", text: "このターン、次にその敵が受ける味方由来ダメージ+3。一回で消費、装甲で全吸収しても消費。重ねても増えず、未使用ならターン末に消えます。連鎖火花の各被害者で独立に判定します。" },
  terrain: { name: "罠と災印", text: "火種の罠は敵進入時に一回だけ3ダメージと移動停止。未発動でもターン末に消えます。災印は予告した十字マスへ置き、次ターンの起爆時にそこにいる生存味方へ各4ダメージ。起爆後も詠唱師の戦闘不能による取消時も消えます。同じマスに重ねません。" },
  legacy: { name: "遺志とALT", text: "持ち主が戦闘不能の手札は共通の遺志として、生存味方一人へ距離無制限で装甲+2。登録後に持ち主が倒れた固有技は変換せず不発。どのカードも代わりにALT移動へ変換できます。" },
  turn: { name: "ターン末", text: "HPと位置は残ります。装甲・足止め・目印・未発動の火種の罠はターン末に消え、災印は次ターンの起爆まで残ります。余った手札と使用カードは捨て札へ。山札が空なら混ぜて5枚まで引きます。最終予測はこの解除とドロー前。" },
};

const effectCatalog = {
  stalk: { name: "忍び寄る", group: "enemy", short: "最寄りの味方へ最大2歩接近し、隣接なら2ダメージ。", detail: ["対象はターン開始時に固定。壁と駒を避け、移動できなくても隣接なら攻撃。"], rules: ["targets", "distance", "damage", "rooted"] },
  pounce: { name: "飛びかかり", group: "enemy", short: "最寄りの味方へ最大3歩接近し、隣接なら4ダメージ。", detail: ["対象はターン開始時に固定。届かなければ攻撃なし。"], rules: ["targets", "distance", "damage", "rooted"] },
  recover: { name: "息を整える", group: "enemy", short: "最寄りの味方へ最大1歩接近し、隣接なら2ダメージ。", detail: ["移動後も隣接なら攻撃。HP回復はしません。"], rules: ["targets", "distance", "damage", "rooted"] },
  cover: { name: "装甲支援", group: "enemy", short: "詠唱師が生存なら詠唱師、そうでなければ自身に装甲+4。", detail: ["距離制限なし。ダメージの移し替えはありません。"], rules: ["guard", "orders"] },
  shield_drive: { name: "盾の圧力", group: "enemy", short: "最寄りの味方へ最大1歩接近し、隣接なら3ダメージ。", detail: ["対象はターン開始時に固定。追加の状態効果なし。"], rules: ["targets", "distance", "damage", "rooted"] },
  brace: { name: "構え", group: "enemy", short: "自身に装甲+6。残りはターン末に消える。", detail: ["他の装甲と加算します。"], rules: ["guard", "turn"] },
  inscribe: { name: "災印を刻む", group: "enemy", short: "最寄りの味方の十字マスに災印。次ターンに各4ダメージ。", detail: ["予告された中心と上下左右の壁・盤外以外の座標へ設置。設置時はダメージなし。"], rules: ["targets", "terrain", "orders"] },
  detonate: { name: "災印起爆", group: "enemy", short: "災印上の生存味方に各4ダメージを与え、災印を消す。", detail: ["敵には当たりません。詠唱師が戦闘不能で取消でも、この行動順に災印を消します。"], rules: ["terrain", "damage", "orders"] },
  drain: { name: "生命吸収", group: "enemy", short: "最寄りの味方に2ダメージ、自身を最大2回復。", detail: ["対象はターン開始時に固定。対象が戦闘不能なら不発。詠唱師自身のHP上限を超えて回復しません。"], rules: ["targets", "damage", "orders"] },
  forward_cut: { name: "踏み込み斬り", group: "card", short: "敵・射程2。距離2なら1歩接近、隣接なら3ダメージ。", detail: ["隣接して始めれば移動なし。接近後も隣接できなければ攻撃は不発。"], rules: ["distance", "damage", "orders", "legacy"] },
  interpose: { name: "割って入る", group: "card", short: "他の味方・射程2。最大2歩接近し、経路なしでも両者に装甲+2。", detail: ["実行時に射程を再判定せず、対象への空き経路を進みます。登録前の対象別仮予測で経路を確認できます。"], rules: ["distance", "guard", "orders", "legacy"] },
  shield_lock: { name: "盾を固める", group: "card", short: "自身に装甲+5。", detail: ["装甲は加算し、ターン末に残りが消えます。"], rules: ["guard", "turn", "legacy"] },
  pommel_break: { name: "柄打ち", group: "card", short: "隣接する敵の装甲を0にして2ダメージ。", detail: ["解除するのは指定敵の装甲だけ。災印の起爆は妨げません。"], rules: ["guard", "damage", "orders", "legacy"] },
  quickshot: { name: "速射", group: "card", short: "敵・射程3。2ダメージ。", detail: ["実行時の位置で射程を再判定します。"], rules: ["distance", "damage", "orders", "legacy"] },
  pinning_arrow: { name: "縫い留め", group: "card", short: "敵・射程4。1ダメージ、生存していれば足止め。", detail: ["装甲に全吸収されても、生存していれば足止め。ターン末に消えます。"], rules: ["distance", "damage", "rooted", "legacy"] },
  backstep_shot: { name: "離脱射撃", group: "card", short: "敵・射程3。2ダメージ後、空き隣接マスへ1歩退く。", detail: ["対象から最も遠い空きマスを選び、同距離なら右→左→下→上。空きがなければ攻撃だけ。"], rules: ["distance", "damage", "orders", "legacy"] },
  hunters_mark: { name: "狩人の印", group: "card", short: "敵・射程4。目印を付け、次の味方ダメージ+3。", detail: ["一回で消費、装甲で全吸収されても消費。未使用ならターン末に消えます。"], rules: ["marked", "damage", "orders", "legacy"] },
  arc_spark: { name: "連鎖火花", group: "card", short: "敵・射程3。中心へ3、隣接する敵全員へ各2ダメージ。", detail: ["中心を倒しても隣接被害は発生。各敵の目印は独立に判定します。"], rules: ["distance", "damage", "marked", "legacy"] },
  phase_step: { name: "位相交換", group: "card", short: "他の味方・射程3。自分とその味方の位置を交換。", detail: ["二人が生存していれば実行時の射程を確認し、壁や駒を越えて交換します。"], rules: ["distance", "orders", "legacy"] },
  null_sigil: { name: "無効印", group: "card", short: "味方・射程3。装甲+3。", detail: ["自身も対象にできます。残った装甲はターン末に消えます。"], rules: ["guard", "distance", "legacy"] },
  ember_rune: { name: "火種の罠", group: "card", short: "空きマス・射程3。敵進入時に3ダメージと移動停止。", detail: ["一回発動すると消え、未発動でもターン末に消えます。同じマスへ重ね置きしません。"], rules: ["terrain", "distance", "damage", "legacy"] },
  legacy_rook: { name: "遺志：装甲", group: "legacy", short: "生存味方1人に装甲+2。距離無制限。", detail: ["持ち主が倒れたカードの共通効果です。"], rules: ["guard", "legacy"] },
  legacy_vale: { name: "遺志：装甲", group: "legacy", short: "生存味方1人に装甲+2。距離無制限。", detail: ["持ち主が倒れたカードの共通効果です。"], rules: ["guard", "legacy"] },
  legacy_iona: { name: "遺志：装甲", group: "legacy", short: "生存味方1人に装甲+2。距離無制限。", detail: ["持ち主が倒れたカードの共通効果です。"], rules: ["guard", "legacy"] },
  move: { name: "ALT：移動命令", group: "common", short: "生存味方1人を空き隣接マスへ1歩移動。", detail: ["カードの持ち主を問わず技の代わりに使えます。"], rules: ["distance", "orders", "legacy"] },
};

const cardDefs = {
  forward_cut: {
    ownerId: "rook", name: "踏み込み斬り",
    text: effectCatalog.forward_cut.short,
    target: "enemy", range: 2, categories: ["attack", "mobility"]
  },
  interpose: {
    ownerId: "rook", name: "割って入る",
    text: effectCatalog.interpose.short,
    target: "allyOther", range: 2, categories: ["defense", "mobility"]
  },
  shield_lock: {
    ownerId: "rook", name: "盾を固める",
    text: effectCatalog.shield_lock.short,
    target: "self", range: 0, categories: ["defense"]
  },
  pommel_break: {
    ownerId: "rook", name: "柄打ち",
    text: effectCatalog.pommel_break.short,
    target: "enemy", range: 1, categories: ["control", "attack"]
  },
  quickshot: {
    ownerId: "vale", name: "速射",
    text: effectCatalog.quickshot.short,
    target: "enemy", range: 3, categories: ["attack"]
  },
  pinning_arrow: {
    ownerId: "vale", name: "縫い留め",
    text: effectCatalog.pinning_arrow.short,
    target: "enemy", range: 4, categories: ["control", "attack"]
  },
  backstep_shot: {
    ownerId: "vale", name: "離脱射撃",
    text: effectCatalog.backstep_shot.short,
    target: "enemy", range: 3, categories: ["attack", "mobility"]
  },
  hunters_mark: {
    ownerId: "vale", name: "狩人の印",
    text: effectCatalog.hunters_mark.short,
    target: "enemy", range: 4, categories: ["control"], categoryDetail: "印"
  },
  arc_spark: {
    ownerId: "iona", name: "連鎖火花",
    text: effectCatalog.arc_spark.short,
    target: "enemy", range: 3, categories: ["attack"]
  },
  phase_step: {
    ownerId: "iona", name: "位相交換",
    text: effectCatalog.phase_step.short,
    target: "allyOther", range: 3, categories: ["mobility"]
  },
  null_sigil: {
    ownerId: "iona", name: "無効印",
    text: effectCatalog.null_sigil.short,
    target: "ally", range: 3, categories: ["defense"]
  },
  ember_rune: {
    ownerId: "iona", name: "火種の罠",
    text: effectCatalog.ember_rune.short,
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
    detail: unit => `装甲${unit.guard}。${effectRules.guard.text}`
  },
  rooted: {
    order: 2, label: "足止め", short: () => "止",
    active: unit => unit.rooted === true, shape: "linked-square", tone: "blue",
    detail: () => effectRules.rooted.text
  },
  marked: {
    order: 3, label: "目印", short: () => "印",
    active: unit => unit.marked === true, shape: "crosshair-circle", tone: "yellow",
    detail: () => effectRules.marked.text
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
  rng: null,
  timelineCursor: -1,
  previewIndex: null,
  activeForecast: null,
  lastResolvedState: null
};

// Play-log hooks see detached plain copies only. A recorder fault stops that run's log and never the battle.
const playlog = { recorder: null, stopped: false, suspended: false, error: "" };
try { playlog.recorder = globalThis.Order3Notes?.recorder || null; } catch { playlog.recorder = null; }

function recordPlaylog(hook, buildPayload, startsRun = false) {
  if (startsRun) { playlog.stopped = false; playlog.error = ""; }
  if (playlog.suspended || playlog.stopped || !playlog.recorder) return;
  try {
    playlog.recorder[hook](buildPayload());
  } catch (error) {
    playlog.stopped = true;
    try { playlog.error = String(error?.message || error); } catch { playlog.error = "recorder error"; }
  }
}

function playlogTurnStart() {
  return {
    turn: game.turn,
    start: {
      rngCalls: game.rng.calls,
      units: game.units.map(Order3Notes.unitRecord),
      hostileRunes: game.hostileRunes.map(Order3Notes.cellRecord),
      emberRunes: game.emberRunes.map(Order3Notes.cellRecord),
      hand: game.hand.map(card => ({ instanceId: card.instanceId, cardId: card.cardId })),
      deckCount: game.deck.length,
      discardCount: game.discard.length,
      deckOrder: game.deck.map(card => card.instanceId),
      discardOrder: game.discard.map(card => card.instanceId),
      intents: game.intents.map(item => ({ actorId: item.actorId, id: item.id, speed: item.speed, targetId: item.targetId ?? null, cells: (item.cells || []).map(Order3Notes.cellRecord) }))
    }
  };
}

function playlogTurnResult(forecast) {
  return {
    turn: game.turn,
    events: forecast.events.map((event, index) => ({ key: event.key, kind: event.kind, speed: event.speed,
      status: forecast.snapshots[index].outcome.status, reason: forecast.snapshots[index].outcome.reason || "" })),
    units: game.units.map(Order3Notes.unitRecord),
    hostileRunes: game.hostileRunes.map(Order3Notes.cellRecord),
    emberRunes: game.emberRunes.map(Order3Notes.cellRecord),
    battle: battleResult(),
    // Piles as endTurnCleanup leaves them (hand, then committed cards, onto the discard), also when the battle ends first.
    deckOrder: game.deck.map(card => card.instanceId),
    discardOrder: [...game.discard, ...game.hand, ...game.queue.map(action => action.instance)].map(card => card.instanceId)
  };
}

// Short-lived reading state, outside combat and opt-in note scenes.
const movementUI = { battleGeneration: 0, queueGeneration: 0, open: new Set(), returnTo: null };
let enemyTrace = null; // Display-only selection, bound to one event and one plan generation.
let queueReturnMessage = "";
let interposePreviewTargetId = null;
let interposePreviewMessage = "";

function movementPlanToken() {
  return `${movementUI.battleGeneration}:${game.turn}:${movementUI.queueGeneration}`;
}

function clearMovementReading(newPlan = false, newBattle = false) {
  if (newBattle) movementUI.battleGeneration += 1;
  if (newPlan) movementUI.queueGeneration += 1;
  movementUI.open.clear();
  movementUI.returnTo = null;
  enemyTrace = null;
  if (newPlan || newBattle) queueReturnMessage = "";
  interposePreviewTargetId = null;
  interposePreviewMessage = "";
}

const el = {
  guide: document.querySelector("#turn-guide"),
  guideStatus: document.querySelector("#turn-guide-status"),
  guideTitle: document.querySelector("#turn-guide-title"),
  guideCopy: document.querySelector("#turn-guide-copy"),
  guideLook: document.querySelector("#turn-guide-look"),
  guideBack: document.querySelector("#turn-guide-back"),
  guideNext: document.querySelector("#turn-guide-next"),
  guideClose: document.querySelector("#turn-guide-close"),
  board: document.querySelector("#battlefield"),
  interposePreview: document.querySelector("#interpose-preview"),
  interposePreviewList: document.querySelector("#interpose-preview-list"),
  interposePreviewStatus: document.querySelector("#interpose-preview-status"),
  enemyTrace: document.querySelector("#enemy-trace"),
  statusPopover: document.querySelector("#board-status-popover"),
  hand: document.querySelector("#hand"),
  actorStrip: document.querySelector("#actor-strip"),
  actorOptions: document.querySelector("#actor-options"),
  actorStatus: document.querySelector("#actor-status"),
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
  queueTitle: document.querySelector("#order-queue-title"),
  queueReturnStatus: document.querySelector("#queue-return-status"),
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
  modalAlt: document.querySelector("#modal-alt-button"),
  modalHelp: document.querySelector("#modal-help-button"),
  modalActions: document.querySelector("#modal-actions"),
  main: document.querySelector("main"),
  notesButton: document.querySelector("#notes-button"),
  notesDialog: document.querySelector("#notes-dialog"),
  help: document.querySelector("#help-button")
};

// Character-first navigation is display state; it never enters game, the queue, or the resolver.
let activeActorId = null;
let actorChoice = null; // null, technique, alt-pick, or alt-target
function clearActorView() { activeActorId = null; actorChoice = null; }

// Optional, short-lived reading state; no combat action observes it.
const turnGuide = { active: false, step: 0, announcedStep: null };
const turnGuideSteps = [
  { title: "目的と勝敗", target: "#battlefield-heading", copy: () => `敵を全員倒せば勝利、味方が全員倒れると敗北です。現在、敵${living("enemy").length}体・味方${living("player").length}人が生存。1ターンで勝つ必要はありません。盤面の駒と実HPを見てください。` },
  { title: "敵の予告", target: "#enemy-orders-title", copy: () => "敵の命令①②③は計画前に確定しています。味方①→敵①→味方②→敵②→味方③→敵③の順に解決します。行動予測の敵の枠を開くと、その敵の移動と対象を盤面で追えます。" },
  { title: "味方と手札", target: "#actor-picker-title", copy: () => "盤面か味方列で一人を選び、手札にある固有技を探せます。手札にない技は使えません。カード直接選択やALT移動もできます。" },
  { title: "命令と予測", target: "#order-queue-title", copy: () => `カードと対象を自分で選んで登録します。現在${game.queue.length}件／最大3件。1件から実行でき、同じ味方へ複数命令も可能です。行動予測を見て、1手戻して組み直せます。` },
  { title: "明示して実行", target: "#execute-guide-target", copy: () => game.queue.length
    ? `現在${game.queue.length}件の命令があります。「作戦実行」を自分で押すと計画を解決します。案内を終えても自動実行しません。`
    : "命令はまだ0件です。1件以上登録すると「作戦実行」を押せます。案内を終えても自動実行しません。" }
];

function renderTurnGuide() {
  el.guide.hidden = !turnGuide.active || game.phase !== "planning";
  if (el.guide.hidden) return;
  const step = turnGuideSteps[turnGuide.step];
  el.guideTitle.textContent = step.title;
  el.guideCopy.textContent = step.copy();
  el.guideLook.setAttribute("aria-controls", step.target.slice(1));
  el.guideLook.setAttribute("aria-label", `今見る場所：${step.title}`);
  el.guideBack.disabled = turnGuide.step === 0;
  el.guideNext.textContent = turnGuide.step === turnGuideSteps.length - 1 ? "案内を終える" : "次へ";
  if (turnGuide.announcedStep !== turnGuide.step) {
    el.guideStatus.textContent = `このターンの操作案内 ${turnGuide.step + 1}／${turnGuideSteps.length}：${step.title}`;
    turnGuide.announcedStep = turnGuide.step;
  }
}

function openTurnGuide() {
  if (game.phase !== "planning") return;
  clearInterposePreviewDisplay();
  turnGuide.active = true;
  turnGuide.step = 0;
  turnGuide.announcedStep = null;
  renderTurnGuide();
  el.guideTitle.focus({ preventScroll: true });
  el.guide.scrollIntoView({ block: "nearest" });
}

function closeTurnGuide(restoreFocus = true) {
  if (!turnGuide.active) return;
  turnGuide.active = false;
  turnGuide.announcedStep = null;
  el.guide.hidden = true;
  if (restoreFocus) el.help.focus({ preventScroll: true });
}

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
    guard: 0, rooted: false, marked: false
  };
}

function resetGame(seed = Order3Notes.chooseSeed(globalThis)) {
  // The seed is fixed before any shuffle; replay passes a logged seed.
  game.rng = Order3Notes.createRng(seed);
  recordPlaylog("battleStart", () => ({ seed: game.rng.seed, gameVersion: GAME_VERSION, width: globalThis.innerWidth || 0 }), true);
  closeTurnGuide(false);
  clearMovementReading(true, true);
  clearActorView();
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
  recordPlaylog("turnStart", playlogTurnStart);
}

function makeCardInstance(cardId) {
  game.instanceCounter += 1;
  return { cardId, instanceId: `card-${game.instanceCounter}` };
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(game.rng.next() * (i + 1));
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
  const roster = ["rook", "vale", "iona"];
  return [...candidates].sort((a, b) => distance(source, a) - distance(source, b)
    || a.hp - b.hp || roster.indexOf(a.id) - roster.indexOf(b.id))[0];
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
      intents.push(intent(pursuer, "stalk", "忍び寄る", target,
        effectCatalog.stalk.short));
    } else if (phase === 1) {
      const target = nearestUnit(pursuer, players);
      intents.push(intent(pursuer, "pounce", "飛びかかり", target,
        effectCatalog.pounce.short));
    } else {
      const target = nearestUnit(pursuer, players);
      intents.push(intent(pursuer, "recover", "息を整える", target,
        effectCatalog.recover.short));
    }
  }

  const bastion = getUnit("bastion");
  if (bastion.hp > 0) {
    const phase = (game.turn - 1) % 3;
    if (phase === 0) {
      const target = getUnit("cantor").hp > 0 ? getUnit("cantor") : bastion;
      intents.push(intent(bastion, "cover", "装甲支援", target,
        effectCatalog.cover.short));
    } else if (phase === 1) {
      const target = nearestUnit(bastion, players);
      intents.push(intent(bastion, "shield_drive", "盾の圧力", target,
        effectCatalog.shield_drive.short));
    } else {
      intents.push(intent(bastion, "brace", "構え", bastion,
        effectCatalog.brace.short));
    }
  }

  const cantor = getUnit("cantor");
  if (cantor.hp > 0 || ((game.turn - 1) % 3 === 1 && game.hostileRunes.length)) {
    const phase = (game.turn - 1) % 3;
    if (phase === 0) {
      const target = nearestUnit(cantor, players);
      const cells = [target, ...neighbors(target)].filter(cell => !isWall(cell.x, cell.y));
      const result = intent(cantor, "inscribe", "災印を刻む", target,
        effectCatalog.inscribe.short, cells, { targetKind: "cells" });
      intents.push(result);
    } else if (phase === 1) {
      intents.push(intent(cantor, "detonate", "災印起爆", null,
        effectCatalog.detonate.short, [...game.hostileRunes],
        { targetKind: "cells" }));
    } else {
      const target = nearestUnit(cantor, players);
      intents.push(intent(cantor, "drain", "生命吸収", target,
        effectCatalog.drain.short));
    }
  }
  // Enemy order ①②③; a defeated enemy leaves its number empty and later numbers do not move up.
  return intents.sort((a, b) => a.slot - b.slot);
}

function intent(actor, id, name, target, description, cells = [], options = {}) {
  return { actorId: actor.id, id, name, speed: UNIFORM_SPEED, slot: ENEMY_SLOT[id], targetId: target?.id || null, description, cells, ...options };
}

function allySlotLabel(number) { return `味方${SLOT_MARK[number - 1] || number}`; }
function enemySlotLabel(number) { return `敵${SLOT_MARK[number - 1] || number}`; }
function eventSlotLabel(event) { return event.kind === "enemy" ? enemySlotLabel(event.slot) : allySlotLabel(event.slot); }
function eventCauseLabel(event) { return `${eventSlotLabel(event)}・${timelineEventView(event).action}`; }

// The enemy that owns an order number this turn, also when it is defeated and its number is empty.
function enemySlotOwner(slot, turn = game.turn) {
  return Object.keys(ENEMY_CYCLE).find(actorId => ENEMY_SLOT[ENEMY_CYCLE[actorId][(turn - 1) % 3]] === slot) || null;
}

function selectCard(instanceId, fromActor = false, moveActorId = null) {
  if (game.phase !== "planning" || game.queue.length >= 3) return;
  clearMovementReading();
  if (!fromActor) clearActorView();
  game.selectedInstanceId = game.selectedInstanceId === instanceId && !moveActorId ? null : instanceId;
  game.mode = moveActorId ? "move" : "technique";
  game.moveUnitId = moveActorId;
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
  clearMovementReading();
  if (activeActorId) clearActorView();
  game.mode = mode;
  game.moveUnitId = null;
  render();
}

function getLegacy(ownerId) {
  return { name: "遺志：装甲", text: effectCatalog[`legacy_${ownerId}`].short, target: "ally", categories: ["defense"] };
}

function provisionalActionForSelection(providedSelection = null) {
  const selection = providedSelection || { card: selectedCard(), mode: game.mode, moveUnitId: game.moveUnitId };
  const card = selection.card;
  const def = card && cardDefs[card.cardId];
  if (!card || !def || game.phase !== "planning") return null;
  const liveOwner = getUnit(def.ownerId);
  const legacy = !liveOwner || liveOwner.hp <= 0;
  if (selection.mode === "move") {
    return {
      instance: card, cardId: card.cardId, mode: "move", actorId: selection.moveUnitId,
      target: null, speed: UNIFORM_SPEED, label: `${selection.moveUnitId ? getUnit(selection.moveUnitId)?.name : "味方"}：移動`,
      provisional: true
    };
  }
  if (legacy) {
    const legacyDef = getLegacy(def.ownerId);
    return {
      instance: card, cardId: card.cardId, mode: "legacy", actorId: def.ownerId,
      targetId: null, speed: UNIFORM_SPEED, label: legacyDef.name, provisional: true
    };
  }
  return {
    instance: card, cardId: card.cardId, mode: "technique", actorId: def.ownerId,
    targetId: null, target: null, speed: UNIFORM_SPEED, label: `${liveOwner.name}：${def.name}`,
    provisional: true
  };
}

function selectionTimelineContext(providedSelection = null) {
  const action = provisionalActionForSelection(providedSelection);
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

function validCells(providedContext = null, providedSelection = null) {
  const selection = providedSelection || { card: selectedCard(), mode: game.mode, moveUnitId: game.moveUnitId };
  const card = selection.card;
  const def = card && cardDefs[card.cardId];
  if (!card || !def || game.phase !== "planning") return [];

  const context = providedContext || selectionTimelineContext(selection);
  const state = context?.state;
  if (!state) return [];

  if (selection.mode === "move") {
    if (!selection.moveUnitId) return simLiving(state, "player").map(unit => ({ x: unit.x, y: unit.y }));
    const mover = simGetUnit(state, selection.moveUnitId);
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

function interposeCandidateContext() {
  const card = selectedCard();
  if (game.phase !== "planning" || game.queue.length >= 3 || game.mode !== "technique"
    || card?.cardId !== "interpose" || getUnit("rook")?.hp <= 0) return null;
  const selection = { card, mode: "technique", moveUnitId: null };
  const context = selectionTimelineContext(selection);
  return context ? { card, context, cells: validCells(context, selection) } : null;
}

function interposeCandidateForecasts() {
  const selection = interposeCandidateContext();
  if (!selection) return [];
  return selection.cells.slice(0, 2).map(cell => {
    const target = simUnitAt(selection.context.state, cell.x, cell.y);
    if (!target || target.side !== "player" || target.id === "rook") return null;
    const action = {
      instance: selection.card, cardId: "interpose", mode: "technique", actorId: "rook",
      targetId: target.id, target: { x: cell.x, y: cell.y }, speed: UNIFORM_SPEED,
      label: `${getUnit("rook").name}：${cardDefs.interpose.name}`
    };
    const forecast = predictTimeline(buildResolutionEvents([...game.queue, action]));
    const index = forecast.events.findIndex(event => event.kind === "player" && event.payload === action);
    if (index < 0) return null;
    const before = index ? forecast.snapshots[index - 1].state : forecast.initial;
    const after = forecast.snapshots[index].state;
    const outcome = forecast.snapshots[index].outcome;
    const actorBefore = simGetUnit(before, "rook");
    const targetBefore = simGetUnit(before, target.id);
    const actorAfter = simGetUnit(after, "rook");
    const targetAfter = simGetUnit(after, target.id);
    let entered = [];
    let movementReason = "";
    if (outcome.status === "cancelled") movementReason = `取消：${outcome.reason}`;
    else if (!actorBefore || !targetBefore || !actorAfter || !targetAfter) movementReason = "現在計画では経路を表示できません";
    else if (actorBefore.rooted) movementReason = "足止めのため移動0";
    else {
      const evidence = { excluded: [], pathResult: null };
      entered = simPathToAdjacent(before, actorBefore, targetBefore, evidence).slice(0, 2);
      if (!entered.length) movementReason = evidence.pathResult === "already_adjacent"
        ? "既に隣接しているため移動0" : "隣接経路なし・移動0";
      else if (!isOrthogonallyAdjacent(entered[entered.length - 1], targetBefore)) movementReason = "2歩では隣接未達";
      const stop = entered.at(-1) || actorBefore;
      if (actorAfter.x !== stop.x || actorAfter.y !== stop.y) {
        entered = [];
        movementReason = "現在計画では経路を表示できません";
      }
    }
    return {
      targetId: target.id, targetName: target.name, cell: { x: cell.x, y: cell.y },
      before: actorBefore && targetBefore ? { actor: { x: actorBefore.x, y: actorBefore.y }, target: { x: targetBefore.x, y: targetBefore.y } } : null,
      after: actorAfter && targetAfter ? { actor: { x: actorAfter.x, y: actorAfter.y }, target: { x: targetAfter.x, y: targetAfter.y } } : null,
      entered, movementReason, status: outcome.status, reason: outcome.reason,
      actorGuardGain: actorAfter && actorBefore ? actorAfter.guard - actorBefore.guard : 0,
      targetGuardGain: targetAfter && targetBefore ? targetAfter.guard - targetBefore.guard : 0
    };
  }).filter(Boolean);
}

function interposeCandidateText(candidate) {
  const point = cell => `(${cell.x + 1},${cell.y + 1})`;
  if (!candidate.before || !candidate.after) return `${candidate.targetName}：${candidate.movementReason}`;
  const start = `この命令の直前：ルーク${point(candidate.before.actor)}、${candidate.targetName}${point(candidate.before.target)}`;
  if (candidate.status === "cancelled") return `${start}。仮に登録した場合：${candidate.movementReason}。装甲なし。`;
  const path = [candidate.before.actor, ...candidate.entered].map(point).join("→");
  const guard = `ルーク装甲+${candidate.actorGuardGain}、${candidate.targetName}装甲+${candidate.targetGuardGain}`;
  return `${start}。仮に登録した場合：ルーク${path}、停止${point(candidate.after.actor)}、${candidate.entered.length}歩${candidate.movementReason ? `（${candidate.movementReason}）` : ""}。${guard}。`;
}

function interposePlanIdentity() {
  return `${movementPlanToken()}:${game.turn}:${game.queue.map(action => action.instance.instanceId).join("|")}`;
}

function clearInterposePreviewDisplay() {
  if (interposePreviewTargetId === null && !interposePreviewMessage) return;
  interposePreviewTargetId = null;
  interposePreviewMessage = "";
  renderBoard();
  renderInterposeCandidates();
}

function registerInterposeCandidate(candidate, cardId, planIdentity, button) {
  const current = interposeCandidateContext();
  const target = current && simGetUnit(current.context.state, candidate.targetId);
  const legal = current && current.card.instanceId === cardId && game.mode === "technique"
    && interposePlanIdentity() === planIdentity && button.isConnected
    && el.modal.hidden && !notesAreOpen() && target?.hp > 0
    && target.x === candidate.cell.x && target.y === candidate.cell.y
    && current.cells.some(cell => cell.x === target.x && cell.y === target.y);
  if (!legal) {
    interposePreviewMessage = "計画が変わりました。もう一度確認してください。";
    render();
    return false;
  }
  handleCellClick(target.x, target.y);
  return true;
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

function chooseActor(unitId, focusSource = "list") {
  const unit = getUnit(unitId);
  if (game.phase !== "planning" || !unit || unit.side !== "player" || unit.hp <= 0) return;
  if (enemyTrace) { enemyTrace = null; game.previewIndex = null; }
  if (selectedCard()) clearSelection();
  activeActorId = unitId;
  actorChoice = null;
  render();
  const focusTarget = focusSource === "board"
    ? el.board.querySelector(`[data-unit-id="${unitId}"]`)
    : el.actorStrip.querySelector(`[data-actor-id="${unitId}"]`);
  focusTarget?.focus({ preventScroll: true });
}

function actorTechniqueCandidate(card) {
  const selection = { card, mode: "technique", moveUnitId: null };
  const context = selectionTimelineContext(selection);
  const targets = validCells(context, selection);
  if (targets.length) return { targets, reason: "登録可能な対象あり" };
  const def = cardDefs[card.cardId];
  const owner = getUnit(def.ownerId);
  const before = context && simGetUnit(context.state, def.ownerId);
  if (owner?.hp > 0 && (!before || before.hp <= 0)) {
    const defeat = firstPriorDefeatEvent(context, def.ownerId, owner.hp);
    return { targets, reason: defeat
      ? `この命令の直前、先に解決する「${eventCauseLabel(defeat)}」で戦闘不能です。`
      : "この命令の直前に戦闘不能です。" };
  }
  return { targets, reason: context
    ? unavailableTechniqueTargetReason(context, def, before, false)
    : "この命令の直前は対象がありません。" };
}

function actorMoveCandidate(unitId) {
  if (!game.hand.length) return { targets: [], reason: "消費するカードが手札にありません。" };
  const selection = { card: game.hand[0], mode: "move", moveUnitId: unitId };
  const context = selectionTimelineContext(selection);
  const mover = context && simGetUnit(context.state, unitId);
  if (!mover || mover.hp <= 0) return { targets: [], reason: "この命令の直前に戦闘不能です。" };
  const targets = validCells(context, selection);
  return { targets, reason: targets.length ? "この命令の直前に隣接する空きマスあり" : "この命令の直前に隣接する空きマスがありません。" };
}

function renderActorPanel() {
  if (game.phase !== "planning") clearActorView();
  el.actorStrip.innerHTML = "";
  el.actorOptions.innerHTML = "";
  const full = game.queue.length >= 3;
  for (const ownerId of ["rook", "vale", "iona"]) {
    const unit = getUnit(ownerId);
    const count = game.hand.filter(card => cardDefs[card.cardId].ownerId === ownerId).length;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.actorId = ownerId;
    button.setAttribute("aria-pressed", String(activeActorId === ownerId));
    button.disabled = game.phase !== "planning" || unit.hp <= 0;
    button.innerHTML = `<strong>${unit.name}</strong><small>HP ${unit.hp}/${unit.maxHp} · 手札 ${count}枚</small>`;
    button.setAttribute("aria-label", `${unit.name}、${unit.role}、実HP ${unit.hp}/${unit.maxHp}、手札の固有カード ${count}枚、${activeActorId === ownerId ? "選択中" : "選択する"}、残り${3 - game.queue.length}命令`);
    button.addEventListener("click", () => chooseActor(ownerId));
    el.actorStrip.appendChild(button);
  }
  const actor = activeActorId && getUnit(activeActorId);
  if (!actor || actor.hp <= 0 || game.phase !== "planning") {
    if (el.actorStatus.textContent !== "味方か手札を選んでください。") el.actorStatus.textContent = "味方か手札を選んでください。";
    return;
  }
  const owned = game.hand.filter(card => cardDefs[card.cardId].ownerId === actor.id);
  const status = `${actor.name}を選択中 · 残り${3 - game.queue.length}命令${full ? "。1手戻すか作戦実行してください。" : ""}`;
  if (el.actorStatus.textContent !== status) el.actorStatus.textContent = status;
  if (!owned.length && actorChoice !== "alt-pick") {
    const empty = document.createElement("p");
    empty.className = "actor-note";
    empty.textContent = "このキャラの固有技は手札にありません。ALTなら別のカードを消費できます。";
    el.actorOptions.appendChild(empty);
  }
  if (actorChoice !== "alt-pick") for (const card of owned) {
    const def = cardDefs[card.cardId];
    const result = full ? { targets: [], reason: "残り命令枠がありません。" } : actorTechniqueCandidate(card);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.actorCard = card.instanceId;
    button.setAttribute("aria-pressed", String(game.selectedInstanceId === card.instanceId && game.mode === "technique"));
    button.className = result.targets.length ? "" : "no-target";
    button.disabled = full;
    button.innerHTML = `<strong>${def.name}</strong><small>${def.target === "self" ? "自身" : def.target === "enemy" ? "敵" : def.target === "empty" ? "空きマス" : "味方"}が対象</small>`;
    const reason = document.createElement("small");
    reason.textContent = result.targets.length ? `対象 ${result.targets.length}件` : result.reason;
    button.appendChild(reason);
    button.setAttribute("aria-label", `${actor.name}の${def.name}、${cardCategorySummary(def)}。${result.reason}。残り${3 - game.queue.length}命令`);
    button.addEventListener("click", () => {
      actorChoice = "technique";
      selectCard(card.instanceId, true);
      if (!selectedCard()) { actorChoice = null; render(); }
      el.instruction.focus({ preventScroll: false });
    });
    el.actorOptions.appendChild(button);
  }
  if (actorChoice === "alt-pick") {
    const note = document.createElement("p");
    note.className = "actor-note";
    note.textContent = "消費するカードを選択。このカードの固有技／遺志は使わず、移動に変換します。";
    el.actorOptions.appendChild(note);
    for (const card of game.hand) {
      const def = cardDefs[card.cardId];
      const owner = getUnit(def.ownerId);
      const shown = owner.hp > 0 ? def : getLegacy(def.ownerId);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.altCard = card.instanceId;
      button.textContent = `${owner.name}の${shown.name}を消費 → ${actor.name}を1マス移動`;
      button.addEventListener("click", () => {
        actorChoice = "alt-target";
        selectCard(card.instanceId, true, actor.id);
        el.instruction.focus({ preventScroll: false });
      });
      el.actorOptions.appendChild(button);
    }
  } else {
    const move = full ? { targets: [], reason: "残り命令枠がありません。" } : actorMoveCandidate(actor.id);
    const button = document.createElement("button");
    button.type = "button";
    button.id = "actor-alt";
    button.disabled = full || !move.targets.length;
    button.innerHTML = `<strong>1マス移動（ALT）</strong><small>${move.targets.length ? "使うカードを次に選択" : move.reason}</small>`;
    button.setAttribute("aria-label", `${actor.name}を1マス移動、${move.reason}、残り${3 - game.queue.length}命令`);
    button.addEventListener("click", () => {
      actorChoice = "alt-pick";
      render();
      el.actorStatus.focus({ preventScroll: false });
    });
    el.actorOptions.appendChild(button);
  }
}

function handleCellClick(x, y) {
  const card = selectedCard();
  const def = selectedDef();
  if (game.phase !== "planning") return;
  const clickedUnit = previewDisplayUnitAt(timelineDisplayContext().state, x, y);
  if (!card || !def) {
    if (clickedUnit?.side === "player") chooseActor(clickedUnit.id, "board");
    return;
  }
  const valid = new Set(validCells().map(keyOf));
  if (!valid.has(`${x},${y}`)) {
    if (clickedUnit?.side === "player") chooseActor(clickedUnit.id, "board");
    return;
  }

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
      target: { x, y }, speed: UNIFORM_SPEED, label: `${getUnit(game.moveUnitId).name}：移動`
    };
  } else if (!owner || owner.hp <= 0) {
    const target = simUnitAt(selectionState, x, y);
    const legacy = getLegacy(def.ownerId);
    action = {
      instance: card, cardId: card.cardId, mode: "legacy", actorId: def.ownerId,
      targetId: target?.id, speed: UNIFORM_SPEED, label: legacy.name
    };
  } else {
    const targetUnit = simUnitAt(selectionState, x, y);
    action = {
      instance: card, cardId: card.cardId, mode: "technique", actorId: def.ownerId,
      targetId: targetUnit?.id || null, target: { x, y }, speed: UNIFORM_SPEED,
      label: `${owner.name}：${def.name}`
    };
  }

  game.hand = game.hand.filter(item => item.instanceId !== card.instanceId);
  game.queue.push(action);
  clearMovementReading(true);
  game.previewIndex = null;
  clearSelection();
  actorChoice = null;
  render();
  if (activeActorId) el.actorStrip.querySelector(`[data-actor-id="${activeActorId}"]`)?.focus({ preventScroll: true });
}

function clearSelection() {
  clearMovementReading();
  game.selectedInstanceId = null;
  game.mode = "technique";
  game.moveUnitId = null;
  game.previewIndex = null;
}

function undoLast() {
  if (game.phase !== "planning" || !game.queue.length) return;
  clearMovementReading(true);
  const action = game.queue.pop();
  game.hand.push(action.instance);
  game.previewIndex = null;
  clearSelection();
  actorChoice = null;
  render();
  recordPlaylog("planEdit", () => "undo");
}

function queueReturnEligible() {
  return game.phase === "planning" && game.queue.length > 1
    && game.selectedInstanceId === null && !actorChoice;
}

function cancelledQueueOutcome(forecast, action) {
  const key = `player-${action.instance.instanceId}`;
  const eventIndex = forecast.events.findIndex(event => event.key === key && event.kind === "player" && event.payload === action);
  return eventIndex < 0 ? null : forecast.snapshots[eventIndex]?.outcome || null;
}

function returnCancelledQueueAction(instanceId, planToken, sourceButton = null) {
  const matches = game.queue.map((action, index) => ({ action, index }))
    .filter(item => item.action.instance?.instanceId === instanceId);
  const item = matches.length === 1 ? matches[0] : null;
  const validContext = queueReturnEligible() && el.modal.hidden && !notesAreOpen()
    && planToken === movementPlanToken() && (!sourceButton || sourceButton.isConnected)
    && item && item.index < game.queue.length - 1
    && !game.hand.some(card => card.instanceId === instanceId);
  const before = validContext ? predictTimeline() : null;
  const outcome = before && cancelledQueueOutcome(before, item.action);
  if (!outcome || outcome.status !== "cancelled") {
    queueReturnMessage = "計画が変わりました。もう一度確認してください。";
    render();
    if (el.modal.hidden && !notesAreOpen()) el.queueTitle.focus({ preventScroll: true });
    return false;
  }

  const later = game.queue.slice(item.index + 1).map(action => ({
    key: `player-${action.instance.instanceId}`,
    outcome: cancelledQueueOutcome(before, action)
  }));
  game.queue.splice(item.index, 1);
  game.hand.push(item.action.instance);
  clearMovementReading(true);
  game.previewIndex = null;
  const after = predictTimeline();
  const changed = later.some(entry => {
    const nextIndex = after.events.findIndex(event => event.key === entry.key && event.kind === "player");
    const next = nextIndex < 0 ? null : after.snapshots[nextIndex]?.outcome;
    return entry.outcome?.status !== next?.status || entry.outcome?.reason !== next?.reason
      || entry.outcome?.summary !== next?.summary;
  });
  const label = item.action.mode === "move" ? item.action.label : cardDefs[item.action.cardId]?.name || item.action.label;
  queueReturnMessage = `${allySlotLabel(item.index + 1)} ${label}を手札へ戻しました。後ろの命令は一つ前の番号に繰り上がり、残り${game.queue.length}件を再予測しました。${changed ? "後続命令の予測が変わりました。" : "後続命令の結果を確認してください。"}`;
  render();
  el.queueTitle.focus({ preventScroll: true });
  el.queueTitle.scrollIntoView({ block: "nearest" });
  recordPlaylog("planEdit", () => "return");
  return true;
}

// Fixed six-slot rhythm: ally ①, enemy ①, ally ②, enemy ②, ally ③, enemy ③. Empty slots create no event and are skipped.
function buildResolutionEvents(queue = game.queue, intents = game.intents) {
  return [
    ...queue.map((action, order) => ({
      kind: "player",
      speed: UNIFORM_SPEED,
      order,
      slot: order + 1,
      rank: order * 2,
      key: `player-${action.instance.instanceId}`,
      payload: action
    })),
    ...intents.map((enemyIntent, order) => {
      const slot = enemyIntent.slot ?? ENEMY_SLOT[enemyIntent.id] ?? order + 1;
      return {
        kind: "enemy",
        speed: UNIFORM_SPEED,
        order,
        slot,
        rank: (slot - 1) * 2 + 1,
        key: `enemy-${enemyIntent.actorId}-${enemyIntent.id}`,
        payload: enemyIntent
      };
    })
  ].sort((a, b) => a.rank - b.rank);
}

function cloneCombatState(source = game) {
  return {
    units: source.units.map(unit => ({ ...unit })),
    hostileRunes: source.hostileRunes.map(cell => ({ ...cell })),
    emberRunes: source.emberRunes.map(cell => ({ ...cell }))
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

function simPathToAdjacent(state, mover, target, evidence = null) {
  const startKey = keyOf(mover);
  const frontier = [{ x: mover.x, y: mover.y }];
  const cameFrom = new Map([[startKey, null]]);
  let end = null;

  while (frontier.length) {
    const current = frontier.shift();
    if (isOrthogonallyAdjacent(current, target)) {
      end = current;
      if (evidence) evidence.pathResult = keyOf(current) === startKey ? "already_adjacent" : "found";
      break;
    }
    for (const next of neighbors(current)) {
      const nextKey = keyOf(next);
      if (cameFrom.has(nextKey) || isWall(next.x, next.y)) continue;
      const occupant = simUnitAt(state, next.x, next.y);
      if (occupant && occupant.id !== mover.id) {
        if (evidence && keyOf(current) === startKey) evidence.excluded.push({ unitId: occupant.id, x: next.x, y: next.y });
        continue;
      }
      cameFrom.set(nextKey, current);
      frontier.push(next);
    }
  }

  if (!end) {
    if (evidence) evidence.pathResult = "no_path";
    return [];
  }
  const path = [];
  let current = end;
  while (current && keyOf(current) !== startKey) {
    path.unshift(current);
    current = cameFrom.get(keyOf(current));
  }
  return path;
}

function simDealDamage(state, targetId, amount, sourceId, options, outcome) {
  const target = simGetUnit(state, targetId);
  const source = simGetUnit(state, sourceId);
  if (!target || target.hp <= 0) return null;
  let finalAmount = amount;
  if (source?.side === "player" && target.side === "enemy" && target.marked) {
    finalAmount += 3;
    target.marked = false;
    outcome.logs.push(`${target.name}の目印を消費。ダメージ+3。`);
  }

  const absorbed = Math.min(target.guard, finalAmount);
  target.guard -= absorbed;
  const hpDamage = finalAmount - absorbed;
  target.hp = Math.max(0, target.hp - hpDamage);
  outcome.logs.push(`${target.name}に${hpDamage}ダメージ${absorbed ? `（装甲が${absorbed}吸収）` : ""}。`);
  if (target.hp <= 0) outcome.logs.push(`${target.name}が戦闘不能。`);
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

function simHeal(unit, amount, outcome) {
  if (!unit || unit.hp <= 0 || amount <= 0) return 0;
  const healed = Math.min(amount, unit.maxHp - unit.hp);
  if (healed <= 0) return 0;
  unit.hp += healed;
  outcome?.logs.push(`${unit.name}が${healed}回復。`);
  return healed;
}

function simMoveToward(state, mover, target, steps, outcome, evidence = null) {
  if (mover.rooted) {
    if (evidence) evidence.movementEnd = "rooted";
    outcome.logs.push(`${mover.name}は縫い留められ、移動できない。`);
    return;
  }
  const path = simPathToAdjacent(state, mover, target, evidence).slice(0, steps);
  if (evidence) {
    evidence.plannedLength = path.length;
    evidence.movementEnd = "complete";
  }
  for (const cell of path) {
    if (mover.hp <= 0) break;
    mover.x = cell.x;
    mover.y = cell.y;
    if (evidence) evidence.entered.push({ x: cell.x, y: cell.y });
    if (mover.side === "enemy" && simTriggerEmberRune(state, mover, outcome)) {
      if (evidence) {
        evidence.movementEnd = "trap";
        evidence.trap = { x: cell.x, y: cell.y, remaining: path.length - evidence.entered.length };
      }
      break;
    }
  }
}

// Optional, detached display facts. They never decide movement or damage.
function startMovementEvidence(outcome, event, actor, target, limit, at, collect) {
  if (!collect) return null;
  const evidence = {
    eventKey: event.key, actorId: actor.id, targetId: target.id,
    start: { actor: { x: actor.x, y: actor.y }, target: { x: target.x, y: target.y } },
    limit, excluded: [], plannedLength: null, entered: [], pathResult: null,
    movementEnd: "not_requested", trap: null,
    attack: { at, actorAlive: null, targetAlive: null, adjacent: null, performed: false }
  };
  outcome.movementEvidence = evidence;
  return evidence;
}

function movementAttackCondition(evidence, condition, value) {
  if (evidence) evidence.attack[condition] = value;
  return value;
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
    if (!target || target.hp <= 0 || target.side !== "player") return cancelOutcome(outcome, "遺志の対象が戦闘不能");
    target.guard += 2;
    outcome.logs.push(`遺志。${target.name}に装甲2。`);
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
      outcome.logs.push(`${actor.name}に装甲5。`);
      return outcome;
    }
    case "pommel_break": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      if (!isOrthogonallyAdjacent(actor, target)) return cancelOutcome(outcome, "対象が上下左右の隣接外");
      target.guard = 0;
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
      simDealDamage(state, target.id, 3, actor.id, {}, outcome);
      for (const other of chained) simDealDamage(state, other.id, 2, actor.id, {}, outcome);
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
      if (!target || target.hp <= 0 || target.side !== "player") return cancelOutcome(outcome, "装甲対象がいない");
      if (distance(actor, target) > 3) return cancelOutcome(outcome, "装甲対象が射程外");
      target.guard += 3;
      outcome.logs.push(`${target.name}に装甲3。`);
      return outcome;
    case "ember_rune":
      if (!action.target || !simIsEmpty(state, action.target.x, action.target.y)) return cancelOutcome(outcome, "罠の設置先が占有されている");
      if (distance(actor, action.target) > 3) return cancelOutcome(outcome, "罠の設置先が射程外");
      state.emberRunes = state.emberRunes.filter(cell => keyOf(cell) !== keyOf(action.target));
      state.emberRunes.push({ ...action.target });
      return outcome;
    default:
      return cancelOutcome(outcome, "未対応のカード効果");
  }
}

function resolveSimEnemy(state, event, outcome, collectMovement = false) {
  const enemyIntent = event.payload;
  const actor = simGetUnit(state, enemyIntent.actorId);
  if (!actor || actor.hp <= 0) {
    if (enemyIntent.id === "detonate") state.hostileRunes = [];
    return cancelOutcome(outcome, "行動者が戦闘不能");
  }

  const target = enemyIntent.targetId ? simGetUnit(state, enemyIntent.targetId) : null;
  switch (enemyIntent.id) {
    case "stalk": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      const evidence = startMovementEvidence(outcome, event, actor, target, 2, "after_move", collectMovement);
      simMoveToward(state, actor, target, 2, outcome, evidence);
      if (movementAttackCondition(evidence, "actorAlive", actor.hp > 0) && movementAttackCondition(evidence, "adjacent", isOrthogonallyAdjacent(actor, target))) {
        if (evidence) evidence.attack.performed = true;
        simDealDamage(state, target.id, 2, actor.id, { hostile: true, melee: true }, outcome);
      }
      return outcome;
    }
    case "pounce": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      const evidence = startMovementEvidence(outcome, event, actor, target, 3, "after_move", collectMovement);
      simMoveToward(state, actor, target, 3, outcome, evidence);
      if (movementAttackCondition(evidence, "actorAlive", actor.hp > 0) && movementAttackCondition(evidence, "adjacent", isOrthogonallyAdjacent(actor, target))) {
        if (evidence) evidence.attack.performed = true;
        simDealDamage(state, target.id, 4, actor.id, { hostile: true, melee: true }, outcome);
      }
      else outcome.logs.push("追跡獣の飛びかかりは届かなかった。");
      return outcome;
    }
    case "recover": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      const evidence = startMovementEvidence(outcome, event, actor, target, 1, "after_move", collectMovement);
      simMoveToward(state, actor, target, 1, outcome, evidence);
      if (movementAttackCondition(evidence, "actorAlive", actor.hp > 0) && movementAttackCondition(evidence, "adjacent", isOrthogonallyAdjacent(actor, target))) {
        if (evidence) evidence.attack.performed = true;
        simDealDamage(state, target.id, 2, actor.id, { hostile: true, melee: true }, outcome);
      }
      return outcome;
    }
    case "cover":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "装甲対象が戦闘不能");
      target.guard += 4;
      outcome.logs.push(`${target.name}に装甲4。`);
      return outcome;
    case "shield_drive": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      const evidence = startMovementEvidence(outcome, event, actor, target, 1, "after_move", collectMovement);
      simMoveToward(state, actor, target, 1, outcome, evidence);
      if (movementAttackCondition(evidence, "actorAlive", actor.hp > 0) && movementAttackCondition(evidence, "targetAlive", target.hp > 0) && movementAttackCondition(evidence, "adjacent", isOrthogonallyAdjacent(actor, target))) {
        if (evidence) evidence.attack.performed = true;
        simDealDamage(state, target.id, 3, actor.id, { hostile: true, melee: true }, outcome);
      }
      return outcome;
    }
    case "brace":
      actor.guard += 6;
      outcome.logs.push(`${actor.name}に装甲6。`);
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
      simHeal(actor, 2, outcome);
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
  const changes = after.units.map(unit => ({ unit, old: before.units.find(item => item.id === unit.id) }));
  const damaged = changes.filter(({ unit, old }) => unit.hp < old.hp);
  const healed = changes.filter(({ unit, old }) => unit.hp > old.hp);
  const moved = changes.filter(({ unit, old }) => unit.x !== old.x || unit.y !== old.y);
  const armored = changes.filter(({ unit, old }) => unit.guard !== old.guard);
  const add = (type, priority, summary, details) => groups.push({ type, priority, summary, details });
  if (outcome.status === "cancelled") add("cancel", 100, `取消：${outcome.reason}`, [`${event.kind === "enemy" ? "敵行動" : "味方命令"}を取消：${outcome.reason}`]);
  if (damaged.length) {
    const total = damaged.reduce((sum, { unit, old }) => sum + old.hp - unit.hp, 0);
    const ko = damaged.filter(({ unit, old }) => old.hp > 0 && unit.hp <= 0).length;
    add("damage", ko ? 90 : 80,
      damaged.length === 1 ? `${damaged[0].unit.name}に${total}ダメージ${ko ? "・撃破" : ""}` : `${damaged.length}人に計${total}ダメージ${ko ? `（${ko}人撃破）` : ""}`,
      damaged.map(({ unit, old }) => `${unit.name} HP ${old.hp}→${unit.hp}${unit.hp <= 0 ? "（撃破）" : ""}`));
  }
  if (healed.length) add("heal", 80, healed.length === 1 ? `${healed[0].unit.name}が${healed[0].unit.hp - healed[0].old.hp}回復` : `${healed.length}人が回復`, healed.map(({ unit, old }) => `${unit.name} HP ${old.hp}→${unit.hp}`));
  if (moved.length) add("move", 70, moved.length === 1 ? `${moved[0].unit.name} ${cellLabel(moved[0].old)}→${cellLabel(moved[0].unit)}` : `${moved.length}人が位置変更`, moved.map(({ unit, old }) => `${unit.name} ${cellLabel(old)}→${cellLabel(unit)}`));
  if (armored.length) add("guard", 60, armored.length === 1 ? `${armored[0].unit.name} 装甲${armored[0].old.guard}→${armored[0].unit.guard}` : `${armored.length}人の装甲変化`, armored.map(({ unit, old }) => `${unit.name} 装甲 ${old.guard}→${unit.guard}`));
  const statuses = [];
  for (const { unit, old } of changes) for (const [key, label] of [["rooted", "足止め"], ["marked", "目印"]]) {
    if (unit[key] !== old[key]) statuses.push(`${unit.name}：${label}${unit[key] ? "付与" : "解除"}`);
  }
  if (statuses.length) add("status", 60, statuses.join(" / "), statuses);
  if (outcome.logs.includes("火種の罠で残り移動停止")) add("move_stop", 85, "火種の罠で残り移動停止", ["罠を踏み、この移動の残り歩数を失った"]);
  for (const [label, previous, current] of [["火種の罠", before.emberRunes, after.emberRunes], ["災印", before.hostileRunes, after.hostileRunes]]) {
    const change = changedTerrain(previous, current);
    if (change.added.length) add("zone_add", 50, `${label}を${change.added.length === 1 ? cellLabel(change.added[0]) : `${change.added.length}マス`}に設置`, [`${label} ${change.added.map(cellLabel).join(" / ")} に設置`]);
    if (change.removed.length) add("zone_remove", 50, `${label}${change.removed.length}マス消滅`, [`${label} ${change.removed.map(cellLabel).join(" / ")} が消滅`]);
  }
  return groups.sort((a, b) => b.priority - a.priority);
}

function summarizeStructuredChanges(groups) {
  if (!groups.length) return "状態変化なし";
  const shown = groups.slice(0, 2).map(group => group.summary).join(" / ");
  return groups.length > 2 ? `${shown} / ＋他${groups.length - 2}種` : shown;
}

function predictTimeline(events = buildResolutionEvents(), eventLimit = events.length, collectMovement = true) {
  const state = cloneCombatState(game);
  const snapshots = [];
  for (let index = 0; index < Math.min(eventLimit, events.length); index += 1) {
    const event = events[index];
    const before = cloneCombatState(state);
    const outcome = { status: "resolved", reason: "", logs: [] };
    if (simBattleResult(state)) {
      if (event.kind === "enemy" && event.payload.id === "detonate") state.hostileRunes = [];
      cancelOutcome(outcome, "戦闘終了");
    }
    else if (event.kind === "player") resolveSimPlayer(state, event, { events, index }, outcome);
    else resolveSimEnemy(state, event, outcome, collectMovement);
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

function activeEnemyTrace() {
  if (!enemyTrace || enemyTrace.token !== movementPlanToken() || game.phase !== "planning" || selectedCard() || actorChoice) return null;
  const forecast = currentForecast() || predictTimeline(buildResolutionEvents());
  const index = forecast.events.findIndex(event => event.key === enemyTrace.key && event.kind === "enemy");
  if (index < 0 || game.previewIndex !== index || forecast.snapshots[index]?.eventKey !== enemyTrace.key) return null;
  return { forecast, index, event: forecast.events[index], before: index ? forecast.snapshots[index - 1].state : forecast.initial,
    after: forecast.snapshots[index].state, outcome: forecast.snapshots[index].outcome };
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
  const trace = activeEnemyTrace();
  const forecast = trace?.forecast || currentForecast();
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
    if (!actor || actor.hp <= 0) return [];
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
  closeTurnGuide(false);
  clearMovementReading(true);
  const forecast = predictTimeline();
  recordPlaylog("commit", () => ({ turn: game.turn, handOrder: game.hand.map(card => card.instanceId), queue: game.queue.map(Order3Notes.queueRecord) }));
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

  completeResolvedTurn(forecast);
}

// Post-resolution bookkeeping shared by live execution and log replay. The combat state already equals the forecast's last snapshot.
function completeResolvedTurn(forecast) {
  game.timelineCursor = forecast.events.length;
  game.lastResolvedState = cloneCombatState(game);
  renderTimeline();
  recordPlaylog("turnResolved", () => playlogTurnResult(forecast));

  if (battleResult()) {
    finishBattle(battleResult());
    return;
  }

  endTurnCleanup();
  game.turn += 1;
  clearMovementReading(true);
  game.timelineCursor = -1;
  game.previewIndex = null;
  game.activeForecast = null;
  game.intents = buildEnemyIntents();
  drawToFive();
  game.phase = "planning";
  addLog(`TURN ${String(game.turn).padStart(2, "0")}：新しい予告を確認。`, true);
  render();
  recordPlaylog("turnStart", playlogTurnStart);
}

// The same pure event resolver drives the timeline and any direct execution call.
function resolveStandaloneEvent(event) {
  const state = cloneCombatState(game);
  const outcome = { status: "resolved", reason: "", logs: [] };
  if (simBattleResult(state)) {
    if (event.kind === "enemy" && event.payload.id === "detonate") state.hostileRunes = [];
    cancelOutcome(outcome, "戦闘終了");
  } else if (event.kind === "player") resolveSimPlayer(state, event, { events: [event], index: 0 }, outcome);
  else resolveSimEnemy(state, event, outcome, true);
  applyCombatState(state);
  for (const message of outcome.logs) addLog(message, outcome.status === "cancelled");
  render();
  return outcome;
}

async function resolvePlayerAction(action) {
  return resolveStandaloneEvent({ kind: "player", key: `player-${action.instance.instanceId}`, speed: UNIFORM_SPEED, slot: 1, payload: action });
}

async function resolveEnemyIntent(enemyIntent) {
  return resolveStandaloneEvent({ kind: "enemy", key: `enemy-${enemyIntent.actorId}-${enemyIntent.id}`, speed: UNIFORM_SPEED, slot: enemyIntent.slot ?? ENEMY_SLOT[enemyIntent.id], payload: enemyIntent });
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
    unit.guard = 0;
    unit.rooted = false;
    unit.marked = false;
  }
  game.emberRunes = [];
}

function battleResult() {
  if (!living("enemy").length) return "victory";
  if (!living("player").length) return "defeat";
  return null;
}

function finishBattle(result) {
  clearMovementReading(true);
  game.phase = "ended";
  render();
  if (result === "victory") {
    showModal("演習完了。", `
      <p>敵部隊を制圧しました。今回は固定編成ですが、次の段階では戦闘後に仲間かカードを選び、部隊デッキを変化させます。</p>
      <p>何が強かったか、使いにくかったカードは何かを覚えておいてください。</p>
    `, "もう一度", "restart", "victory");
  } else {
    showModal("部隊壊滅。", `
      <p>敵の予告に対し、移動・防御・妨害のどこへ命令を使うかが鍵です。</p>
      <p>災印は設置の次ターンに起爆します。起爆マスから離れる、装甲で被害を抑える、起爆前に詠唱師を倒す方法を試してください。</p>
    `, "再戦する", "restart", "defeat");
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
  const interposeCandidates = interposeCandidateForecasts();
  renderBoard(interposeCandidates);
  renderInterposeCandidates(interposeCandidates);
  renderHand();
  renderActorPanel();
  renderIntents();
  renderSquad();
  renderQueue();
  renderTimeline();
  renderLog();
  renderControls();
  renderTurnGuide();
}

function renderInterposeCandidates(candidates = interposeCandidateForecasts()) {
  el.interposePreview.hidden = !candidates.length;
  el.interposePreviewList.innerHTML = "";
  if (el.interposePreviewStatus.textContent !== interposePreviewMessage) {
    el.interposePreviewStatus.textContent = interposePreviewMessage;
  }
  if (!candidates.some(candidate => candidate.targetId === interposePreviewTargetId)) interposePreviewTargetId = null;
  if (!candidates.length) return;
  const planIdentity = interposePlanIdentity();
  const cardId = selectedCard().instanceId;
  for (const candidate of candidates) {
    const row = document.createElement("div");
    row.className = "interpose-candidate";
    row.dataset.targetId = candidate.targetId;
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "interpose-candidate-preview";
    preview.setAttribute("aria-pressed", String(interposePreviewTargetId === candidate.targetId));
    preview.textContent = `対象：${candidate.targetName}｜${interposeCandidateText(candidate)}`;
    preview.setAttribute("aria-label", `仮予測を盤面で見る。${interposeCandidateText(candidate)}`);
    const showCandidate = () => {
      if (!preview.isConnected || interposePlanIdentity() !== planIdentity || selectedCard()?.instanceId !== cardId) return;
      interposePreviewTargetId = candidate.targetId;
      interposePreviewMessage = `${candidate.targetName}の仮予測。${candidate.movementReason || `${candidate.entered.length}歩、停止(${candidate.after.actor.x + 1},${candidate.after.actor.y + 1})`}`;
      renderBoard(candidates);
      for (const button of el.interposePreviewList.querySelectorAll(".interpose-candidate-preview")) {
        button.setAttribute("aria-pressed", String(button.closest("[data-target-id]")?.dataset.targetId === candidate.targetId));
      }
      if (el.interposePreviewStatus.textContent !== interposePreviewMessage) el.interposePreviewStatus.textContent = interposePreviewMessage;
    };
    preview.addEventListener("focus", showCandidate);
    preview.addEventListener("click", showCandidate);
    const register = document.createElement("button");
    register.type = "button";
    register.className = "interpose-candidate-register";
    register.textContent = `${candidate.targetName}を対象に登録`;
    register.setAttribute("aria-label", `割って入るを${candidate.targetName}へ登録`);
    register.addEventListener("click", () => registerInterposeCandidate(candidate, cardId, planIdentity, register));
    row.appendChild(preview);
    row.appendChild(register);
    el.interposePreviewList.appendChild(row);
  }
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

function auxiliaryStatusDetails(unit) {
  return [];
}

function statusAriaValue(key, unit, actual) {
  const meta = statusMeta[key];
  if (key === "guard") {
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
  const auxiliary = auxiliaryStatusDetails(unit);
  if (!statuses.length && !auxiliary.length) {
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
      ${auxiliary.map(text => `<section class="status-popover-item auxiliary-status"><p>${text}</p></section>`).join("")}
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

function enemyTraceFlow(id) {
  return ({ stalk: "接近 → 攻撃", pounce: "接近 → 攻撃", recover: "接近 → 攻撃",
    cover: "装甲+4", shield_drive: "接近 → 攻撃", brace: "装甲+6", inscribe: "災印設置",
    detonate: "災印起爆", drain: "攻撃 → 回復" })[id] || "行動";
}

function traceCellKeys(trace) {
  const evidence = trace.outcome.movementEvidence;
  const actor = simGetUnit(trace.before, trace.event.payload.actorId);
  const stop = simGetUnit(trace.after, trace.event.payload.actorId);
  const target = trace.event.payload.targetId && simGetUnit(trace.before, trace.event.payload.targetId);
  const announced = trace.event.payload.targetKind === "cells" ? trace.event.payload.cells || [] : [];
  const effect = trace.outcome.status === "cancelled" ? []
    : trace.event.payload.id === "inscribe" ? trace.event.payload.cells || []
    : trace.event.payload.id === "detonate" ? trace.before.hostileRunes : [];
  return { evidence, actor, stop, target, announced, effect,
    path: evidence?.eventKey === trace.event.key ? evidence.entered : [] };
}

function renderEnemyTrace(trace) {
  if (!trace) { el.enemyTrace.hidden = true; el.enemyTrace.innerHTML = ""; return; }
  const { actor, stop, target, announced, evidence, path } = traceCellKeys(trace);
  const event = trace.event, view = timelineEventView(event), outcome = trace.outcome;
  const point = cell => cell ? `(${cell.x + 1},${cell.y + 1})` : "なし";
  const targetText = event.payload.targetKind === "cells" ? `マス ${announced.map(point).join(" / ") || "なし"}`
    : target ? `${target.name}${point(target)}` : timelineTargetLabel(event);
  const stopReason = evidence?.trap ? `火種の罠で停止 ${point(evidence.trap)}`
    : evidence?.movementEnd === "rooted" ? "足止めで停止"
    : evidence?.pathResult === "no_path" ? "経路なしで移動なし"
    : evidence?.pathResult === "already_adjacent" ? "開始時から隣接、移動なし"
    : "";
  const actionResult = outcome.status === "cancelled" ? `取消：${outcome.reason}` : outcome.summary;
  const attackText = evidence ? (evidence.attack.performed ? "攻撃あり" : "攻撃なし") : "";
  const drainText = event.payload.id === "drain" ? "詠唱師自身を最大2回復。" : "";
  el.enemyTrace.hidden = false;
  el.enemyTrace.innerHTML = `<div class="enemy-trace-heading"><strong>予告トレース｜${eventSlotLabel(event)} ${escapeEffectText(view.name)}「${escapeEffectText(view.action)}」</strong><button type="button" id="enemy-trace-close" aria-label="敵の予告トレースを閉じる">閉じる ×</button></div>
    <p>${escapeEffectText(enemyTraceFlow(event.payload.id))}</p>
    <p>開始 ${point(actor)} → 停止 ${point(stop)}${path.length ? `（進入 ${path.map(point).join(" → ")}）` : "（進入なし）"}。対象予告：${escapeEffectText(targetText)}。</p>
    <p>この計画の予測：${escapeEffectText(actionResult)}${stopReason ? `。${stopReason}` : ""}${attackText ? `。${attackText}` : ""}。${drainText}</p>
    <p class="enemy-trace-legend">破線＝開始、番号と線＝実際の進入、太枠＝停止、赤枠＝予告対象、赤地＝設置・起爆マス。予告対象と予測結果は別です。</p>`;
  el.enemyTrace.querySelector("#enemy-trace-close").addEventListener("click", () => {
    const returnKey = enemyTrace?.key;
    enemyTrace = null;
    game.previewIndex = null;
    render();
    const returnControl = !el.previewFinal.disabled ? el.previewFinal
      : [...el.timeline.querySelectorAll("[data-event-key]")].find(step => step.dataset.eventKey === returnKey && !step.disabled)
        || el.timeline.querySelector("button:not(:disabled)");
    (returnControl || el.help).focus({ preventScroll: true });
  });
}

function drawEnemyTracePath(path, className = "enemy-trace-path", markerId = "trace-arrow") {
  if (!path.length) return;
  const cells = el.board.querySelectorAll(".cell");
  const center = cell => { const node = cells[cell.y * SIZE + cell.x]; return [node.offsetLeft + node.offsetWidth / 2, node.offsetTop + node.offsetHeight / 2]; };
  const points = path.map(center).map(([x, y]) => `${x},${y}`).join(" ");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", `0 0 ${el.board.clientWidth} ${el.board.clientHeight}`);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<defs><marker id="${markerId}" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor"/></marker></defs><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${markerId})"/>`;
  el.board.appendChild(svg);
}

function renderBoard(interposeCandidates = []) {
  closeStatusPopover(true);
  const valid = new Set(validCells().map(keyOf));
  const context = timelineDisplayContext();
  const trace = activeEnemyTrace();
  const marks = trace ? traceCellKeys(trace) : null;
  const candidate = interposeCandidates.find(item => item.targetId === interposePreviewTargetId);
  const previewState = context.state;
  const isPreview = Boolean(selectedCard() || currentForecast() || trace);
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
      if (marks) {
        const here = item => item && item.x === x && item.y === y;
        if (here(marks.actor)) cell.classList.add("trace-start");
        if (here(marks.stop)) cell.classList.add("trace-stop");
        if (here(marks.target)) cell.classList.add("trace-target");
        if (marks.announced.some(here)) cell.classList.add("trace-target");
        if (marks.effect.some(here)) cell.classList.add("trace-effect");
        if (marks.evidence?.trap && here(marks.evidence.trap)) cell.classList.add("trace-trap");
        const ordinal = marks.path.findIndex(here);
        if (ordinal >= 0) {
          const badge = document.createElement("span"); badge.className = "trace-ordinal";
          badge.setAttribute("aria-hidden", "true"); badge.textContent = String(ordinal + 1); cell.appendChild(badge);
        }
      }
      if (candidate?.status === "resolved" && candidate.before && candidate.after) {
        const here = item => item && item.x === x && item.y === y;
        if (here(candidate.before.actor)) cell.classList.add("interpose-start");
        if (here(candidate.after.actor)) cell.classList.add("interpose-stop");
        const ordinal = candidate.entered.findIndex(here);
        if (ordinal >= 0) {
          cell.classList.add("interpose-entered");
          const badge = document.createElement("span");
          badge.className = "interpose-ordinal";
          badge.setAttribute("aria-hidden", "true");
          badge.textContent = String(ordinal + 1);
          cell.appendChild(badge);
        }
      }
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
        cell.dataset.unitId = unit.id;
        const selectableAlly = game.phase === "planning" && unit.side === "player" && actual?.hp > 0;
        if (selectableAlly && !valid.has(`${x},${y}`)) {
          cell.classList.add("selectable-ally");
          cell.setAttribute("aria-label", `${cell.getAttribute("aria-label")}。選ぶと${unit.name}の命令を表示。`);
        }
        if (selectableAlly && activeActorId === unit.id) {
          cell.classList.add("selected-actor");
          cell.setAttribute("aria-selected", "true");
        }
        const token = renderUnit(unit, projected, actual, statuses);
        cell.appendChild(token);
        const auxiliary = auxiliaryStatusDetails(unit);
        if (statuses.length || auxiliary.length) {
          const description = document.createElement("span");
          description.id = `status-desc-${unit.id}`;
          description.className = "sr-only status-description";
          description.textContent = [...statuses.map(([key]) => statusFullDescription(key, unit)), ...auxiliary].join(" ");
          cell.setAttribute("aria-describedby", description.id);
          cell.appendChild(description);
          cell.addEventListener("focus", () => showStatusPopover(unit));
          cell.addEventListener("blur", () => restorePinnedStatusPopover());
        }
      }
      if (valid.has(`${x},${y}`) && selectedCard()) {
        const prompt = game.mode === "move" ? (game.moveUnitId ? "移動先" : "動かす味方") : "技の対象";
        cell.setAttribute("aria-label", `${cell.getAttribute("aria-label")}。${prompt}として指定できます。`);
      }
      cell.addEventListener("click", () => handleCellClick(x, y));
      el.board.appendChild(cell);
    }
  }
  if (marks?.actor && marks.path.length) drawEnemyTracePath([marks.actor, ...marks.path]);
  if (candidate?.status === "resolved" && candidate.before && candidate.entered.length) {
    drawEnemyTracePath([candidate.before.actor, ...candidate.entered], "interpose-preview-path", "interpose-preview-arrow");
  }
  renderEnemyTrace(trace);
}

function previewDisplayUnitAt(state, x, y) {
  return state.units.find(unit => unit.hp > 0 && unit.x === x && unit.y === y);
}

function renderUnit(unit, projected = false, actual = unit, statuses = activeStatusEntries(unit)) {
  const token = document.createElement("div");
  const selected = game.moveUnitId === unit.id || activeActorId === unit.id ? " selected-unit" : "";
  const hit = game.flashUnitId === unit.id ? " hit" : "";
  const preview = projected ? " projected-unit" : "";
  token.className = `unit ${unit.side}${selected}${hit}${preview}`;
  token.setAttribute("aria-hidden", "true");
  const hpChanged = actual && actual.hp !== unit.hp;
  const hpText = hpChanged ? `${actual.hp}→${unit.hp}` : `${unit.hp}/${unit.maxHp}`;
  token.innerHTML = `
    <div class="unit-icon">${unit.icon}</div>
    <div class="unit-name">${unit.name}</div>
    <div class="hp-track"><div class="hp-fill" style="width:${(unit.hp / unit.maxHp) * 100}%"></div></div>
    <div class="unit-hp-number${hpChanged ? " changed" : ""}"><span>HP</span> ${hpText}</div>
  `;
  if (statuses.length || auxiliaryStatusDetails(unit).length) {
    const surface = document.createElement("div");
    surface.className = "unit-statuses";
    surface.dataset.unitId = unit.id;
    statuses.forEach(([key, meta]) => {
      const chip = document.createElement("span");
      chip.className = `status-chip ${key} shape-${meta.shape} tone-${meta.tone}${statusChanged(key, unit, actual) ? " changed" : ""}`;
      chip.dataset.status = key;
      if (key === "guard") {
        chip.innerHTML = `<span class="status-symbol">盾</span><b>${unit.guard}</b>`;
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
  const modeText = moveMode ? "ALT移動として選択中。" : selected ? "技法として選択中。" : "";
  return `${ownerName}、${shown.name}。${cardTargetLabel(shown)}。${cardFaceEffect(shown)}${modeText} 詳細はカード選択後と遊び方で確認できます。`;
}

function cardTargetLabel(shown) {
  const target = { enemy: "敵", ally: "生存味方", allyOther: "他の生存味方", self: "自身", empty: "空きマス" }[shown.target] || "対象";
  return `${target}・${shown.range === undefined ? "距離無制限" : `射程${shown.range}`}`;
}

function cardFaceEffect(shown) {
  return shown.text.replace(/^(敵|味方|他の味方|空きマス)・射程\d+。/, "");
}

function renderHand() {
  el.hand.innerHTML = "";
  if (!game.hand.length) {
    el.hand.innerHTML = `<p class="command-copy">命令実行中…</p>`;
    return;
  }
  const visibleHand = [...game.hand].sort((a, b) =>
    Number(cardDefs[b.cardId].ownerId === activeActorId) - Number(cardDefs[a.cardId].ownerId === activeActorId));
  for (const instance of visibleHand) {
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
      <span class="card-owner">${ownerMeta[def.ownerId].name}</span>
      <h3>${shown.name}</h3>
      <p class="card-target">${cardTargetLabel(shown)}</p>
      <p>${cardFaceEffect(shown)}</p>
      <div class="card-bottom">
        <span class="card-move${moveMode ? " active-use-mode" : ""}">${moveMode ? "移動命令として使用中" : "ALTで移動"}</span>
        ${isLegacy ? `<span class="legacy-tag">LEGACY</span>` : ""}
      </div>
    `;
    button.addEventListener("click", () => selectCard(instance.instanceId));
    el.hand.appendChild(button);
  }
}

// Always three enemy order slots ①②③, fixed before planning. An empty slot names the defeated enemy that owns it.
function renderIntents() {
  el.intents.innerHTML = "";
  const forecastState = displayTimelineState();
  const resolvingEvent = game.phase === "resolving" ? game.activeForecast?.events[game.timelineCursor] : null;
  for (let slot = 1; slot <= 3; slot += 1) {
    const item = game.intents.find(entry => (entry.slot ?? ENEMY_SLOT[entry.id]) === slot);
    const card = document.createElement("article");
    card.dataset.enemySlot = String(slot);
    const badge = `<span class="enemy-slot-badge">${enemySlotLabel(slot)}</span>`;
    if (!item) {
      const owner = getUnit(enemySlotOwner(slot));
      card.className = "intent-card empty";
      card.innerHTML = `${badge}<p class="intent-empty">なし${owner ? `（${owner.name}は撃破済み）` : ""}</p>`;
      el.intents.appendChild(card);
      continue;
    }
    const actor = getUnit(item.actorId);
    const target = item.targetId ? getUnit(item.targetId) : null;
    const shownActor = forecastState?.units.find(unit => unit.id === actor.id) || actor;
    const targetText = item.targetKind === "cells"
      ? (item.cells?.length ? `→ マス${item.cells.length}つ` : "→ マスなし")
      : target && target.id !== actor.id ? `→ ${target.name}` : "→ 自身";
    const current = resolvingEvent?.kind === "enemy" && resolvingEvent.key === `enemy-${item.actorId}-${item.id}`;
    card.className = `intent-card${current ? " current" : ""}`;
    if (current) card.setAttribute("aria-current", "step");
    card.innerHTML = `
      ${badge}
      <div class="intent-icon">${actor.icon}</div>
      <div class="intent-body">
        <h3><span>${actor.name}｜${item.name}</span><b class="intent-hp${shownActor.hp !== actor.hp ? " changed" : ""}">HP ${shownActor.hp !== actor.hp ? `${actor.hp}→${shownActor.hp}` : `${actor.hp}/${actor.maxHp}`}</b></h3>
        <p class="intent-effect">${item.description}</p>
        <p class="intent-target">${targetText}</p>
        ${renderEffectDetails(item.id, `intent-${item.actorId}`)}
      </div>
    `;
    el.intents.appendChild(card);
  }
}

function renderSquad() {
  el.squad.innerHTML = "";
  const forecastState = displayTimelineState();
  const actualPlayers = game.units.filter(item => item.side === "player");
  for (const actual of actualPlayers) {
    const unit = forecastState?.units.find(item => item.id === actual.id) || actual;
    const row = document.createElement("div");
    row.className = `squad-member${unit.hp <= 0 ? " down" : ""}`;
    const statuses = [unit.guard ? `装甲${unit.guard}` : "", unit.rooted ? "足止め" : "", unit.marked ? "目印" : ""].filter(Boolean).join(" / ");
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
  const forecast = game.phase === "planning" && game.queue.length ? predictTimeline() : null;
  const canReturn = queueReturnEligible();
  const planToken = movementPlanToken();
  for (let i = 0; i < 3; i += 1) {
    const action = game.queue[i];
    const slot = document.createElement("div");
    slot.className = `queue-slot${action ? " filled" : ""}`;
    const outcome = action && forecast ? cancelledQueueOutcome(forecast, action) : null;
    slot.innerHTML = action
      ? `<span class="queue-number">${allySlotLabel(i + 1)}</span>${action.label}
        ${outcome ? `<span class="queue-prediction${outcome.status === "cancelled" ? " cancelled" : ""}">予測：${outcome.status === "cancelled" ? `取消・${escapeEffectText(outcome.reason)}` : escapeEffectText(outcome.summary)}</span>` : ""}`
      : `<span class="queue-number">${allySlotLabel(i + 1)}</span>命令待機`;
    if (action && canReturn && i < game.queue.length - 1 && outcome?.status === "cancelled") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "queue-return-button";
      button.dataset.returnInstanceId = action.instance.instanceId;
      button.textContent = "取消命令を外して手札へ戻す";
      button.setAttribute("aria-label", `${allySlotLabel(i + 1)} ${action.label}、予測で取消、理由：${outcome.reason}。手札へ戻す`);
      button.addEventListener("click", () => returnCancelledQueueAction(action.instance.instanceId, planToken, button));
      slot.appendChild(button);
    }
    el.queue.appendChild(slot);
  }

  if (el.queueReturnStatus.textContent !== queueReturnMessage) el.queueReturnStatus.textContent = queueReturnMessage;

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
    .filter(Boolean);
}

const openEffectDisclosures = new Set();

function effectIdForEvent(event) {
  if (event.kind === "enemy") return event.payload.id;
  if (event.payload.mode === "move") return "move";
  if (event.payload.mode === "legacy") return `legacy_${cardDefs[event.payload.cardId].ownerId}`;
  return event.payload.cardId;
}

function escapeEffectText(text) {
  return String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderRuleDetails(key) {
  const rule = effectRules[key];
  return `<details class="rule-detail"><summary>${rule.name}</summary><p>${rule.text}</p></details>`;
}

function renderEffectDetails(id, location, indexEntry = false) {
  const effect = effectCatalog[id];
  if (!effect) return "";
  const disclosure = `${location}-${id}`;
  return `<details class="effect-details" data-effect-id="${id}" data-disclosure="${disclosure}"${openEffectDisclosures.has(disclosure) ? " open" : ""}>
    <summary>${indexEntry ? (effect.group === "enemy" ? `${effect.name} · ${enemySlotLabel(ENEMY_SLOT[id])}` : effect.name) : `効果詳細：${effect.name}`}</summary>
    <div class="effect-rules">
      <h4>効果の規則</h4><p>${effect.short}</p>
      ${effect.detail.map(text => `<p>${text}</p>`).join("")}
      <div class="related-rules"><h4>関連する共通ルール</h4>${effect.rules.map(renderRuleDetails).join("")}${id === "move" ? "" : renderEffectDetails("move", disclosure, true)}</div>
    </div>
  </details>`;
}

document.addEventListener("toggle", event => {
  const id = event.target?.dataset?.disclosure;
  if (!id) return;
  if (event.target.open) openEffectDisclosures.add(id);
  else openEffectDisclosures.delete(id);
}, true);

function highlightIntentClause(clause) {
  return clause.replace(
    /(\d+|移動|接近|ダメージ|次ターン|装甲|足止め|目印|解除|回復)/g,
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
  const trace = activeEnemyTrace();
  const forecast = selection ? null : trace?.forecast || currentForecast();
  const events = selection?.events || forecast?.events || buildResolutionEvents();
  el.timeline.innerHTML = "";

  // Three fixed pairs (ally n, enemy n) in resolution order. Cells without an event are plain text, not buttons.
  const cells = new Map();
  const pairs = [1, 2, 3].map(number => {
    const row = document.createElement("div");
    row.className = "timeline-pair";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", `第${number}組`);
    for (const kind of ["player", "enemy"]) {
      const label = kind === "enemy" ? enemySlotLabel(number) : allySlotLabel(number);
      const empty = document.createElement("div");
      empty.className = `timeline-empty-slot ${kind}`;
      empty.dataset.slotKind = kind;
      empty.dataset.slot = String(number);
      empty.innerHTML = `<span class="timeline-index">${label}</span><span class="timeline-empty-text">${kind === "enemy" ? "なし" : "未登録"}</span>`;
      row.appendChild(empty);
      cells.set(`${kind}-${number}`, empty);
    }
    el.timeline.appendChild(row);
    return row;
  });

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
    const isSelected = provisional || (game.phase === "planning" && !selection && (trace?.event.key === event.key || game.previewIndex === index));
    const cancelled = outcome ? outcome.status === "cancelled" : !view.canAct;
    const targetLabel = timelineTargetLabel(event);
    const effectText = effectCatalog[effectIdForEvent(event)]?.short || event.payload.description || "";
    const resultLabel = timelineResultLabel(provisional, outcome, selection, index);
    const orderLabel = eventSlotLabel(event);
    step.className = `timeline-step ${event.kind}${provisional ? " provisional" : ""}${isDone ? " done" : ""}${isCurrent ? " current" : ""}${isSelected ? " selected" : ""}${cancelled ? " cancelled" : ""}`;
    step.dataset.eventKey = event.key;
    step.setAttribute("aria-label", [
      orderLabel,
      view.name,
      view.action,
      `対象${targetLabel}`,
      effectText,
      event.kind === "enemy" ? "予告トレースと効果詳細を開く" : "効果詳細を開く",
      resultLabel
    ].join("、"));
    step.setAttribute("aria-controls", "timeline-detail-panel");
    step.setAttribute("aria-expanded", String(Boolean(
      provisional || (game.phase === "resolving" ? game.timelineCursor : game.previewIndex) === index
    )));
    step.setAttribute("aria-pressed", String(Boolean(game.phase === "planning" && isSelected)));
    if (isCurrent) step.setAttribute("aria-current", "step");
    step.innerHTML = `
      <span class="timeline-index">${orderLabel}</span>
      <span class="timeline-name">${view.name}</span>
      <span class="timeline-action">${cancelled ? "取消：" : ""}${view.action}</span>
      <span class="timeline-target">対象：${targetLabel}</span>
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
      actorChoice = null;
      enemyTrace = event.kind === "enemy" ? { key: event.key, token: movementPlanToken() } : null;
      game.previewIndex = baseIndex >= 0 ? baseIndex : null;
      render();
      el.timeline.querySelector?.(`[data-event-key="${event.key}"]`)?.focus({ preventScroll: true });
    });
    const placeholder = cells.get(`${event.kind}-${event.slot}`);
    if (placeholder) placeholder.replaceWith(step);
    else pairs[pairs.length - 1].appendChild(step);
  });

  renderTimelineDetail(selection, forecast, events);
  el.previewFinal.disabled = game.phase !== "planning" || !game.queue.length || Boolean(selection);
  el.previewFinal.classList.toggle("active", Boolean(forecast && !selection && game.previewIndex === null && !trace));

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

function movementPositionOrigin(forecast, index, occupied) {
  const isHere = unit => Boolean(unit && unit.hp > 0 && unit.x === occupied.x && unit.y === occupied.y);
  // Walk back only while this same living unit continuously occupies the cell.
  for (let prior = index - 1; prior >= 0; prior -= 1) {
    const after = simGetUnit(forecast.snapshots[prior].state, occupied.unitId);
    if (!isHere(after)) return null;
    const before = simGetUnit(prior ? forecast.snapshots[prior - 1].state : forecast.initial, occupied.unitId);
    if (!before || before.hp <= 0) return null;
    if (before.x !== after.x || before.y !== after.y) {
      return { kind: "event", index: prior, eventKey: forecast.events[prior].key };
    }
  }
  return isHere(simGetUnit(forecast.initial, occupied.unitId)) ? { kind: "initial" } : null;
}

function movementEventLabel(forecast, index) {
  const event = forecast.events[index];
  const view = timelineEventView(event);
  return `${eventSlotLabel(event)} ${view.name}「${view.action}」`;
}

function renderMovementEvidence(forecast, index) {
  if (game.phase !== "planning" || game.selectedInstanceId || (!game.queue.length && !activeEnemyTrace())) return "";
  const evidence = forecast?.snapshots[index]?.outcome?.movementEvidence;
  if (!evidence || evidence.eventKey !== forecast.events[index]?.key) return "";
  const token = movementPlanToken();
  const disclosure = `${token}:${evidence.eventKey}`;
  const name = id => escapeEffectText(simGetUnit(forecast.initial, id)?.name || id);
  const point = cell => `(${cell.x + 1},${cell.y + 1})`;
  const occupied = evidence.excluded.map((cell, ordinal) => {
    const origin = movementPositionOrigin(forecast, index, cell);
    const link = origin?.kind === "event"
      ? `<button type="button" class="movement-link" data-movement-origin="${ordinal}" data-related-key="${escapeEffectText(origin.eventKey)}">${escapeEffectText(movementEventLabel(forecast, origin.index))}でこの位置へ</button>`
      : origin?.kind === "initial" ? `<span class="movement-origin-note">ターン開始時からこの位置</span>` : "";
    return `<li>${point(cell)} ${name(cell.unitId)}が占有${link}</li>`;
  }).join("");
  let end = "";
  if (evidence.movementEnd === "rooted") end = "<p>足止めにより移動処理を終了。経路は探索していません。</p>";
  else if (evidence.pathResult === "no_path") end = "<p>対象に上下左右で隣接する位置への経路が見つからず、移動なし。</p>";
  else if (evidence.pathResult === "already_adjacent") end = "<p>開始時から対象と上下左右に隣接しており、移動なし。</p>";
  else if (evidence.movementEnd === "not_requested") end = "<p>開始時の判定で攻撃を選び、移動処理は行いませんでした。</p>";
  const attack = evidence.attack;
  let attackText = "";
  let rule = "";
  if (attack.at === "start") {
    attackText = attack.performed ? "開始時に対象と上下左右に隣接し、攻撃あり。" : "開始時は対象と上下左右に隣接せず、移動を選択。移動後の攻撃判定はありません。";
    if (!attack.performed) rule = "<p class=\"movement-rule\">効果の規則：この技は離れて始めた場合、移動後には攻撃しません。</p>";
  } else if (attack.actorAlive === false) attackText = "行動者が戦闘不能で攻撃なし。後続の攻撃条件は未評価。";
  else if (attack.targetAlive === false) attackText = "対象が戦闘不能で攻撃なし。隣接条件は未評価。";
  else if (attack.performed) attackText = "移動後に対象と上下左右に隣接し、攻撃あり。装甲などを適用した結果は上の予測結果に表示します。";
  else if (attack.adjacent === false) attackText = `移動後は${name(evidence.targetId)}と上下左右に隣接せず、攻撃なし。`;
  return `<details class="movement-evidence" data-movement-disclosure="${escapeEffectText(disclosure)}" data-movement-plan="${token}"${movementUI.open.has(disclosure) ? " open" : ""}>
    <summary>この計画の移動経過 — ${escapeEffectText(movementEventLabel(forecast, index))}</summary>
    <div class="movement-body">
      <p>開始時：${name(evidence.actorId)}${point(evidence.start.actor)} → 対象${name(evidence.targetId)}${point(evidence.start.target)}</p>
      ${occupied ? `<p>開始位置に隣接する通れないマス（占有による除外）：</p><ul>${occupied}</ul>` : ""}
      ${evidence.plannedLength !== null ? `<p>この移動の予定：${evidence.plannedLength}マス（移動上限${evidence.limit}マス適用後）。</p>` : ""}
      <p>実際の移動：${[evidence.start.actor, ...evidence.entered].map(point).join(" → ")}${!evidence.entered.length ? "（進入なし）" : ""}</p>
      ${end}
      ${evidence.trap ? `<p>${point(evidence.trap)}で火種の罠が発動。この移動の予定残りは${evidence.trap.remaining}マス。</p>` : ""}
      ${attackText ? `<p>${attackText}</p>` : ""}${rule}
    </div>
  </details>`;
}

function movementNavigationContext(token, forecast) {
  if (token !== movementPlanToken() || game.phase !== "planning" || game.selectedInstanceId || !game.queue.length) return null;
  return forecast || null;
}

function bindMovementNavigation(forecast, index) {
  const token = movementPlanToken();
  const fromKey = forecast?.events[index]?.key;
  const details = el.timelineDetail.querySelector?.(".movement-evidence");
  details?.addEventListener("toggle", () => {
    if (!details.isConnected || details.dataset.movementPlan !== movementPlanToken()) return;
    const key = details.dataset.movementDisclosure;
    if (details.open) movementUI.open.add(key);
    else movementUI.open.delete(key);
  });
  for (const button of el.timelineDetail.querySelectorAll?.("[data-related-key]") || []) {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const current = movementNavigationContext(token, forecast);
      if (!button.isConnected || !current || current.events[game.previewIndex]?.key !== fromKey) return;
      const fromIndex = current.events.findIndex(item => item.key === fromKey);
      const evidence = current.snapshots[fromIndex]?.outcome?.movementEvidence;
      const occupied = evidence?.excluded[Number(button.dataset.movementOrigin)];
      const origin = occupied && movementPositionOrigin(current, fromIndex, occupied);
      if (origin?.kind !== "event" || origin.eventKey !== button.dataset.relatedKey) return;
      movementUI.open.add(`${token}:${fromKey}`);
      movementUI.returnTo = { token, fromKey, toKey: origin.eventKey, ordinal: Number(button.dataset.movementOrigin),
        traceKey: enemyTrace?.key === fromKey ? fromKey : null };
      enemyTrace = null;
      game.previewIndex = origin.index;
      render();
      const heading = el.timelineDetail.querySelector?.("#timeline-detail-heading");
      heading?.focus();
      heading?.scrollIntoView({ block: "nearest" });
    });
  }
  const back = el.timelineDetail.querySelector?.("[data-movement-return]");
  back?.addEventListener("click", event => {
    event.stopPropagation();
    const current = movementNavigationContext(token, forecast), saved = movementUI.returnTo;
    if (!back.isConnected || !current || saved?.token !== token || current.events[game.previewIndex]?.key !== saved.toKey) return;
    const destination = current.events.findIndex(item => item.key === saved.fromKey);
    if (destination < 0 || !current.snapshots[destination]?.outcome?.movementEvidence) {
      movementUI.returnTo = null;
      return;
    }
    game.previewIndex = destination;
    enemyTrace = saved.traceKey === saved.fromKey && current.events[destination]?.kind === "enemy"
      ? { key: saved.fromKey, token } : null;
    movementUI.returnTo = null;
    movementUI.open.add(`${token}:${saved.fromKey}`);
    render();
    const origin = el.timelineDetail.querySelector?.(`[data-movement-origin="${saved.ordinal}"]`) || el.timelineDetail.querySelector?.(".movement-evidence > summary");
    origin?.focus();
    origin?.scrollIntoView({ block: "nearest" });
  });
}

function renderMovementReturn(forecast, index) {
  const saved = movementUI.returnTo;
  if (!saved || !movementNavigationContext(saved.token, forecast) || forecast.events[index]?.key !== saved.toKey) return "";
  const fromIndex = forecast.events.findIndex(item => item.key === saved.fromKey);
  if (fromIndex < 0) return "";
  return `<button type="button" class="movement-link movement-return" data-movement-return>${escapeEffectText(movementEventLabel(forecast, fromIndex))}へ戻る</button>`;
}

function renderTimelineDetail(selection, forecast, events) {
  if (selection) {
    el.timelineDetail.hidden = false;
    el.timelineDetail.innerHTML = `
      <div class="timeline-detail-title"><span>この命令の直前</span><b>${eventSlotLabel(selection.events[selection.eventIndex])}</b></div>
      <p>この時点の位置・HP・状態から対象を選択します。対象確定後に後続イベントを再予測します。</p>
      ${renderEffectDetails(effectIdForEvent(selection.events[selection.eventIndex]), "selection")}
    `;
    return;
  }

  const detailIndex = game.phase === "resolving" ? game.timelineCursor : game.previewIndex;
  const outcome = Number.isInteger(detailIndex) ? forecast?.snapshots[detailIndex]?.outcome : null;
  const event = Number.isInteger(detailIndex) ? events[detailIndex] : null;
  if (!event) {
    el.timelineDetail.hidden = true;
    el.timelineDetail.innerHTML = "";
    return;
  }
  const view = timelineEventView(event);
  el.timelineDetail.hidden = false;
  el.timelineDetail.innerHTML = `
    <div class="timeline-detail-title" id="timeline-detail-heading" tabindex="-1"><span>TURN ${String(game.turn).padStart(2, "0")} · ${eventSlotLabel(event)} ${view.name}｜${view.action}</span><b>${outcome ? (game.phase === "planning" ? "現在計画の予測・行動直後" : "実行・行動直後") : "効果説明"}</b></div>
    ${renderMovementReturn(forecast, detailIndex)}
    ${renderEffectDetails(effectIdForEvent(event), "timeline")}
    <h4 class="prediction-title">この計画の予測結果</h4>
    ${!outcome ? `<p>命令を登録すると予測結果を表示します。${effectIdForEvent(event) === "drain" ? "回復先は実行時に決定します。" : ""}</p>` : ""}
    <div class="timeline-detail-groups">
      ${(outcome?.groups || []).map(group => `
        <section data-change-type="${group.type}">
          <strong>${group.summary}</strong>
          ${group.details.map(detail => `<span>${detail}</span>`).join("")}
        </section>
      `).join("")}
    </div>
    ${renderMovementEvidence(forecast, detailIndex)}
    ${outcome?.logs.length ? `<details class="outcome-logs"><summary>発動・無効・取消を含む経過</summary>${outcome.logs.map(log => `<p>${escapeEffectText(log)}</p>`).join("")}</details>` : ""}
  `;
  bindMovementNavigation(forecast, detailIndex);
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

function previewSlotText() {
  const event = currentForecast()?.events[game.previewIndex];
  return event ? eventSlotLabel(event) : "選んだ行動";
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
    el.instruction.textContent = activeActorId && game.phase === "planning"
      ? actorChoice === "alt-pick"
        ? `${getUnit(activeActorId).name}を移動させるカードを手札から選んでください。`
        : `${getUnit(activeActorId).name}を選択中。この命令の直前に使う固有技またはALTを選んでください。`
      : game.phase === "resolving"
      ? "命令と敵の行動を解決しています…"
      : game.queue.length
        ? (Number.isInteger(game.previewIndex)
          ? `${previewSlotText()}の直後を予測表示中。`
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
          ? `先に解決する「${eventCauseLabel(causeEvent)}」で戦闘不能になります。`
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
    el.modeHelp.textContent = legacy
      ? "持ち主が倒れたため、遺志として使用"
      : `${allySlotLabel(game.queue.length + 1)}として解決（${enemySlotLabel(game.queue.length + 1)}の直前）。効果詳細は行動予測の下で確認できます。`;
    el.instruction.textContent = `この命令の直前：${shown.name}の対象を選んでください。`;
  }
}

let modalReturnFocus = null;
let helpReturnModal = null;

const notesButtonHome = el.notesButton.parentNode;
const notesButtonNext = el.notesButton.nextSibling;
const modalCard = el.modal.querySelector?.(".modal-card");
let modalGeneration = 0;
const modalHeldKeys = new Map();
let modalPointerPress = null;

function notesAreOpen() { return Boolean(el.notesDialog.open); }

function isAvailableFocusTarget(node) {
  if (!node?.isConnected || node.disabled || node.closest?.("[hidden], [inert]") || !node.getClientRects?.().length) return false;
  if (getComputedStyle(node).visibility === "hidden") return false;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === "DETAILS" && !parent.open && !parent.querySelector(":scope > summary")?.contains(node)) return false;
  }
  return true;
}

function restoreGameDialogFocus(preferred, battlefieldFallback = el.help) {
  if (notesAreOpen()) return;
  const inCurrentSurface = node => el.modal.hidden ? !el.modal.contains?.(node) : el.modal.contains?.(node);
  const target = [preferred, el.modal.hidden ? battlefieldFallback : el.modalButton, el.help]
    .find(node => isAvailableFocusTarget(node) && inCurrentSurface(node));
  target?.focus({ preventScroll: true });
}

function syncModalInteraction() {
  if (!el.modal.hidden) {
    // Preserve the one existing note control, including listeners and accessible count.
    if (el.notesButton.parentNode !== el.modalActions) el.modalActions.appendChild(el.notesButton);
    el.main.inert = true;
    el.modalHelp.hidden = el.modal.dataset.help === "true";
    const screen = el.modal.dataset.screen;
    el.modalAlt.hidden = !["initial", "victory", "defeat"].includes(screen);
    el.modalAlt.textContent = screen === "initial" ? "案内なしで戦闘開始" : "案内つきで再戦";
  } else {
    el.main.inert = false;
    if (notesButtonHome && el.notesButton.parentNode !== notesButtonHome) {
      notesButtonHome.insertBefore(el.notesButton, notesButtonNext?.parentNode === notesButtonHome ? notesButtonNext : null);
    }
  }
}

function focusModalPrimary() {
  if (!notesAreOpen()) el.modalButton.focus?.();
}

function modalActivationAllowed(event) {
  if (notesAreOpen()) return false;
  if (event?.detail > 0) {
    return !modalPointerPress || (modalPointerPress.generation === modalGeneration && modalPointerPress.target === event.currentTarget);
  }
  // Keyboard activation is checked at its own keydown/keyup below. A stale,
  // unrelated key must not veto a fresh key or an assistive-technology click.
  return true;
}

function isModalKeyTarget(target) { return target === el.modalButton || target === el.modalHelp || target === el.modalAlt; }

function modalKeyPressAllowed(press, target) {
  return press && !press.cancelled && press.generation === modalGeneration && press.target === target &&
    !notesAreOpen() && !el.modal.hidden && !target.hidden && !target.disabled;
}

function activateModalKeyTarget(target) {
  target.click();
}

function cancelModalKeyPresses() {
  // Keep cancelled presses until keyup (or a fresh non-repeat keydown), so a
  // delayed Space release cannot act on the result shown after an interruption.
  for (const press of modalHeldKeys.values()) press.cancelled = true;
}

function showModal(title, body, buttonText, action = "close", screen = "message") {
  // A new briefing/result supersedes any presentation saved beneath Help.
  helpReturnModal = null;
  if (el.modal.hidden) modalReturnFocus = document.activeElement;
  modalGeneration += 1;
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = body;
  el.modalButton.textContent = buttonText;
  el.modal.dataset.action = action;
  el.modal.dataset.help = String(screen === "help");
  el.modal.dataset.screen = screen;
  el.modal.hidden = false;
  el.modalBody.scrollTop = 0;
  if (modalCard) modalCard.scrollTop = 0;
  syncModalInteraction();
  focusModalPrimary();
}

function showHelp() {
  if (!el.modal.hidden && el.modal.dataset.help === "true") return;
  clearInterposePreviewDisplay();
  const previous = el.modal.hidden ? null : {
    title: el.modalTitle.textContent,
    body: el.modalBody.innerHTML,
    buttonText: el.modalButton.textContent,
    action: el.modal.dataset.action,
    screen: el.modal.dataset.screen,
    scrollTop: el.modalBody.scrollTop,
    cardScrollTop: modalCard?.scrollTop || 0,
    returnFocus: modalReturnFocus
  };
  const returnLabel = !previous ? "戦場へ戻る" : previous.screen === "initial" ? "開始画面へ戻る" : "結果へ戻る";
  for (const key of openEffectDisclosures) {
    if (key.startsWith("index-") || key.startsWith("help-")) openEffectDisclosures.delete(key);
  }
  showModal("命令の組み方", `
    ${!previous && game.phase === "planning" ? `<button type="button" id="help-guide-button" class="secondary-button">このターンの操作案内を見る</button>`
      : game.phase === "resolving" ? `<p>作戦解決中です。次の計画中に操作案内を開けます。</p>`
      : previous?.screen === "initial" ? `<p>操作案内は戦闘開始後に開けます。</p>` : ""}
    <div class="brief-step"><b>1</b><span>盤面の生存味方を選び、手札の技かALT移動を選びます。</span></div>
    <div class="brief-step"><b>2</b><span>光る対象を選び、敵の予告に対して1～3命令を登録します。</span></div>
    <div class="brief-step"><b>3</b><span>味方①→敵①→味方②→敵②→味方③→敵③ の予測を見て作戦実行。敵を全員倒せば勝利、味方が全員倒れると敗北です。</span></div>
    <p>一時効果は装甲・足止め・目印の3つです。いずれもターン末に消えます。駒の状態を選ぶと詳細を確認できます。</p>
    <p>カード表面は対象・射程・数値を短く表示し、技の「効果詳細」とこのHelpで完全な規則を確認できます。</p>
    <details class="help-section"><summary>距離と移動・命令</summary>${["distance", "targets", "orders"].map(renderRuleDetails).join("")}${renderEffectDetails("move", "help", true)}</details>
    <details class="help-section"><summary>ダメージと装甲</summary>${["damage", "guard"].map(renderRuleDetails).join("")}</details>
    <details class="help-section"><summary>足止め・目印・罠とターン末</summary>${["rooted", "marked", "terrain", "turn", "legacy"].map(renderRuleDetails).join("")}</details>
    <details class="help-section technique-index"><summary>全ての技の説明（敵9・カード12・遺志3）</summary>
      ${[["enemy", "敵の9技"], ["card", "味方の12カード"], ["legacy", "3つの遺志"]].map(([group, title]) => `<section><h3>${title}</h3>${Object.entries(effectCatalog).filter(([, effect]) => effect.group === group).map(([id]) => renderEffectDetails(id, "index", true)).join("")}</section>`).join("")}
    </details>
  `, returnLabel, "close", "help");
  helpReturnModal = previous;
  el.modal.dataset.help = "true";
}

el.modalBody.addEventListener("click", event => {
  if (event.target?.id !== "help-guide-button" || game.phase !== "planning" || el.modal.hidden || el.modal.dataset.help !== "true") return;
  activateModalPrimary();
  openTurnGuide();
});

el.techniqueMode.addEventListener("click", () => setMode("technique"));
el.guideNext.addEventListener("click", () => {
  if (!turnGuide.active) return;
  if (turnGuide.step === turnGuideSteps.length - 1) { closeTurnGuide(); return; }
  turnGuide.step += 1;
  renderTurnGuide();
  el.guideNext.focus({ preventScroll: true });
});
el.guideBack.addEventListener("click", () => {
  if (!turnGuide.active || turnGuide.step === 0) return;
  turnGuide.step -= 1;
  renderTurnGuide();
  el.guideBack.focus({ preventScroll: true });
});
el.guideLook.addEventListener("click", () => {
  if (!turnGuide.active || game.phase !== "planning") return;
  const target = document.querySelector(turnGuideSteps[turnGuide.step].target);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "center" });
});
el.guideClose.addEventListener("click", () => closeTurnGuide());
el.moveMode.addEventListener("click", () => setMode("move"));
el.cancel.addEventListener("click", () => {
  clearSelection(); actorChoice = null; render();
  if (activeActorId) el.actorStrip.querySelector(`[data-actor-id="${activeActorId}"]`)?.focus({ preventScroll: true });
});
el.undo.addEventListener("click", undoLast);
el.execute.addEventListener("click", executeTurn);
el.previewFinal.addEventListener("click", () => {
  if (game.phase !== "planning" || !game.queue.length) return;
  game.previewIndex = null;
  clearSelection();
  actorChoice = null;
  render();
});
el.help.addEventListener("click", showHelp);
el.notesButton.addEventListener("click", clearInterposePreviewDisplay);
el.modalHelp.addEventListener("click", event => {
  if (modalActivationAllowed(event)) showHelp();
});

function activateModalPrimary(actionOverride = null) {
  if (el.modal.dataset.help === "true" && helpReturnModal) {
    const previous = helpReturnModal;
    showModal(previous.title, previous.body, previous.buttonText, previous.action, previous.screen);
    if (previous.action === undefined) delete el.modal.dataset.action;
    el.modalBody.scrollTop = previous.scrollTop;
    if (modalCard) modalCard.scrollTop = previous.cardScrollTop;
    modalReturnFocus = previous.returnFocus;
    return;
  }
  helpReturnModal = null;
  const action = actionOverride || el.modal.dataset.action;
  if (action === "restart" || action === "restart-guided") resetGame();
  el.modal.hidden = true;
  el.modal.dataset.action = "close";
  el.modal.dataset.help = "false";
  modalGeneration += 1;
  syncModalInteraction();
  if (action === "start-guided" || action === "restart-guided") openTurnGuide();
  else restoreGameDialogFocus(modalReturnFocus);
}

el.modalButton.addEventListener("click", event => {
  if (modalActivationAllowed(event)) activateModalPrimary();
});
el.modalAlt.addEventListener("click", event => {
  if (!modalActivationAllowed(event) || el.modalAlt.hidden) return;
  const screen = el.modal.dataset.screen;
  if (screen === "initial") activateModalPrimary("start-no-guide");
  else if (screen === "victory" || screen === "defeat") activateModalPrimary("restart-guided");
});

document.addEventListener("click", event => {
  const target = event.target;
  if (target?.closest?.(".unit-statuses") || target?.closest?.("#board-status-popover")) return;
  if (pinnedStatusPopover) closeStatusPopover(true);
});

document.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    if (!event.repeat || !modalHeldKeys.has(event.key)) {
      modalHeldKeys.set(event.key, { generation: modalGeneration, target: event.target, cancelled: event.repeat });
    }
    const press = modalHeldKeys.get(event.key);
    if (isModalKeyTarget(event.target) && !notesAreOpen()) {
      // Preserve button timing (Enter on press, Space on release), but consume
      // the native click so only this gesture can authorize the action.
      event.preventDefault();
      if (event.key === "Enter" && !event.repeat && modalKeyPressAllowed(press, event.target)) activateModalKeyTarget(event.target);
      return;
    }
  }
  if (notesAreOpen()) return;
  if (event.key === "Escape" && pinnedStatusPopover) closeStatusPopover(true);
  if (event.key === "Escape" && el.modal.hidden && turnGuide.active && el.guide.contains(document.activeElement)) {
    event.preventDefault();
    closeTurnGuide();
    return;
  }
  if (event.key === "Escape" && el.modal.hidden && game.phase === "planning" && activeActorId) {
    event.preventDefault();
    if (selectedCard() || actorChoice) { clearSelection(); actorChoice = null; }
    else clearActorView();
    render();
    (activeActorId ? el.actorStrip.querySelector(`[data-actor-id="${activeActorId}"]`) : el.actorStrip.querySelector("button:not(:disabled)"))?.focus({ preventScroll: true });
    return;
  }
  if (el.modal.hidden || event.target?.closest?.("#notes-dialog")) return;
  if (event.key === "Escape" && el.modal.dataset.help === "true") {
    event.preventDefault();
    activateModalPrimary();
    return;
  }
  if (event.key === "Tab") {
    const controls = [...(el.modal.querySelectorAll?.("button, summary, [tabindex='0']") || [])]
      .filter(isAvailableFocusTarget);
    const index = controls.indexOf(document.activeElement);
    const next = index < 0 ? (event.shiftKey ? controls.at(-1) : controls[0])
      : controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
    event.preventDefault();
    next?.focus();
  }
}, true);

document.addEventListener("keyup", event => {
  const press = modalHeldKeys.get(event.key);
  modalHeldKeys.delete(event.key);
  if ((event.key === "Enter" || event.key === " ") && isModalKeyTarget(event.target) && !notesAreOpen()) {
    event.preventDefault();
    if (event.key === " " && modalKeyPressAllowed(press, event.target)) activateModalKeyTarget(event.target);
  }
}, true);

document.addEventListener("focusout", event => {
  for (const press of modalHeldKeys.values()) if (press.target === event.target) press.cancelled = true;
}, true);
globalThis.addEventListener?.("blur", cancelModalKeyPresses);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") cancelModalKeyPresses();
});

document.addEventListener("pointerdown", event => {
  if (event.target === el.modal) event.preventDefault();
  modalPointerPress = { generation: modalGeneration, target: event.target?.closest?.("button") };
}, true);

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
      action: action.label, mode: action.mode, speed: allySlotLabel(index + 1),
      target: timelineTargetLabel({ kind: "player", payload: action })
    })),
    preview
  };
}

// Id-based comment scene for the play log, captured when the comment dialog opens. Reads only; never changes game or rng.
function captureCommentContext() {
  const card = game.hand.find(item => item.instanceId === game.selectedInstanceId);
  const selectionContext = game.phase === "planning" ? selectionTimelineContext() : null;
  let preview = { kind: "current", eventIndex: null, eventKey: null };
  if (game.phase === "resolving") {
    const index = game.timelineCursor;
    preview = { kind: "resolving", eventIndex: index >= 0 ? index : null, eventKey: game.activeForecast?.events[index]?.key || null };
  } else if (selectionContext) {
    preview = { kind: "selection-before", eventIndex: selectionContext.eventIndex,
      eventKey: selectionContext.events[selectionContext.eventIndex]?.key || null };
  } else if (game.phase === "planning" && game.queue.length) {
    const index = game.previewIndex;
    preview = Number.isInteger(index)
      ? { kind: "event-after", eventIndex: index, eventKey: buildResolutionEvents()[index]?.key || null }
      : { kind: "final", eventIndex: null, eventKey: null };
  }
  return {
    turn: game.turn,
    phase: game.phase,
    context: {
      selection: card ? { instanceId: card.instanceId, cardId: card.cardId, mode: game.mode, moveUnitId: game.moveUnitId ?? null } : null,
      queue: game.queue.map(Order3Notes.queueRecord),
      preview,
      battle: game.phase === "ended" ? battleResult() : null
    }
  };
}

// Rebuilds recorded queue records into the same action shape handleCellClick creates, checking legality against the same selection state.
function replayRebuildQueue(records, handOrder = null) {
  const available = new Map(game.hand.map(card => [card.instanceId, card]));
  const startIds = game.hand.map(card => card.instanceId);
  if (handOrder) {
    const ids = [...handOrder, ...records.map(record => record.instanceId)];
    if (ids.length !== startIds.length || new Set(ids).size !== ids.length || ids.some(id => !available.has(id))) {
      return { divergence: { path: "handOrder", expected: startIds, actual: ids } };
    }
  }
  game.queue = [];
  for (const [index, record] of records.entries()) {
    const path = `queue[${index}]`;
    const card = available.get(record.instanceId);
    if (!card || !game.hand.includes(card)) return { divergence: { path: `${path}.instanceId`, expected: game.hand.map(item => item.instanceId), actual: record.instanceId } };
    const def = cardDefs[card.cardId];
    const owner = getUnit(def.ownerId);
    const mode = record.mode === "move" ? "move" : !owner || owner.hp <= 0 ? "legacy" : "technique";
    if (record.mode !== mode) return { divergence: { path: `${path}.mode`, expected: mode, actual: record.mode } };
    const selection = { card, mode: mode === "move" ? "move" : "technique", moveUnitId: mode === "move" ? record.actorId : null };
    const context = selectionTimelineContext(selection);
    const cells = context ? validCells(context, selection) : [];
    const legal = cell => Boolean(cell) && cells.some(item => item.x === cell.x && item.y === cell.y);
    let action;
    if (mode === "move") {
      const mover = getUnit(record.actorId);
      if (mover?.side !== "player" || !legal(record.target)) return { divergence: { path: `${path}.target`, expected: cells, actual: record.target } };
      action = { instance: card, cardId: card.cardId, mode, actorId: mover.id, target: { x: record.target.x, y: record.target.y }, speed: UNIFORM_SPEED, label: `${mover.name}：移動` };
    } else if (mode === "legacy") {
      const target = context && record.targetId ? simGetUnit(context.state, record.targetId) : null;
      if (!target || target.hp <= 0 || !legal(target)) return { divergence: { path: `${path}.targetId`, expected: cells, actual: record.targetId } };
      const legacy = getLegacy(def.ownerId);
      action = { instance: card, cardId: card.cardId, mode, actorId: def.ownerId, targetId: target.id, speed: UNIFORM_SPEED, label: legacy.name };
    } else {
      if (!legal(record.target)) return { divergence: { path: `${path}.target`, expected: cells, actual: record.target } };
      const target = simUnitAt(context.state, record.target.x, record.target.y);
      action = { instance: card, cardId: card.cardId, mode, actorId: def.ownerId, targetId: target?.id || null,
        target: { x: record.target.x, y: record.target.y }, speed: UNIFORM_SPEED, label: `${owner.name}：${def.name}` };
    }
    const difference = Order3Notes.firstDifference(record, Order3Notes.queueRecord(action));
    if (difference) return { divergence: { ...difference, path: `${path}.${difference.path}` } };
    game.hand = game.hand.filter(item => item !== card);
    game.queue.push(action);
  }
  if (handOrder) game.hand = handOrder.map(id => available.get(id));
  return { divergence: null };
}

function replayView(start, forecast, eventIndex = null) {
  const limit = Number.isInteger(eventIndex) ? eventIndex + 1 : forecast?.snapshots.length || 0;
  const snapshots = forecast ? forecast.snapshots.slice(0, limit) : [];
  return Order3Notes.clone({
    turn: start.turn,
    start: start.start,
    handOrder: game.hand.map(card => card.instanceId),
    queue: game.queue.map(Order3Notes.queueRecord),
    events: forecast ? forecast.events.map(event => ({ key: event.key, kind: event.kind, speed: event.speed })) : [],
    eventIndex,
    snapshots,
    outcome: Number.isInteger(eventIndex) ? forecast?.snapshots[eventIndex]?.outcome || null : null,
    movement: snapshots.filter(snapshot => snapshot.outcome.movementEvidence)
      .map(snapshot => ({ eventKey: snapshot.eventKey, evidence: snapshot.outcome.movementEvidence })),
    final: forecast ? forecast.final : cloneCombatState(game)
  });
}

function replayCommentView(start, comment) {
  const { selection, preview } = comment.context;
  const rebuilt = replayRebuildQueue(comment.context.queue);
  if (rebuilt.divergence) return { divergence: { ...rebuilt.divergence, path: `context.${rebuilt.divergence.path}` } };
  if (selection) {
    const card = game.hand.find(item => item.instanceId === selection.instanceId && item.cardId === selection.cardId);
    if (!card) return { divergence: { path: "context.selection.instanceId", expected: game.hand.map(item => item.instanceId), actual: selection.instanceId } };
    game.selectedInstanceId = card.instanceId;
    game.mode = selection.mode;
    game.moveUnitId = selection.moveUnitId;
  }
  game.previewIndex = preview.kind === "event-after" ? preview.eventIndex : null;
  const scene = captureCommentContext().context.preview;
  const difference = Order3Notes.firstDifference(preview, scene);
  if (difference) return { divergence: { ...difference, path: `context.preview.${difference.path}` } };
  const forecast = game.queue.length ? predictTimeline() : null;
  let view;
  if (preview.kind === "selection-before") {
    const context = selectionTimelineContext();
    view = { state: context.state, snapshots: context.snapshots };
  } else if (preview.kind === "event-after") {
    view = { state: forecast.snapshots[preview.eventIndex].state, snapshots: forecast.snapshots.slice(0, preview.eventIndex + 1) };
  } else if (preview.kind === "final") {
    view = { state: forecast.final, snapshots: forecast.snapshots };
  } else {
    view = { state: cloneCombatState(game), snapshots: [] };
  }
  return { divergence: null, state: Order3Notes.clone({ ...replayView(start, forecast), commentId: comment.commentId, phase: comment.phase,
    selection, preview, previewState: view.state, previewSnapshots: view.snapshots }) };
}

// Tool/QA replay of a recorded run: logged seed -> reconstructed hand order and queue -> predictTimeline -> completeResolvedTurn.
// target is null (whole run), {turn, event?} or {commentId}. The recorder is suspended for the duration.
// A turn is verified only when both its start and result checkpoints match. A committed turn without a recorded result is
// "incomplete", and a whole run is verified only when its recorded status also equals the replayed outcome.
function replayLoggedRun(run, target = null, options = {}) {
  let verifiedTurns = 0;
  let committedTurns = 0;
  let incompleteTurns = 0;
  const done = (status, extra = {}) => ({ status, verifiedTurns, committedTurns, incompleteTurns, divergence: null, state: null, reason: "", ...extra });
  const diverged = (turn, phase, difference, prefix = "") => done("diverged", {
    divergence: { turn, phase, path: `${prefix}${difference.path}`, expected: difference.expected, actual: difference.actual } });
  const check = Order3Notes.validateRun(run);
  if (!check.ok) return done("not-replayable", { reason: `invalid run: ${check.errors[0] || "schema"}` });
  if (run.gameVersion !== GAME_VERSION && !options.force) return done("version-mismatch", { reason: `log ${run.gameVersion}, product ${GAME_VERSION}` });
  committedTurns = run.turns.filter(turn => turn.commit).length;
  if (!committedTurns) return done("not-replayable", { reason: "no committed turn" });
  const comment = target?.commentId ? run.comments.find(item => item.commentId === target.commentId) : null;
  if (target?.commentId && !comment) return done("not-replayable", { reason: `comment ${target.commentId} not found` });
  const targetTurn = comment ? comment.turn : Number.isInteger(target?.turn) ? target.turn : null;
  const eventIndex = !comment && Number.isInteger(target?.event) ? target.event : null;
  const targetRecord = run.turns.find(turn => turn.turn === targetTurn);
  if (targetTurn !== null && !targetRecord) return done("not-replayable", { reason: `turn ${targetTurn} not recorded` });
  if (eventIndex !== null && !targetRecord.commit) return done("not-replayable", { reason: `turn ${targetTurn} has no committed events` });

  playlog.suspended = true;
  try {
    resetGame(run.seed);
    let openState = null;
    for (const [index, record] of run.turns.entries()) {
      const last = index === run.turns.length - 1;
      const start = playlogTurnStart();
      const startDifference = Order3Notes.firstDifference({ turn: record.turn, start: record.start }, start);
      if (startDifference) return diverged(record.turn, "start", startDifference);
      const isTarget = record.turn === targetTurn;
      if (isTarget && comment?.phase === "planning") {
        const scene = replayCommentView(start, comment);
        return scene.divergence ? diverged(record.turn, "comment", scene.divergence) : done("verified", { state: scene.state });
      }
      if (!record.commit) {
        if (!last) return done("not-replayable", { reason: `turn ${record.turn} has no commit but later turns exist` });
        // The still-planning last turn has its start checked but is not counted among verifiable turns.
        if (isTarget) return done("verified", { state: replayView(start, null) });
        if (targetTurn === null) openState = replayView(start, null);
        break;
      }
      const rebuilt = replayRebuildQueue(record.commit.queue, record.commit.handOrder);
      if (rebuilt.divergence) return diverged(record.turn, "commit", rebuilt.divergence, "commit.");
      const forecast = predictTimeline();
      if (eventIndex !== null && isTarget && !forecast.snapshots[eventIndex]) return done("not-replayable", { reason: `event ${eventIndex} out of range` });
      game.activeForecast = forecast;
      game.phase = "resolving";
      clearSelection();
      game.timelineCursor = forecast.snapshots.length - 1;
      game.previewIndex = forecast.snapshots.length - 1;
      applyCombatState(forecast.snapshots[forecast.snapshots.length - 1].state);
      const { turn, ...result } = playlogTurnResult(forecast);
      const view = isTarget ? replayView(start, forecast, comment ? comment.context.preview.eventIndex : eventIndex) : null;
      if (!record.result) {
        // Reload during resolution or a stopped recorder: the turn replays but nothing confirms it.
        incompleteTurns += 1;
        return done("incomplete", { divergence: { turn: record.turn, phase: "incomplete", path: "result", expected: null, actual: result },
          state: isTarget && !comment ? view : null, reason: `turn ${record.turn} has a commit but no recorded result` });
      }
      const resultDifference = Order3Notes.firstDifference(record.result, result);
      if (resultDifference) return diverged(record.turn, "result", resultDifference, "result.");
      completeResolvedTurn(forecast);
      verifiedTurns += 1;
      if (isTarget && comment?.phase === "resolving") {
        return done("verified", { state: { ...view, commentId: comment.commentId, phase: comment.phase, preview: comment.context.preview } });
      }
      if (isTarget && !comment) return done("verified", { state: view });
      if (game.phase === "ended" && !last) return done("not-replayable", { reason: `battle ended at turn ${record.turn} but later turns exist` });
    }
    if (targetTurn === null) {
      const replayed = game.phase === "ended" ? battleResult() : "playing";
      // A truncated run may have ended after its last recorded turn, so only its recorded turns can be checked. The exemption needs the
      // full turn limit with a committed and resolved last turn, which is the only shape the recorder truncates.
      const lastRecord = run.turns.at(-1);
      const truncatedAtLimit = run.truncated && run.turns.length === Order3Notes.PLAYLOG_LIMITS.turns && Boolean(lastRecord.commit) && Boolean(lastRecord.result);
      if (run.status !== replayed && !(truncatedAtLimit && replayed === "playing")) {
        return diverged(run.turns.at(-1).turn, "status", { path: "status", expected: run.status, actual: replayed });
      }
    }
    if (openState) return done("verified", { state: openState });
    const final = { turn: game.turn, phase: game.phase, battle: battleResult(), final: cloneCombatState(game) };
    if (comment) return done("verified", { state: Order3Notes.clone({ ...final, commentId: comment.commentId, preview: comment.context.preview }) });
    return done("verified", { state: Order3Notes.clone(final) });
  } finally {
    playlog.suspended = false;
  }
}

resetGame();
syncModalInteraction();
focusModalPrimary();
