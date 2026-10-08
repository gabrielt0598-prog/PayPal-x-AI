// TypeSafe Jev integration: typed, calibrated decisions and the anti-hallucination guardrail.
//
// Jev is TypeSafe AI's non-generative "System One" model. We send `state` plus typed `questions`
// (`choice`, `score`, `noul` = yes/no probability) and get calibrated typed answers back:
//   client.systemOne({ state, questions }) -> { answers: { name: { choice, confidence, probabilities } | { noul } } }
// (@typesafe-ai/sdk 0.6.0, see node_modules/@typesafe-ai/sdk/dist/index.d.mts)
//
// The live docs (docs.typesafe.ai) were not reachable when this was written, so every API detail here comes from the
// installed SDK types (node_modules/@typesafe-ai/sdk/dist/index.d.mts): choice() -> {choice, confidence, probabilities},
// score() -> {score (expected value over the rubric levels), confidence, probabilities}, noul() -> {noul: P(yes)}.
// Re-check thresholds / state shapes against the docs for newer SDK versions.
//
// Jev is used for three narrow judgments per turn (one systemOne call each, questions run in parallel):
//   1. jevRankEvidence: one `score` per candidate evidence doc (rerank) + one speculative `choice` for the intent.
//   2. verifyReply:     one `noul` per factual claim ("is it fully supported by its cited evidence?").
//   Everything else (figures, dates, retrieval, thresholds, rebuilding the reply) stays in code.
//
// live  = TYPESAFE_API_KEY present  -> real Jev calls
// mock  = no key (or Jev unreachable) -> deterministic rules in categorize-rules.ts / guardrail.ts
//
// SERVER ONLY. The guardrail's deterministic check ALWAYS runs first, in both modes, so invented figures
// are blocked even if Jev is down.

import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { CATEGORIES, type Category } from "../types";
import type {
  CategorizeResult,
  ClaimCheck,
  GuardrailInput,
  GuardrailResult,
  Intent,
  IntentResult,
  JevService,
  ServiceMode,
  SourceDoc,
} from "./contracts";
import { categorizeByRules, classifyIntentByRules } from "./categorize-rules";
import { checkClaimAgainstSources, checkReplyAgainstGroundTruth, segmentReply, sourceText } from "./guardrail";

export { extractFigures, extractTransactionIds, checkReplyAgainstGroundTruth } from "./guardrail";

const MAX_JEV_CLAIMS = 12;
const MAX_CLAIM_EVIDENCE_CHARS = 6_000;

export const INTENTS: Intent[] = ["question", "cancel_subscription", "apply_offer", "categorize", "remember_fact", "other"];
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

/** A claim is "unsupported" when Jev's P(fully supported by its cited evidence) is below this. Default 0.6. */
export function claimThreshold(): number {
  const raw = process.env.JEV_CLAIM_THRESHOLD?.trim();
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.6;
}

