import type { FinanceState } from "@/lib/types";

export const dateOnly = (iso: string) => iso.slice(0, 10);

/** Same calendar day in the previous month (clamped to that month's length). */
export function prevMonthSameDay(asOfDate: string) {
  const y = Number(asOfDate.slice(0, 4));
  const m = Number(asOfDate.slice(5, 7));
  const d = Number(asOfDate.slice(8, 10));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(Math.min(d, last))}` };
}

export function monthRange(state: FinanceState) {
  const to = dateOnly(state.asOf);
  return { from: `${to.slice(0, 7)}-01`, to, prev: prevMonthSameDay(to) };
}

export function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

export const shortDate = (iso: string) => fmtDate(iso, { month: "short", day: "numeric" });
export const longDate = (iso: string) => fmtDate(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function daysBetween(fromDate: string, toDate: string) {
  return Math.round((Date.parse(toDate.slice(0, 10)) - Date.parse(fromDate.slice(0, 10))) / 86400000);
}

export const compactUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

export const METHOD_LABEL = {
  paypal_debit_card: "Card",
  paypal_balance: "Balance",
  direct_deposit: "Direct deposit",
  auto_reload: "Auto-reload",
  bank_transfer: "Bank transfer",
  paypal_offer: "PayPal Offer",
} as const;
