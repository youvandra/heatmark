# Heatmark — technical spec (v0.1, 15 Oct 2026)

Track: carbon markets. Numbers and sources: `MEASURE.md`.

## 1. One-line

**Heatmark** — a verified carbon number for every heat, from the melt shop to EU customs.

The name: in steelmaking a *heat* is one melt of the furnace, and its heat number already travels on the mill test certificate from billet to rebar to buyer. Heatmark gives that same batch a verified emissions figure.

A verified emissions number, carried per shipment from the melt shop to the EU customs declaration, composed across precursors and capped by verified output.

## 2. Roles

| Role | Real-world analogue | Can do | Cannot do |
|---|---|---|---|
| Accreditor | National accreditation body (Accredia, RvA, Swedac, later TÜRKAK) | Add / suspend verifiers | Attest, issue passports, edit anything |
| Verifier | ISO 14065 body accredited for CBAM | Attest an installation-period, revoke its own attestation | Issue passports |
| Operator | Installation (melt shop, rolling mill, cement plant) | Draft reports, issue passports against its own attestation | Change an attestation, exceed its cap |
| Importer | EU CBAM declarant | Read, export, mark a passport as declared | Anything else |

No account can do two of these jobs. There is no admin that can mint or edit a passport. Contracts are not upgradeable.

## 3. Domain model (CBAM methodology, simplified to what the demo needs)

Specific embedded emissions of a good (definitive period, steel: direct only, indirect not counted):

```
SEE_good = (AttrEm_own + Σ_i  m_i × SEE_precursor_i) / production
```

- `AttrEm_own`: the installation's attributed direct emissions for the period (fuel + electrodes + carbon charge − carbon leaving in product/slag), from the verified report.
- `m_i`: mass of precursor *i* consumed (e.g. 1.06 t billet per t rebar).
- `SEE_precursor_i`: taken from the precursor's own passport. A precursor with no passport means the default value applies, and the resulting passport is flagged **partial**.

Certificate cost and savings, computed off-chain and shown in the UI:

```
certs_default/t = default_CN × (1 + markup_y) − BMg(default route) × CBAMfactor_y
certs_actual/t  = SEE                         − BMg(actual route)  × CBAMfactor_y
saving/t        = (certs_default − certs_actual) × CBAM price_q
```

Tables loaded from IR 2025/2621 (as corrected by 2026/1740) and IR 2025/2620 into `calc/data/*.json`, each row carrying its CN code and source reference.

## 4. Contracts (Solidity, Foundry)

Units: intensity in µt CO2e per t (uint32, 1e6 = 1.000 t/t); mass in kg (uint64).

### `Accreditation.sol`
- `accreditor`: immutable address (in the demo a 2-of-3 Safe, standing in for an accreditation body).
- `addVerifier(addr, name, scopeMask)` / `suspendVerifier(addr)`.
- `isActive(addr) → bool`.

### `Attestations.sol`
```
struct Attestation {
  bytes32 installation;   // keccak(country, registry id)
  uint16  year;
  uint8   route;          // C BF/BOF, D DRI/EAF, E scrap/EAF, A clinker ...
  uint32  ownIntensity;   // AttrEm_own / production, µt/t
  uint64  cap;            // verified production, kg
  uint64  issued;         // kg already passported
  bytes32 reportHash;     // sha256 of the verified report bundle
  address verifier;
  address operator;
  bool    revoked;
}
```
- `attest(...)`: active verifier only. One live attestation per (installation, year).
- `revoke(id, reasonHash)`: the attesting verifier or the accreditor.

