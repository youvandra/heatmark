import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { FIELD_KEYS, type FieldKey } from "../../extract/src/schema";
import type { ExtractResult } from "../../extract/src/extract";
import { BundleError, buildBundle, sha256Hex } from "./bundle";
import type { ReportStatus } from "./db";

type MediaType = "application/pdf" | "text/csv" | "text/plain";

export interface AttestedEvent {
  id: bigint;
  installation: string;
  year: number;
  route: string;
  ownIntensity: number;
  cap: bigint;
  reportHash: string;
  verifier: string;
  operator: string;
}

export interface Deps {
  db: Database;
  blobDir: string;
  extract: (bytes: Uint8Array, mediaType: MediaType, ctx: { installation: string; year: number; filename: string }) => Promise<ExtractResult>;
  attestedEvent: (tx: `0x${string}`) => Promise<AttestedEvent>;
  /** True when the address signed `message` and is an active verifier on chain. */
  verifierSigned: (address: `0x${string}`, message: string, signature: `0x${string}`) => Promise<boolean>;
  installationId: (country: string, registryId: string) => string;
}

const MAX_UPLOAD = 20 * 1024 * 1024;
const ROUTES = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L"]);

function mediaTypeOf(filename: string): MediaType | null {
  const ext = filename.toLowerCase().split(".").pop();
  return ext === "pdf" ? "application/pdf" : ext === "csv" ? "text/csv" : ext === "txt" ? "text/plain" : null;
}

const fail = (status: 400 | 404 | 409 | 403, message: string) => {
  throw new HTTPException(status, { message });
};

