# ORDER//3 — Prototype design

## Design promise

Build a three-unit squad by combining each member's current four-card kit (12 cards total; six-card kits are a future proposal) into one shared deck. Each turn, read the enemies' announced actions and queue up to three commands. Every card is also usable as a one-tile move, so a situational card is never completely dead.

The first prototype tests two questions:

1. Is recruiting a unit interesting because it changes both the board and the deck?
2. Is resolving a planned three-command sequence satisfying?

## Turn structure

1. Enemies announce their next actions, targets, affected cells, damage, and speed.
2. The player draws to five cards and receives three command points.
3. The player queues up to three cards. A unit may act more than once, but repeated actions by one unit cost tempo and leave other positions unattended.
4. Commands and enemy actions resolve in speed bands: FAST, NORMAL, SLOW. Player commands win ties, preserving readability in the first prototype.
5. Statuses and hazards tick, defeated units leave the board, and the next turn begins.

The queue can be edited freely before execution. Once an order is queued, the planning board shows the deterministic final state. Clicking any event in the merged timeline shows the state immediately after that event, including movement, HP, guard, ward, Mark, Root, Exposed, KO units, runes, and cancellation reasons.

Selecting a card inserts an untargeted provisional event with the card's real speed and friendly registration order. The board immediately changes to the snapshot just before that event, and legal targets are calculated from that same state. Earlier friendly commands and faster enemy actions therefore affect positions, HP, statuses, occupancy, and available targets exactly as they will during execution. The provisional step is explicitly labelled `この命令の直前`; committing a target replaces it with the real event without changing its insertion position.

## Resolution contract

Forecast and execution use the same side-effect-free resolver. Planning clones the current combat state and resolves every merged event into staged snapshots. Execution applies those already calculated snapshots in order, so the production execution path cannot disagree with the preview. Forecasting never changes the live combat state.

- Invalid later commands remain on the timeline and show why they will be cancelled.
- Root and ordinary guard expire at end of turn. Ward, Mark, and Exposed persist until consumed.
- Charge records only HP actually healed on an enemy during the current turn, caps at 2, and clears at turn end. Overhealing adds nothing.
- Brace guard and its counter persist until Bastion's next action begins. The counter only hits an orthogonally adjacent attacker.
- Pommel Break cancels only a later Channel event explicitly present in the current timeline.
- Inscribe targets the announced cells. Its hazard does not follow the unit used to choose those cells.
- Ember Rune triggers when an enemy enters its cell during movement. The enemy takes 3 damage, the rune is consumed, and the remaining steps of only that movement event end. It does not apply Root, cancel the rest of the action, or prevent a later movement event; a post-movement attack still resolves if the enemy remains alive and is orthogonally adjacent to its announced target.
- Event results are derived as structured, read-only differences between their before/after snapshots: damage/healing, movement, status, guard, terrain, cover, counter preparation, activation, clearing or neutral expiry, and cancellation.
- Timeline cards show at most two change groups plus `＋他N種`. Selecting the event exposes every group and affected target in the detail panel.
- Forecast outlines represent only effective enemy cell events that remain unresolved after the displayed stage. Materialized Ember Runes and hostile runes always come from that stage's snapshot; completed or cancelled telegraphs are not retained as outlines.

## Universal card rule

Every card has a printed technique and a fallback order:

- Technique: only its owner can perform the printed effect.
- Reposition: discard the card to move any living ally one tile.

This turns weak draws into positional choices without requiring a separate movement phase.

## Card purpose language

Every visible hand card carries one primary purpose and, only when tactically useful, one secondary purpose. The five display-only keys are Attack, Defense, Mobility, Control, and Trap. They are shown between owner and card name with a distinct monochrome SVG shape plus complete Japanese text. Primary purpose uses a filled heavy border; secondary purpose uses `＋` and a dashed outline. Purpose labels never drive resolution, targeting, range, speed, forecast, enemy AI, sorting, or the universal move rule.

| Printed card | Primary | Secondary |
| --- | --- | --- |
| Forward Cut | Attack | Mobility |
| Interpose | Defense | Mobility |
| Shield Lock | Defense | — |
| Pommel Break | Control | Attack |
| Quickshot | Attack | — |
| Pinning Arrow | Control | Attack |
| Backstep Shot | Attack | Mobility |
| Hunter's Mark | Control: Mark | — |
| Arc Spark | Attack | — |
| Phase Step | Mobility | — |
| Null Sigil | Defense | — |
| Ember Rune | Trap | Control |

