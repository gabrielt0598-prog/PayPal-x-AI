// In-memory server state for the localhost demo. Seeded from mock-data and
// mutated by agent actions (cancel subscription, apply offer, simulate spend).
// When the APIMatic PayPal SDK is live, src/lib/services/paypal.ts becomes the
// source of truth and this store acts as a cache of the latest snapshot.
//
// Server-only: import from route handlers / server code, never from client components.

import { createSeedState } from "./mock-data";
import { offerCashback, r2 } from "./finance";
import type { Category, FinanceState, Offer, RecurringPayment, Transaction } from "./types";

const g = globalThis as typeof globalThis & { __pfmState?: FinanceState };

export function getState(): FinanceState {
  g.__pfmState ??= createSeedState();
  return g.__pfmState;
}

export function resetState(): FinanceState {
  g.__pfmState = createSeedState();
  return g.__pfmState;
}

export interface BalanceChange {
  balanceBefore: number;
  balanceAfter: number;
  /** True when this change moved the balance from >= threshold to < threshold (Zapier alert trigger). */
  crossedBelowThreshold: boolean;
}

function nextTxnId(state: FinanceState) {
  const max = state.transactions.reduce((m, t) => Math.max(m, Number(t.id.slice(4)) || 0), 0);
  return `txn_${String(max + 1).padStart(4, "0")}`;
}

function post(state: FinanceState, txn: Omit<Transaction, "id" | "balanceAfter">): { transaction: Transaction } & BalanceChange {
  const before = state.userProfile.paypalBalance;
  const after = r2(before + txn.amount);
  const transaction: Transaction = { ...txn, id: nextTxnId(state), balanceAfter: after };
  state.transactions.push(transaction);
  state.userProfile.paypalBalance = after;
  const threshold = state.userProfile.autoReload.threshold;
  return { transaction, balanceBefore: before, balanceAfter: after, crossedBelowThreshold: before >= threshold && after < threshold };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function cancelRecurring(id: string): Result<RecurringPayment> {
  const state = getState();
  const r = state.recurring.find((x) => x.id === id);
  if (!r) return { ok: false, error: `No recurring payment with id ${id}` };
  if (!r.cancellable) return { ok: false, error: `${r.merchant} (${r.plan}) is a ${r.kind} and cannot be cancelled from the app` };
  if (r.status === "cancelled") return { ok: false, error: `${r.merchant} is already cancelled` };
  r.status = "cancelled";
  r.cancelledAt = state.asOf;
  return { ok: true, value: r };
}

export function applyOffer(
  offerId: string,
  transactionId?: string,
): Result<{ offer: Offer; transaction: Transaction; cashback: number; credit: Transaction } & BalanceChange> {
  const state = getState();
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, error: `No offer with id ${offerId}` };
  if (offer.status !== "available" && offer.status !== "added") return { ok: false, error: `Offer "${offer.title}" is ${offer.status}` };

  const candidates = transactionId
    ? state.transactions.filter((t) => t.id === transactionId)
    : state.transactions.filter((t) => offerCashback(offer, t) !== null);
  if (candidates.length === 0) return { ok: false, error: transactionId ? `No transaction with id ${transactionId}` : `No eligible ${offer.merchant} transaction for "${offer.title}"` };

  let best: { t: Transaction; cb: number } | null = null;
  for (const t of candidates) {
    const cb = offerCashback(offer, t);
    if (cb !== null && (!best || cb > best.cb)) best = { t, cb };
  }
  if (!best) return { ok: false, error: `Transaction ${transactionId} is not eligible for "${offer.title}"` };

  best.t.appliedOfferId = offer.id;
  offer.status = "applied";
  offer.appliedToTransactionId = best.t.id;
  const posted = post(state, {
    date: state.asOf,
    merchant: "PayPal Offers",
    description: `Cash back — ${offer.title}`,
    amount: best.cb,
    category: "Cashback",
    method: "paypal_offer",
    status: "completed",
  });
  const { transaction: credit, ...balance } = posted;
  return { ok: true, value: { offer, transaction: best.t, cashback: best.cb, credit, ...balance } };
}

/** Demo helper: record a new card purchase (used to show the low-balance Zapier alert). */
export function simulateSpend(merchant: string, amount: number, category: Category = "Shopping") {
  const state = getState();
  return post(state, {
    date: new Date(Date.parse(state.asOf) + 60_000 * state.transactions.length).toISOString(),
    merchant,
    description: "Card purchase",
    amount: -Math.abs(amount),
    category,
    method: "paypal_debit_card",
    status: "pending",
  });
}

/** Save an offer to the account (or remove it) without a matching purchase yet. */
export function setOfferAdded(offerId: string, added: boolean): Result<Offer> {
  const offer = getState().offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, error: `No offer with id ${offerId}` };
  if (offer.status !== "available" && offer.status !== "added") return { ok: false, error: `Offer "${offer.title}" is ${offer.status}` };
  offer.status = added ? "added" : "available";
  return { ok: true, value: offer };
}

export function recategorize(transactionId: string, category: Category): Result<Transaction> {
  const t = getState().transactions.find((x) => x.id === transactionId);
  if (!t) return { ok: false, error: `No transaction with id ${transactionId}` };
  t.category = category;
  return { ok: true, value: t };
}

export type MoneyMove = "add" | "transfer" | "rewards" | "purchase";

/**
 * Demo helper behind the balance card's Add money / Transfer buttons, rewards
 * redemption and Store Sync reorders. Posts one ledger entry and moves the balance.
 */
export function moveMoney(kind: MoneyMove, amount: number, merchant?: string) {
  const state = getState();
  const bank = state.userProfile.linkedBank;
  const abs = r2(Math.abs(amount));
  const entry: Record<MoneyMove, Omit<Transaction, "id" | "balanceAfter" | "date" | "status">> = {
    add: { merchant: bank, description: "Add money from bank", amount: abs, category: "Transfers", method: "bank_transfer" },
    transfer: { merchant: bank, description: "Transfer to bank", amount: -abs, category: "Transfers", method: "bank_transfer" },
    rewards: { merchant: "PayPal Rewards", description: "Rewards points redeemed as cash back", amount: abs, category: "Cashback", method: "paypal_offer" },
    purchase: { merchant: merchant ?? "Store Sync merchant", description: "Reorder via PayPal Store Sync", amount: -abs, category: "Shopping", method: "paypal_balance" },
  };
  return post(state, {
    ...entry[kind],
    date: new Date(Date.parse(state.asOf) + 60_000 * state.transactions.length).toISOString(),
    status: kind === "purchase" ? "pending" : "completed",
  });
}
