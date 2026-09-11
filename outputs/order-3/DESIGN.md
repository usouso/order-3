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

## Prototype boundaries

- One 6x6 battlefield.
- Three fixed player units versus three enemies.
- Twelve-card player deck, five-card hand, three commands per turn.
- No run map, recruiting, upgrades, equipment, relationships, or metaprogression yet.
- One battle with restart, tutorial prompts, readable intent previews, and a combat log.
- Desktop-first browser controls, with layout that remains usable on tablets.
