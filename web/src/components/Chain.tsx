import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PassportView } from "../lib/api";
import { CN_LABELS, fmt, intensity, tonnes } from "../lib/format";
import { Glyph } from "./ui";

export interface ChainNode {
  key: string;
  label: string;
  title: string;
  value?: string;
  unit?: string;
  meta?: ReactNode;
  tone?: "dim" | "hot";
  href?: string;
  warn?: string;
}

export function Chain({ nodes }: { nodes: ChainNode[] }) {
  return (
    <div className="chain">
      {nodes.map((n, i) => (
        <Fragment key={n.key}>
          {i > 0 && <span className="link-line" aria-hidden />}
          <div className={`node${n.tone ? ` ${n.tone}` : ""}`}>
            <span className="label">{n.label}</span>
            <strong style={{ fontWeight: 500 }}>{n.href ? <Link to={n.href}>{n.title}</Link> : n.title}</strong>
            {n.value && (
              <span className="v">
                {n.value}
                {n.unit && <span className="faint" style={{ fontSize: 12, marginLeft: 6 }}>{n.unit}</span>}
              </span>
            )}
            {n.meta && <span className="muted" style={{ fontSize: 13 }}>{n.meta}</span>}
            {n.warn && (
              <span className="flag">
                <Glyph name="flag" size={13} /> {n.warn}
              </span>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** The path a passport's figure travelled: scrap → each precursor → this passport → its holder. */
export function passportChain(p: PassportView): ChainNode[] {
  const ancestors: PassportView[] = [];
  let cur: PassportView | undefined = p.precursors[0];
  while (cur) {
    ancestors.unshift(cur);
    cur = cur.precursors[0];
  }
  const node = (x: PassportView, hot: boolean): ChainNode => ({
    key: `p${x.id}`,
    label: `${CN_LABELS[x.cnCode] ?? `CN ${x.cnCode}`} · passport #${x.id}`,
    title: x.installation?.name.replace(" (synthetic)", "") ?? "Unregistered installation",
    value: intensity(x.see),
    unit: "tCO₂e/t",
    meta: `${fmt(tonnes(x.massKg))} t · route ${x.attestation.route}`,
    tone: hot ? "hot" : undefined,
    href: hot ? undefined : `/p/${x.id}`,
    warn: x.status === "revoked" ? "Attestation revoked" : x.status === "ancestor_revoked" ? "Upstream revoked" : undefined,
  });
  return [
    { key: "scrap", label: "Input", title: "Steel scrap", value: "0.000", unit: "tCO₂e/t", meta: "No embedded emissions under CBAM", tone: "dim" },
    ...ancestors.map((a) => node(a, false)),
    node(p, true),
    p.holder.kind === "installation"
      ? { key: "holder", label: "Held by", title: p.holder.name.replace(" (synthetic)", ""), meta: "Consumes it as a precursor", tone: "dim" }
      : { key: "holder", label: "Held by", title: "EU importer", meta: p.declared ? "Used in a CBAM declaration" : "Committed by hash; not yet declared", tone: "dim" },
  ];
}
