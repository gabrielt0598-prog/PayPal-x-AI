"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, House, Play, Repeat, ShieldCheck, Sparkles } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { monthlyCost, recurringSummary, unusedSubscriptions } from "@/lib/finance";
import type { RecurringPayment } from "@/lib/types";
import { asOfDate, daysInMonth, ymOf } from "../data";
import { Avatar, Btn, Card, cx, Drawer, GRID4, KV, money, monthName, Page, Panel, Pill, Section, shortDate, Skeleton, TableHead } from "../ui";

const CHANNEL = {
  paypal_subscriptions_api: "PayPal Subscriptions API",
  kernel_browser: "Kernel cloud browser on the merchant’s site",
  none: "Can’t be cancelled from PayPal",
} as const;

function nextYm(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function RecurringPage() {
  const { state, loading } = useFinance();
  const [sel, setSel] = useState<RecurringPayment | null>(null);
  const [calYm, setCalYm] = useState<string | null>(null);
  const [calDay, setCalDay] = useState<number | null>(null);

  const d = useMemo(() => {
    if (!state) return null;
    const today = asOfDate(state);
    const subs = state.recurring.filter((r) => r.kind === "subscription").sort((a, b) => (a.status === b.status ? a.nextChargeDate.localeCompare(b.nextChargeDate) : a.status === "active" ? -1 : 1));
    const bills = state.recurring.filter((r) => r.kind !== "subscription").sort((a, b) => a.nextChargeDate.localeCompare(b.nextChargeDate));
    return { today, subs, bills, sum: recurringSummary(state.recurring), unused: new Set(unusedSubscriptions(state.recurring, state.asOf).map((r) => r.id)) };
  }, [state]);

  if (loading || !state || !d) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const subsActive = d.subs.filter((s) => s.status === "active");
  const ym = calYm ?? ymOf(d.today);
  const cells = (() => {
    const [y, m] = ym.split("-").map(Number);
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const n = daysInMonth(ym);
    const byDay = new Map<number, RecurringPayment[]>();
    for (const r of state.recurring) {
      if (r.status !== "active" || r.cycle !== "monthly" || !r.billingDay) continue;
      byDay.set(r.billingDay, [...(byDay.get(r.billingDay) ?? []), r]);
    }
    return { lead, n, byDay };
  })();
  const todayDay = ymOf(d.today) === ym ? Number(d.today.slice(8, 10)) : null;
  const dayList = calDay ? cells.byDay.get(calDay) ?? [] : [];

  const stats = [
    [Repeat, "Per month", money(d.sum.totalMonthly), `${d.sum.activeCount} active payments`],
    [Play, "Subscriptions", `${money(d.sum.subscriptionsMonthly)}/mo`, `${d.sum.subscriptionCount} active · ${d.unused.size} unused`],
    [House, "Bills", `${money(d.sum.billsMonthly)}/mo`, "Rent, utilities, transit"],
    [CalendarIcon, "Per year", money(d.sum.totalMonthly * 12), "At today’s prices"],
  ] as const;

  return (
    <Page title="Recurring">
      <Section title="Summary">
        <div className="grid grid-cols-2 overflow-hidden rounded-[20px] bg-surface @3xl:grid-cols-4">
          {stats.map(([Icon, k, v, sub], i) => (
            <div key={k} className={cx("flex min-w-0 flex-col gap-7 p-5", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border @3xl:border-t-0", i === 2 && "@3xl:border-l")}>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3">
                  <Icon size={16} />
                </span>
                <span className="text-sm text-muted">{k}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="num truncate text-[26px] font-semibold tracking-tight">{v}</span>
                <span className="truncate text-[13px] text-faint">{sub}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 items-start gap-5 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Subscriptions" aside={<Pill>{subsActive.length}</Pill>}>
            <Card flush>
              <TableHead cols={["Name", "Next charge", "Plan", "Amount"]} />
              {d.subs.map((r) => (
                <Row key={r.id} r={r} selected={sel?.id === r.id} onOpen={setSel} col3={r.plan} badge={d.unused.has(r.id) ? <Pill tone="warn">Unused 30d+</Pill> : null} />
              ))}
            </Card>
          </Section>
          <Section title="Bills" aside={<Pill>{d.bills.length}</Pill>}>
            <Card flush>
              <TableHead cols={["Name", "Next charge", "Category", "Amount"]} />
              {d.bills.map((r) => (
                <Row key={r.id} r={r} selected={sel?.id === r.id} onOpen={setSel} col3={r.category} />
              ))}
            </Card>
          </Section>
        </div>

        <Section title="Calendar">
          <Card>
            <div className="flex items-center gap-1">
              <div className="flex flex-1 flex-col">
                <span className="text-[15px] font-semibold">{monthName(ym)} 2026</span>
                <span className="text-xs text-faint">Monthly charges by billing day</span>
              </div>
              <button
                type="button"
                aria-label="Previous month"
                disabled={ym === ymOf(d.today)}
                onClick={() => {
                  setCalYm(ymOf(d.today));
                  setCalDay(null);
                }}
                className="flex size-9 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-35"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                disabled={ym !== ymOf(d.today)}
                onClick={() => {
                  setCalYm(nextYm(ymOf(d.today)));
                  setCalDay(null);
                }}
                className="flex size-9 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-35"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div role="grid" aria-label={`${monthName(ym)} charges`} className="grid grid-cols-7 gap-0.5 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
                <span key={i} className="pb-1 text-[11px] text-faint">
                  {w}
                </span>
              ))}
              {Array.from({ length: cells.lead }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: cells.n }, (_, i) => {
                const day = i + 1;
                const items = cells.byDay.get(day) ?? [];
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setCalDay(day === calDay ? null : day)}
                    aria-label={`${monthName(ym)} ${day}${items.length ? `, ${items.length} charges` : ""}`}
                    className={cx(
                      "flex h-10 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[13px]",
                      calDay === day ? "bg-accent-bg text-accent" : "hover:bg-white/[0.04]",
                      todayDay === day && "ring-1 ring-text",
                    )}
                  >
                    {day}
                    <span className="flex h-1 gap-0.5">
                      {items.slice(0, 3).map((r) => (
                        <span key={r.id} className={cx("size-1 rounded-full", r.kind === "subscription" ? "bg-chart" : "bg-warning")} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-chart" /> Subscription
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-warning" /> Bill
              </span>
            </div>
            {calDay && (
              <div className="flex flex-col border-t border-border pt-2">
                <span className="pb-1 text-[13px] font-medium">
                  {monthName(ym)} {calDay}
                </span>
                {dayList.length ? (
                  dayList.map((r) => (
                    <button key={r.id} type="button" onClick={() => setSel(r)} className="flex items-center gap-2.5 py-2 text-left text-sm">
                      <Avatar name={r.merchant} size={28} />
                      <span className="flex-1 truncate">{r.merchant}</span>
                      <span className="num">{money(r.amount)}</span>
                    </button>
                  ))
                ) : (
                  <span className="py-1 text-sm text-muted">No charges on this day.</span>
                )}
              </div>
            )}
          </Card>
        </Section>
      </div>
      {sel && <PaymentDrawer r={sel} unused={d.unused.has(sel.id)} today={d.today} onClose={() => setSel(null)} />}
    </Page>
  );
}

function Row({ r, selected, onOpen, col3, badge }: { r: RecurringPayment; selected: boolean; onOpen: (r: RecurringPayment) => void; col3: string; badge?: ReactNode }) {
  const cancelled = r.status === "cancelled";
  return (
    <button type="button" onClick={() => onOpen(r)} className={cx(GRID4, "w-full py-[13px] text-left transition", selected ? "bg-accent-bg" : "hover:bg-white/[0.03]", cancelled && "opacity-60")}>
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={r.merchant} />
        <span className="flex min-w-0 flex-col">
          <span className={cx("truncate text-[15px]", cancelled && "line-through")}>{r.merchant}</span>
          {badge}
        </span>
      </span>
      <span className="text-sm text-muted">{cancelled ? "Cancelled" : r.cycle === "weekly" ? "Weekly" : shortDate(r.nextChargeDate)}</span>
      <span className="truncate text-sm">{col3}</span>
      <span className="num text-[15px]">
        {r.kind === "variable" ? "~" : ""}
        {money(r.amount)}
        {r.cycle === "weekly" ? "/wk" : ""}
      </span>
    </button>
  );
}

function PaymentDrawer({ r, unused, today, onClose }: { r: RecurringPayment; unused: boolean; today: string; onClose: () => void }) {
  const { openAssistant } = useAssistantUI();
  const cancelled = r.status === "cancelled";
  return (
    <Drawer label={r.kind === "subscription" ? "Subscription" : "Bill"} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar name={r.merchant} size={48} />
        <div className="flex flex-1 flex-col">
          <span className="text-xl font-semibold">{r.merchant}</span>
          <span className="text-[13px] text-muted">{r.plan}</span>
        </div>
        <Pill tone={cancelled ? "neg" : unused ? "warn" : "neu"}>{cancelled ? "Cancelled" : unused ? "Unused" : "Active"}</Pill>
      </div>
      <span className="num text-[32px] font-semibold leading-tight">
        {money(r.amount)}
        <span className="text-base font-medium text-muted">/{r.cycle === "weekly" ? "wk" : r.cycle === "yearly" ? "yr" : "mo"}</span>
      </span>
      <Panel>
        <KV first k="Next charge" v={cancelled ? "None" : shortDate(r.nextChargeDate)} />
        <KV k="Per year" v={money(monthlyCost(r) * 12)} />
        <KV k="Category" v={r.category} />
        {r.lastUsedAt && <KV k="Last used" v={`${shortDate(r.lastUsedAt)} · ${Math.round((Date.parse(today) - Date.parse(r.lastUsedAt)) / 86_400_000)} days ago`} />}
        {r.amountRange && <KV k="Range" v={`${money(r.amountRange.min)} – ${money(r.amountRange.max)}`} />}
      </Panel>
      {r.cancellable && !cancelled && (
        <>
          <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3.5 text-[13px] leading-normal text-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-positive" />
            <span>
              PayPal AI cancels it for you through the <span className="text-text">{CHANNEL[r.cancelChannel]}</span>, shows a preview first and asks before doing anything.
            </span>
          </div>
          <Btn kind="primary" onClick={() => openAssistant(`Cancel my ${r.merchant} subscription`)}>
            <Sparkles size={14} /> Cancel for me
          </Btn>
        </>
      )}
      {!r.cancellable && <p className="text-[13px] leading-normal text-muted">{CHANNEL.none}. Contact {r.merchant} to change it.</p>}
      <Btn onClick={() => openAssistant(`How much have I paid ${r.merchant} so far?`)}>Ask PayPal AI about this</Btn>
    </Drawer>
  );
}
