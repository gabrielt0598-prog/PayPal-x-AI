"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { eligibleOffers } from "@/lib/finance";
import type { Offer } from "@/lib/types";
import { Avatar, Btn, cx, money, Page, Pill, Segmented, shortDate, Skeleton } from "../ui";

const FILTERS = ["All", "Matched", "Applied", "Expired"] as const;

const STEPS = [
  ["Add an offer", "PayPal AI applies it for you"],
  ["Pay with PayPal", "Online, in store or with your Debit Card"],
  ["Get cash back", "Lands in your PayPal balance"],
] as const;

export function OffersPage() {
  const { state, loading } = useFinance();
  const { openAssistant } = useAssistantUI();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const d = useMemo(() => {
    if (!state) return null;
    const matches = new Map(eligibleOffers(state).map((e) => [e.offer.id, e.best]));
    const kind = (o: Offer) => (o.status === "applied" ? "Applied" : o.status === "expired" ? "Expired" : matches.get(o.id) ? "Matched" : "Available");
    const ordered = [...state.offers].sort((a, b) => {
      const rank = (o: Offer) => ({ Matched: 0, Available: 1, Applied: 2, Expired: 3 })[kind(o)];
      return rank(a) - rank(b) || (matches.get(b.id)?.cashback ?? 0) - (matches.get(a.id)?.cashback ?? 0);
    });
    const best = ordered.find((o) => kind(o) === "Matched");
    return { matches, kind, ordered, best, claimable: [...matches.values()].reduce((a, m) => a + (m?.cashback ?? 0), 0) };
  }, [state]);

  if (loading || !state || !d) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const shown = d.ordered.filter((o) => filter === "All" || d.kind(o) === filter);
  const bestMatch = d.best ? d.matches.get(d.best.id) : null;

  return (
    <Page title="Offers" actions={d.claimable > 0 ? <Pill tone="pos">{money(d.claimable)} to claim</Pill> : null}>
      <ol aria-label="How offers work" className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
        {STEPS.map(([t, s], i) => (
          <li key={t} className="flex items-center gap-3 rounded-[20px] bg-surface p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold">{i + 1}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t}</span>
              <span className="text-xs text-faint">{s}</span>
            </span>
          </li>
        ))}
      </ol>

      {d.best && bestMatch && (
        <section aria-label="Best match" className="flex flex-wrap items-center gap-5 rounded-[20px] bg-[#0a1f4d] p-7 text-white">
          <div className="flex min-w-[260px] flex-1 flex-col gap-2">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-[#7fb8ff]">✦ BEST MATCH FOR YOU</span>
            <h2 className="text-[34px] font-semibold leading-tight">{d.best.title}</h2>
            <p className="max-w-[36em] text-[15px] leading-normal text-[#b8cdf5]">
              Matches your {money(-bestMatch.transaction.amount)} purchase on {shortDate(bestMatch.transaction.date)}. Earns {money(bestMatch.cashback)}, through {shortDate(d.best.validUntil)}.
            </p>
          </div>
          <Btn kind="primary" onClick={() => openAssistant(`Apply the "${d.best!.title}" offer`)}>
            <Sparkles size={14} /> Apply with PayPal AI
          </Btn>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">All offers</h2>
        <Segmented label="Filter" value={filter} options={FILTERS} onChange={setFilter} />
      </div>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {shown.map((o) => {
          const k = d.kind(o);
          const m = d.matches.get(o.id);
          return (
            <article key={o.id} className={cx("flex flex-col gap-3 rounded-[20px] bg-surface p-5", k === "Expired" && "opacity-60")}>
              <div className="flex items-start gap-3">
                <Avatar name={o.merchant} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{o.title}</span>
                  <span className="text-[13px] text-faint">{o.merchant}</span>
                </div>
                <Pill tone={k === "Matched" ? "pos" : k === "Applied" ? "acc" : "neu"}>{k}</Pill>
              </div>
              <p className="text-[13px] leading-normal text-muted">{o.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
                <span>Ends {shortDate(o.validUntil)}</span>
                {o.minSpend ? <span>Min {money(o.minSpend)}</span> : null}
                {m ? <span className="text-positive">+{money(m.cashback)} on {shortDate(m.transaction.date)}</span> : null}
              </div>
              {k === "Matched" && (
                <Btn small kind="primary" className="mt-auto" onClick={() => openAssistant(`Apply the "${o.title}" offer`)}>
                  Apply {money(m!.cashback)}
                </Btn>
              )}
              {k === "Applied" && (
                <span className="mt-auto flex items-center gap-1.5 text-[13px] text-accent">
                  <Check size={14} /> Cash back added to your balance
                </span>
              )}
              {k === "Available" && <span className="mt-auto text-[13px] text-faint">No matching purchase yet. Pay with PayPal at {o.merchant} to earn it.</span>}
            </article>
          );
        })}
      </div>
    </Page>
  );
}
