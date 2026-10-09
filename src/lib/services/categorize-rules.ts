// Deterministic merchant/keyword categoriser and intent rules. Used as the Jev mock mode and as the
// synchronous fallback wherever a model call is not worth it (e.g. mapping PayPal Sandbox transactions).

import type { Category } from "../types";
import type { Intent } from "./contracts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+& ]+/g, " ").replace(/\s+/g, " ").trim();

/** Exact merchant matches (confidence 0.95). Covers every merchant in src/lib/mock-data.ts. */
const MERCHANTS: Record<string, Category> = {
  "acme inc payroll": "Income",
  "parkside apartments": "Essential bills",
  "pg&e": "Essential bills",
  "pg e": "Essential bills",
  recology: "Essential bills",
  anthropic: "Subscriptions",
  netflix: "Subscriptions",
  "disney+": "Subscriptions",
  max: "Subscriptions",
  spotify: "Subscriptions",
  "youtube premium": "Subscriptions",
  figma: "Subscriptions",
  duolingo: "Subscriptions",
  adobe: "Subscriptions",
  "planet fitness": "Subscriptions",
  uber: "Transport",
  lyft: "Transport",
  clipper: "Transport",
  starbucks: "Dining",
  "blue bottle coffee": "Dining",
  "philz coffee": "Dining",
  sweetgreen: "Dining",
  "tartine bakery": "Dining",
  souvla: "Dining",
  "joe s pizza": "Dining",
  lilia: "Dining",
  doordash: "Dining",
  "whole foods": "Groceries",
  "trader joe s": "Groceries",
  safeway: "Groceries",
  "bi rite market": "Groceries",
  amazon: "Shopping",
  target: "Shopping",
  uniqlo: "Shopping",
  muji: "Shopping",
  "best buy": "Shopping",
  sephora: "Shopping",
  rei: "Shopping",
  everlane: "Shopping",
  "cvs pharmacy": "Other",
  walgreens: "Other",
  "amc theatres": "Other",
  "barnes & noble": "Other",
  "paypal offers": "Cashback",
  "paypal rewards": "Cashback",
};

/** Keyword fallbacks (confidence 0.6), checked in order against "merchant description". */
const KEYWORDS: Array<[RegExp, Category]> = [
  [/payroll|direct deposit|salary|paycheck/, "Income"],
  [/cash ?back|reward|offer/, "Cashback"],
  [/auto.?reload|transfer|savings|withdraw|bank/, "Transfers"],
  [/rent|lease|mortgage|apartment|landlord|electric|gas bill|water|trash|recycling|internet|utility/, "Essential bills"],
  [/subscription|membership|premium|monthly|software|cloud|streaming|music|gym|fitness/, "Subscriptions"],
  [/subway|metro|transit|bus|taxi|ride|uber|lyft|clipper|bart|muni|fuel|parking|toll|train/, "Transport"],
  [/grocer|supermarket|market|trader|whole foods|deli|bodega/, "Groceries"],
  [/coffee|cafe|restaurant|pizza|burger|taco|sushi|grill|diner|bar |bakery|lunch|dinner|delivery|food|blue bottle/, "Dining"],
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
