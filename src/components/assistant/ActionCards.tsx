import { ArrowUpRight, BadgePercent, Brain, CheckCircle2, ShieldQuestion, Tags } from "lucide-react";
import type { AgentAction } from "@/lib/agent/types";

const card = "rounded-xl border px-3 py-2.5 text-[13px]";

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
      return (
        <div className={`${card} border-positive/30 bg-positive-bg`}>
          <div className="flex items-center gap-2 font-medium text-positive">
            <CheckCircle2 size={15} /> {action.merchant} cancelled
            <span className="font-normal">· saves {action.monthlySavingLabel}/mo</span>
          </div>
          <div className="mt-1 text-muted">
            {action.annualSavingLabel}/yr · {action.channel === "paypal_subscriptions_api" ? "PayPal Subscriptions" : "Kernel cloud browser"}
            {action.mode === "mock" ? " · simulated" : ""}
          </div>
          {action.steps?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-faint">
              {action.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          ) : null}
          {action.liveViewUrl ? (
            <a href={action.liveViewUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent hover:underline">
              Watch Kernel live view <ArrowUpRight size={13} />
            </a>
          ) : null}
        </div>
      );
    case "cancellation_preview":
      return (
        <div className={`${card} border-warning/30 bg-warning-bg`}>
          <div className="flex items-center gap-2 font-medium text-warning">
            <ShieldQuestion size={15} /> Cancel {action.merchant}?
          </div>
          <div className="mt-1 text-muted">
            {action.plan} · saves {action.monthlySavingLabel}/mo ({action.annualSavingLabel}/yr)
          </div>
          <div className="mt-2 flex gap-2">
            <button disabled={!canAnswer} onClick={() => onSend("Yes, cancel it")} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40">
              Confirm cancel
            </button>
            <button disabled={!canAnswer} onClick={() => onSend("Keep it")} className="rounded-lg border border-border-strong px-3 py-1.5 text-[12px] text-text transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40">
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
    case "fact_remembered":
      return (
        <div className={`${card} border-accent/30 bg-accent/10`}>
          <div className="flex items-center gap-2 font-medium text-accent"><Brain size={15} /> Remembered {action.key} = {action.value}</div>
        </div>
      );
    case "fact_forgotten":
      return (
        <div className={`${card} border-border-strong bg-surface-2`}>
          <div className="flex items-center gap-2 text-muted"><Brain size={15} /> Forgot {action.key}</div>
        </div>
      );
    case "transactions_recategorized":
      return (
        <div className={`${card} border-border-strong bg-surface-2`}>
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
