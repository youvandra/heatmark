import type { ActivityData } from "../../calc/src/emissions";
import type { FieldKey } from "./schema";

/**
 * Turns confirmed fields from many documents (twelve gas invoices, a
 * production log, ...) into one period's activity data. Sums and unit
 * conversions happen here, in code, never in the model.
 */
export interface ConfirmedField {
  key: FieldKey;
  value: number;
}

export interface ActivitySummary {
  activity: ActivityData;
  scrapT: number;
  precursorT: number;
  /** Fields that can't be used as they stand, and why. */
  unresolved: { key: FieldKey; reason: string }[];
}

const GJ_PER_KWH = 0.0036;

export function summarize(fields: ConfirmedField[]): ActivitySummary {
  const sum = (k: FieldKey) => fields.filter((f) => f.key === k).reduce((s, f) => s + f.value, 0);
  const unresolved: ActivitySummary["unresolved"] = [];

  if (sum("natural_gas_sm3") > 0) {
    unresolved.push({
      key: "natural_gas_sm3",
      reason: "gas in Sm³ needs the supplier's calorific value; enter the invoice's kWh or GJ figure instead",
    });
  }

  const activity: ActivityData = {
    productionT: sum("production_t"),
    naturalGasGJ: sum("natural_gas_gj") + sum("natural_gas_kwh") * GJ_PER_KWH,
    electrodeT: sum("electrode_t") + sum("electrode_kg") / 1000,
    chargeCarbonT: sum("charge_carbon_t"),
    limestoneT: sum("limestone_t"),
    dolomiteT: sum("dolomite_t"),
    electricityMWh: sum("electricity_mwh") + sum("electricity_kwh") / 1000,
  };
  if (!(activity.productionT > 0)) {
    unresolved.push({ key: "production_t", reason: "no production figure confirmed for the period" });
  }
  return { activity, scrapT: sum("scrap_t"), precursorT: sum("precursor_t"), unresolved };
}
