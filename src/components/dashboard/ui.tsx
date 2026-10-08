"use client";

import type { ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx("scroll-mt-6 rounded-card border border-border bg-surface p-4 sm:p-5", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-surface-3", className)} />;
}

type Tone = "neutral" | "positive" | "negative" | "warning" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  positive: "bg-positive-bg text-positive",
  negative: "bg-negative-bg text-negative",
  warning: "bg-warning-bg text-warning",
  accent: "bg-accent/15 text-accent",
};

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** +/- percentage pill. `goodWhen` says which direction is favourable. */
export function DeltaChip({ pct, goodWhen }: { pct: number | null; goodWhen: "up" | "down" }) {
  if (pct === null) return <Chip>n/a</Chip>;
  const up = pct >= 0;
  const good = goodWhen === "up" ? up : !up;
  return (
    <Chip tone={Math.abs(pct) < 0.5 ? "neutral" : good ? "positive" : "negative"} className="num">
      {up ? "+" : "−"}
      {Math.abs(pct).toFixed(1)}%
    </Chip>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            o.value === value ? "bg-surface-3 text-text" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-faint">{children}</p>;
}
