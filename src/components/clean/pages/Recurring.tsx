"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe, ShieldCheck } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { monthlyCost, unusedSubscriptions } from "@/lib/finance";
import type { RecurringPayment } from "@/lib/types";
import { useClean } from "../AppState";
import { asOfDate, daysInMonth, ymOf } from "../data";
import { CountText, Avatar, Btn, cx, daysUntil, Drawer, KV, money, monthName, Page, Panel, Pill, Section, shortDate, Skeleton } from "../ui";
import { ConfirmCancel, RunPanel, useCancelRun, type RunState } from "../recurring/CancelRun";

const BILL_C = "#e8833a";
const SUB_C = "#3d8bff";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const sinceLabel = (iso?: string) => (iso ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : "—");
const nextYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const isBill = (r: RecurringPayment) => r.kind !== "subscription";
const isTrial = (r: RecurringPayment) => !isBill(r) && /free trial/i.test(r.plan);
/** Closest due date first; cancelled rows sink to the bottom. */
const byDue = (a: RecurringPayment, b: RecurringPayment) => (a.status === b.status ? a.nextChargeDate.localeCompare(b.nextChargeDate) : a.status === "cancelled" ? 1 : b.status === "cancelled" ? -1 : 0);

export function RecurringPage() {
  const { state, loading } = useFinance();
  const { toast } = useClean();
  const [selId, setSelId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Ids the user resubscribed (Undo) — overrides the stored status. */
  const [restored, setRestored] = useState<ReadonlySet<string>>(new Set());
  const [confs, setConfs] = useState<Record<string, string>>({});
  const [calYm, setCalYm] = useState<string | null>(null);
  const [calDay, setCalDay] = useState<number | null>(null);

  const onCancelled = useCallback(
    (r: RecurringPayment, conf?: string) => {
      setSelId(null);
      if (conf) setConfs((c) => ({ ...c, [r.id]: conf }));
      toast(`${r.merchant} cancelled`, `No more ${money(r.amount)} charges${conf ? ` · ${conf}` : ""}`, {
        undo: () => {
          setRestored((s) => new Set(s).add(r.id));
          toast(`${r.merchant} is active again`, `Next charge ${shortDate(r.nextChargeDate)} · ${money(r.amount)}`, { kind: "info" });
        },
      });
    },
    [toast],
  );
  const cancel = useCancelRun(onCancelled);

  const d = useMemo(() => {
    if (!state) return null;
    const today = asOfDate(state);
    const all = state.recurring.map((r) => (restored.has(r.id) && r.status === "cancelled" ? { ...r, status: "active" as const, cancelledAt: undefined } : r));
    const live = all.filter((r) => r.status === "active" && !isTrial(r));
    const subs = all.filter((r) => !isBill(r)).sort(byDue);
    const bills = all.filter(isBill).sort(byDue);
    const subsMonthly = live.filter((r) => !isBill(r) && !isTrial(r)).reduce((a, r) => a + monthlyCost(r), 0);
    const billsMonthly = live.filter(isBill).reduce((a, r) => a + monthlyCost(r), 0);
    return { today, live, subs, bills, subsMonthly, billsMonthly, unused: new Set(unusedSubscriptions(all, state.asOf).map((r) => r.id)), all };
  }, [state, restored]);

  if (loading || !state || !d) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const sel = d.all.find((r) => r.id === selId) ?? null;
  const subsActive = d.subs.filter((s) => s.status === "active" && !isTrial(s));
  const total = d.subsMonthly + d.billsMonthly;
  const sumAria = `Monthly cost ${money(total)}: ${money(d.subsMonthly)} in subscriptions and ${money(d.billsMonthly)} in bills.`;
  const stopRun = () => {
    const name = cancel.run?.r.merchant ?? sel?.merchant ?? "the merchant site";
    cancel.stop();
    toast("Cancellation stopped", `Nothing was changed on ${name}`, { kind: "warn" });
  };

  return (
    <Page title="Recurring">
      <div className="grid grid-cols-1 items-start gap-[var(--sec-gap,32px)] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[var(--sec-gap,32px)]">
          <Section title="Summary">
            <section aria-label="Summary" className="flex flex-col gap-[22px] rounded-[20px] bg-surface p-5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-muted">Monthly cost</span>
                <span className="num text-[36px] font-semibold leading-[1.1] tracking-[-0.02em]"><CountText text={money(total)} /></span>
              </div>
              <div role="img" aria-label={sumAria} className="flex h-4 gap-[3px]">
                <div className="m-bx min-w-1 rounded-md" style={{ flex: `${d.subsMonthly} 1 0`, background: SUB_C }} />
                <div className="m-bx min-w-1 rounded-md" style={{ flex: `${d.billsMonthly} 1 0`, background: BILL_C }} />
              </div>
              <div className="flex flex-col gap-3.5 text-[15px]">
                <div className="flex items-center gap-2.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: SUB_C }} />
                  <span className="flex-1">Subscription</span>
                  <span className="num font-semibold">{money(d.subsMonthly)}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: BILL_C }} />
                  <span className="flex-1">Bill</span>
                  <span className="num font-semibold">{money(d.billsMonthly)}</span>
                </div>
                <div className="h-px bg-border-strong" />
                <div className="flex items-center gap-2.5">
                  <span className="flex-1">Annual cost</span>
                  <span className="num font-semibold">{money(total * 12)}</span>
                </div>
              </div>
            </section>
          </Section>

          <PaymentTable title="Subscriptions" count={subsActive.length} rows={d.subs} today={d.today} selected={sel?.id} onOpen={(r) => setSelId(r.id)} />
          <PaymentTable title="Bills" count={d.bills.length} rows={d.bills} today={d.today} selected={sel?.id} onOpen={(r) => setSelId(r.id)} />
        </div>

        <Section title="Calendar">
          <PaymentCalendar
            live={d.live}
            today={d.today}
            ym={calYm ?? ymOf(d.today)}
            day={calDay}
            onMonth={(ym) => {
              setCalYm(ym);
              setCalDay(null);
            }}
            onDay={setCalDay}
            onOpen={(r) => setSelId(r.id)}
          />
        </Section>
      </div>
      {sel && (
        <PaymentDrawer
          r={sel}
          unused={d.unused.has(sel.id)}
          today={d.today}
          conf={confs[sel.id]}
          run={cancel.run?.r.id === sel.id ? cancel.run : null}
          onStop={stopRun}
          onAskCancel={() => setConfirming(true)}
          onResubscribe={() => {
            setRestored((s) => new Set(s).add(sel.id));
            toast(`${sel.merchant} is active again`, `Next charge ${shortDate(sel.nextChargeDate)} · ${money(sel.amount)}`, { kind: "info" });
          }}
          onClose={() => {
            if (cancel.run?.status === "error") cancel.clear();
            setSelId(null);
          }}
        />
      )}
      {confirming && sel && (
        <ConfirmCancel
          r={sel}
          onKeep={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            setRestored((s) => {
              const n = new Set(s);
              n.delete(sel.id);
              return n;
            });
            void cancel.start(sel);
          }}
        />
      )}
    </Page>
  );
}

