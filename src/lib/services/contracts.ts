// Integration contracts. Each partner service implements one of these
// interfaces in its own file under src/lib/services/, with a real-API mode
// (when its env key is set) and a local fallback mode (when it isn't).
// The agent and API routes depend only on these interfaces.

import type { Category, RecurringPayment, Transaction } from "../types";

/** Which path served a call — surfaced in the UI so the demo is honest about mocks. */
export type ServiceMode = "live" | "mock";

// ---------- TypeSafe Jev: typed guardrails & decisions ----------

export interface CategorizeResult {
  category: Category;
  /** Calibrated probability from Jev, or 1/0.5 heuristics in mock mode. */
  confidence: number;
  mode: ServiceMode;
}

export type Intent =
  | "question"
  | "cancel_subscription"
  | "apply_offer"
  | "categorize"
  | "remember_fact"
  | "other";

export interface IntentResult {
  intent: Intent;
  confidence: number;
  mode: ServiceMode;
}

/** A piece of text the agent was allowed to rely on: a retrieved evidence document ("ev_3") or a tool result ("tool_2"). */
export interface SourceDoc {
  id: string;
  title?: string;
  text: string;
  /** Always available to every claim, cited or not (e.g. what the user typed themselves). */
  shared?: boolean;
}

export interface GuardrailInput {
  /** The agent's draft reply shown to the user. */
  reply: string;
  /** Every figure the agent was allowed to use: tool outputs + state snapshot + remembered facts, serialised. */
  groundTruth: string;
  /**
   * Citable sources (evidence documents + tool results). Claims citing `[ev_n]` / `[tool_n]` are checked against exactly those
   * sources; uncited claims are checked against all of them. When omitted, `groundTruth` is the single source.
   */
  sources?: SourceDoc[];
  /** Merchant / plan / category names; a claim naming one must find it in its sources (deterministic claim check). */
  entities?: string[];
}

/** One factual sentence of the reply and how well its cited evidence supports it. */
export interface ClaimCheck {
  text: string;
  /** Probability (0..1) that every figure, date, merchant and fact in the claim is supported by its evidence. */
  supported: number;
  /** Evidence / tool ids the claim cited, e.g. ["ev_3"]. */
  citations: string[];
  verdict: "supported" | "unsupported";
}

export interface GuardrailResult {
  verdict: "pass" | "block";
  /** Dollar amounts / percentages in the reply that do not appear in groundTruth. */
  unsupportedFigures: string[];
  /** Transaction ids in the reply that do not exist. */
  unknownTransactionIds: string[];
  /** Live mode: 1 - the lowest claim support probability (how likely the reply asserts something unsupported). */
  hallucinationProbability?: number;
  /** Claim-level citation check (additive). Empty when the reply made no factual claims. */
  claims: ClaimCheck[];
  /** The support threshold the claims were judged against (JEV_CLAIM_THRESHOLD). */
  claimThreshold: number;
  mode: ServiceMode;
}

export interface JevService {
  categorizeTransaction(t: Pick<Transaction, "merchant" | "description" | "amount">): Promise<CategorizeResult>;
  classifyIntent(message: string): Promise<IntentResult>;
  verifyReply(input: GuardrailInput): Promise<GuardrailResult>;
}

// ---------- Memory: persistent agent facts (local store) ----------

export interface MemoryFact {
  key: string; // "monthly_salary", "savings_goal"
  value: string;
  /** Who set it: the user typed it in chat, or it was inferred and confirmed. */
  source: "user" | "agent";
  updatedAt: string;
}

export interface MemoryService {
  list(sessionId: string): Promise<MemoryFact[]>;
  remember(sessionId: string, key: string, value: string, source?: MemoryFact["source"]): Promise<MemoryFact>;
  forget(sessionId: string, key: string): Promise<boolean>;
}

// ---------- Kernel: cloud browser actions on merchant sites ----------

