# ORDER//3 — ACT 08 user playtest observation protocol

Status: waiting for the user's first hands-on report against the fixed ACT 08 checkpoint.

## What matters most

The playtest is not a hunt for the optimal move. It should reveal whether the player can form and revise a three-command plan from enemy forecasts without needing knowledge of the implementation.

## Minimal questions

1. At what moment did the three-command planning first feel interesting?
2. At what moment did the interface or rules feel unclear or inert?
3. When an enemy moved, could its destination and the consequences for later commands be understood before execution?
4. If Ember Rune appeared, was choosing its cell a tactical prediction, an enjoyable experiment with Undo, or a blind guess?
5. Did Pinning Arrow, Ember Rune, retreat, and guard feel like meaningfully different answers, or was one obviously dominant?
6. Which card or unit felt exciting, useless, or difficult to understand?
7. After victory or defeat, was there a desire to try another plan immediately?

Short free-form answers are sufficient; turn counts or exact coordinates are optional.

## Decision routing

- If the player says Ember Rune placement was a blind guess or required repeated Undo, promote the ACT 09 route-marker candidate.
- If the player says discovering the route through one Undo was itself enjoyable and understandable, keep the current route hidden and prefer the next observed gameplay problem.
- If the player did not draw or use Ember Rune, do not infer either result; prioritize their broader clarity and fun observations, then collect another trap-specific playtest later.
- If a P0/P1 interaction bug prevented planning, fix that single regression before any route-marker work.
- If the player reports one universally dominant answer, orient around its opportunity cost before adding more content.
- If the player reports that the battle was clear but lacked a reason to replay, begin comparison of the VISION P1 second-objective/conditional-link candidates before P2 run structure.

## Preserved checkpoint

The authoritative product hashes and verification commands are recorded in `work/ooda/playtest-checkpoint-act08.md`. No ACT 09 product implementation may start until the user's report is mapped through the rules above or the user explicitly asks development to continue without waiting.
