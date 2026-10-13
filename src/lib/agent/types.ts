// Shared request/response types for the assistant. Type-only imports so the
// client bundle can import this file safely.

import type { ClaimCheck, GuardrailResult, IntentResult, MemoryFact } from "@/lib/services/contracts";
import type { EvidenceDoc, RankedCandidate } from "@/lib/services/evidence";

export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AgentRequest {
  sessionId: string;
  messages: ChatMessage[];
}

type Mode = "live" | "mock";

/** One completed step of a multi-step result, rendered as a rail row (avatar + connector, title/subtitle left, status right). */
export interface RailStep {
  title: string;
  /** Supports **bold** segments; put dates here. */
  sub?: string;
  /** Right-hand status, e.g. "Done", "Submitted", "Ordered". */
  status: string;
}

/** "Now vs What if" comparison table. Every string comes from the what_if tool result. */
export interface CompareTable {
  colA: string;
  colB: string;
  rows: { label: string; now: string; whatIf: string; delta?: string; tone?: "pos" | "neg" }[];
}

export type AgentAction =
  | {
      type: "cancellation_preview";
      recurringId: string;
      merchant: string;
      plan: string;
      monthlySaving: number;
      annualSaving: number;
      monthlySavingLabel: string;
      annualSavingLabel: string;
      channel: "paypal_subscriptions_api" | "kernel_browser";
    }
  | {
      type: "subscription_cancelled";
      recurringId: string;
      merchant: string;
      plan: string;
      monthlySaving: number;
      annualSaving: number;
      monthlySavingLabel: string;
      annualSavingLabel: string;
      channel: "paypal_subscriptions_api" | "kernel_browser";
      mode: Mode;
      liveViewUrl?: string;
      steps?: string[];
      /** Kernel replay (video) of the cancellation run. */
      replayUrl?: string;
      /** JPEG data: URL of the merchant's "cancelled" page. */
      screenshotDataUrl?: string;
      confirmationNumber?: string;
      /** Sandbox merchant page showing the end state. */
      previewUrl?: string;
      target?: "sandbox" | "real";
    }
  | {
      type: "offer_applied";
      offerId: string;
      merchant: string;
      title: string;
      cashback: number;
      cashbackLabel: string;
      transactionId: string;
      creditTransactionId: string;
      newBalanceLabel: string;
    }
  | { type: "steps_completed"; steps: RailStep[] }
  | { type: "what_if_compare"; title: string; compare: CompareTable }
  | { type: "fact_remembered"; key: string; value: string }
  | { type: "fact_forgotten"; key: string }
  | {
      type: "transactions_recategorized";
      checked: number;
      changes: { id: string; merchant: string; from: string; to: string; confidence: number }[];
    };

export interface ToolEvidence {
  id: string; // "tool_2"
  tool: string;
  summary: string;
}

export type GuardrailOutcome = "verified" | "corrected" | "blocked";

export interface AgentResponse {
  reply: string;
  actions: AgentAction[];
  guardrail: GuardrailResult & {
    retried: boolean;
    outcome: GuardrailOutcome;
    /** Claims Jev found unsupported that were dropped from the reply (outcome "corrected"/"blocked"). */
    removedClaims?: ClaimCheck[];
  };
  /** Retrieved + Jev-reranked evidence documents; the reply cites them as [ev_n]. */
  evidence: EvidenceDoc[];
  /** Tool results of this turn; the reply cites them as [tool_n]. */
  toolResults: ToolEvidence[];
  retrieval: { mode: "live" | "mock"; intent?: IntentResult; ranking: RankedCandidate[]; candidates: { built: number; prefiltered: number } };
  memory: MemoryFact[];
  mode: { llm: "live" | "mock"; model: string };
  /** Set when the live LLM failed and the rule-based agent answered instead. */
  warning?: string;
}
