"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import { useClean } from "../AppState";
import { asOfDate, daysInMonth, dataMonths, prevYm, ymOf } from "../data";
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
  suggestLimit,
  type BudItem,
  type BudRow,
  type BudSection,
  type BudState,
} from "../budget/model";
import { BudHead, BudgetRowView, Ring } from "../budget/parts";
import { Btn, Card, cx, money, monthName, Page, Pill, Skeleton } from "../ui";
import { Sparkles } from "../SparkleIcon";

const SEC_NAME: Record<BudSection, string> = { ess: "Essentials", spend: "Spending" };
const FOOTNOTE = "Your PayPal card has no spending limit. It works as long as your balance covers the purchase, so this budget is your own monthly target.";

type Err = { id: string; v: string; over: number; cap: number };

export function BudgetPage() {
  const { state, loading } = useFinance();
  const { toast } = useClean();
  const [bud, setBud] = useState<BudState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [rm, setRm] = useState<string | null>(null);
  const [add, setAdd] = useState<BudSection | null>(null);
  const [err, setErr] = useState<Err | null>(null);
  const [aiOn, setAiOn] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadBudget();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted limits after mount
    if (saved) setBud(saved);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) saveBudget(bud);
  }, [bud, ready]);
  // The assistant (or anything else) can raise the AI suggestions banner with a window event.
  useEffect(() => {
    const on = () => setAiOn(true);
    window.addEventListener("budget:suggest-limits", on);
    return () => window.removeEventListener("budget:suggest-limits", on);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

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
  const monthLabel = `${monthName(ym)} ${ym.slice(0, 4)}`;
  const [ny, nm] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
  const nextLabel = monthName(nm === 12 ? `${ny + 1}-01` : `${ny}-${String(nm + 1).padStart(2, "0")}`);
  const prevYmv = prevYm(ym);

  const sugs: Record<string, number | undefined> = {};
  for (const r of rows) sugs[r.item.id] = suggestLimit(txns, r.item.cat, ym, full);
  const changed = rows.filter((r) => sugs[r.item.id] !== undefined && sugs[r.item.id] !== r.lim);
  const applyAll = () => {
    const n = changed.length;
    setBud((b) => {
      const limits = { ...b.limits };
      for (const r of changed) limits[r.item.id] = sugs[r.item.id]!;
      return { ...b, limits };
    });
    setAiOn(false);
    setErr(null);
    toast("AI suggestions applied", `${n} budget${n === 1 ? "" : "s"} updated`);
  };
  const accept = (id: string) => {
    const s = sugs[id];
    if (s === undefined) return;
    setBud((b) => ({ ...b, limits: { ...b.limits, [id]: s } }));
    setErr(null);
  };

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
  const closeDrawer = () => {
    setSel(null);
    setErr(null);
  };

  const selRow = sel === "total" ? totalRow : rows.find((r) => r.item.id === sel);
  const rmRow = rows.find((r) => r.item.id === rm);
  const insights = selRow && sel !== "total" ? insightsFor(txns, selRow.item.cat, ym, full) : null;

  const heading = (title: string, aside?: ReactNode) => (
    <div className="flex min-h-9 items-center gap-2.5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {aside}
    </div>
  );
  const table = (name: string, list: BudRow[], withTotal: boolean) => (
    <Card flush className="@container/tbl">
      <div role="table" aria-label={name}>
        <BudHead />
        {withTotal && <BudgetRowView total row={totalRow} onOpen={() => setSel("total")} />}
        {list.map((r) => (
          <BudgetRowView key={r.item.id} row={r} suggestion={aiOn && sugs[r.item.id] !== undefined && sugs[r.item.id] !== r.lim ? sugs[r.item.id] : undefined} onAccept={() => accept(r.item.id)} onOpen={() => setSel(r.item.id)} />
        ))}
      </div>
    </Card>
  );

  const monthBtn = "flex size-9 items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.12]";
  return (
    <Page
      title="Budget"
      actions={
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => toast(`${monthName(prevYmv)} ${prevYmv.slice(0, 4)}`, "Past months aren’t part of this prototype", { kind: "info" })} className={monthBtn}>
            <ChevronLeft size={16} />
          </button>
          <div ref={menuRef} className="relative">
            <Btn small aria-haspopup="menu" aria-expanded={menu} aria-label={`Budget month: ${monthLabel}`} onClick={() => setMenu((m) => !m)}>
              <Calendar size={14} />
              {monthLabel}
              <ChevronDown size={14} />
            </Btn>
            {menu && (
              <div role="menu" aria-label="Month" className="absolute right-0 top-[42px] z-10 flex min-w-[260px] flex-col rounded-[14px] border border-border-strong bg-surface-2 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                <button type="button" role="menuitemradio" aria-checked="true" onClick={() => setMenu(false)} className="flex min-h-10 w-full items-center gap-2.5 rounded-[10px] bg-surface-3 px-3 text-left text-sm">
                  <span className="flex-1">{monthLabel}</span>
                  <span className="text-xs text-faint">Current month</span>
                  <span className="flex w-3 text-accent">
                    <Check size={12} />
                  </span>
                </button>
                <div className="mt-1 border-t border-border px-3 pb-1.5 pt-2.5 text-xs leading-snug text-faint">Past months aren’t part of this prototype. {nextLabel} opens on {nextLabel.slice(0, 3)} 1.</div>
              </div>
            )}
          </div>
          <button type="button" aria-label="Next month" disabled className={cx(monthBtn, "opacity-35")}>
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      {aiOn && (
        <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-[20px] bg-accent-bg px-[18px] py-3.5">
          <Sparkles size={18} className="text-accent" />
          <span className="flex min-w-[240px] flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">
              {changed.length ? `PayPal AI suggests ${changed.length} change${changed.length === 1 ? "" : "s"} to your budget` : "Your budget already matches PayPal AI’s suggestions"}
            </span>
            <span className="text-[13px] text-muted">Based on your last 3 months. Nothing is saved until you apply it, and you can still edit any amount.</span>
          </span>
          <Btn small onClick={() => setAiOn(false)}>
            Dismiss
          </Btn>
          <Btn small kind="primary" onClick={applyAll}>
            Apply all
          </Btn>
        </div>
      )}
      <div className="grid items-start gap-[var(--sec-gap,32px)] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[var(--sec-gap,32px)]">
          <div className="flex flex-col gap-3">
            {heading("Essentials")}
            <section aria-label="Essentials">{table("Essentials", rows.filter((r) => r.item.sec === "ess"), true)}</section>
            <span className="text-[13px] leading-normal text-faint">{FOOTNOTE}</span>
          </div>
          <div className="flex flex-col gap-3">
            {heading(
              "Spending",
              <>
                <span className="flex-1" />
                <Btn onClick={() => setAdd("spend")}>
                  <Plus size={16} />
                  Add category
                </Btn>
              </>,
            )}
            <section aria-label="Spending">{table("Spending", rows.filter((r) => r.item.sec === "spend"), false)}</section>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-h-7 items-center gap-2.5">
            <h2 className="text-lg font-semibold">Summary</h2>
          </div>
          <section aria-label="Budget summary">
            <Card className="gap-[22px]">
              <div className="flex flex-col items-center gap-4">
                <span role="img" aria-label={`${money(spent)} spent of ${money(total)}`} className="relative flex size-[220px] items-center justify-center">
                  <span className="absolute inset-0">
                    <Ring pct={total ? (spent / total) * 100 : 0} status="ok" color="var(--accent)" size={220} stroke={14} r={100} />
                  </span>
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-[13px] font-medium text-muted">Left to spend</span>
                    <span className="text-[28px] font-semibold tracking-tight">{money(left)}</span>
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
                <Pill tone="neg">
                  {over} {over === 1 ? "category over budget" : "categories over budget"}
                </Pill>
                <Pill tone="warn">{near} close to the limit</Pill>
              </div>
            </Card>
          </section>
        </div>
      </div>

      {selRow && (
        <BudgetDrawer
          row={selRow}
          secName={sel === "total" ? "Essentials" : SEC_NAME[selRow.item.sec]}
          isTotal={sel === "total"}
          ins={insights}
          total={total}
          alloc={alloc}
          spent={spent}
          err={sel === "total" ? null : errFor(selRow.item.id)}
          onClose={closeDrawer}
          onCommitLimit={(t) => (sel === "total" ? commitTotal(t) : commitLimit(selRow.item.id, t))}
          onRemove={() => setRm(selRow.item.id)}
        />
      )}
      {add && <AddCategoryModal sec={add} secName={SEC_NAME[add]} onClose={() => setAdd(null)} onAdd={addCategory} />}
      {rmRow && <RemoveModal name={rmRow.item.name} limit={rmRow.lim} onCancel={() => setRm(null)} onConfirm={() => removeCategory(rmRow.item.id)} />}
    </Page>
  );
}
