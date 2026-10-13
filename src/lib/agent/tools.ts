// Tool definitions + server-side executors. Both the LLM agent and the
// rule-based fallback call the SAME executors. Every executor returns a plain
// JSON object with a deterministic `summary` string; all money is pre-formatted
// with formatUSD and every total/average/difference is computed here, never by the model.

import type Anthropic from "@anthropic-ai/sdk";
import {
  categoryBreakdown,
  eligibleOffers,
  formatUSD,
  inRange,
  isSpend,
  monthlyCost,
  periodTotals,
  r2,
  recurringSummary,
  spendByDay,
  spendByMonth,
  spendByYear,
  unusedSubscriptions,
} from "@/lib/finance";
import { applyOffer, cancelRecurring, demoBalanceDelta, getState, recategorize, reportUnauthorizedCharge, setCardFrozen } from "@/lib/store";
import { jev, kernel, memory, paypal } from "@/lib/services";
import { CATEGORIES, type Category, type RecurringPayment, type Transaction } from "@/lib/types";
import type { IntentResult } from "@/lib/services/contracts";
import type { AgentAction, CompareTable } from "./types";

export interface ToolContext {
  sessionId: string;
  latestUserMessage: string;
  /** Origin of the request, for PayPal return URLs. */
  origin?: string;
  /** Intent Jev already produced alongside evidence reranking (saves a second Jev call in the rule-based agent). */
  intent?: IntentResult;
  actions: AgentAction[];
  /** Every tool result from this turn (used as guardrail ground truth + safe fallback reply). */
  results: { tool: string; input: unknown; output: ToolOutput }[];
}
export type ToolOutput = { summary: string; [k: string]: unknown };

const MAX_ROWS = 40;
const PERIODS = ["this_month", "last_month", "last_30_days", "all"] as const;
type Period = (typeof PERIODS)[number];

// ---------- tool definitions (stable order => stable prompt-cache prefix) ----------

const periodProp = {
  type: "string",
  enum: [...PERIODS],
  description: "Convenience date range relative to today. Overrides from/to when set.",
};
const dateProp = (d: string) => ({ type: "string", description: `${d} (YYYY-MM-DD, inclusive)` });

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_account_overview",
    description:
      "PayPal balance, auto-reload settings, debit card, month-to-date income/spend/net and a recurring-payments summary. Use for balance or general 'how am I doing' questions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query_transactions",
    description:
      "Search transactions. Returns up to 40 rows (newest first) with id, date, merchant, amount, category, method, plus the total match count and the sum of all matches.",
    input_schema: {
      type: "object",
      properties: {
        period: periodProp,
        from: dateProp("Start date"),
        to: dateProp("End date"),
        category: { type: "string", enum: [...CATEGORIES] },
        merchant: { type: "string", description: "Case-insensitive merchant substring" },
        min_amount: { type: "number", description: "Minimum absolute amount in USD" },
        limit: { type: "integer", description: "Max rows, default 20, max 40" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "spending_summary",
    description:
      "Aggregated spending: totals, average per day, spend per day/month/year, category breakdown, top merchants, change versus the previous bucket, and share of remembered salary. Use for any 'how much did I spend' question. Pass category to focus on one category (for example Dining).",
    input_schema: {
      type: "object",
      properties: {
        granularity: { type: "string", enum: ["day", "month", "year"] },
        period: periodProp,
        from: dateProp("Start date"),
        to: dateProp("End date"),
        category: { type: "string", enum: [...CATEGORIES] },
      },
      required: ["granularity"],
      additionalProperties: false,
    },
  },
  {
    name: "categorize_transactions",
    description:
      "Re-categorize transactions with TypeSafe Jev. Applies a new category only when it differs and confidence is at least 70%. Omit transaction_ids to process the 12 most recent card/balance purchases. Returns before/after per transaction.",
    input_schema: {
      type: "object",
      properties: { transaction_ids: { type: "array", items: { type: "string" } } },
      additionalProperties: false,
    },
  },
  {
    name: "list_recurring",
    description:
      "Recurring payments (subscriptions, bills, variable) with id, monthly cost, next charge date, last used date, cancellable flag, and flags for subscriptions unused for 30+ days and overlapping services (for example Sonora + Reelhouse Premium). Use this to resolve a name like 'Vantage' to its id.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["subscription", "bill", "variable"] },
        status: { type: "string", enum: ["active", "cancelled", "paused"], description: "Default active" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cancel_subscription",
    description:
      "Two-step cancellation. With confirmed=false returns a preview (merchant, plan, monthly and annual saving, cancel channel) and you must ask the user to confirm. Set confirmed=true ONLY if the user's latest message is an explicit confirmation. Rent, bills and utilities are not cancellable.",
    input_schema: {
      type: "object",
      properties: { recurring_id: { type: "string" }, confirmed: { type: "boolean" } },
      required: ["recurring_id", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "pause_subscription",
    description:
      "Pause (paused=true) or resume (paused=false) a subscription through PayPal's Subscriptions API. A paused subscription is not charged until it is resumed. Only subscriptions can be paused, not bills or rent. Prefer this over cancelling when the user wants a break.",
    input_schema: {
      type: "object",
      properties: { recurring_id: { type: "string" }, paused: { type: "boolean", description: "true to pause, false to resume" } },
      required: ["recurring_id", "paused"],
      additionalProperties: false,
    },
  },
  {
    name: "set_budget_limit",
    description:
      "Set the monthly budget limit for one budget category. The change is applied on the user's Budget page and highlighted there. Categories: Bills & Utilities, Dining & Drinks, Shopping, Groceries, Transport, Subscriptions. Only use an amount the user stated.",
    input_schema: {
      type: "object",
      properties: { category: { type: "string", description: "Category name, e.g. Dining" }, limit: { type: "number", description: "New monthly limit in USD, 0 to 99999" } },
      required: ["category", "limit"],
      additionalProperties: false,
    },
  },
  {
    name: "pay_with_paypal",
    description:
      "Starts a PayPal payment through the Orders API: creates the order and shows the user an approval card. The user approves it with PayPal and the payment is captured; nothing is charged until they do. Use when the user asks you to pay for something with PayPal, e.g. 'pay for my Essentials order' (the default Essentials order is Cloudsoft toilet paper, Scrubwell sponges and a Purelather soap refill from Harbor & Home, $52.43 with tax). Only call it with an amount the user stated or that this default order gives you.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Total in USD, 0.01 to 10000" },
        merchant: { type: "string", description: "Who is being paid, e.g. Harbor & Home" },
        description: { type: "string", description: "What the payment is for, shown on the order" },
      },
      required: ["amount", "merchant", "description"],
      additionalProperties: false,
    },
  },
  {
    name: "freeze_card",
    description: "Freeze or unfreeze the user's PayPal Debit Card. A frozen card declines new purchases; the PayPal balance still works online with PayPal Checkout. Demo-only: this is a mock card control.",
    input_schema: { type: "object", properties: { frozen: { type: "boolean", description: "true to freeze, false to unfreeze" } }, required: ["frozen"], additionalProperties: false },
  },
  {
    name: "report_unauthorized_charge",
    description:
      "The user says a card charge was not theirs. Acts immediately: freezes the Debit Card, files an unauthorized-transaction claim and orders a replacement card, then reports each step. Use when the user says 'that wasn't me', 'I didn't make this charge' or reports fraud. Demo-only: the claim and replacement card are mocked.",
    input_schema: {
      type: "object",
      properties: { merchant: { type: "string" }, amount: { type: "number", description: "Charge amount in USD, positive" } },
      required: ["merchant", "amount"],
      additionalProperties: false,
    },
  },
  {
    name: "list_offers",
    description:
      "Available PayPal offers with the cashback each would pay today on the best eligible transaction. Read-only.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "apply_offer",
    description:
      "Apply a PayPal offer to an eligible transaction (best one if transaction_id is omitted). Credits the cashback to the balance.",
    input_schema: {
      type: "object",
      properties: { offer_id: { type: "string" }, transaction_id: { type: "string" } },
      required: ["offer_id"],
      additionalProperties: false,
    },
  },
  {
    name: "what_if",
    description:
      "Project month-end spending and PayPal balance for a hypothetical, from the live account, and return a Now vs What if comparison table (shown to the user as a card). scenario=skip_category: no spending in `category` for the rest of this month. scenario=purchase: a one-off purchase of `amount` USD today. All figures are computed here; quote them exactly. Projections extend the last 30 days' income and spending pace to month end.",
    input_schema: {
      type: "object",
      properties: {
        scenario: { type: "string", enum: ["skip_category", "purchase"] },
        category: { type: "string", enum: [...CATEGORIES], description: "For skip_category" },
        amount: { type: "number", description: "For purchase: price in USD" },
        label: { type: "string", description: "For purchase: what is being bought, for example laptop" },
      },
      required: ["scenario"],
      additionalProperties: false,
    },
  },
  {
    name: "remember_fact",
    description:
      "Remember a fact the user told you for the rest of the session (for example key=salary value='$75,000 per year', savings_goal, pay_day).",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" }, value: { type: "string" } },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "forget_fact",
    description: "Forget a previously remembered fact by key.",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
      additionalProperties: false,
    },
  },
];

