# Heatmark — measured gap (15 Oct 2026)

Entry for the IEEE ClimateChain Global Hackathon (Devpost), carbon-markets track.
Submission window per Devpost schedule: 5 Oct 04:00 UTC – 25 Oct 14:00 UTC (21:00 WIB). The rules line "don't submit before 8 AM PT on 25 Oct" contradicts it; two participants asked in Discussions, no organizer reply as of 15 Oct. Form has no track selector and needs a file upload (≤35 MB).

## Verified facts

| Fact | Value | Source |
|---|---|---|
| Türkiye default, bars/rods & wire rod (CN 7213, 7214 20/91/99) | 2.310 tCO2e/t; 2.541 (2026, +10%), 3.003 (2028+, +30%) | IR (EU) 2025/2621 Annex I, Türkiye table, read from EUR-Lex |
| Production route behind that default | **(C) BF/BOF** — even though ~70% of Turkish steel is scrap EAF | same annex; EBRD / Aegean exporters (Eurometal, 3 Apr 2026) |
| Türkiye default, flat hot-rolled (7208) | 2.428; 2.670 (2026) | same |
| CBAM benchmark incl. precursors (BMg), wire rod 7213 | 1.364 (C) / 0.475 (D, DRI-EAF) / 0.066 (E, scrap-EAF) | IR (EU) 2025/2620, Column B |
| Clinker default (Türkiye has none, "other countries" applies) | 1.41; BM grey clinker 0.666 | 2025/2621, 2025/2620 |
| Türkçimento member clinker | ~0.88 tCO2/t (association figure) | ZKG 3/2026 via cbamguide |
| Turkish EAF average intensity | 0.29 tCO2/t steel | EBRD low-carbon pathway, steel |
| Türkiye → EU 2025 | Ch.72 steel 5.15 Mt (#1 extra-EU by qty), clinker 3.25 Mt, cement+clinker 6.12 Mt (#1) | Eurostat Comext via cbamguide |
| CBAM certificate price | Q1 €75.36, Q2 €75.28 (official); Q3 €82.32 (secondary only) | Commission / trade press |
| Türkiye ETS | Law 7552 (Jul 2025), ETS reg 27 Aug 2026, pilot 2026–27 MRV-only, 100% free → **no Art. 9 deduction** | ICAP, Argus, cbamguide |
| Verifiers | EU framework in place (DR 2025/2551, IR 2025/2546); first accreditations ~Sep 2026; only a few EU NABs take non-EU applicants | DEKRA, S&P Global, greensutra |
| Defaults corrected | IR 2026/1740 (20 Jul 2026), retroactive to 1 Jan 2026 — re-check the rows above against it | cbamguide, europalov |

## Model

Certificates per tonne = embedded emissions − BMg × CBAM factor (97.5% 2026, 95% 2027, 90% 2028, 51.5% 2030).
Cross-sectoral correction factor ignored (≈1). Price €82.32.

- **Default path:** EE = Türkiye default with mark-up; BM = route (C).
- **Actual path:** EE = verified plant value; BM = the plant's real route (E for scrap-EAF).

## Result — rebar / wire rod, scrap-EAF plant

| Actual intensity | 2026 gap | 2028 gap | 2030 gap |
|---|---|---|---|
| 0.30 t/t | €80/t | €126/t | €167/t |
| 0.40 t/t | €72/t | €118/t | €159/t |
| 0.60 t/t | €56/t | €102/t | €143/t |

Rebar sells at roughly €550–600/t, so the 2026 gap is ~12% of price.

**Market:** 70% EAF × 5.15 Mt = 3.6 Mt → **≈ €260M/yr (2026), ≈ €426M/yr (2028)**.
**Clinker:** 3.25 Mt × €55/t → ≈ €180M/yr (2026), €255M (2028).

Headline: **Turkish scrap-EAF steel is billed as blast-furnace steel unless it proves otherwise — about €72 per tonne in 2026, ~€0.26B a year for steel alone, rising to €0.43B by 2028.**

## Open / to verify before pitching

- Re-check rows against the 2026/1740 consolidated Excel.
- Q3 price from the Commission page.
- Real plant intensities (one Turkish mill's public sustainability report).
- Demand evidence: 5–10 replies from Turkish/Indonesian exporters or CBAM consultants.

## Prior art (name it in the write-up)

- Embedded Carbon Record (May 2026): verifier directory + hashed vault; claims >€1M/yr gap for a 10 kt exporter (≈ our €100/t order).
- Artem (€1.5M seed), CarbonChain, Cbamboo, Digicust: SaaS supplier-data collection.
- github.com/soccz/CBAM: SHA-256 anchoring on an Ethereum testnet.
- cbam-mcp (glama.ai, Turkish developer): default-value lookup tool.

Gap none of them close: **precursor chain** — one unverified upstream billet supplier pushes everything downstream onto defaults; and a verified plant's tonnage at a given intensity is finite, so attestations must be capped against it.