export function client(): TypeSafeClient | null {
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

export const INTENT_HINTS: Record<Intent, string> = {
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

  async verifyReply(input: GuardrailInput): Promise<GuardrailResult> {
    const threshold = claimThreshold();
    const sources: SourceDoc[] = input.sources?.length ? input.sources : [{ id: "ground_truth", text: input.groundTruth.slice(0, MAX_STATE_CHARS) }];
    const entities = input.entities ?? [];

    // 1. Deterministic figure / id check over the whole reply: always, both modes. Blocks invented numbers even if Jev is down.
    const det = checkReplyAgainstGroundTruth(input.reply, input.groundTruth + "\n" + sources.map((x) => x.text).join("\n"));
    const badTokens = [...det.unsupportedFigures, ...det.unknownTransactionIds];

    // 2. Split into factual claims in code and resolve the evidence each one cites.
    const prepared = segmentReply(input.reply)
      .filter((seg) => seg.isClaim)
      .map((seg) => {
        const cited = sources.filter((x) => seg.citations.includes(x.id));
        const shared = sources.filter((x) => x.shared && !cited.includes(x));
        const pool = cited.length ? [...cited, ...shared] : sources;
        const unresolved = seg.citations.length > 0 && cited.length === 0; // cites an id that does not exist
        const strict = checkClaimAgainstSources(seg.text, sourceText(pool), entities);
        const globallyBad = badTokens.some((t) => seg.text.includes(t));
        return { seg, pool, unresolved, strictOk: strict.ok && !unresolved, globallyBad };
      });

    // 3. Mock fallback: deterministic support (1 or 0). Live: one noul per claim, all in ONE parallel systemOne call.
    let supported: number[] = prepared.map((p) => (p.strictOk && !p.globallyBad ? 1 : 0));
    let mode: ServiceMode = "mock";
    let hallucinationProbability: number | undefined;

    const c = client();
    const toJudge = prepared.map((p, i) => ({ p, i })).filter(({ p }) => !p.unresolved && !p.globallyBad).slice(0, MAX_JEV_CLAIMS);
    if (c && toJudge.length) {
      try {
        const claimsState: Record<string, { claim: string; evidence: { id: string; title?: string; text: string }[] }> = {};
        const questions: Record<string, ReturnType<typeof noul>> = {};
        toJudge.forEach(({ p }, k) => {
          let budget = MAX_CLAIM_EVIDENCE_CHARS;
          const evidence: { id: string; title?: string; text: string }[] = [];
          for (const d of p.pool) {
            if (budget <= 0) break;
            const text = d.text.slice(0, budget);
            budget -= text.length;
            evidence.push({ id: d.id, ...(d.title ? { title: d.title } : {}), text });
          }
          claimsState[`c${k}`] = { claim: p.seg.text, evidence };
          questions[`c${k}`] = noul(
            `Is every figure, date, merchant, transaction and fact stated in \`claims.c${k}.claim\` directly supported by the documents in \`claims.c${k}.evidence\`? Arithmetic (sums, differences, percentages, averages) is only supported if the result itself already appears in the evidence.`,
            {
              true: "Every figure, date, merchant, transaction and fact in the claim appears in, or is directly stated by, the evidence",
              false: "The claim states at least one figure, date, merchant, transaction or fact that the evidence does not contain, contradicts, or that would need unstated calculation or outside knowledge",
            },
          );
        });
        const res = await c.systemOne({ state: { claims: claimsState }, questions });
        supported = supported.slice();
        toJudge.forEach(({ i }, k) => {
          const a = res.answers[`c${k}`];
          if (a && a.type === "noul") supported[i] = a.noul;
        });
        mode = "live";
        hallucinationProbability = round3(1 - Math.min(...supported, 1));
      } catch (err) {
        console.error("[jev] verifyReply claim check failed, deterministic only:", errMsg(err));
      }
    }

    const claims: ClaimCheck[] = prepared.map((p, i) => {
      const prob = round3(supported[i]);
      return { text: p.seg.text, supported: prob, citations: p.seg.citations, verdict: prob < threshold ? "unsupported" : "supported" };
    });
    const block = badTokens.length > 0 || claims.some((cl) => cl.verdict === "unsupported");

    return {
      verdict: block ? "block" : "pass",
      unsupportedFigures: det.unsupportedFigures,
      unknownTransactionIds: det.unknownTransactionIds,
      ...(hallucinationProbability !== undefined ? { hallucinationProbability } : {}),
      claims,
      claimThreshold: threshold,
      mode,
    };
  },
};

// ---------- Evidence reranking (RAG) ----------

export interface RankCandidate {
  /** Stable key used for the question name, e.g. "c3". */
  key: string;
  kind: string;
  title: string;
  text: string;
}

const RELEVANCE_RUBRIC = [
  "Irrelevant: the document is about a different merchant, category, period or topic than the question",
  "Related background: same general area as the question, but it would not change the answer",
  "Partially answers: contains some of the facts needed (right merchant/category or right period, not both, or only part of what is asked)",
  "Directly needed: contains the exact facts (merchant/category and period) a correct answer must state",
] as const;

/**
 * Rerank code-prefiltered evidence candidates with Jev: one `score` question per candidate plus ONE speculative `choice`
 * for the user's intent, all in a single parallel systemOne call (skill: "ask independent questions together").
 * Returns null when Jev is unavailable so the caller can fall back to deterministic lexical scoring.
 */
export async function jevRankEvidence(
  question: string,
  candidates: RankCandidate[],
  today: string,
): Promise<{ scores: Record<string, number>; intent?: IntentResult } | null> {
  const c = client();
  if (!c || candidates.length === 0) return null;
  try {
    const state = {
      today,
      user_question: question.slice(0, 1_000),
      candidates: Object.fromEntries(candidates.map((x) => [x.key, { kind: x.kind, title: x.title, text: x.text }])),
    };
    const questions: Record<string, ReturnType<typeof score> | ReturnType<typeof choice>> = {
      intent: choice(
        "What does the user want from their personal-finance assistant?",
        Object.fromEntries(INTENTS.map((k) => [k, INTENT_HINTS[k]])),
      ),
    };
    for (const x of candidates) {
      questions[x.key] = score(
        `How useful is the evidence document \`candidates.${x.key}\` for answering \`user_question\`? Consider its merchant or category and its period relative to \`today\`.`,
        RELEVANCE_RUBRIC,
      );
    }
    const res = await c.systemOne({ state, questions });
    const scores: Record<string, number> = {};
    for (const x of candidates) {
      const a = res.answers[x.key];
      if (a && a.type === "score") scores[x.key] = a.score;
    }
    let intent: IntentResult | undefined;
    const ia = res.answers.intent;
    if (ia && ia.type === "choice" && (INTENTS as string[]).includes(ia.choice)) {
      const p = (ia.probabilities as Record<string, number>)[ia.choice];
      intent = { intent: ia.choice as Intent, confidence: round3(p ?? ia.confidence), mode: "live" };
    }
    return { scores, intent };
  } catch (err) {
    console.error("[jev] evidence ranking failed, using lexical scoring:", errMsg(err));
    return null;
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
