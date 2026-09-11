# ACT 09 技術成立性調査 — 灼熱のルーン「敵移動の踏破予告」

## 結論

実装可能性は高い。既存の純粋予測系を唯一の判定根拠にしつつ、灼熱のルーンの技選択中だけ、合法な各空きマスへ仮置きした候補ごとの未来を計算できる。

推奨する最小設計は次のとおり。

1. 1回の `render()` につき `selectionTimelineContext()` を1回だけ求め、その `state` と `events` を盤面・タイムライン・操作説明で共有する。
2. `simMoveToward()` が実際に入ったマスを、予測結果の構造化メタデータとして記録する。
3. 各合法マスについて `selection.state` を複製し、仮選択イベントから未解決部分だけを既存と同じイベント順で解決する。
4. 候補ルーンへプレビュー専用IDを付け、そのIDのルーンが最初に発火した敵移動イベントと歩数だけを表示する。

経路探索をUI側へ複製する必要はない。敵AI、罠の効果、行動順、経路選択規則にも変更は不要である。

## 現在の構造で利用できるもの

`selectionTimelineContext()` は、選択中カードから `provisionalActionForSelection()` を作り、現在のキューと合わせて `buildResolutionEvents()` で確定順へ並べる。その後、仮イベント直前まで `predictTimeline()` を進め、次を返している。

- `action`: 選択中の仮アクション
- `eventKey`: その仮イベントのキー
- `eventIndex`: 全ACTION ORDER内の位置（0始まり）
- `events`: 速度と同速規則を反映済みの全イベント列
- `state`: 仮イベントを解決する直前の純粋予測状態
- `snapshots`: そこまでの予測結果

したがって `state` には、選択中の命令より前に解決されるFASTイベントや同速先行イベントの結果がすでに入っている。候補計算は `eventIndex` から始めればよく、以前のイベントを表示対象へ混ぜずに済む。

`buildResolutionEvents()` が作った `events` を並べ直さず、そのまま使用することが重要である。これにより、速度順だけでなく、同速時の登録順と味方優先という現在の規則も完全に維持される。

## 1. 選択コンテキストを1回だけ共有する

現状は `renderBoard()`、`renderTimeline()`、`renderControls()` がそれぞれ選択コンテキストを求めうる。候補ごとの予測をそこへ直接足すと、1回の描画中に同じ高価な計算を複数回行う危険がある。

描画の入口で次のような一時モデルを1回だけ構築し、各描画関数へ渡すのが安全である。

```js
function buildSelectionRenderModel() {
  const selection = selectionTimelineContext();
  const legalCells = selection ? validCells(selection) : [];
  const emberPreview = buildEmberRunePreview(selection, legalCells);
  return { selection, legalCells, emberPreview };
}

function render() {
  const model = buildSelectionRenderModel();
  renderBoard(model);
  // 既存描画
  renderTimeline(model);
  renderControls(model);
}
```

`emberPreview` を作る条件は厳密に絞る。

- フェーズが計画中
- モードが技
- 選択カードが `ember_rune`
- 旧式カードなどの無効状態ではない
- 使用者が生存している
- `validCells(selection)` が1つ以上ある

このモデルは描画中だけ生きる値とし、モジュール全体へ永続キャッシュしない。そうすればカード切替、モード切替、選択解除、確定、解決開始、次ターン、戦闘終了では次の描画時に自然に空になり、無効化漏れを作らない。

## 2. 実際に入った移動マスを予測結果へ記録する

表示の根拠は `simPathToAdjacent()` の再計算ではなく、`simMoveToward()` が既存ルールで実際に採用し、順番に入ったセルでなければならない。

`simMoveToward()` の `outcome` へ、表示専用の構造化情報を追加する。

```js
const trace = {
  unitId: mover.id,
  entered: [],
  stoppedBy: null,
};
outcome.movements ??= [];
outcome.movements.push(trace);

for (const cell of path) {
  const from = { x: mover.x, y: mover.y };
  mover.x = cell.x;
  mover.y = cell.y;
  trace.entered.push({
    step: trace.entered.length + 1,
    from,
    to: { x: cell.x, y: cell.y },
  });

  if (simTriggerEmberRune(state, mover, outcome)) {
    trace.stoppedBy = "ember_rune";
    break;
  }
}
```

