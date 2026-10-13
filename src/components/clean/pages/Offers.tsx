"use client";

import { useMemo, useState } from "react";
import { CircleHelp, Clock } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { eligibleOffers } from "@/lib/finance";
import type { Offer } from "@/lib/types";
import { useClean } from "../AppState";
import { Logo, logoMark } from "../Logo";
import { Avatar, Btn, cx, Drawer, money, money0, shortDate, Skeleton } from "../ui";

type Kind = "available" | "added" | "pending" | "earned" | "expired";

/** The design's fictional marks for the live demo merchants. */
const MARK: Record<string, string> = { Uniqlo: "thistle", DoorDash: "plateful", Uber: "hopline", Amazon: "cartly", Target: "corevale", "Whole Foods": "greenfold" };
const markFor = (merchant: string) => MARK[merchant] ?? logoMark(merchant) ?? "unknown";

const WHERE: Record<string, string> = {
  Uniqlo: "uniqlo.com and US stores",
  DoorDash: "DoorDash app and website",
  Uber: "Uber rides in the US",
  Amazon: "amazon.com",
  Target: "target.com and stores",
  "Whole Foods": "Whole Foods Market stores",
};

const STEPS = [
  ["Add an offer", "It’s saved to your PayPal account"],
  ["Pay with PayPal", "Online, in store or with your Debit Card"],
  ["Get cash back", "Pending 3–5 days, then added to your balance"],
] as const;

const kindOf = (o: Offer): Kind => (o.status === "applied" ? "earned" : o.status);
/** "$10 back on $75+" -> "$10 back" (the design's drawer title). */
const lead = (o: Offer) => o.title.split(" on ")[0];

