/**
 * Attributed direct emissions of an EAF installation for a reporting period,
 * calculation-based (activity data × emission factor), the approach the CBAM
 * monitoring rules allow for source streams. Indirect emissions (electricity)
 * are reported but not counted for iron and steel in the definitive period.
 *
 * Factors are IPCC 2006 defaults. A verified plant-specific factor replaces a
 * default; the report records which one was used.
 */
export const FACTORS = {
  /** tCO2 per GJ of natural gas (IPCC 2006 Vol. 2, Table 1.4: 56.1 tCO2/TJ). */
  naturalGasPerGJ: 0.0561,
  /** tCO2 per t of EAF carbon electrode (0.82 tC/t, IPCC 2006 Vol. 3, Table 4.3). */
  electrodePerT: 0.82 * (44 / 12),
  /** tCO2 per t of EAF charge carbon / injection coal (0.83 tC/t, ibid.). */
  chargeCarbonPerT: 0.83 * (44 / 12),
  /** tCO2 per t of limestone CaCO3 (0.43971, IPCC 2006 Vol. 3, Table 2.1). */
  limestonePerT: 0.43971,
  /** tCO2 per t of dolomite CaMg(CO3)2 (0.47732, ibid.). */
  dolomitePerT: 0.47732,
} as const;

export interface ActivityData {
  /** t of good produced in the period (the denominator). */
  productionT: number;
  naturalGasGJ?: number;
  electrodeT?: number;
  chargeCarbonT?: number;
  limestoneT?: number;
  dolomiteT?: number;
  /** Reported only; not counted for iron and steel. */
  electricityMWh?: number;
}

export interface EmissionsResult {
  /** tCO2 per source stream, so a verifier can recompute each line. */
  lines: { stream: string; activity: number; unit: string; factor: number; tCO2: number }[];
  totalT: number;
  /** Own specific emissions, t CO2 per t of good, precursors excluded. */
  ownIntensity: number;
}

export function attributedEmissions(a: ActivityData): EmissionsResult {
  if (!(a.productionT > 0)) throw new Error("production must be positive");
  const streams: [string, number | undefined, string, number][] = [
    ["natural gas", a.naturalGasGJ, "GJ", FACTORS.naturalGasPerGJ],
    ["electrodes", a.electrodeT, "t", FACTORS.electrodePerT],
    ["charge carbon", a.chargeCarbonT, "t", FACTORS.chargeCarbonPerT],
    ["limestone", a.limestoneT, "t", FACTORS.limestonePerT],
    ["dolomite", a.dolomiteT, "t", FACTORS.dolomitePerT],
  ];
  const lines = streams
    .filter(([, v]) => v !== undefined && v > 0)
    .map(([stream, activity, unit, factor]) => ({
      stream,
      activity: activity!,
      unit,
      factor,
      tCO2: activity! * factor,
    }));
  const totalT = lines.reduce((s, l) => s + l.tCO2, 0);
  return { lines, totalT, ownIntensity: totalT / a.productionT };
}