export interface BrowserCancellationResult {
  /**
   * "awaiting_confirmation": the browser reached the merchant's final cancel step and stopped BEFORE the
   * irreversible click (human-in-the-loop). The user finishes it via liveViewUrl.
   */
  status: "completed" | "simulated" | "needs_login" | "failed" | "awaiting_confirmation";
  /** Kernel live-view URL so the user can watch / take over the browser session. */
  liveViewUrl?: string;
  /** Human-readable step log, e.g. ["Opened cinebox.com/account", "Clicked Cancel Membership"]. */
  steps: string[];
  mode: ServiceMode;
  /** Page the browser ended on (live mode). */
  finalUrl?: string;
  /** Short human-readable explanation when status is failed / needs_login / awaiting_confirmation. */
  message?: string;
  /** Kernel replay (video) URL of the cancellation run (live mode). */
  replayUrl?: string;
  /** Small JPEG of the merchant's "cancelled" page, as a data: URL. */
  screenshotDataUrl?: string;
  /** Confirmation number shown by the merchant's "cancelled" page. */
  confirmationNumber?: string;
  /** Page showing the end state: the sandbox merchant page (local path, or PUBLIC_BASE_URL absolute URL). */
  previewUrl?: string;
  /** What the browser acted on: the fake sandbox merchant (default) or the real merchant site. */
  target?: "sandbox" | "real";
}

export interface KernelService {
  cancelOnMerchantSite(sub: RecurringPayment): Promise<BrowserCancellationResult>;
}

// ---------- Zapier: background notifications ----------

export interface LowBalanceAlert {
  userId: string;
  userName: string;
  balance: number;
  threshold: number;
  reloadAmount: number;
  fundingSource: string;
  triggeredBy?: { merchant: string; amount: number; transactionId: string };
  occurredAt: string;
}

export interface ZapierResult {
  delivered: boolean;
  mode: ServiceMode;
  status?: number;
  error?: string;
  /** True when an identical alert was already delivered within the dedupe window and this call was skipped. */
  deduped?: boolean;
}

export interface ZapierService {
  sendLowBalanceAlert(alert: LowBalanceAlert): Promise<ZapierResult>;
}

// ---------- PayPal (APIMatic SDK): source of truth for money ----------

export interface PayPalService {
  mode(): ServiceMode;
  listTransactions(range?: { from?: string; to?: string }): Promise<Transaction[]>;
  /** `mode` is "mock" whenever the live call failed and the store balance was used instead. */
  getBalance(): Promise<{ balance: number; mode: ServiceMode }>;
  listRecurring(): Promise<RecurringPayment[]>;
  /** Cancels a PayPal-billed subscription via the Subscriptions API (mock: updates the store). */
  cancelSubscription(
    recurringId: string,
    reason: string,
  ): Promise<{
    ok: boolean;
    error?: string;
    /** Where the cancellation actually happened: PayPal's API, or only the local demo store. */
    channel?: "paypal_api" | "local_store";
    note?: string;
  }>;
  /**
   * Orders API: creates a CAPTURE order for `amount` USD. Live mode returns the PayPal approval link the payer must
   * open (status PAYER_ACTION_REQUIRED); mock mode returns a simulated order that needs no approval.
   */
  createOrder(input: CreateOrderInput): Promise<OrderResult>;
  /** Orders API: captures an approved order (mock: returns a simulated capture). */
  captureOrder(orderId: string): Promise<CaptureResult>;
}

export interface CreateOrderInput {
  amount: number;
  description: string;
  /** Where PayPal sends the payer after approving / cancelling. */
  returnUrl: string;
  cancelUrl: string;
}
export interface OrderResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  status?: string;
  /** PayPal approval link (live only). */
  approveUrl?: string;
  channel: "paypal_api" | "simulated";
}
export interface CaptureResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  captureId?: string;
  status?: string;
  amount?: number;
  channel: "paypal_api" | "simulated";
}
