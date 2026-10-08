// Zapier background alerts: POSTs a low-balance event to a "Webhooks by Zapier -> Catch Hook" URL so a Zap
// can push / SMS / email the user.
//
// live = ZAPIER_WEBHOOK_URL set (https) -> real POST, 5s timeout, one retry, 10-minute dedupe of identical alerts
// mock = no URL                         -> log and return { delivered: false, mode: "mock" }
//
// The webhook URL is a secret-ish capability URL: it is never logged or returned.

import { formatUSD } from "../finance";
import { getState, type BalanceChange } from "../store";
import type { LowBalanceAlert, ServiceMode, ZapierResult, ZapierService } from "./contracts";

export const LOW_BALANCE_EVENT = "paypal.balance.below_auto_reload_threshold";
const TIMEOUT_MS = 5_000;
const DEDUPE_MS = 10 * 60_000;

const g = globalThis as typeof globalThis & { __zapierSent?: Map<string, number> };

export function zapierMode(): ServiceMode {
  return webhookUrl() ? "live" : "mock";
}

function webhookUrl(): string | null {
  const u = process.env.ZAPIER_WEBHOOK_URL?.trim();
  if (!u) return null;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function lowBalanceMessage(a: LowBalanceAlert): string {
  const via = a.triggeredBy ? ` after a ${formatUSD(a.triggeredBy.amount)} purchase at ${a.triggeredBy.merchant}` : "";
  return (
    `Low balance: ${a.userName}'s PayPal balance is ${formatUSD(a.balance)}${via}, below the ${formatUSD(a.threshold)} auto-reload threshold. ` +
    `PayPal will reload ${formatUSD(a.reloadAmount)} from ${a.fundingSource}.`
  );
}

function dedupeKey(a: LowBalanceAlert) {
  return JSON.stringify([a.userId, a.balance, a.threshold, a.triggeredBy?.transactionId ?? null]);
}

async function post(url: string, body: unknown): Promise<{ status: number; ok: boolean }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, ok: res.ok };
}

/** Deliver a low-balance alert. `force` skips the dedupe window (used by the manual test route). */
export async function deliverLowBalanceAlert(alert: LowBalanceAlert, opts: { force?: boolean } = {}): Promise<ZapierResult> {
  const url = webhookUrl();
  const message = lowBalanceMessage(alert);
  if (!url) {
    console.info(`[zapier] mock mode (no ZAPIER_WEBHOOK_URL): would send "${message}"`);
    return { delivered: false, mode: "mock" };
  }

  const sent = (g.__zapierSent ??= new Map());
  const now = Date.now();
  for (const [k, t] of sent) if (now - t > DEDUPE_MS) sent.delete(k);
  const key = dedupeKey(alert);
  if (!opts.force && sent.has(key)) {
    return { delivered: false, mode: "live", deduped: true, error: "Identical alert already sent in the last 10 minutes" };
  }

  const payload = { event: LOW_BALANCE_EVENT, message, ...alert };
  let last: ZapierResult = { delivered: false, mode: "live" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, ok } = await post(url, payload);
      if (ok) {
        sent.set(key, Date.now());
        return { delivered: true, mode: "live", status };
      }
      last = { delivered: false, mode: "live", status, error: `Zapier responded with HTTP ${status}` };
      if (status < 500 && status !== 429 && status !== 408) break; // client errors will not improve on retry
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      last = { delivered: false, mode: "live", error: name === "TimeoutError" ? `Zapier webhook timed out after ${TIMEOUT_MS}ms` : `Zapier webhook request failed (${name})` };
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[zapier] alert not delivered: ${last.error}`);
  return last;
}

export const zapier: ZapierService = {
  sendLowBalanceAlert: (alert) => deliverLowBalanceAlert(alert),
};

/** Build the alert payload from the current store state. */
export function buildLowBalanceAlert(triggeredBy?: LowBalanceAlert["triggeredBy"]): LowBalanceAlert {
  const { userProfile: u, asOf } = getState();
  return {
    userId: u.id,
    userName: u.name,
    balance: u.paypalBalance,
    threshold: u.autoReload.threshold,
    reloadAmount: u.autoReload.reloadAmount,
    fundingSource: u.autoReload.fundingSource,
    ...(triggeredBy ? { triggeredBy } : {}),
    occurredAt: asOf,
  };
}

/** Fire the alert only when the store reports the balance just crossed below the auto-reload threshold. */
export async function maybeAlertLowBalance(
  change: BalanceChange,
  triggeredBy?: LowBalanceAlert["triggeredBy"],
): Promise<ZapierResult | null> {
  if (!change.crossedBelowThreshold) return null;
  const alert = buildLowBalanceAlert(triggeredBy);
  return zapier.sendLowBalanceAlert({ ...alert, balance: change.balanceAfter });
}
