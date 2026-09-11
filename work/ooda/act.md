# ACT 01 — staged deterministic forecast

## Implemented

- Added a side-effect-free combat state clone and resolver for every card and enemy intent in the current playable slice.
- Added one snapshot after every merged timeline event, including unit position, HP, guard, ward, Mark, Root, Exposed, KO state, hostile runes, Ember Runes, and event outcome.
- Changed live turn execution to apply the forecast snapshots in sequence. Preview and execution now share the same combat rules path.
- Added final-state preview to the planning board and squad/enemy HP panels. Changed HP is displayed as `before→after`; predicted KO units remain visible but dimmed.
- Made timeline events selectable during planning. Each event shows its predicted result or cancellation reason. Added a `最終予測` control.
- Fixed contract mismatches:
  - Brace guard/counter persists through end-of-turn cleanup and expires when Bastion's next action begins.
  - Counter only hits an orthogonally adjacent attacker, including after cover redirection.
  - Pommel Break cancels only a later Channel event explicitly scheduled in the same timeline; no cancellation flag leaks to the next turn.
  - Inscribe/Detonate display and resolve against announced fixed cells rather than following a unit.
- Updated README and design contract. Added no cards, characters, encounters, or run structure.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

The expanded smoke test covers initialization, event ordering, FE-style orthogonal adjacency, enemy HP display, movement planning, and these forecast cases:

- forecast does not mutate live state;
- forecast final state equals the state applied by live execution;
- move → attack;
- Mark → attack;
- Ward → Detonate;
- kill → cancelled follow-up;
- Pommel Break → cancelled Detonate;
- cover redirection without an invalid distant counter;
- Brace guard lifetime;
- fixed-cell Inscribe after player movement.

## Remaining constraints

- Forecasting is intentionally deterministic; no random rolls or hidden information exist in this slice.
- While selecting the next card, the board shows order-construction movement positions instead of the full staged combat forecast. Clearing the selection restores the selected-event/final forecast.
- Automated syntax and state tests passed. A final live browser visual check could not be run in this task because the in-app browser blocks local `file:` URLs; layout should receive a human/browser pass from the source task.
- The prototype still contains only its original single encounter and reduced twelve-card deck. Run structure, new content, progression, and a second battle remain outside ACT 01.

---

# ACT 02 — timeline point unification

## Implemented

- Added an untargeted provisional player event when a card is selected. It uses the card's real speed and the same friendly registration order and comparator as committed events.
- Resolves only the events before the provisional event, while preserving the full event list as resolver context. The resulting pre-event snapshot is now the single source for board display, legal target cells, occupancy, living targets, HP, and statuses during selection.
- Movement conversion changes the provisional speed to FAST immediately; choosing its mover and destination is evaluated against the same pre-event snapshot.
- Added an explicit provisional timeline step and `この命令の直前` board/detail text. Later events are labelled as awaiting target commitment rather than showing an invalid post-event forecast.
- Replaced the truncated flat result string with read-only structured snapshot differences for cancellation, damage/healing, movement, guard, status, cover start/end, counter preparation/consumption, and terrain placement/removal.
- Timeline summaries show the two highest-priority groups plus `＋他N種`. Selecting a resolved event renders every group and affected target in a dedicated detail panel.
- Unified board telegraphs with the displayed timeline stage. Only unresolved, effective enemy cell events retain an outline. Materialized hostile runes and Ember Runes come from the selected snapshot; completed/cancelled telegraphs and detonated runes disappear.
- Updated README and DESIGN. No combat values, cards, characters, enemies, encounters, or run systems were changed.

## Acceptance coverage

