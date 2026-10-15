import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toHex } from "viem";
import { attributedEmissions } from "../../../calc/src/emissions";
import { summarize } from "../../../extract/src/activity";
import type { FieldKey } from "../../../extract/src/schema";
import { Empty, Glyph, Hash, Skeleton, State } from "../components/ui";
import { api, blobUrl } from "../lib/api";
import { CN_LABELS, FIELD_LABELS, fmt, intensity } from "../lib/format";
import { useLoad, useSession } from "../lib/session";
import { ABI, CONTRACTS, publicClient, revertName, send, signMessage, waitFor, eventIn } from "../lib/wallet";

export function VerifierQueue() {
  const nav = useNavigate();
  const q = useLoad(() => api.reports("submitted"), []);
  const done = useLoad(() => api.reports("attested"), []);
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <span className="index">Verifier</span>
        <h2>Reports awaiting an opinion</h2>
      </div>
      <section className="frame">
        {!q.data ? (
          <div style={{ padding: 18 }}><Skeleton h={60} /></div>
        ) : q.data.length === 0 ? (
          <div style={{ padding: 18 }}><Empty title="Queue is empty"><span className="muted">Submitted reports appear here.</span></Empty></div>
        ) : (
          <table className="table">
            <thead><tr><th className="label">#</th><th className="label">Installation</th><th className="label">Year</th><th className="label">Good</th><th className="label">Bundle</th><th className="label">Submitted</th></tr></thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id} className="link edge-heat" onClick={() => nav(`/app/verifier/${r.id}`)}>
                  <td className="mono">{r.id}</td>
                  <td>{r.installation_name}</td>
                  <td className="mono">{r.year}</td>
                  <td>{CN_LABELS[r.cn_code] ?? r.cn_code}</td>
                  <td><Hash value={r.bundle_hash ?? ""} /></td>
                  <td className="mono faint">{r.submitted_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {done.data && done.data.length > 0 && (
        <section className="frame">
          <div style={{ padding: "14px 18px" }}><span className="label">Attested</span></div>
          <table className="table">
            <tbody>
              {done.data.map((r) => (
                <tr key={r.id} className="link" onClick={() => nav(`/app/verifier/${r.id}`)}>
                  <td className="mono">{r.id}</td>
                  <td>{r.installation_name}</td>
                  <td className="mono">{r.year}</td>
                  <td><State tone="ok">attestation #{r.attestation_id}</State></td>
                  <td><Hash value={r.attest_tx ?? ""} href={`https://hashscan.io/testnet/transaction/${r.attest_tx}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `0x${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function VerifierReview() {
  const id = Number(useParams().id);
  const { signer, notify } = useSession();
  const r = useLoad(() => api.report(id), [id]);
  const [bundleText, setBundleText] = useState<string | null>(null);
  const [rehash, setRehash] = useState<string | null>(null);
  const [isVerifier, setIsVerifier] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    api.bundleText(id).then(async (t) => {
      setBundleText(t);
      setRehash(await sha256Hex(t));
    }).catch(() => setBundleText(""));
  }, [id, r.data?.status]);

  useEffect(() => {
    setIsVerifier(null);
    if (!signer) return;
    publicClient
      .readContract({ address: CONTRACTS.Accreditation.address, abi: ABI.Accreditation, functionName: "isActive", args: [signer.address] })
      .then((v) => setIsVerifier(Boolean(v)));
  }, [signer]);

  const bundle = useMemo(() => (bundleText ? JSON.parse(bundleText) : null), [bundleText]);
  // Recompute from the bundle's own fields, independently of what it claims.
  const recomputed = useMemo(() => {
    if (!bundle) return null;
    const s = summarize(bundle.fields.map((f: { key: FieldKey; value: number }) => ({ key: f.key, value: f.value })));
    const e = attributedEmissions(s.activity);
    return { ownIntensityMicro: Math.round(e.ownIntensity * 1e6), capKg: Math.round(s.activity.productionT * 1000), e };
  }, [bundle]);

  const report = r.data;
  if (!report || bundleText === null) return <div className="stack"><Skeleton w={300} h={34} /><Skeleton h={360} /></div>;
  if (!bundle) return <Empty title="No bundle">This report hasn't been submitted.</Empty>;

  const hashOk = rehash?.toLowerCase() === report.bundle_hash?.toLowerCase();
  const figuresOk = recomputed && recomputed.ownIntensityMicro === bundle.onchain.ownIntensityMicro && recomputed.capKg === bundle.onchain.capKg;
  const canAct = report.status === "submitted" && signer && isVerifier;

  async function attest() {
    if (!signer) return;
    setBusy("attest");
    try {
      const tx = await send(signer, "Attestations", "attest", [
        bundle.installation.id,
        bundle.year,
        toHex(bundle.onchain.route, { size: 1 }),
        bundle.onchain.ownIntensityMicro,
        BigInt(bundle.onchain.capKg),
        report!.bundle_hash,
        bundle.installation.operator,
      ]);
      const receipt = await waitFor(tx);
      const ev = eventIn(receipt, "Attestations", "Attested");
      await api.attested(id, tx);
      notify(`Attested on Hedera as #${ev?.id ?? "?"}`);
      r.reload();
    } catch (e) {
      notify(revertName(e), true);
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!signer || !reason.trim()) return;
    setBusy("reject");
    try {
      const message = `Heatmark: reject report ${report!.id} (${report!.bundle_hash})\nReason: ${reason.trim()}`;
      const signature = await signMessage(signer, message);
      await api.reject(id, { reason: reason.trim(), address: signer.address, signature });
      notify("Returned to the operator");
      r.reload();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="row between" style={{ alignItems: "end" }}>
        <div className="stack" style={{ gap: 6 }}>
          <Link to="/app/verifier" className="index" style={{ textDecoration: "none" }}>← Verifier / report {report.id}</Link>
          <h2>{bundle.installation.name} <span className="quiet">{bundle.year} · route {bundle.onchain.route}</span></h2>
        </div>
        <State tone={report.status === "attested" ? "ok" : "warn"}>{report.status}</State>
      </div>

      <section className="frame cells grid-3">
        <div style={{ display: "grid", gap: 10 }}>
          <span className="label">Own intensity to attest</span>
          <div className="figure md">{intensity(bundle.onchain.ownIntensityMicro / 1e6)}<small>t/t</small></div>
        </div>
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <span className="label">Checks run in this browser</span>
          <Check ok={hashOk} text={hashOk ? "Bundle bytes hash to the submitted reportHash" : "Bundle hash does not match"} />
          <Check ok={!!figuresOk} text={figuresOk ? `Recomputed ${intensity(recomputed!.e.ownIntensity)} t/t from ${bundle.fields.length} figures` : "Recomputed figures differ from the bundle"} />
          <Check ok={bundle.documents.length > 0} text={`${bundle.documents.length} documents, content-addressed`} />
        </div>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <span className="label">Will be written on chain</span>
          <span className="mono" style={{ fontSize: 13 }}>cap {fmt(bundle.onchain.capKg / 1000)} t</span>
          <span className="mono" style={{ fontSize: 13 }}>operator <Hash value={bundle.installation.operator} /></span>
          <span className="mono" style={{ fontSize: 13 }}>reportHash <Hash value={report.bundle_hash ?? ""} /></span>
        </div>
      </section>

      <section className="frame">
        <div style={{ padding: "14px 18px" }}><span className="label">Figures and their sources</span></div>
        <table className="table">
          <tbody>
            {bundle.fields.map((f: { key: string; value: number; document: string | null; page: number | null; snippet: string | null; source: string }, i: number) => {
              const doc = bundle.documents.find((d: { sha256: string }) => d.sha256 === f.document);
              return (
                <tr key={i}>
                  <td>{FIELD_LABELS[f.key]?.label ?? f.key}</td>
                  <td className="num">{fmt(f.value, f.value % 1 ? 2 : 0)} <span className="faint">{FIELD_LABELS[f.key]?.unit}</span></td>
                  <td className="mono" style={{ fontSize: 12 }}>{f.snippet ? `“${f.snippet}”` : <span className="faint">no quote</span>}</td>
                  <td>{doc ? <a className="mono" style={{ fontSize: 12 }} href={`${blobUrl(doc.sha256)}#page=${f.page ?? 1}`} target="_blank" rel="noreferrer">{doc.filename} p.{f.page} ↗</a> : <span className="faint">—</span>}</td>
                  <td className="faint" style={{ fontSize: 12 }}>{f.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {report.status === "submitted" && (
        <section className="frame" style={{ padding: 18, display: "grid", gap: 12 }}>
          {!signer ? (
            <span className="muted">Sign as the verifier to attest or return this report.</span>
          ) : isVerifier === false ? (
            <span className="flag"><Glyph name="flag" /> {signer.label} is not an active verifier on chain.</span>
          ) : null}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input className="input" style={{ flex: 1, minWidth: 240 }} placeholder="Reason, if returning to the operator" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn" disabled={!canAct || !reason.trim() || busy !== null} onClick={reject}>{busy === "reject" ? "Signing…" : "Return with reason"}</button>
            <button className="btn primary" disabled={!canAct || !hashOk || !figuresOk || busy !== null} onClick={attest}>
              <Glyph name="stamp" /> {busy === "attest" ? "Attesting on Hedera…" : "Attest on Hedera"}
            </button>
          </div>
        </section>
      )}
      {report.status === "attested" && (
        <section className="frame cells grid-2">
          <div><span className="label cell-k">Attestation</span><div className="cell-v">#{report.attestation_id}</div></div>
          <div><span className="label cell-k">Transaction</span><div className="cell-v"><Hash value={report.attest_tx ?? ""} href={`https://hashscan.io/testnet/transaction/${report.attest_tx}`} /></div></div>
        </section>
      )}
    </>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return ok ? (
    <span className="row" style={{ gap: 8, fontSize: 14 }}><Glyph name="check" /> {text}</span>
  ) : (
    <span className="flag"><Glyph name="flag" /> {text}</span>
  );
}
