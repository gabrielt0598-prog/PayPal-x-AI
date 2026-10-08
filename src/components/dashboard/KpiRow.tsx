"use client";

import { useFinance } from "@/components/state/AppProviders";
import { formatUSD, periodTotals, recurringSummary } from "@/lib/finance";
import { Card, Chip, DeltaChip, Skeleton } from "./ui";
import { monthRange, pctChange } from "./utils";

function Kpi({ label, value, foot }: { label: string; value: string; foot: React.ReactNode }) {
  return (
    <Card className="!p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-2 flex min-h-5 items-center gap-2 text-[11px] text-muted">{foot}</div>
    </Card>
  );
}

export function KpiRow() {
  const { state, loading } = useFinance();
  if (loading || !state) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="!p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-3 h-4 w-28" />
          </Card>
        ))}
      </div>
    );
  }
  const r = monthRange(state);
  const now = periodTotals(state.transactions, r.from, r.to);
  const prev = periodTotals(state.transactions, r.prev.from, r.prev.to);
  const sum = recurringSummary(state.recurring);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${r.to}T12:00:00Z`));

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label={`Spent in ${month} (MTD)`}
        value={formatUSD(now.spend)}
        foot={
          <>
            <DeltaChip pct={pctChange(now.spend, prev.spend)} goodWhen="down" />
            <span className="truncate">vs {formatUSD(prev.spend)} last month</span>
          </>
        }
      />
      <Kpi
        label={`Income in ${month}`}
        value={formatUSD(now.income)}
        foot={
          <>
            <DeltaChip pct={pctChange(now.income, prev.income)} goodWhen="up" />
            <span className="truncate">vs {formatUSD(prev.income)}</span>
          </>
        }
      />
      <Kpi
        label={`Net in ${month}`}
        value={`${now.net < 0 ? "−" : ""}${formatUSD(Math.abs(now.net))}`}
        foot={<Chip tone={now.net >= 0 ? "positive" : "negative"}>{now.net >= 0 ? "Saving" : "Overspending"}</Chip>}
      />
      <Kpi
        label="Subscriptions / month"
        value={formatUSD(sum.subscriptionsMonthly)}
        foot={<span>{sum.subscriptionCount} active subscriptions</span>}
      />
    </div>
  );
}
