"use client";

import { useCallback, useMemo, useState } from "react";
import type { CellClassParams, ColDef, ICellRendererParams } from "ag-grid-community";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Globe, House, Play, Repeat, ShieldCheck } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { monthlyCost, unusedSubscriptions } from "@/lib/finance";
import type { RecurringPayment } from "@/lib/types";
import { useClean } from "../AppState";
import { asOfDate, daysInMonth, ymOf } from "../data";
import { Grid } from "../Grid";
import { Avatar, Btn, cx, daysUntil, Drawer, KV, money, monthName, Page, Panel, Pill, Section, shortDate, Skeleton } from "../ui";
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
    const live = all.filter((r) => r.status === "active");
    const subs = all.filter((r) => !isBill(r)).sort(byDue);
    const bills = all.filter(isBill).sort(byDue);
    const subsMonthly = live.filter((r) => !isBill(r)).reduce((a, r) => a + monthlyCost(r), 0);
    const billsMonthly = live.filter(isBill).reduce((a, r) => a + monthlyCost(r), 0);
    return { today, live, subs, bills, subsMonthly, billsMonthly, unused: new Set(unusedSubscriptions(all, state.asOf).map((r) => r.id)), all };
  }, [state, restored]);

  if (loading || !state || !d) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const sel = d.all.find((r) => r.id === selId) ?? null;
  const subsActive = d.subs.filter((s) => s.status === "active");
  const stats = [
    [Repeat, "Per month", money(d.subsMonthly + d.billsMonthly), `${subsActive.length + d.bills.length} recurring payments`],
    [Play, "Subscriptions", money(d.subsMonthly), `${subsActive.length} active · per month`],
    [House, "Bills", money(d.billsMonthly), `${d.bills.length} essential · per month`],
    [CalendarIcon, "Per year", money((d.subsMonthly + d.billsMonthly) * 12), "at current prices"],
  ] as const;

  return (
    <Page title="Recurring">
      <Section title="Summary">
        <div className="grid grid-cols-2 overflow-hidden rounded-[20px] bg-surface @3xl:grid-cols-4">
          {stats.map(([Icon, k, v, sub], i) => (
            <div key={k} className={cx("flex min-w-0 flex-col px-[22px] pb-[22px] pt-5", i % 2 === 1 && "border-l border-border-strong", i >= 2 && "border-t border-border-strong @3xl:border-t-0", i === 2 && "@3xl:border-l")}>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3">
                  <Icon size={16} />
                </span>
                <span className="truncate text-sm font-semibold">{k}</span>
              </div>
              <div className="mt-7 flex flex-col gap-1">
                <span className="num truncate text-[26px] font-semibold tracking-tight">{v}</span>
                <span className="truncate text-[13px] text-faint">{sub}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 items-start gap-[var(--sec-gap,32px)] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[var(--sec-gap,32px)]">
          <Section title="Subscriptions" aside={<TableTotal count={subsActive.length} monthly={d.subsMonthly} />}>
            <div className="overflow-hidden rounded-[20px] bg-surface py-1">
              <RecurringGrid rows={d.subs} today={d.today} selected={sel?.id} onOpen={(r) => setSelId(r.id)} />
            </div>
          </Section>
          <Section title="Bills" aside={<TableTotal count={d.bills.length} monthly={d.billsMonthly} />}>
            <div className="overflow-hidden rounded-[20px] bg-surface py-1">
              <RecurringGrid rows={d.bills} today={d.today} selected={sel?.id} onOpen={(r) => setSelId(r.id)} />
            </div>
          </Section>
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
          onStop={cancel.stop}
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

function TableTotal({ count, monthly }: { count: number; monthly: number }) {
  return (
    <>
      <Pill>{count}</Pill>
      <span className="ml-auto text-[15px] font-semibold">
        <span className="num">{money(monthly)}</span>
        <span className="font-normal text-faint">/mo</span>
      </span>
    </>
  );
}

/** Subscriptions / bills table on AG Grid: Name | Due date | Since | Amount (all left-aligned). */
function RecurringGrid({ rows, today, selected, onOpen }: { rows: RecurringPayment[]; today: string; selected?: string; onOpen: (r: RecurringPayment) => void }) {
  const columnDefs = useMemo<ColDef<RecurringPayment>[]>(() => {
    const sel = { "!bg-accent-bg": (p: CellClassParams<RecurringPayment>) => !!selected && p.data?.id === selected };
    const soon = (r: RecurringPayment) => daysUntil(today, r.nextChargeDate) <= 14;
    const cols: ColDef<RecurringPayment>[] = [
      {
        field: "merchant",
        headerName: "Name",
        flex: 3,
        minWidth: 230,
        cellRenderer: ({ data: r }: ICellRendererParams<RecurringPayment>) => {
          if (!r) return null;
          const trial = isTrial(r);
          const left = daysUntil(today, r.nextChargeDate);
          return (
            <span className="flex h-full min-w-0 items-center gap-3">
              <Avatar name={r.merchant} />
              <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                  <span className={cx("truncate", r.status === "cancelled" && "text-faint line-through")}>{r.merchant}</span>
                  {trial && <Pill tone="acc">Free trial</Pill>}
                </span>
                <span className="truncate whitespace-nowrap text-[13px] text-faint">
                  {trial ? `${r.plan} · ${left <= 0 ? "ends today" : `${left} day${left === 1 ? "" : "s"} left`}` : isBill(r) ? r.plan : `${r.plan} · monthly`}
                </span>
              </span>
            </span>
          );
        },
      },
      {
        field: "nextChargeDate",
        headerName: "Due date",
        flex: 1,
        minWidth: 110,
        cellRenderer: ({ data: r }: ICellRendererParams<RecurringPayment>) =>
          r ? (
            <span className={cx("whitespace-nowrap text-sm", r.status === "cancelled" ? "text-negative" : soon(r) ? "font-medium text-accent" : "text-muted")}>
              {r.status === "cancelled" ? "Cancelled" : shortDate(r.nextChargeDate)}
            </span>
          ) : null,
      },
      { field: "since", headerName: "Since", flex: 1, minWidth: 110, cellClass: "whitespace-nowrap text-muted !text-sm", valueFormatter: (p) => sinceLabel(p.value as string | undefined) },
      {
        field: "amount",
        headerName: "Amount",
        flex: 1,
        minWidth: 100,
        cellClass: (p) => cx("num whitespace-nowrap", p.data?.status === "cancelled" && "text-faint line-through"),
        valueFormatter: (p) => (p.data ? money(p.value as number) : ""),
      },
    ];
    return cols.map((c) => ({ ...c, sortable: false, headerClass: "!text-left", cellClassRules: sel }));
  }, [today, selected]);
  return <Grid<RecurringPayment> rowData={rows} columnDefs={columnDefs} getRowId={(p) => p.data.id} onRowClicked={(e) => e.data && !isTrial(e.data) && onOpen(e.data)} rowClass="cursor-pointer" />;
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
  const monthDue = upcomingDays.flatMap(dueOn);
  const items = selDay ? dueOn(selDay) : [];
  const navBtn = "flex size-9 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-35";
  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] bg-surface p-5">
      <div className="flex items-center gap-1">
        <div className="flex flex-1 flex-col">
          <h3 className="text-[15px] font-semibold">
            {monthName(ym)} {y}
          </h3>
          <span className="text-xs text-faint">
            {monthDue.length} payments {ym === curYm ? "still due" : "due"} · {money(monthDue.reduce((a, r) => a + r.amount, 0))}
          </span>
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
              <span className="truncate text-sm font-medium">{r.merchant}</span>
              <span className="truncate text-xs text-faint">
                {r.plan} · {isBill(r) ? "Bill" : "Subscription"}
              </span>
            </span>
            <span className="num text-sm font-semibold">{money(r.amount)}</span>
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
  const status = bill ? <Pill tone="acc">Essential bill</Pill> : cancelled ? <Pill tone="neg">Cancelled</Pill> : <Pill tone={unused ? "warn" : daysLeft <= 7 ? "acc" : "neu"}>{unused ? "Unused 30+ days" : daysLeft <= 7 ? `Renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Active"}</Pill>;
  return (
    <Drawer label={run ? "Cancellation" : bill ? "Bill" : "Subscription"} onClose={onClose}>
      {run ? (
        <RunPanel run={run} onStop={onStop} onClose={onClose} />
      ) : (
        <>
          <div className="flex items-start gap-3">
            <Avatar name={r.merchant} size={44} />
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 className={cx("truncate text-lg font-semibold leading-tight", cancelled && "text-faint line-through")}>{r.merchant}</h2>
              <span className="truncate text-xs text-faint">{r.plan}</span>
            </div>
            {status}
          </div>
          <span className={cx("num text-[32px] font-semibold leading-tight tracking-tight", cancelled && "text-faint line-through")}>
            {money(r.amount)}
            <span className="text-base font-medium text-muted">/mo</span>
          </span>

          {bill ? (
            <>
              <Btn kind="primary" className="self-start" onClick={remind}>
                Remind me before it’s due
              </Btn>
              <Panel>
                <KV first k="Next due" v={`${shortDate(r.nextChargeDate)} · ${money(r.amount)}`} />
                <KV k="Paid with" v={method === "bank_transfer" ? `${state?.userProfile.linkedBank} · bank transfer` : method === "paypal_balance" ? "PayPal balance · autopay" : `PayPal Debit Card ••${state?.userProfile.card.last4}`} />
                <KV k="Paying since" v={sinceLabel(r.since)} />
              </Panel>
              <p className="text-xs leading-normal text-muted">Bills are tracked here so a due date never surprises you. PayPal AI won’t suggest cancelling them.</p>
            </>
          ) : cancelled ? (
            <>
              <Panel>
                <KV first k="Status" v={<Pill tone="neg">Cancelled</Pill>} />
                {conf && <KV k="Confirmation" v={<span className="font-mono">{conf}</span>} />}
                <KV k="Access until" v={shortDate(r.nextChargeDate)} />
                <KV k="Subscribed since" v={sinceLabel(r.since)} />
              </Panel>
              <Btn className="mt-auto" onClick={onResubscribe}>
                Resubscribe
              </Btn>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {r.cancellable ? (
                  <Btn className="!bg-[#c93a3a] !text-white hover:!bg-[#b23333]" onClick={onAskCancel}>
                    Cancel subscription
                  </Btn>
                ) : (
                  <Btn onClick={() => openAssistant(`Help me cancel my ${r.merchant} subscription`)}>Ask PayPal AI</Btn>
                )}
                <Btn onClick={remind}>Remind me</Btn>
              </div>
              <Panel>
                <KV first k="Next charge" v={`${shortDate(r.nextChargeDate)} · ${money(r.amount)}`} />
                <KV k="Subscribed since" v={sinceLabel(r.since)} />
                <KV k="Paid so far" v={paid ? money(paid * r.amount) : "—"} />
              </Panel>
              <div className="flex items-start gap-2.5 rounded-[10px] bg-accent-bg px-3.5 py-3">
                {r.cancelChannel === "kernel_browser" ? <Globe size={18} className="mt-px shrink-0 text-accent" /> : <ShieldCheck size={18} className="mt-px shrink-0 text-accent" />}
                <p className="text-xs leading-normal">
                  {r.cancelChannel === "kernel_browser"
                    ? "Cancelling uses Kernel: it opens the merchant’s site in a secure cloud browser and cancels for you. You approve first and get a screenshot as proof."
                    : "Cancelling goes through the PayPal Subscriptions API, since this subscription is billed through PayPal. You approve first."}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
