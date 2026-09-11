# ORDER//3 user playtest checkpoint — ACT 08

Recorded: 2026-09-11 JST

Purpose: identify the exact fixed build used for the user's first hands-on playtest. No ACT 09 product implementation has started.

## Product SHA-256

- `index.html`: `C3285CA33D378ED309B82855BC81FDF2D58214CEC633E528F0F71E12FD33478E`
- `styles.css`: `A264A38A3FAB8DD3E4CC261248DB38346236629C7E62269830B1F63F3E7BF7F2`
- `game.js`: `7A567F3010B52ECDABE0F6D9DC1D9607FF85AB99A4576AEF1AD1458715F428B5`
- `README.md`: `705FFC23D333223D38D807CF8275EAC1C3C22C15201B99BEFEB79D2E0B3EFFD7`
- `DESIGN.md`: `62F880F285853DD53760834F71042B4C30256E4185BA727E24FD8C2E1B0D1D63`

## Verification at checkpoint

```text
node --check outputs/order-3/game.js       PASS
node --check work/smoke-test.js            PASS
node work/smoke-test.js                    ORDER//3 smoke tests passed
```

## Included hypothesis

ACT 08 is included: NORMAL Ember Rune deals 3 damage when stepped on, is consumed, and ends only the remaining steps of that current enemy movement event. It does not apply Root or cancel an adjacent post-movement attack.

## Pending, not included

ACT 09 is not decided or implemented. The leading candidate is an Ember Rune selection-time route marker showing which ACTION ORDER event would step on a legal trap cell and on which movement step. User feedback on whether route discovery feels strategic or merely opaque takes priority over that candidate.
