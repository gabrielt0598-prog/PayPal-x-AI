// Evidence retrieval + Jev reranking (RAG) for the finance assistant.
//
//   FinanceState + remembered facts ──code──▶ candidate "evidence documents" (all figures computed + formatted in code)
//        ──code prefilter (keyword / merchant / category / date overlap)──▶ ≤ 24 candidates
//        ──Jev: one `score` question per candidate (0..3 relevance rubric), plus ONE speculative `choice` for the intent,
//             all in a single parallel systemOne call──▶ keep score ≥ 1.5, max 8, compact enough for the prompt
//
// The agent then answers ONLY from these documents (cited as [ev_n]) or from tool results ([tool_n]); the claim-level
// verifier in jev.ts checks each cited sentence against exactly the documents it cites.
//
// live  = TYPESAFE_API_KEY present -> Jev reranks      mock = deterministic lexical scoring, same output shape.
// SERVER ONLY (imports jev.ts which reads env).

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
  unusedSubscriptions,
} from "../finance";
import { CATEGORIES, type Category, type FinanceState, type Transaction } from "../types";
import { classifyIntentByRules } from "./categorize-rules";
import type { Intent, IntentResult, ServiceMode, SourceDoc } from "./contracts";
import { jevMode, jevRankEvidence } from "./jev";

export type EvidenceKind = "account" | "merchant" | "category_month" | "month" | "recurring" | "offer" | "fact" | "transaction";

export interface EvidenceDoc {
  /** "ev_1".. in rank order (ev_1 is the most relevant). Cited by the agent as [ev_1]. */
  id: string;
  kind: EvidenceKind;
  title: string;
  /** Short natural-language statement with pre-formatted figures (formatUSD). */
  text: string;
  /** Raw numbers behind the text. */
  data: Record<string, unknown>;
}

export interface RankedCandidate {
  /** Final id ("ev_3") for kept documents, "cand_<n>" for candidates that were reranked but dropped. */
  id: string;
  score: number;
  kind: EvidenceKind;
  title: string;
  kept: boolean;
}

export interface RetrievalResult {
  documents: EvidenceDoc[];
  mode: ServiceMode;
  /** Every reranked candidate with its 0..3 relevance score, best first. */
  ranking: RankedCandidate[];
  /** Intent from the same Jev call (live) or rules (mock). Reused by the agent so routing costs no extra call. */
  intent?: IntentResult;
  /** How many candidate documents the code built / how many survived the prefilter. */
  candidates: { built: number; prefiltered: number };
}

export interface FactLike {
  key: string;
  value: string;
  source?: string;
}

// ---------- tunables ----------

export const MAX_PREFILTER = 24;
export const MAX_KEEP = 8;
export const MIN_KEEP_SCORE = 1.5;
/** Keeps the Evidence block under ~1.5k tokens. */
const MAX_BLOCK_CHARS = 5_600;

interface Candidate extends Omit<EvidenceDoc, "id"> {
  n: number;
  merchant?: string;
  category?: Category;
  month?: string; // YYYY-MM
  /** Lower-cased searchable words. */
  terms: Set<string>;
}

