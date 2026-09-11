# ORDER//3 — Prototype design

## Design promise

Build a three-unit squad by combining each member's six-card kit into one shared deck. Each turn, read the enemies' announced actions and queue up to three commands. Every card is also usable as a one-tile move, so a situational card is never completely dead.

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
- Ember Rune triggers when an enemy enters its cell during movement. The enemy takes 3 damage, the rune is consumed, and the remaining steps of only that movement event end. It does not apply Root, cancel the rest of the action, or prevent a later movement event; a post-movement attack still resolves if the enemy is orthogonally adjacent to its announced target.
- Event results are derived as structured, read-only differences between their before/after snapshots: damage/healing, movement, status, guard, terrain, cover, counter preparation/consumption, and cancellation.
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
| Forward Cut | Normal | Move up to 1, then deal 3 to an adjacent enemy. | Counterattack after a Fast enemy approach. |
| Interpose | Fast | Move up to 2 toward an ally; both gain 2 guard. | Answer focused attacks. |
| Shield Lock | Fast | Gain 5 guard and intercept the next hit against an adjacent ally. | Answer telegraphed burst. |
| Pommel Break | Normal | Deal 2; cancel Guard and Channel on the target. | Answer defensive and caster enemies. |
| Hold the Line | Normal | Choose a three-cell line; allies on it gain 3 guard. | Formation payoff. |
| Cleaving Arc | Slow | Deal 3 to all adjacent enemies. | Reward grouping/setup. |

### Vale — ranger

Role: precise ranged damage, marks, anti-movement.

| Card | Speed | Effect | Purpose |
| --- | --- | --- | --- |
| Quickshot | Fast | Deal 2 at range 3. | Finish or interrupt fragile enemies. |
| Pinning Arrow | Fast | Deal 1 at range 4 and Root the target this turn. | Answer pursuit and charges. |
| Backstep Shot | Normal | Deal 2 at range 3, then move 1 tile away from the target. | Fire after a Fast approach and retreat before Normal enemies. |
| Hunter's Mark | Slow | Mark an enemy; the next hit deals +3. | Trade immediate safety for a stronger follow-up. |
| Overwatch | Normal | Until turn end, deal 2 to the first enemy that moves within range 4. | Punish predictable movement. |
| Piercing Line | Slow | Deal 4 through every enemy in a straight line, range 5. | Formation payoff. |

### Iona — arcanist

Role: area control, timing manipulation, payoff.

| Card | Speed | Effect | Purpose |
| --- | --- | --- | --- |
| Arc Spark | Slow | Deal 3 at range 3; deal `2 + target Charge` (max 4) to each orthogonally adjacent enemy, then consume Charge if it chained. | Convert enemy healing and formation into area pressure. |
| Phase Step | Fast | Swap the positions of two allies within range 3. | Rescue/setup without forced enemy movement. |
| Null Sigil | Fast | Ward an ally; cancel the next hostile status or hazard damage. | Answer control and runes. |
| Ember Rune | Normal | Place a rune on an empty cell within range 3. When an enemy enters it during movement, the enemy takes 3 damage, the rune is consumed, and only the remaining steps of that movement event end. | Choose where a pursuing enemy stops without applying Root or cancelling the rest of its action. |
| Refract | Normal | Copy the last queued friendly attack at -1 damage, using Iona as the source. | Cross-unit combo payoff. |
| Starfall | Slow | Deal 3 in a plus-shaped area at range 4. | Area payoff with friendly-fire positioning pressure. |

## Enemy patterns

Enemy actions are deterministic within a short cycle. Target-selection rules are visible, so the player can make a plan rather than guess.

### Pursuer — tests movement control

Cycle: Stalk -> Pounce -> Recover.

- Stalk (Fast): move 2 toward the nearest ally. If adjacent, deal 2.
- Pounce (Normal): target the farthest visible ally; charge up to 3 along a highlighted path and deal 4.
- Recover (Slow): deal 2 to an adjacent ally or move 1; lose all Root immunity.

Counterplay: Pinning Arrow, Overwatch, Ember Rune, screening with Rook.

### Bastion — tests target priority and disruption

Cycle: Cover -> Shield Drive -> Brace.

- Cover (Fast): the lowest-health enemy gains 4 guard; Bastion becomes its interceptor while adjacent.
- Shield Drive (Normal): move 1 toward the nearest ally and deal 3; the victim becomes Exposed (+1 damage from the next hit).
- Brace (Slow): gain 6 guard and prepare a 4-damage counter against the first adjacent attacker next turn.

Counterplay: Pommel Break, ranged attacks, changing targets, Mark into a coordinated burst.

### Cantor — tests timing and space

Cycle: Inscribe -> Detonate -> Drain.

- Inscribe (Fast): mark the target ally's cell and its orthogonal neighbors with visible hostile runes.
- Detonate (Slow, following turn): each marked cell deals 4; marks then disappear.
- Drain (Normal): deal 2 at range 4 and heal the most injured enemy for 2. Actual healing adds the same amount of Charge, up to 2, for this turn.

Counterplay: Reposition, Phase Step, Null Sigil, Quickshot or Pommel Break to cancel Channel before Detonate.

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

Drain requires a living attack target before any damage, healing or Charge is resolved. The direct resolver now matches the existing simulation cancellation for an already defeated or absent target. If Drain itself defeats a previously living target, enemy healing and Charge still resolve. Existing dead-actor entry guards remain. These are two prerequisite corrections; the complete effect-description audit remains ACT 14b.

## Local playtest notes — ACT 13

