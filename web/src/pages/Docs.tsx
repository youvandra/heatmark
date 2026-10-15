import { Link } from "react-router-dom";
import { Brand } from "../components/ui";
import { CONTRACTS } from "../lib/wallet";

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "problem",
    title: "Why the default costs money",
    body: (
      <>
        <p>Since 1 January 2026 an EU importer of steel, cement, aluminium or fertiliser owes CBAM certificates for the emissions embedded in each tonne. Without verified data from the producer it must use the Commission's default value for the country and product, plus a mark-up (10% in 2026, 20% in 2027, 30% from 2028).</p>
        <p>Türkiye's default for rebar and wire rod (CN 7213/7214) is 2.310 tCO₂e/t, tied to the blast-furnace route. Roughly 70% of Turkish steel is melted from scrap in electric arc furnaces. A scrap-EAF mill at 0.4 t/t pays about €72/t more on the default in 2026; across Türkiye's EAF steel exports that is ≈€260M a year, ≈€426M by 2028.</p>
        <p>Sources and the calculation: <a href="https://github.com/youvandra/heatmark/blob/main/docs/MEASURE.md" target="_blank" rel="noreferrer">MEASURE.md</a>. Every number there is re-derived by <span className="mono">bun run verify</span>.</p>
      </>
    ),
  },
  {
    id: "precursors",
    title: "Why a chain, not a database",
    body: (
      <>
        <p>A rebar's emissions include the billet it was rolled from. If the melt shop upstream has no verified figure, the rebar falls back to the default however clean the rolling mill is. The figure has to travel across companies that don't share a system.</p>
        <p>Each passport points at the precursor passports it consumed, draws down their mass, and draws down its own installation's verified output. A melt shop can't passport more billet than its verifier attested, and the same billet can't back two batches of rebar. The contracts compute the final figure; nobody types it.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "What the AI does, and doesn't",
    body: (
      <>
        <p>The model reads invoices and production logs and returns fields: a quantity, its unit, the page, and a verbatim quote. Code then checks that the quote is on that page and holds the number. Unit conversion, sums and every emission factor are in code. The model never reports an emissions figure.</p>
        <p>Documents are treated as data. The demo includes a scrap receipt carrying an instruction to report false production; the extractor quotes it as a warning and does not follow it.</p>
      </>
    ),
  },
  {
    id: "trust",
    title: "Who can do what",
    body: (
      <>
        <p><strong>Accreditor</strong> adds and suspends verifiers. <strong>Verifier</strong> attests an installation's year after re-hashing the report bundle and recomputing its figure in the browser, and can revoke it. <strong>Operator</strong> issues passports within its verified output. <strong>Importer</strong> marks a passport as used in a declaration, once, by proving it is the committed holder.</p>
        <p>No key does two jobs, and the contracts have no admin and no upgrade path.</p>
      </>
    ),
  },
  {
    id: "hedera",
    title: "Why Hedera",
    body: (
      <>
        <p>A council-governed network that anyone can verify through its mirror nodes: an EU customs officer can check a passport without joining a consortium. Verra and BCarbon run registries on it, and Hedera's Guardian already models the same roles (standard registry, verifier, project proponent).</p>
        <p>The contracts are plain Solidity and run unchanged on a permissioned Hyperledger Besu network if accreditation bodies prefer one.</p>
        <p className="mono" style={{ fontSize: 13 }}>
          Accreditation {CONTRACTS.Accreditation.id} · Attestations {CONTRACTS.Attestations.id} · Passports {CONTRACTS.Passports.id}
        </p>
      </>
    ),
  },
  {
    id: "limits",
    title: "What this demo is not",
    body: (
      <>
        <p>The installations, documents and the verifier are synthetic and say so on every page. The verifier key is not an accredited body. Defaults are from Implementing Regulation (EU) 2025/2621 as first published; the July 2026 correction (2026/1740) still has to be merged. The integration with the EU CBAM Registry is an export, not a live connection.</p>
      </>
    ),
  },
];

export default function Docs() {
  return (
    <div>
      <header className="wrap row between" style={{ height: 72 }}>
        <Link to="/" style={{ textDecoration: "none" }}><Brand /></Link>
        <Link className="btn ink small" to="/app">Open app</Link>
      </header>
      <main className="wrap docs-grid" style={{ paddingBottom: 96 }}>
        <nav className="stack" style={{ position: "sticky", top: 24, alignSelf: "start", gap: 6 }}>
          <span className="label" style={{ marginBottom: 6 }}>Docs</span>
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="muted" style={{ textDecoration: "none", fontSize: 14 }}>{s.title}</a>)}
        </nav>
        <div className="stack" style={{ gap: 48 }}>
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} className="prose">
              <span className="index">[{String(i + 1).padStart(2, "0")}]</span>
              <h2 style={{ marginTop: 8 }}>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
