// Deterministic merchant/keyword categoriser and intent rules. Used as the Jev mock mode and as the
// synchronous fallback wherever a model call is not worth it (e.g. mapping PayPal Sandbox transactions).

import type { Category } from "../types";
import type { Intent } from "./contracts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+& ]+/g, " ").replace(/\s+/g, " ").trim();

/** Exact merchant matches (confidence 0.95). Covers every merchant in src/lib/mock-data.ts. */
const MERCHANTS: Record<string, Category> = {
  "brightline studio": "Income",
  "parkline apartments": "Housing",
  "con edison": "Utilities",
  xfinity: "Utilities",
  "t mobile": "Utilities",
  "mta omny": "Transportation",
  uber: "Transportation",
  lyft: "Transportation",
  anthropic: "Productivity",
  netflix: "Entertainment",
  "disney+": "Entertainment",
  max: "Entertainment",
  spotify: "Entertainment",
  "youtube premium": "Entertainment",
  steam: "Entertainment",
  "amc theatres": "Entertainment",
  "alamo drafthouse": "Entertainment",
  mobbin: "Productivity",
  notion: "Productivity",
  figma: "Productivity",
  "1password": "Productivity",
  "apple icloud+": "Productivity",
  duolingo: "Productivity",
  adobe: "Productivity",
  "planet fitness": "Health & Fitness",
  "cvs pharmacy": "Health & Fitness",
  walgreens: "Health & Fitness",
  starbucks: "Dining",
  "blue bottle coffee": "Dining",
  "joe coffee": "Dining",
  sweetgreen: "Dining",
  chipotle: "Dining",
  dig: "Dining",
  "joe & the juice": "Dining",
  doordash: "Dining",
  "uber eats": "Dining",
  lilia: "Dining",
  "joe s pizza": "Dining",
  "xi an famous foods": "Dining",
  "los tacos no 1": "Dining",
  "trader joe s": "Groceries",
  "whole foods market": "Groceries",
  amazon: "Shopping",
  target: "Shopping",
  uniqlo: "Shopping",
  jetblue: "Travel",
  airbnb: "Travel",
  "ally savings": "Transfers",
  "paypal auto reload": "Transfers",
  "paypal offers": "Cashback",
};

/** Keyword fallbacks (confidence 0.6), checked in order against "merchant description". */
const KEYWORDS: Array<[RegExp, Category]> = [
  [/payroll|direct deposit|salary|paycheck/, "Income"],
  [/cash ?back|reward|offer/, "Cashback"],
  [/auto.?reload|transfer|savings|withdraw|bank/, "Transfers"],
  [/rent|lease|mortgage|apartment|landlord/, "Housing"],
  [/electric|gas bill|water|internet|wifi|mobile|wireless|phone|utility|comcast|verizon|at t/, "Utilities"],
  [/subway|metro|transit|bus|taxi|ride|uber|lyft|fuel|parking|toll|train|amtrak/, "Transportation"],
  [/grocer|supermarket|market|trader|whole foods|deli|bodega/, "Groceries"],
  [/coffee|cafe|restaurant|pizza|burger|taco|sushi|grill|diner|bar |bakery|lunch|dinner|delivery|food/, "Dining"],
  [/flight|airline|hotel|airbnb|resort|booking|travel|rental car/, "Travel"],
  [/gym|fitness|pharmacy|clinic|dental|doctor|health|yoga/, "Health & Fitness"],
  [/subscription|software|cloud|saas|app store|license|hosting|domain/, "Productivity"],
  [/movie|cinema|theat|concert|game|stream|music|tickets/, "Entertainment"],
  [/shop|store|order|retail|clothing|apparel|mall|purchase/, "Shopping"],
];

export interface RuleCategorization {
  category: Category;
  confidence: number;
}

export function categorizeByRules(t: { merchant: string; description?: string; amount?: number }): RuleCategorization {
  const merchant = norm(t.merchant ?? "");
  const exact = MERCHANTS[merchant];
  if (exact) return { category: exact, confidence: 0.95 };
  const haystack = ` ${merchant} ${norm(t.description ?? "")} `;
  for (const [re, category] of KEYWORDS) {
    if (re.test(haystack)) return { category, confidence: 0.6 };
  }
  return { category: (t.amount ?? -1) > 0 ? "Income" : "Shopping", confidence: 0.3 };
}

export interface RuleIntent {
  intent: Intent;
  confidence: number;
}

export function classifyIntentByRules(message: string): RuleIntent {
  const m = message.toLowerCase();
  if (/\b(cancel|unsubscribe|stop (my|the|paying)|end (my|the) (subscription|membership|plan))\b/.test(m)) return { intent: "cancel_subscription", confidence: 0.8 };
  if (/\b(offers?|cash ?back|coupons?|deals?|promo(tion)?s?)\b/.test(m)) return { intent: "apply_offer", confidence: 0.8 };
  if (/\bcategor/.test(m)) return { intent: "categorize", confidence: 0.8 };
  const statesFact = /\bi (earn|make)\b|\bmy (monthly |annual |net |take.home )?(salary|income|pay)\b|\bmy (savings )?goal\b|\bpay ?day\b/.test(m);
  if (/\bremember\b/.test(m) || (statesFact && !m.trim().endsWith("?"))) return { intent: "remember_fact", confidence: 0.75 };
  return { intent: "question", confidence: 0.5 };
}
