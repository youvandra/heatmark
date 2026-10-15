import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keccak256, toBytes } from "viem";
import { createApp, type AttestedEvent, type Deps } from "./app";
import { openDb } from "./db";
import type { ExtractResult } from "../../extract/src/extract";

const OPERATOR = "0x189De84f3832fB8FC1AF30712BDEF8F467f94210";
const GAS_CSV = "Fatura,Dönem\nDoğal gaz tüketimi,1.500.000 kWh\n";

let app: ReturnType<typeof createApp>;
let extractCalls = 0;
let nextEvent: Partial<AttestedEvent> = {};
let signerOk = true;

const fakeExtract: Deps["extract"] = async (): Promise<ExtractResult> => {
  extractCalls++;
  return {
    documentType: "gas_invoice",
    periodFrom: "2026-01-01",
    periodTo: "2026-12-31",
    issuer: "Demo Gaz A.Ş.",
    fields: [{ key: "natural_gas_kwh", value: 1_500_000, page: 1, snippet: "1.500.000 kWh", reference: null, check: "verified" }],
    warnings: [],
    model: "claude-opus-5-5",
    servedBy: "claude-opus-5-5",
    usage: { inputTokens: 1, outputTokens: 1 },
  };
};

// A two-passport chain on the fake ledger: billet (0) consumed by rebar (1).
const A_ID = keccak256(toBytes("TR/MS-001"));
const B_ID = keccak256(toBytes("TR/RM-001"));
const ascii = (s: string, bytes: number) => `0x${Buffer.from(s.padEnd(bytes, "\0")).toString("hex")}` as `0x${string}`;
let revokedA = false;
const fakeChain: Deps["chain"] = {
  count: async () => 2,
  passport: async (id) =>
    id === 0
      ? { attestationId: 0n, cnCode: ascii("72071114", 8), mass: 520_000n, consumed: 520_000n, see: 110_400, depth: 1, declared: false, holder: B_ID, docHash: "0x00" }
      : { attestationId: 1n, cnCode: ascii("72149910", 8), mass: 500_000n, consumed: 0n, see: 182_116, depth: 2, declared: false, holder: "0xabc", docHash: "0x00" },
  status: async (id) => (revokedA ? (id === 0 ? 1 : 2) : 0),
  precursors: async (id) => (id === 1 ? [{ passportId: 0n, mass: 520_000n }] : []),
  attestation: async (id) => ({
    installation: id === 0 ? A_ID : B_ID,
    year: 2026,
    route: ascii("E", 1),
    ownIntensity: id === 0 ? 110_400 : 67_300,
    cap: 400_000_000n,
    reportHash: "0x01",
    verifier: "0x02",
    operator: OPERATOR,
    revoked: id === 0 && revokedA,
  }),
  issued: async () => 1_000_000n,
};

beforeEach(() => {
  revokedA = false;
  extractCalls = 0;
  nextEvent = {};
  signerOk = true;
  app = createApp({
    db: openDb(":memory:"),
    blobDir: mkdtempSync(join(tmpdir(), "heatmark-")),
    extract: fakeExtract,
    attestedEvent: async () => nextEvent as AttestedEvent,
    verifierSigned: async () => signerOk,
    installationId: (country, id) => keccak256(toBytes(`${country.toUpperCase()}/${id}`)),
    chain: fakeChain,
    config: { chainId: 296 },
  });
});