### `Passports.sol`
```
struct Passport {
  uint256 attestationId;
  bytes8  cnCode;
  uint64  mass;           // kg
  uint64  consumed;       // kg drawn down by downstream passports
  uint32  see;            // computed on chain, µt/t
  bool    partial;        // some precursor fell back to default
  bytes32 holder;         // keccak(next installation id) or keccak(importer EORI, salt)
  bytes32 docHash;        // shipment documents
}
struct PrecursorUse { uint256 passportId; uint64 mass; }
```
`issue(attestationId, cnCode, mass, PrecursorUse[] uses, defaultUses[], holder, docHash)`:
1. Caller is the attestation's operator; the attestation is live and not revoked.
2. `issued + mass ≤ cap`, else revert `OverCap`.
3. Each precursor passport is held by this installation (`holder == keccak(installation)`) and has `consumed + use.mass ≤ mass`, else revert `PrecursorOverdrawn`.
4. `see` is computed on chain from `ownIntensity` and the precursor SEEs, so no party types the final number.
5. Debits the cap and each precursor's `consumed`.

`status(passportId) → Valid | Partial | Revoked | AncestorRevoked`. Walks the precursor tree (depth ≤ 4 for the demo).
`markDeclared(passportId, declarationRef)`: by the importer holder, once only, so the same tonnage cannot back two declarations.

### Privacy
- On chain: hashes, intensities, masses.
- Off chain: documents, buyer names, prices.
- `holder` for an importer is salted, so buyer relationships aren't readable from the chain.

### Tests (targets)
- Unit tests for every revert path.
- Invariants:
  - Σ issued ≤ cap per attestation.
  - consumed ≤ mass per passport.
  - A revoked ancestor always surfaces in `status`.
  - `see` equals the TypeScript calculator on 200 random fixtures (differential test).

## 5. Off-chain

### `calc/` (TypeScript, pure)
- CBAM formulas, default and benchmark tables, mark-up and CBAM factor by year.
- Same fixtures as the forge differential test.
- `bun run verify` re-derives every number in `MEASURE.md`.

### `extract/` (AI draft, human confirm)
- Input: PDFs and spreadsheets (electricity bill, gas invoice, electrode purchase, scrap receipts, production log).
- Model: latest Claude (read the claude-api skill before writing this module).
- The model returns structured fields only, each with a source page and quoted snippet:
  - natural gas Nm³
  - electrode tonnes
  - charge carbon
  - production tonnes
  - precursor receipts
- Emission factors and arithmetic are in `calc/`; the model never outputs an emissions number.
- The UI shows every field next to its snippet, and the operator confirms each one before "Send to verifier".
- Prompt-injection red team: documents carrying instructions get extracted as data, and the run is logged.

### `api/` (Bun + Hono, SQLite)
- Stores document blobs by sha256.
- Builds the report bundle.
- Relays nothing: every chain write is signed by the acting role's wallet in the browser.

### `web/` (React + Vite)
- `/plant`: upload → extracted fields → computed intensity and € saving → send → issue passport (pick precursor passports).
- `/verifier`: queue, report bundle, recompute button, Approve/Reject (wallet sign), Revoke.
- `/p/:id`: public passport page with QR code, precursor chain, status, € saving vs default, and an "Export for CBAM declaration" button (CSV/XML stand-in).
- Demo role switcher with four labelled demo wallets.

## 6. Chain: Hedera testnet

The hackathon names no chain (checked the overview, rules, updates and discussions on 15 Oct). Hedera fits the problem:
- Fixed, tiny fees in USD.
- Council-governed network, a familiar trust story for regulators and accreditation bodies.
- HCS gives an ordered, timestamped public log without a contract.
- Hedera's Guardian is the sustainability standard on the network. Its roles (Standard Registry, VVB, Project Proponent) match ours one to one.

**Why Hedera over the alternatives** (researched 15 Oct; the organizers and judges use no chain of their own):
- The judges' own talks cite public Ethereum and permissioned Hyperledger (Dr. Elvan Duman, a judge, spoke on permissioned blockchains). Expect "why not permissioned?".
- Hedera answers both: council-governed (consortium-like) yet publicly verifiable through mirror nodes. An EU importer or customs officer can check a passport without joining a network.
- Real climate adoption to cite:
  - Verra's registry integration;
  - BCarbon moving 2M+ credits from Polygon to Hedera (Feb 2026);
  - Guardian's methodology library (Verra, Gold Standard, GHG Protocol).