The universal `ALT：味方を1マス移動` remains a separate fallback and does not make every card a Mobility card. When the selected card is switched to move mode, `使用中：移動命令` replaces the visual ALT line and the card's current printed or Legacy purposes remain readable under `元の用途`; returning to technique, switching cards, confirming, or undoing clears stale mode markers. Legacy effects replace the original classification: Rook's Guard and Iona's Echo are Defense, while Vale's Aim is `Control: Mark`. The existing LEGACY tag remains a separate information axis. Explicit card ARIA labels include owner, displayed name, Legacy/use mode when applicable, primary/secondary purpose, speed, full rules text, and the one-tile allied ALT.

## Player kits

### Rook — vanguard

Role: protection, close-range control, safe setup.

| Card | Speed | Effect | Purpose |
| --- | --- | --- | --- |
| Forward Cut | Normal | Range 2. At distance 2 approach 1 via an empty path, then deal 3 melee damage if orthogonally adjacent; already adjacent needs no move. | Counterattack after a Fast enemy approach. |
| Interpose | Fast | Select another living ally within 2. Approach up to 2; both gain 2 guard even if approach fails. No range recheck or interception grant. | Answer focused attacks. |
| Shield Lock | Fast | Gain 5 guard and intercept every hostile damage instance to one fixed ally selected among adjacent Vale, then Iona, while alive and adjacent this turn. | Answer telegraphed burst. |
| Pommel Break | Normal | Clear the target's Guard, persistent Guard and counter, then deal 2 melee damage; cancel only its later Detonate this turn. | Answer defensive and caster enemies. |

### Vale — ranger

Role: precise ranged damage, marks, anti-movement.

| Card | Speed | Effect | Purpose |
| --- | --- | --- | --- |
| Quickshot | Fast | Deal 2 at range 3; no direct Channel or counter cancellation. | Defeat fragile enemies before their actions. |
| Pinning Arrow | Fast | Deal 1 at range 4 and Root the target this turn. | Answer pursuit and charges. |
| Backstep Shot | Normal | Deal 2 at range 3, then move to the farthest empty orthogonal neighboring cell from the target; no empty cell means no move, and the move may approach it. | Fire after a Fast approach and retreat before Normal enemies. |
| Hunter's Mark | Slow | Range 4. Mark an enemy; next player-source damage gains +3, including traps and Spark primary but excluding chains. Consumed on use; otherwise persists. | Trade immediate safety for a stronger follow-up. |

### Iona — arcanist

Role: area control, timing manipulation, payoff.

| Card | Speed | Effect | Purpose |
| --- | --- | --- | --- |
| Arc Spark | Slow | Deal 3 at range 3; deal `2 + target Charge` (max 4) to each orthogonally adjacent enemy, then consume Charge if it chained. | Convert enemy healing and formation into area pressure. |
| Phase Step | Fast | Swap Iona with one other living ally within range 3. | Rescue/setup without forced enemy movement. |
| Null Sigil | Fast | Ward an ally; prevent the next Exposed application or Detonate hazard damage once; unused Ward persists. | Answer control and runes. |
| Ember Rune | Normal | Place a rune on an empty cell within range 3. When an enemy enters it during movement, the enemy takes 3 damage, the rune is consumed, and only the remaining steps of that movement event end. | Choose where a pursuing enemy stops without applying Root or cancelling the rest of its action. |

## Future kit proposals — not implemented

The following six cards are proposals only and are absent from the current 12-card deck and the ACT 14b technique index.

| Card | Speed | Proposed effect | Purpose |
| --- | --- | --- | --- |
| Hold the Line | Normal | Choose a three-cell line; allies on it gain 3 guard. | Formation payoff. |
| Cleaving Arc | Slow | Deal 3 to all adjacent enemies. | Reward grouping/setup. |
| Overwatch | Normal | Until turn end, deal 2 to the first enemy that moves within range 4. | Punish predictable movement. |
| Piercing Line | Slow | Deal 4 through every enemy in a straight line, range 5. | Formation payoff. |
| Refract | Normal | Copy the last queued friendly attack at -1 damage, using Iona as the source. | Cross-unit combo payoff. |
| Starfall | Slow | Deal 3 in a plus-shaped area at range 4. | Area payoff with friendly-fire positioning pressure. |

