import { z } from "zod";

/**
 * The only quantities the model may report. Each maps to an activity-data
 * input in calc/emissions.ts or to the production / precursor ledger; the
 * model never reports an emissions figure.
 */
export const FIELD_KEYS = [
  "production_t",
  "natural_gas_gj",
  "natural_gas_kwh",
  "natural_gas_sm3",
  "electricity_mwh",
  "electricity_kwh",
  "electrode_t",
  "electrode_kg",
  "charge_carbon_t",
  "limestone_t",
  "dolomite_t",
  "scrap_t",
  "precursor_t",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const DOCUMENT_TYPES = [
  "electricity_bill",
  "gas_invoice",
  "electrode_purchase",
  "carbon_purchase",
  "flux_purchase",
  "scrap_receipt",
  "production_log",
  "precursor_delivery",
  "other",
] as const;

export const Extraction = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  /** ISO dates of the period the document covers, when it states one. */
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  issuer: z.string().nullable(),
  fields: z.array(
    z.object({
      key: z.enum(FIELD_KEYS),
      value: z.number(),
      /** 1-based page the snippet is on (1 for spreadsheets / text). */
      page: z.number().int(),
      /** Copied verbatim from the document, containing the number. */
      snippet: z.string(),
      /** Supplier passport id or invoice number, for precursor_t only. */
      reference: z.string().nullable(),
    }),
  ),
  /** Anything the operator should look at: ambiguity, missing units, oddities. */
  warnings: z.array(z.string()),
});
export type Extraction = z.infer<typeof Extraction>;
