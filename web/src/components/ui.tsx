import type { CSSProperties, ReactNode } from "react";
import { short } from "../lib/format";

/** The mark: an H whose crossbar runs through a heat. Drawn, not borrowed. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="2" fill="var(--ink)" />
      <path d="M9 23V9m14 14V9M9 16h14" stroke="var(--paper)" strokeWidth="2.4" strokeLinecap="square" />
      <circle cx="16" cy="16" r="3.2" fill="var(--heat)" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="row" style={{ gap: 10, fontWeight: 600, letterSpacing: "-0.02em", fontSize: 17 }}>
      <Mark /> Heatmark
    </span>
  );
}

export function Skeleton({ w = "100%", h = 16, style }: { w?: number | string; h?: number | string; style?: CSSProperties }) {
  return <span className="skeleton" style={{ width: w, height: h, ...style }} />;
}

export function State({ tone, children }: { tone: "ok" | "warn" | "quiet"; children: ReactNode }) {
  return <span className={`state ${tone}`}>{children}</span>;
}

/** A machine value: mono, shortened, links to HashScan when it has a home there. */
export function Hash({ value, href, full }: { value: string; href?: string; full?: boolean }) {
  const text = full ? value : short(value);
  return href ? (
    <a className="mono" href={href} target="_blank" rel="noreferrer" title={value}>
      {text} ↗
    </a>
  ) : (
    <span className="mono" title={value}>
      {text}
    </span>
  );
}

export function Cell({ k, children, span }: { k: string; children: ReactNode; span?: number }) {
  return (
    <div style={span ? { gridColumn: `span ${span}` } : undefined}>
      <span className="label cell-k">{k}</span>
      <div className="cell-v">{children}</div>
    </div>
  );
}

/** Hand-drawn glyphs for the few icons the app needs. */
export function Glyph({ name, size = 16 }: { name: "flag" | "check" | "doc" | "chain" | "stamp" | "upload" | "arrow" | "plant" | "shield" | "box"; size?: number }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    flag: <path {...p} d="M4 14V2.5m0 0h7.5l-1.6 2.6 1.6 2.6H4" />,
    check: <path {...p} d="M2.5 8.5 6 12l7.5-8" />,
    doc: <path {...p} d="M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5" />,
    chain: <path {...p} d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />,
    stamp: <path {...p} d="M5.5 9V7.5a2.5 2.5 0 1 1 5 0V9M3 9h10v2.5H3zM3.5 14h9" />,
    upload: <path {...p} d="M8 11V2.5m0 0L5 5.5m3-3 3 3M2.5 10.5v3h11v-3" />,
    arrow: <path {...p} d="M2.5 8h11m0 0L9.5 4m4 4-4 4" />,
    plant: <path {...p} d="M1.5 14.5h13M2.5 14.5V8l3.5 2.5V8l3.5 2.5V4.5h2.5v10M11 2v2.5" />,
    shield: <path {...p} d="M8 1.5 13.5 3.5v4.5c0 3.2-2.4 5.3-5.5 6.5C4.9 13.3 2.5 11.2 2.5 8V3.5zM5.5 8l1.8 1.8L10.5 6.5" />,
    box: <path {...p} d="M8 1.5 14 4.5v7L8 14.5 2 11.5v-7zM2 4.5l6 3 6-3M8 7.5v7" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ flex: "none" }}>
      {paths[name]}
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="frame" style={{ padding: "40px 24px", display: "grid", gap: 10, justifyItems: "start" }}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
