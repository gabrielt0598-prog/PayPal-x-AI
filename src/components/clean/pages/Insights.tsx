"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { r2 } from "@/lib/finance";
import { useClean } from "../AppState";
import { Donut } from "../charts";
import { CAT_COLORS, cashbackIn, dataMonths, monthBounds, monthCategories, monthTotals, prevYm, ymOf } from "../data";
import { Btn, Card, cx, money, money0, monthName, monthShort, Page, Pill, Skeleton } from "../ui";
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
    const LABEL: Record<string, string> = { "Parkside Apartments": "Rent · Parkside", "PG&E": "Electric & gas · PG&E", Recology: "Trash · Recology" };
    for (const t of billTx) bills.set(LABEL[t.merchant] ?? t.merchant, r2((bills.get(LABEL[t.merchant] ?? t.merchant) ?? 0) - t.amount));
    const prevBills = r2(state.transactions.filter((t) => t.amount < 0 && t.category === "Essential bills" && ymOf(t.date) === pym).reduce((a, t) => a - t.amount, 0));
    const billTotal = r2([...bills.values()].reduce((a, v) => a + v, 0));
    const cashTx = state.transactions.filter((t) => t.category === "Cashback" && ymOf(t.date) === ym);
    const history = months
      .map((m) => m.ym)
      .sort()
      .filter((m) => m <= ym)
      .slice(-6);
    return { prevBills, pym, hasPrev, cats, mover, bills: [...bills.entries()].sort((a, b) => b[1] - a[1]), billTotal, cash: cashbackIn(state, ym), cashCount: cashTx.length, history, total: monthTotals(state, ym).spend };
  }, [state, ym, months]);

  if (loading || !state || !d || !ym) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const idx = months.findIndex((m) => m.ym === ym);
  const meta = months[idx];
  const lastFull = months.find((m) => m.full)?.ym;
  const range = `${monthShort(ym)} ${meta.firstDay} – ${monthBounds(ym).to.slice(8)}, ${ym.slice(0, 4)}`;
  const moverDelta = d.mover && d.mover.prev ? ((d.mover.spend - d.mover.prev) / d.mover.prev) * 100 : 0;

  return (
    <Page
      title="Insights"
      actions={
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" disabled={idx >= months.length - 1} onClick={() => setPick(months[idx + 1].ym)} className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] disabled:opacity-35">
            <ChevronLeft size={16} />
          </button>
          <Menu open={menu} onToggle={() => setMenu(!menu)} onClose={() => setMenu(false)} active={false} label={`${monthName(ym)} ${ym.slice(0, 4)}`}>
            {months.map((m) => (
              <MenuItem
                key={m.ym}
                role="menuitemradio"
                on={m.ym === ym}
                onClick={() => {
                  setPick(m.ym);
                  setMenu(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <Calendar size={14} className="text-faint" />
                  {monthName(m.ym)} {m.ym.slice(0, 4)}
                  <span className="ml-auto pl-3 text-xs text-faint">{m.ym === lastFull ? "Last full month" : !m.full ? `From ${monthShort(m.ym)} ${m.firstDay}` : ""}</span>
                </span>
              </MenuItem>
            ))}
            <div className="mt-1 border-t border-border px-3 pb-1.5 pt-2.5 text-xs leading-snug text-faint">{monthName(ymOf(state.asOf))} is still in progress. Its insights arrive at the end of the month.</div>
          </Menu>
          <button type="button" aria-label="Next month" disabled={idx <= 0} onClick={() => setPick(months[idx - 1].ym)} className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] disabled:opacity-35">
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <Card>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <h2 className="text-[15px] font-semibold">Where {monthName(ym)}’s money went</h2>
          {ym === lastFull && <Pill tone="acc">Last full month</Pill>}
          {!meta.full && <Pill tone="warn">Partial month</Pill>}
          <span className="ml-auto text-[13px] text-faint">
            {range}
            {d.hasPrev ? ` · compared with ${monthName(d.pym)}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-10">
          <Donut
            parts={d.cats.rows.map((r, i) => ({ label: r.name, value: r.spend, color: CAT_COLORS[i] }))}
            size={308}
            center={money0(d.cats.total)}
            sub={`spent in ${monthShort(ym)}`}
            aria={`${monthName(ym)} spending by category: ${d.cats.rows.map((r) => `${r.name} ${money(r.spend)}`).join(", ")}.`}
          />
          <div className="flex min-w-0 flex-[1_1_380px] flex-col">
            {d.cats.rows.map((r, i) => {
              const p = r.prev ? ((r.spend - r.prev) / r.prev) * 100 : null;
              return (
                <div key={r.name} className={cx("flex h-11 items-center gap-3", i && "border-t border-border")}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAT_COLORS[i] }} />
                  <span className="w-[120px] truncate text-sm font-medium">{r.name}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-surface-3">
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (r.spend / d.cats.rows[0].spend) * 100)}%`, background: CAT_COLORS[i] }} />
                  </div>
                  <span className="num w-[84px] text-right text-sm font-medium">{money(r.spend)}</span>
                  <span className="w-10 text-right text-xs text-faint">{Math.round((r.spend / d.cats.total) * 100)}%</span>
                  <span className="flex w-[72px] justify-end">
                    {p === null ? <span className="text-xs text-faint">—</span> : <Pill tone={Math.abs(p) < 1 ? "neu" : p > 0 ? "neg" : "pos"}>{fmtPct(p)}</Pill>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-3">
        {d.mover && (
          <Finding
            tag={<Pill tone={moverDelta > 0 ? "neg" : "pos"}>{`${fmtPct(moverDelta).replace(/\.\d/, "")} vs ${monthName(d.pym)}`}</Pill>}
            title={moverDelta > 0 ? `${d.mover.name} grew the most` : `${d.mover.name} dropped the most`}
            body={`${money(d.mover.spend)} in ${monthName(ym)}, ${moverDelta > 0 ? "up" : "down"} ${money(Math.abs(d.mover.spend - (d.mover.prev ?? 0)))} from ${monthName(d.pym)}.`}
            cta={`Ask about ${d.mover.name.toLowerCase()}`}
            onCta={() => openAssistant(`How much did I spend on ${d.mover!.name.toLowerCase()} in ${monthName(ym)}?`)}
          >
            <MoverBars state={state} months={d.history} category={d.mover.name} current={ym} color={CAT_COLORS[d.cats.rows.indexOf(d.mover)]} />
          </Finding>
        )}
        <Finding
          tag={<Pill tone="acc">{Math.round((d.billTotal / (d.total || 1)) * 100)}% of spending</Pill>}
          title="Essential bills are your biggest, steadiest cost"
          body={`${money(d.billTotal)} in ${monthName(ym)}${!d.hasPrev ? "." : Math.abs(d.billTotal - d.prevBills) < 0.005 ? `, the same as ${monthName(d.pym)}.` : `, ${money(Math.abs(d.billTotal - d.prevBills))} ${d.billTotal > d.prevBills ? "more" : "less"} than ${monthName(d.pym)}. Only PG&E changed.`}`}
          cta="See bills"
          onCta={() => go("recurring")}
        >
          <Split parts={d.bills.slice(0, 3).map(([k, v], i) => ({ label: k, value: v, color: ["var(--chart)", "#e8833a", "#22a06b"][i] }))} />
        </Finding>
        <Finding
          tag={<Pill tone="pos">{money(d.cash)} earned</Pill>}
          title={`Cash back you earned in ${monthName(ym)}`}
          body={d.cashCount ? `${d.cashCount} PayPal Offer${d.cashCount === 1 ? "" : "s"} paid out to your balance this month.` : "No offers paid out this month. PayPal AI can match offers to purchases you already made."}
          cta="See offers"
          onCta={() => go("offers")}
        >
          <Btn small kind="secondary" className="self-start" onClick={() => openAssistant("Apply my best offer")}>
            <Sparkles size={14} className="text-accent" /> Find cash back for me
          </Btn>
        </Finding>
      </div>
    </Page>
  );
}

function Finding({ tag, title, body, cta, onCta, children }: { tag: ReactNode; title: string; body: string; cta: string; onCta: () => void; children?: ReactNode }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-[20px] bg-surface p-5">
      <span className="self-start">{tag}</span>
      <h2 className="text-base font-semibold leading-snug">{title}</h2>
      {children}
      <p className="text-[13px] leading-normal text-muted">{body}</p>
      <Btn kind="link" className="mt-auto self-start" onClick={onCta}>
        {cta} →
      </Btn>
    </article>
  );
}

function MoverBars({ state, months, category, current, color }: { state: NonNullable<ReturnType<typeof useFinance>["state"]>; months: string[]; category: string; current: string; color: string }) {
  const vals = months.map((m) => state.transactions.filter((t) => t.amount < 0 && t.category === category && ymOf(t.date) === m).reduce((a, t) => a - t.amount, 0));
  const max = Math.max(...vals, 1);
  return (
    <div aria-hidden className="flex h-24 items-end gap-2 pt-1">
      {months.map((m, i) => {
        const last = m === current;
        return (
          <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cx("text-[10px]", last ? "font-semibold text-text" : "font-medium text-faint")}>{money0(vals[i])}</span>
            <div className="w-full rounded-t-md rounded-b-sm" style={{ height: `${(vals[i] / max) * 60}px`, background: last ? color : "var(--surface-3)" }} />
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
      <div aria-hidden className="mt-1 flex h-3.5 gap-[3px]">
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