これは移動規則を変えない。既存の経路を、移動後では失われる前後座標と歩数を含めて観測可能にするだけである。

ログ文字列を解析して罠発火を判定してはいけない。`simTriggerEmberRune()` にも構造化結果を追加する。

```js
outcome.emberTriggers ??= [];
outcome.emberTriggers.push({
  runePreviewId: removedRune.previewRuneId ?? null,
  unitId: enemy.id,
  at: { x: enemy.x, y: enemy.y },
});
```

削除する前のルーンオブジェクトを保持してから記録し、現在の真偽値戻り値は維持する。これによりACT 08で決めた「罠が発火するとその移動を止める」という契約へ影響しない。

方向矢印は、記録した `from` と `to` の差から表示時に導出する。

- `to.x - from.x === 1`: `→`
- `to.x - from.x === -1`: `←`
- `to.y - from.y === 1`: `↓`
- `to.y - from.y === -1`: `↑`
- マンハッタン距離が1でない: 矢印なし

これは経路判断ではなく、既に確定した1歩の表示変換にすぎない。斜め移動を誤って表示しない防御にもなる。

## 3. 候補ごとの部分予測

### 共有する予測器

候補専用の解決ロジックは作らず、現在の `predictTimeline()` の1イベント解決ループを共通関数へ切り出す。

```js
function predictEventRange(initialState, events, startIndex, endIndex = events.length) {
  const state = cloneCombatState(initialState);
  const snapshots = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    // 現在の predictTimeline と同じ resolveSimPlayer / resolveSimEnemy を使う
    // events 全体と実際のグローバル index を渡す
    snapshots.push(resolveOneSimEvent(state, events, index));
  }

  return { final: state, snapshots };
}

function predictTimeline(events, eventLimit = events.length) {
  return predictEventRange(game, events, 0, eventLimit);
}
```

重要なのは、部分予測でも `events` 全体とグローバルな `index` を解決器へ渡すことである。チャネル妨害などが前後イベントやキャンセルキーを見る場合も、ローカル配列の0番へ詰め直すと意味が変わるためである。

`selection.state.cancelledEventKeys` には前半の解決結果が含まれる。それを候補ごとに `cloneCombatState()` して使えば、以前のFASTを再実行せず、その効果だけを正しく引き継げる。

### 各候補の処理

各合法セルについて次を行う。

1. `selection.action` を複製する。
2. `target` を候補座標へ置き換え、プレビュー専用の決定論的IDを付ける。
3. `selection.events` の配列を浅く複製し、`eventIndex` のイベントだけを複製した候補アクションへ差し替える。
4. `selection.state` を初期状態として、`eventIndex` から末尾まで解決する。
5. `eventIndex` より後の敵イベントから、候補IDのルーンが発火した最初の結果を探す。
6. 見つかればそのグローバルイベント番号、移動歩数、進入方向を候補セルへ関連付ける。なければ合法セルのまま無印にする。

概念コードは次のとおり。

```js
for (const cell of legalCells) {
  const previewId = `ember-preview:${cell.x},${cell.y}`;
  const candidateAction = {
    ...selection.action,
    target: { x: cell.x, y: cell.y, previewRuneId: previewId },
  };
  const candidateEvents = selection.events.slice();
  candidateEvents[selection.eventIndex] = {
    ...candidateEvents[selection.eventIndex],
    payload: candidateAction,
  };

  const forecast = predictEventRange(
    selection.state,
    candidateEvents,
    selection.eventIndex,
  );

  const firstHit = findFirstEnemyTrigger(forecast.snapshots, previewId);
  if (firstHit) byCell.set(`${cell.x},${cell.y}`, firstHit);
}
```

候補イベント自体を含む位置から始めるため、最初にルーンが配置され、その後の未解決イベントだけが踏破対象になる。グローバルACTION ORDER番号は `globalEventIndex + 1`、歩数はその敵イベント内の `simMoveToward()` の `step` を用いる。

イベントを再ソートしないため、選択中命令より後ろに残っている同速命令、NORMAL、SLOWも元の順番で解決される。

## 4. 候補ルーンを座標ではなくIDで追う理由

