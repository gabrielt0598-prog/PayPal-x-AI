"use client";

import { useMemo, useState } from "react";
import { Check, Clock, Plus } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { eligibleOffers } from "@/lib/finance";
import type { Offer, Transaction } from "@/lib/types";
import { useClean } from "../AppState";
import { cashbackIn } from "../data";
import { Avatar, Btn, cx, Drawer, KV, money, monthShort, Page, Panel, Pill, shortDate, Skeleton } from "../ui";

type Kind = "Available" | "Added" | "Pending" | "Earned" | "Expired";
const FILTERS = ["All", "Available", "Added", "Pending", "Earned", "Expired"] as const;

const STEPS = [
  ["Add an offer", "PayPal AI applies it to a matching purchase"],
  ["Pay with PayPal", "Online, in store or with your Debit Card"],
  ["Get cash back", "Added straight to your PayPal balance"],
] as const;

/** "$10 back on $75+ at Uniqlo" → "$10 back on $75+" (the merchant is shown separately). */
const shortTitle = (o: Offer) => o.title.replace(new RegExp(`\\s+at\\s+${o.merchant.split(" ")[0]}.*$`, "i"), "");

export function OffersPage() {
  const { state, loading, refresh } = useFinance();
  const { openAssistant } = useAssistantUI();
  const { toast } = useClean();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState<Offer | null>(null);

  const d = useMemo(() => {
    if (!state) return null;
    const matches = new Map(eligibleOffers(state).map((e) => [e.offer.id, e.best]));
    const kind = (o: Offer): Kind => ({ available: "Available", added: "Added", pending: "Pending", applied: "Earned", expired: "Expired" } as const)[o.status];
    const rank = (o: Offer) => (matches.get(o.id) ? 0 : { Available: 1, Added: 2, Pending: 3, Earned: 4, Expired: 5 }[kind(o)]);
    const ordered = [...state.offers].sort((a, b) => rank(a) - rank(b) || (matches.get(b.id)?.cashback ?? 0) - (matches.get(a.id)?.cashback ?? 0));
    const credit = new Map(state.transactions.filter((t) => t.category === "Cashback").map((t) => [t.description, t]));
    const earnedOn = (o: Offer) => state.transactions.find((t) => t.id === o.appliedToTransactionId);
    const earnedAmt = (o: Offer) => credit.get(`Cash back — ${o.title}`)?.amount ?? 0;
    const count = (k: Kind) => state.offers.filter((o) => kind(o) === k).length;
    return {
      matches,
      kind,
      ordered,
      earnedOn,
      earnedAmt,
      count,
      best: ordered.find((o) => matches.get(o.id)),
      pending: state.offers.reduce((a, o) => a + (o.status === "pending" ? (o.pendingCashback ?? 0) : 0), 0),
      claimable: [...matches.values()].reduce((a, m) => a + (m?.cashback ?? 0), 0),
      earnedMonth: cashbackIn(state, state.asOf.slice(0, 7)),
      ym: state.asOf.slice(0, 7),
    };
  }, [state]);

  if (loading || !state || !d) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const shown = d.ordered.filter((o) => filter === "All" || d.kind(o) === filter);
  const bm = d.best ? d.matches.get(d.best.id) : null;
  const apply = (o: Offer) => openAssistant(`Apply the "${o.title}" offer`);
  const setAdded = async (o: Offer, added: boolean) => {
    const res = await fetch("/api/demo/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: o.id, added }) });
    if (!res.ok) return toast("Couldn’t update the offer");
    await refresh();
    toast(added ? `${shortTitle(o)} at ${o.merchant} added` : "Offer removed", added ? `Pay with PayPal at ${o.merchant} by ${shortDate(o.validUntil)} to earn it` : undefined);
  };

  return (
    <Page
      title="Offers"
      actions={
        <span className="flex flex-wrap gap-2">
          <Pill tone="pos">
            Earned in {monthShort(d.ym)} · {money(d.earnedMonth)}
          </Pill>
          {d.pending > 0 && <Pill tone="warn">Pending · {money(d.pending)}</Pill>}
          {d.claimable > 0 && <Pill tone="acc">To claim · {money(d.claimable)}</Pill>}
        </span>
      }
    >
      <ol aria-label="How offers work" className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
        {STEPS.map(([t, s], i) => (
          <li key={t} className="flex items-center gap-3 rounded-[20px] bg-surface px-4 py-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-bg text-[13px] font-semibold text-accent">{i + 1}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t}</span>
              <span className="text-xs text-faint">{s}</span>
            </span>
          </li>
        ))}
      </ol>

      {d.best && bm && (
        <section aria-label="Best match" className="flex items-center gap-5 rounded-[20px] bg-[#0a1f4d] p-7 text-white">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-[#7fb8ff]">✦ BEST MATCH FOR YOU</span>
            <h2 className="text-[34px] font-semibold leading-tight">
              {shortTitle(d.best)} at {d.best.merchant}
            </h2>
            <p className="text-sm leading-normal text-[#b8cdf5]">
              Matches your {money(-bm.transaction.amount)} purchase on {shortDate(bm.transaction.date)}. Add it now and get {money(bm.cashback)} back, through {shortDate(d.best.validUntil)}.
            </p>
            <div className="flex flex-wrap gap-2 pt-1.5">
              <button type="button" onClick={() => apply(d.best!)} className="h-10 rounded-full bg-white px-[18px] text-sm font-medium text-[#0a1f4d]">
                Add offer
              </button>
              <button type="button" onClick={() => setOpen(d.best!)} className="h-10 rounded-full border border-white/40 px-[18px] text-sm font-medium text-white hover:bg-white/10">
                See terms
              </button>
            </div>
          </div>
          <span aria-hidden className="hidden size-24 shrink-0 items-center justify-center rounded-[20px] bg-[#071637] text-4xl font-semibold @2xl:flex">
            {d.best.merchant.charAt(0)}
          </span>
        </section>
      )}

      <div role="group" aria-label="Filter offers" className="flex flex-wrap gap-2">
        {FILTERS.filter((f) => f !== "Expired" || d.count(f) > 0).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cx("h-[34px] rounded-full px-3.5 text-[13px] font-medium", filter === f ? "bg-white text-[#0a0a0a]" : "bg-surface text-muted hover:text-text")}
          >
            {f} · {f === "All" ? state.offers.length : d.count(f)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        {shown.map((o) => {
          const k = d.kind(o);
          const m = d.matches.get(o.id);
          const on = d.earnedOn(o);
          return (
            <article key={o.id} className={cx("flex flex-col gap-2.5 rounded-[20px] bg-surface px-4 py-3.5", k === "Expired" && "opacity-60")}>
              <div className="flex items-center gap-3">
                <Avatar name={o.merchant} />
                <button type="button" onClick={() => setOpen(o)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                  <span className="truncate text-[15px] font-semibold">{shortTitle(o)}</span>
                  <span className="truncate text-xs text-faint">
                    {o.merchant} · {k === "Expired" ? "ended" : "ends"} {shortDate(o.validUntil)} · View terms
                  </span>
                </button>
                <OfferButton kind={k} matched={!!m} label={o.title} onAdd={() => (m ? apply(o) : k === "Added" ? setOpen(o) : setAdded(o, true))} />
              </div>
              <OfferLine offer={o} kind={k} match={m ?? null} earned={on} amount={d.earnedAmt(o)} />
            </article>
          );
        })}
      </div>

      {open && (
        <OfferDrawer
          offer={open}
          kind={d.kind(open)}
          match={d.matches.get(open.id) ?? null}
          onAdd={() => {
            if (d.matches.get(open.id)) apply(open);
            else void setAdded(open, d.kind(open) !== "Added");
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </Page>
  );
}

function OfferButton({ kind, matched, label, onAdd }: { kind: Kind; matched: boolean; label: string; onAdd: () => void }) {
  if (kind === "Expired") return null;
  if (kind === "Earned" || kind === "Pending")
    return (
      <span aria-label={`${label}: ${kind === "Earned" ? "cash back earned" : "cash back pending"}`} className={cx("flex size-11 shrink-0 items-center justify-center rounded-full", kind === "Earned" ? "bg-positive-bg text-positive" : "bg-warning-bg text-warning")}>
        <Check size={18} />
      </span>
    );
  if (kind === "Added" && !matched)
    return (
      <button type="button" onClick={onAdd} aria-label={`${label}: added. See terms or remove`} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-bg text-accent">
        <Check size={18} />
      </button>
    );
  return (
    <button type="button" onClick={onAdd} aria-label={matched ? `Apply ${label}` : `Add ${label}`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong text-text transition hover:bg-white/[0.06]">
      <Plus size={18} />
    </button>
  );
}

function OfferLine({ offer: o, kind, match, earned, amount }: { offer: Offer; kind: Kind; match: { transaction: Transaction; cashback: number } | null; earned?: Transaction; amount: number }) {
  if (kind === "Earned")
    return (
      <span className="text-xs font-medium text-positive">
        ✓ {money(amount)} earned{earned ? ` on your ${shortDate(earned.date)} purchase` : ""}
      </span>
    );
  if (kind === "Pending")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-warning">
        <Clock size={12} /> {money(o.pendingCashback ?? 0)} pending{earned ? ` from your ${shortDate(earned.date)} purchase` : ""}
        {o.postsOn ? ` · posts by ${shortDate(o.postsOn)}` : ""}
      </span>
    );
  if (kind === "Expired") return <span className="text-xs font-medium text-faint">This offer has ended.</span>;
  if (match)
    return (
      <span className="text-xs font-medium text-muted">
        Matched to your {money(-match.transaction.amount)} purchase on {shortDate(match.transaction.date)} · earns {money(match.cashback)}
      </span>
    );
  if (kind === "Added") return <span className="text-xs font-medium text-accent">Added · pay with PayPal at {o.merchant} by {shortDate(o.validUntil)} to earn it</span>;
  return <span className="text-xs font-medium text-faint">Add it, then pay with PayPal at {o.merchant} to earn it.</span>;
}

function OfferDrawer({ offer: o, kind, match, onAdd, onClose }: { offer: Offer; kind: Kind; match: { transaction: Transaction; cashback: number } | null; onAdd: () => void; onClose: () => void }) {
  const earn = o.type === "percent_cashback" ? `${o.value}%${o.maxCashback ? `, up to ${money(o.maxCashback)}` : ""}` : money(o.value);
  return (
    <Drawer label="Offer" onClose={onClose}>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <span className="text-[32px] font-semibold leading-tight tracking-tight">{shortTitle(o)}</span>
          <span className="text-sm font-medium text-muted">{o.merchant}</span>
        </div>
        <Avatar name={o.merchant} size={56} />
      </div>
      <Pill tone={kind === "Earned" ? "pos" : kind === "Pending" ? "warn" : kind === "Expired" ? "neu" : "acc"} className="self-start">
        {match ? "Matches a purchase" : kind}
      </Pill>
      {(kind === "Available" || kind === "Added") && (
        <Btn kind={kind === "Added" && !match ? "secondary" : "primary"} onClick={onAdd}>
          {match ? `Apply offer · ${money(match.cashback)} back` : kind === "Added" ? "Remove offer" : "Add offer"}
        </Btn>
      )}
      <Panel>
        <KV first k="Cash back" v={earn} />
        <KV k="Minimum spend" v={o.minSpend ? money(o.minSpend) : "None"} />
        <KV k="Valid" v={`${shortDate(o.validFrom)} – ${shortDate(o.validUntil)}`} />
        <KV k="Pay with" v="PayPal or PayPal Debit Card" />
      </Panel>
      <p className="text-[13px] leading-normal text-muted">{o.description}</p>
      <h3 className="text-[13px] font-semibold">How this offer works</h3>
      <ol aria-label="Offer steps" className="flex flex-col gap-3">
        {STEPS.map(([t, s], i) => (
          <li key={t} className="flex items-start gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-bg text-xs font-semibold text-accent">{i + 1}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium">{t}</span>
              <span className="text-xs text-faint">{s}</span>
            </span>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}
