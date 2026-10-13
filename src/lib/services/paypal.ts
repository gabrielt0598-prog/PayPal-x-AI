// PayPal service: the APIMatic SDK seam.
//
// `@paypal/paypal-server-sdk` (v2.5.0) is APIMatic-generated. This file is the single place where that SDK is
// used; everything else in the app talks to the PayPalService contract. Two modes:
//
//   live = PAYPAL_USE_MOCK === "false" AND PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET set
//          Client({ environment, clientCredentialsAuthCredentials }) + controllers instantiated here:
//            TransactionSearchController.searchTransactions  -> listTransactions
//            TransactionSearchController.searchBalances      -> getBalance
//            SubscriptionsController.listSubscriptions       -> listRecurring
//            SubscriptionsController.cancelSubscription      -> cancelSubscription
//            OrdersController.createOrder / captureOrder     -> createOrder / captureOrder (Essentials checkout, PayPal AI)
//   mock = delegate to the in-memory store (src/lib/store.ts), seeded from src/lib/mock-data.ts.
//
// Every live call is wrapped: SDK errors (ApiError etc.) are logged without secrets and the call degrades to the
// store, or returns { ok: false, error }, never throwing raw SDK errors to callers.
//
// ---- Transaction mapping (PayPal TransactionDetails -> our Transaction), best effort ----
//   id            "txn_" + transactionInfo.transactionId
//   date          transactionInfo.transactionInitiationDate
//   amount        Number(transactionInfo.transactionAmount.value)   (PayPal already signs it: negative = money out)
//   merchant      payerInfo.payerName.alternateFullName | fullName | emailAddress | transactionSubject | "PayPal"
//   description   transactionSubject | transactionNote | cartInfo.itemDetails[0].itemName | transactionEventCode
//   category      categorizeByRules(merchant, description, amount)  (sync rules; the agent can re-run Jev)
//   method        eventCode T03xx/T04xx or bank/ACH instrument -> bank_transfer; instrumentType card -> paypal_debit_card;
//                 else paypal_balance
//   status        transactionStatus "S" -> completed, "P"/"V" -> pending, "D"/"F" (denied/failed) are dropped
//   balanceAfter  transactionInfo.endingBalance.value (falls back to availableBalance, then 0)
// Sandbox note: PayPal Transaction Search allows a max 31-day window per call and only returns USD
// balance-affecting records by default; ranges longer than 31 days are fetched window by window.

import {
  ApiError,
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  SubscriptionsController,
  TransactionSearchController,
} from "@paypal/paypal-server-sdk";
import type { Subscription, TransactionDetails } from "@paypal/paypal-server-sdk";
import { inRange } from "../finance";
import { cancelRecurring, getState } from "../store";
import type { BillingCycle, PaymentMethod, RecurringPayment, Transaction } from "../types";
import type { PayPalService, ServiceMode } from "./contracts";
import { categorizeByRules } from "./categorize-rules";

const DAY = 86_400_000;
const WINDOW_DAYS = 31;

/** PAYPAL_CLIENT_SECRET, or PAYPAL_SECRET as used by PayPal's hackathon boilerplate. */
function clientSecret() {
  return (process.env.PAYPAL_CLIENT_SECRET ?? process.env.PAYPAL_SECRET)?.trim() || undefined;
}
const MAX_WINDOWS = 6;
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

const g = globalThis as typeof globalThis & { __paypalClient?: Client };

export function paypalMode(): ServiceMode {
  const hasCreds = Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && clientSecret());
  return process.env.PAYPAL_USE_MOCK?.trim().toLowerCase() === "false" && hasCreds ? "live" : "mock";
}

/** Lazy singleton APIMatic client (OAuth2 client-credentials; the SDK fetches and refreshes tokens itself). */
function sdk(): Client {
  g.__paypalClient ??= new Client({
    timeout: 20_000, // ms per attempt; the generated default is 0 (no timeout)
    // Generated retry defaults disable retrying (maxNumberOfRetries 0, maximumRetryWaitTime 0). Retry the
    // read-only GETs (Transaction Search, listSubscriptions) on 408/429/5xx; POST cancel stays unretried.
    httpClientOptions: { retryConfig: { maxNumberOfRetries: 2, maximumRetryWaitTime: 10 } },
    environment: process.env.PAYPAL_ENVIRONMENT?.trim().toLowerCase() === "production" ? Environment.Production : Environment.Sandbox,
    clientCredentialsAuthCredentials: {
      oAuthClientId: process.env.PAYPAL_CLIENT_ID!.trim(),
      oAuthClientSecret: clientSecret()!,
    },
  });
  return g.__paypalClient;
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    const r = err.result as { message?: string; name?: string; error_description?: string } | undefined;
    return `PayPal API ${err.statusCode}${r?.message ? `: ${r.message}` : r?.name ? `: ${r.name}` : r?.error_description ? `: ${r.error_description}` : ""}`;
  }
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const money = (m?: { value: string }) => (m?.value !== undefined && m.value !== "" ? Number(m.value) : NaN);

