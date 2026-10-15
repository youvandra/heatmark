import { NavLink, Outlet, Link } from "react-router-dom";
import { Brand, Glyph } from "../components/ui";
import { short } from "../lib/format";
import { useSession } from "../lib/session";

export default function AppShell() {
  const { signer, demo, choose, connect, disconnect } = useSession();
  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" style={{ textDecoration: "none", padding: "4px 10px 22px" }}>
          <Brand />
        </Link>
        <NavLink className="nav" to="/app/plant">
          <Glyph name="plant" /> Plant
        </NavLink>
        <NavLink className="nav" to="/app/verifier">
          <Glyph name="stamp" /> Verifier
        </NavLink>
        <NavLink className="nav" to="/app/passports">
          <Glyph name="chain" /> Passports
        </NavLink>
        <div className="spacer" />
        <Link className="nav" to="/docs" style={{ display: "flex", gap: 10, padding: "9px 10px", color: "var(--ink-3)", textDecoration: "none", fontSize: 13 }}>
          <Glyph name="doc" /> Docs
        </Link>
      </aside>
      <div>
        <div className="top">
          <span className="label">Hedera testnet</span>
          <div className="spacer" />
          {demo.length > 0 && (
            <select
              className="select"
              style={{ width: 280, height: 36 }}
              value={signer?.kind === "demo" ? signer.address : ""}
              onChange={(e) => choose(e.target.value)}
              aria-label="Sign as"
            >
              <option value="">Sign as… (demo roles)</option>
              {demo.map((d) => (
                <option key={d.address} value={d.address}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          {signer ? (
            <button className="btn small" onClick={disconnect} title={signer.address}>
              <span className="mono">{short(signer.address)}</span>
            </button>
          ) : (
            <button className="btn small ink" onClick={connect}>
              Connect wallet
            </button>
          )}
        </div>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
