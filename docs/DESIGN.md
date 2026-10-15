# Heatmark — design brief

## References (15 Oct 2026)

| Source | What we take |
|---|---|
| Watershed (watershed.com) | Hairline grid that frames every block; mono labels; light-weight display type; a product fragment in the hero showing a supply chain as nodes with a kgCO₂e figure on each. That chain *is* our precursor chain. |
| Extend (extend.ai) | Warm paper background instead of white; `[01]`-style mono section indices; two-tone headlines (ink, then grey continuation); corner ticks on the grid. |
| Stegra (stegra.com) | Dot-matrix display type for the one figure that matters; calm industrial palette. |
| Dribbble — "Carbon Emission Dashboard" (Julian Schneider) | Incomplete data flagged *inline* with a flag glyph and a link to fix it, not hidden in a banner. Our unverified fields work the same way. |

## Language

The mill test certificate: the document that already travels with every heat of steel. A passport page should feel like one: a ruled sheet, labelled cells, machine values in mono, one stamped figure.

- **Paper and ink.** Background warm paper `#F5F3EE`, surfaces `#FBFAF7`, ink `#16181C`, secondary ink `#4A4E57` (dark enough to read; light UIs here have read as washed out before), rules `#D9D5CC`.
- **One heat colour.** `#E4572E` (molten orange) is the only saturated colour: the primary action on a screen, the active state, and exceptions (an unverified field, a revoked ancestor). A valid row carries no colour.
- **Type.** Geist for interface, Geist Mono for machine values (CN codes, hashes, `0.0.x` ids, tonnes), Doto (dot matrix) only for a view's hero figure.
- **Shape.** Radius 2px. No shadows, no tinted pills. State is a word plus a 2px edge marker.
- **Motion.** Springs on things a finger touches; nothing a reader must see depends on an animation having run.

## Information architecture

- `/` — landing: the €72/t problem, the chain visual, how it works in three steps, the trust model. "Open app" goes to the app.
- `/app` — shell with sidebar: **Plant** (reports, documents, fields, submit, passports), **Verifier** (queue, bundle, recompute, attest), **Passports** (issued, issue new).
- `/p/:id` — public passport, no wallet: chain, figures, status, € saved against the default, documents.
- `/docs` — the explanations that don't belong on screens.

Copy is one line per section. Loading is a skeleton sized to its content.