function mapMethod(d: TransactionDetails): PaymentMethod {
  const info = d.transactionInfo;
  const code = info?.transactionEventCode ?? "";
  const instrument = `${info?.instrumentType ?? ""} ${info?.instrumentSubType ?? ""} ${info?.paymentMethodType ?? ""}`.toLowerCase();
  if (/^T03|^T04/.test(code) || /bank|ach/.test(instrument)) return "bank_transfer"; // T03xx bank funding, T04xx withdrawals
  if (/card|debit|mastercard|visa/.test(instrument)) return "paypal_debit_card";
  return "paypal_balance";
}

export function mapTransaction(d: TransactionDetails): Transaction | null {
  const info = d.transactionInfo;
  const amount = money(info?.transactionAmount);
  if (!info?.transactionId || !Number.isFinite(amount)) return null;
  const status = (info.transactionStatus ?? "S").toUpperCase();
  if (status === "D" || status === "F") return null; // denied / partially refunded-or-failed: not money movement
  const payer = d.payerInfo;
  const merchant =
    payer?.payerName?.alternateFullName || payer?.payerName?.fullName || payer?.emailAddress || info.transactionSubject || "PayPal";
  const description = info.transactionSubject || info.transactionNote || d.cartInfo?.itemDetails?.[0]?.itemName || info.transactionEventCode || "PayPal transaction";
  const ending = money(info.endingBalance);
  const available = money(info.availableBalance);
  return {
    id: `txn_${info.transactionId}`,
    date: info.transactionInitiationDate ?? new Date().toISOString(),
    merchant,
    description,
    amount,
    category: categorizeByRules({ merchant, description, amount }).category,
    method: mapMethod(d),
    status: status === "S" ? "completed" : "pending",
    balanceAfter: Number.isFinite(ending) ? ending : Number.isFinite(available) ? available : 0,
  };
}

const CYCLE_BY_UNIT: Record<string, BillingCycle> = { DAY: "weekly", WEEK: "weekly", MONTH: "monthly", YEAR: "yearly" };

