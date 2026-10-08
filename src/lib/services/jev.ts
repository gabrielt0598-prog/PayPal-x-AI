// TypeSafe Jev integration: typed, calibrated decisions and the anti-hallucination guardrail.
//
// Jev is TypeSafe AI's non-generative "System One" model. We send `state` plus typed `questions`
// (`choice`, `score`, `noul` = yes/no probability) and get calibrated typed answers back:
//   client.systemOne({ state, questions }) -> { answers: { name: { choice, confidence, probabilities } | { noul } } }
// (@typesafe-ai/sdk 0.6.0, see node_modules/@typesafe-ai/sdk/dist/index.d.mts)
//
// live  = TYPESAFE_API_KEY present  -> real Jev calls
// mock  = no key (or Jev unreachable) -> deterministic rules in categorize-rules.ts / guardrail.ts
//
// SERVER ONLY. The guardrail's deterministic check ALWAYS runs first, in both modes, so invented figures
// are blocked even if Jev is down.

import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { CATEGORIES, type Category } from "../types";
import type { CategorizeResult, GuardrailInput, GuardrailResult, Intent, IntentResult, JevService, ServiceMode } from "./contracts";
import { categorizeByRules, classifyIntentByRules } from "./categorize-rules";
import { checkReplyAgainstGroundTruth } from "./guardrail";

export { extractFigures, extractTransactionIds, checkReplyAgainstGroundTruth } from "./guardrail";

const INTENTS: Intent[] = ["question", "cancel_subscription", "apply_offer", "categorize", "remember_fact", "other"];
const JEV_TIMEOUT_MS = 8_000;
const MAX_STATE_CHARS = 24_000;

const g = globalThis as typeof globalThis & { __jevClient?: TypeSafeClient | null };

export function jevMode(): ServiceMode {
  return process.env.TYPESAFE_API_KEY?.trim() ? "live" : "mock";
}

export function hallucinationThreshold(): number {
  const n = Number(process.env.JEV_HALLUCINATION_THRESHOLD);
  return Number.isFinite(n) && n >= 0 && n <= 1 && process.env.JEV_HALLUCINATION_THRESHOLD?.trim() ? n : 0.3;
}

function client(): TypeSafeClient | null {
  if (jevMode() === "mock") return null;
  if (g.__jevClient === undefined) {
    try {
      g.__jevClient = new TypeSafeClient({ timeout: JEV_TIMEOUT_MS, retry: { maxRetries: 1 } });
    } catch (err) {
      console.error("[jev] could not create TypeSafe client:", errMsg(err));
      g.__jevClient = null;
    }
  }
  return g.__jevClient ?? null;
}

function errMsg(err: unknown): string {
  // Never log request bodies / headers: only the error class and message.
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

const CATEGORY_HINTS: Record<Category, string> = {
  Income: "Money in from an employer or payroll",
  Housing: "Rent or mortgage",
  Utilities: "Electric, gas, internet, phone bills",
  Transportation: "Transit, rideshare, fuel, parking",
  Groceries: "Supermarkets and grocery stores",
  Dining: "Restaurants, cafes, coffee, food delivery",
  Shopping: "Retail, online shopping, clothing, home goods",
  Entertainment: "Streaming, music, games, movies, events",
  Productivity: "Software and app subscriptions, cloud storage, learning tools",
  "Health & Fitness": "Gym, pharmacy, medical",
  Travel: "Flights, hotels, lodging",
  Transfers: "Moving money between own accounts: savings, auto-reload, bank transfers",
  Cashback: "Rewards and cash back credited by PayPal Offers",
};

const INTENT_HINTS: Record<Intent, string> = {
  question: "The user asks about their balance, spending, subscriptions or transactions",
  cancel_subscription: "The user wants to cancel or stop a subscription or recurring payment",
  apply_offer: "The user wants to use, apply or ask about a PayPal offer, cashback or coupon",
  categorize: "The user wants a transaction categorised or recategorised",
  remember_fact: "The user states a personal fact to remember: salary, savings goal, pay day",
  other: "Anything else: greetings, small talk, off-topic",
};

export const jev: JevService = {
  async categorizeTransaction(t): Promise<CategorizeResult> {
    const c = client();
    if (c) {
      try {
        const res = await c.systemOne({
          state: { merchant: t.merchant, description: t.description, amount_usd: t.amount, direction: t.amount >= 0 ? "money in" : "money out" },
          questions: {
            category: choice(
              "Which spending category does this PayPal transaction belong to?",
              Object.fromEntries(CATEGORIES.map((k) => [k, CATEGORY_HINTS[k]])),
            ),
          },
        });
        const a = res.answers.category;
        if ((CATEGORIES as readonly string[]).includes(a.choice)) {
          const p = (a.probabilities as Record<string, number>)[a.choice];
          return { category: a.choice as Category, confidence: round3(p ?? a.confidence), mode: "live" };
        }
      } catch (err) {
        console.error("[jev] categorize failed, using rules:", errMsg(err));
      }
    }
    return { ...categorizeByRules(t), mode: "mock" };
  },

  async classifyIntent(message): Promise<IntentResult> {
    const c = client();
    if (c) {
      try {
        const res = await c.systemOne({
          state: { user_message: message.slice(0, 2_000) },
          questions: {
            intent: choice(
              "What does the user want from their personal-finance assistant?",
              Object.fromEntries(INTENTS.map((k) => [k, INTENT_HINTS[k]])),
            ),
          },
        });
        const a = res.answers.intent;
        if ((INTENTS as string[]).includes(a.choice)) {
          const p = (a.probabilities as Record<string, number>)[a.choice];
          return { intent: a.choice as Intent, confidence: round3(p ?? a.confidence), mode: "live" };
        }
      } catch (err) {
        console.error("[jev] classifyIntent failed, using rules:", errMsg(err));
      }
    }
    return { ...classifyIntentByRules(message), mode: "mock" };
  },

  async verifyReply({ reply, groundTruth }: GuardrailInput): Promise<GuardrailResult> {
    // 1. Deterministic check — always, both modes.
    const det = checkReplyAgainstGroundTruth(reply, groundTruth);
    let mode: ServiceMode = "mock";
    let hallucinationProbability: number | undefined;

    // 2. Jev probability check (live only). A Jev outage degrades to deterministic-only.
    const c = client();
    if (c) {
      try {
        const res = await c.systemOne({
          state: { reply: reply.slice(0, MAX_STATE_CHARS / 4), ground_truth: groundTruth.slice(0, MAX_STATE_CHARS) },
          questions: {
            unsupported: noul(
              "Does the reply state any figure, date, merchant or transaction that is not supported by the ground truth?",
              {
                true: "The reply contains at least one figure, date, merchant or transaction that cannot be found in or derived from the ground truth",
                false: "Every figure, date, merchant and transaction in the reply is supported by the ground truth",
              },
            ),
          },
        });
        hallucinationProbability = round3(res.answers.unsupported.noul);
        mode = "live";
      } catch (err) {
        console.error("[jev] verifyReply probability check failed, deterministic only:", errMsg(err));
      }
    }

    const block =
      det.unsupportedFigures.length > 0 ||
      det.unknownTransactionIds.length > 0 ||
      (hallucinationProbability !== undefined && hallucinationProbability > hallucinationThreshold());

    return {
      verdict: block ? "block" : "pass",
      unsupportedFigures: det.unsupportedFigures,
      unknownTransactionIds: det.unknownTransactionIds,
      ...(hallucinationProbability !== undefined ? { hallucinationProbability } : {}),
      mode,
    };
  },
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
