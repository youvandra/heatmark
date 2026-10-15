import { benchmarkFor, defaultFor, defaultWithMarkup, type Year } from "./tables";

/**
 * Share of free allocation still granted in each year (Directive 2003/87/EC,
 * Art. 10a(1a)). The free allocation adjustment to CBAM certificates scales
 * with it, so what an importer pays rises as it falls.
 */
export const CBAM_FACTOR: Record<Year, number> = {
  2026: 0.975,
  2027: 0.95,
  2028: 0.9,
  2029: 0.775,
  2030: 0.515,
  2031: 0.39,
  2032: 0.265,
  2033: 0.14,
  2034: 0,
};

export interface Good {
  country: string;
  cn: string;
  /** Picks between annex rows sharing a code, e.g. "grey" clinker. */
  variant?: string;
}

/**
 * Certificates owed per tonne of good:
 *   embedded emissions − BMg(route) × CBAM factor
 * The cross-sectoral correction factor is taken as 1 and stated as such.
 * Never negative: free allocation can cancel the obligation, never refund it.
 */
export function certificatesPerTonne(see: number, cn: string, route: string, year: Year): number {
  return Math.max(0, see - benchmarkFor(cn, route) * CBAM_FACTOR[year]);
}

export interface Comparison {
  year: Year;
  defaultSee: number;
  defaultRoute: string;
  actualSee: number;
  actualRoute: string;
  certsDefault: number;
  certsActual: number;
  /** Certificates saved per tonne by using verified actual data. */
  certsSaved: number;
  /** € saved per tonne at the given certificate price. */
  eurPerTonne: number;
}

/**
 * What a verified actual value is worth against the default an importer
 * would otherwise have to use for the same good.
 */
export function compare(good: Good, actualSee: number, actualRoute: string, year: Year, pricePerCert: number): Comparison {
  const row = defaultFor(good.country, good.cn, good.variant);
  const defaultRoute = (row.route ?? "*").split("/")[0];
  const defaultSee = defaultWithMarkup(row, year);
  const certsDefault = certificatesPerTonne(defaultSee, good.cn, defaultRoute, year);
  const certsActual = certificatesPerTonne(actualSee, good.cn, actualRoute, year);
  const certsSaved = certsDefault - certsActual;
  return {
    year,
    defaultSee,
    defaultRoute,
    actualSee,
    actualRoute,
    certsDefault,
    certsActual,
    certsSaved,
    eurPerTonne: certsSaved * pricePerCert,
  };
}
