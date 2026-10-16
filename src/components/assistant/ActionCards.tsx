"use client";

import { useEffect, useRef, useState } from "react";
import { useFinance } from "@/components/state/AppProviders";
import { useClean } from "@/components/clean/AppState";
import { completeOrder } from "@/components/clean/paypalOrder";
import { DEFAULT_STATE, loadBudget, saveBudget } from "@/components/clean/budget/model";
import { money } from "@/components/clean/ui";
import { ArrowUpRight, BadgePercent, Brain, CheckCircle2, ShieldQuestion, Tags } from "lucide-react";
import type { AgentAction, RailStep } from "@/lib/agent/types";
import { CompareCard } from "./CompareCard";
import { StepRail } from "./StepRail";

const card = "rounded-[10px] border px-3.5 py-3 text-[13px]";

type CancelledAction = Extract<AgentAction, { type: "subscription_cancelled" }>;

const linkCls = "inline-flex items-center gap-1 text-accent hover:underline";

function CancelledCard({ action }: { action: CancelledAction }) {
  const [zoom, setZoom] = useState(false);
  const viaKernel = action.channel === "kernel_browser";
  const simulated = action.mode === "mock";
  const sandbox = action.target !== "real";
  return (
    <div className={`${card} border-positive/30 bg-positive-bg`}>
      <div className="flex items-center gap-2 font-medium text-positive">
        <CheckCircle2 size={15} /> {action.merchant} cancelled
        <span className="font-normal">· saves {action.monthlySavingLabel}/mo</span>
      </div>
      <div className="mt-1 text-muted">
        {action.annualSavingLabel}/yr ·{" "}
        {!viaKernel
          ? `PayPal Subscriptions${simulated ? " · simulated" : ""}`
          : simulated
            ? "Simulated (add KERNEL_API_KEY to run in a real Kernel browser)"
            : `Cancelled by Kernel${sandbox ? " · sandbox merchant site" : ""}`}
      </div>
      {action.screenshotDataUrl ? (
        <button type="button" onClick={() => setZoom(true)} className="mt-2 block overflow-hidden rounded-lg border border-border-strong" title="Click to enlarge">
          {/* eslint-disable-next-line @next/next/no-img-element -- inline data: URL screenshot from Kernel */}
          <img src={action.screenshotDataUrl} alt={`${action.merchant} cancellation confirmation (screenshot)`} className="h-24 w-auto" />
        </button>
      ) : null}
      {action.confirmationNumber ? (
        <div className="mt-1.5 text-[12px] text-muted">
          Confirmation <span className="font-mono text-text">#{action.confirmationNumber}</span>
        </div>
      ) : null}
      {action.steps?.length ? (
        <div className="mt-2.5">
          <StepRail steps={action.steps.map((t) => ({ title: t.replace(/\s*\(simulated\)$/i, ""), status: "Done" }))} />
        </div>
      ) : null}
      {action.replayUrl || action.liveViewUrl || action.previewUrl ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {action.replayUrl ? (
            <a href={action.replayUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>Watch replay <ArrowUpRight size={13} /></a>
          ) : null}
          {action.liveViewUrl ? (
            <a href={action.liveViewUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>Live view <ArrowUpRight size={13} /></a>
          ) : null}
          {action.previewUrl ? (
            <a href={action.previewUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
              {sandbox ? "Open sandbox page" : "Open page"} <ArrowUpRight size={13} />
            </a>
          ) : null}
        </div>
      ) : null}
      {zoom && action.screenshotDataUrl ? (
        <div role="dialog" aria-label="Cancellation screenshot" onClick={() => setZoom(false)} className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/70 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- inline data: URL screenshot from Kernel */}
          <img src={action.screenshotDataUrl} alt={`${action.merchant} cancellation confirmation (enlarged)`} className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      ) : null}
    </div>
  );
}

type PausedAction = Extract<AgentAction, { type: "subscription_paused" }>;
type BudgetAction = Extract<AgentAction, { type: "budget_limit_set" }>;

/** Actions are applied once per card, even if the chat re-renders. */
const applied = new Set<string>();

/** A subscription paused or resumed through PayPal's Subscriptions API. Tints the row on Recurring and offers Undo. */
function SubscriptionPausedCard({ action }: { action: PausedAction }) {
  const { flashChange, toast } = useClean();
  const { refresh } = useFinance();
  const key = `${action.recurringId}-${action.paused}`;
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (applied.has(key)) return;
    applied.add(key);
    flashChange("recurring", [action.recurringId]);
    toast(action.paused ? `${action.merchant} paused` : `${action.merchant} is active again`, action.paused ? `No ${action.amountLabel} charge until you resume` : `Next charge ${action.nextChargeLabel} · ${action.amountLabel}`, {
      undo: async () => {
        await fetch(`/api/paypal/subscriptions/${encodeURIComponent(action.recurringId)}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !action.paused }) });
        void refresh();
      },
    });
  }, [key, action, flashChange, toast, refresh]);
  return (
    <div className={`${card} border-positive/30 bg-positive-bg`}>
      <div className="flex items-center gap-2 font-medium text-positive">
        <CheckCircle2 size={15} /> {action.merchant} {action.paused ? "paused" : "resumed"}
      </div>
      <div className="mt-1 text-muted">
        {action.plan} · {action.paused ? `no ${action.amountLabel} charge until you resume` : `next charge ${action.nextChargeLabel}`} ·{" "}
        {action.channel === "paypal_subscriptions_api" ? "PayPal Subscriptions API" : "simulated"}
      </div>
    </div>
  );
}

/** A budget limit the agent set. Budget limits live in the browser, so the card writes it, tints the row and offers Undo. */
function BudgetChangeCard({ action }: { action: BudgetAction }) {
  const { flashChange, toast } = useClean();
  const ran = useRef(false);
  const [result, setResult] = useState<{ from: number; error?: string }>();
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (applied.has(action.key)) return;
    applied.add(action.key);
    const b = loadBudget() ?? DEFAULT_STATE;
    const from = b.limits[action.itemId] ?? 0;
    const alloc = Object.values(b.limits).reduce((a, n) => a + n, 0);
    if (alloc - from + action.limit > b.total) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reports the outcome of applying the change once on mount
      setResult({ from, error: `That would put your category limits over your ${money(b.total)} monthly budget, so ${action.label} stays at ${money(from)}.` });
      return;
    }
    saveBudget({ ...b, limits: { ...b.limits, [action.itemId]: action.limit } });
    window.dispatchEvent(new Event("budget:changed"));
    flashChange("budget", [action.itemId]);
    setResult({ from });
    toast(`Stella updated ${action.label}`, `${money(from)} → ${action.limitLabel} · saved to Budget`, {
      undo: () => {
        const cur = loadBudget() ?? DEFAULT_STATE;
        saveBudget({ ...cur, limits: { ...cur.limits, [action.itemId]: from } });
        window.dispatchEvent(new Event("budget:changed"));
      },
    });
  }, [action, flashChange, toast]);
  if (!result) return null;
  return result.error ? (
    <div role="alert" className={`${card} border-warning/30 bg-warning-bg text-warning`}>{result.error}</div>
  ) : (
    <div className={`${card} border-positive/30 bg-positive-bg`}>
      <div className="flex items-center gap-2 font-medium text-positive">
        <CheckCircle2 size={15} /> {action.label} limit set
      </div>
      <div className="mt-1 text-muted">{money(result.from)} → {action.limitLabel} · saved to Budget</div>
    </div>
  );
}

type PaymentAction = Extract<AgentAction, { type: "paypal_payment" }>;

/**
 * An Orders API payment the agent started. The order exists; the user approves it with PayPal (a popup in live mode,
 * simulated otherwise), then it is captured and booked. The steps fill in as each stage finishes.
 */
function PayPalPaymentCard({ action }: { action: PaymentAction }) {
  const { moveMoney, toast } = useClean();
  const { refresh } = useFinance();
  const [phase, setPhase] = useState<"ready" | "approving" | "capturing" | "done">("ready");
  const [captureId, setCaptureId] = useState<string>();
  const [error, setError] = useState<string>();
  const simulated = action.mode === "mock";

  const pay = async () => {
    setError(undefined);
    try {
      const cap = await completeOrder({ orderId: action.orderId, approveUrl: action.approveUrl, onStage: (s) => setPhase(s === "approving" ? "approving" : "capturing") });
      setCaptureId(cap.captureId);
      if (await moveMoney("purchase", action.amount, action.merchant)) {
        setPhase("done");
        toast("Paid with PayPal", `${action.amountLabel} · Order ${action.orderId}`);
        void refresh();
      } else setPhase("ready");
    } catch (e) {
      setPhase("ready");
      setError(e instanceof Error ? e.message : "The payment was not completed");
    }
  };

  const approved = phase === "capturing" || phase === "done";
  const steps: RailStep[] = [
    { title: "Order created", sub: `Orders API · createOrder · ID **${action.orderId}**${simulated ? " · simulated" : ""}`, status: "Created" },
    approved
      ? { title: "You approved it", sub: "Approved with PayPal", status: "Approved" }
      : { title: "Your approval", sub: phase === "approving" ? "Approve the payment in the PayPal window" : `Pay **${action.amountLabel}** to ${action.merchant}`, status: phase === "approving" ? "Waiting" : "Needed", state: "current" },
    phase === "done"
      ? { title: "Payment captured", sub: `Orders API · captureOrder${captureId ? ` · Capture **${captureId}**` : ""}`, status: action.amountLabel }
      : { title: "Payment captured", sub: "Orders API · captureOrder", status: phase === "capturing" ? "Capturing" : "Pending", state: phase === "capturing" ? "current" : "pending" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <StepRail steps={steps} />
      {error ? <div role="alert" className="text-[12px] text-negative">{error}</div> : null}
      {phase === "ready" || phase === "approving" ? (
        <button type="button" onClick={() => void pay()} disabled={phase === "approving"} className="h-9 self-start rounded-full border border-white bg-white px-3.5 text-[13px] font-medium text-[#0a0a0a] transition disabled:cursor-not-allowed disabled:opacity-40">
          {phase === "approving" ? "Waiting for PayPal…" : `Approve with PayPal · ${action.amountLabel}`}
        </button>
      ) : null}
    </div>
  );
}

export function ActionCard({
  action,
  canAnswer,
  onSend,
}: {
  action: AgentAction;
  canAnswer: boolean;
  onSend: (text: string) => void;
}) {
  switch (action.type) {
    case "subscription_cancelled":
      return <CancelledCard action={action} />;
    case "cancellation_preview":
      return (
        <div className={`${card} border-warning/30 bg-warning-bg`}>
          <div className="flex items-center gap-2 font-medium text-warning">
            <ShieldQuestion size={15} /> Cancel {action.merchant}?
          </div>
          <div className="mt-1 text-muted">
            {action.plan} · saves {action.monthlySavingLabel}/mo ({action.annualSavingLabel}/yr)
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button disabled={!canAnswer} onClick={() => onSend("Yes, cancel it")} className="h-9 rounded-full border border-white bg-white px-3.5 text-[13px] font-medium text-[#0a0a0a] transition disabled:cursor-not-allowed disabled:opacity-40">
              Confirm cancel
            </button>
            <button disabled={!canAnswer} onClick={() => onSend("Keep it")} className="h-9 rounded-full border border-transparent bg-white/[0.08] px-3.5 text-[13px] font-medium text-text transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40">
              Keep it
            </button>
          </div>
        </div>
      );
    case "offer_applied":
      return (
        <div className={`${card} border-positive/30 bg-positive-bg`}>
          <div className="flex items-center gap-2 font-medium text-positive">
            <BadgePercent size={15} /> +{action.cashbackLabel} cashback from {action.merchant} offer
          </div>
          <div className="mt-1 text-muted">Applied to {action.transactionId} · new balance {action.newBalanceLabel}</div>
        </div>
      );
    case "subscription_paused":
      return <SubscriptionPausedCard action={action} />;
    case "budget_limit_set":
      return <BudgetChangeCard action={action} />;
    case "paypal_payment":
      return <PayPalPaymentCard action={action} />;
    case "steps_completed":
      return <StepRail steps={action.steps} />;
    case "what_if_compare":
      return <CompareCard title={action.title} compare={action.compare} />;
    case "fact_remembered":
      return (
        <div className={`${card} border-accent/30 bg-accent/10`}>
          <div className="flex items-center gap-2 font-medium text-accent"><Brain size={15} /> Remembered {action.key} = {action.value}</div>
        </div>
      );
    case "fact_forgotten":
      return (
        <div className={`${card} border-border bg-surface-2`}>
          <div className="flex items-center gap-2 text-muted"><Brain size={15} /> Forgot {action.key}</div>
        </div>
      );
    case "transactions_recategorized":
      return (
        <div className={`${card} border-border bg-surface-2`}>
          <div className="flex items-center gap-2 font-medium text-text"><Tags size={15} /> Re-categorized {action.changes.length} of {action.checked}</div>
          <ul className="mt-1 space-y-0.5 text-muted">
            {action.changes.slice(0, 6).map((c) => (
              <li key={c.id}>{c.merchant}: {c.from} → <span className="text-text">{c.to}</span></li>
            ))}
          </ul>
        </div>
      );
  }
}

/** A finished action that can be one row of a step rail. */
function toStep(a: AgentAction): RailStep | null {
  if (a.type === "subscription_cancelled")
    return { title: `${a.merchant} cancelled`, sub: `${a.plan} · saves **${a.monthlySavingLabel}/mo** (${a.annualSavingLabel}/yr)${a.mode === "mock" ? " · simulated" : ""}`, status: "Done" };
  if (a.type === "offer_applied")
    return { title: `${a.merchant} offer applied`, sub: `**+${a.cashbackLabel}** cashback on ${a.transactionId} · new balance **${a.newBalanceLabel}**`, status: "Done" };
  return null;
}

/** All actions of one reply. Two or more completed steps collapse into a single step rail; everything else keeps its own card. */
export function ActionList({ actions, canAnswer, onSend }: { actions: AgentAction[]; canAnswer: boolean; onSend: (text: string) => void }) {
  const steps = actions.map(toStep);
  const railed = steps.filter(Boolean).length >= 2;
  const firstRail = steps.findIndex(Boolean);
  return (
    <>
      {actions.map((a, i) => {
        if (railed && steps[i]) {
          if (i !== firstRail) return null;
          return <StepRail key={i} steps={steps.filter((x): x is RailStep => x !== null)} />;
        }
        return <ActionCard key={i} action={a} canAnswer={canAnswer} onSend={onSend} />;
      })}
    </>
  );
}
