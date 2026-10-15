import { Link } from "react-router-dom";
import { Chain, passportChain, type ChainNode } from "../components/Chain";
import { Brand, Glyph } from "../components/ui";
import { api } from "../lib/api";
import { useLoad } from "../lib/session";
import { CONTRACTS } from "../lib/wallet";

// Shown until a live passport exists on chain. Same figures as the demo data.
const SAMPLE: ChainNode[] = [
  { key: "s", label: "Input", title: "Steel scrap", value: "0.000", unit: "tCO₂e/t", meta: "No embedded emissions", tone: "dim" },
  { key: "a", label: "Billet · melt shop", title: "Aegean Melt Shop", value: "0.110", unit: "tCO₂e/t", meta: "Scrap / EAF, İzmir" },
  { key: "b", label: "Rebar · rolling mill", title: "Aegean Rolling Mill", value: "0.182", unit: "tCO₂e/t", meta: "Own 0.067 + billet", tone: "hot" },
  { key: "i", label: "Held by", title: "EU importer", value: "2.541", unit: "default", meta: "What it pays without proof", tone: "dim" },
];

export default function Landing() {
  const { data: passports } = useLoad(() => api.passports().catch(() => []), []);
  const live = passports?.find((p) => p.holder.kind === "importer" && p.precursors.length > 0);

  return (
    <div>
      <header className="wrap row between" style={{ height: 72 }}>
        <Brand />
        <nav className="row" style={{ gap: 6 }}>
          <a className="btn ghost small hide-sm" href="#how">How it works</a>
          <Link className="btn ghost small" to="/docs">Docs</Link>
          <Link className="btn ink small" to="/app">Open app</Link>
        </nav>
      </header>

      {/* ---- hero ---- */}
      <section className="wrap" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <div className="hero-grid">
          <div className="stack" style={{ gap: 28 }}>
            <span className="index">[01] EU CBAM · definitive since 1 Jan 2026</span>
            <h1 className="display">
              Scrap-melted steel, billed as blast-furnace steel.{" "}
              <span className="quiet">Unless the number travels with the heat.</span>
            </h1>
            <p className="lede">A verified carbon figure for every shipment, carried from the melt shop to the EU customs declaration.</p>
            <div className="row" style={{ gap: 10 }}>
              <Link className="btn primary" to="/app">
                Open app <Glyph name="arrow" />
              </Link>
              {live && (
                <Link className="btn" to={`/p/${live.id}`}>
                  View a live passport
                </Link>
              )}
            </div>
          </div>
          <div className="frame" style={{ padding: 24, display: "grid", gap: 14 }}>
            <span className="label">Türkiye rebar, 2026</span>
            <div className="figure heat">
              €72<small>/ t</small>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Paid on default values tied to the blast-furnace route, though ~70% of Turkish steel is melted from scrap.
            </p>
            <span className="mono faint" style={{ fontSize: 11 }}>IR (EU) 2025/2621 · 2025/2620 · €82.32/cert</span>
          </div>
        </div>
      </section>

      {/* ---- product fragment: the chain ---- */}
      <section className="wrap" style={{ paddingBottom: 72 }}>
        <div className="frame" style={{ padding: 24, display: "grid", gap: 18 }}>
          <div className="row between">
            <span className="label">{live ? `Live passport #${live.id} · Hedera testnet` : "One shipment of rebar · demo data"}</span>
            {live && (
              <Link to={`/p/${live.id}`} className="mono" style={{ fontSize: 12 }}>
                open ↗
              </Link>
            )}
          </div>
          <Chain nodes={live ? passportChain(live) : SAMPLE} />
        </div>
      </section>

      {/* ---- the gap ---- */}
      <section className="wrap" style={{ paddingBottom: 80 }}>
        <div className="row between" style={{ alignItems: "end", marginBottom: 20 }}>
          <h2>
            The gap is measurable. <span className="quiet">It widens every year.</span>
          </h2>
          <span className="index">[02]</span>
        </div>
        <div className="cells grid-4">
          {[
            ["€260M", "a year, Turkish EAF steel to the EU, 2026"],
            ["€426M", "by 2028, as free allocation phases out"],
            ["5.15 Mt", "Türkiye → EU finished steel, 2025 · #1 extra-EU"],
            ["2.310", "t/t default for Turkish rebar, BF/BOF route"],
          ].map(([v, k]) => (
            <div key={k} style={{ display: "grid", gap: 8, background: "var(--sheet)" }}>
              <span className="stat">{v}</span>
              <span className="muted" style={{ fontSize: 13 }}>{k}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- how ---- */}
      <section id="how" className="wrap" style={{ paddingBottom: 80 }}>
        <div className="row between" style={{ alignItems: "end", marginBottom: 20 }}>
          <h2>
            Read, verify, carry. <span className="quiet">AI drafts; rules decide; the chain enforces.</span>
          </h2>
          <span className="index">[03]</span>
        </div>
        <div className="cells grid-3">
          <Step n="01" title="Read" text="AI reads the plant's invoices. Every figure is quoted from its page, then checked against it.">
            <div className="mono" style={{ fontSize: 12, padding: 12, border: "1px solid var(--rule)", background: "var(--paper)" }}>
              <div className="faint">a-01-natural-gas-2026.pdf · p.1</div>
              <div style={{ marginTop: 6 }}>
                TOTAL CONSUMPTION 2026: <mark style={{ background: "var(--heat-wash)", color: "var(--heat-ink)" }}>90,000,000</mark> kWh
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <Glyph name="check" size={13} /> snippet on page · value in snippet
              </div>
            </div>
          </Step>
          <Step n="02" title="Verify" text="An accredited verifier re-hashes the bundle, recomputes the figure and signs it onto Hedera.">
            <div className="mono" style={{ fontSize: 12, padding: 12, border: "1px solid var(--rule)", background: "var(--paper)", display: "grid", gap: 4 }}>
              <span className="faint">bundle sha256</span>
              <span>0x9f2c…41ae</span>
              <span className="faint">on-chain reportHash</span>
              <span>0x9f2c…41ae ✓</span>
            </div>
          </Step>
          <Step n="03" title="Carry" text="One passport per shipment. Precursors compose; no plant can passport more than it was verified to make.">
            <div style={{ display: "grid", gap: 6 }}>
              <div className="row between mono" style={{ fontSize: 12 }}>
                <span>verified output</span>
                <span>312 / 400 kt</span>
              </div>
              <div style={{ height: 8, background: "var(--paper)", border: "1px solid var(--rule)" }}>
                <div style={{ width: "78%", height: "100%", background: "var(--ink)" }} />
              </div>
              <span className="flag" style={{ fontSize: 12 }}>
                <Glyph name="flag" size={12} /> 401 kt → OverCap, refused on chain
              </span>
            </div>
          </Step>
        </div>
      </section>

      {/* ---- trust ---- */}
      <section className="wrap" style={{ paddingBottom: 96 }}>
        <div className="row between" style={{ alignItems: "end", marginBottom: 20 }}>
          <h2>
            Four keys, four jobs. <span className="quiet">No admin can mint or edit a passport.</span>
          </h2>
          <span className="index">[04]</span>
        </div>
        <div className="cells grid-4">
          {[
            ["shield", "Accreditor", "Adds and suspends verifiers.", "Can't attest or issue."],
            ["stamp", "Verifier", "Attests a plant's year, or revokes it.", "Can't issue passports."],
            ["plant", "Operator", "Issues passports within its verified output.", "Can't change a figure."],
            ["box", "Importer", "Declares a passport, once.", "Can't reuse one."],
          ].map(([g, role, can, cannot]) => (
            <div key={role} style={{ display: "grid", gap: 10, background: "var(--sheet)" }}>
              <Glyph name={g as "shield"} size={20} />
              <h3>{role}</h3>
              <span className="muted" style={{ fontSize: 14 }}>{can}</span>
              <span className="faint" style={{ fontSize: 13 }}>{cannot}</span>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="wrap row between" style={{ height: 76, flexWrap: "wrap", gap: 12 }}>
          <Brand />
          <span className="mono faint" style={{ fontSize: 12 }}>
            Hedera testnet · Passports{" "}
            <a href={`https://hashscan.io/testnet/contract/${CONTRACTS.Passports.id}`} target="_blank" rel="noreferrer">
              {CONTRACTS.Passports.id}
            </a>{" "}
            · demo data is synthetic
          </span>
          <a className="mono" style={{ fontSize: 12 }} href="https://github.com/youvandra/heatmark" target="_blank" rel="noreferrer">
            github ↗
          </a>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, text, children }: { n: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start", background: "var(--sheet)" }}>
      <span className="index">{n}</span>
      <h3>{title}</h3>
      <span className="muted" style={{ fontSize: 14 }}>{text}</span>
      {children}
    </div>
  );
}