// ---------- helpers ----------

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000) + 1;
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toFixed(1)}%`;
const asCategory = (v: unknown): Category | undefined => {
  const s = str(v)?.toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === s);
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function resolveRange(input: Record<string, unknown>, asOf: string, earliest: string) {
  const today = asOf.slice(0, 10);
  const period = str(input.period) as Period | undefined;
  let from = str(input.from);
  let to = str(input.to);
  let label: string | undefined;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (period === "this_month") {
    from = `${today.slice(0, 7)}-01`;
    to = today;
    label = `${MONTH_NAMES[m - 1]} ${y} (month to date)`;
  } else if (period === "last_month") {
    const first = new Date(Date.UTC(y, m - 2, 1));
    const last = new Date(Date.UTC(y, m - 1, 0));
    from = isoDay(first);
    to = isoDay(last);
    label = `${MONTH_NAMES[first.getUTCMonth()]} ${first.getUTCFullYear()}`;
  } else if (period === "last_30_days") {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 29);
    from = isoDay(d);
    to = today;
    label = "the last 30 days";
  } else if (period === "all") {
    from = earliest;
    to = today;
    label = "all available history";
  }
  from ??= earliest;
  to ??= today;
  return { from, to, label: label ?? `${from} to ${to}` };
}

function monthlyGrossFromFacts(facts: { key: string; value: string }[]) {
  const f = facts.find((x) => /salary|income|pay/i.test(x.key) && /\d/.test(x.value));
  if (!f) return undefined;
  const m = f.value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!m) return undefined;
  let v = Number(m[1]) * (m[2] ? 1000 : 1);
  if (/month|\/mo\b|monthly/i.test(f.value)) v *= 12;
  return v > 0 ? v / 12 : undefined;
}

const row = (t: Transaction) => ({
  id: t.id,
  date: t.date.slice(0, 10),
  merchant: t.merchant,
  amount: formatUSD(t.amount),
  category: t.category,
  method: t.method,
});

const OVERLAP_GROUPS: { group: string; test: RegExp }[] = [
  { group: "music streaming", test: /sonora|reelhouse premium/i },
  { group: "video streaming", test: /cinebox|kitebird|^vantage$/i },
];

const isConfirmation = (m: string) =>
  /\b(yes|yep|yeah|yup|confirm(ed)?|go ahead|do it|proceed|sure|please do|cancel it|ok(ay)?)\b/i.test(m) &&
  !/\b(no|nope|don't|dont|do not|keep|never ?mind|stop|wait)\b/i.test(m);
export { isConfirmation };

// pending cancellation per session so the follow-up "Yes" can be resolved without guessing
const gp = globalThis as typeof globalThis & { __pendingCancel?: Map<string, string> };
export const pendingCancels = (gp.__pendingCancel ??= new Map<string, string>());

const mockNote = (mode: string) => (mode === "mock" ? " (simulated via a mock integration)" : "");

// ---------- executors ----------

async function overview(): Promise<ToolOutput> {
  const s = getState();
  const p = s.userProfile;
  const today = s.asOf.slice(0, 10);
  const mtd = periodTotals(s.transactions, `${today.slice(0, 7)}-01`, today);
  const rs = recurringSummary(s.recurring);
  // With PayPal live, the balance is the sandbox balance read through the Server SDK (plus what the demo moved), the same figure Home shows.
  const live = await paypal.getBalance();
  const balance = live.mode === "live" ? r2(live.balance + demoBalanceDelta()) : p.paypalBalance;
  return {
    summary: `Balance ${formatUSD(balance)}${live.mode === "live" ? " (live PayPal sandbox)" : ""}. Month to date: income ${formatUSD(mtd.income)}, spend ${formatUSD(mtd.spend)}, net ${formatUSD(mtd.net)}. Recurring: ${formatUSD(rs.totalMonthly)}/mo across ${rs.activeCount} active payments (${formatUSD(rs.subscriptionsMonthly)}/mo in ${rs.subscriptionCount} subscriptions).`,
    asOf: today,
    user: p.name,
    balance: formatUSD(balance),
    balanceSource: live.mode === "live" ? "PayPal sandbox (live, via the PayPal Server SDK)" : "sample data",
    card: `${p.card.product} ending ${p.card.last4}`,
    autoReload: p.autoReload.enabled
      ? `On: reloads ${formatUSD(p.autoReload.reloadAmount)} from ${p.autoReload.fundingSource} when balance drops below ${formatUSD(p.autoReload.threshold)}`
      : "Off",
    payFrequency: p.payFrequency,
    netPaycheck: formatUSD(p.netPaycheck),
    monthToDate: { income: formatUSD(mtd.income), spend: formatUSD(mtd.spend), net: formatUSD(mtd.net) },
    recurringSummary: {
      activeCount: rs.activeCount,
      subscriptionCount: rs.subscriptionCount,
      subscriptionsMonthly: formatUSD(rs.subscriptionsMonthly),
      billsMonthly: formatUSD(rs.billsMonthly),
      totalMonthly: formatUSD(rs.totalMonthly),
    },
  };
}
export const accountOverview = overview;

async function queryTransactions(input: Record<string, unknown>): Promise<ToolOutput> {
  const s = getState();
  const { from, to, label } = resolveRange(input, s.asOf, "0000-01-01");
  const cat = asCategory(input.category);
  const merchant = str(input.merchant)?.toLowerCase();
  const min = num(input.min_amount);
  const limit = Math.min(MAX_ROWS, Math.max(1, Math.floor(num(input.limit) ?? 20)));
  const hasRange = Boolean(str(input.period) || str(input.from) || str(input.to));
  const matches = s.transactions
    .filter((t) => (hasRange ? inRange(t, from, to) : true))
    .filter((t) => !cat || t.category === cat)
    .filter((t) => !merchant || t.merchant.toLowerCase().includes(merchant))
    .filter((t) => min === undefined || Math.abs(t.amount) >= min)
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = r2(matches.reduce((a, t) => a + t.amount, 0));
  const rows = matches.slice(0, limit).map(row);
  return {
    summary: `${matches.length} matching transactions${hasRange ? ` in ${label}` : ""}, net total ${formatUSD(total)}${matches.length > rows.length ? `; showing the newest ${rows.length}` : ""}.`,
    count: matches.length,
    total: formatUSD(total),
    truncated: matches.length > rows.length,
    transactions: rows,
  };
}

async function spendingSummary(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const s = getState();
  const earliest = s.transactions.reduce((m, t) => (t.date < m ? t.date : m), s.asOf).slice(0, 10);
  const { from, to, label } = resolveRange(input, s.asOf, earliest);
  const gran = (["day", "month", "year"] as const).find((g) => g === input.granularity) ?? "month";
  const cat = asCategory(input.category);
  const days = daysBetween(from, to);
  const scoped = s.transactions.filter((t) => inRange(t, from, to));
  const totals = periodTotals(s.transactions, from, to);
  const cats = categoryBreakdown(s.transactions, from, to);

  let series =
    gran === "day"
      ? spendByDay(s.transactions, to, Math.min(31, Math.max(1, days)))
      : gran === "month"
        ? spendByMonth(scoped)
        : spendByYear(scoped);
  series = series.slice(-MAX_ROWS);
  const avgPerBucket = series.length ? r2(series.reduce((a, p) => a + p.spend, 0) / series.length) : 0;

  const byMerchant = new Map<string, { spend: number; count: number }>();
  for (const t of scoped) {
    if (!isSpend(t) || (cat && t.category !== cat)) continue;
    const e = byMerchant.get(t.merchant) ?? { spend: 0, count: 0 };
    e.spend += -t.amount;
    e.count += 1;
    byMerchant.set(t.merchant, e);
  }
  const topMerchants = [...byMerchant.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 5)
    .map(([merchant, e]) => ({ merchant, spend: formatUSD(r2(e.spend)), count: e.count }));

  let change: Record<string, unknown> | undefined;
  if (series.length >= 2) {
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const diff = r2(last.spend - prev.spend);
    change = {
      latest: `${last.label}: ${formatUSD(last.spend)}`,
      previous: `${prev.label}: ${formatUSD(prev.spend)}`,
      difference: `${formatUSD(Math.abs(diff))} ${diff > 0 ? "higher" : diff < 0 ? "lower" : "the same"}`,
    };
  }

  const focus = cat ? cats.find((c) => c.category === cat) : undefined;
  const focusSpend = cat ? (focus?.spend ?? 0) : totals.spend;
  const monthlyGross = monthlyGrossFromFacts(await memory.list(ctx.sessionId));
  let salaryContext: Record<string, string> | undefined;
  if (monthlyGross) {
    const gross = monthlyGross * (days / 30.4375);
    salaryContext = {
      grossSalaryForPeriod: formatUSD(r2(gross)),
      spendShareOfGrossSalary: pct(focusSpend / gross),
    };
  }

  const dailyAvg = r2(totals.spend / Math.max(1, days));
  const focusLine = cat
    ? focus
      ? `${cat}: ${formatUSD(focus.spend)} across ${focus.count} transactions (${pct(focus.share)} of all spending) in ${label}. `
      : `No ${cat} spending in ${label}. `
    : "";
  return {
    summary: `${focusLine}Total spend in ${label}: ${formatUSD(totals.spend)}, income ${formatUSD(totals.income)}, net ${formatUSD(totals.net)}. Average ${formatUSD(dailyAvg)} per day.${salaryContext ? ` That is ${salaryContext.spendShareOfGrossSalary} of gross salary for the period.` : ""}`,
    range: { from, to, label, days },
    totals: {
      spend: formatUSD(totals.spend),
      income: formatUSD(totals.income),
      net: formatUSD(totals.net),
      averagePerDay: formatUSD(dailyAvg),
    },
    granularity: gran,
    series: series.map((p) => ({ period: p.period, label: p.label, spend: formatUSD(p.spend), income: formatUSD(p.income) })),
    averageSpendPerBucket: formatUSD(avgPerBucket),
    ...(change ? { changeVersusPreviousBucket: change } : {}),
    ...(cat
      ? {
          categoryFocus: {
            category: cat,
            spend: formatUSD(focus?.spend ?? 0),
            transactions: focus?.count ?? 0,
            shareOfTotalSpend: pct(focus?.share ?? 0),
            averagePerTransaction: focus?.count ? formatUSD(r2(focus.spend / focus.count)) : formatUSD(0),
          },
        }
      : {}),
    categoryBreakdown: cats.slice(0, 8).map((c) => ({ category: c.category, spend: formatUSD(c.spend), share: pct(c.share), transactions: c.count })),
    topMerchants,
    ...(salaryContext ? { salaryContext } : {}),
  };
}

async function categorizeTransactions(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const s = getState();
  const ids = Array.isArray(input.transaction_ids) ? input.transaction_ids.filter((x): x is string => typeof x === "string") : [];
  const pool = ids.length
    ? ids.map((id) => s.transactions.find((t) => t.id === id)).filter((t): t is Transaction => Boolean(t))
    : [...s.transactions].filter((t) => t.amount < 0 && t.category !== "Transfers").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const scored = await Promise.all(pool.slice(0, MAX_ROWS).map(async (t) => ({ t, r: await jev.categorizeTransaction(t) })));
  const changes: { id: string; merchant: string; from: string; to: string; confidence: number }[] = [];
  const results = scored.map(({ t, r }) => {
    const before = t.category;
    const differs = r.category !== before;
    const applied = differs && r.confidence >= 0.7 && recategorize(t.id, r.category).ok;
    if (applied) changes.push({ id: t.id, merchant: t.merchant, from: before, to: r.category, confidence: r.confidence });
    return {
      id: t.id,
      merchant: t.merchant,
      amount: formatUSD(t.amount),
      before,
      after: applied ? r.category : before,
      suggested: r.category,
      confidence: pct(r.confidence),
      changed: applied,
      mode: r.mode,
    };
  });
  if (changes.length) ctx.actions.push({ type: "transactions_recategorized", checked: results.length, changes });
  const mode = scored[0]?.r.mode ?? "mock";
  return {
    summary: results.length
      ? `Checked ${results.length} transactions with TypeSafe Jev${mockNote(mode)}: ${changes.length} re-categorized${changes.length ? ` (${changes.map((c) => `${c.merchant} ${c.from} to ${c.to}`).join("; ")})` : ", the rest were already correct or below the 70% confidence bar"}.`
      : "No matching transactions to categorize.",
    checked: results.length,
    recategorized: changes.length,
    results,
  };
}

function overlaps(subs: RecurringPayment[]) {
  return OVERLAP_GROUPS.map(({ group, test }) => {
    const members = subs.filter((r) => r.kind === "subscription" && r.status === "active" && test.test(r.merchant));
    return members.length > 1
      ? {
          group,
          services: members.map((m) => m.merchant),
          recurringIds: members.map((m) => m.id),
          combinedMonthlyCost: formatUSD(r2(members.reduce((a, m) => a + monthlyCost(m), 0))),
        }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

async function listRecurring(input: Record<string, unknown>): Promise<ToolOutput> {
  const s = getState();
  const today = s.asOf.slice(0, 10);
  const kind = str(input.kind);
  const status = str(input.status) ?? "active";
  const unused = new Map(unusedSubscriptions(s.recurring, s.asOf, 30).map((r) => [r.id, r]));
  const list = s.recurring.filter((r) => (!kind || r.kind === kind) && r.status === status);
  const items = list.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    plan: r.plan,
    kind: r.kind,
    monthlyCost: formatUSD(monthlyCost(r)),
    cycle: r.cycle,
    nextChargeDate: r.nextChargeDate,
    lastUsedAt: r.lastUsedAt ?? null,
    daysSinceLastUse: r.lastUsedAt ? daysBetween(r.lastUsedAt, today) - 1 : null,
    cancellable: r.cancellable,
    unusedFor30PlusDays: unused.has(r.id),
  }));
  const unusedItems = items.filter((i) => i.unusedFor30PlusDays);
  const unusedTotal = r2(list.filter((r) => unused.has(r.id)).reduce((a, r) => a + monthlyCost(r), 0));
  const ov = overlaps(list);
  const total = r2(list.reduce((a, r) => a + monthlyCost(r), 0));
  return {
    summary: `${items.length} ${status} ${kind ?? "recurring"} payments costing ${formatUSD(total)}/mo.${unusedItems.length ? ` Unused for 30+ days: ${unusedItems.map((i) => `${i.merchant} (${i.monthlyCost}/mo, last used ${i.lastUsedAt})`).join(", ")} - together ${formatUSD(unusedTotal)}/mo.` : " No subscriptions unused for 30+ days."}${ov.length ? ` Overlap: ${ov.map((o) => `${o.group} - ${o.services.join(" + ")} (${o.combinedMonthlyCost}/mo combined)`).join("; ")}.` : ""}`,
    count: items.length,
    totalMonthly: formatUSD(total),
    unusedTotalMonthly: formatUSD(unusedTotal),
    overlappingServices: ov,
    items: items.slice(0, MAX_ROWS),
  };
}

async function cancelSubscription(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const s = getState();
  const id = str(input.recurring_id) ?? "";
  const sub = s.recurring.find((r) => r.id === id);
  if (!sub) return { summary: `No recurring payment with id ${id}. Call list_recurring to find the right id.`, error: "not_found" };
  if (!sub.cancellable || sub.cancelChannel === "none")
    return {
      summary: `${sub.merchant} (${sub.plan}) is a ${sub.kind === "subscription" ? "subscription" : sub.kind === "bill" ? "bill" : "variable payment"} and can't be cancelled from the assistant. Rent, utilities, phone, internet and transit have to be changed with the provider.`,
      cancellable: false,
    };
  if (sub.status === "cancelled") return { summary: `${sub.merchant} is already cancelled.`, status: "already_cancelled" };

  const monthly = monthlyCost(sub);
  const annual = r2(monthly * 12);
  const channel = sub.cancelChannel;
  const base = {
    recurringId: sub.id,
    merchant: sub.merchant,
    plan: sub.plan,
    monthlySaving: monthly,
    annualSaving: annual,
    monthlySavingLabel: formatUSD(monthly),
    annualSavingLabel: formatUSD(annual),
    channel,
  };
  const channelText = channel === "paypal_subscriptions_api" ? "PayPal Subscriptions" : "the merchant's website via a cloud browser";

  if (input.confirmed !== true || !isConfirmation(ctx.latestUserMessage)) {
    pendingCancels.set(ctx.sessionId, sub.id);
    ctx.actions.push({ type: "cancellation_preview", ...base });
    return {
      summary: `Cancelling ${sub.merchant} (${sub.plan}) would save ${formatUSD(monthly)}/mo (${formatUSD(annual)}/yr), cancelled through ${channelText}. Needs the user's confirmation first.`,
      status: "needs_confirmation",
      preview: {
        merchant: sub.merchant,
        plan: sub.plan,
        monthlySaving: formatUSD(monthly),
        annualSaving: formatUSD(annual),
        cancelChannel: channelText,
        nextChargeDate: sub.nextChargeDate,
      },
      instruction: "Ask the user to confirm. Do not cancel until their next message explicitly confirms.",
    };
  }

  let mode: "live" | "mock" = "mock";
  let liveViewUrl: string | undefined;
  let steps: string[] | undefined;
  let kernelExtra: { replayUrl?: string; screenshotDataUrl?: string; confirmationNumber?: string; previewUrl?: string; target?: "sandbox" | "real" } = {};
  let kernelLive = false;
  let done = false;
  let detail = "";
  if (channel === "paypal_subscriptions_api") {
    const r = await paypal.cancelSubscription(sub.id, "Cancelled by user via Stella");
    mode = paypal.mode();
    done = r.ok;
    detail = r.error ?? "";
    if (done && getState().recurring.find((x) => x.id === sub.id)?.status !== "cancelled") cancelRecurring(sub.id);
  } else {
    const r = await kernel.cancelOnMerchantSite(sub);
    mode = r.mode;
    liveViewUrl = r.liveViewUrl;
    steps = r.steps;
    kernelLive = r.status === "completed";
    kernelExtra = {
      ...(r.replayUrl ? { replayUrl: r.replayUrl } : {}),
      ...(r.screenshotDataUrl ? { screenshotDataUrl: r.screenshotDataUrl } : {}),
      ...(r.confirmationNumber ? { confirmationNumber: r.confirmationNumber } : {}),
      ...(r.previewUrl ? { previewUrl: r.previewUrl } : {}),
      ...(r.target ? { target: r.target } : {}),
    };
    done = r.status === "completed" || r.status === "simulated";
    detail = done ? "" : `Browser automation ended with status ${r.status}`;
    if (done) {
      const c = cancelRecurring(sub.id);
      if (!c.ok && !/already cancelled/.test(c.error)) {
        done = false;
        detail = c.error;
      }
    }
  }
  pendingCancels.delete(ctx.sessionId);
  if (!done) return { summary: `Could not cancel ${sub.merchant}: ${detail || "unknown error"}. Nothing was changed.`, status: "failed", mode, ...(liveViewUrl ? { liveViewUrl } : {}), ...(steps ? { steps } : {}) };

  ctx.actions.push({ type: "subscription_cancelled", ...base, mode, liveViewUrl, steps, ...kernelExtra });
  const kernelNote = channel === "kernel_browser"
    ? ` ${kernelLive ? `Cancelled via Kernel cloud browser on the ${kernelExtra.target === "real" ? "merchant" : "sandbox merchant"} site${kernelExtra.confirmationNumber ? `, confirmation #${kernelExtra.confirmationNumber}` : ""}.` : "Simulated: no Kernel browser ran (KERNEL_API_KEY is not set)."}`
    : "";
  return {
    summary: `${sub.merchant} (${sub.plan}) is cancelled${mockNote(mode)}. Saves ${formatUSD(monthly)}/mo (${formatUSD(annual)}/yr).${kernelNote}`,
    status: "cancelled",
    monthlySaving: formatUSD(monthly),
    annualSaving: formatUSD(annual),
    mode,
    ...(liveViewUrl ? { liveViewUrl } : {}),
    ...(steps ? { steps } : {}),
  };
}

