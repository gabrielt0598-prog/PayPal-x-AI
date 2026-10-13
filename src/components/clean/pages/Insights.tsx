"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { r2 } from "@/lib/finance";
import { useClean } from "../AppState";
import { SvgDonut } from "../charts";
import { CAT_COLORS, cashbackIn, dataMonths, monthBounds, monthCategories, monthTotals, prevYm, ymOf } from "../data";
import { Btn, cx, money, money0, monthName, monthShort, Page, Pill, Skeleton } from "../ui";
import { Menu, MenuItem } from "./Transactions";
import { Sparkles } from "../SparkleIcon";

const fmtPct = (p: number) => (Math.abs(p) < 0.05 ? "0.0%" : `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`);

export function InsightsPage() {
  const { state, loading } = useFinance();
  const { openAssistant } = useAssistantUI();
  const { go } = useClean();
  const [pick, setPick] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const months = useMemo(() => (state ? dataMonths(state).filter((m) => m.ym !== ymOf(state.asOf)) : []), [state]);
  const ym = pick ?? months.find((m) => m.full)?.ym ?? months[0]?.ym;

  const d = useMemo(() => {
    if (!state || !ym) return null;
    const pym = prevYm(ym);
    const hasPrev = months.some((m) => m.ym === pym);
    const cats = monthCategories(state, ym);
    // Biggest mover vs last month (rent excluded: it never moves).
    const movers = hasPrev ? cats.rows.filter((c) => c.name !== "Essential bills" && c.name !== "Other" && c.prev) : [];
    const mover = movers.sort((a, b) => Math.abs(b.spend - (b.prev ?? 0)) - Math.abs(a.spend - (a.prev ?? 0)))[0];
    const { from, to } = monthBounds(ym);
    const billTx = state.transactions.filter((t) => t.amount < 0 && t.category === "Essential bills" && t.date.slice(0, 10) >= from && t.date.slice(0, 10) <= to);
    const bills = new Map<string, number>();
    const LABEL: Record<string, string> = { "Parkside Apartments": "Rent · Parkside", "Brightgrid Energy": "Electric & gas · Brightgrid Energy", Tidyloop: "Trash · Tidyloop" };
    for (const t of billTx) bills.set(LABEL[t.merchant] ?? t.merchant, r2((bills.get(LABEL[t.merchant] ?? t.merchant) ?? 0) - t.amount));
    const prevBills = r2(state.transactions.filter((t) => t.amount < 0 && t.category === "Essential bills" && ymOf(t.date) === pym).reduce((a, t) => a - t.amount, 0));
    const billTotal = r2([...bills.values()].reduce((a, v) => a + v, 0));
    const cashTx = state.transactions.filter((t) => t.category === "Cashback" && ymOf(t.date) === ym);
    const byMerchant = new Map<string, number>();
    for (const t of cashTx) {
      const o = state.offers.find((x) => t.description === `Cash back — ${x.title}`);
      const k = o?.merchant ?? t.merchant;
      byMerchant.set(k, r2((byMerchant.get(k) ?? 0) + t.amount));
    }
    const cashParts = [...byMerchant.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, value], i) => ({ label, value, color: ["var(--positive)", "var(--accent)", "var(--warning)"][i] }));
    const avail = state.offers.filter((o) => o.status === "available");
    const availEarn = r2(avail.reduce((a, o) => a + (o.type === "fixed_cashback" ? o.value : (o.maxCashback ?? 0)), 0));
    const history = months
      .map((m) => m.ym)
      .sort()
      .filter((m) => m <= ym)
      .slice(-6);
    return { cashParts, available: avail.length, availEarn, prevBills, pym, hasPrev, cats, mover, bills: [...bills.entries()].sort((a, b) => b[1] - a[1]), billTotal, cash: cashbackIn(state, ym), cashCount: cashTx.length, history, total: monthTotals(state, ym).spend };
  }, [state, ym, months]);

  if (loading || !state || !d || !ym) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const idx = months.findIndex((m) => m.ym === ym);
  const meta = months[idx];
  const lastFull = months.find((m) => m.full)?.ym;
  const range = `${monthShort(ym)} ${meta.firstDay} – ${monthBounds(ym).to.slice(8)}, ${ym.slice(0, 4)}`;
  const moverDelta = d.mover && d.mover.prev ? ((d.mover.spend - d.mover.prev) / d.mover.prev) * 100 : 0;

  const nextMonth = (() => {
    const [y, m] = ymOf(state.asOf).split("-").map(Number);
    return `${y + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  })();
  const navBtn = "flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-text transition hover:bg-white/[0.12] disabled:opacity-35 disabled:hover:bg-white/[0.08]";
  const parts = d.cats.rows.map((r, i) => ({ label: r.name, value: r.spend, color: CAT_COLORS[i] }));
  const askFirst = !!d.mover;

  return (
    <Page
      title="Insights"
      actions={
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" disabled={idx >= months.length - 1} onClick={() => setPick(months[idx + 1].ym)} className={navBtn}>
            <ChevronLeft size={16} />
          </button>
          <Menu
            open={menu}
            onToggle={() => setMenu(!menu)}
            onClose={() => setMenu(false)}
            active={false}
            minWidth={260}
            icon={<Calendar size={14} />}
            label={`${monthName(ym)} ${ym.slice(0, 4)}`}
          >
            {months.map((m) => (
              <MenuItem
                key={m.ym}
                role="menuitemradio"
                on={m.ym === ym}
                note={m.ym === lastFull ? "Last full month" : !m.full ? `From ${monthShort(m.ym)} ${m.firstDay}` : undefined}
                onClick={() => {
                  setPick(m.ym);
                  setMenu(false);
                }}
              >
                {monthName(m.ym)} {m.ym.slice(0, 4)}
              </MenuItem>
            ))}
            <div className="mt-1 border-t border-border px-3 pb-1.5 pt-2.5 text-xs leading-snug text-faint">
              {monthName(ymOf(state.asOf))} is still in progress. Its insights arrive {monthShort(nextMonth)} 1.
            </div>
          </Menu>
          <button type="button" aria-label="Next month" disabled={idx <= 0} onClick={() => setPick(months[idx - 1].ym)} className={navBtn}>
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-[var(--sec-gap,32px)] @3xl:grid-cols-6">
        <section aria-label="Categories" className={cx("flex min-w-0 flex-col gap-3.5 rounded-[20px] bg-surface p-5", askFirst ? "@3xl:col-span-4" : "@3xl:col-span-6")}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <h2 className="text-[15px] font-semibold">Where {monthName(ym)}’s money went</h2>
            <span className="flex-1" />
            <span className="text-[13px] text-faint">
              {range}
              {d.hasPrev ? ` · compared with ${monthName(d.pym)}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-7">
            <SvgDonut
              parts={parts}
              size={240}
              center={money0(d.cats.total)}
              sub={`spent in ${monthShort(ym)}`}
              aria={`${monthName(ym)} spending by category: ${d.cats.rows.map((r) => `${r.name} ${money(r.spend)}`).join(", ")}.`}
            />
            <div className="flex min-w-0 flex-[1_1_360px] flex-col">
              {d.cats.rows.map((r, i) => {
                const p = r.prev ? ((r.spend - r.prev) / r.prev) * 100 : null;
                return (
                  <div key={r.name} className={cx("flex h-[38px] items-center gap-3", i && "border-t border-border")}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAT_COLORS[i] }} />
                    <span className="min-w-0 flex-1 whitespace-nowrap text-sm font-medium">{r.name}</span>
                    <span className="num w-[84px] text-right text-sm font-medium">{money(r.spend)}</span>
                    <span className="w-10 text-right text-xs text-faint">{Math.round((r.spend / d.cats.total) * 100)}%</span>
                    <span className="flex w-16 justify-end">
                      {p === null ? <span className="text-xs text-faint">—</span> : <Pill tone={Math.abs(p) < 1 ? "neu" : p > 0 ? "neg" : "pos"}>{fmtPct(p)}</Pill>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {d.mover && (
          <Finding
            className="@3xl:col-span-2"
            title={moverDelta > 0 ? `${d.mover.name} is your fastest-growing category` : `${d.mover.name} dropped the most`}
            body={`${money(d.mover.spend)} in ${monthName(ym)}, ${moverDelta > 0 ? "up" : "down"} ${money(Math.abs(d.mover.spend - (d.mover.prev ?? 0)))} from ${monthName(d.pym)}.`}
            cta={`Ask about ${d.mover.name.toLowerCase()}`}
            ai
            onCta={() => openAssistant(`How much did I spend on ${d.mover!.name.toLowerCase()} in ${monthName(ym)}?`)}
          >
            <MoverBars state={state} months={d.history} category={d.mover.name} current={ym} color={CAT_COLORS[d.cats.rows.indexOf(d.mover)]} />
          </Finding>
        )}
        <Finding
          className="@3xl:col-span-3"
          title="Essential bills are your biggest, steadiest cost"
          body={`${money(d.billTotal)} in ${monthName(ym)}${!d.hasPrev ? "." : Math.abs(d.billTotal - d.prevBills) < 0.005 ? `, the same as ${monthName(d.pym)}.` : `, ${money(Math.abs(d.billTotal - d.prevBills))} ${d.billTotal > d.prevBills ? "more" : "less"} than ${monthName(d.pym)}. Only Brightgrid Energy changed.`}`}
          cta="See bills"
          onCta={() => go("recurring")}
        >
          <Split parts={d.bills.slice(0, 3).map(([k, v], i) => ({ label: k, value: v, color: ["var(--chart)", "#e8833a", "#22a06b"][i] }))} />
        </Finding>
        <Finding
          className="@3xl:col-span-3"
          title={`Cash back you earned in ${monthName(ym)}`}
          body={
            d.available
              ? `${d.available} more offer${d.available === 1 ? " is" : "s are"} ready to add now${d.availEarn ? `, worth up to ${money(d.availEarn)}` : ""}.`
              : d.cashCount
                ? `${d.cashCount} PayPal Offer${d.cashCount === 1 ? "" : "s"} paid out to your balance this month.`
                : "No offers paid out this month. PayPal AI can match offers to purchases you already made."
          }
          cta="See offers"
          onCta={() => go("offers")}
        >
          {d.cashParts.length > 0 ? (
            <Split parts={d.cashParts} />
          ) : (
            <Btn small kind="secondary" className="self-start" onClick={() => openAssistant("Apply my best offer")}>
              <Sparkles size={14} className="text-accent" /> Find cash back for me
            </Btn>
          )}
        </Finding>
      </div>
    </Page>
  );
}

function Finding({ title, body, cta, onCta, children, ai, className }: { title: string; body: string; cta: string; onCta: () => void; children?: ReactNode; ai?: boolean; className?: string }) {
  return (
    <article className={cx("flex min-w-0 flex-col gap-3 rounded-[20px] bg-surface p-5", className)}>
      <h2 className="text-base font-semibold leading-[1.3]">{title}</h2>
      {children}
      <p className="text-[13px] leading-normal text-muted">{body}</p>
      {ai ? (
        <button type="button" onClick={onCta} className="mt-auto inline-flex h-9 items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-accent-bg px-3.5 text-[13px] font-medium text-accent">
          ✦ {cta}
        </button>
      ) : (
        <button type="button" onClick={onCta} className="mt-auto min-h-9 self-start text-[13px] font-medium text-accent hover:underline">
          {cta} →
        </button>
      )}
    </article>
  );
}

function MoverBars({ state, months, category, current, color }: { state: NonNullable<ReturnType<typeof useFinance>["state"]>; months: string[]; category: string; current: string; color: string }) {
  const vals = months.map((m) => state.transactions.filter((t) => t.amount < 0 && t.category === category && ymOf(t.date) === m).reduce((a, t) => a - t.amount, 0));
  const max = Math.max(...vals, 1);
  return (
    <div aria-hidden className="flex h-28 items-end gap-2 pt-1">
      {months.map((m, i) => {
        const last = m === current;
        return (
          <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cx("text-[10px]", last ? "font-semibold text-text" : "font-medium text-faint")}>{money0(vals[i])}</span>
            <div className="w-full rounded-t-md rounded-b-[2px]" style={{ height: `${(vals[i] / max) * 60}px`, background: last ? color : "var(--surface-3)" }} />
            <span className="text-[11px] text-faint">{monthShort(m)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Split({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  return (
    <>
      <div aria-hidden className="flex h-3.5 gap-[3px]">
        {parts.map((p) => (
          <div key={p.label} className="min-w-1.5 rounded" style={{ flex: `${p.value} 1 0`, background: p.color }} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2 text-xs">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="flex-1 text-muted">{p.label}</span>
            <span className="num font-semibold">{money(p.value)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