- A NORMAL provisional melee command can target an enemy that enters range through an earlier FAST enemy move.
- An enemy defeated by an earlier command is absent from legal targets.
- Reordering same-speed friendly commands recomputes the provisional pre-state.
- Provisional and committed event insertion indices match.
- Target selection forecasting does not mutate live combat state.
- FE-style Manhattan distance and orthogonal-only adjacency remain covered by the ACT 01 tests.
- Fire Rune, Inscribe, Cover, Shield Lock, and Brace produce concrete structured results.
- Structured unit tests cover damage, movement, status, guard, terrain, cover, counter, and cancellation.
- Multi-target damage and multi-cell terrain changes aggregate by meaning.
- Summaries preserve omitted change types with `＋他N種`; selected details expose every group.
- Resolved and forecast-cancelled enemy cell events no longer retain forecast outlines, while placed terrain remains in its snapshot.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

All ACT 01 prediction/execution equality, move-to-attack, Mark, Ward, channel cancellation, cover, counter, hazard, and orthogonal-adjacency regressions remain passing.

## Remaining constraints and risks

- The provisional event intentionally stops prediction at its pre-state. Events after it show `対象確定後に再予測` until the player commits a target; an unknown effect is never guessed.
- Timeline details are verified through the DOM smoke harness, but browser layout, overflow, animation, and click feel still need a human visual pass because local `file:` navigation is blocked in the available in-app browser.
- The old direct execution helpers remain in the file by explicit ACT 02 scope. Production `executeTurn()` continues to use the shared forecast snapshots.
- Deterministic locked targets, the single encounter, and the existing twelve-card deck remain unchanged.

---

# ACT 03 — speed-band roles for the existing twelve cards

## Implemented

Only the four decided cards changed:

- Forward Cut: FAST → NORMAL; effect remains move up to one, then 3 damage.
- Backstep Shot: FAST → NORMAL; effect remains 2 damage, then retreat one tile.
- Hunter's Mark: FAST → SLOW; the next attack bonus changed from +2 to +3.
- Arc Spark: FAST → SLOW; primary damage changed 2→3 and orthogonally adjacent splash changed 1→2.

The other eight cards, every enemy intent, the three-command limit, friendly-first same-speed tie break, and universal FAST movement conversion remain unchanged. Card definitions continue to drive the hand, provisional event, committed action, timeline, and resolver. The retained legacy direct resolver was also updated for the two numerical effects so its existing smoke coverage does not report obsolete values.

The resulting deck distribution is FAST 6 / NORMAL 4 / SLOW 2. README and DESIGN now use the same speeds and values as the implementation.

## Acceptance coverage

- FAST Pursuer movement makes its new cell a legal target for NORMAL Forward Cut and NORMAL Backstep Shot.
- NORMAL Backstep Shot resolves and retreats before a NORMAL enemy event because friendly actions win same-speed ties.
- SLOW Hunter's Mark followed by SLOW Arc Spark preserves friendly registration order, deals 6 to the marked primary target, consumes Mark, and deals 2 to an orthogonally adjacent enemy.
- FAST Pinning Arrow resolves before FAST Stalk, applies Root, and prevents movement.
- NORMAL Pommel Break resolves after FAST Cover and before SLOW Detonate, removing the granted guard and cancelling the channel.
- Arc Spark used as a technique inserts at SLOW and observes the post-FAST enemy state; converting that same card to movement inserts at FAST and observes the pre-enemy state with legal orthogonal destinations.
- Hand cards, provisional timeline steps, and committed timeline steps display their changed speed classes from the same card definitions.
- ACT 01/02 forecast/execution equality, provisional insertion, structured differences, stage telegraphs, hazards, cover/counter, and FE-style adjacency tests remain active.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

## Remaining risks

- The SLOW Mark → Arc Spark sequence is deliberately strong and now has deterministic regression coverage, but its selection rate and damage trade-off still require play observation.
- NORMAL actions benefit from acting after FAST enemies but before NORMAL enemies; whether this is a sufficient timing cost rather than a pure upgrade remains a playtest question.
- Universal movement remains FAST by decision. Its conversion rate, especially for the two SLOW cards, should be measured in the next Observe cycle.
- Browser presentation was not changed beyond data-driven speed labels, so no new layout work was required; manual feel/readability validation remains outside the automated DOM harness.