async function listOffers(): Promise<ToolOutput> {
  const s = getState();
  const items = eligibleOffers(s)
    .map(({ offer, best }) => ({
      offerId: offer.id,
      merchant: offer.merchant,
      title: offer.title,
      validUntil: offer.validUntil,
      eligible: Boolean(best),
      cashbackNum: best?.cashback ?? 0,
      cashback: best ? formatUSD(best.cashback) : null,
      transactionId: best?.transaction.id ?? null,
      transactionDate: best?.transaction.date.slice(0, 10) ?? null,
      transactionAmount: best ? formatUSD(best.transaction.amount) : null,
    }))
    .sort((a, b) => b.cashbackNum - a.cashbackNum);
  const out = items.map((i) => ({ offerId: i.offerId, merchant: i.merchant, title: i.title, validUntil: i.validUntil, eligible: i.eligible, cashback: i.cashback, transactionId: i.transactionId, transactionDate: i.transactionDate, transactionAmount: i.transactionAmount }));
  const best = items[0]?.eligible ? items[0] : undefined;
  return {
    summary: items.length
      ? `${items.filter((i) => i.eligible).length} of ${items.length} available offers have an eligible purchase.${best ? ` Best: ${best.title} paying ${best.cashback} on ${best.transactionAmount} at ${best.merchant} (${best.transactionId}).` : ""}`
      : "There are no available offers right now.",
    bestOfferId: best?.offerId ?? null,
    offers: out,
  };
}

