import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { stringToHex } from "viem";
import { Chain, passportChain } from "../components/Chain";
import { Brand, Cell, Glyph, Hash, Skeleton, State } from "../components/ui";
import { api, blobUrl, type Doc } from "../lib/api";
import { CN_LABELS, eur, fmt, intensity, tonnes } from "../lib/format";
import { useLoad, useSession } from "../lib/session";
import { CONTRACTS, revertName, send, waitFor } from "../lib/wallet";

const hashscan = (path: string) => `https://hashscan.io/testnet/${path}`;

export default function Passport() {
  const id = Number(useParams().id);
  const p = useLoad(() => api.passport(id), [id]);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(window.location.href, { margin: 0, width: 220, color: { dark: "#16181C", light: "#FBFAF7" } }).then(setQr);
  }, [id]);
  useEffect(() => {
    const rid = p.data?.attestation.reportId;
    if (rid != null) api.report(rid).then((r) => setDocs(r.documents)).catch(() => setDocs([]));
  }, [p.data?.attestation.reportId]);

  const x = p.data;
  return (
    <div>
      <header className="wrap row between" style={{ height: 72 }}>
        <Link to="/" style={{ textDecoration: "none" }}><Brand /></Link>
        <Link className="btn small" to="/app/passports">Open app</Link>
      </header>
      <main className="wrap page-grid" style={{ gap: 22, paddingBottom: 80 }}>
        {p.error ? (
          <div className="frame" style={{ padding: 32 }}><h3>Passport #{id} not found</h3></div>
        ) : !x ? (
          <><Skeleton h={40} w={320} /><Skeleton h={220} /><Skeleton h={160} /></>
        ) : (
          <>
            <div className="row between" style={{ alignItems: "end", flexWrap: "wrap", gap: 12 }}>
              <div className="stack" style={{ gap: 6 }}>
                <span className="index">CBAM passport #{x.id} · Hedera testnet</span>
                <h2>
                  {fmt(tonnes(x.massKg))} t {CN_LABELS[x.cnCode]?.toLowerCase() ?? `CN ${x.cnCode}`}{" "}
                  <span className="quiet">from {x.installation?.name ?? "an unregistered installation"}</span>
                </h2>
              </div>
              {x.status === "valid" ? <State tone="ok">valid</State> : <State tone="warn">{x.status === "revoked" ? "attestation revoked" : "upstream revoked"}</State>}
            </div>

            <section className="frame cells grid-3">
              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <span className="label">Specific embedded emissions</span>
                <div className="figure md">{intensity(x.see)}<small>tCO₂e/t</small></div>
                <span className="muted" style={{ fontSize: 13 }}>Computed on chain from the attested plant figure and its precursors.</span>
              </div>
              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <span className="label">Saved against the default, {x.savings?.year ?? 2026}</span>
                {x.savings ? (
                  <>
                    <div className="stat" style={{ color: "var(--heat)", fontSize: "clamp(40px, 4.6vw, 64px)" }}>{eur(x.savings.eurPerTonne)}<span className="mono" style={{ fontSize: 13, color: "var(--ink-2)", letterSpacing: 0, marginLeft: 8 }}>/ t</span></div>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {eur(x.savings.eurShipment)} on this shipment · default {x.savings.defaultSee.toFixed(3)} t/t · {x.savings.price.label} €{x.savings.price.eur}/cert
                    </span>
                  </>
                ) : (
                  <span className="faint">No default value for this good.</span>
                )}
              </div>
              <div style={{ display: "grid", gap: 10, justifyItems: "start", alignContent: "start" }}>
                <span className="label">Scan at customs</span>
                {qr ? <img src={qr} alt={`QR code for passport ${x.id}`} width={132} height={132} /> : <Skeleton w={132} h={132} />}
                <a className="mono" style={{ fontSize: 12 }} href={hashscan(`contract/${CONTRACTS.Passports.id}`)} target="_blank" rel="noreferrer">contract {CONTRACTS.Passports.id} ↗</a>
              </div>
            </section>

            <section className="frame" style={{ padding: 22, display: "grid", gap: 16 }}>
              <span className="label">Where the figure came from</span>
              <Chain nodes={passportChain(x)} />
            </section>

            <section className="frame cells grid-4">
              <Cell k="Good">{CN_LABELS[x.cnCode] ?? "—"} · {x.cnCode}</Cell>
              <Cell k="Mass">{fmt(tonnes(x.massKg))} t</Cell>
              <Cell k="Drawn downstream">{fmt(tonnes(x.consumedKg))} t</Cell>
              <Cell k="Route">{x.attestation.route}</Cell>
              <Cell k="Attestation">#{x.attestation.id} · year {x.attestation.year}</Cell>
              <Cell k="Plant own intensity">{intensity(x.attestation.ownIntensity)} t/t</Cell>
              <Cell k="Verified output used">{fmt(tonnes(x.attestation.issuedKg))} / {fmt(tonnes(x.attestation.capKg))} t</Cell>
              <Cell k="Holder">{x.holder.kind === "installation" ? x.holder.name : x.declared ? "Importer · declared" : "Importer (hash)"}</Cell>
              <Cell k="Verifier"><Hash value={x.attestation.verifier} href={hashscan(`account/${x.attestation.verifier}`)} /></Cell>
              <Cell k="Operator"><Hash value={x.attestation.operator} href={hashscan(`account/${x.attestation.operator}`)} /></Cell>
              <Cell k="Report bundle"><Hash value={x.attestation.reportHash} /></Cell>
              <Cell k="Shipment documents"><Hash value={x.docHash} /></Cell>
            </section>

            <section className="frame">
              <div style={{ padding: "14px 18px" }}><span className="label">Documents behind the attestation</span></div>
              {docs === null ? (
                <div style={{ padding: 18 }}><Skeleton h={60} /></div>
              ) : (
                <table className="table">
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td><span className="row" style={{ gap: 8 }}><Glyph name="doc" /> {d.filename}</span></td>
                        <td className="mono faint hide-sm" style={{ fontSize: 12 }}>sha256 {d.sha256.slice(0, 20)}…</td>
                        <td style={{ textAlign: "right" }}><a className="mono" style={{ fontSize: 12 }} href={blobUrl(d.sha256)} target="_blank" rel="noreferrer">open ↗</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {x.holder.kind === "importer" && !x.declared && <Declare id={x.id} onDone={p.reload} />}
          </>
        )}
      </main>
    </div>
  );
}

function Declare({ id, onDone }: { id: number; onDone: () => void }) {
  const { signer, connect, notify } = useSession();
  const [salt, setSalt] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="frame" style={{ padding: 18, display: "grid", gap: 12 }}>
      <span className="label">Importer · use in a CBAM declaration</span>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <input className="input mono" style={{ flex: 2, minWidth: 260 }} placeholder="Salt from the issuer 0x…" value={salt} onChange={(e) => setSalt(e.target.value)} />
        <input className="input mono" style={{ flex: 1, minWidth: 160 }} placeholder="Declaration ref" value={ref} onChange={(e) => setRef(e.target.value)} />
        {signer ? (
          <button
            className="btn ink"
            disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(salt) || !ref}
            onClick={async () => {
              setBusy(true);
              try {
                await waitFor(await send(signer, "Passports", "markDeclared", [BigInt(id), salt, stringToHex(ref.slice(0, 31), { size: 32 })]));
                notify("Marked as declared. It can't back another declaration.");
                onDone();
              } catch (e) {
                const n = revertName(e);
                notify(n === "NotHolder" ? "Refused on chain: this key and salt aren't the committed holder." : n, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark declared
          </button>
        ) : (
          <button className="btn" onClick={connect}>Connect wallet</button>
        )}
      </div>
    </section>
  );
}