---

# ACT 04 — same-turn healing Charge as an Arc Spark position reward

## Implemented

- Added integer `charge` to every unit, initialized to 0. Enemy healing increases it only by HP actually restored, caps it at 2, and end-of-turn cleanup resets it to 0.
- Routed Cantor's existing NORMAL Drain heal through an actual-healing helper in the shared simulator. Full-health overheal produces no Charge; partial healing produces only the restored amount. The retained direct resolver mirrors the same calculation.
- Kept Arc Spark at SLOW, range 3, primary 3, and base orthogonal splash 2. Its pre-hit target snapshot now records living orthogonal enemy neighbors and target Charge.
- Each recorded neighbor takes `2 + min(2, target Charge)`. Hunter's Mark +3 applies only to the primary hit; Marks on chained neighbors neither add damage nor get consumed.
- Arc Spark records neighbors before primary damage, so a primary KO does not stop the chain. Diagonal enemies are excluded through the existing FE-style orthogonal adjacency helper.
- A real chain consumes target Charge after all hits. With no chain target, Charge is preserved until turn cleanup and the structured result explicitly reports `連鎖先なし（帯電ボーナスなし）`.
- Added structured `charge` changes with high summary visibility, including Drain gain and Arc Spark consumption. Charge remains part of every cloned/applied staged forecast state.
- Added `⚡ 帯電N` to unit badges, a hover/help lifetime explanation, and a live Arc Spark target breakdown showing primary damage, Mark bonus, orthogonal target count, per-target splash, and Charge bonus.
- Updated Arc Spark card text, README, and DESIGN without changing any other card values, speeds, enemy AI, movement conversion, or encounter content.

## Acceptance coverage

- Actual healing of 0 / 1 / 2 produces Charge 0 / 1 / 2; repeated healing caps at 2; turn cleanup resets it.
- Charge 0 / 1 / 2 produces orthogonal splash 2 / 3 / 4 while primary damage remains 3.
- A Marked Charge-2 target takes primary 6; each of two orthogonal neighbors takes 4; Charge is consumed even when the primary is KO'd.
- A Mark on a chained neighbor is ignored and remains unconsumed, confirming Mark +3 is primary-only.
- No-neighbor Arc Spark preserves Charge through resolution, emits the explicit no-chain result, and cleanup subsequently clears Charge.
- Primary KO still chains to the pre-hit orthogonal set; a diagonal enemy remains undamaged.
- Drain's timeline snapshot changes HP2→4 and Charge0→2 with both `heal` and `charge` structured groups. The earlier snapshot stays Charge0.
- Arc Spark's selection-time breakdown displays `本体6（印+3） / 隣接2体へ各4（帯電+2）` from its actual pre-event snapshot.
- Forecast final state equals live execution for both the full Drain → Mark → Arc Spark chain and the no-chain preservation/cleanup case.
- FAST Quickshot remains FAST, deals 2 to one target, and still cancels the defeated enemy's later action.
- ACT 01–03 tests for prediction/execution identity, timeline insertion, structured results, stage telegraphs, movement timing, FE adjacency, and FAST 6 / NORMAL 4 / SLOW 2 remain passing.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

## Remaining risks

- The maximum conditional sequence totals 14 damage across three enemies. Its frequency and whether it dominates other SLOW choices require play observation; no balance adjustment was made in this ACT.
- Charge currently comes only from Drain, by decision. Its occurrence rate depends on an injured enemy remaining alive until the NORMAL heal.
- The selection breakdown lists every legal Arc Spark target in the compact mode-help row. Readability with several legal enemies needs a browser visual pass.
- The old direct resolver remains by scope, but production execution and staged prediction continue to share the pure snapshot resolver.

---

# ACT 05 — show the mode bar only during card selection

## Implemented