async function applyOfferTool(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const offerId = str(input.offer_id) ?? "";
  const r = applyOffer(offerId, str(input.transaction_id));
  if (!r.ok) return { summary: `Could not apply the offer: ${r.error}.`, error: r.error };
  const v = r.value;
  ctx.actions.push({
    type: "offer_applied",
    offerId: v.offer.id,
    merchant: v.offer.merchant,
    title: v.offer.title,
    cashback: v.cashback,
    cashbackLabel: formatUSD(v.cashback),
    transactionId: v.transaction.id,
    creditTransactionId: v.credit.id,
    newBalanceLabel: formatUSD(v.balanceAfter),
  });
  return {
    summary: `Applied "${v.offer.title}" to ${v.offer.merchant} purchase ${v.transaction.id} (${formatUSD(v.transaction.amount)}). ${formatUSD(v.cashback)} cash back credited as ${v.credit.id}; new balance ${formatUSD(v.balanceAfter)}.`,
    cashback: formatUSD(v.cashback),
    purchase: row(v.transaction),
    creditTransactionId: v.credit.id,
    newBalance: formatUSD(v.balanceAfter),
  };
}

const signedUSD = (n: number) => `${n < 0 ? "-" : "+"}${formatUSD(Math.abs(n))}`;

async function whatIf(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const s = getState();
  const today = s.asOf.slice(0, 10);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const remaining = daysInMonth - day;
  const monthName = MONTH_NAMES[m - 1];
  const monthStart = `${today.slice(0, 7)}-01`;
  const d30 = new Date(today + "T00:00:00Z");
  d30.setUTCDate(d30.getUTCDate() - 29);
  const from30 = isoDay(d30);

  // Baseline: month-to-date spend plus the trailing-30-day daily run rate for the remaining days.
  const mtd = periodTotals(s.transactions, monthStart, today).spend;
  const last30 = periodTotals(s.transactions, from30, today);
  const rate = last30.spend / 30;
  const incomeRate = last30.income / 30;
  const baseSpend = r2(mtd + rate * remaining);
  const balance = s.userProfile.paypalBalance;
  const baseBalance = r2(balance + (incomeRate - rate) * remaining);

  const scenario = str(input.scenario);
  const rows: CompareTable["rows"] = [];
  let title: string;
  let lead: string;
  let whatSpend: number;
  let whatBalance: number;
  if (scenario === "skip_category") {
    const cat = asCategory(input.category);
    if (!cat) return { summary: "Which spending category should I skip in the projection?", error: "invalid_input" };
    const catRate = categoryBreakdown(s.transactions, from30, today).find((c) => c.category === cat)?.spend ?? 0;
    const saved = r2((catRate / 30) * remaining);
    whatSpend = r2(baseSpend - saved);
    whatBalance = r2(baseBalance + saved);
    title = `Skip ${cat} until ${monthName} ${daysInMonth}`;
    lead = `Skipping ${cat} for the remaining ${remaining} days of ${monthName} ${y} would save about ${formatUSD(saved)}.`;
    rows.push({ label: `${cat} to month end`, now: formatUSD(r2((catRate / 30) * remaining)), whatIf: formatUSD(0), delta: signedUSD(-saved), tone: "pos" });
  } else if (scenario === "purchase") {
    const amount = num(input.amount);
    if (amount === undefined || amount <= 0) return { summary: "How much is the purchase, in dollars?", error: "invalid_input" };
    const what = str(input.label)?.slice(0, 40) ?? "purchase";
    whatSpend = r2(baseSpend + amount);
    whatBalance = r2(baseBalance - amount);
    title = `Buy a ${formatUSD(amount)} ${what}`;
    lead = `Buying a ${formatUSD(amount)} ${what} today would take the projected month-end balance from ${formatUSD(baseBalance)} to ${formatUSD(whatBalance)}.`;
  } else {
    return { summary: "Unknown what-if scenario; use skip_category or purchase.", error: "invalid_input" };
  }
  rows.unshift(
    { label: "Month-end spending", now: formatUSD(baseSpend), whatIf: formatUSD(whatSpend), delta: signedUSD(r2(whatSpend - baseSpend)), tone: whatSpend <= baseSpend ? "pos" : "neg" },
    { label: "Month-end balance", now: formatUSD(baseBalance), whatIf: formatUSD(whatBalance), delta: signedUSD(r2(whatBalance - baseBalance)), tone: whatBalance >= baseBalance ? "pos" : "neg" },
  );
  const compare: CompareTable = { colA: "Now", colB: "What if", rows };
  ctx.actions.push({ type: "what_if_compare", title, compare });
  return {
    summary: `${lead} Projected ${monthName} month-end spending: ${formatUSD(baseSpend)} now vs ${formatUSD(whatSpend)} in this scenario; month-end balance: ${formatUSD(baseBalance)} now vs ${formatUSD(whatBalance)}. Based on ${formatUSD(mtd)} spent so far and your last 30 days' income and spending pace.`,
    scenario,
    title,
    daysRemaining: remaining,
    spentSoFar: formatUSD(mtd),
    currentBalance: formatUSD(balance),
    compare,
  };
}