現在の合法セル判定は空のユニットセルを対象にしており、同じ座標に既存の灼熱のルーンがある場合を必ずしも除外しない。座標だけで「候補が踏まれた」と判定すると、既存ルーンが先に消費され、候補ルーンは残ったケースを誤検出する。

候補の `target` にのみ `previewRuneId` を持たせる。`resolveSimPlayer()` が対象をルーン状態へ複製する現行経路を使い、`simTriggerEmberRune()` は実際に除去したルーンのIDを結果へ記録する。

このIDはローカル予測内だけの内部値でよい。実ゲームへ確定するアクション、手札、キュー、通常のルーンへは追加しない。

## 5. 正しさの境界ケース

| ケース | 期待する扱い |
|---|---|
| Root中 | `simMoveToward()` が移動しないのでマーカーなし |
| 移動者が先に死亡 | そのイベントがキャンセルされ、マーカーなし |
| 固定対象が先に死亡 | 現行解決器どおりキャンセルまたは不発。独自補正なし |
| 経路なし | 実移動セルがないのでマーカーなし |
| 既に隣接 | 移動せず攻撃するためマーカーなし |
| 手前に既存ルーン | そこで停止。奥の候補ルーンは踏まれない |
| 候補と同座標に既存ルーン | 発火したルーンのIDを照合し、既存分を候補の命中と数えない |
| 複数敵が同じ候補を通る | 実際に候補を最初に消費した1イベントだけを表示 |
| 先行敵が候補で止まる | その敵がセルを占有した状態で、後続敵が再経路探索する |
| 同セル競合 | 各候補の全後続イベントを同じ状態上で順に解決し、実際の占有結果に従う |
| 同じ敵の別の後続移動イベント | イベントキーとグローバル番号で別扱い。罠が残っていれば後のイベントでも命中可 |
| 最短経路が分岐 | 現在のBFSの隣接列順で実際に選ばれた1経路だけを表示 |
| 斜め方向 | 記録した直交1歩だけ矢印化し、斜め矢印を生成しない |

特に、1体目が罠で止まることで後続の占有と経路が変わるため、「罠を置かない未来を1回だけ計算して、その経路上へ印を付ける」方式は不正確である。36候補はそれぞれ独立した後続シミュレーションが必要になる。

## 6. 戻り値と表示モデル

候補計算の戻り値は、DOMに依存しないデータにする。

```js
{
  byCell: new Map([
    ["2,3", {
      x: 2,
      y: 3,
      eventKey: "...",
      order: 4,
      step: 2,
      actorId: "...",
      actorIcon: "...",
      actorName: "追跡獣",
      actionName: "飛びかかり",
      speed: "NORMAL",
      from: { x: 1, y: 3 },
      to: { x: 2, y: 3 },
      direction: "→",
    }],
  ]),
  legendEvents: new Map(),
}
```

1候補の新規ルーンは最初の発火で消えるため、1セルにつくマーカーは最大1つである。`legendEvents` は `byCell` で実際に参照されたイベントだけをイベント順に重複排除する。

## 7. 性能

盤面は最大36セルであり、合法候補はそれ以下である。イベント数は味方の予約命令と敵意図を合わせても現状おおむね6件以内である。

- 最大候補: 36
- 最大イベント解決: 36 × 6 = 216程度
- 各BFS: 最大36セル規模
- ユニット数: 最大でも少数

概算では小さな状態複製と数万回程度の近傍確認であり、デスクトップブラウザでは低いミリ秒台に収まる可能性が高い。ただしこれは推定なので、36候補・最大ユニット・最大イベントの固定シナリオで `performance.now()` を使い、描画1回あたりの実測を残すべきである。

最初の最適化はキャッシュではなく「1描画1計算」の共有で十分である。モジュール全体のメモ化は無効化条件を増やし、古いマーカーを残す危険がある。実測で問題が出た場合に限り、ゲーム状態の明示的なrevision番号をキーにする。

## 8. ライブ状態を変更しない証明条件

候補予測が変更してよいのは、候補ごとに作ったローカル状態・ローカルイベント・ローカル結果だけである。

