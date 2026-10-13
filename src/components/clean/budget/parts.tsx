"use client";

import { useState, type ReactNode } from "react";
import { Car, Repeat, ShoppingBag, ShoppingBasket, ShoppingCart, Target, UtensilsCrossed, Zap, type LucideIcon } from "lucide-react";
import { CountText, cx, IconTile, money } from "../ui";
import { STATUS_STROKE, STATUS_TEXT, type BudIcon, type BudRow, type BudStatus } from "./model";

export const ICONS: Record<BudIcon | "target", LucideIcon> = {
  bolt: Zap,
  fork: UtensilsCrossed,
  bag: ShoppingBag,
  basket: ShoppingBasket,
  car: Car,
  repeat: Repeat,
  cart: ShoppingCart,
  target: Target,
};

/** Rounded-cap ring on a --surface-3 track. `pct` 0-100; `r` is the circle radius in viewBox units. */
export function Ring({ pct, status, size, stroke, r, color }: { pct: number; status: BudStatus; size: number; stroke: number; r: number; color?: string }) {
  const c = size / 2;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg aria-hidden viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block shrink-0 -rotate-90">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      {p > 0 && <circle cx={c} cy={c} r={r} pathLength={100} fill="none" stroke={color ?? STATUS_STROKE[status]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${p.toFixed(1)} 100`} className="m-ring" />}
    </svg>
  );
}

const fmtInt = (n: number | string) => {
  const d = String(n).replace(/[^0-9]/g, "");
  return d ? Number(d).toLocaleString("en-US") : "";
};

/** Drawer text field: $ prefix, thousands separators, commits on blur / Enter. */
export function MoneyField({
  value,
  errValue,
  invalid,
  label,
  onCommit,
  id,
}: {
  value: number;
  /** Rejected amount to keep showing while the error is up. */
  errValue?: string;
  invalid?: boolean;
  label: string;
  onCommit: (text: string) => void;
  id?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (errValue !== undefined ? fmtInt(errValue) : fmtInt(value));
  const commit = () => {
    if (draft === null) return;
    const t = draft;
    setDraft(null);
    if (fmtInt(t) !== fmtInt(value) || invalid) onCommit(t);
  };
  return (
    <label className={cx("flex h-12 w-full items-center gap-2 rounded-[12px] border bg-surface-2 px-3.5 text-sm", invalid ? "border-negative" : "border-border-strong")}>
      <span className="text-faint">$</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid ? "true" : "false"}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none"
      />
    </label>
  );
}

const GRID =
  "grid grid-cols-[minmax(190px,1.3fr)_repeat(2,minmax(0,1fr))_72px_20px] items-center gap-x-4 px-5 @max-[560px]:grid-cols-[156px_repeat(3,minmax(0,1fr))] @max-[560px]:gap-x-2 @max-[560px]:px-3";

export function BudHead() {
  return (
    <div role="row" className={cx(GRID, "py-2.5 text-[13px] text-faint")}>
      <span>Name</span>
      <span>Budgeted</span>
      <span>Spent</span>
      <span>Remaining</span>
      <span aria-hidden className="@max-[560px]:hidden" />
    </div>
  );
}

export function BudgetRowView({ row, total, suggestion, flash, onOpen, onAccept }: { row: BudRow; total?: boolean; suggestion?: number; flash?: boolean; onOpen: () => void; onAccept?: () => void }) {
  const { item, sp, lim, left, status } = row;
  const Icon = ICONS[total ? "target" : item.icon];
  const rem = `${left < 0 ? "−" : ""}${money(Math.abs(left))}`;
  return (
    <div role="row" className={cx(GRID, "py-[13px]", flash && "m-ai-flash")}>
      <button type="button" onClick={onOpen} aria-label={`${item.name} details`} className="flex min-w-0 items-center gap-3 whitespace-nowrap text-left">
        <span className="@max-[560px]:hidden">
          <IconTile size={32}>
            <Icon size={16} />
          </IconTile>
        </span>
        <span className="truncate text-[15px] @max-[560px]:text-sm">{item.name}</span>
      </button>
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <span className="flex h-10 items-center text-[15px]">{money(lim)}</span>
        {flash && <span className="m-pop inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-accent/45 bg-accent-bg px-2.5 text-xs font-medium text-accent">✦ Updated by Stella</span>}
        {suggestion !== undefined && onAccept && (
          <button type="button" onClick={onAccept} aria-label={`Use suggested ${money(suggestion)} for ${item.name}`} className="rounded-full bg-accent-bg px-2.5 py-1 text-xs font-medium text-accent">
            AI suggests {money(suggestion)}
          </button>
        )}
      </span>
      <span className="text-[15px]"><CountText once text={money(sp)} /></span>
      <span className={cx("text-[15px]", STATUS_TEXT[status])}><CountText once text={rem} /></span>
      <span className="-ml-2 @max-[560px]:hidden">
        <Ring pct={lim ? (sp / lim) * 100 : 0} status={status} size={20} stroke={3} r={8} />
      </span>
    </div>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm">
        {label}
      </label>
      {children}
    </div>
  );
}
