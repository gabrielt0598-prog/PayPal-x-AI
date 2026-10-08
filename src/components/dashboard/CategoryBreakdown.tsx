"use client";

import { useFinance } from "@/components/state/AppProviders";
import { categoryBreakdown, formatUSD } from "@/lib/finance";
import { Card, CardHeader, EmptyNote, Skeleton } from "./ui";
import { monthRange } from "./utils";

export function CategoryBreakdown() {
  const { state, loading } = useFinance();

  if (loading || !state) {
    return (
      <Card>
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </Card>
    );
  }
  const r = monthRange(state);
  const rows = categoryBreakdown(state.transactions, r.from, r.to);
  const total = rows.reduce((a, c) => a + c.spend, 0);
  const max = rows[0]?.spend || 1;

  return (
    <Card>
      <CardHeader title="Where it went" subtitle={`This month so far, ${formatUSD(total)}`} />
      {rows.length === 0 ? (
        <EmptyNote>No spending yet this month.</EmptyNote>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <li key={c.category}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-text">{c.category}</span>
                <span className="num shrink-0 text-muted">
                  <span className="text-text">{formatUSD(c.spend)}</span> · {Math.round(c.share * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${(c.spend / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
