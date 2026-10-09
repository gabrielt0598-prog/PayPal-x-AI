// Mock PayPal data for the PFM prototype.
//
// Stands in for the APIMatic-generated PayPal Server SDK (Transaction Search +
// Subscriptions controllers) until Sandbox credentials are wired up. Everything is
// generated deterministically from a fixed seed, so every reload, chart and agent
// answer sees exactly the same numbers. Running balances are reconciled
// transaction by transaction, including PayPal auto-reloads from the linked bank.

import type {
  Category,
  FinanceState,
  Offer,
  PaymentMethod,
  RecurringPayment,
  Transaction,
  UserProfile,
} from "./types";

/** "Now" for the prototype. Charts, the agent and Zapier alerts all use this clock. */
export const AS_OF = "2026-10-07T18:00:00.000Z";
const WINDOW_START = "2026-07-08";
const WINDOW_END = "2026-10-07";

const OPENING_BALANCE = 1184.52;
const AUTO_RELOAD_THRESHOLD = 250;
const AUTO_RELOAD_AMOUNT = 500;

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
  autoReload: {
    enabled: true,
    threshold: AUTO_RELOAD_THRESHOLD,
    reloadAmount: AUTO_RELOAD_AMOUNT,
    fundingSource: "Chase Checking ••7712",
  },
  linkedBank: "Chase Checking ••7712",
  memberSince: "2019-03-14",
};

// ---------------------------------------------------------------------------
// Recurring payments: bills, subscriptions and variable spend (transit).
// ---------------------------------------------------------------------------

type RecurringSeed = Omit<RecurringPayment, "nextChargeDate" | "amountRange">;