- **Hyperledger Fabric** dominates academic MRV prototypes. Its chaincode is Go, it is heavy to run, and outsiders can't verify anything, so it doesn't fit 10 days.
- **Polygon** just lost BCarbon to Hedera.
- **EBSI** has no carbon/CBAM use case found.
- Portability line for the write-up: the contracts are plain Solidity, so the same code runs on a permissioned Hyperledger Besu consortium if accreditation bodies want one.

**Layout**
- **Hedera EVM (Solidity, Foundry, Hashio JSON-RPC, chainId 296):** `Accreditation`, `Attestations`, `Passports`. Enforcement lives here (cap, precursor draw-down, on-chain SEE, revocation).
- **HCS topic per installation:** the report lifecycle as versioned envelopes:
  - draft submitted (bundle hash),
  - verifier opinion,
  - attestation id,
  - each passport issued,
  - revocation.

  Every event carries hashes, ids and masses only, never documents or buyers. Anyone can replay the history from the mirror node.
- **Mirror node REST** powers the public passport page and the audit timeline.
- **Stretch:** mint each passport as an HTS NFT through the HTS system contract (`0x167`), so the importer literally holds it and `markDeclared` burns it.

**Hedera specifics to respect** (from earlier Hedera deployments):
- Every party has a `0.0.x` id and an `0x` EVM alias. Show `0.0.x` to people, sign against `0x`.
- EVM tooling needs ECDSA (secp256k1) accounts; Guardian wants ED25519. We don't run Guardian, so use ECDSA everywhere.
- Hedera charges at least 80% of the gas limit, so set limits from estimates and avoid blanket high limits.
- Read receipts from the mirror node with a short delay; queue transactions per key.

**Guardian.** Not run in the build: it's a heavy multi-service stack and has no CBAM policy in its library. The write-up names it as the path to production: the same roles published as a Guardian policy, so verifiers already on Guardian can attest.

## 7. Demo data (stated as synthetic)

- **Installation A:** Izmir scrap-EAF melt shop, billet 7207. Synthetic monthly documents sized to 0.33 t/t own intensity.
- **Installation B:** rolling mill, rebar 7214 99. Own intensity 0.05 t/t, consuming 1.06 t billet per t.
- **Importer:** a German rebar distributor.
- **Shipment:** 500 t.
- **Expected screen:** SEE about 0.40 t/t; saving vs default about €72/t, so about €36k per shipment (2026).
- **Refusal beat:**
  - B tries to passport 50 t beyond its cap, and the tx reverts with `OverCap`.
  - B tries to reuse A's billet passport, and the tx reverts with `PrecursorOverdrawn`.

## 8. Judging map

| Criterion | Evidence |
|---|---|
| Climate impact | Rewards low-carbon EAF over BF at the border; €260M/yr signal (MEASURE.md) |
| Innovation | Precursor-composed passports + verified-output cap; prior art named |
| Technical execution | Live contracts, on-chain SEE, invariant + differential tests, reverted txs in demo |
| Practical usefulness | Matches the real CBAM roles and the 30 Sep 2027 first declaration; exporter survey |
| Presentation | 3–5 min video around one shipment |

## 9. Plan

| Date | Work |
|---|---|
| 15–16 Oct | `calc/` + tables + `bun run verify`; contracts + tests |
| 17–20 Oct | Exporter / CBAM-consultant survey |
| 21 Oct | `extract/` + `api/` |
| 22 Oct | `web/` three pages |
| 23 Oct | Synthetic documents, deploy to Hedera testnet and the VPS, end-to-end run |
| 24 Oct | Video, write-up, README |
| 25 Oct | Submit before 21:00 WIB (confirm the submission window with the manager first) |

## 10. Open

- Demand: 5–10 replies from Turkish exporters / CBAM consultants (LinkedIn, Turkish exporter associations).
- Rows re-checked against the 2026/1740 consolidated Excel.