const PAGE = 10;
const COLS = "grid w-full grid-cols-[minmax(0,3fr)_minmax(84px,1fr)_minmax(84px,1fr)_minmax(100px,1fr)] items-center gap-4 px-5";

/** Subscriptions / bills table (design: 4-column grid, 10 rows per page with a pager). */
function PaymentTable({ title, count, rows, today, selected, onOpen }: { title: string; count: number; rows: RecurringPayment[]; today: string; selected?: string; onOpen: (r: RecurringPayment) => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(page, pages - 1);
  const shown = rows.slice(p * PAGE, (p + 1) * PAGE);
  const pagerBtn = "flex size-9 items-center justify-center rounded-full bg-white/[0.08] disabled:opacity-35";
  return (
    <Section title={title} aside={<Pill>{count}</Pill>}>
      <section aria-label={title} className="overflow-hidden rounded-[20px] bg-surface py-1">
        <div role="row" className={cx(COLS, "py-2.5 text-[13px] text-faint")}>
          <span>Name</span>
          <span>Due date</span>
          <span>Since</span>
          <span>Amount</span>
        </div>
        {shown.map((r) => {
          const trial = isTrial(r);
          const cancelled = r.status === "cancelled";
          const left = daysUntil(today, r.nextChargeDate);
          return (
            <button key={r.id} type="button" onClick={() => !trial && onOpen(r)} className={cx(COLS, "py-[13px] text-left", trial ? "cursor-default" : "cursor-pointer", selected === r.id && "bg-accent-bg")}>
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={r.merchant} size={34} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cx("truncate text-[15px]", cancelled && "text-faint line-through")}>{r.merchant}</span>
                    {trial && <Pill tone="acc">Free trial</Pill>}
                  </span>
                  <span className="truncate text-[13px] text-faint">{trial || isBill(r) ? r.plan : `${r.plan} · monthly`}</span>
                </span>
              </span>
              <span className={cx("whitespace-nowrap text-sm", cancelled ? "text-negative" : left <= 7 ? "font-medium text-accent" : "text-text")}>{cancelled ? "Cancelled" : shortDate(r.nextChargeDate)}</span>
              <span className="whitespace-nowrap text-sm">{sinceLabel(r.since)}</span>
              <span className={cx("num whitespace-nowrap text-[15px]", cancelled && "text-faint line-through")}>{money(r.amount)}</span>
            </button>
          );
        })}
      </section>
      {rows.length > PAGE && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-faint">
          <span>
            Showing {p * PAGE + 1} to {Math.min(rows.length, (p + 1) * PAGE)} of {rows.length}
          </span>
          <div className="flex items-center gap-3">
            <span>
              Page {p + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)} className={pagerBtn}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className={pagerBtn}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

function PaymentCalendar({ live, today, ym, day, onMonth, onDay, onOpen }: { live: RecurringPayment[]; today: string; ym: string; day: number | null; onMonth: (ym: string) => void; onDay: (d: number) => void; onOpen: (r: RecurringPayment) => void }) {
  const curYm = ymOf(today);
  const todayDay = ym === curYm ? Number(today.slice(8, 10)) : 0;
  const [y, m] = ym.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const n = daysInMonth(ym);
  const dueOn = (dd: number) => live.filter((r) => r.cycle === "monthly" && Math.min(r.billingDay ?? 0, n) === dd);
  const upcomingDays = Array.from({ length: n }, (_, i) => i + 1).filter((dd) => dd >= todayDay && dueOn(dd).length);
  const selDay = day ?? upcomingDays[0] ?? null;
  const items = selDay ? dueOn(selDay) : [];
  const navBtn = "flex size-9 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-35";
  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] bg-surface p-5">
      <div className="flex items-center gap-1">
        <div className="flex flex-1 flex-col">
          <h3 className="text-[15px] font-semibold">
            {monthName(ym)} {y}
          </h3>
        </div>
        <button type="button" aria-label="Previous month" disabled={ym === curYm} onClick={() => onMonth(curYm)} className={navBtn}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" aria-label="Next month" disabled={ym !== curYm} onClick={() => onMonth(nextYm(curYm))} className={navBtn}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div role="grid" aria-label={`${monthName(ym)} ${y}`} className="grid grid-cols-7 gap-0.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
          <span key={i} className="pb-1 text-center text-[11px] font-medium text-faint">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const dd = i + 1;
          const due = dueOn(dd);
          const isToday = dd === todayDay;
          const past = ym === curYm && dd < todayDay;
          const on = dd === selDay;
          return (
            <button
              key={dd}
              type="button"
              aria-pressed={on}
              aria-label={`${DOW[(lead + dd - 1) % 7]} ${monthName(ym)} ${dd}${isToday ? ", today" : ""}${due.length ? `, ${due.length} payment${due.length > 1 ? "s" : ""} due` : ""}`}
              onClick={() => onDay(dd)}
              className={cx("flex h-[46px] flex-col items-center justify-center gap-[3px] rounded-[10px] border", on ? "border-border-strong bg-surface-3" : "border-transparent")}
            >
              <span
                className={cx(
                  "flex size-[26px] items-center justify-center rounded-full text-[13px]",
                  isToday ? "border-2 border-accent font-bold text-accent" : past ? "text-faint" : due.length ? "font-semibold" : "text-muted",
                )}
              >
                {dd}
              </span>
              <span className="flex h-1.5 gap-[3px]">
                {due.slice(0, 3).map((r) => (
                  <span key={r.id} className="size-1.5 rounded-full" style={{ background: isBill(r) ? BILL_C : SUB_C }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3.5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: BILL_C }} />
          Bill
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: SUB_C }} />
          Subscription
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-full border-2 border-accent" />
          Today
        </span>
      </div>
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="text-[13px] font-semibold">
          {selDay ? `${DOW[(lead + selDay - 1) % 7]}, ${new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`))} ${selDay}${selDay === todayDay ? " · today" : ""}` : "Pick a day"}
        </span>
        {items.length === 0 && <span className="text-[13px] text-faint">{selDay ? "Nothing due this day." : "Nothing left to pay this month."}</span>}
        {items.map((r) => (
          <button key={r.id} type="button" onClick={() => onOpen(r)} className="flex min-h-11 items-center gap-2.5 text-left">
            <span className="size-2 shrink-0 rounded-full" style={{ background: isBill(r) ? BILL_C : SUB_C }} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{r.merchant}</span>
              <span className="truncate text-xs text-faint">
                {r.plan} · {isBill(r) ? "Bill" : "Subscription"}
              </span>
            </span>
            <span className="num text-[13px] font-semibold">{money(r.amount)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PaymentDrawer({ r, unused, today, conf, run, onStop, onAskCancel, onResubscribe, onClose }: { r: RecurringPayment; unused: boolean; today: string; conf?: string; run: RunState | null; onStop: () => void; onAskCancel: () => void; onResubscribe: () => void; onClose: () => void }) {
  const { openAssistant } = useAssistantUI();
  const { state } = useFinance();
  const { toast } = useClean();
  const cancelled = r.status === "cancelled";
  const bill = isBill(r);
  const daysLeft = daysUntil(today, r.nextChargeDate);
  const paid = r.since ? Math.max(1, (Number(today.slice(0, 4)) - Number(r.since.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(r.since.slice(5, 7)) + (Number(today.slice(8, 10)) >= (r.billingDay ?? 1) ? 1 : 0)) : 0;
  const method = state?.transactions.findLast((t) => t.recurringId === r.id)?.method;
  const remind = () => toast("Reminder set", `We’ll nudge you 2 days before ${r.merchant} is due on ${shortDate(r.nextChargeDate)}`);
  const statusPill = cancelled ? <Pill tone="neg">Cancelled</Pill> : <Pill tone={unused ? "warn" : daysLeft <= 7 ? "acc" : "neu"}>{unused ? "Unused 30+ days" : daysLeft <= 7 ? `Renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Active"}</Pill>;
  const kernel = r.cancelChannel === "kernel_browser";
  return (
    <Drawer label={run ? "Cancellation" : bill ? "Essential bill" : "Subscription"} onClose={onClose}>
      {run ? (
        <RunPanel run={run} onStop={onStop} onClose={onClose} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={cx("num text-[32px] font-semibold leading-[1.15] tracking-[-0.02em]", cancelled && "text-faint line-through")}>
                {money(r.amount)}/mo
              </span>
              <span className="truncate text-sm font-medium text-muted">
                {r.merchant} · {r.plan}
              </span>
            </div>
            <Avatar name={r.merchant} size={48} />
          </div>

          {bill ? (
            <>
              <Panel>
                <KV first k="Type" v={<Pill tone="acc">Essential bill</Pill>} />
                <KV k="Next due" v={`${shortDate(r.nextChargeDate)} · ${money(r.amount)}`} />
                <KV k="Paid with" v={method === "bank_transfer" ? `${state?.userProfile.linkedBank} · bank transfer` : method === "paypal_balance" ? "PayPal balance · autopay" : `PayPal Debit Card ••${state?.userProfile.card.last4}`} />
                <KV k="Paying since" v={sinceLabel(r.since)} />
              </Panel>
              <p className="text-xs leading-normal text-muted">Bills are tracked here so a due date never surprises you. PayPal AI won’t suggest cancelling them.</p>
              <div className="mt-auto flex gap-2 pt-2">
                <Btn kind="primary" className="flex-1" onClick={remind}>
                  Remind me before it’s due
                </Btn>
              </div>
            </>
          ) : cancelled ? (
            <>
              <Panel>
                <KV first k="Status" v={<Pill tone="neg">Cancelled</Pill>} />
                {conf && <KV k="Confirmation" v={<span className="font-mono">{conf}</span>} />}
                <KV k="Access until" v={shortDate(r.nextChargeDate)} />
              </Panel>
              {conf && (
                <figure className="m-0 flex flex-col items-center gap-1 rounded-xl border border-border-strong bg-white p-4 text-center text-black">
                  <span className="text-[11px] font-medium text-[#555]">Kernel screenshot · sandbox merchant · {r.merchant}</span>
                  <span className="text-[15px] font-semibold">Your membership is cancelled</span>
                  <span className="text-[11px] text-[#555]">Confirmation {conf}</span>
                </figure>
              )}
              <div className="mt-auto flex gap-2 pt-2">
                <Btn className="flex-1" onClick={onResubscribe}>
                  Resubscribe
                </Btn>
              </div>
            </>
          ) : (
            <>
              <Panel>
                <KV first k="Status" v={statusPill} />
                <KV k="Next charge" v={`${shortDate(r.nextChargeDate)} · ${money(r.amount)}`} />
                <KV k="Subscribed since" v={sinceLabel(r.since)} />
                <KV k="Paid so far" v={paid ? `${money(paid * r.amount)} · ${paid} payments` : "—"} />
              </Panel>
              <div className="flex items-start gap-2.5 rounded-xl bg-accent-bg px-3.5 py-3">
                {kernel ? <Globe size={18} className="mt-px shrink-0 text-accent" /> : <ShieldCheck size={18} className="mt-px shrink-0 text-accent" />}
                <p className="text-xs leading-normal">
                  {kernel
                    ? "“Cancel for me” uses Kernel: it opens the merchant’s site in a secure cloud browser and cancels for you. You approve first and can watch every step."
                    : "Cancelling goes through the PayPal Subscriptions API, since this subscription is billed through PayPal. You approve first."}
                </p>
              </div>
              <div className="mt-auto flex gap-2 pt-2">
                {r.cancellable ? (
                  <Btn className="flex-1 !bg-[#c93a3a] !text-white hover:!bg-[#b23333]" onClick={onAskCancel}>
                    Cancel for me
                  </Btn>
                ) : (
                  <Btn className="flex-1" onClick={() => openAssistant(`Help me cancel my ${r.merchant} subscription`)}>
                    Ask PayPal AI
                  </Btn>
                )}
                <Btn className="flex-1" onClick={remind}>
                  Remind me
                </Btn>
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
