# NEXT — Heatmark (IEEE ClimateChain, due 25 Oct 2026 21:00 WIB)

Read `docs/MEASURE.md` (numbers + sources) and `docs/SPEC.md` (design) first.

## Done (15 Oct)
- `calc/`: regulation tables as data (`calc/data/defaults.json` from IR 2025/2621 Annex I, Türkiye + other-countries tables; `benchmarks.json` from IR 2025/2620), CBAM formulas, integer `composeSee` shared with the contract. `bun test calc` 9 pass; `bun run verify` re-derives every number in MEASURE.md.
- `contracts/`: `Accreditation`, `Attestations`, `Passports` (Solidity 0.8.24, cancun, for Hedera EVM). `forge test`: 31 pass — unit tests for every revert, fuzz on SEE, differential against 120 calc fixtures (`bun run calc/scripts/fixtures.ts` regenerates them), 3 invariants (cap, consumption, revocation visibility) with an exercise check.

## Not done
- Tables are the regulation **as first published**; merge the correcting IR (EU) 2026/1740 (retroactive to 1 Jan 2026) before quoting rows publicly.
- Deploy to Hedera testnet (chainId 296, Hashio). Deploy with explicit gas limits (Hashio under-estimates); Sourcify verification so HashScan shows source. Needs an ECDSA testnet account.
- HCS lifecycle topic (versioned envelopes: hashes, ids, masses only).
- `extract/` (AI draft, human confirm), `api/`, `web/` (plant / verifier / public passport).
- Synthetic demo documents, video, write-up, deck PDF for the required upload.
- Demand evidence: 5–10 replies from Turkish exporters / CBAM consultants.
