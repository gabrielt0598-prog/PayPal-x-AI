"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ChartLine, CircleDollarSign, Gift, Landmark, List, Plus, Repeat, Trophy } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { eligibleOffers, recurringSummary, upcomingCharges } from "@/lib/finance";
import type { Transaction } from "@/lib/types";
import { useClean } from "../AppState";
import { Bars, CompareLine } from "../charts";
import { asOfDate, cashbackIn, cumulative, daysInMonth, monthTotals, prevYm, ymOf } from "../data";
import { TxDrawer, TxRows } from "../TxTable";
import { amt, Avatar, Btn, Card, daysUntil, IconTile, Modal, money, monthName, monthShort, Page, Pill, Section, Segmented, shortDate, Skeleton } from "../ui";

const RANGES = ["Month", "3M", "Year"] as const;

export function HomePage() {
  const { state, loading } = useFinance();
  const { openAssistant } = useAssistantUI();
  const { go, rewards, moveMoney, toast } = useClean();
  const [range, setRange] = useState<(typeof RANGES)[number]>("Month");
  const [sel, setSel] = useState<Transaction | null>(null);
  const [move, setMove] = useState<"add" | "transfer" | null>(null);

  const d = useMemo(() => {
    if (!state) return null;
    const today = asOfDate(state);
    const ym = ymOf(today);
    const pym = prevYm(ym);
    const day = Number(today.slice(8, 10));
    const cur = cumulative(state.transactions, ym, day);
    const prev = cumulative(state.transactions, pym);
    const prevAtToday = prev[Math.min(day, prev.length) - 1] ?? 0;
    const spent = cur[cur.length - 1] ?? 0;
    // Weekly buckets for the last 13 weeks, monthly buckets for the year view.
    const end = Date.parse(`${today}T23:59:59Z`);
    const weeks = Array.from({ length: 13 }, (_, i) => {
      const to = end - (12 - i) * 7 * 86_400_000;
      const from = to - 7 * 86_400_000;
      const value = state.transactions.filter((t) => t.amount < 0 && t.category !== "Transfers" && Date.parse(t.date) > from && Date.parse(t.date) <= to).reduce((a, t) => a - t.amount, 0);
      const start = new Date(from + 86_400_000).toISOString().slice(0, 10);
      return { label: shortDate(start), title: `Week of ${shortDate(start)}`, value, current: i === 12, showLabel: i % 4 === 0 };
    });
    const months = [...new Set(state.transactions.map((t) => ymOf(t.date)))].sort().map((m) => ({ label: monthShort(m), title: monthName(m), value: monthTotals(state, m).spend, current: m === ym }));
    const sum = recurringSummary(state.recurring);
    return {
      ym,
      pym,
      day,
      cur,
      prev,
      spent,
      delta: spent - prevAtToday,
      prevAtToday,
      weeks,
      months,
      totals: monthTotals(state, ym),
      cashback: cashbackIn(state, ym),
      recurringMonthly: sum.totalMonthly,
      upcoming: upcomingCharges(state.recurring, state.asOf, 14).slice(0, 4),
      recent: [...state.transactions].reverse().filter((t) => t.category !== "Transfers").slice(0, 4),
      offers: eligibleOffers(state)
        .filter((e) => e.best)
        .sort((a, b) => (b.best?.cashback ?? 0) - (a.best?.cashback ?? 0)),
      today,
    };
  }, [state]);

  if (loading || !state || !d) return <HomeSkeleton />;
  const p = state.userProfile;
  const best = d.offers[0];
  const hour = Number(state.asOf.slice(11, 13));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Page title={`${greeting}, ${p.name.split(" ")[0]}`}>
      <div className="grid grid-cols-1 items-start gap-5 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="PayPal balance">
            <div className="flex flex-col gap-1.5 overflow-hidden rounded-[20px] bg-surface px-5 pb-1 pt-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex flex-1 flex-wrap items-center gap-3">
                  <span className="num text-[32px] font-semibold tracking-tight">{money(p.paypalBalance)}</span>
                  {p.autoReload.enabled && <Pill tone="pos">Auto-reload on</Pill>}
                </span>
                <Btn small onClick={() => go("account")}>
                  <List size={14} /> Details
                </Btn>
                <Btn small onClick={() => setMove("transfer")}>
                  <ArrowLeftRight size={14} /> Transfer
                </Btn>
                <Btn small kind="primary" onClick={() => setMove("add")}>
                  <Plus size={14} /> Add money
                </Btn>
              </div>
              <button type="button" onClick={() => go("account")} className="mt-1 flex items-center gap-2 self-start text-[15px] text-muted hover:text-text">
                <span className="flex h-5 w-8 items-center justify-end rounded bg-gradient-to-br from-[#0b3a8c] to-[#0070e0] px-1">
                  <span className="size-2 rounded-full bg-[#eb001b]" />
                  <span className="-ml-1 size-2 rounded-full bg-[#f79e1b]/90" />
                </span>
                USD · Debit card ••{p.card.last4}
              </button>
              <div className="-mx-5 mt-4">
                <TxRows rows={d.recent} selected={sel?.id} onOpen={setSel} />
                <div className="px-5 pb-3 pt-1.5">
                  <Btn kind="link" onClick={() => go("transactions")}>
                    See all transactions →
                  </Btn>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Spending">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-muted">
                    {range === "Month" ? `Spent in ${monthName(d.ym)} vs ${monthName(d.pym)}` : range === "3M" ? "Weekly spend · last 13 weeks" : "Monthly spend"}
                  </span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="num text-2xl font-semibold">
                      {money(range === "Month" ? d.spent : range === "3M" ? d.weeks.reduce((a, w) => a + w.value, 0) : d.months.reduce((a, m) => a + m.value, 0))}
                    </span>
                    {range === "Month" && (
                      <Pill tone={d.delta > 0 ? "neg" : "pos"}>
                        {d.delta > 0 ? "+" : "−"}
                        {amt(d.delta)} vs {monthShort(d.pym)} {d.day}
                      </Pill>
                    )}
                  </div>
                </div>
                <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
              </div>
              {range === "Month" ? (
                <CompareLine cur={d.cur} prev={d.prev} days={daysInMonth(d.ym)} today={d.day} curLabel={`${monthName(d.ym)} to date`} prevLabel={monthName(d.pym)} />
              ) : range === "3M" ? (
                <Bars bars={d.weeks} aria="Weekly spend for the last 13 weeks" />
              ) : (
                <Bars bars={d.months} aria="Monthly spend" />
              )}
            </Card>
          </Section>
        </div>

        <aside aria-label="Widgets" className="flex min-w-0 flex-col gap-5">
          {best?.best && (
            <Section title="Offers for you">
              <Card>
                <div className="flex items-start gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-bg text-accent">
                    <Gift size={18} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[17px] font-semibold leading-snug">{best.offer.title}</span>
                    <span className="text-sm leading-normal text-muted">
                      Matches your {money(-best.best.transaction.amount)} purchase on {shortDate(best.best.transaction.date)}. Earns {money(best.best.cashback)} back, through {shortDate(best.offer.validUntil)}.
                    </span>
                  </div>
                </div>
                <Btn kind="primary" className="w-full" onClick={() => openAssistant(`Apply the "${best.offer.title}" offer`)}>
                  Add offer
                </Btn>
                {d.offers.length > 1 && (
                  <Btn kind="link" className="self-start" onClick={() => go("offers")}>
                    {d.offers.length - 1} more offers →
                  </Btn>
                )}
              </Card>
            </Section>
          )}

          <Section title="Cash back">
            <Card>
              <div className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-bg text-accent">
                  <Trophy size={20} />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="num text-2xl font-semibold leading-tight">{money(rewards.pts / 100)}</span>
                  <span className="text-[13px] text-faint">
                    {rewards.pts.toLocaleString("en-US")} pts ready · {rewards.pending.toLocaleString("en-US")} pending
                  </span>
                </div>
              </div>
              <RewardsProgress />
              <Btn kind="primary" className="w-full" onClick={() => go("rewards")}>
                Redeem
              </Btn>
            </Card>
          </Section>

          <Section title={`${monthName(d.ym)} so far`}>
            <Card flush>
              {(
                [
                  [ChartLine, "Spent", money(d.totals.spend), () => go("transactions")],
                  [Landmark, "Income", money(d.totals.income), () => go("transactions")],
                  [CircleDollarSign, "Cash back", money(d.cashback), () => go("offers")],
                  [Repeat, "Recurring", `${money(d.recurringMonthly)}/mo`, () => go("recurring")],
                ] as const
              ).map(([Icon, k, v, fn], i) => (
                <button key={k} type="button" onClick={fn} className={`flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-white/[0.03] ${i ? "border-t border-border" : ""}`}>
                  <IconTile>
                    <Icon size={16} />
                  </IconTile>
                  <span className="min-w-0 flex-1 text-[15px]">{k}</span>
                  <span className="num whitespace-nowrap text-[15px]">{v}</span>
                </button>
              ))}
            </Card>
          </Section>

          <Section title="Upcoming" aside={<span className="text-sm text-faint">next 14 days</span>}>
            <Card flush>
              {d.upcoming.map((r) => (
                <button key={r.id} type="button" onClick={() => go("recurring")} className="flex w-full items-center gap-3 px-5 py-[13px] text-left hover:bg-white/[0.03]">
                  <Avatar name={r.merchant} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px]">{r.merchant}</span>
                    <span className="text-[13px] text-faint">
                      {shortDate(r.nextChargeDate)} · in {daysUntil(d.today, r.nextChargeDate)} days
                    </span>
                  </span>
                  <span className="num text-[15px]">
                    {r.kind === "variable" ? "~" : ""}
                    {money(r.amount)}
                    {r.cycle === "weekly" ? "/wk" : ""}
                  </span>
                </button>
              ))}
              {d.upcoming.length === 0 && <p className="px-5 py-4 text-sm text-muted">Nothing due in the next two weeks.</p>}
            </Card>
          </Section>
        </aside>
      </div>

      {sel && <TxDrawer tx={sel} onClose={() => setSel(null)} />}
      {move && (
        <MoveMoneyModal
          kind={move}
          bank={p.linkedBank}
          balance={p.paypalBalance}
          onClose={() => setMove(null)}
          onConfirm={async (n) => {
            if (await moveMoney(move, n)) toast(move === "add" ? `${money(n)} added from ${p.linkedBank}` : `${money(n)} sent to ${p.linkedBank}`, move === "add" ? "Available in your PayPal balance now" : "Arrives in 1–3 business days");
            setMove(null);
          }}
        />
      )}
    </Page>
  );
}

