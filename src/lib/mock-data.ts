// Mock PayPal data for the PFM prototype, matching the Clean design
// (design/clean/ProtoClean.dc.html): the same merchants, amounts and dates as
// its transactions table, the same subscriptions and bills, the same offers,
// and monthly category totals that match its Insights page (Jan – Sep 2026).
//
// Stands in for the APIMatic-generated PayPal Server SDK (Transaction Search +
// Subscriptions controllers) when no Sandbox credentials are set. Generated
// deterministically, so every reload, chart and agent answer sees the same
// numbers, and every transaction carries a reconciled running balance.

import type { Category, FinanceState, Offer, PaymentMethod, RecurringPayment, Transaction, UserProfile } from "./types";

/** "Now" for the prototype. Charts and the agent use this clock. */
export const AS_OF = "2026-10-07T18:00:00.000Z";
/** PayPal balance at AS_OF (Home: "PayPal balance"). */
const CLOSING_BALANCE = 2033.9;
const OPENING_BALANCE = 2600;
/** Monthly savings sweeps leave about this much in the balance. */
const SWEEP_KEEP = 2900;

export const userProfile: UserProfile = {
  id: "user_jordan",
  name: "Jordan Lee",
  email: "jordan.lee@example.com",
  currency: "USD",
  annualSalary: 75000,
  // $75k gross → ~$57.6k net after federal/state/FICA, paid biweekly.
  netPaycheck: 2215.38,
  payFrequency: "biweekly",
  paypalBalance: 0, // filled in from the reconciled ledger below
  card: { product: "PayPal Debit Mastercard", last4: "4821" },
  autoReload: { enabled: true, threshold: 25, reloadAmount: 100, fundingSource: "Northwind Total Checking ••7712" },
  linkedBank: "Northwind Total Checking ••7712",
  memberSince: "2019-03-14",
};

// ---------------------------------------------------------------------------
// Recurring payments (Recurring page: Subscriptions + Bills).
// ---------------------------------------------------------------------------

type RecurringSeed = Omit<RecurringPayment, "nextChargeDate" | "amountRange">;