- 初期状態は `cloneCombatState(selection.state)`
- `selection.action` は複製してから `target` を差し替える
- `selection.events` は配列を複製し、候補イベントオブジェクトも複製する
- 他イベントのpayloadは予測器が読み取り専用として扱う
- `handleCellClick()`、`selectCard()`、`setMode()`、`render()` を候補計算から呼ばない
- `makeCardInstance()` を呼ばない
- `shuffle()`、`Math.random()` を呼ばない
- ライブの解決処理を呼ばず、純粋シミュレーションだけを呼ぶ

自動テストでは候補計算の前後で、少なくとも以下の完全一致を検証する。

- `game.units`
- `game.hand` のカードIDとインスタンスID
- `game.queue` のアクション構造
- `game.intents`
- `game.hostileRunes` と `game.emberRunes`
- 選択カード、モード、移動選択ユニット
- `instanceCounter`

さらに候補計算中だけ `Math.random` を呼び出し回数カウンターまたは例外関数へ置き換え、0回であることを検証する。入力の `selection.state`、`selection.events`、`selection.action` をdeep-freezeしたテストも、入力オブジェクトへの書き込み事故を検出できる。

## 9. 最小DOM、aria-label、凡例

既存セルボタン内へ、命中する候補だけ次の小さな要素を追加する。

```html
<span class="ember-route-marker" aria-hidden="true">→ 04·2</span>
```

- `04`: 全ACTION ORDER内の1始まり番号
- `2`: その敵移動イベント内で踏む歩数
- 矢印: 直前セルから候補セルへ入る向き
- `pointer-events: none`
- セル右上などへabsolute配置
- 色だけを意味の唯一の手掛かりにせず、番号を主情報にする

セルは引き続きボタンであり、合法枠、クリック、キーボードフォーカスを維持する。明示済みのセル `aria-label` へ情報を足す。

```text
3列 4行、ACTION ORDER 04、追跡獣「飛びかかり」の2歩目に踏む
```

マーカー自体は `aria-hidden="true"` とし、読み上げを二重にしない。

凡例は新しい常設パネルを増やさず、既存の `modeHelp` の末尾へ1行追加すればよい。

```text
04 P 追跡獣｜飛びかかり
```

複数イベントが候補ごとに現れる場合は、実際にマーカーで参照されるイベントだけをACTION ORDER順に列挙する。命中候補が0件でも、合法マスは維持し、次の説明を表示する。

```text
この命令より後に、罠を踏む予定の敵移動はありません。
```

プレビューの寿命を描画モデルへ限定するため、モードやカードの切替、選択解除、確定後、解決中、次ターン、終了時にはDOM・凡例・aria-labelが自動的に消える。

## 10. 自動テスト案

### 純粋予測と経路

1. 直線3歩の敵移動を用意し、1・2・3歩目の各合法セルへ正しいイベント番号、歩数、方向が出る。
2. 各候補を実際の純粋予測へ投入した結果とプレビュー結果を比較し、発火イベントと歩数が一致する。
3. 選択イベントより前のFAST移動にはマーカーを出さず、後のNORMAL/SLOWだけを出す。
4. 同速時に既存の味方先行・登録順が維持され、グローバル番号もACTION ORDERと一致する。
5. Root、移動者の事前死亡、固定対象の事前死亡、経路なし、既に隣接でマーカーが出ない。
6. 手前の既存ルーンで停止し、奥の候補へマーカーが出ない。
7. 既存ルーンと候補ルーンが同座標でも、既存ルーンの発火を候補命中と誤認しない。
8. 複数敵が同じセルを通るとき、実際に候補を最初に消費するイベントだけを返す。
9. 先行敵の罠停止・セル占有により後続敵が迂回する配置で、候補ごとの経路差が実解決と一致する。
10. 同じ敵に別々の後続移動イベントがある場合、イベントキーと番号が混ざらず、候補が残ったときだけ後のイベントを返す。
11. 同距離の経路分岐では、現在のBFS隣接順が選ぶ実経路と一致する。
12. 記録する各移動の `from` と `to` が必ずマンハッタン距離1で、斜め矢印が生成されない。

### UIと状態遷移

