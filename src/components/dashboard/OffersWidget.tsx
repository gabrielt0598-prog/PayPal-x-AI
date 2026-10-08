"use client";

import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { eligibleOffers, formatUSD } from "@/lib/finance";
import { Avatar, Card, CardHeader, Chip, EmptyNote, Skeleton, cx } from "./ui";
import { shortDate } from "./utils";

export function OffersWidget() {
  const { state, loading } = useFinance();
  const { openAssistant } = useAssistantUI();

  if (loading || !state) {
    return (
      <Card id="offers">
        <Skeleton className="h-4 w-28" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const eligible = eligibleOffers(state);
  const available = eligible
    .filter((e) => e.best)
    .sort((a, b) => (b.best?.cashback ?? 0) - (a.best?.cashback ?? 0));
  const noMatch = eligible.filter((e) => !e.best);
  const inactive = state.offers.filter((o) => o.status !== "available");
  const totalBack = available.reduce((a, e) => a + (e.best?.cashback ?? 0), 0);

  return (
    <Card id="offers">
      <CardHeader
        title="PayPal Offers"
        subtitle={available.length ? `${formatUSD(totalBack)} claimable on recent purchases` : "Nothing claimable right now"}
      />
      <ul className="space-y-2.5">
        {available.map(({ offer, best }) => (
          <li key={offer.id} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-start gap-3">
              <Avatar name={offer.merchant} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{offer.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {best && `${formatUSD(-best.transaction.amount)} on ${shortDate(best.transaction.date)}`} · ends {shortDate(offer.validUntil)}
                </p>
              </div>
              <Chip tone="positive" className="num">+{formatUSD(best?.cashback ?? 0)}</Chip>
            </div>
            <button
              onClick={() => openAssistant(`Apply the "${offer.title}" offer`)}
              className="mt-3 w-full rounded-full bg-accent-strong py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent"
            >
              Apply
            </button>
          </li>
        ))}
        {available.length === 0 && <EmptyNote>No eligible purchases match an available offer.</EmptyNote>}
      </ul>
      {(noMatch.length > 0 || inactive.length > 0) && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-faint">Other offers</p>
          <ul className="space-y-1.5">
            {noMatch.map(({ offer }) => (
              <li key={offer.id} className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="truncate">{offer.title}</span>
                <span className="shrink-0 text-faint">No matching purchase</span>
              </li>
            ))}
            {inactive.map((o) => (
              <li key={o.id} className={cx("flex items-center justify-between gap-2 text-xs text-faint")}>
                <span className="truncate">{o.title}</span>
                <Chip>{o.status === "applied" ? "Applied" : "Expired"}</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
