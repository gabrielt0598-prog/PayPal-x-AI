// Budget model: categories, limits, persistence and live-spend helpers.

import { isSpend, r2 } from "@/lib/finance";
import { CATEGORIES, type Category, type Transaction } from "@/lib/types";
import { prevYm, ymOf } from "../data";

export type BudSection = "ess" | "spend";
export type BudIcon = "bolt" | "fork" | "bag" | "basket" | "car" | "repeat" | "cart";

export interface BudItem {
  id: string;
  name: string;
  icon: BudIcon;
  sec: BudSection;
  /** App transaction category whose spend counts toward this budget line. */
  cat?: Category;
}

export interface BudState {
  total: number;
  limits: Record<string, number>;
  items: BudItem[];
}

export const DEFAULT_TOTAL = 3000;

export const DEFAULT_STATE: BudState = {
  total: DEFAULT_TOTAL,
  limits: { essential: 1600, dining: 250, shopping: 150, groceries: 400, transport: 80, subs: 180 },
  items: [
    { id: "essential", name: "Bills & Utilities", icon: "bolt", sec: "spend", cat: "Essential bills" },
    { id: "dining", name: "Dining & Drinks", icon: "fork", sec: "spend", cat: "Dining" },
    { id: "shopping", name: "Shopping", icon: "bag", sec: "spend", cat: "Shopping" },
    { id: "groceries", name: "Groceries", icon: "basket", sec: "spend", cat: "Groceries" },
    { id: "transport", name: "Transport", icon: "car", sec: "spend", cat: "Transport" },
    { id: "subs", name: "Subscriptions", icon: "repeat", sec: "spend", cat: "Subscriptions" },
  ],
};

const KEY = "clean.budget.v1";

export function loadBudget(): BudState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<BudState>;
    if (typeof p.total !== "number" || !p.limits || !Array.isArray(p.items)) return null;
    return { total: p.total, limits: p.limits, items: p.items };
  } catch {
    return null;
  }
}

export function saveBudget(s: BudState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — budget just won't persist */
  }
}

export const parseAmount = (text: string, max = 99999) => {
  const n = parseInt(text.replace(/[^0-9]/g, ""), 10);
  return n > 0 ? Math.min(n, max) : 0;
};

/** Category for a user-added line, if its name matches one of the app's. */
export function catForName(name: string): Category | undefined {
  const n = name.trim().toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === n && c !== "Income" && c !== "Transfers" && c !== "Cashback");
}

export function monthSpends(txns: Transaction[], cat: Category | undefined, ym: string) {
  if (!cat) return [];
  return txns.filter((t) => isSpend(t) && t.category === cat && ymOf(t.date) === ym && !/paypal debit card/i.test(t.merchant));
}

export const spentIn = (txns: Transaction[], cat: Category | undefined, ym: string) => r2(monthSpends(txns, cat, ym).reduce((a, t) => a - t.amount, 0));

export type BudStatus = "over" | "near" | "ok";
export const statusOf = (spent: number, limit: number): BudStatus => (limit && spent > limit ? "over" : limit && spent / limit >= 0.85 ? "near" : "ok");

export const STATUS_TEXT: Record<BudStatus, string> = { over: "text-negative", near: "text-warning", ok: "text-positive" };
export const STATUS_STROKE: Record<BudStatus, string> = { over: "var(--negative)", near: "var(--warning)", ok: "var(--accent)" };

export interface BudRow {
  item: BudItem;
  sp: number;
  lim: number;
  left: number;
  status: BudStatus;
}

export interface BudInsights {
  avg: number;
  bars: { ym: string; v: number; cur: boolean }[];
  txs: Transaction[];
  /** Largest single purchase this month and its share of the month's spend on this line. */
  big: { tx: Transaction; share: number } | null;
}

/** Suggested monthly limit: average of the last full months, rounded to $10. */
export function suggestLimit(txns: Transaction[], cat: Category | undefined, ym: string, fullMonths: Set<string>): number | undefined {
  if (!cat) return undefined;
  const p1 = prevYm(ym);
  const prior = [p1, prevYm(p1), prevYm(prevYm(p1))].filter((m) => fullMonths.has(m));
  if (!prior.length) return undefined;
  const avg = prior.reduce((a, m) => a + spentIn(txns, cat, m), 0) / prior.length;
  const s = Math.round(avg / 10) * 10;
  return s > 0 ? s : undefined;
}

/** 3-month average, 3-bar trend, recent transactions and biggest purchase for one line. */
export function insightsFor(txns: Transaction[], cat: Category | undefined, ym: string, fullMonths: Set<string>): BudInsights {
  const p1 = prevYm(ym);
  const p2 = prevYm(p1);
  const p3 = prevYm(p2);
  const prior = [p1, p2, p3].filter((m) => fullMonths.has(m));
  const avg = prior.length ? r2(prior.reduce((a, m) => a + spentIn(txns, cat, m), 0) / prior.length) : 0;
  const bars = [p2, p1, ym].map((m) => ({ ym: m, v: spentIn(txns, cat, m), cur: m === ym }));
  const cur = monthSpends(txns, cat, ym);
  const txs = cur.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const total = cur.reduce((a, t) => a - t.amount, 0);
  const top = cur.slice().sort((a, b) => a.amount - b.amount)[0];
  const big = top && total ? { tx: top, share: -top.amount / total } : null;
  return { avg, bars, txs, big };
}