- Added the global `[hidden] { display: none !important; }` contract so the HTML hidden state wins over `.mode-bar { display: grid; }` and other component display rules.
- `renderControls()` now treats selection UI as active only while the game is in planning and both `selectedCard()` and `selectedDef()` are valid.
- The mode bar and cancel-selection button are hidden for the initial state, stale card IDs, same-card deselection, explicit cancellation, confirmed targets, final forecast, resolution, the next turn, and the ended phase.
- `modeHelp.textContent` is cleared before every render branch, so hidden controls cannot retain target, primary-body, orthogonal-neighbor, Charge, or no-chain text from the previous selection.
- No combat rules, card values, enemy behavior, or unrelated interactions were changed.

## Acceptance coverage

- Initial state → Arc Spark selection → same-card re-click verifies hidden → visible grid → hidden, including an empty help string after deselection.
- Explicit cancel, stale selected-card ID, target confirmation, final forecast, resolution frames, next turn, and ended phase all verify hidden controls and cleared help text.
- Switching Arc Spark to Quickshot verifies the new FAST help and confirms that Arc Spark-only target/body/neighbor/Charge/no-chain strings do not remain in the DOM.
- Computed display checks verify `none` while hidden and `grid` for the active mode bar.
- Existing modal, timeline-detail, and cancel-button hidden behavior is covered alongside all ACT 01–04 regressions.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

## Remaining risks

- Computed display is verified in the CSS-backed DOM smoke harness. Browser layout and visual feel still require a manual browser pass.
- The selected-card active styling is intentionally left unchanged; this ACT only governs the visibility and stale content of the selection controls.

---

# ACT 06 — turn zero legal targets into replanning guidance

## Implemented

- Added zero-target guidance only when the game is planning, a valid card is selected, technique mode is active, and the existing `validCells()` result is empty.
- Kept `selectionTimelineContext()` as the timing source and allowed `validCells()` to accept that already-computed context, so legality and the displayed explanation use the same provisional pre-event snapshot.
- Extracted `targetCandidatesForState()` and reused it inside `targetsForState()`. The explanation classifies the same target-kind candidate population instead of duplicating range, adjacency, occupancy, or combat resolution rules.
- Enemy techniques distinguish no living enemy from no enemy inside the displayed range. Ally and empty-cell techniques use target-kind-specific wording.
- The mode help gives one reason followed by the existing replanning actions: change the prior command, choose another card, choose “移動命令に変換”, or cancel selection. The battlefield instruction gives the compact move-or-cancel prompt.
- Movement mode is never selected automatically. Zero-target cards remain selected and are not disabled, confirmed, queued, or assigned a recommended target.
- Any legal target preserves the prior speed/help and target instruction. Leaving the zero-target state clears its reason through the existing ACT 05 render contract.
- No card data, speed, range, target kind, enemy AI, Charge calculation, combat rule, or unrelated UI was changed.

## Acceptance coverage

- An out-of-range Quickshot reports the provisional timing, range 3, no in-range enemy, and all four existing replanning operations while preserving selection, technique mode, hand, and queue.
- No living enemies reports target absence rather than range failure.
- A FAST enemy moving into NORMAL Pommel Break range remains a legal highlighted target and keeps the original normal guidance.
- A prior Quickshot defeating the sole enemy causes the zero-target message; undoing that command and reselecting Arc Spark restores the usual target prompt.
- Interpose with only out-of-range allies uses ally wording; Ember Rune with no in-range empty cell uses empty-cell wording.
- Technique → movement → technique clears and restores the warning without changing state automatically; movement continues to expose living allies through the existing legal-cell rules.
- Switching to a legal card, same-card deselection, the cancel button, target confirmation, final forecast, resolving frames, next-turn planning, and ended phase all remove stale zero-target text.
- ACT 01–05 forecast/execution identity, event ordering, FE-style distance, speed bands, Charge, timeline detail, modal behavior, and hidden-display regressions remain active.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

## Remaining constraints and risks