const json = (method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

async function setupDraft() {
  const inst = await (await json("POST", "/installations", { name: "Izmir Melt Shop (synthetic)", country: "tr", registryId: "MS-001", operator: OPERATOR, route: "E" })).json();
  const rep = await (await json("POST", "/reports", { installationId: inst.id, year: 2026, cnCode: "72071114" })).json();
  return { inst, rep };
}

async function upload(reportId: number, name: string, content: string) {
  const form = new FormData();
  form.append("file", new File([content], name));
  return app.request(`/reports/${reportId}/documents`, { method: "POST", body: form });
}

describe("report lifecycle", () => {
  test("upload → extract → confirm → submit → attest", async () => {
    const { inst, rep } = await setupDraft();
    expect(inst.id).toBe(keccak256(toBytes("TR/MS-001")));

    const doc = await (await upload(rep.id, "gas-2026.csv", GAS_CSV)).json();
    expect(doc.sha256).toHaveLength(64);

    const ex = await (await json("POST", `/reports/${rep.id}/documents/${doc.id}/extract`)).json();
    expect(ex.fields[0].key).toBe("natural_gas_kwh");
    expect(extractCalls).toBe(1);

    // Submission is blocked until every field is confirmed.
    expect((await json("POST", `/reports/${rep.id}/submit`)).status).toBe(409);

    const detail = await (await json("GET", `/reports/${rep.id}`)).json();
    const gasField = detail.fields[0];
    await json("PATCH", `/fields/${gasField.id}`, { confirmed: true });

    // No production figure yet: the bundle refuses rather than divide by zero.
    const noProd = await json("POST", `/reports/${rep.id}/submit`);
    expect(noProd.status).toBe(409);
    expect((await noProd.json()).error).toContain("production_t");

    await json("POST", `/reports/${rep.id}/fields`, { key: "production_t", value: 30000, documentId: doc.id });
    const sub = await (await json("POST", `/reports/${rep.id}/submit`)).json();
    expect(sub.bundleHash).toMatch(/^0x[0-9a-f]{64}$/);

    // The bundle served is the exact bytes that were hashed.
    const raw = await (await json("GET", `/reports/${rep.id}/bundle`)).text();
    const hash = `0x${new Bun.CryptoHasher("sha256").update(raw).digest("hex")}`;
    expect(hash).toBe(sub.bundleHash);
    const bundle = JSON.parse(raw);
    expect(bundle.onchain.capKg).toBe(30_000_000);
    expect(bundle.onchain.ownIntensityMicro).toBe(Math.round(((1_500_000 * 0.0036 * 0.0561) / 30000) * 1e6));

    // Drafts only: a submitted report can't be edited.
    expect((await json("PATCH", `/fields/${gasField.id}`, { value: 1 })).status).toBe(409);

    nextEvent = {
      id: 7n,
      installation: inst.id,
      year: 2026,
      route: "0x45",
      ownIntensity: bundle.onchain.ownIntensityMicro,
      cap: 30_000_000n,
      reportHash: sub.bundleHash,
      operator: OPERATOR,
    };
    const att = await (await json("POST", `/reports/${rep.id}/attested`, { tx: `0x${"a".repeat(64)}` })).json();
    expect(att).toEqual({ id: rep.id, status: "attested", attestationId: 7 });
  });

  test("an attestation that doesn't match the bundle is refused", async () => {
    const { inst, rep } = await setupDraft();
    await json("POST", `/reports/${rep.id}/fields`, { key: "production_t", value: 1000 });
    await json("POST", `/reports/${rep.id}/fields`, { key: "electrode_t", value: 2 });
    const sub = await (await json("POST", `/reports/${rep.id}/submit`)).json();
    nextEvent = { id: 1n, installation: inst.id, year: 2026, route: "0x45", ownIntensity: 1, cap: 1_000_000n, reportHash: sub.bundleHash, operator: OPERATOR };
    const res = await json("POST", `/reports/${rep.id}/attested`, { tx: `0x${"b".repeat(64)}` });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("ownIntensity");
  });

  test("operator corrections are kept next to the model's reading", async () => {
    const { rep } = await setupDraft();
    const doc = await (await upload(rep.id, "gas.csv", GAS_CSV)).json();
    await json("POST", `/reports/${rep.id}/documents/${doc.id}/extract`);
    const f = (await (await json("GET", `/reports/${rep.id}`)).json()).fields[0];
    const fixed = await (await json("PATCH", `/fields/${f.id}`, { value: 1_400_000, confirmed: true })).json();
    expect(fixed.value).toBe(1_400_000);
    expect(fixed.corrected_from).toBe(1_500_000);
    expect(fixed.confirmed).toBe(1);
  });

  test("reject needs an active verifier's signature and returns the report to draft", async () => {
    const { rep } = await setupDraft();
    await json("POST", `/reports/${rep.id}/fields`, { key: "production_t", value: 1000 });
    await json("POST", `/reports/${rep.id}/submit`);
    signerOk = false;
    const body = { reason: "electrode invoice missing", address: OPERATOR, signature: "0x00" };
    expect((await json("POST", `/reports/${rep.id}/reject`, body)).status).toBe(403);
    signerOk = true;
    expect((await (await json("POST", `/reports/${rep.id}/reject`, body)).json()).status).toBe("draft");
  });

  test("input validation", async () => {
    expect((await json("POST", "/installations", { name: "x", country: "TR", registryId: "1", operator: "nope", route: "E" })).status).toBe(400);
    expect((await json("POST", "/installations", { name: "x", country: "TR", registryId: "1", operator: OPERATOR, route: "Z" })).status).toBe(400);
    const { rep } = await setupDraft();
    expect((await upload(rep.id, "evil.exe", "x")).status).toBe(400);
    expect((await json("POST", `/reports/${rep.id}/fields`, { key: "emissions_t", value: 1 })).status).toBe(400);
    expect((await json("POST", `/reports/${rep.id}/fields`, { key: "production_t", value: -1 })).status).toBe(400);
    expect((await json("GET", "/blobs/../../etc/passwd")).status).toBe(404);
    expect((await json("GET", `/blobs/${"0".repeat(64)}`)).status).toBe(404);
  });

  test("uploaded documents are served back by hash", async () => {
    const { rep } = await setupDraft();
    const doc = await (await upload(rep.id, "gas.csv", GAS_CSV)).json();
    const res = await json("GET", `/blobs/${doc.sha256}`);
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(await res.text()).toBe(GAS_CSV);
  });
});

describe("passports", () => {
  async function registerBoth() {
    await json("POST", "/installations", { name: "Melt shop", country: "TR", registryId: "MS-001", operator: OPERATOR, route: "E" });
    await json("POST", "/installations", { name: "Rolling mill", country: "TR", registryId: "RM-001", operator: OPERATOR, route: "E" });
  }

  test("a passport shows its chain, names and the saving against the default", async () => {
    await registerBoth();
    const p = await (await json("GET", "/passports/1")).json();
    expect(p.cnCode).toBe("72149910");
    expect(p.see).toBeCloseTo(0.182116, 6);
    expect(p.installation.name).toBe("Rolling mill");
    expect(p.holder).toEqual({ kind: "importer" });
    expect(p.precursors[0].installation.name).toBe("Melt shop");
    expect(p.precursors[0].holder.name).toBe("Rolling mill");
    expect(p.precursors[0].usedKg).toBe("520000");
    // TR rebar default 2.541 (2026) on the BF/BOF benchmark vs 0.182 on scrap/EAF
    const expectedCerts = 2.541 - 1.364 * 0.975 - (0.182116 - 0.066 * 0.975);
    expect(p.savings.eurPerTonne).toBeCloseTo(expectedCerts * 82.32, 6);
    expect(p.savings.eurShipment).toBeCloseTo(expectedCerts * 82.32 * 500, 4);
  });

  test("a revoked ancestor shows downstream", async () => {
    await registerBoth();
    revokedA = true;
    const p = await (await json("GET", "/passports/1")).json();
    expect(p.status).toBe("ancestor_revoked");
    expect(p.precursors[0].status).toBe("revoked");
  });

  test("unknown passport is 404", async () => {
    expect((await json("GET", "/passports/9")).status).toBe(404);
    expect((await json("GET", "/passports/x")).status).toBe(404);
  });
});
