const SIZE = 6;
const GAME_VERSION = "ACT 15";
const SPEED_ORDER = { fast: 0, normal: 1, slow: 2 };
const SPEED_LABEL = { fast: "FAST", normal: "NORMAL", slow: "SLOW" };
const WALLS = [{ x: 2, y: 2 }, { x: 3, y: 3 }];

// Display-only contracts. Combat resolution never reads this catalogue.
const effectRules = {
  distance: { name: "距離と移動", text: "射程は上下左右のマス数で、斜め1マスは距離2です。射程だけを使う技は壁や駒の向こうにも届きます。接近移動は壁・生存駒を通れず、対象に隣接する空いた経路を進みます。経路がなければ移動せず、同条件なら右→左→下→上を優先します。罠で止まっても、生存して対象と上下左右に隣接していれば移動後の攻撃は行います。" },
  targets: { name: "敵予告の対象", text: "敵の攻撃・庇護対象は予告時の人物で固定。移動後の位置を追いますが、倒れても別人へ選び直しません。災印は予告座標で固定し、生命吸収の回復先だけは技の実行時に選びます。最寄り・最遠の同距離では現在HPの少ない方を優先。それも同じなら、味方はルーク→ヴェイル→イオナ、敵は追跡獣→城壁兵→詠唱師の順です。" },
  orders: { name: "速度・命令・不発", text: "FAST→NORMAL→SLOW。同速度は味方が先、味方同士は登録順、敵同士は追跡獣→城壁兵→詠唱師。最大3命令で、同じ味方も複数回行動できます。対象選択はその命令直前の予測状態を基準にします。実行時の戦闘不能・対象消失・射程外・移動先占有では不発となり、カードと命令枠は戻りません。済んだ部分効果は巻き戻しません。割って入るは射程の再判定をしません。生存する味方または敵がいなくなると勝敗が決まり、残りの行動は取り消されます。" },
  damage: { name: "ダメージ・肩代わり", text: "技に記されたダメージは基本威力です。災印を元の対象の結界で防ぐ→肩代わり先を決める→実際の被害者の標的・露出を適用→装甲吸収→HP減少→条件を満たす近接反撃、の順に処理します。庇う側が生存し、指定した相手と上下左右に隣接する間、敵対側からのダメージを何度でも引き受けます。災印・罠・範囲攻撃の各被害も個別判定。付随する状態付与・解除は元の対象のままです。離れると一時中断し、同ターンに戻れば再び働きます。装甲0でも有効。新しい庇護対象への上書き・庇う側の戦闘不能・ターン末で終了します。" },
  guard: { name: "装甲", text: "加算され、ダメージを先に吸収して吸収分だけ減ります。残りはターン末で消えます。反撃姿勢中は残る装甲全体が次の城壁兵の行動開始まで持続します。柄打ちは指定した敵の装甲を全て解除します。" },
  ward: { name: "結界", text: "次の露出付与か災印ダメージを1回無効にして消費。未使用は次ターンへ持越し。盾の圧力の3ダメージ・生命吸収・通常攻撃・反撃は防ぎません。既にある露出は消さず、重ねても回数は増えません。" },
  rooted: { name: "移動不能", text: "敵のこのターンの接近移動を封じます。攻撃や装甲付与など残りの行動は取り消しません。元から上下左右に隣接していれば攻撃を受けます。ターン末で解除します。" },
  marked: { name: "標的（狩人の印）", text: "次の味方由来ダメージ+3。火種の罠と連鎖火花の本体分を含み、連鎖分は除きます。発動時に消費し、装甲で全吸収されても消費。未使用は持越し、重ねても威力や回数は増えません。肩代わり時は実際の被害者の標的を使い、元の対象の標的は消費しません。" },
  exposed: { name: "露出", text: "次の敵由来ダメージ+1。通常攻撃・反撃・災印の被害が対象です。発動時に消費し、装甲で全吸収されても消費。未使用は持越し、重ねても+2にはなりません。結界で災印を防いだ場合や肩代わりされた元の対象の露出は消費しません。" },
  charge: { name: "帯電", text: "敵がこのターンに実際に回復したHPを加算し、合計上限2。その敵を連鎖火花の対象にすると、上下左右への連鎖ダメージをこの値だけ増やします。攻撃直前に連鎖先が1体以上あれば全消費。斜めだけ・連鎖先なしなら残ります。未消費でもターン末で0になります。" },
  counter: { name: "反撃準備", text: "威力4、残り1回。近接攻撃を受けた後も城壁兵が生存し、生存する攻撃者と上下左右に隣接していると反撃します。元攻撃を装甲で全吸収しても発動。近接とは踏み込み斬り・柄打ちで、隣接して撃つ射撃や魔法では発動しません。庇護経由も同じ条件です。装甲0でも準備は残り、発動・城壁兵自身への柄打ち・次の城壁兵の行動開始で準備が終了します。" },
  legacy: { name: "遺志とALT", text: "持ち主が既に戦闘不能の手札は、元の技に代わる遺志として使えます。3種ともFAST、距離無制限。登録済みの固有技は途中で持ち主が倒れても遺志に自動変換せず不発です。遺志の対象が実行前に倒れても不発。全カードは遺志も含め、効果の代わりにFASTのALT移動へ変換できます。生存味方がいなくなると敗北です。" },
  turn: { name: "次ターンと最終予測", text: "最終予測は全行動直後で、ターン末の解除や次のドローより前です。余った手札と使用カードは捨て札へ。山札が空なら捨て札を混ぜて5枚まで引き直します。通常装甲・移動不能・庇護・帯電はターン末で解除。結界・標的・露出、未発動の罠と災印は残ります。反撃姿勢の装甲と未使用反撃は次の城壁兵の行動開始まで残ります。" }
};