async function rememberFact(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const key = str(input.key);
  const value = str(input.value);
  if (!key || !value) return { summary: "A key and a value are both required.", error: "invalid_input" };
  const f = await memory.remember(ctx.sessionId, key.slice(0, 60), value.slice(0, 200), "user");
  ctx.actions.push({ type: "fact_remembered", key: f.key, value: f.value });
  return { summary: `Remembered ${f.key} = ${f.value}.`, key: f.key, value: f.value };
}

async function forgetFact(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const key = str(input.key) ?? "";
  const ok = await memory.forget(ctx.sessionId, key);
  if (ok) ctx.actions.push({ type: "fact_forgotten", key });
  return { summary: ok ? `Forgot ${key}.` : `I had no remembered fact called ${key}.`, forgotten: ok };
}

async function freezeCard(input: Record<string, unknown>): Promise<ToolOutput> {
  const frozen = input.frozen === true;
  const r = setCardFrozen(frozen);
  return {
    summary: frozen
      ? `Your PayPal Debit Card ••${r.last4} is frozen. New purchases are declined until you unfreeze it, and your PayPal balance still works online with PayPal Checkout. Mock card control.`
      : `Your PayPal Debit Card ••${r.last4} is active again. Mock card control.`,
    frozen: r.frozen,
    last4: r.last4,
  };
}

