import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { encodeAbiParameters, keccak256, stringToHex, toHex, type Hex } from "viem";
import { Empty, Glyph, Hash, Skeleton, State } from "../components/ui";
import { api, type Installation } from "../lib/api";
import { CN_LABELS, fmt, intensity, tonnes } from "../lib/format";
import { useLoad, useSession } from "../lib/session";
import { eventIn, revertName, send, waitFor } from "../lib/wallet";

const REVERTS: Record<string, string> = {
  OverCap: "Refused on chain: this would passport more than the verified output.",
  PrecursorOverdrawn: "Refused on chain: that precursor passport has less left than you're drawing.",
  NotHeldByInstallation: "Refused on chain: that precursor passport isn't held by this installation.",
  PrecursorRevoked: "Refused on chain: that precursor's attestation was revoked.",
  AttestationRevoked: "Refused on chain: this installation's attestation was revoked.",
  NotOperator: "Refused on chain: only the installation's operator key can issue.",
  TooDeep: "Refused on chain: the precursor chain is deeper than four steps.",
};

export default function Passports() {
  const nav = useNavigate();
  const { signer } = useSession();
  const list = useLoad(() => api.passports(), []);
  const insts = useLoad(() => api.installations(), []);
  const mine = insts.data?.find((i) => signer && i.operator.toLowerCase() === signer.address.toLowerCase()) ?? null;
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="row between">
        <div className="stack" style={{ gap: 6 }}>
          <span className="index">Passports</span>
          <h2>One per shipment <span className="quiet">· read from Hedera</span></h2>
        </div>
        <button className="btn primary" disabled={!mine} onClick={() => setOpen(!open)} title={mine ? "" : "Sign as an installation's operator"}>
          Issue passport
        </button>
      </div>

      {open && mine && insts.data && (
        <IssueForm
          inst={mine}
          others={insts.data.filter((i) => i.id !== mine.id)}
          held={(list.data ?? []).filter((p) => p.holder.kind === "installation" && p.holder.id.toLowerCase() === mine.id.toLowerCase())}
          onIssued={(id) => nav(`/p/${id}`)}
        />
      )}

      <section className="frame">
        {!list.data ? (
          <div style={{ padding: 18 }}><Skeleton h={80} /></div>
        ) : list.data.length === 0 ? (
          <div style={{ padding: 18 }}><Empty title="No passports yet"><span className="muted">An operator issues one per shipment once its year is attested.</span></Empty></div>
        ) : (
          <table className="table">
            <thead><tr><th className="label">#</th><th className="label">Good</th><th className="label">Installation</th><th className="label num">Mass</th><th className="label num">tCO₂e/t</th><th className="label">Holder</th><th className="label">State</th></tr></thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id} className={`link${p.status !== "valid" ? " edge-heat" : ""}`} onClick={() => nav(`/p/${p.id}`)}>
                  <td className="mono">{p.id}</td>
                  <td>{CN_LABELS[p.cnCode] ?? p.cnCode} <span className="mono faint">{p.cnCode}</span></td>
                  <td>{p.installation?.name ?? "—"}</td>
                  <td className="num">{fmt(tonnes(p.massKg))} t</td>
                  <td className="num">{intensity(p.see)}</td>
                  <td>{p.holder.kind === "installation" ? p.holder.name : p.declared ? "Importer · declared" : "Importer"}</td>
                  <td>{p.status === "valid" ? <State tone="ok">valid</State> : <State tone="warn">{p.status.replace("_", " ")}</State>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function IssueForm({ inst, others, held, onIssued }: {
  inst: Installation;
  others: Installation[];
  held: { id: number; cnCode: string; massKg: string; consumedKg: string; see: number; installation: { name: string } | null }[];
  onIssued: (id: number) => void;
}) {
  const { signer, notify } = useSession();
  const atts = useLoad(() => api.attestations(inst.id), [inst.id]);
  const [attId, setAttId] = useState<string>("");
  const [massT, setMassT] = useState("500");
  const [precursor, setPrecursor] = useState<string>(held[0] ? String(held[0].id) : "");
  const [useT, setUseT] = useState("520");
  const [holderKind, setHolderKind] = useState<string>("importer");
  const [importer, setImporter] = useState("");
  const [shipment, setShipment] = useState("");
  const [salt] = useState<Hex>(() => toHex(crypto.getRandomValues(new Uint8Array(32))));
  const [busy, setBusy] = useState(false);

  const att = atts.data?.find((a) => String(a.attestationId) === attId) ?? atts.data?.[0];
  const left = att ? (Number(att.capKg) - Number(att.issuedKg)) / 1000 : 0;
  const pre = held.find((h) => String(h.id) === precursor);
  const preview = useMemo(() => {
    if (!att) return null;
    const m = Number(massT);
    const u = pre ? Number(useT) : 0;
    if (!(m > 0)) return null;
    return att.ownIntensity + (pre ? (u * pre.see) / m : 0);
  }, [att, massT, useT, pre]);

  async function issue() {
    if (!signer || !att) return;
    setBusy(true);
    try {
      const holder: Hex =
        holderKind === "importer"
          ? keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [importer as Hex, salt]))
          : (holderKind as Hex);
      const uses = pre ? [{ passportId: BigInt(pre.id), mass: BigInt(Math.round(Number(useT) * 1000)) }] : [];
      const tx = await send(signer, "Passports", "issue", [
        BigInt(att.attestationId),
        stringToHex(att.cnCode, { size: 8 }),
        BigInt(Math.round(Number(massT) * 1000)),
        uses,
        holder,
        keccak256(stringToHex(shipment || `shipment ${Date.now()}`)),
      ]);
      const ev = eventIn(await waitFor(tx), "Passports", "PassportIssued");
      if (holderKind === "importer") notify(`Issued. Give the importer this salt to declare it: ${salt}`);
      onIssued(Number(ev?.id ?? 0));
    } catch (e) {
      const name = revertName(e);
      notify(REVERTS[name] ?? name, true);
    } finally {
      setBusy(false);
    }
  }

  if (!atts.data) return <Skeleton h={160} />;
  if (atts.data.length === 0) return <Empty title="No attested year yet"><span className="muted">{inst.name} can issue once a verifier attests a report.</span></Empty>;

  return (
    <section className="frame cells grid-3">
      <label className="field">
        <span className="label">Attested year</span>
        <select className="select" value={attId || String(att?.attestationId)} onChange={(e) => setAttId(e.target.value)}>
          {atts.data.map((a) => (
            <option key={a.attestationId} value={a.attestationId}>
              #{a.attestationId} · {a.year} · {CN_LABELS[a.cnCode] ?? a.cnCode} · {intensity(a.ownIntensity)} t/t
            </option>
          ))}
        </select>
        <span className="faint mono" style={{ fontSize: 12 }}>{fmt(left)} t of {fmt(Number(att!.capKg) / 1000)} t left to passport</span>
      </label>
      <label className="field">
        <span className="label">Shipment mass (t)</span>
        <input className="input mono" value={massT} onChange={(e) => setMassT(e.target.value)} />
        <input className="input" placeholder="Delivery note / invoice no." value={shipment} onChange={(e) => setShipment(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Precursor consumed</span>
        <select className="select" value={precursor} onChange={(e) => setPrecursor(e.target.value)}>
          <option value="">none (scrap only)</option>
          {held.map((h) => (
            <option key={h.id} value={h.id}>
              #{h.id} · {CN_LABELS[h.cnCode] ?? h.cnCode} · {intensity(h.see)} t/t · {fmt((Number(h.massKg) - Number(h.consumedKg)) / 1000)} t left
            </option>
          ))}
        </select>
        {pre && <input className="input mono" value={useT} onChange={(e) => setUseT(e.target.value)} aria-label="Precursor tonnes used" />}
      </label>
      <label className="field" style={{ gridColumn: "span 2" }}>
        <span className="label">Goes to</span>
        <div className="row" style={{ gap: 6 }}>
          <select className="select" style={{ maxWidth: 260 }} value={holderKind} onChange={(e) => setHolderKind(e.target.value)}>
            <option value="importer">EU importer</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {holderKind === "importer" && <input className="input mono" placeholder="Importer address 0x…" value={importer} onChange={(e) => setImporter(e.target.value)} />}
        </div>
        {holderKind === "importer" && <span className="faint" style={{ fontSize: 12 }}>Only a hash of the importer and a random salt goes on chain.</span>}
      </label>
      <div style={{ display: "grid", gap: 10, alignContent: "space-between" }}>
        <div>
          <span className="label">Passport will carry</span>
          <div className="mono" style={{ fontSize: 26 }}>{preview !== null ? intensity(preview) : "—"} <span className="faint" style={{ fontSize: 12 }}>tCO₂e/t</span></div>
        </div>
        <button
          className="btn primary"
          disabled={busy || !signer || (holderKind === "importer" && !/^0x[0-9a-fA-F]{40}$/.test(importer))}
          onClick={issue}
        >
          <Glyph name="chain" /> {busy ? "Issuing on Hedera…" : "Issue on Hedera"}
        </button>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <span className="faint" style={{ fontSize: 12 }}>
          The chain computes the figure from the attestation and the precursor's passport; nobody types it. <Hash value={inst.id} />
        </span>
      </div>
    </section>
  );
}
