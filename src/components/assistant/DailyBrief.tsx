"use client";

// Stella's daily brief: when you open the app, a short "what happened so far today" instead of a blank prompt, then
// starter prompts. It shows what changed and what needs attention; the page itself keeps the standing numbers.
// With no activity today it renders nothing and the panel falls back to its plain greeting.

import { useMemo, type ReactNode } from "react";
import { useFinance } from "@/components/state/AppProviders";
import { useClean } from "@/components/clean/AppState";
import { asOfDate, ymOf } from "@/components/clean/data";
import { DEFAULT_STATE, loadBudget, spentIn } from "@/components/clean/budget/model";
import { Avatar, money } from "@/components/clean/ui";
import { Sparkles } from "@/components/clean/SparkleIcon";

interface Row {
  key: string;
  who: string;
  sub: string;
  value: ReactNode;
}

export function useDailyBrief() {
  const { state } = useFinance();
  const { rewards } = useClean();
  return useMemo(() => {
    if (!state) return null;
    const today = asOfDate(state);
    const ym = ymOf(today);
    const bought = state.transactions.filter((t) => t.date.slice(0, 10) === today && t.amount < 0 && t.category !== "Transfers" && t.category !== "Cashback");
    const spentToday = Math.round(bought.reduce((a, t) => a - t.amount, 0) * 100) / 100;
    const ptsToday = rewards.log.filter((l) => l.date === today && l.pts > 0).reduce((a, l) => a + l.pts, 0);
    if (!bought.length && !ptsToday) return null;

    const bud = loadBudget() ?? DEFAULT_STATE;
    const rowsB = bud.items.map((i) => ({ item: i, sp: spentIn(state.transactions, i.cat, ym), lim: bud.limits[i.id] ?? 0 }));
    const spentMonth = rowsB.reduce((a, r) => a + r.sp, 0);
    const over = rowsB.filter((r) => r.lim && r.sp > r.lim).sort((a, b) => b.sp - b.lim - (a.sp - a.lim))[0];
    const pushedBy = over ? bought.find((t) => t.category === over.item.cat) : undefined;

    const tomorrow = new Date(`${today}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tmr = tomorrow.toISOString().slice(0, 10);
    const renewing = state.recurring.find((r) => r.status === "active" && r.nextChargeDate === tmr);

    const rows: Row[] = [
      ...bought.slice(0, 3).map((t) => ({ key: t.id, who: t.merchant, sub: `${t.category} · card ••${state.userProfile.card.last4}`, value: <span>−{money(-t.amount)}</span> })),
      ...(ptsToday ? [{ key: "pts", who: rewards.log.find((l) => l.date === today && l.pts > 0)?.merchant ?? "PayPal Rewards", sub: "5% cash back in points", value: <span className="text-positive">+{ptsToday.toLocaleString("en-US")} pts</span> }] : []),
      ...(renewing ? [{ key: "renew", who: renewing.merchant, sub: `Renews tomorrow · ${renewing.plan}`, value: <span className="text-muted">{money(renewing.amount)}</span> }] : []),
    ];
    return {
      dateLabel: new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      spentToday,
      purchases: bought.length,
      ptsToday,
      left: bud.total - spentMonth,
      rows,
      headsUp: over ? { title: `${over.item.name} is ${money(over.sp - over.lim)} over its ${money(over.lim)} limit`, sub: pushedBy ? `${pushedBy.merchant} pushed it over today. Want me to look at your ${over.item.name} limit?` : `Want me to look at your ${over.item.name} limit?` } : null,
    };
  }, [state, rewards.log]);
}

export function DailyBrief({ brief, firstName, starters, onAsk }: { brief: NonNullable<ReturnType<typeof useDailyBrief>>; firstName: string; starters: [string, string][]; onAsk: (prompt: string) => void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const tiles: [string, string][] = [["Spent today", money(brief.spentToday)], ...(brief.ptsToday ? [["Earned", `+${brief.ptsToday.toLocaleString("en-US")} pts`] as [string, string]] : []), ["Left to spend", money(brief.left)]];
  return (
    <div className="m-rise flex flex-col gap-4 pb-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-bg text-accent">
          <Sparkles size={20} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-base font-semibold">
            {greeting}, {firstName}
          </span>
          <span className="text-[13px] text-faint">Here’s what happened so far today · {brief.dateLabel}</span>
        </span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
        {tiles.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface-2 p-3">
            <span className="text-[11px] text-faint">{k}</span>
            <span className="num truncate text-base font-semibold tracking-tight">{v}</span>
          </div>
        ))}
      </div>
      <div className="rounded-[10px] border border-border bg-surface-2 px-3.5">
        {brief.rows.map((r, i) => (
          <div key={r.key} className={`flex items-center gap-2.5 py-3.5 ${i ? "border-t border-border" : ""}`}>
            <Avatar name={r.who} size={28} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] font-medium">{r.who}</span>
              <span className="truncate text-xs text-faint">{r.sub}</span>
            </span>
            <span className="num shrink-0 text-[13px] font-semibold">{r.value}</span>
          </div>
        ))}
      </div>
      {brief.headsUp && (
        <div role="note" className="flex flex-col gap-1 rounded-[10px] border border-warning/30 bg-warning-bg px-3.5 py-3">
          <span className="text-[13px] font-semibold text-warning">{brief.headsUp.title}</span>
          <span className="text-[13px] leading-normal">{brief.headsUp.sub}</span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-faint">Try asking</span>
        <div className="flex flex-wrap gap-2">
          {starters.map(([label, prompt]) => (
            <button key={label} type="button" onClick={() => onAsk(prompt)} className="h-9 whitespace-nowrap rounded-full border border-border-strong bg-transparent px-3.5 text-[13px] text-muted transition hover:text-text">
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