const recurringSeeds: RecurringSeed[] = [
  { id: "bill_rent", merchant: "Parkside Apartments", plan: "Rent", kind: "bill", category: "Essential bills", amount: 1450, cycle: "monthly", billingDay: 1, status: "active", cancellable: false, cancelChannel: "none", since: "2024-06-01" },
  { id: "bill_pge", merchant: "Brightgrid Energy", plan: "Electric & gas", kind: "variable", category: "Essential bills", amount: 0, cycle: "monthly", billingDay: 29, status: "active", cancellable: false, cancelChannel: "none", since: "2024-06-01" },
  { id: "bill_recology", merchant: "Tidyloop", plan: "Trash & recycling", kind: "bill", category: "Essential bills", amount: 38.5, cycle: "monthly", billingDay: 25, status: "active", cancellable: false, cancelChannel: "none", since: "2024-06-01" },
  { id: "sub_disney", merchant: "Kitebird+", plan: "Basic with ads", kind: "subscription", category: "Subscriptions", amount: 9.99, cycle: "monthly", billingDay: 14, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-09-02", since: "2025-03-14" },
  { id: "sub_max", merchant: "Vantage", plan: "Basic with ads", kind: "subscription", category: "Subscriptions", amount: 9.99, cycle: "monthly", billingDay: 22, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-07-19", since: "2026-01-22" },
  { id: "sub_duolingo", merchant: "Parlo", plan: "Super", kind: "subscription", category: "Subscriptions", amount: 12.99, cycle: "monthly", billingDay: 8, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-07-26", since: "2025-02-08" },
  { id: "sub_adobe", merchant: "Pixelforge", plan: "Photo Studio 1TB", kind: "subscription", category: "Subscriptions", amount: 11.99, cycle: "monthly", billingDay: 19, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-08-30", since: "2024-08-19" },
  { id: "sub_claude", merchant: "Sable", plan: "Pro", kind: "subscription", category: "Subscriptions", amount: 20, cycle: "monthly", billingDay: 3, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-07", since: "2026-01-03" },
  { id: "sub_figma", merchant: "Frameline", plan: "Professional", kind: "subscription", category: "Subscriptions", amount: 16, cycle: "monthly", billingDay: 24, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-03", since: "2025-09-24" },
  { id: "sub_planetfitness", merchant: "Forge Fitness", plan: "Classic", kind: "subscription", category: "Subscriptions", amount: 15, cycle: "monthly", billingDay: 17, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-01", since: "2024-07-17" },
  { id: "sub_youtube", merchant: "Reelhouse Premium", plan: "Individual", kind: "subscription", category: "Subscriptions", amount: 13.99, cycle: "monthly", billingDay: 18, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-06", since: "2023-11-18" },
  { id: "sub_netflix", merchant: "Cinebox", plan: "Basic", kind: "subscription", category: "Subscriptions", amount: 11.99, cycle: "monthly", billingDay: 9, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-05", since: "2022-04-09" },
  { id: "sub_spotify", merchant: "Sonora", plan: "Premium Individual", kind: "subscription", category: "Subscriptions", amount: 11.99, cycle: "monthly", billingDay: 1, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-10-07", since: "2023-02-01" },
];

/** Brightgrid Energy bill by month (winter heating → spring low → late-summer bump). */
const PGE: Record<string, number> = { "2026-01": 118.2, "2026-02": 104.6, "2026-03": 79.1, "2026-04": 68.2, "2026-05": 61.5, "2026-06": 74.9, "2026-07": 92.3, "2026-08": 86.4, "2026-09": 86.4 };

// ---------------------------------------------------------------------------
// Monthly targets (Insights page). Total spend per month; per-category spend
// for Dining, Groceries, Shopping, Transport. Bills and subscriptions come
// from the recurring list; "Other" is the remainder.
// ---------------------------------------------------------------------------

const MONTH_TOTAL: Record<string, number> = {
  "2026-01": 3121.65, "2026-02": 3270.05, "2026-03": 3373.55, "2026-04": 3341.65, "2026-05": 3284.95,
  "2026-06": 3445.35, "2026-07": 3608.74, "2026-08": 3679.44, "2026-09": 3759, "2026-10": 2220.81,
};
// [dining, groceries, shopping, transport]
const MONTH_CATS: Record<string, [number, number, number, number]> = {
  "2026-01": [330, 370, 120, 115], "2026-02": [372, 375, 210, 125], "2026-03": [418, 395, 240, 138],
  "2026-04": [402, 388, 245, 142], "2026-05": [455, 372, 158, 128], "2026-06": [430, 401, 260, 151],
  "2026-07": [470, 410, 312, 166], "2026-08": [484, 415.47, 356.66, 159.55], "2026-09": [551.56, 402.18, 388.4, 141.2],
};

// ---------------------------------------------------------------------------
// PayPal Offers (Offers page).
// ---------------------------------------------------------------------------

const offerSeeds: Offer[] = [
  { id: "offer_uniqlo", merchant: "Thistle", title: "$10 back on $75+", description: "Get $10 back once when you spend $75 or more in one purchase at thistle.com and US stores.", type: "fixed_cashback", value: 10, minSpend: 75, validFrom: "2026-09-15", validUntil: "2026-10-15", status: "available", matchNote: "Matched because you’ve shopped at Thistle 3 times since August." },
  { id: "offer_doordash", merchant: "Plateful", title: "$7 back on $35+", description: "Get $7 back once on a Plateful order of $35 or more in the app or on the website.", type: "fixed_cashback", value: 7, minSpend: 35, validFrom: "2026-10-01", validUntil: "2026-10-31", status: "available", matchNote: "Matched because you’ve placed 7 Plateful orders since July." },
  { id: "offer_uber", merchant: "Hopline", title: "10% back on rides", description: "Earn 10% back on Hopline rides in the US, up to $15.", type: "percent_cashback", value: 10, maxCashback: 15, validFrom: "2026-10-01", validUntil: "2026-10-31", status: "available", matchNote: "Matched because you’ve taken 5 Hopline rides since August." },
  { id: "offer_amazon", merchant: "Cartly", title: "2% back on any order", description: "Earn 2% back on any cartly.com order, up to $20.", type: "percent_cashback", value: 2, maxCashback: 20, validFrom: "2026-09-01", validUntil: "2026-11-30", status: "available", matchNote: "Matched because you’ve ordered from Cartly 6 times this year." },
  { id: "offer_target", merchant: "Corevale", title: "5% back on any purchase", description: "Earn 5% back on any purchase at corevale.com and stores, up to $25.", type: "percent_cashback", value: 5, maxCashback: 25, validFrom: "2026-09-15", validUntil: "2026-10-31", status: "available" },
  { id: "offer_wholefoods", merchant: "Greenfold", title: "3% back on groceries", description: "Earn 3% back on groceries at Greenfold Market stores, up to $10.", type: "percent_cashback", value: 3, maxCashback: 10, validFrom: "2026-09-20", validUntil: "2026-11-20", status: "available" },
];

// ---------------------------------------------------------------------------
// Deterministic generator.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261007);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const at = (date: string, hour: number, minute = Math.floor(rand() * 60)) => `${date}T${pad(hour)}:${pad(minute)}:00.000Z`;
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

interface Draft {
  date: string;
  merchant: string;
  description: string;
  amount: number;
  category: Category;
  method: PaymentMethod;
  recurringId?: string;
  appliedOfferId?: string;
  needsReview?: boolean;
}

const drafts: Draft[] = [];
const spend = (date: string, merchant: string, description: string, amount: number, category: Category, method: PaymentMethod = "paypal_debit_card", extra: Partial<Draft> = {}) =>
  drafts.push({ date, merchant, description, amount: -Math.abs(amount), category, method, ...extra });

// 1) The Clean design's transactions table, exactly.
spend(at("2026-10-07", 17, 32), "Thistle", "Fall jackets", 89.8, "Shopping");
spend(at("2026-10-07", 8, 14), "Ember Roast", "Coffee", 6.15, "Dining");
spend(at("2026-10-05", 19, 41), "Plateful", "Food delivery", 54.96, "Dining");
spend(at("2026-10-04", 15, 12), "Corevale", "Home essentials", 67.43, "Shopping", "paypal_balance");
spend(at("2026-10-02", 22, 5), "Hopline", "Ride", 30.58, "Transport");
drafts.push({ date: at("2026-10-02", 9, 0), merchant: "Acme Inc. payroll", description: "Payroll direct deposit", amount: userProfile.netPaycheck, category: "Income", method: "direct_deposit" });
spend(at("2026-10-01", 9, 0), "Parkside Apartments", "Rent — October", 1450, "Essential bills", "bank_transfer", { recurringId: "bill_rent" });
spend(at("2026-10-01", 7, 0), "Sonora", "Premium Individual — monthly", 11.99, "Subscriptions", "paypal_debit_card", { recurringId: "sub_spotify" });
spend(at("2026-09-30", 9, 22), "SQ *COPPER PEAK 0412", "Card purchase", 7.25, "Other", "paypal_debit_card", { needsReview: true });
spend(at("2026-09-29", 6, 0), "Brightgrid Energy", "Electric & gas bill", PGE["2026-09"], "Essential bills", "paypal_balance", { recurringId: "bill_pge" });
spend(at("2026-09-28", 17, 48), "Greenfold", "Groceries", 68.39, "Groceries", "paypal_debit_card", { appliedOfferId: "offer_wholefoods" });
spend(at("2026-09-27", 19, 30), "Lilia", "Dinner", 98.18, "Dining");

// 2) Named history behind the offer copy ("3 times since August", "7 orders since July", …).
const NAMED: [string, string, string, number, Category][] = [
  ["2026-08-14", "Thistle", "Card purchase", 64.9, "Shopping"],
  ["2026-09-12", "Thistle", "Card purchase", 42.5, "Shopping"],
  ["2026-07-11", "Plateful", "Food delivery", 41.2, "Dining"],
  ["2026-07-25", "Plateful", "Food delivery", 38.75, "Dining"],
  ["2026-08-09", "Plateful", "Food delivery", 47.1, "Dining"],
  ["2026-08-23", "Plateful", "Food delivery", 36.4, "Dining"],
  ["2026-09-06", "Plateful", "Food delivery", 44.85, "Dining"],
  ["2026-09-19", "Plateful", "Food delivery", 52.3, "Dining"],
  ["2026-08-02", "Hopline", "Ride", 18.4, "Transport"],
  ["2026-08-28", "Hopline", "Ride", 24.15, "Transport"],
  ["2026-09-10", "Hopline", "Ride", 21.6, "Transport"],
  ["2026-09-24", "Hopline", "Ride", 27.35, "Transport"],
  ["2026-02-12", "Cartly", "Online order", 34.99, "Shopping"],
  ["2026-04-03", "Cartly", "Online order", 27.48, "Shopping"],
  ["2026-05-20", "Cartly", "Online order", 61.2, "Shopping"],
  ["2026-07-15", "Cartly", "Online order", 22.99, "Shopping"],
  ["2026-08-30", "Cartly", "Online order", 45.67, "Shopping"],
  ["2026-09-16", "Cartly", "Online order", 38.4, "Shopping"],
  ["2026-03-08", "Corevale", "In-store purchase", 52.1, "Shopping"],
  ["2026-06-21", "Corevale", "In-store purchase", 74.3, "Shopping"],
  ["2026-08-16", "Corevale", "In-store purchase", 58.9, "Shopping"],
];
for (const [d, m, desc, a, c] of NAMED) spend(at(d, 12 + Math.floor(rand() * 8)), m, desc, a, c);

// 3) Paychecks: biweekly Friday direct deposits (…, Sep 18, Oct 2).
for (let t = Date.UTC(2026, 0, 9); t < Date.parse("2026-10-02"); t += 14 * 86_400_000) {
  drafts.push({ date: at(new Date(t).toISOString().slice(0, 10), 9, 0), merchant: "Acme Inc. payroll", description: "Payroll direct deposit", amount: userProfile.netPaycheck, category: "Income", method: "direct_deposit" });
}

// 4) Bills and subscriptions on their billing day, from the month they started.
const months = Object.keys(PGE); // Jan – Sep; October's are in the table above
for (const ym of months) {
  for (const r of recurringSeeds) {
    const day = Math.min(r.billingDay!, daysIn(ym));
    const date = `${ym}-${pad(day)}`;
    if (r.since && date < r.since) continue;
    if (r.id === "bill_pge" && ym === "2026-09") continue; // in the table
    const amount = r.id === "bill_pge" ? PGE[ym] : r.amount;
    const method: PaymentMethod = r.id === "bill_rent" ? "bank_transfer" : r.id === "bill_pge" ? "paypal_balance" : "paypal_debit_card";
    spend(at(date, r.id === "bill_rent" ? 9 : 7), r.merchant, r.kind === "subscription" ? `${r.plan} — monthly` : `${r.plan} bill`, amount, r.category, method, { recurringId: r.id });
  }
}
// October charges so far besides the table's rent and Sonora: Pro on Oct 3.
spend(at("2026-10-03", 7, 0), "Sable", "Pro — monthly", 20, "Subscriptions", "paypal_debit_card", { recurringId: "sub_claude" });

// 5) Everyday spend that fills each month to its Insights totals.
const POOLS: Record<"Dining" | "Groceries" | "Shopping" | "Transport" | "Other", { merchants: string[]; desc: string; avg: number }> = {
  Dining: { merchants: ["Ember Roast", "Copper Peak Coffee", "Juniper Coffee", "Leafwell", "Larkspur Bakery", "Olive & Ash", "Marlow's Pizza", "Lilia"], desc: "Food & drink", avg: 21 },
  Groceries: { merchants: ["Greenfold", "Fieldhand Market", "Fieldhand Market", "Harvest Lane", "Maple Street Market"], desc: "Groceries", avg: 55 },
  Shopping: { merchants: ["Oakline Home", "Voltway", "Glowhaus", "Summit Hollow", "Linenworks"], desc: "Card purchase", avg: 62 },
  Transport: { merchants: ["Bayline Transit", "Bayline Transit", "Bayline Transit", "Swiftcab"], desc: "Transit & rides", avg: 14 },
  Other: { merchants: ["Wellmark Pharmacy", "Dayrite Pharmacy", "Starlit Cinemas", "Bookmarrow", "Hillcrest Park Golf", "Ridgeline Sports"], desc: "Card purchase", avg: 58 },
};

function fill(ym: string, category: keyof typeof POOLS, total: number, dayRange: [number, number]) {
  if (total <= 0.5) return;
  const pool = POOLS[category];
  const n = Math.max(1, Math.round(total / pool.avg));
  const weights = Array.from({ length: n }, () => 0.55 + rand() * 0.9);
  const sum = weights.reduce((a, w) => a + w, 0);
  let left = r2(total);
  weights.forEach((w, i) => {
    const amount = i === n - 1 ? left : r2((total * w) / sum);
    left = r2(left - amount);
    const day = dayRange[0] + Math.floor(rand() * (dayRange[1] - dayRange[0] + 1));
    spend(at(`${ym}-${pad(day)}`, 8 + Math.floor(rand() * 13)), pick(pool.merchants), pool.desc, amount, category);
  });
}

const spentIn = (ym: string, category: Category) => r2(drafts.filter((d) => d.amount < 0 && d.category === category && d.date.startsWith(ym)).reduce((a, d) => a - d.amount, 0));

/** Home compares October with September "at the same point": $2,091.00 spent by Sep 7. */
const SEP_FIRST_WEEK = 2091;

for (const ym of months) {
  const [dining, groceries, shopping, transport] = MONTH_CATS[ym];
  const targets: [keyof typeof POOLS, number][] = [
    ["Dining", dining],
    ["Groceries", groceries],
    ["Shopping", shopping],
    ["Transport", transport],
  ];
  const fixed = ["Essential bills", "Subscriptions"].reduce((a, c) => a + spentIn(ym, c as Category), 0) + dining + groceries + shopping + transport;
  targets.push(["Other", MONTH_TOTAL[ym] - fixed]);
  const left = targets.map(([c, t]) => [c, r2(t - spentIn(ym, c))] as const);
  if (ym !== "2026-09") {
    for (const [c, amount] of left) fill(ym, c, amount, [1, daysIn(ym)]);
    continue;
  }
  // September: its last days are the table rows only, so everyday spend lands on the 1st – 26th,
  // with the first week sized to reach SEP_FIRST_WEEK by Sep 7.
  const firstWeek = r2(SEP_FIRST_WEEK - drafts.filter((d) => d.amount < 0 && d.category !== "Transfers" && d.date >= "2026-09-01" && d.date < "2026-09-08").reduce((a, d) => a - d.amount, 0));
  const all = left.reduce((a, [, v]) => a + v, 0);
  let earlyLeft = firstWeek;
  left.forEach(([c, amount], i) => {
    const early = i === left.length - 1 ? earlyLeft : r2((firstWeek * amount) / all);
    earlyLeft = r2(earlyLeft - early);
    fill(ym, c, early, [1, 7]);
    fill(ym, c, r2(amount - early), [8, 26]);
  });
}
// October to date: a few everyday purchases on Oct 1 – 3 bring the month to its Home total.
{
  const ym = "2026-10";
  const left = r2(MONTH_TOTAL[ym] - drafts.filter((d) => d.amount < 0 && d.category !== "Transfers" && d.date.startsWith(ym)).reduce((a, d) => a - d.amount, 0));
  fill(ym, "Groceries", r2(left * 0.38), [1, 3]);
  fill(ym, "Dining", r2(left * 0.27), [1, 3]);
  fill(ym, "Transport", r2(left * 0.07), [1, 3]);
  fill(ym, "Other", r2(left - r2(left * 0.38) - r2(left * 0.27) - r2(left * 0.07)), [1, 3]);
}

// 6) Offer payouts: Greenfold 3% on the Sep 28 shop, added Oct 2.
drafts.push({ date: at("2026-10-02", 10, 0), merchant: "PayPal Offers", description: "Cash back — 3% back on groceries", amount: 2.05, category: "Cashback", method: "paypal_offer" });

// ---------------------------------------------------------------------------
// Reconcile: sort, assign ids, run the balance with monthly savings sweeps so
// the balance closes at CLOSING_BALANCE.
// ---------------------------------------------------------------------------

drafts.sort((a, b) => a.date.localeCompare(b.date));

const sweepDates = months.map((ym) => `${ym}-20T12:00:00.000Z`);
const lastSweep = sweepDates[sweepDates.length - 1];
const netAfterLastSweep = r2(drafts.filter((d) => d.date > lastSweep).reduce((a, d) => a + d.amount, 0));

const ledger: Transaction[] = [];
let balance = OPENING_BALANCE;
let n = 0;
const nextId = () => `txn_${String(++n).padStart(4, "0")}`;
const sweeps = [...sweepDates];

for (const d of drafts) {
  while (sweeps.length && sweeps[0] <= d.date) {
    const when = sweeps.shift()!;
    const keep = when === lastSweep ? r2(CLOSING_BALANCE - netAfterLastSweep) : SWEEP_KEEP;
    const amount = r2(keep - balance);
    if (Math.abs(amount) >= 0.01) {
      balance = r2(balance + amount);
      ledger.push({ id: nextId(), date: when, merchant: userProfile.linkedBank, description: amount < 0 ? "Transfer to savings" : "Top up from bank", amount, category: "Transfers", method: "bank_transfer", status: "completed", balanceAfter: balance });
    }
  }
  balance = r2(balance + d.amount);
  ledger.push({ id: nextId(), status: "completed", balanceAfter: balance, ...d });
}

export const transactions: Transaction[] = ledger;
userProfile.paypalBalance = balance;

// ---------------------------------------------------------------------------
// Finalise recurring payments (next charge dates, Brightgrid Energy range) and offers.
// ---------------------------------------------------------------------------

function nextMonthlyDate(billingDay: number): string {
  const now = new Date(AS_OF);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, billingDay));
  if (candidate.getTime() <= now.getTime()) candidate.setUTCMonth(m + 1);
  return candidate.toISOString().slice(0, 10);
}

export const subscriptions: RecurringPayment[] = recurringSeeds.map((r) => {
  if (r.kind === "variable") {
    const charges = transactions.filter((t) => t.recurringId === r.id).map((t) => -t.amount);
    const avg = charges.reduce((a, b) => a + b, 0) / Math.max(1, charges.length);
    // Shown at the latest bill (as on the Recurring page); the range covers the year.
    return { ...r, amount: charges[charges.length - 1] ?? r2(avg), amountRange: { min: Math.min(...charges), max: Math.max(...charges) }, nextChargeDate: nextMonthlyDate(r.billingDay!) };
  }
  return { ...r, nextChargeDate: nextMonthlyDate(r.billingDay!) };
});

const targetOct4 = transactions.find((t) => t.merchant === "Corevale" && t.date.startsWith("2026-10-04"));
if (targetOct4) targetOct4.appliedOfferId = "offer_target";

export const offers: Offer[] = offerSeeds.map((o) => {
  if (o.id === "offer_wholefoods") return { ...o, status: "applied", appliedToTransactionId: transactions.find((t) => t.appliedOfferId === o.id)?.id };
  // Corevale: 5% of the Oct 4 shop is pending and posts on Oct 11.
  if (o.id === "offer_target" && targetOct4) return { ...o, status: "pending", appliedToTransactionId: targetOct4.id, pendingCashback: r2(-targetOct4.amount * 0.05), postsOn: "2026-10-11" };
  return o;
});

/** Fresh deep copy of the seed state. The server store mutates its own copy. */
export function createSeedState(): FinanceState {
  return structuredClone({ userProfile, transactions, recurring: subscriptions, offers, asOf: AS_OF });
}
