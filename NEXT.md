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

## Demo data (15 Oct)
- Demo verifier 0xd2321c9236733B39D8994DDEbd2175896B8412dF is active on chain (`bun run contracts/script/add-verifier.ts`).
- `bun run demo:docs` writes byte-reproducible synthetic documents for two fictitious installations (Aegean Melt Shop and Aegean Rolling Mill, İzmir; English documents) plus one adversarial scrap receipt carrying an injected instruction. Every page is marked synthetic; every expected snippet is re-checked through the verifier's text extraction.
- Correct extraction should give: melt shop own 0.1104 t/t, rolling mill own 0.0673 t/t, rebar SEE 0.1822 t/t.

## Live extraction (15 Oct)
- `bun run demo/run-extraction.ts` scored 11/11 documents exactly (`demo/results/`, model `deepseek-v4-flash` through the git-ignored local adapter in `extract/src/local/`; the committed path uses the Anthropic SDK). Every field passed the snippet check; the adversarial scrap receipt's injected "production 900000" was quoted in warnings and not followed.
- The first run was 10/11: the model invented a `documentType` outside the enum, the schema check refused it. The local adapter now retries once with the validation error.

## Web (15–16 Oct)
- `web/` (Vite + React, CSS tokens in `src/styles.css`, brief in `docs/DESIGN.md`): landing `/`, app `/app` (Plant, Verifier, Passports), public passport `/p/:id`, `/docs`. Dev: API `bun --watch api/src/server.ts` (:8796) + `bun run --cwd web dev` (:5196, proxies `/api`).
- Demo signing roles come from `web/.env.local` (`VITE_DEMO_KEYS`, git-ignored) and exist only in a dev build; a production build carries no keys (checked by grepping `dist`).
- Writes simulate with `eth_call` first: Hashio's gas estimate drops revert data, so this is how a refusal shows its contract error name.
- Full flow run through the UI on Hedera testnet, 15–16 Oct: attestation #0 (melt shop, 0.110 t/t, 400 kt) and #1 (rolling mill, 0.067 t/t, 300 kt); passport #0 billet 520 t → rolling mill; passport #1 rebar 500 t → importer, SEE 0.182, €90/t (€44,999) saved vs default. Re-using billet #0 is refused (`PrecursorOverdrawn`). Importer salt for #1 is `DEMO_PASSPORT1_SALT` in `.env`.
- Local dev data lives in `./data` (git-ignored); it holds one extra installation registered by hand with the verifier key, from before the API refused that.

## Not done
- Tables are the regulation **as first published**; merge the correcting IR (EU) 2026/1740 (retroactive to 1 Jan 2026) before quoting rows publicly.
- HCS lifecycle topic (versioned envelopes: hashes, ids, masses only).
- Synthetic demo documents, video, write-up, deck PDF for the required upload.
- Demand evidence: 5–10 replies from Turkish exporters / CBAM consultants.