- The explanation intentionally reports one target-population/range reason. It does not enumerate blockers, inspect alternate command sequences, or recommend a target or movement cell.
- A command actor defeated before its provisional event can also yield no legal cells; ACT 06 keeps the decided target-kind wording rather than adding a separate actor-defeated explanation.
- Browser layout and reading tempo still need a manual visual pass; automated coverage verifies DOM text, state preservation, transitions, and the existing CSS-backed hidden contract.

---

# ACT 07 — prioritize a command actor's predicted defeat

## Implemented

- Added the new reason only inside ACT 06's zero-legal-target branch. It applies when the card is not a legacy action, its owner is alive in the live state, and that same owner is at HP 0 in the provisional event's pre-state.
- Added `firstPriorDefeatEvent()`, which starts with the owner's live HP and scans the existing `selectionTimelineContext().snapshots` in order. It returns the existing event whose snapshot first changes that HP from positive to zero, matched by `eventKey`.
- The warning uses the existing event's speed and timeline action name, for example `実行不能：イオナは先行するNORMAL「生命吸収」で戦闘不能になります。` It then lists only the existing replanning categories: protect or move with a prior command, choose another card, choose “移動命令に変換”, or cancel selection.
- When no matching lethal snapshot can be found, the display safely falls back to `この命令の直前に戦闘不能` without inventing a cause.
- The battlefield instruction is `命令者が先に戦闘不能になります。行動順か命令を組み直してください。`
- Actor defeat is checked before ACT 06's target-population/range reason and is displayed alone, without range failure, target absence, other events, or damage breakdowns.
- Cards whose owners are already at HP 0 in the live state retain the existing FAST legacy action, legal targets, and legacy help. A predicted mid-timeline defeat does not convert a technique into a legacy action.
- No provisional-action construction, legal-cell calculation, legacy definition, resolver, card/enemy data, speed, range, target kind, or combat value was changed.

## Acceptance coverage

- HP2 Iona with an in-range enemy, prior NORMAL Drain, and provisional SLOW Arc Spark produces zero legal cells and names Iona plus `NORMAL「生命吸収」`, while remaining a selected SLOW technique.
- The actor warning excludes enemy range/absence and damage text, and leaves the live combat state, selected card, mode, movement selection, hand, and queue unchanged.
- Queuing the existing FAST Interpose before Drain keeps Iona alive through guard, restores the in-range Arc Spark target and its normal SLOW breakdown, and removes the warning. Undoing Interpose restores the same warning.
- With three prior damaging events, only the event whose snapshot first changes Iona from positive HP to zero is named; the earlier nonlethal and later events are omitted.
- An artificial pre-state with HP0 but no matching snapshots uses the general fallback and does not invent a cause.
- Iona already at HP0 when Arc Spark is selected produces the existing FAST `遺志：残響`, two living-ally targets, and the unchanged legacy help without an actor warning.
- Movement mode, returning to technique, switching cards, target confirmation, final forecast, resolution frames, next-turn planning, ended phase, and cancel selection verify the warning's display lifetime and clearing behavior.
- ACT 01–06 forecast/execution identity, speed ordering, FE-style distance, Charge, target-kind reasons, modal/timeline behavior, and hidden-display regressions remain active.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

## Remaining constraints and risks

- The warning identifies the first event correlated with the HP transition, not a damage source within that event. Redirects, counters, hazards, and other indirect effects intentionally keep the event-level name and leave detailed causality to the existing timeline.
- If an artificial or future state lacks a matching event key or HP transition snapshot, the general fallback is intentionally less specific rather than speculative.
- Browser wrapping and reading tempo still require a manual visual pass; automated coverage verifies text, exclusivity, state preservation, and all requested transitions.

---

# ACT 08 — Ember Rune ends only the current remaining movement

## Implemented