const effectCatalog = {
  stalk: {
    name: "忍び寄る", speed: "fast", group: "enemy",
    short: "対象へ最大2マス接近し、上下左右に隣接すれば2ダメージ。",
    detail: ["予告時に距離が最短の生存味方を選び、固定した対象の実行時位置へ追います。空いた経路を通り、隣接位置で止まります。移動不能・罠で止まっても生存・隣接なら攻撃し、届かなければ攻撃しません。"], rules: ["targets", "distance", "damage", "rooted", "orders"]
  },
  pounce: {
    name: "飛びかかり", speed: "normal", group: "enemy",
    short: "対象へ最大3マス接近し、上下左右に隣接すれば4ダメージ。",
    detail: ["予告時に距離が最長の生存味方を固定し、実行時の位置へ追います。壁や駒を飛び越えません。移動不能・罠で止まっても生存・隣接なら攻撃し、届かなければ攻撃しません。"], rules: ["targets", "distance", "damage", "rooted", "orders"]
  },
  recover: {
    name: "息を整える", speed: "slow", group: "enemy",
    short: "最初から対象と上下左右に隣接していれば2ダメージ。離れていれば最大1マス接近し、攻撃はしない。",
    detail: ["予告時の最寄りの生存味方を固定します。隣接の判定はこの技の開始時。移動して隣接しても攻撃しません。HP回復や移動不能への耐性変化はありません。"], rules: ["targets", "distance", "damage", "rooted", "orders"]
  },
  cover: {
    name: "庇護", speed: "fast", group: "enemy",
    short: "対象に装甲+4。発動時に上下左右で隣接していれば、このターンその敵を庇う。",
    detail: ["予告時に城壁兵以外の生存敵から現在HP最少の1体を固定します。満タンも候補で、他に敵がいなければ自身。距離制限なしで、隣接できなくても装甲は付与します。", "発動時に隣接して成立した庇護は、城壁兵が生存・隣接中、その敵への味方由来ダメージを何度でも肩代わりします。後から近づくだけでは新規成立しません。ターン末で庇護は終了します。"], rules: ["targets", "guard", "damage", "orders"]
  },
  shield_drive: {
    name: "盾の圧力", speed: "normal", group: "enemy",
    short: "対象へ最大1マス接近。上下左右に隣接すれば3ダメージを与え、対象に露出を付与。",
    detail: ["予告時の最寄りの生存味方を固定。移動後も城壁兵と対象が生存し、上下左右に隣接する場合だけ攻撃します。罠で城壁兵が倒れれば攻撃も露出も不発です。", "ダメージ後に元の対象が生存していれば露出を付与。肩代わりされても露出は元の対象へ。結界は露出だけを防いで消費します。新しい露出はこの3ダメージを増やさず、次の敵由来ダメージを+1します。"], rules: ["targets", "distance", "damage", "ward", "exposed", "orders"]
  },
  brace: {
    name: "反撃姿勢", speed: "slow", group: "enemy",
    short: "自身に装甲+6と近接反撃4を1回準備。次の自分の行動開始まで持続。",
    detail: ["装甲は加算され、残る装甲全体と未使用の反撃が次の城壁兵の行動開始まで続きます。近接攻撃後も生存し、攻撃者に上下左右で隣接していれば4ダメージで反撃して準備を消費します。", "城壁兵自身への柄打ちはダメージより先に反撃を解除します。射撃・魔法は隣接していても反撃の対象外です。"], rules: ["guard", "counter", "damage", "turn"]
  },
  inscribe: {
    name: "災印を刻む", speed: "fast", group: "enemy",
    short: "予告マスに災印を設置。次ターンの起爆で、そのマスにいる味方へ各4ダメージ。",
    detail: ["予告時に装甲が最少の生存味方を中心にし、同装甲なら現在HP最少を優先。中心と上下左右の最大5マスから壁・盤外を除いた座標で固定します。距離制限はありません。", "中心人物の移動や戦闘不能を追わず、既存の災印配置を置き換えます。設置時はダメージなし。柄打ちで取り消す詠唱ではありません。次ターンの起爆には詠唱師の生存など実行条件が必要で、詠唱師が倒れても設置済みの災印は残ります。"], rules: ["targets", "orders", "turn"]
  },
  detonate: {
    name: "災印起爆", speed: "slow", group: "enemy",
    short: "災印上の味方全員に地形ダメージ4。発動前の柄打ちで取り消せる。",
    detail: ["距離に関係なく、実行時に災印上にいる生存味方だけに被害を与えます。敵には当たりません。結界はその味方の地形ダメージを1回防いで消費します。", "通常起爆・柄打ちによる取消では、この起爆イベントの順番で災印を全て消します。詠唱師が戦闘不能なら不発ですが、その理由だけでは災印は消えません。柄打ちが取り消す詠唱は現在この技だけです。"], rules: ["damage", "ward", "exposed", "orders", "turn"]
  },
  drain: {
    name: "生命吸収", speed: "normal", group: "enemy",
    short: "対象に2ダメージ。負傷した敵のうちHP最少の1体を最大2回復＋実回復分の帯電（合計上限2）。",
    detail: ["攻撃対象：予告時に現在HPが最も少ない生存味方1人を固定し、距離に関係なく2ダメージ。予告後に対象を選び直しません。", "回復先：攻撃処理の後、実行時に生存している負傷した敵のうち現在HPが最も少ない1体を最大2回復します。詠唱師自身も対象。回復した敵に、実際に回復したHPと同じ値の帯電を加算します（合計上限2）。回復先は実行時に決定します。", "攻撃対象が実行前に戦闘不能なら、攻撃・回復・帯電は全て不発。装甲や肩代わりで対象のHPが減らなくても回復します。この攻撃で対象を倒した場合も回復します。敵全員が満タンなら回復0・帯電加算0、回復余地が1なら回復1・帯電+1、2以上なら回復2・帯電+2（既存分との合計上限2）。", "同じ現在HPなら攻撃対象はルーク→ヴェイル→イオナ、回復先は追跡獣→城壁兵→詠唱師の順です。帯電は連鎖火花の上下左右への連鎖を増幅し、連鎖先があれば全消費。未消費でもターン末で消えます。"], rules: ["charge", "damage", "targets", "orders"]
  },
  forward_cut: {
    name: "踏み込み斬り", speed: "normal", group: "card",
    short: "射程2。距離2なら上下左右へ1マス接近し、隣接した敵に近接3ダメージ。",
    detail: ["生存敵1体が対象。最初から上下左右に隣接なら移動せず攻撃します。距離2でも通れる経路がなければ接近できず、接近後に隣接していなければ攻撃は不発。済んだ移動は巻き戻しません。斜めのまま攻撃はしません。"], rules: ["distance", "damage", "counter", "orders", "legacy"]
  },
  interpose: {
    name: "割って入る", speed: "fast", group: "card",
    short: "対象：2マス以内の他の味方。最大2マス接近し、届かなくても両者に装甲+2。",
    detail: ["生存する他の味方へ空いた経路を進み、隣接位置で止まります。既に隣接なら移動なし。接近が成立しなくても両者へ装甲を加算します。", "対象が登録後に遠ざかっても、実行時の射程再判定をせず接近と付与を行います。装甲はターン末まで。この技は肩代わりを付与しません。"], rules: ["distance", "guard", "orders", "legacy"]
  },
  shield_lock: {
    name: "盾を固める", speed: "fast", group: "card",
    short: "自身に装甲+5。このターン、発動時に上下左右へ隣接する味方1人へのダメージを、隣接中は何度でも肩代わり。",
    detail: ["自身が対象。発動時に隣接する生存味方からヴェイル→イオナの順で1人を自動選択して固定します。隣接味方がいなければ装甲だけ。後から近づくだけでは新規成立しません。", "離れている間は中断し、同ターン内に隣接へ戻れば復活。装甲0でも生存・隣接なら肩代わりを続けます。ダメージだけを引き受け、付随する露出は元の対象へ。装甲と庇護はターン末に終了します。"], rules: ["guard", "damage", "orders", "legacy"]
  },
  pommel_break: {
    name: "柄打ち", speed: "normal", group: "card",
    short: "上下左右に隣接する敵の装甲と反撃準備を解除し、近接2ダメージ。このターン後で行う、その敵の災印起爆も取り消す。",
    detail: ["射程1、生存敵1体が対象。装甲・反撃準備・装甲の持続を先に解除してからダメージを与えます。", "取り消せるのはこのターンに後で行う対象の災印起爆だけ。災印設置・生命吸収は取り消さず、既に済んだ起爆や未来ターンへ解除を予約しません。取消済み災印が消えるのは起爆イベントの順番です。", "庇護時も解除は指定した元の敵へ。ダメージだけが城壁兵へ移るため、城壁兵側の装甲・反撃準備まで解除しません。その城壁兵が生存し攻撃者に隣接していれば反撃を受けます。"], rules: ["damage", "guard", "counter", "orders", "legacy"]
  },
  quickshot: {
    name: "速射", speed: "fast", group: "card", short: "射程3。敵1体に2ダメージ。",
    detail: ["生存敵の実行時位置で射程を再判定します。壁や駒による射線遮断なし。隣接して撃っても近接反撃の対象外です。状態や詠唱を直接解除せず、撃破による後続行動取消とは区別します。"], rules: ["distance", "damage", "orders", "legacy"]
  },
  pinning_arrow: {
    name: "縫い留め", speed: "fast", group: "card",
    short: "射程4。敵1体に1ダメージ。対象が生存していれば、このターンの接近移動を封じる。",
    detail: ["生存敵の実行時位置で射程を再判定。ダメージ後に元の対象が生存していれば移動不能を付与し、肩代わり先へは移しません。全ダメージを装甲で吸収されても付与します。", "攻撃や他の行動は取り消さず、元から隣接していれば攻撃を受けます。移動不能はターン末で解除します。"], rules: ["distance", "damage", "rooted", "orders", "legacy"]
  },
  backstep_shot: {
    name: "離脱射撃", speed: "normal", group: "card",
    short: "射程3。敵1体に2ダメージ後、上下左右の空きマスのうち対象から最も遠いマスへ1マス移動。",
    detail: ["生存敵の実行時位置で射程を再判定。射撃は近接反撃の対象外。空き隣接マスがなければ攻撃だけです。", "移動先は自動で決まり、対象を倒してもその元の位置を基準にします。遠ざかれる空きマスがなければ近づく場合もあります。同距離の候補は右→左→下→上の順です。"], rules: ["distance", "damage", "orders", "legacy"]
  },
  hunters_mark: {
    name: "狩人の印", speed: "slow", group: "card",
    short: "射程4。敵1体に標的を付与。次の味方由来のダメージ+3（連鎖火花の連鎖分を除く）。",
    detail: ["生存敵の実行時位置で射程を再判定。付与自体にダメージはなく、発動時に消費、未発動は次ターンへ持ち越します。重ねても+6や回数追加にはなりません。"], rules: ["marked", "distance", "damage", "orders", "legacy"]
  },
  arc_spark: {
    name: "連鎖火花", speed: "slow", group: "card",
    short: "射程3。敵1体に3ダメージ、その上下左右の敵全員に2＋対象の帯電（最大4）ダメージ。連鎖先があれば対象の帯電を全消費。",
    detail: ["生存敵の実行時位置で射程を再判定。本体攻撃の直前に、対象の帯電と上下左右の生存敵を決めます。元の対象を倒しても連鎖し、斜めや二段先へは連鎖しません。", "本体分には標的が働きますが、連鎖分では標的を加算・消費しません。連鎖先なしなら帯電は残ります。中心と帯電は指定した対象のもので、肩代わり先へ中心は移りません。各ダメージに装甲と肩代わりが個別に働きます。"], rules: ["charge", "marked", "distance", "damage", "orders", "legacy"]
  },
  phase_step: {
    name: "位相交換", speed: "fast", group: "card", short: "射程3。自身と他の味方1人の位置を交換。",
    detail: ["自身と対象の両方が生存している必要があり、実行時の位置で射程を再判定します。敵や任意の味方2人同士は選べません。", "交換は経路を通らず、途中の壁や駒を飛び越えます。HPや状態は各人物に残り、交換後の庇護は隣接条件で決まります。"], rules: ["distance", "damage", "orders", "legacy"]
  },
  null_sigil: {
    name: "無効印", speed: "fast", group: "card",
    short: "射程3。自身を含む味方1人に結界。次の露出付与か災印ダメージを1回無効化。",
    detail: ["生存味方の実行時位置で射程を再判定。結界は無効化時に消費し、未使用は次ターンへ持越し。既にある露出は治療せず、重ねても回数は増えません。"], rules: ["ward", "distance", "orders", "legacy"]
  },
  ember_rune: {
    name: "火種の罠", speed: "normal", group: "card",
    short: "射程3の空きマスに罠を設置。敵が踏むと3ダメージ、その移動の残りを止め、罠1個が消滅。",
    detail: ["実行時にも射程と空きマスを確認。味方が踏んでも発動せず、未発動なら次ターン以降も残ります。同じ空きマスへ重ね置きでき、入るたびに1個だけ発動します。駒や壁がなければ、罠のあるマスも設置・移動に使えます。", "移動不能を付けず、その移動だけを止めます。停止後も敵が生存して対象へ隣接していれば移動後攻撃は残ります。ダメージは標的・装甲・城壁兵の庇護の対象ですが、肩代わりされても止まるのは踏んだ敵です。術者が倒れても設置済み罠は残ります。"], rules: ["distance", "damage", "marked", "orders", "turn", "legacy"]
  },
  legacy_rook: {
    name: "遺志：守護", speed: "fast", group: "legacy",
    short: "距離に関係なく、生存中の味方1人に装甲+2。ターン終了で消える。",
    detail: ["ルークの遺志。肩代わりは付与しません。対象が実行前に戦闘不能なら不発です。"], rules: ["guard", "legacy", "orders"]
  },
  legacy_vale: {
    name: "遺志：照準", speed: "fast", group: "legacy",
    short: "距離に関係なく、敵1体に標的。次の味方由来ダメージ+3（連鎖火花の連鎖分を除く）。発動時消費、未発動は持越し。",
    detail: ["ヴェイルの遺志。生存敵1体へ付与し、付与自体のダメージはありません。対象が実行前に戦闘不能なら不発です。"], rules: ["marked", "damage", "legacy", "orders"]
  },
  legacy_iona: {
    name: "遺志：残響", speed: "fast", group: "legacy",
    short: "距離に関係なく、生存中の味方1人に結界。次の露出付与か災印ダメージを1回無効化し、未使用なら持越し。",
    detail: ["イオナの遺志。対象が実行前に戦闘不能なら不発です。"], rules: ["ward", "legacy", "orders"]
  },
  move: {
    name: "ALT：移動命令", speed: "fast", group: "common",
    short: "固有技・遺志の代わりに、任意の生存味方を上下左右の空きマスへ1マス移動。FAST。",
    detail: ["カードの持ち主や元の速度に関係なく使えます。動かす味方と移動先を順に選び、固有技・遺志の効果は発生しません。実行時に動かす味方が戦闘不能、移動先が隣接外・占有済みなら不発です。壁や駒を通り抜けません。"], rules: ["distance", "orders", "legacy"]
  }
};

