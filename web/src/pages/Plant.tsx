import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Empty, Hash, Skeleton, State } from "../components/ui";
import { api, type ReportRow } from "../lib/api";
import { CN_LABELS } from "../lib/format";
import { useLoad, useSession } from "../lib/session";

export const STATUS_TONE: Record<ReportRow["status"], "ok" | "warn" | "quiet"> = {
  draft: "quiet",
  submitted: "warn",
  rejected: "warn",
  attested: "ok",
};

export default function Plant() {
  const { signer, notify } = useSession();
  const nav = useNavigate();
  const insts = useLoad(() => api.installations(), []);
  const reports = useLoad(() => api.reports(), []);
  const mine = insts.data?.filter((i) => signer && i.operator.toLowerCase() === signer.address.toLowerCase()) ?? [];
  const [form, setForm] = useState<null | "installation" | "report">(null);

  return (
    <>
      <div className="row between">
        <div className="stack" style={{ gap: 6 }}>
          <span className="index">Plant</span>
          <h2>Installations and reports</h2>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setForm(form === "installation" ? null : "installation")} disabled={!signer}>
            Register installation
          </button>
          <button className="btn primary" onClick={() => setForm(form === "report" ? null : "report")} disabled={!mine.length}>
            New report
          </button>
        </div>
      </div>

      {!signer && <p className="muted" style={{ margin: 0 }}>Sign as an operator to register an installation or start a report.</p>}

      {form === "installation" && signer && (
        <InstallationForm
          operator={signer.address}
          onDone={() => {
            setForm(null);
            insts.reload();
          }}
          onError={(m) => notify(m, true)}
        />
      )}
      {form === "report" && (
        <ReportForm
          installations={mine}
          onDone={(id) => nav(`/app/plant/reports/${id}`)}
          onError={(m) => notify(m, true)}
        />
      )}

      <section className="frame">
        <div className="row between" style={{ padding: "14px 18px" }}>
          <span className="label">Installations</span>
        </div>
        {!insts.data ? (
          <div style={{ padding: 18 }}><Skeleton h={44} /></div>
        ) : insts.data.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">None registered yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="label">Name</th>
                <th className="label">Registry</th>
                <th className="label">Route</th>
                <th className="label">Operator</th>
                <th className="label">On-chain id</th>
              </tr>
            </thead>
            <tbody>
              {insts.data.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="mono">{i.country}/{i.registry_id}</td>
                  <td className="mono">{i.route}</td>
                  <td><Hash value={i.operator} /></td>
                  <td><Hash value={i.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="frame">
        <div className="row between" style={{ padding: "14px 18px" }}>
          <span className="label">Reports</span>
        </div>
        {!reports.data ? (
          <div style={{ padding: 18 }}><Skeleton h={88} /></div>
        ) : reports.data.length === 0 ? (
          <div style={{ padding: 18 }}>
            <Empty title="No reports yet">
              <span className="muted">A report is one installation's year: its documents, the figures read from them, and the bundle a verifier signs.</span>
            </Empty>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="label">#</th>
                <th className="label">Installation</th>
                <th className="label">Year</th>
                <th className="label">Good</th>
                <th className="label">State</th>
                <th className="label">Bundle</th>
              </tr>
            </thead>
            <tbody>
              {reports.data.map((r) => (
                <tr key={r.id} className={`link${r.status === "submitted" ? "" : ""}`} onClick={() => nav(`/app/plant/reports/${r.id}`)}>
                  <td className="mono">{r.id}</td>
                  <td>{r.installation_name}</td>
                  <td className="mono">{r.year}</td>
                  <td>{CN_LABELS[r.cn_code] ?? r.cn_code} <span className="mono faint">{r.cn_code}</span></td>
                  <td><State tone={STATUS_TONE[r.status]}>{r.status}</State></td>
                  <td>{r.bundle_hash ? <Hash value={r.bundle_hash} /> : <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function InstallationForm({ operator, onDone, onError }: { operator: string; onDone: () => void; onError: (m: string) => void }) {
  const [v, setV] = useState({ name: "", country: "TR", registryId: "", route: "E" });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="frame cells grid-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.createInstallation({ ...v, operator });
          onDone();
        } catch (err) {
          onError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field" style={{ gridColumn: "span 2" }}>
        <span className="label">Name</span>
        <input className="input" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <label className="field">
        <span className="label">Country / registry id</span>
        <div className="row" style={{ gap: 6 }}>
          <input className="input mono" style={{ width: 64 }} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} />
          <input className="input mono" required value={v.registryId} onChange={(e) => setV({ ...v, registryId: e.target.value })} />
        </div>
      </label>
      <label className="field">
        <span className="label">Production route</span>
        <select className="select" value={v.route} onChange={(e) => setV({ ...v, route: e.target.value })}>
          <option value="E">E · Scrap / EAF</option>
          <option value="D">D · DRI / EAF</option>
          <option value="C">C · BF / BOF</option>
          <option value="A">A · Grey clinker</option>
        </select>
      </label>
      <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "space-between" }}>
        <span className="muted" style={{ fontSize: 13 }}>Operator key: <span className="mono">{operator}</span></span>
        <button className="btn ink" disabled={busy}>Register</button>
      </div>
    </form>
  );
}

function ReportForm({ installations, onDone, onError }: { installations: { id: string; name: string }[]; onDone: (id: number) => void; onError: (m: string) => void }) {
  const [v, setV] = useState({ installationId: installations[0]?.id ?? "", year: 2026, cnCode: "72071114" });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="frame cells grid-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          onDone((await api.createReport(v)).id);
        } catch (err) {
          onError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field" style={{ gridColumn: "span 2" }}>
        <span className="label">Installation</span>
        <select className="select" value={v.installationId} onChange={(e) => setV({ ...v, installationId: e.target.value })}>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Reporting year</span>
        <input className="input mono" type="number" min={2026} value={v.year} onChange={(e) => setV({ ...v, year: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span className="label">Good (CN)</span>
        <select className="select" value={v.cnCode} onChange={(e) => setV({ ...v, cnCode: e.target.value })}>
          {Object.entries(CN_LABELS).map(([cn, l]) => (
            <option key={cn} value={cn}>{l} · {cn}</option>
          ))}
        </select>
      </label>
      <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={busy || !v.installationId}>Start report</button>
      </div>
    </form>
  );
}