## Enemy patterns

Enemy actions are deterministic within a short cycle. Target-selection rules are visible, so the player can make a plan rather than guess.

### Pursuer — tests movement control

Cycle: Stalk -> Pounce -> Recover.

- Stalk (Fast): move 2 toward the nearest ally. If adjacent, deal 2.
- Pounce (Normal): fix the farthest ally at announcement; approach up to 3 through empty cells, then deal 4 if alive and orthogonally adjacent.
- Recover (Slow): fix the nearest ally; deal 2 only if adjacent at the start, otherwise approach up to 1 without attacking. No healing or immunity change.

Counterplay: Pinning Arrow, Ember Rune, screening with Rook.

### Bastion — tests target priority and disruption

Cycle: Cover -> Shield Drive -> Brace.

- Cover (Fast): fix the lowest-current-HP other living enemy (self if none), at unlimited range; add 4 guard even if not adjacent. Interception begins only if adjacent on activation and repeats while alive and adjacent this turn.
- Shield Drive (Normal): move 1 toward the nearest ally and deal 3; the surviving original target becomes Exposed after damage (+1 next enemy-source damage), even when damage is intercepted. Ward prevents Exposed only.
- Brace (Slow): gain 6 guard and prepare one 4-damage melee counter. Remaining Guard and unused counter persist until Bastion's next action starts; adjacent ranged attacks do not trigger it.

Counterplay: Pommel Break, ranged attacks, changing targets, Mark into a coordinated burst.

### Cantor — tests timing and space

Cycle: Inscribe -> Detonate -> Drain.

- Inscribe (Fast): fix the lowest-Guard ally's cell and orthogonal neighbors (tie: lowest current HP; exclude walls/outside). Replace existing runes; no immediate damage, no tracking, no Channel cancellation.
- Detonate (Slow, following turn): deal 4 hazard damage only to living allies on current runes, then clear all runes. Ward blocks once. A prior Pommel cancels and clears at this event; caster defeat cancels but leaves runes.
- Drain (Normal): fix the lowest-current-HP living ally at announcement, deal 2 at unlimited range, then select the lowest-current-HP living injured enemy at execution (self allowed), heal up to 2 and add actual healing as Charge (total cap 2). Zero damage still allows healing; a previously dead target cancels everything, while a kill by this hit still permits healing.

Counterplay: Reposition, Phase Step, Null Sigil, Quickshot to defeat the caster and cancel subsequent actions, or Pommel Break to cancel a later Detonate. Quickshot does not directly cancel Channel.

## Charge and Arc Spark

Charge is visible same-turn healing history, not a general buff or debuff. Its board chip is a fixed-position lightning shape containing the complete current value. Only actual enemy HP restored by Drain creates it in this slice; a full-health target gains none, and the value never exceeds 2. End-of-turn cleanup resets it to zero.

Arc Spark keeps its Slow speed, range 3, and 3 primary damage. Before dealing the primary hit, it records every living enemy orthogonally adjacent to the selected target. Each recorded neighbor takes `2 + Charge` damage, to a maximum of 4, even if the primary target is defeated first. Diagonal enemies never chain. Hunter's Mark adds +3 only to the primary hit and is ignored on chained neighbors. If at least one neighbor was recorded, the selected target's Charge is consumed; with no neighbor it remains until turn cleanup and the result explicitly reports `連鎖先なし（帯電ボーナスなし）`.

## Battlefield status language

The six existing unit-state fields are rendered from display-only metadata in a fixed `3 × 2` grid: Guard, Ward, Rooted / Marked, Exposed, Charge. Empty fields do not create chips and do not cause the remaining states to shift slots. Guard uses a shield with its complete value; Ward uses a double ring and an inner double outline around the unit; Rooted uses linked squares; Marked uses a crosshair; Exposed uses a warning triangle; Charge uses a lightning shape with its complete value. Shape, short Japanese text, fixed position, and a state-specific color all remain consistent across allied and enemy units.

