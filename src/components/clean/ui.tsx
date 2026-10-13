"use client";

// Primitives for the Clean design (design/clean/ProtoClean.dc.html): borderless
// near-black cards, section headings outside cards, pill buttons, round avatars.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";

export const cx = (...c: (string | number | false | null | undefined)[]) => c.filter((x): x is string => typeof x === "string" && x !== "").join(" ");

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const money = (n: number) => usd.format(n);
export const money0 = (n: number) => usd0.format(n);
/** Amount without a sign — tables show direction with colour, not "−". */
export const amt = (n: number) => usd.format(Math.abs(n));

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
export const shortDate = (iso: string) => fmt(iso, { month: "short", day: "numeric" });
export const monthName = (ym: string) => fmt(`${ym}-15`, { month: "long" });
export const monthShort = (ym: string) => fmt(`${ym}-15`, { month: "short" });

export function daysUntil(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86_400_000);
}

export function Page({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[var(--sec-gap,32px)]">
      <header className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-strong text-lg font-bold italic text-white">
          P
        </span>
        <h1 className="mr-auto text-2xl font-semibold leading-tight">{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  );
}

/** Heading outside the card, then the card content. */
export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex min-h-7 flex-wrap items-center gap-2.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className, flush }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <div className={cx("rounded-[20px] bg-surface", flush ? "overflow-hidden py-1" : "flex flex-col gap-3.5 p-5", className)}>{children}</div>;
}

type Tone = "pos" | "neg" | "warn" | "acc" | "neu";
const PILL: Record<Tone, string> = {
  pos: "bg-positive-bg text-positive",
  neg: "bg-negative-bg text-negative",
  warn: "bg-warning-bg text-warning",
  acc: "bg-accent-bg text-accent",
  neu: "bg-surface-3 text-muted",
};
export function Pill({ tone = "neu", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", PILL[tone], className)}>{children}</span>;
}

type BtnKind = "primary" | "secondary" | "ghost" | "link";
const BTN: Record<BtnKind, string> = {
  primary: "bg-white text-[#0a0a0a] hover:bg-white/90",
  secondary: "bg-white/[0.08] text-text hover:bg-white/[0.12]",
  ghost: "bg-transparent text-muted hover:bg-white/[0.06] hover:text-text",
  link: "!h-auto !px-0 bg-transparent text-accent hover:underline",
};
export function Btn({ kind = "secondary", small, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; small?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition disabled:cursor-default disabled:opacity-40",
        small ? "h-9 px-3.5 text-[13px]" : "h-10 px-[18px] text-sm",
        BTN[kind],
        className,
      )}
    />
  );
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const letter = name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "•";
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cx("flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold", className)}
    >
      {letter}
    </span>
  );
}

export function IconTile({ children, size = 32 }: { children: ReactNode; size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-[10px] bg-accent-bg text-accent">
      {children}
    </span>
  );
}

/** Segmented range toggle (Month / 3M / Year …). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full border border-border bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cx("h-8 rounded-full px-3.5 text-[13px] font-medium transition", o === value ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Table header + row grid used by every table: Name | x | y | Amount. */
export const GRID4 = "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 px-5";

export function TableHead({ cols }: { cols: string[] }) {
  return (
    <div role="row" className={cx(GRID4, "py-2.5 text-[13px] text-faint")}>
      {cols.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}

/** Floating side panel (transaction / payment / offer details). */
export function Drawer({ label, onClose, children, width = 380 }: { label: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <aside
      aria-label={label}
      style={{ width }}
      className="fixed inset-y-2 right-2 z-40 flex max-w-[calc(100%-16px)] flex-col gap-3.5 overflow-y-auto rounded-[20px] border border-border-strong bg-surface p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-center">
        <span className="flex-1 text-[13px] font-medium text-faint">{label}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-white/[0.06] hover:text-text">
          <X size={18} />
        </button>
      </div>
      {children}
    </aside>
  );
}

export function KV({ k, v, first }: { k: ReactNode; v: ReactNode; first?: boolean }) {
  return (
    <div className={cx("flex items-center gap-3 py-3", !first && "border-t border-border")}>
      <span className="flex-1 text-[13px] text-muted">{k}</span>
      <span className="text-right text-[13px] font-medium">{v}</span>
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-surface-2 px-3.5">{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[440px] flex-col gap-4 rounded-[20px] border border-border-strong bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center">
          <h2 className="flex-1 text-xl font-semibold">{label}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-white/[0.06] hover:text-text">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