// ---------- small helpers ----------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const prevMonth = (key: string) => {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 2, 1));
  return d.toISOString().slice(0, 7);
};
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toFixed(1)}%`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

const STOP = new Set(
  "a an the and or of in on at to for from by with is are was were be been am do does did how what which who when where why much many i me my mine we you your it its this that these those there than then so as if about any all can could would should will please tell show give get have has had not no yes last past over into out up per each".split(" "),
);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9$']+/g) ?? []).map((w) => w.replace(/'s$/, "")).filter((w) => w.length > 2 && !STOP.has(w));
}
const termSet = (...parts: (string | undefined)[]) => new Set(parts.flatMap((p) => (p ? words(p) : [])).flatMap((w) => [w, stem(w)]));

const CATEGORY_ALIASES: [RegExp, Category][] = [
  [/dining|restaurant|eat(ing)? out|food|coffee|takeout|lunch|dinner|cafe|delivery/i, "Dining"],
  [/grocer|supermarket/i, "Groceries"],
  [/shopping|clothes|retail|clothing/i, "Shopping"],
  [/subscription|streaming|membership|software|\bapps?\b|gym/i, "Subscriptions"],
  [/transport|transit|hopline|swiftcab|commut|bayline|rides?\b/i, "Transport"],
  [/\bbills?\b|\brent\b|housing|utilit|electric|trash/i, "Essential bills"],
  [/\bother\b|pharmacy|movies?\b/i, "Other"],
  [/cash ?back/i, "Cashback"],
  [/\bincome\b|paycheck|payroll|salary/i, "Income"],
];

// ---------- candidate construction (all figures computed here, in code) ----------

function buildCandidates(state: FinanceState, facts: FactLike[]): Candidate[] {
  const out: Candidate[] = [];
  let n = 0;
  const add = (c: Omit<Candidate, "n" | "terms"> & { terms?: Set<string> }) =>
    out.push({ ...c, n: n++, terms: c.terms ?? termSet(c.title, c.text, c.merchant, c.category, c.kind.replace("_", " ")) });

  const today = state.asOf.slice(0, 10);
  const curMonth = today.slice(0, 7);
  const txns = state.transactions;
  const months = [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort();
  const monthSpan = (m: string) => ({ from: `${m}-01`, to: `${m}-31` });
  const monthName = (m: string) => (m === curMonth ? `${monthLabel(m)} (month to date, through ${today})` : monthLabel(m));

  // account overview
  {
    const p = state.userProfile;
    const mtd = periodTotals(txns, `${curMonth}-01`, today);
    const rs = recurringSummary(state.recurring);
    add({
      kind: "account",
      title: "Account overview",
      text: `PayPal balance is ${formatUSD(p.paypalBalance)} as of ${today}. Month to date: income ${formatUSD(mtd.income)}, spend ${formatUSD(mtd.spend)}, net ${formatUSD(mtd.net)}. Active recurring payments cost ${formatUSD(rs.totalMonthly)}/month, of which subscriptions ${formatUSD(rs.subscriptionsMonthly)}/month across ${rs.subscriptionCount} subscriptions. Net paycheck ${formatUSD(p.netPaycheck)} (${p.payFrequency}). Auto-reload ${p.autoReload.enabled ? `adds ${formatUSD(p.autoReload.reloadAmount)} when the balance falls below ${formatUSD(p.autoReload.threshold)}` : "is off"}.`,
      data: { balance: p.paypalBalance, asOf: today, monthToDate: mtd, recurring: rs, netPaycheck: p.netPaycheck },
      terms: termSet("account overview balance paypal card auto reload paycheck pay net worth how am i doing money left"),
    });
  }

  // per-month totals + per-category monthly totals
  for (const m of months) {
    const { from, to } = monthSpan(m);
    const tot = periodTotals(txns, from, to);
    add({
      kind: "month",
      title: `Totals for ${monthName(m)}`,
      text: `${monthName(m)}: total spending ${formatUSD(tot.spend)}, income ${formatUSD(tot.income)}, net ${formatUSD(tot.net)}.`,
      data: { month: m, ...tot },
      month: m,
      terms: termSet(`${monthLabel(m)} total spending spend income net month`),
    });
    const cats = categoryBreakdown(txns, from, to);
    for (const c of cats) {
      const inCat = txns.filter((t) => isSpend(t) && t.category === c.category && inRange(t, from, to));
      const byMerchant = new Map<string, number>();
      for (const t of inCat) byMerchant.set(t.merchant, (byMerchant.get(t.merchant) ?? 0) + -t.amount);
      const top = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      add({
        kind: "category_month",
        title: `${c.category} spending, ${monthLabel(m)}`,
        text: `${c.category} spending in ${monthName(m)}: ${formatUSD(c.spend)} across ${c.count} transactions (${pct(c.share)} of that month's ${formatUSD(tot.spend)} total spending). Top merchants: ${top.map(([name, v]) => `${name} ${formatUSD(r2(v))}`).join(", ")}.`,
        data: { category: c.category, month: m, spend: c.spend, count: c.count, sharePercent: Math.round(c.share * 1000) / 10, monthSpend: tot.spend, topMerchants: top.map(([merchant, v]) => ({ merchant, spend: r2(v) })) },
        category: c.category,
        month: m,
        terms: termSet(`${c.category} ${monthLabel(m)} category spending spend`, top.map(([x]) => x).join(" ")),
      });
    }
  }

  // per-merchant spend summaries
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of txns) if (isSpend(t)) byMerchant.set(t.merchant, [...(byMerchant.get(t.merchant) ?? []), t]);
  const lastMonth = prevMonth(curMonth);
  for (const [merchant, list] of byMerchant) {
    const total = r2(list.reduce((a, t) => a - t.amount, 0));
    const dates = list.map((t) => t.date.slice(0, 10)).sort();
    const inMonth = (m: string) => r2(list.filter((t) => t.date.startsWith(m)).reduce((a, t) => a - t.amount, 0));
    const cat = list[0].category;
    add({
      kind: "merchant",
      title: `${merchant} spending`,
      text: `${merchant} (${cat}): ${formatUSD(total)} spent in total across ${list.length} transactions from ${dates[0]} to ${dates[dates.length - 1]}, averaging ${formatUSD(r2(total / list.length))} each. ${monthLabel(lastMonth)}: ${formatUSD(inMonth(lastMonth))}; ${monthLabel(curMonth)} so far: ${formatUSD(inMonth(curMonth))}.`,
      data: { merchant, category: cat, total, count: list.length, firstDate: dates[0], lastDate: dates[dates.length - 1], lastMonth: inMonth(lastMonth), thisMonth: inMonth(curMonth) },
      merchant,
      category: cat,
    });
  }

  // recurring payments
  const unused = new Set(unusedSubscriptions(state.recurring, state.asOf, 30).map((r) => r.id));
  for (const r of state.recurring) {
    const charges = txns.filter((t) => t.recurringId === r.id && t.amount < 0).sort((a, b) => b.date.localeCompare(a.date));
    const recentAvg = charges.length ? r2(charges.slice(0, 3).reduce((a, t) => a - t.amount, 0) / Math.min(3, charges.length)) : 0;
    const cost = r.amount > 0 ? monthlyCost(r) : r.cycle === "weekly" ? r2((recentAvg * 52) / 12) : recentAvg;
    const idle = r.lastUsedAt ? daysBetween(r.lastUsedAt, today) : undefined;
    add({
      kind: "recurring",
      title: `${r.merchant} ${r.kind}`,
      text: `${r.merchant} (${r.plan}), ${r.kind}, ${r.status}: ${r.amount > 0 ? `${formatUSD(r.amount)} per ${r.cycle === "monthly" ? "month" : r.cycle === "weekly" ? "week" : "year"}` : `variable, recent average ${formatUSD(recentAvg)} per charge`}, about ${formatUSD(cost)}/month. Next charge ${r.nextChargeDate}. ${r.lastUsedAt ? `Last used ${r.lastUsedAt}${unused.has(r.id) ? `, unused for ${idle} days` : ""}.` : ""} ${r.cancellable ? `Cancellable (id ${r.id}).` : "Cannot be cancelled from chat."}`.replace(/\s+/g, " ").trim(),
      data: { id: r.id, merchant: r.merchant, plan: r.plan, kind: r.kind, status: r.status, amount: r.amount, monthlyCost: cost, nextChargeDate: r.nextChargeDate, lastUsedAt: r.lastUsedAt ?? null, unused30d: unused.has(r.id), cancellable: r.cancellable },
      merchant: r.merchant,
      category: r.category,
      terms: termSet(r.merchant, r.plan, r.kind, r.status, unused.has(r.id) ? "unused not using idle" : "", "subscription recurring bill cancel renew charge plan monthly", r.category),
    });
  }

  // offers (with the best eligible purchase, computed by finance.eligibleOffers)
  for (const { offer, best } of eligibleOffers(state)) {
    add({
      kind: "offer",
      title: offer.title,
      text: `Offer "${offer.title}" at ${offer.merchant}, valid ${offer.validFrom} to ${offer.validUntil}${offer.minSpend ? `, minimum spend ${formatUSD(offer.minSpend)}` : ""}${offer.maxCashback ? `, cashback capped at ${formatUSD(offer.maxCashback)}` : ""} (id ${offer.id}). ${best ? `Best eligible purchase: ${best.transaction.id} on ${best.transaction.date.slice(0, 10)} for ${formatUSD(-best.transaction.amount)}, paying ${formatUSD(best.cashback)} cashback.` : "No eligible purchase yet."}`,
      data: { id: offer.id, merchant: offer.merchant, validUntil: offer.validUntil, cashback: best?.cashback ?? 0, transactionId: best?.transaction.id ?? null },
      merchant: offer.merchant,
      terms: termSet(offer.title, offer.merchant, offer.description, "offer cashback cash back deal coupon discount promo apply redeem"),
    });
  }

  // remembered facts
  for (const f of facts) {
    add({
      kind: "fact",
      title: `Remembered: ${f.key}`,
      text: `The user told the assistant that ${f.key.replace(/_/g, " ")} is ${f.value}.`,
      data: { key: f.key, value: f.value },
      terms: termSet(f.key.replace(/_/g, " "), f.value, "remembered fact salary income goal pay"),
    });
  }
  return out;
}

