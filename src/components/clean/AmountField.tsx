"use client";

import { useState } from "react";

/** Largest amount a single top-up / transfer may be (the move-money API allows up to 100,000). */
export const MAX_AMOUNT = 10_000;

const parse = (t: string) => (t === "" || t === "." ? 0 : Number(t));
const fmt = (n: number) => (n > 0 ? String(n) : "");

/**
 * The big "$100.00" figure as a text field: type any amount (digits and one decimal point, up to 2 decimals).
 * The quick-pick chips beside it just set `value`; the field then shows that number.
 */
export function AmountField({ value, onChange, autoFocus }: { value: number; onChange: (n: number) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(fmt(value));
  // Show what was typed while it still means `value` (so "12." stays "12."), otherwise the externally-set value.
  const shown = parse(text) === value ? text : fmt(value);
  return (
    <label className="flex items-baseline gap-1 rounded-xl border border-border-strong bg-surface-2 px-4 py-2.5 focus-within:border-accent/60">
      <span aria-hidden="true" className="num text-[40px] font-semibold tracking-tight">$</span>
      <input
        value={shown}
        onChange={(e) => {
          let t = e.target.value.replace(/[^\d.]/g, "");
          const dot = t.indexOf(".");
          if (dot >= 0) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "").slice(0, 2);
          t = t.replace(/^0+(?=\d)/, "").slice(0, 9);
          setText(t);
          onChange(Math.min(parse(t), MAX_AMOUNT));
        }}
        inputMode="decimal"
        placeholder="0.00"
        aria-label="Amount in dollars"
        autoFocus={autoFocus}
        className="num min-w-0 flex-1 bg-transparent text-[40px] font-semibold tracking-tight !outline-none placeholder:text-faint"
      />
    </label>
  );
}