export function createApp(deps: Deps) {
  const { db } = deps;
  mkdirSync(deps.blobDir, { recursive: true });
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof BundleError) return c.json({ error: err.message }, 409);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  const report = (id: string | number) => {
    const r = db.query("SELECT * FROM reports WHERE id = ?").get(Number(id)) as Record<string, any> | null;
    if (!r) fail(404, `no report ${id}`);
    return r!;
  };
  const draft = (id: string | number) => {
    const r = report(id);
    if (r.status !== "draft") fail(409, `report ${id} is ${r.status}; only drafts change`);
    return r;
  };
  const installation = (id: string) => {
    const i = db.query("SELECT * FROM installations WHERE id = ?").get(id) as Record<string, any> | null;
    if (!i) fail(404, `no installation ${id}`);
    return i!;
  };

  app.get("/health", (c) => c.json({ ok: true }));

  // ---- installations -------------------------------------------------------

  app.post("/installations", async (c) => {
    const b = await c.req.json();
    for (const k of ["name", "country", "registryId", "operator", "route"]) if (!b[k]) fail(400, `${k} is required`);
    if (!/^0x[0-9a-fA-F]{40}$/.test(b.operator)) fail(400, "operator must be a 0x address");
    if (!ROUTES.has(b.route)) fail(400, `route must be one of ${[...ROUTES].join(", ")}`);
    const id = deps.installationId(b.country, b.registryId);
    db.query(
      "INSERT INTO installations (id, name, country, registry_id, operator, route) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    ).run(id, b.name, b.country.toUpperCase(), b.registryId, b.operator, b.route);
    return c.json(installation(id), 201);
  });

  app.get("/installations", (c) => c.json(db.query("SELECT * FROM installations ORDER BY created_at").all()));

  // ---- reports -------------------------------------------------------------

  app.post("/reports", async (c) => {
    const b = await c.req.json();
    installation(b.installationId);
    if (!Number.isInteger(b.year) || b.year < 2026) fail(400, "year must be 2026 or later");
    if (!/^\d{4,8}$/.test(b.cnCode ?? "")) fail(400, "cnCode must be 4–8 digits");
    const { lastInsertRowid } = db
      .query("INSERT INTO reports (installation_id, year, cn_code) VALUES (?, ?, ?)")
      .run(b.installationId, b.year, b.cnCode);
    return c.json(report(Number(lastInsertRowid)), 201);
  });

  app.get("/reports", (c) => {
    const status = c.req.query("status");
    const rows = status
      ? db.query("SELECT r.*, i.name AS installation_name FROM reports r JOIN installations i ON i.id = r.installation_id WHERE r.status = ? ORDER BY r.id DESC").all(status)
      : db.query("SELECT r.*, i.name AS installation_name FROM reports r JOIN installations i ON i.id = r.installation_id ORDER BY r.id DESC").all();
    return c.json(rows.map(({ bundle_json, ...r }: any) => r));
  });

  app.get("/reports/:id", (c) => {
    const r = report(c.req.param("id"));
    const { bundle_json, ...rest } = r;
    return c.json({
      ...rest,
      installation: installation(r.installation_id),
      documents: db
        .query("SELECT id, filename, media_type, sha256, size, extracted_at, extraction_json FROM documents WHERE report_id = ? ORDER BY id")
        .all(r.id)
        .map((d: any) => {
          const x = d.extraction_json ? JSON.parse(d.extraction_json) : null;
          return { ...d, extraction_json: undefined, documentType: x?.documentType ?? null, warnings: x?.warnings ?? [], servedBy: x?.servedBy ?? null };
        }),
      fields: db.query("SELECT * FROM fields WHERE report_id = ? ORDER BY document_id, id").all(r.id),
    });
  });

  // ---- documents -----------------------------------------------------------

  app.post("/reports/:id/documents", async (c) => {
    const r = draft(c.req.param("id"));
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) fail(400, "multipart field 'file' is required");
    const f = file as File;
    if (f.size > MAX_UPLOAD) fail(400, "file is larger than 20 MB");
    const mediaType = mediaTypeOf(f.name);
    if (!mediaType) fail(400, "only .pdf, .csv and .txt documents are accepted");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const sha = sha256Hex(bytes);
    await Bun.write(join(deps.blobDir, sha), bytes);
    db.query(
      "INSERT INTO documents (report_id, filename, media_type, sha256, size) VALUES (?, ?, ?, ?, ?) ON CONFLICT(report_id, sha256) DO NOTHING",
    ).run(r.id, f.name, mediaType!, sha, bytes.length);
    return c.json(db.query("SELECT * FROM documents WHERE report_id = ? AND sha256 = ?").get(r.id, sha), 201);
  });

  /** Anyone with a passport link can open the documents behind it: they are content-addressed. */
  app.get("/blobs/:sha", async (c) => {
    const sha = c.req.param("sha");
    if (!/^[0-9a-f]{64}$/.test(sha)) fail(400, "bad hash");
    const doc = db.query("SELECT filename, media_type FROM documents WHERE sha256 = ? LIMIT 1").get(sha) as any;
    const file = Bun.file(join(deps.blobDir, sha));
    if (!doc || !(await file.exists())) fail(404, "no such document");
    return new Response(file, {
      headers: { "content-type": doc.media_type, "content-disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"` },
    });
  });

  /** Runs the model over one document. Costs an API call; the UI asks before it fires. */
  app.post("/reports/:id/documents/:docId/extract", async (c) => {
    const r = draft(c.req.param("id"));
    const doc = db.query("SELECT * FROM documents WHERE id = ? AND report_id = ?").get(Number(c.req.param("docId")), r.id) as any;
    if (!doc) fail(404, "no such document on this report");
    const inst = installation(r.installation_id);
    const bytes = new Uint8Array(await Bun.file(join(deps.blobDir, doc.sha256)).arrayBuffer());
    const result = await deps.extract(bytes, doc.media_type, { installation: inst.name, year: r.year, filename: doc.filename });

    const replace = db.transaction(() => {
      // Re-extraction replaces the model's unconfirmed fields for this document only.
      db.query("DELETE FROM fields WHERE document_id = ? AND source = 'model' AND confirmed = 0").run(doc.id);
      const ins = db.query(
        "INSERT INTO fields (report_id, document_id, key, value, page, snippet, reference, source, check_result) VALUES (?, ?, ?, ?, ?, ?, ?, 'model', ?)",
      );
      for (const f of result.fields) ins.run(r.id, doc.id, f.key, f.value, f.page, f.snippet, f.reference, f.check);
      db.query("UPDATE documents SET extraction_json = ?, extracted_at = datetime('now') WHERE id = ?").run(JSON.stringify(result), doc.id);
    });
    replace();
    return c.json({ documentType: result.documentType, warnings: result.warnings, fields: result.fields, servedBy: result.servedBy, usage: result.usage });
  });

  // ---- fields --------------------------------------------------------------

  app.post("/reports/:id/fields", async (c) => {
    const r = draft(c.req.param("id"));
    const b = await c.req.json();
    if (!FIELD_KEYS.includes(b.key)) fail(400, `key must be one of ${FIELD_KEYS.join(", ")}`);
    if (typeof b.value !== "number" || !Number.isFinite(b.value) || b.value < 0) fail(400, "value must be a non-negative number");
    if (b.documentId != null && !db.query("SELECT 1 FROM documents WHERE id = ? AND report_id = ?").get(b.documentId, r.id)) {
      fail(400, "documentId is not on this report");
    }
    const { lastInsertRowid } = db
      .query(
        "INSERT INTO fields (report_id, document_id, key, value, page, snippet, reference, source, confirmed, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'operator', 1, datetime('now'))",
      )
      .run(r.id, b.documentId ?? null, b.key, b.value, b.page ?? null, b.snippet ?? null, b.reference ?? null);
    return c.json(db.query("SELECT * FROM fields WHERE id = ?").get(Number(lastInsertRowid)), 201);
  });

  /** The operator confirms a field against the document, correcting the value if the model misread it. */
  app.patch("/fields/:fieldId", async (c) => {
    const f = db.query("SELECT * FROM fields WHERE id = ?").get(Number(c.req.param("fieldId"))) as any;
    if (!f) fail(404, "no such field");
    draft(f.report_id);
    const b = await c.req.json();
    if (b.value !== undefined && (typeof b.value !== "number" || !Number.isFinite(b.value) || b.value < 0)) {
      fail(400, "value must be a non-negative number");
    }
    const corrected = b.value !== undefined && b.value !== f.value;
    db.query(
      "UPDATE fields SET value = ?, corrected_from = CASE WHEN ? THEN value ELSE corrected_from END, confirmed = ?, confirmed_at = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id = ?",
    ).run(corrected ? b.value : f.value, corrected ? 1 : 0, b.confirmed ? 1 : 0, b.confirmed ? 1 : 0, f.id);
    return c.json(db.query("SELECT * FROM fields WHERE id = ?").get(f.id));
  });

  app.delete("/fields/:fieldId", (c) => {
    const f = db.query("SELECT * FROM fields WHERE id = ?").get(Number(c.req.param("fieldId"))) as any;
    if (!f) fail(404, "no such field");
    draft(f.report_id);
    db.query("DELETE FROM fields WHERE id = ?").run(f.id);
    return c.body(null, 204);
  });

  // ---- submit, review, attest ---------------------------------------------

  app.post("/reports/:id/submit", (c) => {
    const r = draft(c.req.param("id"));
    const inst = installation(r.installation_id);
    const fields = db.query("SELECT f.*, d.sha256 AS doc_sha FROM fields f LEFT JOIN documents d ON d.id = f.document_id WHERE f.report_id = ? ORDER BY f.id").all(r.id) as any[];
    const unconfirmed = fields.filter((f) => !f.confirmed);
    if (unconfirmed.length) fail(409, `${unconfirmed.length} field(s) not confirmed yet`);
    if (!fields.length) fail(409, "no confirmed fields");
    const docs = db.query("SELECT filename, sha256 FROM documents WHERE report_id = ?").all(r.id) as any[];

    const { json, hash } = buildBundle({
      installation: { id: inst.id, name: inst.name, country: inst.country, registryId: inst.registry_id, operator: inst.operator, route: inst.route },
      year: r.year,
      cnCode: r.cn_code,
      documents: docs.map((d) => ({ filename: d.filename, sha256: d.sha256 })),
      fields: fields.map((f) => ({
        key: f.key as FieldKey,
        value: f.value,
        document: f.doc_sha ?? null,
        page: f.page,
        snippet: f.snippet,
        source: f.corrected_from !== null ? "model, corrected by operator" : f.source,
      })),
    });
    db.query("UPDATE reports SET status = 'submitted', bundle_json = ?, bundle_hash = ?, submitted_at = datetime('now'), rejection = NULL WHERE id = ?").run(json, hash, r.id);
    return c.json({ id: r.id, status: "submitted", bundleHash: hash });
  });

  /** The exact bytes that were hashed; a verifier re-hashes them in the browser. */
  app.get("/reports/:id/bundle", (c) => {
    const r = report(c.req.param("id"));
    if (!r.bundle_json) fail(404, "report has no bundle yet");
    return c.body(r.bundle_json, 200, { "content-type": "application/json" });
  });

  app.post("/reports/:id/reject", async (c) => {
    const r = report(c.req.param("id"));
    if (r.status !== "submitted") fail(409, `report is ${r.status}`);
    const b = await c.req.json();
    if (!b.reason || !b.address || !b.signature) fail(400, "reason, address and signature are required");
    const message = `Heatmark: reject report ${r.id} (${r.bundle_hash})\nReason: ${b.reason}`;
    if (!(await deps.verifierSigned(b.address, message, b.signature))) fail(403, "signature is not from an active verifier");
    db.query("UPDATE reports SET status = 'draft', rejection = ? WHERE id = ?").run(JSON.stringify({ reason: b.reason, by: b.address }), r.id);
    return c.json({ id: r.id, status: "draft" as ReportStatus });
  });

  /**
   * After the verifier signs `attest` in their wallet, the browser hands us
   * the tx. We don't take its word: the event must carry this report's hash
   * and the figures the bundle computed.
   */
  app.post("/reports/:id/attested", async (c) => {
    const r = report(c.req.param("id"));
    if (r.status !== "submitted") fail(409, `report is ${r.status}`);
    const { tx } = await c.req.json();
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx ?? "")) fail(400, "tx must be a transaction hash");
    const ev = await deps.attestedEvent(tx);
    const onchain = JSON.parse(r.bundle_json).onchain;
    const inst = installation(r.installation_id);
    const mismatches = [
      ev.reportHash.toLowerCase() !== r.bundle_hash.toLowerCase() && "reportHash",
      ev.installation.toLowerCase() !== r.installation_id.toLowerCase() && "installation",
      Number(ev.year) !== r.year && "year",
      ev.operator.toLowerCase() !== inst.operator.toLowerCase() && "operator",
      Number(ev.ownIntensity) !== onchain.ownIntensityMicro && "ownIntensity",
      BigInt(ev.cap) !== BigInt(onchain.capKg) && "cap",
      ev.route !== `0x${Buffer.from(onchain.route).toString("hex")}` && "route",
    ].filter(Boolean);
    if (mismatches.length) fail(409, `attestation doesn't match the submitted bundle: ${mismatches.join(", ")}`);
    db.query("UPDATE reports SET status = 'attested', attestation_id = ?, attest_tx = ? WHERE id = ?").run(Number(ev.id), tx, r.id);
    return c.json({ id: r.id, status: "attested", attestationId: Number(ev.id) });
  });

  return app;
}