function transactionCandidates(state: FinanceState, q: QueryUnderstanding, startN: number): Candidate[] {
  const wantsRecent = /\brecent|\blatest|transactions?|purchases?|\bcharged\b|what did i buy/i.test(q.raw);
  if (!q.merchants.size && !wantsRecent) return [];
  let list = state.transactions.filter((t) => t.amount < 0 && t.category !== "Transfers");
  if (q.merchants.size) list = list.filter((t) => q.merchants.has(t.merchant));
  else if (q.categories.size) list = list.filter((t) => q.categories.has(t.category));
  if (q.months.size) list = list.filter((t) => q.months.has(t.date.slice(0, 7)));
  list = list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return list.map((t, i) => ({
    n: startN + i,
    kind: "transaction" as const,
    title: `${t.merchant} ${t.date.slice(0, 10)}`,
    text: `${t.id} on ${t.date.slice(0, 10)}: ${t.merchant} ${formatUSD(t.amount)} (${t.category}, ${t.method.replace(/_/g, " ")}, ${t.status})${t.appliedOfferId ? `, offer ${t.appliedOfferId} applied` : ""}.`,
    data: { id: t.id, date: t.date.slice(0, 10), merchant: t.merchant, amount: t.amount, category: t.category },
    merchant: t.merchant,
    category: t.category,
    month: t.date.slice(0, 7),
    terms: termSet(t.merchant, t.category, t.description, "transaction purchase charge payment recent"),
  }));
}

