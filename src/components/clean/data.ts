// Derived numbers for the Clean pages. Pure helpers over FinanceState.

import { categoryBreakdown, isIncome, isSpend, periodTotals, r2 } from "@/lib/finance";
import type { Category, FinanceState, Transaction } from "@/lib/types";

export const asOfDate = (s: FinanceState) => s.asOf.slice(0, 10);
export const ymOf = (iso: string) => iso.slice(0, 7);

export function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function prevYm(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function monthBounds(ym: string) {
  return { from: `${ym}-01`, to: `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}` };
}

/** Cumulative spend by day of month (index 0 = day 1), up to `upto` days. */
export function cumulative(txns: Transaction[], ym: string, upto = daysInMonth(ym)) {
  const daily = Array.from({ length: upto }, () => 0);
  for (const t of txns) {
    if (!isSpend(t) || ymOf(t.date) !== ym) continue;
    const d = Number(t.date.slice(8, 10));
    if (d <= upto) daily[d - 1] += -t.amount;
  }
  let run = 0;
  return daily.map((v) => (run = r2(run + v)));
}

export function monthTotals(s: FinanceState, ym: string) {
  const { from, to } = monthBounds(ym);
  return periodTotals(s.transactions, from, to);
}

export function cashbackIn(s: FinanceState, ym: string) {
  return r2(s.transactions.filter((t) => t.category === "Cashback" && ymOf(t.date) === ym).reduce((a, t) => a + t.amount, 0));
}

/** Months with data, newest first; `full` is false for the first (partial) and current month. */
export function dataMonths(s: FinanceState) {
  const yms = [...new Set(s.transactions.map((t) => ymOf(t.date)))].sort();
  const first = s.transactions.reduce((m, t) => (t.date < m ? t.date : m), s.transactions[0]?.date ?? s.asOf).slice(0, 10);
  const cur = ymOf(s.asOf);
  return yms
    .map((ym) => ({ ym, full: ym !== cur && !(ym === ymOf(first) && first.slice(8, 10) !== "01"), firstDay: ym === ymOf(first) ? Number(first.slice(8, 10)) : 1 }))
    .reverse();
}

export const CAT_COLORS = ["#3d8bff", "#e8833a", "#22a06b", "#a46ee8", "#d4a72c", "#e5577a", "#8a8f98"];

/** Top 6 categories + Other for a month, with change vs the previous month. */
export function monthCategories(s: FinanceState, ym: string) {
  const { from, to } = monthBounds(ym);
  const p = monthBounds(prevYm(ym));
  const cur = categoryBreakdown(s.transactions, from, to);
  const prev = new Map(categoryBreakdown(s.transactions, p.from, p.to).map((c) => [c.category, c.spend]));
  const top = cur.slice(0, 6);
  const rest = cur.slice(6);
  const rows: { name: Category | "Other"; spend: number; prev: number | undefined }[] = top.map((c) => ({ name: c.category, spend: c.spend, prev: prev.get(c.category) }));
  if (rest.length) {
    rows.push({
      name: "Other",
      spend: r2(rest.reduce((a, c) => a + c.spend, 0)),
      prev: prev.size ? r2(rest.reduce((a, c) => a + (prev.get(c.category) ?? 0), 0)) : undefined,
    });
  }
  const total = r2(rows.reduce((a, r) => a + r.spend, 0));
  return { rows, total, hasPrev: prev.size > 0 };
}

export function incomeOut(txns: Transaction[]) {
  let inc = 0;
  let out = 0;
  for (const t of txns) {
    if (isIncome(t)) inc += t.amount;
    if (isSpend(t)) out += -t.amount;
  }
  return { in: r2(inc), out: r2(out), net: r2(inc - out) };
}