- Kept Ember Rune at NORMAL, range 3, empty-cell placement, 3 trigger damage, and consumption on trigger. Its card text now states that the entering enemy loses the remaining steps of that movement event.
- Changed both `simTriggerEmberRune()` and the retained direct `triggerEmberRune()` to return whether a trap triggered. Each removes the entered trap, resolves the existing 3 damage, emits one `火種の罠で残り移動停止` result, and returns true.
- The pure `simMoveToward()` and retained direct `moveToward()` now break only their current movement loop when that result is true. No Root or persistent movement-stop state is added, so a separate later movement event starts normally.
- Enemy action resolution is not cancelled. Existing post-movement adjacency checks still decide whether Pounce, Stalk, or Shield Drive attacks and follow-up effects resolve.
- Added one structured `move_stop` group per trigger with summary `火種の罠で残り移動停止`. Its priority keeps the stop visible in the compact timeline while movement, damage, terrain removal, attack damage, and status details remain derived from the same before/after snapshot.
- Updated README and DESIGN to the same current-event-only contract, including no Root, no action cancellation, later movement remaining legal, and adjacent post-movement attacks still resolving.
- No other card, enemy AI, pathfinding, distance, attack value, cycle, universal movement, Charge, or ACT 05–07 selection guidance changed.

## Acceptance coverage

- NORMAL Ember Rune placed before NORMAL Pounce stops Pursuer on the first or second entered path cell, deals 3, consumes the trap, and prevents the existing 4-damage attack while nonadjacent.
- If the trap cell leaves Pursuer orthogonally adjacent, Pounce still deals its existing 4 damage after the trigger.
- Shield Drive entering a trap takes 3 and consumes it; when stopped adjacent it still deals 3 and applies Exposed.
- A same-turn NORMAL trap resolves after FAST Stalk and cannot affect that completed movement. A previously placed trap does stop FAST Stalk when entered.
- Pinning Arrow's existing Root prevents movement, so the path trap neither triggers nor disappears. An off-path trap and a trap near an enemy that begins adjacent likewise remain untriggered while the original attacks resolve.
- With two traps on one route, the first entered trap alone triggers and disappears; the later path trap remains.
- A second movement event for the same enemy proceeds normally after the first event was stopped, confirming the absence of persistent Root or cancellation.
- The trigger produces exactly one stop log and one structured stop group. The compact timeline, final forecast board, execution log, stopped cell, HP, trap removal, and post-execution board agree.
- `executeTurn()` remains identical to its pure forecast, and the retained direct `resolvePlayerAction()` / `resolveEnemyIntent()` route reaches the same final combat state. Direct movement also permits a later call after the trap stop.
- Card text and documentation contracts are checked alongside the existing FAST 6 / NORMAL 4 / SLOW 2, FE-style adjacency, prediction/execution, Charge, hidden UI, target-zero, and actor-defeat regressions from ACT 01–07.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

## Remaining risks

- Ember Rune now combines 3 damage with exact stopping control against NORMAL movement when a route cell is available. Its selection rate versus Pinning Arrow, retreat, and guard needs play observation; no same-cycle balance adjustment was made.
- The route is still inferred from deterministic prediction rather than drawn as a dedicated path overlay. If finding the correct trap cell repeatedly requires more than two undo attempts, route readability should be considered in a later OODA cycle.
- The retained direct resolver mirrors the pure resolver but remains duplicate code. Production execution continues to apply pure forecast snapshots, while smoke coverage guards the retained path until it is removed in a separately scoped cleanup.
- Browser animation timing and feel when a unit stops on the trap cell still require a manual visual pass; automated coverage verifies the complete state and DOM result contract.

---

# ACT 09 — hide HP0 units from the battlefield

## Implemented

- `previewDisplayUnitAt()` now returns only the unit at the requested coordinates whose snapshot HP is greater than zero. The former fallback that returned an HP0 record from the same cell was removed.
- `renderBoard()` therefore appends unit DOM only for living units in the currently displayed state, consistently across the live board, intermediate and final forecasts, resolution frames, the next turn, and the ended phase.
- `origin-cell` now requires the matching unit to be alive in both the live state and displayed snapshot, as well as to have changed coordinates. A unit that moved and was later defeated no longer leaves a movement-origin death trace.
- `renderUnit()` retains projected position, HP, guard, and status display for living units, but no longer produces the battlefield-only `predicted-ko` class or an HP0 full-body ghost.
- Defeated records remain in `game.units`, forecast snapshots, and `lastResolvedState`. No target, occupancy, pathfinding, card, enemy intent, trap, cancellation, log, legacy, or battle-result rule was changed.
- No tombstone, placeholder, KO marker, notification, or other new battlefield object was added.