async function pauseSubscription(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const id = str(input.recurring_id) ?? "";
  const paused = input.paused !== false;
  const sub = getState().recurring.find((r) => r.id === id);
  if (!sub) return { summary: `No recurring payment with id ${id}. Call list_recurring to find the right id.`, error: "not_found" };
  const r = await paypal.setSubscriptionPaused(id, paused, `${paused ? "Paused" : "Resumed"} by user via Stella`);
  if (!r.ok) return { summary: r.error ?? `${sub.merchant} could not be ${paused ? "paused" : "resumed"}.`, error: "not_changed" };
  const amountLabel = formatUSD(sub.amount);
  ctx.actions.push({
    type: "subscription_paused",
    recurringId: id,
    merchant: sub.merchant,
    plan: sub.plan,
    paused,
    amountLabel,
    nextChargeLabel: sub.nextChargeDate,
    channel: r.channel === "paypal_api" ? "paypal_subscriptions_api" : "local_store",
  });
  return {
    summary: paused
      ? `Done. I paused ${sub.merchant} (${sub.plan}). You won't be charged ${amountLabel} until you resume it.${r.channel === "local_store" ? " Simulated: no PayPal subscription id (I-...) for this item, so only the local copy changed." : ""}`
      : `Done. ${sub.merchant} is active again. Next charge ${sub.nextChargeDate}, ${amountLabel}.`,
    status: paused ? "paused" : "active",
    merchant: sub.merchant,
  };
}

