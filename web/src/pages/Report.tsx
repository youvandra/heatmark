import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { attributedEmissions } from "../../../calc/src/emissions";
import { summarize } from "../../../extract/src/activity";
import type { FieldKey } from "../../../extract/src/schema";
import { Glyph, Hash, Skeleton, State } from "../components/ui";
import { api, blobUrl, type Doc, type Field } from "../lib/api";
import { CN_LABELS, FIELD_LABELS, fmt, intensity } from "../lib/format";
import { useLoad, useSession } from "../lib/session";
import { STATUS_TONE } from "./Plant";

export default function Report() {
  const id = Number(useParams().id);
  const { notify } = useSession();
  const r = useLoad(() => api.report(id), [id]);
  const [view, setView] = useState<{ doc: Doc; page: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const report = r.data;
  const editable = report?.status === "draft";

  useEffect(() => {
    if (report && !view && report.documents.length) setView({ doc: report.documents[0], page: 1 });
  }, [report, view]);

  const confirmed = report?.fields.filter((f) => f.confirmed) ?? [];
  const summary = useMemo(() => summarize(confirmed.map((f) => ({ key: f.key as FieldKey, value: f.value }))), [confirmed]);
  const emissions = useMemo(() => {
    try {
      return summary.activity.productionT > 0 ? attributedEmissions(summary.activity) : null;
    } catch {
      return null;
    }
  }, [summary]);
  const pending = report?.fields.filter((f) => !f.confirmed).length ?? 0;
  const canSubmit = editable && report!.fields.length > 0 && pending === 0 && summary.unresolved.length === 0;

  async function run(label: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(label);
    try {
      await fn();
      if (ok) notify(ok);
      r.reload();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  if (!report) {
    return (
      <div className="stack">
        <Skeleton w={280} h={34} />
        <Skeleton h={420} />
      </div>
    );
  }

  return (
    <>
      <div className="row between" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <div className="stack" style={{ gap: 6 }}>
          <Link to="/app/plant" className="index" style={{ textDecoration: "none" }}>← Plant / report {report.id}</Link>
          <h2>
            {report.installation.name} <span className="quiet">{report.year} · {CN_LABELS[report.cn_code] ?? report.cn_code}</span>
          </h2>
        </div>
        <State tone={STATUS_TONE[report.status]}>{report.status}</State>
      </div>

      {report.rejection && report.status === "draft" && (
        <div className="frame" style={{ padding: 16, boxShadow: "inset 2px 0 0 var(--heat)" }}>
          <span className="flag"><Glyph name="flag" /> Returned by the verifier: {JSON.parse(report.rejection).reason}</span>
        </div>
      )}

      <div className="report-grid">
        {/* ---- documents ---- */}
        <section className="frame" style={{ position: "sticky", top: 76 }}>
          <div className="row between" style={{ padding: "14px 18px" }}>
            <span className="label">Documents · {report.documents.length}</span>
          </div>
          {editable && <Upload onFiles={(files) => run("upload", async () => { for (const f of files) await api.upload(id, f); }, `${files.length} document(s) added`)} busy={busy === "upload"} />}
          <div>
            {report.documents.map((d) => (
              <div key={d.id} className="row" style={{ padding: "10px 18px", borderTop: "1px solid var(--rule)", background: view?.doc.id === d.id ? "var(--paper)" : undefined, boxShadow: view?.doc.id === d.id ? "inset 2px 0 0 var(--heat)" : undefined }}>
                <button className="btn ghost small" style={{ padding: 0, flex: 1, justifyContent: "flex-start", overflow: "hidden" }} onClick={() => setView({ doc: d, page: 1 })}>
                  <Glyph name="doc" />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{d.filename}</span>
                </button>
                {d.warnings.length > 0 && <span className="flag" title={d.warnings.join("\n\n")}><Glyph name="flag" size={13} />{d.warnings.length}</span>}
                {editable && (
                  <button
                    className="btn small"
                    disabled={busy !== null}
                    onClick={() => run(`x${d.id}`, () => api.extract(id, d.id), `${d.filename} read`)}
                  >
                    {busy === `x${d.id}` ? "Reading…" : d.extracted_at ? "Read again" : "Read with AI"}
                  </button>
                )}
              </div>
            ))}
          </div>
          {view && <Viewer doc={view.doc} page={view.page} />}
        </section>

        {/* ---- fields + result ---- */}
        <div className="stack" style={{ gap: 20 }}>
          <section className="frame" style={{ padding: 22, display: "grid", gap: 14 }}>
            <span className="label">Own specific emissions · precursors excluded</span>
            {emissions && (
              <div className="figure">
                {intensity(emissions.ownIntensity)}
                <small>tCO₂e / t</small>
              </div>
            )}
            {emissions ? (
              <table className="table" style={{ fontSize: 13 }}>
                <tbody>
                  {emissions.lines.map((l) => (
                    <tr key={l.stream}>
                      <td>{l.stream}</td>
                      <td className="num">{fmt(l.activity, l.unit === "GJ" ? 0 : 1)} {l.unit}</td>
                      <td className="num faint">× {l.factor.toFixed(4)}</td>
                      <td className="num">{fmt(l.tCO2, 0)} t</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong style={{ fontWeight: 500 }}>Total ÷ production</strong></td>
                    <td className="num">{fmt(summary.activity.productionT)} t</td>
                    <td />
                    <td className="num"><strong style={{ fontWeight: 500 }}>{fmt(emissions.totalT, 0)} t</strong></td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <span className="muted" style={{ fontSize: 14 }}>Confirm a production figure to compute the intensity.</span>
            )}
            {summary.unresolved.map((u) => (
              <span key={u.key} className="flag"><Glyph name="flag" size={13} /> {u.reason}</span>
            ))}
            <span className="faint" style={{ fontSize: 12 }}>IPCC 2006 default factors · electricity recorded, not counted for steel</span>
          </section>

          <section className="frame">
            <div className="row between" style={{ padding: "14px 18px" }}>
              <span className="label">Figures · {report.fields.length} · {pending} to confirm</span>
              {editable && pending > 0 && (
                <button
                  className="btn small"
                  onClick={() => run("bulk", async () => {
                    for (const f of report.fields.filter((x) => !x.confirmed && x.check_result === "verified")) await api.updateField(f.id, { confirmed: true });
                  })}
                >
                  Confirm all verified
                </button>
              )}
            </div>
            {report.fields.length === 0 ? (
              <div style={{ padding: "4px 18px 18px" }} className="muted">Read a document, or add a figure by hand.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th className="label">Figure · source</th>
                    <th className="label num">Value</th>
                    <th className="label">Check</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {report.fields.map((f) => (
                    <FieldRow
                      key={f.id}
                      f={f}
                      doc={report.documents.find((d) => d.id === f.document_id)}
                      editable={editable}
                      onOpen={(doc, page) => setView({ doc, page })}
                      onSave={(patch) => run(`f${f.id}`, () => api.updateField(f.id, patch))}
                      onDelete={() => run(`d${f.id}`, () => api.deleteField(f.id))}
                    />
                  ))}
                </tbody>
              </table>
            )}
            {editable && <AddField onAdd={(b) => run("add", () => api.addField(id, b))} docs={report.documents} />}
          </section>

          {editable ? (
            <div className="row between">
              <span className="muted" style={{ fontSize: 13 }}>
                {canSubmit ? "Submitting freezes the bundle; its hash is what the verifier signs." : "Confirm every figure before submitting."}
              </span>
              <button className="btn primary" disabled={!canSubmit || busy !== null} onClick={() => run("submit", () => api.submit(id), "Submitted to the verifier")}>
                Submit to verifier
              </button>
            </div>
          ) : (
            <section className="frame cells grid-2">
              <div><span className="label cell-k">Bundle sha256</span><div className="cell-v"><Hash value={report.bundle_hash ?? ""} /></div></div>
              <div>
                <span className="label cell-k">Attestation</span>
                <div className="cell-v">
                  {report.attestation_id !== null ? (
                    <Hash value={`#${report.attestation_id} · ${report.attest_tx}`} href={`https://hashscan.io/testnet/transaction/${report.attest_tx}`} />
                  ) : (
                    <span className="faint">awaiting verifier</span>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function FieldRow({ f, doc, editable, onOpen, onSave, onDelete }: {
  f: Field;
  doc?: Doc;
  editable: boolean;
  onOpen: (doc: Doc, page: number) => void;
  onSave: (p: { value?: number; confirmed: boolean }) => void;
  onDelete: () => void;
}) {
  const meta = FIELD_LABELS[f.key] ?? { label: f.key, unit: "" };
  const [value, setValue] = useState(String(f.value));
  const changed = Number(value) !== f.value;
  const flagged = f.source === "model" && f.check_result !== "verified";
  return (
    <tr className={flagged && !f.confirmed ? "edge-heat" : undefined}>
      <td style={{ maxWidth: 260 }}>
        <div>{meta.label} <span className="mono faint" style={{ fontSize: 11 }}>{f.key}</span></div>
        {doc && f.snippet ? (
          <button className="btn ghost small" style={{ padding: 0, height: "auto", whiteSpace: "normal", textAlign: "left", display: "block", marginTop: 4 }} onClick={() => onOpen(doc, f.page ?? 1)}>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>“{f.snippet}”</span>
            <span className="faint" style={{ display: "block", fontSize: 11 }}>{doc.filename} · p.{f.page}</span>
          </button>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>entered by operator</span>
        )}
      </td>
      <td className="num">
        {editable && !f.confirmed ? (
          <input className="input mono" style={{ width: 128, textAlign: "right", height: 32 }} value={value} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <span>{fmt(f.value, f.value % 1 ? 2 : 0)}</span>
        )}{" "}
        <span className="faint">{meta.unit}</span>
        {f.corrected_from !== null && <div className="faint" style={{ fontSize: 11 }}>model read {fmt(f.corrected_from)}</div>}
      </td>
      <td>
        {f.source === "operator" ? (
          <State tone="quiet">manual</State>
        ) : f.check_result === "verified" ? (
          <State tone="ok">on page</State>
        ) : (
          <span className="flag" style={{ fontSize: 12 }}><Glyph name="flag" size={12} /> {f.check_result === "snippet_not_found" ? "quote not on page" : "value not in quote"}</span>
        )}
      </td>
      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
        {editable &&
          (f.confirmed ? (
            <button className="btn small ghost" onClick={() => onSave({ confirmed: false })}><Glyph name="check" /> Confirmed</button>
          ) : (
            <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
              <button className="btn small ghost" onClick={onDelete} title="Remove">✕</button>
              <button className="btn small ink" disabled={value.trim() === "" || !Number.isFinite(Number(value))} onClick={() => onSave({ confirmed: true, ...(changed ? { value: Number(value) } : {}) })}>
                {changed ? "Correct & confirm" : "Confirm"}
              </button>
            </span>
          ))}
      </td>
    </tr>
  );
}

function AddField({ onAdd, docs }: { onAdd: (b: { key: string; value: number; documentId: number | null }) => void; docs: Doc[] }) {
  const [key, setKey] = useState("production_t");
  const [value, setValue] = useState("");
  const [docId, setDocId] = useState<string>("");
  return (
    <form
      className="row"
      style={{ padding: "12px 18px", borderTop: "1px solid var(--rule)", flexWrap: "wrap" }}
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({ key, value: Number(value), documentId: docId ? Number(docId) : null });
        setValue("");
      }}
    >
      <span className="label">Add by hand</span>
      <select className="select" style={{ width: 200, height: 34 }} value={key} onChange={(e) => setKey(e.target.value)}>
        {Object.entries(FIELD_LABELS).map(([k, m]) => <option key={k} value={k}>{m.label} ({m.unit})</option>)}
      </select>
      <input className="input mono" style={{ width: 140, height: 34 }} placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} />
      <select className="select" style={{ width: 200, height: 34 }} value={docId} onChange={(e) => setDocId(e.target.value)}>
        <option value="">no document</option>
        {docs.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
      </select>
      <button className="btn small" disabled={!value || !Number.isFinite(Number(value))}>Add</button>
    </form>
  );
}

function Upload({ onFiles, busy }: { onFiles: (f: File[]) => void; busy: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop${over ? " over" : ""}`}
      style={{ display: "block", margin: "0 18px 14px" }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}
    >
      <input type="file" multiple accept=".pdf,.csv,.txt" hidden onChange={(e) => e.target.files && onFiles([...e.target.files])} />
      <span className="row" style={{ justifyContent: "center", gap: 8 }}>
        <Glyph name="upload" /> {busy ? "Uploading…" : "Drop invoices, statements, production logs (PDF, CSV)"}
      </span>
    </label>
  );
}

function Viewer({ doc, page }: { doc: Doc; page: number }) {
  const [text, setText] = useState<string | null>(null);
  const isPdf = doc.media_type === "application/pdf";
  useEffect(() => {
    if (isPdf) return;
    setText(null);
    fetch(blobUrl(doc.sha256)).then((r) => r.text()).then(setText);
  }, [doc.sha256, isPdf]);
  return (
    <div style={{ borderTop: "1px solid var(--rule)" }}>
      <div className="row between" style={{ padding: "8px 18px" }}>
        <span className="mono faint" style={{ fontSize: 11 }}>sha256 {doc.sha256.slice(0, 16)}…</span>
        <a className="mono" style={{ fontSize: 11 }} href={blobUrl(doc.sha256)} target="_blank" rel="noreferrer">open ↗</a>
      </div>
      {isPdf ? (
        <iframe key={`${doc.sha256}-${page}`} title={doc.filename} src={`${blobUrl(doc.sha256)}#page=${page}&view=FitH`} style={{ width: "100%", height: 560, border: 0, background: "#fff" }} />
      ) : text === null ? (
        <div style={{ padding: 18 }}><Skeleton h={300} /></div>
      ) : (
        <pre className="mono" style={{ margin: 0, padding: 18, fontSize: 12, maxHeight: 560, overflow: "auto", background: "#fff" }}>{text}</pre>
      )}
    </div>
  );
}