export function OffersPage() {
  const { state, loading, refresh } = useFinance();
  const { openAssistant } = useAssistantUI();
  const { toast } = useClean();
  const [openId, setOpenId] = useState<string | null>(null);

  const d = useMemo(() => {
    if (!state) return null;
    const matches = new Map(eligibleOffers(state).map((e) => [e.offer.id, e.best]));
    const credit = new Map(state.transactions.filter((t) => t.category === "Cashback").map((t) => [t.description, t.amount]));
    const earnedAmt = (o: Offer) => credit.get(`Cash back — ${o.title}`) ?? 0;
    // The featured card is the first available offer that came with a "why it matched" note.
    const featured = state.offers.find((o) => o.status === "available" && o.matchNote)?.id;
    return { matches, earnedAmt, featured };
  }, [state]);

  if (loading || !state || !d) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const sel = state.offers.find((o) => o.id === openId) ?? null;

  const apply = (o: Offer) => openAssistant(`Apply the "${o.title}" offer`);
  const setAdded = async (o: Offer, added: boolean) => {
    const res = await fetch("/api/demo/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: o.id, added }) });
    if (!res.ok) return toast("Couldn’t update the offer");
    await refresh();
    if (added) toast(`Offer added · ${o.title} at ${o.merchant}`, `Pay with PayPal or your Debit Card by ${shortDate(o.validUntil)}`);
    else toast("Offer removed", `${o.title} at ${o.merchant}`, { kind: "warn" });
  };
  /** Add (or apply, when a purchase already matches) an available offer; remove an added one. */
  const toggle = (o: Offer) => {
    const k = kindOf(o);
    if (k !== "available" && k !== "added") return;
    if (k === "available" && d.matches.get(o.id)) return apply(o);
    void setAdded(o, k === "available");
  };
  const ctaLabel = (o: Offer, k: Kind) =>
    k === "available" ? "Add offer" : k === "added" ? "Added" : k === "pending" ? `Pending · ${money(o.pendingCashback ?? 0)}` : k === "earned" ? `Redeemed · ${money(d.earnedAmt(o))}` : "Expired";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[18px]">
      <header className="flex items-center gap-2">
        <span className="flex items-center gap-3">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-strong text-lg font-bold italic text-white">
            P
          </span>
          <h1 className="text-2xl font-semibold leading-tight">Offers</h1>
        </span>
        <span className="group relative inline-flex">
          <button type="button" aria-label="How offers work" className="flex size-7 items-center justify-center rounded-full text-muted">
            <CircleHelp size={18} />
          </button>
          <div role="tooltip" className="absolute left-[-6px] top-[calc(100%+8px)] z-30 hidden w-80 max-w-[calc(100vw-48px)] flex-col gap-3.5 rounded-[14px] border border-border-strong bg-surface-2 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.5)] group-focus-within:flex group-hover:flex">
            <span className="mb-2 text-lg font-semibold leading-tight">How offers work</span>
            <ol className="flex flex-col">
              {STEPS.map(([t, s], i) => (
                <li key={t} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
                  <span className="flex flex-col items-center">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-bg text-[13px] font-semibold text-accent">{i + 1}</span>
                    {i < STEPS.length - 1 && <span aria-hidden className="mx-auto my-1 min-h-3 w-0.5 flex-auto rounded-sm bg-border-strong" />}
                  </span>
                  <span className={cx("flex flex-col gap-0.5 pt-0.5", i < STEPS.length - 1 && "pb-3.5")}>
                    <span className="text-sm font-semibold">{t}</span>
                    <span className="text-xs leading-snug text-faint">{s}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </span>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {state.offers.map((o) => {
          const k = kindOf(o);
          const feat = d.featured === o.id && k === "available";
          const locked = k === "pending" || k === "earned" || k === "expired";
          return (
            <article key={o.id} className={cx("flex h-full flex-col gap-4 rounded-[20px] p-5", feat ? "bg-[#0a1f4d] text-white" : cx("bg-surface", k === "added" && "border border-accent"))}>
              <div className="flex items-center gap-3">
                <Logo mark={markFor(o.merchant)} size={28} />
                <span className={cx("min-w-0 text-[22px] font-bold leading-7 tracking-[-0.01em]", feat ? "text-white" : "text-text")}>{o.merchant}</span>
                {feat && <span className="ml-auto text-[11px] font-semibold tracking-[0.08em] text-[#7fb8ff]">✦ BEST MATCH</span>}
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setOpenId(o.id)} aria-label={`${o.merchant} offer details`} className={cx("text-left text-base font-medium leading-5", feat ? "text-white" : "text-text")}>
                  {o.title}
                </button>
                <span className={cx("flex items-center gap-1.5 text-[13px]", feat ? "text-[#b8cdf5]" : "text-muted")}>
                  <Clock size={16} />
                  <span>Expires {shortDate(o.validUntil)}</span>
                </span>
              </div>
              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={() => toggle(o)}
                  disabled={locked}
                  aria-label={k === "available" ? `Add ${o.title} at ${o.merchant}` : k === "added" ? `Remove ${o.title} at ${o.merchant}` : `Cash back ${k}`}
                  className={cx(
                    "inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition",
                    k === "added" ? "bg-accent-bg text-accent" : feat ? "bg-white text-[#0a1f4d]" : k === "available" ? "bg-white text-[#0a0a0a] hover:bg-white/90" : "bg-white/[0.08] text-text",
                    locked && "cursor-default opacity-70",
                  )}
                >
                  {ctaLabel(o, k)}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {sel && <OfferDrawer offer={sel} kind={kindOf(sel)} cta={ctaLabel(sel, kindOf(sel))} onAdd={() => toggle(sel)} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function OfferDrawer({ offer: o, kind, cta, onAdd, onClose }: { offer: Offer; kind: Kind; cta: string; onAdd: () => void; onClose: () => void }) {
  const earn = o.type === "percent_cashback" ? `${o.value}%${o.maxCashback ? `, up to ${money0(o.maxCashback)}` : ""}` : `${money0(o.value)}, once`;
  const min = o.minSpend ? `${money0(o.minSpend)} in one ${o.merchant === "DoorDash" ? "order" : "purchase"}` : "None";
  const rows: [string, string][] = [
    ["Cash back", earn],
    ["Minimum spend", min],
    ["Ends", `${shortDate(o.validUntil)}, ${o.validUntil.slice(0, 4)}`],
    ["Where", WHERE[o.merchant] ?? o.merchant],
    ["Pay with", "PayPal or PayPal Debit Card"],
  ];
  return (
    <Drawer label="Offer" onClose={onClose}>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <span className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em]">{lead(o)}</span>
        </div>
        <Avatar name={o.merchant} size={48} className="text-lg" />
      </div>
      <div className="rounded-[10px] border border-border bg-surface-2 px-3.5">
        {rows.map(([k, v], i) => (
          <div key={k} className={cx("flex items-center gap-3 py-4", i > 0 && "border-t border-border")}>
            <span className="flex-1 text-[13px] text-muted">{k}</span>
            <span className="text-right text-[13px] font-medium">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col pt-2">
        {kind === "available" && <Btn kind="primary" onClick={onAdd}>Add offer</Btn>}
        {kind === "added" && (
          <Btn onClick={onAdd} className="!bg-accent-bg !text-accent">
            Added
          </Btn>
        )}
        {kind !== "available" && kind !== "added" && (
          <Btn disabled className="!opacity-70">
            {cta}
          </Btn>
        )}
      </div>
    </Drawer>
  );
}
