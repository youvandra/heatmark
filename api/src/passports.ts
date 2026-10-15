import type { Database } from "bun:sqlite";
import { hexToString, type Hex } from "viem";
import { compare } from "../../calc/src/cbam";
import type { Year } from "../../calc/src/tables";

/** Q3 2026 CBAM certificate price; the page states which price it used. */
export const CERT_PRICE = { eur: 82.32, label: "Q3 2026" };

export interface ChainReader {
  passport(id: number): Promise<{
    attestationId: bigint;
    cnCode: Hex;
    mass: bigint;
    consumed: bigint;
    see: number;
    depth: number;
    declared: boolean;
    holder: Hex;
    docHash: Hex;
  }>;
  status(id: number): Promise<number>;
  precursors(id: number): Promise<{ passportId: bigint; mass: bigint }[]>;
  attestation(id: number): Promise<{
    installation: Hex;
    year: number;
    route: Hex;
    ownIntensity: number;
    cap: bigint;
    reportHash: Hex;
    verifier: Hex;
    operator: Hex;
    revoked: boolean;
  }>;
  issued(attestationId: number): Promise<bigint>;
  count(): Promise<number>;
}

const STATUS = ["valid", "revoked", "ancestor_revoked"] as const;
const cnOf = (b: Hex) => hexToString(b).replace(/\0/g, "");
const routeOf = (b: Hex) => hexToString(b).replace(/\0/g, "");

export interface PassportView {
  id: number;
  cnCode: string;
  massKg: string;
  consumedKg: string;
  see: number;
  depth: number;
  declared: boolean;
  status: (typeof STATUS)[number];
  holder: { kind: "installation"; id: string; name: string } | { kind: "importer" };
  docHash: string;
  attestation: {
    id: number;
    year: number;
    route: string;
    ownIntensity: number;
    capKg: string;
    issuedKg: string;
    reportHash: string;
    verifier: string;
    operator: string;
    revoked: boolean;
    reportId: number | null;
  };
  installation: { id: string; name: string; country: string } | null;
  precursors: (PassportView & { usedKg: string })[];
  savings: { year: Year; defaultSee: number; certsDefault: number; certsActual: number; eurPerTonne: number; eurShipment: number; price: typeof CERT_PRICE } | null;
}

export async function passportView(id: number, chain: ChainReader, db: Database, depth = 0): Promise<PassportView> {
  const [p, status, uses] = await Promise.all([chain.passport(id), chain.status(id), chain.precursors(id)]);
  const attId = Number(p.attestationId);
  const [a, issued] = await Promise.all([chain.attestation(attId), chain.issued(attId)]);
  const inst = db.query("SELECT id, name, country FROM installations WHERE lower(id) = lower(?)").get(a.installation) as any;
  const holderInst = db.query("SELECT id, name FROM installations WHERE lower(id) = lower(?)").get(p.holder) as any;
  const report = db.query("SELECT id FROM reports WHERE attestation_id = ?").get(attId) as any;

  const precursors =
    depth < 4
      ? await Promise.all(
          uses.map(async (u) => ({ ...(await passportView(Number(u.passportId), chain, db, depth + 1)), usedKg: u.mass.toString() })),
        )
      : [];

  const cnCode = cnOf(p.cnCode);
  const route = routeOf(a.route);
  const see = p.see / 1_000_000;
  let savings: PassportView["savings"] = null;
  if (inst) {
    try {
      const c = compare({ country: inst.country, cn: cnCode }, see, route, 2026, CERT_PRICE.eur);
      const tonnes = Number(p.mass) / 1000;
      savings = {
        year: 2026,
        defaultSee: c.defaultSee,
        certsDefault: c.certsDefault,
        certsActual: c.certsActual,
        eurPerTonne: c.eurPerTonne,
        eurShipment: c.eurPerTonne * tonnes,
        price: CERT_PRICE,
      };
    } catch {
      // a CN code without a default or benchmark row: show the passport without a saving
    }
  }

  return {
    id,
    cnCode,
    massKg: p.mass.toString(),
    consumedKg: p.consumed.toString(),
    see,
    depth: p.depth,
    declared: p.declared,
    status: STATUS[status] ?? "valid",
    holder: holderInst ? { kind: "installation", id: holderInst.id, name: holderInst.name } : { kind: "importer" },
    docHash: p.docHash,
    attestation: {
      id: attId,
      year: Number(a.year),
      route,
      ownIntensity: a.ownIntensity / 1_000_000,
      capKg: a.cap.toString(),
      issuedKg: issued.toString(),
      reportHash: a.reportHash,
      verifier: a.verifier,
      operator: a.operator,
      revoked: a.revoked,
      reportId: report?.id ?? null,
    },
    installation: inst ? { id: inst.id, name: inst.name, country: inst.country } : null,
    precursors,
    savings,
  };
}
