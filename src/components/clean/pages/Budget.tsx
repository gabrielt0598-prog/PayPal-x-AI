"use client";

import { useEffect, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Plus, Sparkles, X } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { useClean } from "../AppState";
import { asOfDate, daysInMonth, dataMonths, ymOf } from "../data";
import { AddCategoryModal, BudgetDrawer, RemoveModal } from "../budget/drawers";
import {
  catForName,
  DEFAULT_STATE,
  insightsFor,
  loadBudget,
  parseAmount,
  saveBudget,
  spentIn,
  statusOf,
  type BudItem,
  type BudRow,
  type BudSection,
  type BudState,
} from "../budget/model";
import { BudHead, BudgetRowView, Ring } from "../budget/parts";
import { Btn, Card, money, monthName, Page, Pill, Section, Skeleton } from "../ui";

const SEC_NAME: Record<BudSection, string> = { ess: "Essentials", spend: "Expenses" };
const FOOTNOTE = "Your PayPal card has no spending limit. It works as long as your balance covers the purchase, so this budget is your own monthly target.";

type Err = { id: string; v: string; over: number; cap: number };

export function BudgetPage() {
  const { state, loading } = useFinance();
  const { toast } = useClean();
  const { openAssistant } = useAssistantUI();
  const [bud, setBud] = useState<BudState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [rm, setRm] = useState<string | null>(null);
  const [add, setAdd] = useState<BudSection | null>(null);
  const [err, setErr] = useState<Err | null>(null);
  const [aiOpen, setAiOpen] = useState(true);

  useEffect(() => {
    const saved = loadBudget();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted limits after mount
    if (saved) setBud(saved);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) saveBudget(bud);
  }, [bud, ready]);

  const txns = state?.transactions;
  const today = state ? asOfDate(state) : "";
  const ym = today ? ymOf(today) : "";
  const full = new Set(state ? dataMonths(state).filter((m) => m.full).map((m) => m.ym) : []);

  const rows: BudRow[] = (txns ? bud.items : []).map((item) => {
    const sp = spentIn(txns ?? [], item.cat, ym);
    const lim = bud.limits[item.id] || 0;
    return { item, sp, lim, left: lim - sp, status: statusOf(sp, lim) };
  });

  if (loading || !state || !txns) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;

  const total = bud.total;
  const alloc = rows.reduce((a, r) => a + r.lim, 0);
  const spent = rows.reduce((a, r) => a + r.sp, 0);
  const left = total - spent;
  const unalloc = total - alloc;
  const tStatus = statusOf(spent, total);
  const over = rows.filter((r) => r.status === "over").length;
  const near = rows.filter((r) => r.status === "near").length;
  const daysLeft = Math.max(1, daysInMonth(ym) - Number(today.slice(8, 10)) + 1);
  const totalRow: BudRow = { item: { id: "total", name: "Monthly budget", icon: "bolt", sec: "ess" }, sp: spent, lim: total, left, status: tStatus };

  const commitLimit = (id: string, text: string) => {
    const n = parseAmount(text);
    const next = alloc - (bud.limits[id] || 0) + n;
    if (next > total) {
      setErr({ id, v: String(n), over: next - total, cap: total });
      return;
    }
    setErr(null);
    setBud((b) => ({ ...b, limits: { ...b.limits, [id]: n } }));
  };
  const commitTotal = (text: string) => {
    setErr(null);
    setBud((b) => ({ ...b, total: parseAmount(text, 999999) }));
  };
  const errFor = (id: string) => (err && err.id === id ? err : null);

  const addCategory = (sec: BudSection, name: string, lim: number) => {
    const item: BudItem = { id: `c${Date.now()}`, name, icon: sec === "ess" ? "bolt" : "cart", sec, cat: catForName(name) };
    setBud((b) => ({ ...b, items: [...b.items, item], limits: { ...b.limits, [item.id]: lim } }));
    setAdd(null);
    toast(`${name} added to ${SEC_NAME[sec]}`, lim ? `${money(lim)} a month` : "Set a monthly limit any time");
  };
  const removeCategory = (id: string) => {
    const prev = rows.find((r) => r.item.id === id);
    if (!prev) return;
    const idx = bud.items.findIndex((i) => i.id === id);
    setBud((b) => {
      const limits = { ...b.limits };
      delete limits[id];
      return { ...b, items: b.items.filter((i) => i.id !== id), limits };
    });
    setRm(null);
    setSel(null);
    setErr(null);
    toast(`${prev.item.name} removed`, `Removed from ${SEC_NAME[prev.item.sec]}`, {
      kind: "info",
      undo: () =>
        setBud((b) => {
          const items = b.items.slice();
          items.splice(Math.min(idx, items.length), 0, prev.item);
          return { ...b, items, limits: { ...b.limits, [id]: prev.lim } };
        }),
    });
  };

  const selRow = sel === "total" ? totalRow : rows.find((r) => r.item.id === sel);
  const rmRow = rows.find((r) => r.item.id === rm);
  const insights = selRow && sel !== "total" ? insightsFor(txns, selRow.item.cat, ym, full) : null;

  const section = (sec: BudSection, list: BudRow[], withTotal: boolean, footnote?: string) => (
    <Section
      title={SEC_NAME[sec]}
      aside={
        <>
          <span className="flex-1" />
          <Btn small onClick={() => setAdd(sec)}>
            <Plus size={16} />
            Add category
          </Btn>
        </>
      }
    >
      <Card flush className="@container/tbl">
        <div role="table" aria-label={SEC_NAME[sec]}>
          <BudHead />
          {withTotal && <BudgetRowView total row={totalRow} onOpen={() => setSel("total")} onCommit={commitTotal} />}
          {list.map((r) => (
            <BudgetRowView key={r.item.id} row={r} err={errFor(r.item.id)} onOpen={() => setSel(r.item.id)} onCommit={(t) => commitLimit(r.item.id, t)} />
          ))}
        </div>
      </Card>
      {footnote && <p className="text-[13px] leading-normal text-faint">{footnote}</p>}
    </Section>
  );

  return (
    <Page
      title="Budget"
      actions={
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => toast("Past months aren’t available yet", "Budgets track the current month", { kind: "info" })} className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.12]">
            <ChevronLeft size={16} />
          </button>
          <span aria-label={`Budget month: ${monthName(ym)} ${ym.slice(0, 4)}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-white/[0.08] px-3.5 text-[13px] font-medium">
            <Calendar size={14} className="text-faint" />
            {monthName(ym)} {ym.slice(0, 4)}
          </span>
          <button type="button" aria-label="Next month" disabled className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] disabled:opacity-35">
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      {aiOpen && (
        <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-[20px] bg-accent-bg px-[18px] py-3.5">
          <Sparkles size={18} className="text-accent" />
          <span className="flex min-w-[240px] flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">Want PayPal AI to suggest your limits?</span>
            <span className="text-[13px] text-muted">It looks at your last 3 months. Nothing changes until you edit an amount yourself.</span>
          </span>
          <Btn small onClick={() => openAssistant("Suggest budget limits for next month based on my last 3 months of spending")}>
            Ask PayPal AI
          </Btn>
          <button type="button" aria-label="Dismiss" onClick={() => setAiOpen(false)} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-white/[0.06] hover:text-text">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="grid items-start gap-[var(--sec-gap,32px)] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[var(--sec-gap,32px)]">
          {section("ess", rows.filter((r) => r.item.sec === "ess"), true, FOOTNOTE)}
          {section("spend", rows.filter((r) => r.item.sec === "spend"), false)}
        </div>
        <Section title="Summary" className="order-first @3xl:order-none">
          <Card className="gap-[22px]">
            <div className="flex flex-col items-center gap-4">
              <span role="img" aria-label={`${money(left)} left of ${money(total)}`} className="relative flex size-[220px] items-center justify-center">
                <span className="absolute inset-0">
                  <Ring pct={total ? (spent / total) * 100 : 0} status={tStatus} size={220} stroke={14} />
                </span>
                <span className="flex flex-col items-center gap-1">
                  <span className="text-[13px] font-medium text-muted">{left < 0 ? "Over budget" : "Left to spend"}</span>
                  <span className="text-[28px] font-semibold tracking-tight">{money(Math.abs(left))}</span>
                  <span className="text-[13px] text-faint">of {money(total)}</span>
                </span>
              </span>
              <span className="text-center text-[13px] text-muted">
                That’s {money(Math.max(0, left) / daysLeft)}/day for the next {daysLeft} days of the month.
              </span>
            </div>
            <div className="flex flex-col gap-3.5 text-[15px]">
              <div className="flex items-center gap-2.5">
                <span className="flex-1">Budgeted</span>
                <span className="font-semibold">{money(alloc)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex-1">Current spend</span>
                <span className="font-semibold">{money(spent)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex-1">{unalloc < 0 ? "Over-allocated by" : "Unallocated"}</span>
                <span className={unalloc < 0 ? "font-semibold text-negative" : "font-semibold"}>{money(Math.abs(unalloc))}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill tone="neg">{over} over budget</Pill>
              <Pill tone="warn">{near} near limit</Pill>
            </div>
          </Card>
        </Section>
      </div>

      {selRow && (
        <BudgetDrawer
          row={selRow}
          isTotal={sel === "total"}
          ins={insights}
          total={total}
          alloc={alloc}
          spent={spent}
          err={sel === "total" ? null : errFor(selRow.item.id)}
          onClose={() => setSel(null)}
          onCommitLimit={(t) => (sel === "total" ? commitTotal(t) : commitLimit(selRow.item.id, t))}
          onRemove={() => setRm(selRow.item.id)}
        />
      )}
      {add && <AddCategoryModal sec={add} secName={SEC_NAME[add]} room={total - alloc} cap={total} onClose={() => setAdd(null)} onAdd={addCategory} />}
      {rmRow && <RemoveModal name={rmRow.item.name} secName={SEC_NAME[rmRow.item.sec]} limit={rmRow.lim} onCancel={() => setRm(null)} onConfirm={() => removeCategory(rmRow.item.id)} />}
    </Page>
  );
}