The selected forecast snapshot is the sole source for presence and values; live state is used only to decorate changed forecast values. Every occupied living-unit cell exposes coordinates, side, name, HP, active states, and forecast status in a fixed accessible order, with full descriptions generated from the same metadata. Visual unit contents are hidden from accessibility APIs to avoid duplicate reading. Hovering a unit, focusing its cell, or tapping its status surface opens the single in-flow explanation below the battlefield. A status-surface tap stops before the cell action and pins the explanation; outside tap or Escape closes it. HP0 units create no unit status UI or description.

## Initial encounter

One Pursuer, one Bastion, and one Cantor create a compact interaction puzzle:

- The Pursuer pressures the back line.
- The Bastion protects the Cantor and discourages careless melee.
- The Cantor creates a delayed reason to move.

The first playable slice uses a reduced set of twelve cards while retaining all three roles. Additional cards unlock after the core flow feels good.

## Enemy defeat boundaries — ACT 14a

After Shield Drive's approach, both actor and target must still be alive and orthogonally adjacent before its existing 3 damage and follow-up Exposed logic run. An Ember Rune that defeats the moving Bastion therefore prevents both effects. Surviving trap stops retain the adjacent attack; Root, guard, cover redirection, ward consumption and Exposed application to the original target keep their existing order. Both the simulation used by forecast/executeTurn and the retained direct resolver use this boundary.

Drain requires a living attack target before any damage, healing or Charge is resolved. The direct resolver now matches the existing simulation cancellation for an already defeated or absent target. If Drain itself defeats a previously living target, enemy healing and Charge still resolve. Existing dead-actor entry guards remain. These two prerequisite corrections are retained unchanged by ACT 14b.

## Complete effect explanations — ACT 14b

All 9 enemy techniques, 12 current cards and 3 Legacy effects have a display-only short contract and full explanation in `effectCatalog`. Short text contains every independent effect; full text states targeting time, range, conditions, lifetime, consumption and links to related `effectRules`. Resolvers never read this catalogue. The in-game index is reachable before any order or draw through Help; selected/provisional and queued events expose the same rules in the existing timeline detail panel. The enemy reference remains available at queue zero. ALT is documented alongside every technique. Native details controls are siblings of action buttons, not nested interactive buttons, and disclosure state is separate from game state.

Drain visibly and accessibly includes Charge. Its fixed announced attack target differs from its dynamically selected healing recipient. Actual healing of 0/1/2 adds 0/1/2 Charge up to total 2, independently of dealt HP damage. Charge boosts orthogonal Arc Spark chains, is entirely consumed when neighbors were present before the primary hit, and expires at turn end even if unused. Mark is checked on the actual damage recipient and excluded from chained hits. Each hit still passes through existing armor and cover rules.

Rules are separate from plan results. Removed the independent Arc Spark numeric estimate; snapshot differences and existing outcome logs are the only result sources. Counter reductions distinguish logged activation, Pommel clearing, logged action-start expiry, and neutral end when evidence is absent. Existing rune arrays provide same-cell count changes. The six board chips stay fixed; the auxiliary status explanation includes cover targets and counter readiness even with Guard 0. Defeated units remain absent.

Complete text wraps in normal flow at 11px or larger and line-height 1.6. Help scrolls its body while retaining its close button and keyboard focus boundary. The 700px 155px hand and 320px single column remain. Physical 200% zoom and actual screen-reader speech require separate testing; DOM/viewport checks are not substitutes.

## Local playtest notes — ACT 13

One topbar button opens a native modal dialog: a 420px drawer on desktop and an internally scrolling bottom sheet at 720px and below. The header and save/copy footer are flex siblings of the scroll region, so they remain visible without covering its last item. The trigger remains above the existing briefing/result overlay; the native notes dialog is above both. This permits a note after victory or defeat without restarting. The closed board, ACTION ORDER, and hand retain their ACT 12 geometry, including the 155px hand at 700px and single-column hand at 320px. Card purpose metadata and combat rules are untouched.