const cardDefs = {
  forward_cut: {
    ownerId: "rook", name: "踏み込み斬り", speed: "normal",
    text: effectCatalog.forward_cut.short,
    target: "enemy", range: 2, categories: ["attack", "mobility"]
  },
  interpose: {
    ownerId: "rook", name: "割って入る", speed: "fast",
    text: effectCatalog.interpose.short,
    target: "allyOther", range: 2, categories: ["defense", "mobility"]
  },
  shield_lock: {
    ownerId: "rook", name: "盾を固める", speed: "fast",
    text: effectCatalog.shield_lock.short,
    target: "self", range: 0, categories: ["defense"]
  },
  pommel_break: {
    ownerId: "rook", name: "柄打ち", speed: "normal",
    text: effectCatalog.pommel_break.short,
    target: "enemy", range: 1, categories: ["control", "attack"]
  },
  quickshot: {
    ownerId: "vale", name: "速射", speed: "fast",
    text: effectCatalog.quickshot.short,
    target: "enemy", range: 3, categories: ["attack"]
  },
  pinning_arrow: {
    ownerId: "vale", name: "縫い留め", speed: "fast",
    text: effectCatalog.pinning_arrow.short,
    target: "enemy", range: 4, categories: ["control", "attack"]
  },
  backstep_shot: {
    ownerId: "vale", name: "離脱射撃", speed: "normal",
    text: effectCatalog.backstep_shot.short,
    target: "enemy", range: 3, categories: ["attack", "mobility"]
  },
  hunters_mark: {
    ownerId: "vale", name: "狩人の印", speed: "slow",
    text: effectCatalog.hunters_mark.short,
    target: "enemy", range: 4, categories: ["control"], categoryDetail: "印"
  },
  arc_spark: {
    ownerId: "iona", name: "連鎖火花", speed: "slow",
    text: effectCatalog.arc_spark.short,
    target: "enemy", range: 3, categories: ["attack"]
  },
  phase_step: {
    ownerId: "iona", name: "位相交換", speed: "fast",
    text: effectCatalog.phase_step.short,
    target: "allyOther", range: 3, categories: ["mobility"]
  },
  null_sigil: {
    ownerId: "iona", name: "無効印", speed: "fast",
    text: effectCatalog.null_sigil.short,
    target: "ally", range: 3, categories: ["defense"]
  },
  ember_rune: {
    ownerId: "iona", name: "火種の罠", speed: "normal",
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
    detail: unit => unit.persistentGuard
      ? `装甲${unit.guard}。反撃姿勢の残りは次の城壁兵の行動開始まで。${effectRules.guard.text}`
      : `装甲${unit.guard}。${effectRules.guard.text}`
  },
  ward: {
    order: 2, label: "結界", short: () => "結",
    active: unit => unit.ward === true, shape: "double-ring", tone: "violet",
    detail: () => effectRules.ward.text
  },
  rooted: {
    order: 3, label: "移動不能", short: () => "鎖",
    active: unit => unit.rooted === true, shape: "linked-square", tone: "blue",
    detail: () => effectRules.rooted.text
  },
  marked: {
    order: 4, label: "標的（狩人の印）", short: () => "標",
    active: unit => unit.marked === true, shape: "crosshair-circle", tone: "yellow",
    detail: () => effectRules.marked.text
  },
  exposed: {
    order: 5, label: "露出", short: () => "露",
    active: unit => unit.exposed === true, shape: "warning-triangle", tone: "rose",
    detail: () => effectRules.exposed.text
  },
  charge: {
    order: 6, label: "帯電", short: unit => `⚡${unit.charge}`,
    active: unit => unit.charge > 0, shape: "lightning", tone: "orange",
    detail: unit => `帯電${unit.charge}。${effectRules.charge.text}`
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

// Short-lived reading state, outside combat and opt-in note scenes.
const movementUI = { battleGeneration: 0, queueGeneration: 0, open: new Set(), returnTo: null };

function movementPlanToken() {
  return `${movementUI.battleGeneration}:${game.turn}:${movementUI.queueGeneration}`;
}

function clearMovementReading(newPlan = false, newBattle = false) {
  if (newBattle) movementUI.battleGeneration += 1;
  if (newPlan) movementUI.queueGeneration += 1;
  movementUI.open.clear();
  movementUI.returnTo = null;
}

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
  clearMovementReading(true, true);
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
        effectCatalog.stalk.short));
    } else if (phase === 1) {
      const target = farthestUnit(pursuer, players);
      intents.push(intent(pursuer, "pounce", "飛びかかり", "normal", target,
        effectCatalog.pounce.short));
    } else {
      const target = nearestUnit(pursuer, players);
      intents.push(intent(pursuer, "recover", "息を整える", "slow", target,
        effectCatalog.recover.short));
    }
  }

  const bastion = getUnit("bastion");
  if (bastion.hp > 0) {
    const phase = (game.turn - 1) % 3;
    if (phase === 0) {
      const allies = living("enemy").filter(unit => unit.id !== "bastion");
      const target = [...allies].sort((a, b) => a.hp - b.hp)[0] || bastion;
      intents.push(intent(bastion, "cover", "庇護", "fast", target,
        effectCatalog.cover.short));
    } else if (phase === 1) {
      const target = nearestUnit(bastion, players);
      intents.push(intent(bastion, "shield_drive", "盾の圧力", "normal", target,
        effectCatalog.shield_drive.short));
    } else {
      intents.push(intent(bastion, "brace", "反撃姿勢", "slow", bastion,
        effectCatalog.brace.short));
    }
  }

  const cantor = getUnit("cantor");
  if (cantor.hp > 0) {
    const phase = (game.turn - 1) % 3;
    if (phase === 0) {
      const target = [...players].sort((a, b) => a.guard - b.guard || a.hp - b.hp)[0];
      const cells = [target, ...neighbors(target)].filter(cell => !isWall(cell.x, cell.y));
      const result = intent(cantor, "inscribe", "災印を刻む", "fast", target,
        effectCatalog.inscribe.short, cells, { targetKind: "cells" });
      intents.push(result);
    } else if (phase === 1) {
      intents.push(intent(cantor, "detonate", "災印起爆", "slow", null,
        effectCatalog.detonate.short, [...game.hostileRunes],
        { targetKind: "cells", channel: true }));
    } else {
      const target = [...players].sort((a, b) => a.hp - b.hp)[0];
      intents.push(intent(cantor, "drain", "生命吸収", "normal", target,
        effectCatalog.drain.short));
    }
  }
  return intents;
}

