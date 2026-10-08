"use client";

import { useFinance } from "@/components/state/AppProviders";
import { formatUSD, upcomingCharges } from "@/lib/finance";
import { Avatar, Card, CardHeader, EmptyNote, Skeleton } from "./ui";
import { daysBetween, shortDate } from "./utils";

export function UpcomingCharges() {
  const { state, loading } = useFinance();
  if (loading || !state) {
    return (
      <Card>
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    );
  }
  const asOf = state.asOf.slice(0, 10);
  const items = upcomingCharges(state.recurring, state.asOf, 14);
  const estimate = (amt: number) => (amt > 0 ? formatUSD(amt) : "Varies");
  const total = items.reduce((a, r) => a + r.amount, 0);

  return (
    <Card>
      <CardHeader title="Upcoming charges" subtitle={`Next 14 days, about ${formatUSD(total)}`} />
      {items.length === 0 ? (
        <EmptyNote>Nothing scheduled.</EmptyNote>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r) => {
            const d = daysBetween(asOf, r.nextChargeDate);
            return (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={r.merchant} size={28} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm">{r.merchant}</p>
                  <p className="text-[11px] text-muted">
                    {shortDate(r.nextChargeDate)} · {d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}
                  </p>
                </div>
                <span className="num text-sm">{estimate(r.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
