"use client";

import { useState, type ReactNode } from "react";
import { Car, Repeat, ShoppingBag, ShoppingBasket, ShoppingCart, Target, UtensilsCrossed, Zap, type LucideIcon } from "lucide-react";
import { cx, IconTile, money, money0 } from "../ui";
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

/** Rounded-cap ring. `pct` 0-100. */
export function Ring({ pct, status, size, stroke }: { pct: number; status: BudStatus; size: number; stroke: number }) {
  const c = size / 2;
  const r = c - stroke / 2 - (size > 40 ? 6 : 0);
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg aria-hidden viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block shrink-0 -rotate-90">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      {p > 0 && <circle cx={c} cy={c} r={r} pathLength={100} fill="none" stroke={STATUS_STROKE[status]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${p} 100`} />}
    </svg>
  );
}

/** Text field that matches the modal fields: 12px radius, --surface-2 fill, border. */
export function MoneyField({
  value,
  errValue,
  invalid,
  label,
  onCommit,
  large,
  id,
  className,
}: {
  value: number | string;
  /** Rejected text to keep showing while the error is up. */
  errValue?: string;
  invalid?: boolean;
  label: string;
  onCommit: (text: string) => void;
  large?: boolean;
  id?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? errValue ?? String(value);
  const commit = () => {
    if (draft === null) return;
    const t = draft;
    setDraft(null);
    if (t !== String(value) || invalid) onCommit(t);
  };
  return (
    <label className={cx("flex w-full items-center gap-2 rounded-[12px] border bg-surface-2 px-3 text-sm", large ? "h-12 px-3.5" : "h-10 max-w-[112px] @max-[560px]:px-2", invalid ? "border-negative" : "border-border-strong", className)}>
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
  "grid grid-cols-[minmax(190px,1.3fr)_repeat(3,minmax(0,1fr))_20px] items-center gap-x-4 px-5 @max-[560px]:grid-cols-[156px_repeat(3,minmax(0,1fr))] @max-[560px]:gap-x-2 @max-[560px]:px-3";

export function BudHead() {
  return (
    <div role="row" className={cx(GRID, "py-2.5 text-[13px] text-faint")}>
      <span>Name</span>
      <span>Spent</span>
      <span>Budgeted</span>
      <span>Remaining</span>
      <span aria-hidden className="@max-[560px]:hidden" />
    </div>
  );
}

export function BudgetRowView({
  row,
  total,
  err,
  onOpen,
  onCommit,
}: {
  row: BudRow;
  /** Present on the "Monthly budget" row: the editable total. */
  total?: boolean;
  err?: { v: string; over: number; cap: number } | null;
  onOpen: () => void;
  onCommit: (text: string) => void;
}) {
  const { item, sp, lim, left, status } = row;
  const Icon = ICONS[total ? "target" : item.icon];
  const rem = `${left < 0 ? "−" : ""}${money(Math.abs(left))}`;
  return (
    <div role="row" className={cx(GRID, "py-3")}>
      <button type="button" onClick={onOpen} aria-label={`${item.name} details`} className="flex min-w-0 items-center gap-3 whitespace-nowrap text-left">
        <span className="@max-[560px]:hidden">
          <IconTile size={32}>
            <Icon size={16} />
          </IconTile>
        </span>
        <span className="truncate text-[15px] @max-[560px]:text-sm">{item.name}</span>
      </button>
      <span className="text-[15px]">{money(sp)}</span>
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <MoneyField value={lim} errValue={err?.v} invalid={!!err} label={`${item.name} monthly budget`} onCommit={onCommit} />
      </span>
      <span className={cx("text-[15px]", STATUS_TEXT[status])}>
        {rem}
        {total && <span className="text-faint"> / {money0(lim)}</span>}
      </span>
      <span className="@max-[560px]:hidden">
        <Ring pct={lim ? (sp / lim) * 100 : 0} status={status} size={20} stroke={3} />
      </span>
      {err && (
        <span role="alert" className="col-span-full pt-2 text-xs leading-snug text-negative">
          Not saved. This would put you {money(err.over)} over your {money(err.cap)} monthly budget.
        </span>
      )}
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