function intent(actor, id, name, speed, target, description, cells = [], options = {}) {
  return { actorId: actor.id, id, name, speed, targetId: target?.id || null, description, cells, ...options };
}

function selectCard(instanceId) {
  if (game.phase !== "planning" || game.queue.length >= 3) return;
  clearMovementReading();
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
  clearMovementReading();
  game.mode = mode;
  game.moveUnitId = null;
  render();
}

function getLegacy(ownerId) {
  if (ownerId === "rook") return { name: "遺志：守護", text: effectCatalog.legacy_rook.short, target: "ally", speed: "fast", categories: ["defense"] };
  if (ownerId === "vale") return { name: "遺志：照準", text: effectCatalog.legacy_vale.short, target: "enemy", speed: "fast", range: 99, categories: ["control"], categoryDetail: "印" };
  return { name: "遺志：残響", text: effectCatalog.legacy_iona.short, target: "ally", speed: "fast", categories: ["defense"] };
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
  clearMovementReading(true);
  game.previewIndex = null;
  clearSelection();
  render();
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

function resolveSimEnemy(state, event, outcome, collectMovement = false) {
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
      const evidence = startMovementEvidence(outcome, event, actor, target, 1, "start", collectMovement);
      if (movementAttackCondition(evidence, "adjacent", isOrthogonallyAdjacent(actor, target))) {
        if (evidence) evidence.attack.performed = true;
        simDealDamage(state, target.id, 2, actor.id, { hostile: true, melee: true }, outcome);
      }
      else simMoveToward(state, actor, target, 1, outcome, evidence);
      return outcome;
    }
    case "cover":
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "庇護対象が戦闘不能");
      target.guard += 4;
      actor.coveringId = isOrthogonallyAdjacent(actor, target) ? target.id : null;
      return outcome;
    case "shield_drive": {
      if (!target || target.hp <= 0) return cancelOutcome(outcome, "対象が戦闘不能");
      const evidence = startMovementEvidence(outcome, event, actor, target, 1, "after_move", collectMovement);
      simMoveToward(state, actor, target, 1, outcome, evidence);
      if (movementAttackCondition(evidence, "actorAlive", actor.hp > 0) && movementAttackCondition(evidence, "targetAlive", target.hp > 0) && movementAttackCondition(evidence, "adjacent", isOrthogonallyAdjacent(actor, target))) {
        if (evidence) evidence.attack.performed = true;
        simDealDamage(state, target.id, 3, actor.id, { hostile: true, melee: true }, outcome);
        if (target.hp > 0 && !simConsumeWard(target, "露出", outcome)) target.exposed = true;
      }
      return outcome;
    }
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
    const fired = outcome.logs?.some(log => log.startsWith(`${unit.name}の反撃。`));
    const cleared = event.kind === "player" && event.payload.mode === "technique"
      && event.payload.cardId === "pommel_break" && event.payload.targetId === unit.id;
    const ended = outcome.logs?.includes(`${unit.name}の反撃姿勢が終了。`);
    const reason = fired ? "反撃が発動" : cleared ? "柄打ちで反撃準備を解除" : ended ? "次の行動で反撃準備が終了" : "反撃準備が終了";
    groups.push({
      type: ready ? "counter_ready" : fired ? "counter_fired" : cleared ? "counter_cleared" : "counter_end", priority: 60,
      summary: ready ? `${unit.name} 反撃${unit.counter}を準備` : `${unit.name}：${reason}`,
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

  const runeCells = new Map([...before.emberRunes, ...after.emberRunes].map(cell => [keyOf(cell), cell]));
  for (const [key, cell] of runeCells) {
    const oldCount = before.emberRunes.filter(item => keyOf(item) === key).length;
    const newCount = after.emberRunes.filter(item => keyOf(item) === key).length;
    if (oldCount === newCount || !oldCount || !newCount) continue;
    groups.push({ type: "zone_count", priority: 50,
      summary: `火種の罠 ${cellLabel(cell)} 設置数${oldCount}→${newCount}`,
      details: [`同じマスの罠は1回の進入で1個だけ発動。残り${newCount}個`] });
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
    if (simBattleResult(state)) cancelOutcome(outcome, "戦闘終了");
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
  clearMovementReading(true);
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
  clearMovementReading(true);
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
  clearMovementReading(true);
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

function auxiliaryStatusDetails(unit) {
  const details = [];
  if (unit.hp <= 0) return details;
  if (unit.coveringId) {
    const target = timelineDisplayContext().state.units.find(item => item.id === unit.coveringId);
    const active = target?.hp > 0 && isOrthogonallyAdjacent(unit, target);
    details.push(`庇護：${unit.name}→${target?.name || unit.coveringId}。${active ? "隣接中・肩代わり有効" : "現在は肩代わりなし"}。${effectRules.damage.text}`);
  }
  if (unit.counter > 0) details.push(`反撃：威力${unit.counter}、残り1回、次の自分の行動開始まで。${effectRules.counter.text}`);
  return details;
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
  if (statuses.length || auxiliaryStatusDetails(unit).length) {
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
      <span class="card-detail-hint">選択後、実行順の下で効果詳細 ▾</span>
      <div class="card-bottom">
        <span class="card-move${moveMode ? " active-use-mode" : ""}">${moveMode ? `${categoryIconSvg("mobility")}<b>使用中：移動命令</b>` : "ALT：味方を1マス移動"}</span>
        ${isLegacy ? `<span class="legacy-tag">LEGACY · FAST</span>` : `<span class="speed ${shown.speed}">${SPEED_LABEL[shown.speed]}</span>`}
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
        ${renderEffectDetails(item.id, `intent-${item.actorId}`)}
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
    <summary>${indexEntry ? `${effect.name} · ${SPEED_LABEL[effect.speed]}` : `効果詳細：${effect.name}`}</summary>
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
    const effectText = effectCatalog[effectIdForEvent(event)]?.short || event.payload.description || "";
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
      effectText,
      "効果詳細を開く",
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
      <span class="timeline-side">${sideLabel}</span>
      <span class="timeline-name">${view.name}</span>
      <span class="timeline-action">${cancelled ? "取消：" : ""}${view.action}</span>
      <span class="speed ${event.speed}">${SPEED_LABEL[event.speed]}</span>
      <span class="timeline-target">対象：${targetLabel}</span>
      ${effectText ? `<span class="timeline-effects"><span>${highlightIntentClause(escapeEffectText(effectText))}</span></span>` : ""}
      <span class="timeline-detail-hint">効果詳細 ▾</span>
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
      el.timeline.querySelector?.(`[data-event-key="${event.key}"]`)?.focus({ preventScroll: true });
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
  return `${String(index + 1).padStart(2, "0")} ${view.name}「${view.action}」`;
}

function renderMovementEvidence(forecast, index) {
  if (game.phase !== "planning" || game.selectedInstanceId || !game.queue.length) return "";
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
  if (evidence.movementEnd === "rooted") end = "<p>移動不能により移動処理を終了。経路は探索していません。</p>";
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
      movementUI.returnTo = { token, fromKey, toKey: origin.eventKey, ordinal: Number(button.dataset.movementOrigin) };
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
      <div class="timeline-detail-title"><span>この命令の直前</span><b>ORDER ${String(selection.eventIndex + 1).padStart(2, "0")} / ${SPEED_LABEL[selection.action.speed]}</b></div>
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
    <div class="timeline-detail-title" id="timeline-detail-heading" tabindex="-1"><span>TURN ${String(game.turn).padStart(2, "0")} · ${String(detailIndex + 1).padStart(2, "0")} ${view.name}｜${view.action}</span><b>${outcome ? (game.phase === "planning" ? "現在計画の予測・行動直後" : "実行・行動直後") : "効果説明"}</b></div>
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
    el.modeHelp.textContent = legacy
      ? "持ち主が倒れたため、遺志として使用"
      : `${SPEED_LABEL[shown.speed]}で解決。効果詳細は実行順の下で確認できます。`;
    el.instruction.textContent = `この命令の直前：${shown.name}の対象を選んでください。`;
  }
}

let modalReturnFocus = null;
let helpReturnModal = null;

function showModal(title, body, buttonText, action = "close") {
  // A new briefing/result supersedes any presentation saved beneath Help.
  helpReturnModal = null;
  if (el.modal.dataset.help !== "true") modalReturnFocus = document.activeElement;
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = body;
  el.modalButton.textContent = buttonText;
  el.modal.dataset.action = action;
  el.modal.dataset.help = "false";
  el.modal.hidden = false;
  el.modalBody.scrollTop = 0;
  el.modalButton.focus?.();
}

function showHelp() {
  if (!el.modal.hidden && el.modal.dataset.help === "true") return;
  const previous = el.modal.hidden ? null : {
    title: el.modalTitle.textContent,
    body: el.modalBody.innerHTML,
    buttonText: el.modalButton.textContent,
    action: el.modal.dataset.action,
    scrollTop: el.modalBody.scrollTop,
    returnFocus: modalReturnFocus
  };
  showModal("命令の組み方", `
    <div class="brief-step"><b>1</b><span>カードをクリックし、光っている対象マスを選びます。</span></div>
    <div class="brief-step"><b>2</b><span>FAST → NORMAL → SLOWの順に解決。同速度では味方が先です。</span></div>
    <div class="brief-step"><b>3</b><span>カードを移動命令へ変える場合は、味方と移動先を順に選びます。</span></div>
    <p>駒の下部には、上段へ装甲・結界・移動不能、下段へ標的・露出・帯電を固定位置で表示します。</p>
    <p>駒にポインターを重ねるか、キーボードでマスを選ぶと、盤面の下に有効な状態の詳しい説明が出ます。</p>
    <p>技の「効果詳細」では規則を、実行順の「この計画の予測結果」では装甲・肩代わりなどを適用した変化を読めます。詳細の開閉だけでは命令を登録しません。</p>
    <details class="help-section"><summary>距離と移動・命令</summary>${["distance", "targets", "orders"].map(renderRuleDetails).join("")}${renderEffectDetails("move", "help", true)}</details>
    <details class="help-section"><summary>ダメージ・肩代わり・反撃</summary>${["damage", "counter"].map(renderRuleDetails).join("")}</details>
    <details class="help-section"><summary>状態と次ターン</summary>${["guard", "ward", "rooted", "marked", "exposed", "charge", "turn", "legacy"].map(renderRuleDetails).join("")}</details>
    <details class="help-section technique-index"><summary>全ての技の説明（敵9・カード12・遺志3）</summary>
      ${[["enemy", "敵の9技"], ["card", "味方の12カード"], ["legacy", "3つの遺志"]].map(([group, title]) => `<section><h3>${title}</h3>${Object.entries(effectCatalog).filter(([, effect]) => effect.group === group).map(([id]) => renderEffectDetails(id, "index", true)).join("")}</section>`).join("")}
    </details>
  `, "戦場へ戻る", "close");
  helpReturnModal = previous;
  el.modal.dataset.help = "true";
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
  if (el.modal.dataset.help === "true" && helpReturnModal) {
    const previous = helpReturnModal;
    showModal(previous.title, previous.body, previous.buttonText, previous.action);
    if (previous.action === undefined) delete el.modal.dataset.action;
    el.modalBody.scrollTop = previous.scrollTop;
    modalReturnFocus = previous.returnFocus;
    return;
  }
  helpReturnModal = null;
  const action = el.modal.dataset.action;
  if (action === "restart") resetGame();
  el.modal.hidden = true;
  el.modal.dataset.action = "close";
  el.modal.dataset.help = "false";
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus?.();
});

document.addEventListener("click", event => {
  const target = event.target;
  if (target?.closest?.(".unit-statuses") || target?.closest?.("#board-status-popover")) return;
  if (pinnedStatusPopover) closeStatusPopover(true);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && pinnedStatusPopover) closeStatusPopover(true);
  if (el.modal.hidden || event.target?.closest?.("#notes-dialog")) return;
  if (event.key === "Escape" && el.modal.dataset.action === "close") {
    event.preventDefault();
    el.modalButton.click?.();
  }
  if (event.key === "Tab" && el.modal.dataset.help === "true") {
    const controls = [...(el.modal.querySelectorAll?.("button, summary, [tabindex='0']") || [])]
      .filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!controls.includes(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault(); first?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    }
  }
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
