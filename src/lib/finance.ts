// Pure, deterministic finance helpers shared by the dashboard (client) and the
// agent tools (server). No I/O here — pass in data from FinanceState.

import type {
  Category,
  CategorySpend,
  FinanceState,
  Offer,
  RecurringPayment,
  SpendPoint,
  Transaction,
} from "./types";

export const r2 = (n: number) => Math.round(n * 100) / 100;

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Canonical money format. The JEV guardrail matches numbers in this format. */
export const formatUSD = (n: number) => usdFormatter.format(n);

/** Money out that counts as spending (savings transfers and auto-reloads are not spending). */
export const isSpend = (t: Transaction) => t.amount < 0 && t.category !== "Transfers";
/** Money in that counts as income (excludes auto-reloads from the user's own bank). */
export const isIncome = (t: Transaction) => t.amount > 0 && (t.category === "Income" || t.category === "Cashback");

export function inRange(t: Transaction, from?: string, to?: string) {
  const d = t.date.slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
}

function bucket(
  txns: Transaction[],
  keyOf: (t: Transaction) => string,
  labelOf: (key: string) => string,
  keys?: string[],
): SpendPoint[] {
  const map = new Map<string, SpendPoint>();
  for (const k of keys ?? []) map.set(k, { period: k, label: labelOf(k), spend: 0, income: 0 });
  for (const t of txns) {
    const k = keyOf(t);
    const p = map.get(k) ?? { period: k, label: labelOf(k), spend: 0, income: 0 };
    if (isSpend(t)) p.spend += -t.amount;
    if (isIncome(t)) p.income += t.amount;
    map.set(k, p);
  }
  return [...map.values()]
    .map((p) => ({ ...p, spend: r2(p.spend), income: r2(p.income) }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Daily spend for the `days` days ending at `asOf` (inclusive), zero-filled. */
export function spendByDay(txns: Transaction[], asOf: string, days = 30): SpendPoint[] {
  const end = new Date(asOf.slice(0, 10) + "T00:00:00Z");
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  const from = keys[0];
  return bucket(
    txns.filter((t) => inRange(t, from, keys[keys.length - 1])),
    (t) => t.date.slice(0, 10),
    (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`,
    keys,
  );
}

export function spendByMonth(txns: Transaction[]): SpendPoint[] {
  return bucket(txns, (t) => t.date.slice(0, 7), (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`);
}

export function spendByYear(txns: Transaction[]): SpendPoint[] {
  return bucket(txns, (t) => t.date.slice(0, 4), (k) => k);
}

export function categoryBreakdown(txns: Transaction[], from?: string, to?: string): CategorySpend[] {
  const totals = new Map<Category, { spend: number; count: number }>();
  for (const t of txns) {
    if (!isSpend(t) || !inRange(t, from, to)) continue;
    const c = totals.get(t.category) ?? { spend: 0, count: 0 };
    c.spend += -t.amount;
    c.count += 1;
    totals.set(t.category, c);
  }
  const all = [...totals.values()].reduce((a, c) => a + c.spend, 0) || 1;
  return [...totals.entries()]
    .map(([category, c]) => ({ category, spend: r2(c.spend), count: c.count, share: c.spend / all }))
    .sort((a, b) => b.spend - a.spend);
}

export function periodTotals(txns: Transaction[], from?: string, to?: string) {
  let spend = 0;
  let income = 0;
  for (const t of txns) {
    if (!inRange(t, from, to)) continue;
    if (isSpend(t)) spend += -t.amount;
    if (isIncome(t)) income += t.amount;
  }
  return { spend: r2(spend), income: r2(income), net: r2(income - spend) };
}

/** Monthly-equivalent cost of a recurring payment. */
export function monthlyCost(r: RecurringPayment) {
  if (r.cycle === "weekly") return r2((r.amount * 52) / 12);
  if (r.cycle === "yearly") return r2(r.amount / 12);
  return r.amount;
}

export function recurringSummary(recurring: RecurringPayment[]) {
  const active = recurring.filter((r) => r.status === "active");
  const subs = active.filter((r) => r.kind === "subscription");
  return {
    activeCount: active.length,
    subscriptionCount: subs.length,
    subscriptionsMonthly: r2(subs.reduce((a, r) => a + monthlyCost(r), 0)),
    billsMonthly: r2(active.filter((r) => r.kind !== "subscription").reduce((a, r) => a + monthlyCost(r), 0)),
    totalMonthly: r2(active.reduce((a, r) => a + monthlyCost(r), 0)),
  };
}

/** Subscriptions not used in `days` days relative to asOf. */
export function unusedSubscriptions(recurring: RecurringPayment[], asOf: string, days = 30) {
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const c = cutoff.toISOString().slice(0, 10);
  return recurring.filter((r) => r.kind === "subscription" && r.status === "active" && r.lastUsedAt && r.lastUsedAt < c);
}

export function upcomingCharges(recurring: RecurringPayment[], asOf: string, days = 14) {
  const end = new Date(asOf);
  end.setUTCDate(end.getUTCDate() + days);
  const e = end.toISOString().slice(0, 10);
  return recurring
    .filter((r) => r.status === "active" && r.nextChargeDate <= e)
    .sort((a, b) => a.nextChargeDate.localeCompare(b.nextChargeDate));
}

/** Cashback an offer would pay on a transaction, or null if ineligible. */
export function offerCashback(offer: Offer, t: Transaction): number | null {
  if (offer.status !== "available" && offer.status !== "added") return null;
  if (t.merchant !== offer.merchant || !isSpend(t) || t.appliedOfferId) return null;
  const d = t.date.slice(0, 10);
  if (d < offer.validFrom || d > offer.validUntil) return null;
  const spent = -t.amount;
  if (offer.minSpend && spent < offer.minSpend) return null;
  const raw = offer.type === "percent_cashback" ? (spent * offer.value) / 100 : offer.value;
  return r2(offer.maxCashback ? Math.min(raw, offer.maxCashback) : raw);
}

/** Best eligible transaction for each available offer (highest cashback, then most recent). */
export function eligibleOffers(state: Pick<FinanceState, "offers" | "transactions">) {
  return state.offers
    .filter((o) => o.status === "available" || o.status === "added")
    .map((offer) => {
      let best: { transaction: Transaction; cashback: number } | null = null;
      for (const t of state.transactions) {
        const cb = offerCashback(offer, t);
        if (cb === null) continue;
        if (!best || cb > best.cashback || (cb === best.cashback && t.date > best.transaction.date)) best = { transaction: t, cashback: cb };
      }
      return { offer, best };
    });
}

/** Rough annual projection from the observed window's monthly run-rate. */
export function projectAnnual(txns: Transaction[]) {
  const months = spendByMonth(txns);
  // Ignore partial first/last months when we have enough full ones.
  const full = months.length > 2 ? months.slice(1, -1) : months;
  const avgSpend = full.reduce((a, m) => a + m.spend, 0) / Math.max(1, full.length);
  const avgIncome = full.reduce((a, m) => a + m.income, 0) / Math.max(1, full.length);
  return { monthlySpend: r2(avgSpend), monthlyIncome: r2(avgIncome), annualSpend: r2(avgSpend * 12), annualIncome: r2(avgIncome * 12) };
}