/** Budget category names the user may say, mapped to the Budget page's item ids. */
const BUDGET_ITEMS: { id: string; label: string; test: RegExp }[] = [
  { id: "essential", label: "Bills & Utilities", test: /bills?|utilit|essential/i },
  { id: "dining", label: "Dining & Drinks", test: /dining|restaurant|eating|food|drinks?/i },
  { id: "shopping", label: "Shopping", test: /shopping|shop/i },
  { id: "groceries", label: "Groceries", test: /grocer/i },
  { id: "transport", label: "Transport", test: /transport|rides?|commut/i },
  { id: "subs", label: "Subscriptions", test: /subscri/i },
];

async function setBudgetLimit(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const cat = str(input.category) ?? "";
  const item = BUDGET_ITEMS.find((b) => b.test.test(cat));
  if (!item) return { summary: `I couldn't match "${cat}" to a budget category. They are: ${BUDGET_ITEMS.map((b) => b.label).join(", ")}.`, error: "unknown_category" };
  const limit = Math.round(Number(input.limit));
  if (!Number.isFinite(limit) || limit < 0 || limit > 99_999) return { summary: "I need a monthly limit between $0 and $99,999.", error: "invalid_limit" };
  const limitLabel = formatUSD(limit);
  ctx.actions.push({ type: "budget_limit_set", key: `${item.id}-${limit}-${Date.now()}`, itemId: item.id, label: item.label, limit, limitLabel });
  return { summary: `Done. I set your ${item.label} limit to ${limitLabel} a month and highlighted it on your Budget page. If it would push your category limits over your total monthly budget, the page keeps the old limit and says so.`, category: item.label, limit: limitLabel };
}