`notes.js` owns an editor and an in-memory collection separate from `game`. It stops dialog click/keyboard propagation, uses native modality with explicit Tab boundaries, restores focus to the opening control, and never calls combat rendering, selection, mode, reset, queue, or execution functions. `capturePlaytestScene()` is the only integration point: it returns detached summaries of capture time, the single `GAME_VERSION = "ACT 15"` constant, turn, phase, selected card/mode/move actor, at most three orders, and the current/selection-before/event-after/final/resolving preview. No deck, complete units, forecast snapshots, movement evidence, cookies, query parameters, or other storage are collected. Opening an existing note preserves its attached scene until explicit refresh; attachment OFF stores `null`.

`notes-core.js` validates schema 1 under `order3.playtestNotes.v1`. UUIDs are assigned on first text input, with a time/random fallback when `crypto.randomUUID` is unavailable. Input debounces for 500ms; explicit save, close, pagehide, and hidden visibility flush pending input. Same-ID edits preserve creation time. Empty text is not saved and does not delete a previous revision. The last saved editor ID is stored alongside notes. Optional v1 fields are retained. Get/set exceptions, malformed data, unknown schema, and malformed records block writes; they never turn the key into an empty list. Counts reflect successfully stored notes, while unsaved drafts remain accessible in this tab and in exports.

Each save re-reads the key and merges notes by ID and updated time, then commits the edited record with a monotonically later timestamp. Storage events reconcile locally observed durable records with the event and latest payload, repairing distinct-note races without polling. Ties have deterministic ordering. An active editor is never overwritten by a storage event; a same-note change is announced, and a clean close does not write a stale editor. Subsequent deliberate editing saves that editor as the new revision. This is single-revision, last-edit-wins storage, not collaborative text merging or revision history; two users' edits to the same note are not combined. Unsaved in-memory drafts take precedence in rescue exports irrespective of clock skew.

Share clicks are not content edits. Before opening a popup, an unedited draft is compared with the latest stored body, kind and scene, even when no storage event has arrived. A mismatch blocks the popup and asks the user to load the saved version through the existing list Edit button; it neither replaces the visible text nor silently shares a different version. Actual pending user edits still flush normally. A handoff uses an immutable copy of the clicked draft for both the URL and any long-text clipboard rescue.

After a popup opens, `recordHandoff()` re-reads storage and records metadata only if its latest content still matches that snapshot. It uses the stored record, never the editor as a replacement record, and leaves content updatedAt unchanged. If another save has intervened, metadata recording is skipped and the UI states that the click-time text was handed off while the new saved content was preserved. Merge ordering excludes share metadata; matching content can merge handoff timestamps independently. Thus a delayed metadata event cannot give an old body priority over a later content edit. Metadata failure never marks a clean editor dirty. Corrupt/unknown storage remains write-protected; failed unsaved text remains in memory and rescue exports.

One Markdown formatter feeds local copy, Markdown export, and the GitHub prefill body. It preserves body text and adds the single generated `<!-- order3-feedback:v1 note-id=ID -->` marker, kind, and optional scene. User text is assigned through textContent/value, never parsed as local HTML. JSON export includes all durable and in-memory notes. Clipboard errors expose a selectable readonly textarea. Downloads always retain the selectable fallback because a browser cannot acknowledge successful disk saving. A failed-save close asks for copy-first, memory-only close, or return; memory-only never claims reload durability.

Only the selected note's explicit share click opens a new tab. A blank tab is obtained synchronously to detect popup blocking, its opener is cleared before navigation, and it is immediately navigated to the fixed `https://github.com/usouso/order-3/issues/new` with URLSearchParams-encoded title/body only. The title starts `[ORDER//3 メモ]`. At more than 7000 encoded URL characters, the body is omitted entirely and full Markdown copy/download is offered; no partial body is sent. Opening a tab records only `handoff-opened`; no local code can mark submission as completed. GitHub login and final public posting remain on GitHub. There is no external request on open, autosave, edit, or copy; no automatic posting, API credential, backend, timer-based collection, or feedback polling is introduced.