// ---------- code prefilter: understand the question lexically ----------

interface QueryUnderstanding {
  raw: string;
  tokens: Set<string>;
  categories: Set<Category>;
  merchants: Set<string>;
  months: Set<string>;
  /** Evidence kinds the wording points at, with how strongly (prefilter bonus). */
  kinds: Map<EvidenceKind, number>;
  /** Wording about unused / idle subscriptions. */
  unused: boolean;
  greeting: boolean;
}

function understand(question: string, state: FinanceState, merchantNames: string[]): QueryUnderstanding {
  const raw = question.toLowerCase();
  const today = state.asOf.slice(0, 10);
  const cur = today.slice(0, 7);
  const categories = new Set<Category>();
  for (const [re, c] of CATEGORY_ALIASES) if (re.test(raw)) categories.add(c);
  for (const c of CATEGORIES) if (raw.includes(c.toLowerCase())) categories.add(c);

  const merchants = new Set(merchantNames.filter((m) => m.length > 2 && new RegExp(`(?<![a-z0-9])${m.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(raw)));

  const months = new Set<string>();
  if (/last month|previous month|prior month/.test(raw)) months.add(prevMonth(cur));
  if (/this month|so far|month to date|mtd|\btoday\b|\brecent|\blatest|this week|yesterday/.test(raw)) months.add(cur);
  if (/last 30 days|past 30 days|past month/.test(raw)) {
    months.add(cur);
    months.add(prevMonth(cur));
  }
  MONTH_NAMES.forEach((name, i) => {
    if (new RegExp(`\\b(${name}|${name.slice(0, 3)}\\.?)\\b`, "i").test(question)) {
      const y = Number(cur.slice(0, 4));
      const year = i + 1 > Number(cur.slice(5, 7)) ? y - 1 : y;
      months.add(`${year}-${String(i + 1).padStart(2, "0")}`);
    }
  });

  const kinds = new Map<EvidenceKind, number>();
  const want = (k: EvidenceKind, w: number) => kinds.set(k, Math.max(kinds.get(k) ?? 0, w));
  if (/subscri|unused|not using|recurring|\bbills?\b|renew|cancel|\bplan\b|monthly cost|overlap|streaming|membership/.test(raw)) want("recurring", 4);
  if (/offers?|cash ?back|coupon|deal|discount|promo|redeem/.test(raw)) want("offer", 4);
  if (/balance|account|card|reload|paycheck|how am i doing|money left|afford/.test(raw)) want("account", 5);
  if (/salary|income|earn|goal|remember|pay ?day/.test(raw)) {
    want("fact", 5);
    want("month", 2);
  }
  if (/spen[dt]|spending|how much|cost|total|average|expenses?|compare|versus|\bvs\b|more than|less than|budget/.test(raw)) {
    want("category_month", 2);
    want("month", 2);
    want("merchant", 1);
  }
  if (/transactions?|purchases?|charged|\bbought\b|categori[sz]e/.test(raw)) want("transaction", 3);
  const unused = /unused|not using|don'?t use|haven'?t used|idle|waste|never use/.test(raw);

  const greeting = /^\s*(hi|hello|hey|thanks|thank you|ok|okay|yo|good (morning|evening|afternoon))\b[\s!.,]*$/i.test(question);
  return { raw, tokens: new Set(words(question).flatMap((w) => [w, stem(w)])), categories, merchants, months, kinds, unused, greeting };
}

function lexicalRaw(c: Candidate, q: QueryUnderstanding, anySignal: boolean): number {
  let s = 0;
  if (c.merchant && q.merchants.has(c.merchant)) s += 5;
  if (c.category && q.categories.has(c.category)) s += c.kind === "category_month" ? 4 : c.kind === "transaction" ? 3 : 2;
  if (c.month && q.months.size) s += q.months.has(c.month) ? 4 : c.kind === "transaction" ? 0 : -4;
  s += q.kinds.get(c.kind) ?? 0;
  if (q.unused && c.data.unused30d === true) s += 4;
  if (c.kind === "offer" && c.data.transactionId) s += 1.5; // an offer with an eligible purchase is more actionable
  let overlap = 0;
  for (const t of q.tokens) if (c.terms.has(t)) overlap++;
  s += Math.min(3, overlap * 0.75);
  // A merchant doc for a category-only question is background, a specific month/category doc is the answer.
  if (c.kind === "merchant" && q.categories.size && !q.merchants.size) s -= 0.5;
  // The question names a specific merchant / category: documents about other ones are noise, not background.
  if (q.merchants.size && c.merchant && !q.merchants.has(c.merchant)) s -= 3;
  if (q.categories.size && c.kind === "category_month" && c.category && !q.categories.has(c.category)) s -= 5;
  if (!anySignal) {
    const cur = c.month;
    if (c.kind === "account") s += 6;
    if (c.kind === "month" && cur) s += 4;
  }
  return Math.max(0, s);
}

/** Map the raw lexical overlap onto Jev's 0..3 relevance rubric so mock and live share one output shape. */
const lexicalScore = (raw: number) => Math.round(Math.min(3, raw / 3.5) * 100) / 100;

// ---------- Intent -> which evidence kinds are worth keeping ----------

const INTENT_KINDS: Record<Intent, EvidenceKind[] | "all"> = {
  question: "all",
  cancel_subscription: ["recurring", "account", "fact", "merchant"],
  apply_offer: ["offer", "transaction", "fact", "merchant", "account"],
  categorize: ["transaction", "merchant", "category_month"],
  remember_fact: ["fact", "month", "category_month", "account"],
  other: [],
};

// ---------- public API ----------

export async function retrieveEvidence(question: string, state: FinanceState, facts: FactLike[]): Promise<RetrievalResult> {
  const q0 = question.trim();
  const built = buildCandidates(state, facts);
  const merchantNames = [...new Set([...state.transactions.map((t) => t.merchant), ...state.recurring.map((r) => r.merchant), ...state.offers.map((o) => o.merchant)])];
  const q = understand(q0, state, merchantNames);
  const all = [...built, ...transactionCandidates(state, q, built.length)];
  const emptyIntent = classifyIntentByRules(q0);
  const base: RetrievalResult = { documents: [], mode: jevMode(), ranking: [], intent: { ...emptyIntent, mode: "mock" }, candidates: { built: all.length, prefiltered: 0 } };
  if (!q0 || q.greeting) return { ...base, mode: "mock" };

  // 1. code prefilter
  const anySignal = q.categories.size > 0 || q.merchants.size > 0 || q.months.size > 0 || q.kinds.size > 0 || q.unused;
  const prefiltered = all
    .map((c) => ({ c, raw: lexicalRaw(c, q, anySignal) }))
    .filter((x) => x.raw > 0)
    .sort((a, b) => b.raw - a.raw || a.c.n - b.c.n)
    .slice(0, MAX_PREFILTER);
  base.candidates.prefiltered = prefiltered.length;

  // 2. Jev rerank (live) or lexical scoring (mock) -> {score 0..3} per candidate
  const keyOf = (c: Candidate) => `c${c.n}`;
  const jev = await jevRankEvidence(
    q0,
    prefiltered.map(({ c }) => ({ key: keyOf(c), kind: c.kind, title: c.title, text: c.text })),
    state.asOf.slice(0, 10),
  );
  const mode: ServiceMode = jev ? "live" : "mock";
  const intent: IntentResult = jev?.intent ?? { ...emptyIntent, mode: "mock" };
  const scored = prefiltered
    .map(({ c, raw }) => ({ c, raw, score: Math.round((jev?.scores[keyOf(c)] ?? lexicalScore(raw)) * 100) / 100 }))
    .sort((a, b) => b.score - a.score || b.raw - a.raw || a.c.n - b.c.n);

  // 3. keep the useful ones; the (speculative) intent only prunes kinds that are not directly needed
  const route = INTENT_KINDS[intent.intent];
  const routeOk = (c: Candidate, score: number) => route === "all" || route.includes(c.kind) || score >= 2.5 || intent.confidence < 0.5;
  const kept: typeof scored = [];
  let chars = 0;
  for (const x of scored) {
    if (kept.length >= MAX_KEEP) break;
    if (x.score < MIN_KEEP_SCORE || !routeOk(x.c, x.score)) continue;
    if (chars + x.c.text.length > MAX_BLOCK_CHARS && kept.length > 0) break;
    chars += x.c.text.length + x.c.title.length;
    kept.push(x);
  }

  const documents: EvidenceDoc[] = kept.map((x, i) => ({ id: `ev_${i + 1}`, kind: x.c.kind, title: x.c.title, text: x.c.text, data: x.c.data }));
  const keptIds = new Map(kept.map((x, i) => [x.c.n, `ev_${i + 1}`]));
  const ranking: RankedCandidate[] = scored.map((x) => ({
    id: keptIds.get(x.c.n) ?? `cand_${x.c.n}`,
    score: x.score,
    kind: x.c.kind,
    title: x.c.title,
    kept: keptIds.has(x.c.n),
  }));
  return { documents, mode, ranking, intent, candidates: base.candidates };
}

/** Compact prompt block: ids + text only. */
export function formatEvidenceBlock(docs: EvidenceDoc[]): string {
  if (!docs.length) {
    return "<evidence>\n(no pre-retrieved evidence matched this message; use tools to fetch data)\n</evidence>";
  }
  return `<evidence>\n${docs.map((d) => `[${d.id}] ${d.text}`).join("\n")}\n</evidence>`;
}

/** Evidence documents as citable sources for the claim verifier. */
export function evidenceSources(docs: EvidenceDoc[]): SourceDoc[] {
  return docs.map((d) => ({ id: d.id, title: d.title, text: d.text }));
}

/** Merchant + category names the claim check looks for in a claim. */
export function knownEntities(state: FinanceState): string[] {
  return [...new Set([...state.transactions.map((t) => t.merchant), ...state.recurring.map((r) => r.merchant), ...state.offers.map((o) => o.merchant), ...CATEGORIES])];
}