13. 灼熱のルーンの技選択中だけマーカー、凡例、拡張aria-labelが現れる。
14. 命中しない合法セルも `valid` のままでクリックでき、単にマーカーを持たない。
15. 移動モード、別カード、選択解除、確定、解決中、次ターン、戦闘終了の各描画で情報が残らない。
16. マーカーが `aria-hidden="true"`、`pointer-events: none` で、セルボタンのフォーカスとクリックを阻害しない。
17. 同一イベントの凡例が候補セル数だけ重複せず、番号順になる。
18. 幅720px以下でもセル内マーカーと既存のルーン表示が重ならず、凡例が操作ボタンを押し出さないことを手動確認する。

### 非変更性と性能

19. 候補計算前後のゲーム、手札、キュー、意図、ルーン、選択状態、`instanceCounter` が完全一致する。
20. `Math.random` 呼び出しが0回である。
21. freezeした選択コンテキストを入力しても書き込み例外が起きない。
22. 最大36候補・最大イベントの固定シナリオで、`buildEmberRunePreview()` が1回の `render()` につき1回しか呼ばれない。
23. 同じ入力を複数回計算し、結果が完全一致する。

## 11. 隠れたリスク

### 予測ループ切り出しの回帰

部分予測は前半の再実行を避け、`selection.state` を明示的に再利用できる一方、現在の `predictTimeline()` の中核ループを共通化する変更が必要になる。before/afterスナップショット、ログ、キャンセル理由、変更差分の生成順を保たないと、既存タイムライン表示へ回帰が起こりうる。

対策は、現行 `predictTimeline(events, limit)` の全既存テスト結果を、共通化前後で固定比較することである。

### ルーンの重複座標

座標一致だけの実装は、一見正常でも既存ルーンと候補が重なったときに誤る。プレビュー専用IDを発火結果まで運ぶことは省略できない。

### スナップショットから歩数を復元できない

現在のイベント後スナップショットには最終位置しかない。途中で罠を踏んだ歩数や進入方向は復元できないため、`simMoveToward()` の実セル列を構造化して残す必要がある。

### 同じ計算の多重実行

盤面、タイムライン、操作説明が個別に選択コンテキストを求める現状のままだと、36候補計算も複数回走る。結果の不一致より先に操作感を損ねる可能性があるため、描画スコープ共有を同じ変更単位に含める。

## 12. より単純で同じ正しさを持つ代替案

より変更量が少ない方法は、各候補について仮イベントだけ差し替え、既存の `predictTimeline(candidateEvents)` をゲーム開始状態から最後までそのまま呼ぶことである。結果を調べる際に `selection.eventIndex` より後だけを対象にすれば、以前のFASTは表示されない。

この方法の長所は次のとおり。

- 中核予測ループをリファクタリングしない
- 既存の同速順、キャンセル、AI、BFSを最も直接的に再利用する
- 最大でも約216イベント解決で、現盤面規模なら十分軽い可能性が高い

短所は、全候補で確定済みの前半を再実行し、既に得ている `selection.state` を活用しないことである。また、プレビューの初期状態が暗黙にライブ `game` へ依存する。

実装リスクを最小にするなら、この全再生案は同じ正しさを持つ有力な初手である。実測で十分速ければ、そのまま採用してよい。`selection.state` の再利用を仕様上明示したい、または候補・イベント数が今後増えるなら、上記の共通化した部分予測を採用する。

一方、「罠なしの未来を1回だけ計算して、全経路上へ印を置く」案は同じ正しさを持たない。罠停止による占有、後続敵の迂回、既存罠の消費が候補ごとに変わるため、採用不可である。

## 実装境界

この候補で変更してよい範囲は、既存純粋予測の観測情報、候補別の純粋計算、描画モデル、最小のマーカー・凡例・aria-label、対応テストである。

次は範囲外とする。

- UI側のBFSまたは独自経路探索
- おすすめマス、最善手、期待値、順位付け
- 敵AIやターゲット選択の変更
- 灼熱のルーンのダメージ・停止・消費規則の変更
- 新しい乱数利用
- 実ゲームのキューや手札を使った試行
- ホバー必須の情報設計

この境界を守れば、「置いたら誰が、ACTION ORDERの何番で、何歩目に、どちらから踏むか」を、現在のゲーム解決と食い違わずに常時プレビューできる。