## Acceptance coverage

- HP0 enemies and allies both return no result from `previewDisplayUnitAt()` and create no unit child in their battlefield cell, while all six unit records remain in state.
- A defeated ally remains in SQUAD STATUS with `down` and `0/N`, confirming that battlefield removal does not erase status or legacy data.
- HP0 enemies remain excluded from attack targets.
- An HP0 enemy cell remains a legal Ember Rune target and displays the trap alone. An HP0 ally cell remains a legal universal-movement destination and displays only the living unit predicted to enter it.
- A three-command forecast verifies a living pre-lethal snapshot, immediate disappearance on the lethal snapshot, continued absence in the final forecast, reversible restoration when returning to the pre-lethal snapshot, and the unchanged `対象が戦闘不能` cancellation for the later command.
- Undoing the sole lethal command restores the still-living live unit in the final board.
- A unit that moves and then dies in the same forecast produces neither a unit at its destination nor `origin-cell` at its live origin.
- Resolution-frame coverage verifies that the enemy is absent from the first HP0 frame onward. The next turn retains its HP0 record but omits both its battlefield DOM and enemy intent.
- Victory and defeat modal backgrounds contain no unit DOM for their respective defeated side, while all defeated state records remain present.
- The ACT 01–08 forecast/execution, speed, FE adjacency, staged timeline, Charge, selection guidance, Ember Rune stop, structured result, and log regressions remain active.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

## Remaining risks

- Automated coverage uses the existing DOM smoke harness. A manual browser pass is still needed to confirm animation timing, visible empty-cell clarity, and the modal background at real rendering speed.
- The unused `.unit.predicted-ko` CSS rule remains for minimal change, but production `game.js` no longer emits that class or sends HP0 units to `renderUnit()`.
- Enemy-intent emphasis, layout integration, effect visibility, card classification, and route overlays remain intentionally outside ACT 09.

---

# ACT 10 — central execution reading lane

## Implemented

- Moved the existing `#action-timeline`, `#timeline-detail-panel`, `#preview-final`, and `#idle-units` unchanged in identity from COMMAND HAND into a single execution panel directly beside the battlefield.
- Made `左から順に実行 01 → 02 → 03 → …` an 18px bold primary rule and kept `FAST → NORMAL → SLOW / 同速度は味方が先` immediately beneath it as the only speed legend.
- Moved the single existing `#intent-list` into a native `details` at the end of the execution panel. It is closed by default and still renders the existing enemy HP, action, original description, target, and speed when opened.
- Reduced the right assist area to SQUAD STATUS and COMBAT LOG. Updated COMMAND HAND guidance to `上の実行順を読み、最大3枚を並べる`.
- Kept `buildResolutionEvents()` as the sole order source. Each existing event button now presents number, ENEMY/ALLY, actor, action, speed, target, original planned-effect clauses where applicable, and forecast result in a fixed order.
- Added `timelineTargetLabel()` using only existing `targetId`, `target`, `targetKind`, and `cells`. Unit targets use existing names; cell targets use one-based coordinates; provisional targets state `選択待ち`.
- Added `intentDescriptionClauses()` to split only the existing `intent.description` at Japanese full stops and retain up to its two existing clauses. `highlightIntentClause()` wraps only existing numbers and tactical keywords without rewriting or inventing text.
- Forecast outcomes remain sourced from `outcome.summary` and are explicitly prefixed with `予測：`. Existing provisional, post-selection recalculation, cancellation, legacy, selected, and resolving states remain visible.
- Added fixed-order `aria-label`, `aria-controls`, `aria-expanded`, `aria-pressed`, and resolving `aria-current="step"` to the existing buttons. DOM and Tab order remain identical to event order.
- Focused events call `scrollIntoView({ inline: "nearest", block: "nearest" })`, keeping keyboard focus visible in the local narrow-screen timeline scroller.
- Changed desktop layout to board/execution plus board/side grid areas and sized cells with `clamp(58px, 4.7vw, 68px)`. At 1050px and below the order becomes board → execution → side, with horizontal overflow restricted to ACTION ORDER. At 720px and below cells cap at 54px and compact spacing keeps the hand edge in view.
- No enemy AI, event array, speed, target, card, combat value, FE adjacency, trap behavior, HP0 rendering, or status rules changed.