Validation commands are `node --check outputs/order-3/game.js`, the same syntax check for `notes-core.js`/`notes.js` and the tests, `node work/smoke-test.js`, `node work/notes-test.js`, `node work/notes-browser-test.js`, and `node work/notes-share-regression.js`. The browser suites use local HTTP, isolated headless Chrome contexts, and explicit failure injection. Real popup destinations are intercepted before reaching GitHub; they never post an Issue. Basic screenshots and measurements go to `work/act13-browser/` (override the work-relative directory with ORDER3_BROWSER_EVIDENCE); the stale-share regression evidence goes to `work/act13-fix-browser/`. Regression coverage includes body/kind/scene conflicts, repeated shares and both-tab reloads, missing/late storage events, an injected write between popup navigation and metadata persistence, intentional pending edits, and short/long/failing handoffs. Actual GitHub authentication/prefill behavior, physical 200% browser zoom, screen-reader speech, Safari/iOS, and real human usability remain independent-QA/manual checks.

## Current-plan movement evidence (ACT 15)

Only stalk, pounce, recover and shield_drive collect optional detached `outcome.movementEvidence`. The original BFS records occupied cells rejected while expanding the starting cell, at most four. Its neighbor order, visited/wall checks, returned path, tie handling and call count are unchanged. The movement loop copies the step-limited path length and actual entered cells (at most three). Its existing trap return records `path.length - entered.length` at the original break. Rooted, already-adjacent and no-path branches remain distinct. Damage, traps and the old direct resolvers are unchanged.

The original attack conditions pass their evaluated booleans through a recorder, preserving short circuit order. Unevaluated conditions stay null; entering damage resolution records an attack even when armor or cover prevents target HP damage. Recover records its initial adjacency branch and never invents a post-movement attack check. Collection can be disabled via the third `predictTimeline` argument, and direct enemy resolution defaults to collection off. No collector value drives combat. T05's Shield Drive enters its only planned cell, triggers a trap with zero planned moves remaining, then fails adjacency; the display makes no claim that trap stopping prevented its attack.

The existing event detail offers a closed native movement disclosure only for a committed planning forecast with recorded evidence. Position origins scan that same forecast's preceding snapshots backwards through continuous living occupancy. The last event that moved the same unit into the recorded cell is linked using its actual actor, action and execution number, including Phase Step moving another unit. Initial occupancy has no link; later damage, cancelled actions, dead occupants and distant BFS exclusions are not origins. Rendering and related navigation reuse the supplied forecast and never run a separate path search or compare an old plan.

`movementUI` is separate from game, combat state, storage and note scenes. It holds battle/queue generations, open disclosure keys (battle, turn, queue, eventKey), and one return destination. Register, undo, execution start, next turn, end and restart clear it; restart also advances battle generation. Card selection, mode changes, manual stages and final preview abandon the return destination. Selection and resolving never show the new disclosure. Navigation validates the plan and connected controls before changing only previewIndex; jumping focuses the destination heading and returning focuses the original link. Help/notes preserve reading state while the plan is unchanged; background execution invalidates it. Existing result restoration and all complete effect descriptions remain intact.

The addition stays inside the detail's document flow with wrapping text, 11px body, native keyboard operation and 44px summary/buttons. Closed battlefield/timeline/hand geometry is unchanged at 1280, 700 and 320px. No always-visible panel, path overlay, previous-plan comparison, recommendation or balance change is introduced.

Validation: `node work/act15-test.js` compares every event's state, order, original outcomes/logs and final result with collection off/on and published commit 4b3c4123060b092f0259985c8d27055b59a742cb, also counting path/neighbor/adjacency/occupancy/random calls. `node work/act15-browser-test.js` checks T05, provenance navigation/focus, stale controls, selection, responsive layout, Help/notes, execution and touch emulation. `node work/act15-browser-test.js --help-regression` reuses ACT14b's 13 browser groups in a separate evidence folder, with historical source immutability assertions replaced by the ACT15 baseline audit. Original suites and their evidence remain intact. Full smoke retains ACT14a's death-boundary matrices; only the scene version expectation changes. Evidence is under work/act15-implementation. These injected fixtures are implementation tests, not a new natural play observation. Physical browser zoom, actual assistive speech/touch hardware and human understanding remain unmeasured.

## Prototype boundaries

- One 6x6 battlefield.
- Three fixed player units versus three enemies.
- Twelve-card player deck, five-card hand, three commands per turn.
- No run map, recruiting, upgrades, equipment, relationships, or metaprogression yet.
- One battle with restart, tutorial prompts, readable intent previews, and a combat log.
- Desktop-first browser controls, with layout that remains usable on tablets.
