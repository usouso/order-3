# ORDER//3 — ACT 24 design contract

The playable prototype has three allies, three enemies, a shared twelve-card deck and five-card hands. A player queues one to three commands, with every card also usable for a FAST one-tile allied move. Ownership limits printed techniques; a dead owner's card becomes a common FAST unlimited-range +2 armor order for one living ally. A card queued as a printed technique does not convert if its owner dies during execution.

Enemy targeting is fixed when the turn begins: nearest living ally by orthogonal distance, then lower HP, then Rook, Vale, Iona. The announced unit and rune coordinates never retarget. Actions resolve FAST, NORMAL, SLOW; allies win ties, then friendly registration order and enemy roster order. The preview and execution apply the same resolver snapshots. A selected card inserts a provisional action at its real speed, so legal targets are computed from the state immediately before it. Results, invalidations and movement traces are selectable in the timeline.

There are only three temporary unit effects. Armor stacks and absorbs before HP. Pin prevents movement but allows an adjacent attack. Mark adds 3 to the next ally-origin damage to its enemy, then is consumed even when armor absorbs all damage; it cannot stack. Arc Spark checks each damaged enemy's mark independently. Armor, pin and mark clear at turn end; HP and positions persist. An unused Ember Trap also expires then. Hostile runes remain until their next-turn detonation, including when the dead Cantor's scheduled detonation is cancelled and clears them.

| Ally | Card | Speed | Effect |
| --- | --- | --- | --- |
| Rook | Forward Cut | NORMAL | Range 2; approach one at distance 2, deal 3 if adjacent. |
| Rook | Interpose | FAST | Other ally range 2; approach up to two, both gain 2 armor even without a route. |
| Rook | Shield Lock | FAST | Self armor +5. |
| Rook | Pommel Break | NORMAL | Adjacent enemy: strip armor, then deal 2. |
| Vale | Quickshot | FAST | Enemy range 3: deal 2. |
| Vale | Pinning Arrow | FAST | Enemy range 4: deal 1 and pin if alive. |
| Vale | Backstep Shot | NORMAL | Enemy range 3: deal 2, then step to the farthest empty adjacent cell. |
| Vale | Hunter's Mark | FAST | Enemy range 4: mark for the next +3 ally-origin damage. |
| Iona | Arc Spark | SLOW | Enemy range 3: deal 3 to center and 2 to each orthogonally adjacent enemy. |
| Iona | Phase Step | FAST | Other ally range 3: swap positions. |
| Iona | Null Sigil | FAST | Ally range 3: armor +3. |
| Iona | Ember Rune | NORMAL | Empty cell range 3: once on enemy entry, deal 3 and stop remaining movement steps. |

| Enemy | Cycle action | Speed | Effect |
| --- | --- | --- | --- |
| Pursuer | Stalk | FAST | Approach up to 2, attack adjacent target for 2. |
| Pursuer | Pounce | NORMAL | Approach up to 3, attack adjacent target for 4. |
| Pursuer | Recover | SLOW | Approach up to 1, attack adjacent target for 2. |
| Bastion | Cover | FAST | Armor +4 to living Cantor, otherwise self. |
| Bastion | Shield Drive | NORMAL | Approach up to 1, attack adjacent target for 3. |
| Bastion | Brace | FAST | Self armor +6. |
| Cantor | Inscribe | FAST | Place rune on announced cross cells. |
| Cantor | Detonate | SLOW | Deal 4 to each living ally on rune cells, then clear runes. |
| Cantor | Drain | NORMAL | Deal 2 to announced ally, heal self up to 2. |

The three enemies follow these rows in a three-turn cycle. Pommel Break removes only armor; it does not cancel a detonation. Enemy movement uses an empty path around walls and units. Ember Trap triggers once, deals 3, consumes itself and stops remaining steps of that movement event; an already adjacent attack can still occur. New trap placement on an occupied trap cell replaces it, never stacks.

Cards show name, speed, target/range and one numeric effect sentence. Help carries full conditions. The actor-first hand view, ALT, queue return, Interpose candidate preview, enemy movement trace, optional opening guide, status inspection and local notes are retained. The notes workflow distinguishes local save from explicit form submission; opening the form is not delivery. The product works as a static page and needs no gameplay service.
