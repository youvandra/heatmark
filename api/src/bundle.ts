import { createHash } from "node:crypto";
import { attributedEmissions } from "../../calc/src/emissions";
import { summarize, type ConfirmedField } from "../../extract/src/activity";

/**
 * The report bundle a verifier signs off on. Its sha256 is the reportHash
 * written into the attestation, so anyone holding the bundle can check the
 * chain points at exactly this content. Key order is canonical so the hash
 * doesn't depend on how the object was built.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

export interface BundleInput {
  installation: { id: string; name: string; country: string; registryId: string; operator: string; route: string };
  year: number;
  cnCode: string;
  documents: { filename: string; sha256: string }[];
  fields: (ConfirmedField & { document: string | null; page: number | null; snippet: string | null; source: string })[];
}

export function buildBundle(input: BundleInput) {
  const summary = summarize(input.fields);
  if (summary.unresolved.length) {
    const reasons = summary.unresolved.map((u) => `${u.key}: ${u.reason}`).join("; ");
    throw new BundleError(`report can't be submitted yet: ${reasons}`);
  }
  const emissions = attributedEmissions(summary.activity);
  const bundle = {
    schema: "heatmark/report-bundle/v1",
    installation: input.installation,
    year: input.year,
    cnCode: input.cnCode,
    documents: [...input.documents].sort((a, b) => a.sha256.localeCompare(b.sha256)),
    fields: input.fields,
    activity: summary.activity,
    scrapT: summary.scrapT,
    precursorT: summary.precursorT,
    emissions,
    // What the attestation carries, in the contract's integer units.
    onchain: {
      route: input.installation.route,
      ownIntensityMicro: Math.round(emissions.ownIntensity * 1_000_000),
      capKg: Math.round(summary.activity.productionT * 1000),
    },
    factors: "IPCC 2006 defaults (calc/src/emissions.ts)",
  };
  const json = canonicalJson(bundle);
  return { bundle, json, hash: `0x${sha256Hex(json)}` };
}

export class BundleError extends Error {}
