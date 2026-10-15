# NEXT — Heatmark (IEEE ClimateChain, due 25 Oct 2026 21:00 WIB)

Read `docs/MEASURE.md` (numbers + sources) and `docs/SPEC.md` (design) first.

## Done (15 Oct)
- `calc/`: regulation tables as data (`calc/data/defaults.json` from IR 2025/2621 Annex I, Türkiye + other-countries tables; `benchmarks.json` from IR 2025/2620), CBAM formulas, integer `composeSee` shared with the contract. `bun test calc` 9 pass; `bun run verify` re-derives every number in MEASURE.md.
- `contracts/`: `Accreditation`, `Attestations`, `Passports` (Solidity 0.8.24, cancun, for Hedera EVM). `forge test`: 31 pass — unit tests for every revert, fuzz on SEE, differential against 120 calc fixtures (`bun run calc/scripts/fixtures.ts` regenerates them), 3 invariants (cap, consumption, revocation visibility) with an exercise check.

## Deployed (15 Oct) — Hedera testnet, chainId 296
Source verified on Sourcify (`exact_match`), so HashScan shows it. Addresses in `deployments/hedera-testnet.json`; redeploy with `bun run deploy`.

| Contract | Id | EVM |
|---|---|---|
| Accreditation | 0.0.11033691 | 0x4c607b4caea9319f8f568e55d904ea185183084d |
| Attestations | 0.0.11033693 | 0xfb324d8e9bb9bf048d30cf4038cb4cfb7cf08243 |
| Passports | 0.0.11033695 | 0x6b1ba45f8ff91d33d5337c7f78118f360d23d055 |

Deployer 0.0.11033671. Accreditor 0x35a70Ae4472186EB2884eA16D8761FC9f6Ad8063 (immutable). Role keys (accreditor, verifier, melt shop, rolling mill, importer) are in `.env` and unfunded; no verifier added yet.

## Extract + API (15 Oct)
- `extract/`: Claude (`claude-opus-5-5`, structured output via Zod, `fallbacks: "default"`) reads a PDF/CSV and returns fields with page + verbatim snippet. `verify.ts` checks each snippet is on its page and holds the value; units are converted and summed in code (`activity.ts`), never by the model. Prompt treats document text as data.
- `calc/src/emissions.ts`: IPCC 2006 default factors, attributed direct emissions and own intensity.
- `api/` (Bun + Hono + SQLite, `bun run api/src/server.ts`, port 8796, data in `./data`): installations, reports, document upload (content-addressed blobs), extract, confirm/correct fields, submit (canonical bundle → sha256 = reportHash), verifier reject (signed message + on-chain `isActive`), attested (decodes the tx and refuses a mismatch with the bundle).
- `bun test`: 27 pass (calc, extract checks, API lifecycle with fakes). Live chain read smoke-tested.

## Not done
- Tables are the regulation **as first published**; merge the correcting IR (EU) 2026/1740 (retroactive to 1 Jan 2026) before quoting rows publicly.
- HCS lifecycle topic (versioned envelopes: hashes, ids, masses only).
- `web/` (plant / verifier / public passport) on top of the API.
- First live extraction run (costs API credit — ask first) against synthetic plant documents, which don't exist yet.
- Add the demo verifier on chain (accreditor key) — `isActive(verifier)` is false today.
- Synthetic demo documents, video, write-up, deck PDF for the required upload.
- Demand evidence: 5–10 replies from Turkish exporters / CBAM consultants.
