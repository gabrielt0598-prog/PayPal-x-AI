// Shared request/response types for the assistant. Type-only imports so the
// client bundle can import this file safely.

import type { GuardrailResult, MemoryFact } from "@/lib/services/contracts";

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
  | { type: "fact_remembered"; key: string; value: string }
  | { type: "fact_forgotten"; key: string }
  | {
      type: "transactions_recategorized";
      checked: number;
      changes: { id: string; merchant: string; from: string; to: string; confidence: number }[];
    };

export type GuardrailOutcome = "verified" | "corrected" | "blocked";

export interface AgentResponse {
  reply: string;
  actions: AgentAction[];
  guardrail: GuardrailResult & { retried: boolean; outcome: GuardrailOutcome };
  memory: MemoryFact[];
  mode: { llm: "live" | "mock"; model: string };
  /** Set when the live LLM failed and the rule-based agent answered instead. */
  warning?: string;
}