async function payWithPaypal(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const merchant = typeof input.merchant === "string" && input.merchant.trim() ? input.merchant.trim().slice(0, 60) : "Harbor & Home";
  const description = typeof input.description === "string" && input.description.trim() ? input.description.trim().slice(0, 100) : `Payment to ${merchant}`;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) return { summary: "I need an amount between $0.01 and $10,000 to start a PayPal payment.", error: "invalid_amount" };
  const origin = ctx.origin ?? "http://localhost:3000";
  const r = await paypal.createOrder({ amount, description: `${merchant} · ${description}`, returnUrl: `${origin}/paypal/return?result=approved`, cancelUrl: `${origin}/paypal/return?result=cancelled` });
  if (!r.ok || !r.orderId) return { summary: `PayPal could not create the order${r.error ? `: ${r.error}` : ""}. Nothing was charged.`, error: "order_failed" };
  const money = formatUSD(amount);
  ctx.actions.push({ type: "paypal_payment", orderId: r.orderId, approveUrl: r.approveUrl, merchant, description, amount, amountLabel: money, mode: r.channel === "paypal_api" ? "live" : "mock" });
  return {
    summary: `I created PayPal order ${r.orderId} for ${money} to ${merchant} (${description}). Press Approve with PayPal below to pay it; the payment is only captured after you approve, so nothing has been charged yet.${r.channel === "simulated" ? " Simulated: PayPal credentials are not configured." : ""}`,
    orderId: r.orderId,
    amount: money,
    merchant,
    status: r.status ?? "CREATED",
  };
}

async function reportUnauthorized(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
  const merchant = typeof input.merchant === "string" && input.merchant.trim() ? input.merchant.trim() : "Unknown merchant";
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { summary: "I need the charge amount to file a claim.", error: "invalid_amount" };
  const r = reportUnauthorizedCharge(merchant, amount);
  const money = formatUSD(r.amount);
  ctx.actions.push({
    type: "steps_completed",
    steps: [
      { title: `Debit card ••${r.last4} frozen`, sub: "The card can’t be used until you unfreeze it", status: "Done" },
      { title: "Unauthorized transaction claim", sub: `${money} at ${r.merchant} · Case **${r.claimId}**`, status: "Submitted" },
      { title: "Replacement card ordered", sub: `New card number · arrives in **${r.replacementDays} days**`, status: "Ordered" },
    ],
  });
  return {
    summary: `Done. I froze your Debit Card ••${r.last4}, filed an unauthorized transaction claim for ${money} at ${r.merchant} (case ${r.claimId}) and ordered a replacement card that arrives in ${r.replacementDays} days. Your PayPal balance still works online with PayPal Checkout. Mock: no real card was frozen.`,
    claimId: r.claimId,
    amount: money,
    merchant: r.merchant,
    last4: r.last4,
  };
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutput> {
  const input = obj(rawInput);
  let output: ToolOutput;
  try {
    switch (name) {
      case "get_account_overview": output = await overview(); break;
      case "query_transactions": output = await queryTransactions(input); break;
      case "spending_summary": output = await spendingSummary(input, ctx); break;
      case "categorize_transactions": output = await categorizeTransactions(input, ctx); break;
      case "list_recurring": output = await listRecurring(input); break;
      case "cancel_subscription": output = await cancelSubscription(input, ctx); break;
      case "pause_subscription": output = await pauseSubscription(input, ctx); break;
      case "set_budget_limit": output = await setBudgetLimit(input, ctx); break;
      case "pay_with_paypal": output = await payWithPaypal(input, ctx); break;
      case "freeze_card": output = await freezeCard(input); break;
      case "report_unauthorized_charge": output = await reportUnauthorized(input, ctx); break;
      case "list_offers": output = await listOffers(); break;
      case "apply_offer": output = await applyOfferTool(input, ctx); break;
      case "what_if": output = await whatIf(input, ctx); break;
      case "remember_fact": output = await rememberFact(input, ctx); break;
      case "forget_fact": output = await forgetFact(input, ctx); break;
      default: output = { summary: `Unknown tool ${name}.`, error: "unknown_tool" };
    }
  } catch (e) {
    output = { summary: `Tool ${name} failed: ${e instanceof Error ? e.message : String(e)}`, error: "tool_error" };
  }
  ctx.results.push({ tool: name, input: rawInput, output });
  return output;
}
