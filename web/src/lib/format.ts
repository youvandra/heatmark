export const tonnes = (kg: string | number | bigint) => Number(kg) / 1000;

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const eur = (n: number, digits = 0) => `€${fmt(n, digits)}`;

/** t CO2e per t of good, always three decimals: the precision the passport carries. */
export const intensity = (n: number) => n.toFixed(3);

export const short = (hex: string, head = 6, tail = 4) =>
  hex.length > head + tail + 2 ? `${hex.slice(0, head + 2)}…${hex.slice(-tail)}` : hex;

export const FIELD_LABELS: Record<string, { label: string; unit: string }> = {
  production_t: { label: "Production", unit: "t" },
  natural_gas_gj: { label: "Natural gas", unit: "GJ" },
  natural_gas_kwh: { label: "Natural gas", unit: "kWh" },
  natural_gas_sm3: { label: "Natural gas", unit: "Sm³" },
  electricity_mwh: { label: "Electricity", unit: "MWh" },
  electricity_kwh: { label: "Electricity", unit: "kWh" },
  electrode_t: { label: "Electrodes", unit: "t" },
  electrode_kg: { label: "Electrodes", unit: "kg" },
  charge_carbon_t: { label: "Charge carbon", unit: "t" },
  limestone_t: { label: "Limestone", unit: "t" },
  dolomite_t: { label: "Dolomite", unit: "t" },
  scrap_t: { label: "Scrap", unit: "t" },
  precursor_t: { label: "Precursor received", unit: "t" },
};

export const CN_LABELS: Record<string, string> = {
  "72071114": "Billet",
  "72149910": "Rebar",
  "72131000": "Wire rod",
  "72081000": "Hot-rolled coil",
  "25231000": "Clinker",
};