export function RewardsProgress() {
  const { state } = useFinance();
  const { rewards } = useClean();
  if (!state) return null;
  const ym = ymOf(state.asOf);
  const spend = state.transactions.filter((t) => t.amount < 0 && t.category === rewards.cat && ymOf(t.date) === ym).reduce((a, t) => a - t.amount, 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex text-[13px]">
        <span className="flex-1 text-muted">5% on {rewards.cat.toLowerCase()} this month</span>
        <span className="num font-semibold">{money(Math.min(spend, 1000))} / $1,000</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(1, Math.min(spend, 1000) / 10)}%` }} />
      </div>
    </div>
  );
}

function MoveMoneyModal({ kind, bank, balance, onClose, onConfirm }: { kind: "add" | "transfer"; bank: string; balance: number; onClose: () => void; onConfirm: (n: number) => Promise<void> }) {
  const [n, setN] = useState(100);
  const [busy, setBusy] = useState(false);
  const after = kind === "add" ? balance + n : balance - n;
  const chips = [50, 100, 250, 500];
  return (
    <Modal label={kind === "add" ? "Add money" : "Transfer to bank"} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-faint">Amount</span>
        <span className="num text-[40px] font-semibold tracking-tight">{money(n)}</span>
      </div>
      <div role="group" aria-label="Amount" className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Btn key={c} small kind={c === n ? "primary" : "secondary"} aria-pressed={c === n} onClick={() => setN(c)}>
            {money(c).replace(".00", "")}
          </Btn>
        ))}
      </div>
      <div className="rounded-xl bg-surface-2 px-3.5">
        <div className="flex py-3 text-[13px]">
          <span className="flex-1 text-muted">{kind === "add" ? "From" : "To"}</span>
          <span className="font-medium">{bank}</span>
        </div>
        <div className="flex border-t border-border py-3 text-[13px]">
          <span className="flex-1 text-muted">Arrives</span>
          <span className="font-medium">{kind === "add" ? "Instantly" : "1–3 business days"}</span>
        </div>
        <div className="flex border-t border-border py-3 text-[13px]">
          <span className="flex-1 text-muted">Balance after</span>
          <span className="num font-medium">{money(after)}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          kind="primary"
          disabled={busy || (kind === "transfer" && n > balance)}
          onClick={async () => {
            setBusy(true);
            await onConfirm(n);
          }}
        >
          {kind === "add" ? `Add ${money(n)}` : `Transfer ${money(n)}`}
        </Btn>
      </div>
    </Modal>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-[440px]" />
        <Skeleton className="h-[440px]" />
      </div>
    </div>
  );
}