## Acceptance coverage

- Static DOM checks require exactly one each of `#action-timeline`, `#timeline-detail-panel`, `#preview-final`, and `#intent-list`, and verify that the execution lane is inside `.battle-layout` but outside `.command-panel`.
- The enemy reference is verified as a closed native `details`; its rendered cards retain original descriptions and HP.
- Three enemies plus three allied orders render six buttons in exact `buildResolutionEvents()` key, side, and index order.
- Every event is checked for number, ENEMY/ALLY, actor, action, speed, target, and fixed-order aria fields. Rendering is checked not to mutate units, queue, intents, or either rune list.
- Stalk, Pounce, Shield Drive, Brace, Inscribe, Detonate, and Drain reconstruct their complete unchanged descriptions from displayed clauses. Their decided movement, damage, exposure, armor, next-turn, dispel, and healing phrases are present only where sourced.
- Allied self, unit, movement-cell, provisional target-waiting, and legacy events retain their existing target semantics. Confirmed actions show forecast results, and a defeated-target follow-up retains `予測：取消：対象が戦闘不能` in both visible and accessible text.
- Planning selection exposes pressed/expanded state; resolving exposes current/expanded state without planning pressed state. Focus calls are checked for nearest inline reveal.
- Static responsive checks cover desktop grid areas, 18px direction heading, desktop no-overflow policy, the 1050px local scroller, and the 720px cell cap.
- ACT 01–09 smoke regressions remain active, including HP0 battlefield removal and state retention.

## Verification

Executed with the bundled Node.js runtime:

```text
node --check outputs/order-3/game.js
node --check work/smoke-test.js
node work/smoke-test.js
ORDER//3 smoke tests passed
```

A local headless Chrome layout pass with six mixed events also succeeded:

- 1280×720: document fits horizontally; battlefield bottom `534.94`; direction heading top `102`; hand top `648.94`; ACTION ORDER `scrollWidth 732 == clientWidth 732`; all six event boxes visible.
- 700×900: document fits horizontally; battlefield bottom `484`; heading top `562`; hand top `899.14`; only ACTION ORDER scrolls (`934 > 658`); focusing the last event scrolls to `276` and reveals the complete button.
- 320×900: document fits horizontally; battlefield remains within `21..299`; ACTION ORDER remains the local horizontal scroller.
- 200%-width equivalent (640 CSS pixels): document fits horizontally; battlefield remains within `21..619`; ACTION ORDER remains locally scrollable.
- Console errors and warnings were zero in all four browser passes.

## Remaining risks

- The 200% check uses the equivalent 640-CSS-pixel responsive width in automated Chrome rather than changing the browser chrome zoom control. A manual OS/browser 200% zoom pass remains useful.
- Exact Japanese font wrapping and perceived scan speed should still be checked on the user display. Geometry, overflow, information completeness, focus reveal, and console state were browser-tested.
- Native `details` keyboard behavior is supplied by the browser and its closed initial state is tested, but no separate screen-reader announcement pass was performed.
- Effect/status badges, card classification icons, enemy path overlays, and Ember Rune summary redesign remain intentionally outside ACT 10.
