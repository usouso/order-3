# ORDER//3 — ACT 27 design contract

The playable prototype has three allies, three enemies, a shared twelve-card deck and five-card hands. A player queues one to three commands, with every card also usable for a one-tile allied move. Ownership limits printed techniques; a dead owner's card becomes a common unlimited-range +2 armor order for one living ally. A card queued as a printed technique does not convert if its owner dies during execution.

Enemy targeting is fixed when the turn begins: nearest living ally by orthogonal distance, then lower HP, then Rook, Vale, Iona. The announced unit and rune coordinates never retarget. There are no speed bands. Actions resolve in six fixed slots: ally 1, enemy 1, ally 2, enemy 2, ally 3, enemy 3 (rank: ally = queue index x 2, enemy = (slot - 1) x 2 + 1). Ally numbers are queue order. Enemy numbers come from the fixed ENEMY_SLOT table by action id (the Slot column below), which keeps the former relative enemy order; they are fixed at turn start and shown before planning. Empty slots (an unregistered ally slot, or an enemy defeated at turn start) create no event and are skipped; later enemy numbers do not move up. Returning a middle queued order moves the later orders up one number. A unit defeated before its slot misfires and never switches action or target. The preview and execution apply the same resolver snapshots. A selected card inserts a provisional action into the next ally slot, so legal targets are computed from the state after ally 1..n and enemy 1..n. Results, invalidations and movement traces are selectable in the timeline.

There are only three temporary unit effects. Armor stacks and absorbs before HP. Pin prevents movement but allows an adjacent attack. Mark adds 3 to the next ally-origin damage to its enemy, then is consumed even when armor absorbs all damage; it cannot stack. Arc Spark checks each damaged enemy's mark independently. Armor, pin and mark clear at turn end; HP and positions persist. An unused Ember Trap also expires then. Hostile runes remain until their next-turn detonation, including when the dead Cantor's scheduled detonation is cancelled and clears them.

| Ally | Card | Effect |
| --- | --- | --- |
| Rook | Forward Cut | Range 2; approach one at distance 2, deal 3 if adjacent. |
| Rook | Interpose | Other ally range 2; approach up to two, both gain 2 armor even without a route. |
| Rook | Shield Lock | Self armor +5. |
| Rook | Pommel Break | Adjacent enemy: strip armor, then deal 2. |
| Vale | Quickshot | Enemy range 3: deal 2. |
| Vale | Pinning Arrow | Enemy range 4: deal 1 and pin if alive. |
| Vale | Backstep Shot | Enemy range 3: deal 2, then step to the farthest empty adjacent cell. |
| Vale | Hunter's Mark | Enemy range 4: mark for the next +3 ally-origin damage. |
| Iona | Arc Spark | Enemy range 3: deal 3 to center and 2 to each orthogonally adjacent enemy. |
| Iona | Phase Step | Other ally range 3: swap positions. |
| Iona | Null Sigil | Ally range 3: armor +3. |
| Iona | Ember Rune | Empty cell range 3: once on enemy entry, deal 3 and stop remaining movement steps. |

| Enemy | Cycle action | Slot | Effect |
| --- | --- | --- | --- |
| Pursuer | Stalk | 1 | Approach up to 2, attack adjacent target for 2. |
| Pursuer | Pounce | 1 | Approach up to 3, attack adjacent target for 4. |
| Pursuer | Recover | 3 | Approach up to 1, attack adjacent target for 2. |
| Bastion | Cover | 2 | Armor +4 to living Cantor, otherwise self. |
| Bastion | Shield Drive | 2 | Approach up to 1, attack adjacent target for 3. |
| Bastion | Brace | 1 | Self armor +6. |
| Cantor | Inscribe | 3 | Place rune on announced cross cells. |
| Cantor | Detonate | 3 | Deal 4 to each living ally on rune cells, then clear runes. |
| Cantor | Drain | 2 | Deal 2 to announced ally, heal self up to 2. |

The three enemies follow these rows in a three-turn cycle. Pommel Break removes only armor; it does not cancel a detonation. Enemy movement uses an empty path around walls and units. Ember Trap triggers once, deals 3, consumes itself and stops remaining steps of that movement event; an already adjacent attack can still occur. New trap placement on an occupied trap cell replaces it, never stacks.

Cards show name, target/range and one numeric effect sentence. Help carries full conditions. The actor-first hand view, ALT, queue return, Interpose candidate preview, enemy movement trace, optional opening guide, status inspection and local notes are retained. The notes workflow distinguishes local save from explicit form submission; opening the form is not delivery. Each battle takes one uint32 seed; a mulberry32 stream is the only shuffle source. A local play log stores the seed, per-turn start and result checkpoints (including draw and discard pile order), the execution-time hand order and committed orders, so a run can be replayed through the same forecast and post-resolution path as live play. A replayed turn counts as verified only when both its start and result checkpoints match; a committed turn without a recorded result is incomplete, and a result without a commit is invalid. A run records at most 60 turns and is marked truncated only at that limit; only such a run, with its 60th turn committed and resolved, skips the recorded-status check, because the battle can end after its recorded turns. Queue, intent and event records keep the schema v1 speed key with the constant value 'normal' (UNIFORM_SPEED); resolution and display never read it. The play log is never sent over the network. The product works as a static page and needs no gameplay service.
