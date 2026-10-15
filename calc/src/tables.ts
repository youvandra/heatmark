import defaultsJson from "../data/defaults.json";
import benchmarksJson from "../data/benchmarks.json";

export type Year = 2026 | 2027 | 2028 | 2029 | 2030 | 2031 | 2032 | 2033 | 2034;

export interface DefaultRow {
  cn: string;
  desc: string;
  direct: number | null;
  indirect: number | null;
  total: number | null;
  y2026: number | null;
  y2027: number | null;
  y2028: number | null;
  route: string | null;
}

interface BenchmarkRow {
  cn: string;
  colA: Record<string, number>;
  colB: Record<string, number>;
}

const defaults = defaultsJson as unknown as {
  countries: Record<string, DefaultRow[]>;
};
const benchmarks = benchmarksJson as unknown as { rows: BenchmarkRow[] };

const normalize = (cn: string) => cn.replace(/\s+/g, "");

/**
 * Default value row for a good from a country. The annex lists codes at 4, 6
 * or 8 digits, so the longest listed prefix wins. Countries without a row for
 * the good fall back to the "Other countries and territories" table, which is
 * what the regulation prescribes. `variant` picks between rows that share a
 * code (grey vs white clinker).
 */
export function defaultFor(country: string, cn: string, variant?: string): DefaultRow & { table: string } {
  const code = normalize(cn);
  for (const table of [country, "OTHER"]) {
    const rows = defaults.countries[table];
    if (!rows) continue;
    const hits = rows
      .filter((r) => code.startsWith(r.cn) && r.total !== null)
      .filter((r) => !variant || r.desc.toLowerCase().includes(variant.toLowerCase()))
      .sort((a, b) => b.cn.length - a.cn.length);
    if (hits.length) return { ...hits[0], table };
  }
  throw new Error(`no default value for CN ${code} (${country})`);
}

/** Default value including that year's mark-up; 2028 onwards keeps the 2028 column. */
export function defaultWithMarkup(row: DefaultRow, year: Year): number {
  const v = year === 2026 ? row.y2026 : year === 2027 ? row.y2027 : row.y2028;
  if (v === null) throw new Error(`default for ${row.cn} has no ${year} value`);
  return v;
}

/**
 * CBAM benchmark including precursors (Column B, BMg) for a CN code and
 * production route. Route-independent rows carry the key "*".
 */
export function benchmarkFor(cn: string, route: string): number {
  const code = normalize(cn);
  const row = benchmarks.rows.find((r) => r.cn === code);
  if (!row) throw new Error(`no CBAM benchmark for CN ${code}`);
  const v = row.colB[route] ?? row.colB["*"];
  if (v === undefined) {
    throw new Error(`CN ${code} has no benchmark for route ${route} (has ${Object.keys(row.colB).join(", ")})`);
  }
  return v;
}