export function mapSubscription(s: Subscription): RecurringPayment | null {
  if (!s.id) return null;
  const regular = s.plan?.billingCycles?.find((c) => c.tenureType === "REGULAR") ?? s.plan?.billingCycles?.[0];
  const status = s.status === "CANCELLED" || s.status === "EXPIRED" ? "cancelled" : s.status === "SUSPENDED" ? "paused" : "active";
  const amount = money(s.billingInfo?.lastPayment?.amount);
  const merchant = s.plan?.name ?? s.customId ?? "PayPal subscription";
  const next = s.billingInfo?.nextBillingTime ?? s.startTime ?? new Date().toISOString();
  return {
    id: s.id,
    merchant,
    plan: s.plan?.description ?? s.planId ?? "PayPal plan",
    kind: "subscription",
    category: categorizeByRules({ merchant, description: s.plan?.description }).category,
    amount: Number.isFinite(amount) ? amount : 0,
    cycle: CYCLE_BY_UNIT[regular?.frequency.intervalUnit ?? "MONTH"] ?? "monthly",
    nextChargeDate: next.slice(0, 10),
    status,
    ...(s.statusUpdateTime && status === "cancelled" ? { cancelledAt: s.statusUpdateTime } : {}),
    cancellable: status === "active",
    cancelChannel: "paypal_subscriptions_api",
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

function storeTransactions(range?: { from?: string; to?: string }) {
  return getState().transactions.filter((t) => inRange(t, range?.from, range?.to));
}

async function liveTransactions(range?: { from?: string; to?: string }): Promise<Transaction[]> {
  const search = new TransactionSearchController(sdk());
  const end = range?.to ? new Date(`${range.to}T23:59:59Z`) : new Date();
  const start = range?.from ? new Date(`${range.from}T00:00:00Z`) : new Date(end.getTime() - 30 * DAY);
  const out = new Map<string, Transaction>();
  let windowEnd = end.getTime();
  for (let w = 0; w < MAX_WINDOWS && windowEnd > start.getTime(); w++) {
    const windowStart = Math.max(start.getTime(), windowEnd - WINDOW_DAYS * DAY);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { result } = await search.searchTransactions({
        startDate: new Date(windowStart).toISOString(),
        endDate: new Date(windowEnd).toISOString(),
        fields: "all",
        pageSize: PAGE_SIZE,
        page,
      });
      for (const d of result.transactionDetails ?? []) {
        const t = mapTransaction(d);
        if (t) out.set(t.id, t);
      }
      if (page >= (result.totalPages ?? 1)) break;
    }
    windowEnd = windowStart - 1;
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const paypal: PayPalService = {
  mode: paypalMode,

  async listTransactions(range) {
    if (paypalMode() === "live") {
      try {
        return await liveTransactions(range);
      } catch (err) {
        console.error("[paypal] listTransactions failed, falling back to store:", describe(err));
      }
    }
    return storeTransactions(range);
  },

  async getBalance() {
    if (paypalMode() === "live") {
      try {
        const { result } = await new TransactionSearchController(sdk()).searchBalances({ currencyCode: "USD" });
        const b = result.balances?.find((x) => x.primary) ?? result.balances?.find((x) => x.currency === "USD") ?? result.balances?.[0];
        const v = money(b?.availableBalance ?? b?.totalBalance);
        if (Number.isFinite(v)) return { balance: v, mode: "live" };
      } catch (err) {
        // Sandbox apps often lack the balances scope; the store balance is the fallback.
        console.error("[paypal] getBalance failed, falling back to store:", describe(err));
      }
    }
    return { balance: getState().userProfile.paypalBalance, mode: "mock" };
  },

  async listRecurring() {
    if (paypalMode() === "live") {
      try {
        const { result } = await new SubscriptionsController(sdk()).listSubscriptions({ pageSize: 20 });
        const mapped = (result.subscriptions ?? []).map(mapSubscription).filter((x): x is RecurringPayment => x !== null);
        if (mapped.length > 0) return mapped;
      } catch (err) {
        console.error("[paypal] listRecurring failed, falling back to store:", describe(err));
      }
    }
    return getState().recurring;
  },

  async cancelSubscription(recurringId, reason) {
    const isPayPalId = /^I-[A-Z0-9]+$/i.test(recurringId);
    if (paypalMode() === "live" && isPayPalId) {
      try {
        await new SubscriptionsController(sdk()).cancelSubscription({ id: recurringId, body: { reason: reason.slice(0, 128) || "Cancelled by user" } });
      } catch (err) {
        const error = describe(err);
        console.error("[paypal] cancelSubscription failed:", error);
        return { ok: false, error, channel: "paypal_api" };
      }
      cancelRecurring(recurringId); // mirror into the store when the id is also known there (ignored otherwise)
      return { ok: true, channel: "paypal_api" };
    }

    const r = cancelRecurring(recurringId);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      channel: "local_store",
      ...(paypalMode() === "live"
        ? { note: "No PayPal subscription id (I-...) for this item; cancelled in the local store only." }
        : {}),
    };
  },

  async createOrder({ amount, description, returnUrl, cancelUrl }) {
    const value = amount.toFixed(2);
    if (paypalMode() === "live") {
      try {
        const { result } = await new OrdersController(sdk()).createOrder({
          body: {
            intent: CheckoutPaymentIntent.Capture,
            purchaseUnits: [{ amount: { currencyCode: "USD", value }, description: description.slice(0, 127) }],
            paymentSource: {
              paypal: {
                experienceContext: {
                  brandName: "PayPal AI",
                  userAction: PaypalExperienceUserAction.PayNow,
                  shippingPreference: PaypalWalletContextShippingPreference.NoShipping,
                  returnUrl,
                  cancelUrl,
                },
              },
            },
          },
          prefer: "return=representation",
        });
        const link = result.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
        return { ok: true, orderId: result.id, status: result.status, approveUrl: link?.href, channel: "paypal_api" };
      } catch (err) {
        const error = describe(err);
        console.error("[paypal] createOrder failed:", error);
        return { ok: false, error, channel: "paypal_api" };
      }
    }
    return { ok: true, orderId: `SIM-${Date.now().toString(36).toUpperCase()}`, status: "CREATED", channel: "simulated" };
  },

  async captureOrder(orderId) {
    if (paypalMode() === "live" && !orderId.startsWith("SIM-")) {
      try {
        const { result } = await new OrdersController(sdk()).captureOrder({ id: orderId, prefer: "return=representation" });
        const cap = result.purchaseUnits?.[0]?.payments?.captures?.[0];
        const amount = money(cap?.amount);
        return { ok: result.status === "COMPLETED", orderId, captureId: cap?.id, status: result.status, ...(Number.isFinite(amount) ? { amount } : {}), channel: "paypal_api" };
      } catch (err) {
        const error = describe(err);
        console.error("[paypal] captureOrder failed:", error);
        return { ok: false, error, orderId, channel: "paypal_api" };
      }
    }
    return { ok: true, orderId, captureId: `SIM-CAP-${Date.now().toString(36).toUpperCase()}`, status: "COMPLETED", channel: "simulated" };
  },
};