One topbar button opens a native modal dialog: a 420px drawer on desktop and an internally scrolling bottom sheet at 720px and below. The header and save/copy footer are flex siblings of the scroll region, so they remain visible without covering its last item. The trigger remains above the existing briefing/result overlay; the native notes dialog is above both. This permits a note after victory or defeat without restarting. The closed board, ACTION ORDER, and hand retain their ACT 12 geometry, including the 155px hand at 700px and single-column hand at 320px. Card purpose metadata and combat rules are untouched.

`notes.js` owns an editor and an in-memory collection separate from `game`. It stops dialog click/keyboard propagation, uses native modality with explicit Tab boundaries, restores focus to the opening control, and never calls combat rendering, selection, mode, reset, queue, or execution functions. `capturePlaytestScene()` is the only integration point: it returns detached summaries of capture time, the single `GAME_VERSION = "ACT 14a"` constant, turn, phase, selected card/mode/move actor, at most three orders, and the current/selection-before/event-after/final/resolving preview. No deck, complete units, forecast snapshots, cookies, query parameters, or other storage are collected. Opening an existing note preserves its attached scene until explicit refresh; attachment OFF stores `null`.

`notes-core.js` validates schema 1 under `order3.playtestNotes.v1`. UUIDs are assigned on first text input, with a time/random fallback when `crypto.randomUUID` is unavailable. Input debounces for 500ms; explicit save, close, pagehide, and hidden visibility flush pending input. Same-ID edits preserve creation time. Empty text is not saved and does not delete a previous revision. The last saved editor ID is stored alongside notes. Optional v1 fields are retained. Get/set exceptions, malformed data, unknown schema, and malformed records block writes; they never turn the key into an empty list. Counts reflect successfully stored notes, while unsaved drafts remain accessible in this tab and in exports.

Each save re-reads the key and merges notes by ID and updated time, then commits the edited record with a monotonically later timestamp. Storage events reconcile locally observed durable records with the event and latest payload, repairing distinct-note races without polling. Ties have deterministic ordering. An active editor is never overwritten by a storage event; a same-note change is announced, and a clean close does not write a stale editor. Subsequent deliberate editing saves that editor as the new revision. This is single-revision, last-edit-wins storage, not collaborative text merging or revision history; two users' edits to the same note are not combined. Unsaved in-memory drafts take precedence in rescue exports irrespective of clock skew.

Share clicks are not content edits. Before opening a popup, an unedited draft is compared with the latest stored body, kind and scene, even when no storage event has arrived. A mismatch blocks the popup and asks the user to load the saved version through the existing list Edit button; it neither replaces the visible text nor silently shares a different version. Actual pending user edits still flush normally. A handoff uses an immutable copy of the clicked draft for both the URL and any long-text clipboard rescue.

After a popup opens, `recordHandoff()` re-reads storage and records metadata only if its latest content still matches that snapshot. It uses the stored record, never the editor as a replacement record, and leaves content updatedAt unchanged. If another save has intervened, metadata recording is skipped and the UI states that the click-time text was handed off while the new saved content was preserved. Merge ordering excludes share metadata; matching content can merge handoff timestamps independently. Thus a delayed metadata event cannot give an old body priority over a later content edit. Metadata failure never marks a clean editor dirty. Corrupt/unknown storage remains write-protected; failed unsaved text remains in memory and rescue exports.

One Markdown formatter feeds local copy, Markdown export, and the GitHub prefill body. It preserves body text and adds the single generated `<!-- order3-feedback:v1 note-id=ID -->` marker, kind, and optional scene. User text is assigned through textContent/value, never parsed as local HTML. JSON export includes all durable and in-memory notes. Clipboard errors expose a selectable readonly textarea. Downloads always retain the selectable fallback because a browser cannot acknowledge successful disk saving. A failed-save close asks for copy-first, memory-only close, or return; memory-only never claims reload durability.

Only the selected note's explicit share click opens a new tab. A blank tab is obtained synchronously to detect popup blocking, its opener is cleared before navigation, and it is immediately navigated to the fixed `https://github.com/usouso/order-3/issues/new` with URLSearchParams-encoded title/body only. The title starts `[ORDER//3 メモ]`. At more than 7000 encoded URL characters, the body is omitted entirely and full Markdown copy/download is offered; no partial body is sent. Opening a tab records only `handoff-opened`; no local code can mark submission as completed. GitHub login and final public posting remain on GitHub. There is no external request on open, autosave, edit, or copy; no automatic posting, API credential, backend, timer-based collection, or feedback polling is introduced.

Validation commands are `node --check outputs/order-3/game.js`, the same syntax check for `notes-core.js`/`notes.js` and the tests, `node work/smoke-test.js`, `node work/notes-test.js`, `node work/notes-browser-test.js`, and `node work/notes-share-regression.js`. The browser suites use local HTTP, isolated headless Chrome contexts, and explicit failure injection. Real popup destinations are intercepted before reaching GitHub; they never post an Issue. Basic screenshots and measurements go to `work/act13-browser/` (override the work-relative directory with ORDER3_BROWSER_EVIDENCE); the stale-share regression evidence goes to `work/act13-fix-browser/`. Regression coverage includes body/kind/scene conflicts, repeated shares and both-tab reloads, missing/late storage events, an injected write between popup navigation and metadata persistence, intentional pending edits, and short/long/failing handoffs. Actual GitHub authentication/prefill behavior, physical 200% browser zoom, screen-reader speech, Safari/iOS, and real human usability remain independent-QA/manual checks.

## Prototype boundaries

- One 6x6 battlefield.
- Three fixed player units versus three enemies.
- Twelve-card player deck, five-card hand, three commands per turn.
- No run map, recruiting, upgrades, equipment, relationships, or metaprogression yet.
- One battle with restart, tutorial prompts, readable intent previews, and a combat log.
- Desktop-first browser controls, with layout that remains usable on tablets.