const recurringSeeds: RecurringSeed[] = [
  // Bills — not cancellable from chat.
  { id: "bill_rent", merchant: "Parkline Apartments", plan: "1BR lease", kind: "bill", category: "Housing", amount: 1650, cycle: "monthly", billingDay: 1, status: "active", cancellable: false, cancelChannel: "none" },
  { id: "bill_coned", merchant: "Con Edison", plan: "Electric & gas", kind: "variable", category: "Utilities", amount: 0, cycle: "monthly", billingDay: 12, status: "active", cancellable: false, cancelChannel: "none" },
  { id: "bill_xfinity", merchant: "Xfinity", plan: "Internet 300 Mbps", kind: "bill", category: "Utilities", amount: 65, cycle: "monthly", billingDay: 15, status: "active", cancellable: false, cancelChannel: "none" },
  { id: "bill_tmobile", merchant: "T-Mobile", plan: "Essentials 1 line", kind: "bill", category: "Utilities", amount: 50, cycle: "monthly", billingDay: 20, status: "active", cancellable: false, cancelChannel: "none" },
  // Variable — transit is pay-per-ride, summarised as a weekly average.
  { id: "var_omny", merchant: "MTA OMNY", plan: "Subway & bus, pay-per-ride", kind: "variable", category: "Transportation", amount: 0, cycle: "weekly", status: "active", cancellable: false, cancelChannel: "none" },
  // Subscriptions — cancellable via natural language.
  { id: "sub_claude", merchant: "Anthropic", plan: "Claude Pro", kind: "subscription", category: "Productivity", amount: 20, cycle: "monthly", billingDay: 3, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-07" },
  { id: "sub_netflix", merchant: "Netflix", plan: "Basic", kind: "subscription", category: "Entertainment", amount: 11.99, cycle: "monthly", billingDay: 9, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-05" },
  { id: "sub_disney", merchant: "Disney+", plan: "Basic (with ads)", kind: "subscription", category: "Entertainment", amount: 9.99, cycle: "monthly", billingDay: 14, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-09-02" },
  { id: "sub_max", merchant: "Max", plan: "Basic with ads", kind: "subscription", category: "Entertainment", amount: 9.99, cycle: "monthly", billingDay: 22, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-07-19" },
  { id: "sub_spotify", merchant: "Spotify", plan: "Premium Individual", kind: "subscription", category: "Entertainment", amount: 11.99, cycle: "monthly", billingDay: 6, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-10-07" },
  { id: "sub_youtube", merchant: "YouTube Premium", plan: "Individual", kind: "subscription", category: "Entertainment", amount: 13.99, cycle: "monthly", billingDay: 18, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-06" },
  { id: "sub_mobbin", merchant: "Mobbin", plan: "Pro", kind: "subscription", category: "Productivity", amount: 12, cycle: "monthly", billingDay: 11, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-04" },
  { id: "sub_notion", merchant: "Notion", plan: "Plus", kind: "subscription", category: "Productivity", amount: 12, cycle: "monthly", billingDay: 2, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-10-07" },
  { id: "sub_figma", merchant: "Figma", plan: "Professional", kind: "subscription", category: "Productivity", amount: 16, cycle: "monthly", billingDay: 24, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-03" },
  { id: "sub_1password", merchant: "1Password", plan: "Individual", kind: "subscription", category: "Productivity", amount: 2.99, cycle: "monthly", billingDay: 27, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-10-07" },
  { id: "sub_icloud", merchant: "Apple iCloud+", plan: "200 GB", kind: "subscription", category: "Productivity", amount: 2.99, cycle: "monthly", billingDay: 16, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-07" },
  { id: "sub_duolingo", merchant: "Duolingo", plan: "Super", kind: "subscription", category: "Productivity", amount: 12.99, cycle: "monthly", billingDay: 8, status: "active", cancellable: true, cancelChannel: "paypal_subscriptions_api", lastUsedAt: "2026-07-26" },
  { id: "sub_lightroom", merchant: "Adobe", plan: "Lightroom (1TB)", kind: "subscription", category: "Productivity", amount: 11.99, cycle: "monthly", billingDay: 19, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-08-30" },
  { id: "sub_planetfitness", merchant: "Planet Fitness", plan: "Classic", kind: "subscription", category: "Health & Fitness", amount: 15, cycle: "monthly", billingDay: 17, status: "active", cancellable: true, cancelChannel: "kernel_browser", lastUsedAt: "2026-10-01" },
];

// ---------------------------------------------------------------------------
// PayPal Offers.
// ---------------------------------------------------------------------------

const offerSeeds: Offer[] = [
  { id: "offer_starbucks_10", merchant: "Starbucks", title: "10% back at Starbucks", description: "Earn 10% cash back on Starbucks purchases paid with PayPal, up to $3.", type: "percent_cashback", value: 10, maxCashback: 3, validFrom: "2026-09-01", validUntil: "2026-10-31", status: "available" },
  { id: "offer_target_5", merchant: "Target", title: "5% back at Target", description: "Earn 5% cash back at Target with your PayPal Debit Card, up to $10.", type: "percent_cashback", value: 5, maxCashback: 10, validFrom: "2026-09-15", validUntil: "2026-10-31", status: "available" },
  { id: "offer_uniqlo_10", merchant: "Uniqlo", title: "$10 back on $75+ at Uniqlo", description: "Get $10 back when you spend $75 or more at Uniqlo.", type: "fixed_cashback", value: 10, minSpend: 75, validFrom: "2026-09-01", validUntil: "2026-10-15", status: "available" },
  { id: "offer_wholefoods_3", merchant: "Whole Foods Market", title: "3% back at Whole Foods", description: "Earn 3% cash back on groceries at Whole Foods Market, up to $6.", type: "percent_cashback", value: 3, maxCashback: 6, validFrom: "2026-09-20", validUntil: "2026-11-20", status: "available" },
  { id: "offer_uber_10", merchant: "Uber", title: "10% back on Uber rides", description: "Earn 10% back on Uber rides paid with PayPal, up to $5.", type: "percent_cashback", value: 10, maxCashback: 5, validFrom: "2026-09-10", validUntil: "2026-10-31", status: "available" },
  { id: "offer_doordash_7", merchant: "DoorDash", title: "$7 back on $35+ at DoorDash", description: "Get $7 back on a DoorDash order of $35 or more.", type: "fixed_cashback", value: 7, minSpend: 35, validFrom: "2026-10-01", validUntil: "2026-10-31", status: "available" },
  { id: "offer_lyft_15", merchant: "Lyft", title: "15% back on Lyft rides", description: "Earn 15% back on Lyft rides paid with PayPal, up to $6.", type: "percent_cashback", value: 15, maxCashback: 6, validFrom: "2026-10-08", validUntil: "2026-10-31", status: "added" },
  { id: "offer_amazon_2", merchant: "Amazon", title: "2% back at Amazon", description: "Earn 2% back at Amazon, up to $8.", type: "percent_cashback", value: 2, maxCashback: 8, validFrom: "2026-07-01", validUntil: "2026-08-31", status: "expired" },
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
const between = (min: number, max: number) => r2(min + rand() * (max - min));
const chance = (p: number) => rand() < p;
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function* days(from: string, to: string) {
  const d = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (d <= end) {
    yield new Date(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (day: Date, hour: number, minute = Math.floor(rand() * 60)) => {
  const t = new Date(day);
  t.setUTCHours(hour, minute, 0, 0);
  return t.toISOString();
};

interface Draft {
  date: string;
  merchant: string;
  description: string;
  amount: number;
  category: Category;
  method: PaymentMethod;
  recurringId?: string;
  appliedOfferId?: string;
}

const drafts: Draft[] = [];
const spend = (d: Omit<Draft, "method"> & { method?: PaymentMethod }) =>
  drafts.push({ method: "paypal_debit_card", ...d, amount: -Math.abs(d.amount) });

const coned = [71.42, 88.17, 64.9]; // Jul, Aug, Sep bills (summer AC → August peak)
let conedIdx = 0;

for (const day of days(WINDOW_START, WINDOW_END)) {
  const dom = day.getUTCDate();
  const dow = day.getUTCDay(); // 0 Sun … 6 Sat
  const weekday = dow >= 1 && dow <= 5;
  const isoDay = iso(day);

  // Income: biweekly Friday direct deposit straight into the PayPal balance.
  const payAnchor = Date.UTC(2026, 6, 10); // Fri 10 Jul 2026
  const diffDays = Math.round((day.getTime() - payAnchor) / 86_400_000);
  if (dow === 5 && diffDays >= 0 && diffDays % 14 === 0) {
    drafts.push({ date: at(day, 9, 0), merchant: "Brightline Studio", description: "Payroll direct deposit", amount: userProfile.netPaycheck, category: "Income", method: "direct_deposit" });
  }

  // Bills & subscriptions on their billing day.
  for (const r of recurringSeeds) {
    if (r.cycle !== "monthly" || r.billingDay !== dom) continue;
    if (r.id === "bill_coned") {
      spend({ date: at(day, 6), merchant: r.merchant, description: `${r.plan} bill`, amount: coned[conedIdx++ % coned.length], category: r.category, method: "paypal_balance", recurringId: r.id });
      continue;
    }
    spend({ date: at(day, r.kind === "bill" ? 6 : 8), merchant: r.merchant, description: `${r.plan} — monthly`, amount: r.amount, category: r.category, method: r.kind === "bill" ? "paypal_balance" : "paypal_debit_card", recurringId: r.id });
  }

  // Savings sweep after the second paycheck of the month.
  if (dom === 26) {
    drafts.push({ date: at(day, 12, 0), merchant: "Ally Savings", description: "Transfer to savings", amount: -1100, category: "Transfers", method: "bank_transfer" });
  }

  // Transit: pay-per-ride on workdays, the odd weekend trip.
  if (weekday && !chance(0.12)) {
    const rides = chance(0.25) ? 3 : 2;
    spend({ date: at(day, 17), merchant: "MTA OMNY", description: `Subway — ${rides} rides`, amount: r2(rides * 2.9), category: "Transportation", recurringId: "var_omny" });
  } else if (!weekday && chance(0.35)) {
    spend({ date: at(day, 13), merchant: "MTA OMNY", description: "Subway — 2 rides", amount: 5.8, category: "Transportation", recurringId: "var_omny" });
  }
  if (chance(0.09)) spend({ date: at(day, 22), merchant: pick(["Uber", "Uber", "Lyft"]), description: "Ride", amount: between(13, 34), category: "Transportation" });

  // Coffee & food.
  if (weekday && chance(0.6)) spend({ date: at(day, 8), merchant: pick(["Starbucks", "Starbucks", "Blue Bottle Coffee", "Joe Coffee"]), description: "Coffee", amount: between(4.25, 7.85), category: "Dining" });
  if (weekday && chance(0.45)) spend({ date: at(day, 12), merchant: pick(["Sweetgreen", "Chipotle", "Dig", "Joe & The Juice"]), description: "Lunch", amount: between(11.5, 17.9), category: "Dining" });
  if (chance(0.16)) spend({ date: at(day, 20), merchant: pick(["DoorDash", "DoorDash", "Uber Eats"]), description: "Food delivery", amount: between(24, 58), category: "Dining" });
  if (!weekday && chance(0.35)) spend({ date: at(day, 19), merchant: pick(["Lilia", "Joe's Pizza", "Xi'an Famous Foods", "Los Tacos No. 1"]), description: "Dinner", amount: between(18, 74), category: "Dining" });

  // Groceries roughly twice a week.
  if ((dow === 0 || dow === 3) && !chance(0.15)) spend({ date: at(day, 17), merchant: pick(["Trader Joe's", "Trader Joe's", "Whole Foods Market"]), description: "Groceries", amount: between(38, 112), category: "Groceries" });

  // Shopping.
  if (chance(0.13)) spend({ date: at(day, 21), merchant: "Amazon", description: "Online order", amount: between(11, 84), category: "Shopping" });
  if (chance(0.06)) spend({ date: at(day, 15), merchant: "Target", description: "In-store purchase", amount: between(24, 92), category: "Shopping" });
  if (chance(0.06)) spend({ date: at(day, 16), merchant: pick(["CVS Pharmacy", "Walgreens"]), description: "Pharmacy", amount: between(7, 31), category: "Health & Fitness" });
  if (!weekday && chance(0.1)) spend({ date: at(day, 19), merchant: pick(["AMC Theatres", "Alamo Drafthouse"]), description: "Movie tickets", amount: between(17, 34), category: "Entertainment" });

  // One-offs.
  if (isoDay === "2026-08-13") spend({ date: at(day, 10), merchant: "JetBlue", description: "Flight NYC → BOS (round trip)", amount: 248.4, category: "Travel" });
  if (isoDay === "2026-08-14") spend({ date: at(day, 11), merchant: "Airbnb", description: "Boston — 2 nights", amount: 412.16, category: "Travel" });
  if (isoDay === "2026-08-22") spend({ date: at(day, 14), merchant: "Steam", description: "Game purchase", amount: 19.99, category: "Entertainment" });
  if (isoDay === "2026-09-28") spend({ date: at(day, 15), merchant: "Uniqlo", description: "Fall jackets", amount: 89.8, category: "Shopping" });
  if (isoDay === "2026-10-04") spend({ date: at(day, 16), merchant: "Target", description: "Home essentials", amount: 67.43, category: "Shopping" });
}

// A previously-applied Starbucks offer, so the history shows what applied cashback looks like.
const appliedStarbucks = drafts
  .filter((d) => d.merchant === "Starbucks" && d.date >= "2026-09-01")
  .sort((a, b) => a.date.localeCompare(b.date))[0];

// An October payout: the Whole Foods offer was applied to a late-September shop
// and its cash back posted on Oct 2.
const appliedWholeFoods = drafts
  .filter((d) => d.merchant === "Whole Foods Market" && d.date >= "2026-09-20" && d.date < "2026-10-01")
  .sort((a, b) => a.date.localeCompare(b.date))[0];
if (appliedWholeFoods) {
  appliedWholeFoods.appliedOfferId = "offer_wholefoods_3";
  drafts.push({ date: "2026-10-02T10:00:00.000Z", merchant: "PayPal Offers", description: "Cash back — 3% back at Whole Foods", amount: Math.min(r2(-appliedWholeFoods.amount * 0.03), 6), category: "Cashback", method: "paypal_offer" });
}

// ---------------------------------------------------------------------------
// Reconcile: sort, assign ids, run the balance, inject PayPal auto-reloads.
// ---------------------------------------------------------------------------

drafts.sort((a, b) => a.date.localeCompare(b.date));

const ledger: Transaction[] = [];
let balance = OPENING_BALANCE;
let n = 0;
const nextId = () => `txn_${String(++n).padStart(4, "0")}`;

for (const d of drafts) {
  balance = r2(balance + d.amount);
  const txn: Transaction = { id: nextId(), status: "completed", balanceAfter: balance, ...d };
  ledger.push(txn);

  if (d === appliedStarbucks) {
    txn.appliedOfferId = "offer_starbucks_10";
    const cashback = Math.min(r2(-d.amount * 0.1), 3);
    balance = r2(balance + cashback);
    ledger.push({ id: nextId(), date: new Date(Date.parse(d.date) + 60_000).toISOString(), merchant: "PayPal Offers", description: "Cash back — 10% back at Starbucks", amount: cashback, category: "Cashback", method: "paypal_offer", status: "completed", balanceAfter: balance });
  }

  if (userProfile.autoReload.enabled && balance < AUTO_RELOAD_THRESHOLD) {
    balance = r2(balance + AUTO_RELOAD_AMOUNT);
    ledger.push({ id: nextId(), date: new Date(Date.parse(d.date) + 120_000).toISOString(), merchant: "PayPal Auto-Reload", description: `Auto-reload from ${userProfile.autoReload.fundingSource}`, amount: AUTO_RELOAD_AMOUNT, category: "Transfers", method: "auto_reload", status: "completed", balanceAfter: balance });
  }
}

// Today's last card swipe is still pending.
const last = ledger.findLast((t) => t.method === "paypal_debit_card" && t.date.startsWith(WINDOW_END));
if (last) last.status = "pending";

export const transactions: Transaction[] = ledger;
userProfile.paypalBalance = balance;

// ---------------------------------------------------------------------------
// Finalise recurring payments (next charge dates, variable ranges) and offers.
// ---------------------------------------------------------------------------

function nextMonthlyDate(billingDay: number): string {
  const now = new Date(AS_OF);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, billingDay));
  if (candidate.getTime() <= now.getTime()) candidate.setUTCMonth(m + 1);
  return iso(candidate);
}

function chargesFor(id: string) {
  return transactions.filter((t) => t.recurringId === id).map((t) => -t.amount);
}

export const subscriptions: RecurringPayment[] = recurringSeeds.map((r) => {
  if (r.id === "var_omny") {
    // Average weekly transit spend over the window.
    const charges = chargesFor(r.id);
    const weeks = 13;
    const perWeek: number[] = Array.from({ length: weeks }, () => 0);
    for (const t of transactions.filter((t) => t.recurringId === r.id)) {
      const w = Math.min(weeks - 1, Math.floor((Date.parse(t.date) - Date.parse(`${WINDOW_START}T00:00:00Z`)) / (7 * 86_400_000)));
      perWeek[w] += -t.amount;
    }
    const total = charges.reduce((a, b) => a + b, 0);
    return { ...r, amount: r2(total / weeks), amountRange: { min: r2(Math.min(...perWeek)), max: r2(Math.max(...perWeek)) }, nextChargeDate: "2026-10-08" };
  }
  if (r.kind === "variable") {
    const charges = chargesFor(r.id);
    const avg = charges.reduce((a, b) => a + b, 0) / Math.max(1, charges.length);
    return { ...r, amount: r2(avg), amountRange: { min: Math.min(...charges), max: Math.max(...charges) }, nextChargeDate: nextMonthlyDate(r.billingDay!) };
  }
  return { ...r, nextChargeDate: nextMonthlyDate(r.billingDay!) };
});

const targetOct4 = transactions.find((t) => t.merchant === "Target" && t.date.startsWith("2026-10-04"));

export const offers: Offer[] = offerSeeds.map((o) => {
  if ((o.id === "offer_starbucks_10" && appliedStarbucks) || (o.id === "offer_wholefoods_3" && appliedWholeFoods)) {
    return { ...o, status: "applied", appliedToTransactionId: transactions.find((t) => t.appliedOfferId === o.id)?.id };
  }
  // Cash back on the Oct 4 Target shop is still pending; it posts on Oct 11.
  if (o.id === "offer_target_5" && targetOct4) {
    targetOct4.appliedOfferId = o.id;
    return { ...o, status: "pending", appliedToTransactionId: targetOct4.id, pendingCashback: r2(-targetOct4.amount * 0.05), postsOn: "2026-10-11" };
  }
  return o;
});

/** Fresh deep copy of the seed state. The server store mutates its own copy. */
export function createSeedState(): FinanceState {
  return structuredClone({ userProfile, transactions, recurring: subscriptions, offers, asOf: AS_OF });
}
