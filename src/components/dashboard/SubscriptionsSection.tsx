"use client";

import { useFinance } from "@/components/state/AppProviders";
import { useAssistantUI } from "@/components/state/AppProviders";
import { formatUSD, monthlyCost, recurringSummary, unusedSubscriptions } from "@/lib/finance";
import type { FinanceState, RecurringKind, RecurringPayment } from "@/lib/types";
import { Avatar, Card, CardHeader, Chip, Skeleton, cx } from "./ui";
import { daysBetween, shortDate } from "./utils";

const GROUPS: { kind: RecurringKind; title: string }[] = [
  { kind: "subscription", title: "Subscriptions" },
  { kind: "bill", title: "Bills" },
  { kind: "variable", title: "Variable" },
];

/** Observed range/average for variable payments, derived from linked transactions when the seed has none. */
function variableStats(r: RecurringPayment, state: FinanceState) {
  const amts = state.transactions.filter((t) => t.recurringId === r.id && t.amount < 0).map((t) => -t.amount);
  const avg = r.amount > 0 ? r.amount : amts.length ? amts.reduce((a, b) => a + b, 0) / amts.length : 0;
  const min = r.amountRange?.min ?? (amts.length ? Math.min(...amts) : avg);
  const max = r.amountRange?.max ?? (amts.length ? Math.max(...amts) : avg);
  return { avg, min, max };
}

function RangeBar({ min, max, avg }: { min: number; max: number; avg: number }) {
  const top = max * 1.15 || 1;
  return (
    <div className="w-full max-w-[160px]">
      <div className="relative h-1.5 rounded-full bg-surface-3" aria-hidden>
        <div className="absolute h-full rounded-full bg-accent/40" style={{ left: `${(min / top) * 100}%`, width: `${((max - min) / top) * 100}%` }} />
        <div className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-accent" style={{ left: `${(avg / top) * 100}%` }} />
      </div>
      <p className="num mt-1 text-[11px] text-faint">
        {formatUSD(min)} – {formatUSD(max)}
      </p>
    </div>
  );
}

export function SubscriptionsSection() {
  const { state, loading } = useFinance();
  const { openAssistant } = useAssistantUI();

  if (loading || !state) {
    return (
      <Card id="subscriptions">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const asOf = state.asOf.slice(0, 10);
  const unused = new Set(unusedSubscriptions(state.recurring, state.asOf, 30).map((r) => r.id));
  const sum = recurringSummary(state.recurring);

  return (
    <Card id="subscriptions">
      <CardHeader
        title="Subscriptions & recurring"
        subtitle={`${sum.activeCount} active, ${formatUSD(sum.totalMonthly)} per month in total`}
        right={unused.size > 0 ? <Chip tone="warning">{unused.size} unused for 30+ days</Chip> : undefined}
      />
      <div className="space-y-6">
        {GROUPS.map(({ kind, title }) => {
          const items = state.recurring
            .filter((r) => r.kind === kind)
            .sort((a, b) => Number(a.status === "cancelled") - Number(b.status === "cancelled") || monthlyCost(b) - monthlyCost(a));
          if (!items.length) return null;
          const isVar = kind === "variable";
          return (
            <div key={kind}>
              <h3 className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-faint">{title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] text-faint">
                      <th className="px-1 py-2 font-medium">Merchant</th>
                      <th className="px-2 py-2 text-right font-medium">{isVar ? "Average" : "Per month"}</th>
                      {isVar && <th className="px-2 py-2 font-medium">Range</th>}
                      <th className="px-2 py-2 font-medium">Next charge</th>
                      {!isVar && <th className="px-2 py-2 font-medium">Last used</th>}
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const cancelled = r.status === "cancelled";
                      const v = isVar ? variableStats(r, state) : null;
                      const used = r.lastUsedAt ? daysBetween(r.lastUsedAt, asOf) : null;
                      return (
                        <tr key={r.id} className={cx("border-t border-border", cancelled && "opacity-50")}>
                          <td className="px-1 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={r.merchant} size={30} />
                              <div className="min-w-0 leading-tight">
                                <div className="truncate font-medium">{r.merchant}</div>
                                <div className="truncate text-[11px] text-muted">{r.plan}</div>
                              </div>
                            </div>
                          </td>
                          <td className="num px-2 py-3 text-right">
                            {v ? formatUSD(v.avg) : formatUSD(monthlyCost(r))}
                            {isVar && <span className="text-[11px] text-faint">{r.cycle === "weekly" ? " /wk" : " /mo"}</span>}
                            {!isVar && r.cycle !== "monthly" && <div className="text-[11px] text-faint">{formatUSD(r.amount)} {r.cycle}</div>}
                          </td>
                          {isVar && v && (
                            <td className="px-2 py-3">
                              <RangeBar {...v} />
                            </td>
                          )}
                          <td className="px-2 py-3 text-muted">{cancelled ? "–" : shortDate(r.nextChargeDate)}</td>
                          {!isVar && (
                            <td className="px-2 py-3 text-muted">
                              {used === null ? "–" : used === 0 ? "Today" : `${used}d ago`}
                            </td>
                          )}
                          <td className="px-2 py-3">
                            {cancelled ? (
                              <Chip>Cancelled</Chip>
                            ) : r.status === "paused" ? (
                              <Chip tone="warning">Paused</Chip>
                            ) : unused.has(r.id) ? (
                              <Chip tone="warning">Unused 30d+</Chip>
                            ) : (
                              <Chip tone="positive">Active</Chip>
                            )}
                          </td>
                          <td className="px-1 py-3 text-right">
                            {!cancelled && r.status === "active" && r.cancellable && (
                              <button
                                onClick={() => openAssistant(`Cancel my ${r.merchant} subscription`)}
                                className="rounded-full border border-border-strong px-3 py-1 text-xs text-muted transition-colors hover:border-negative/60 hover:text-negative"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
