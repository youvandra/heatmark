// Re-derives every number docs/MEASURE.md states, from the regulation tables
// in calc/data. Exits non-zero when a stated number no longer follows.
import { compare, type Year } from "../src/index";

const PRICE = 82.32; // € per certificate, Q3 2026 (secondary); Q1 75.36, Q2 75.28 official
const REBAR = { country: "TR", cn: "72149910" };
const CLINKER = { country: "TR", cn: "25231000", variant: "grey" };
const EU_CH72_FROM_TR_T = 5_150_000; // Eurostat Comext 2025, via cbamguide
const EAF_SHARE = 0.7; // EBRD; Aegean exporters' association
const CLINKER_FROM_TR_T = 3_250_000;

let failed = 0;
function check(label: string, got: number, stated: number) {
  const ok = Math.round(got) === stated;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got.toFixed(2)} (stated ${stated})`);
}

const table: [number, Year, number][] = [
  [0.3, 2026, 80], [0.3, 2028, 126], [0.3, 2030, 167],
  [0.4, 2026, 72], [0.4, 2028, 118], [0.4, 2030, 159],
  [0.6, 2026, 56], [0.6, 2028, 102], [0.6, 2030, 143],
];
for (const [act, year, stated] of table) {
  check(`rebar ${act} t/t ${year} €/t`, compare(REBAR, act, "E", year, PRICE).eurPerTonne, stated);
}

const eafTonnes = EU_CH72_FROM_TR_T * EAF_SHARE;
check("steel market 2026 €M", (compare(REBAR, 0.4, "E", 2026, PRICE).eurPerTonne * eafTonnes) / 1e6, 260);
check("steel market 2028 €M", (compare(REBAR, 0.4, "E", 2028, PRICE).eurPerTonne * eafTonnes) / 1e6, 426);

const clinker26 = compare(CLINKER, 0.88, "A", 2026, PRICE);
check("clinker 2026 €/t", clinker26.eurPerTonne, 55);
check("clinker 2026 €M", (clinker26.eurPerTonne * CLINKER_FROM_TR_T) / 1e6, 180);
check("clinker 2028 €M", (compare(CLINKER, 0.88, "A", 2028, PRICE).eurPerTonne * CLINKER_FROM_TR_T) / 1e6, 255);

if (failed) {
  console.error(`${failed} stated number(s) no longer follow from the tables`);
  process.exit(1);
}
console.log("every number in MEASURE.md re-derived");
