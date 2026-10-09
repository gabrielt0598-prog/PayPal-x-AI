"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, Sparkles, X } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { categoryBreakdown, isSpend } from "@/lib/finance";
import type { Category, Transaction } from "@/lib/types";
import { Bars, type Bar } from "../charts";
import { asOfDate, incomeOut, monthTotals, prevYm, ymOf } from "../data";
import { TxDrawer, TxRows } from "../TxTable";
import { Btn, Card, cx, money, monthName, monthShort, Page, Section, Segmented, shortDate, Skeleton } from "../ui";

const RANGES = ["1M", "3M", "All"] as const;
const DATES = [
  ["all", "All dates"],
  ["7d", "Last 7 days"],
  ["month", "This month"],
  ["last", "Last month"],
] as const;
type DateId = (typeof DATES)[number][0];

export function TransactionsPage() {
  const { state, loading } = useFinance();
  const { openAssistant } = useAssistantUI();
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [date, setDate] = useState<DateId>("all");
  const [cats, setCats] = useState<Category[]>([]);
  const [menu, setMenu] = useState<"date" | "cat" | null>(null);
  const [limit, setLimit] = useState(40);
  const [sel, setSel] = useState<Transaction | null>(null);

  const d = useMemo(() => {
    if (!state) return null;
    const today = asOfDate(state);
    const ym = ymOf(today);
    const end = Date.parse(`${today}T23:59:59Z`);
    const all = [...state.transactions].reverse();
    const dateOk = (t: Transaction) =>
      date === "all" || (date === "7d" ? Date.parse(t.date) > end - 7 * 86_400_000 : date === "month" ? ymOf(t.date) === ym : ymOf(t.date) === prevYm(ym));
    const base = all.filter((t) => dateOk(t) && (!q || t.merchant.toLowerCase().includes(q.toLowerCase())));
    const rows = base.filter((t) => !cats.length || cats.includes(t.category));
    const bars: Bar[] =
      range === "1M"
        ? Array.from({ length: 30 }, (_, i) => {
            const day = new Date(end - (29 - i) * 86_400_000).toISOString().slice(0, 10);
            const value = state.transactions.filter((t) => isSpend(t) && t.date.startsWith(day)).reduce((a, t) => a - t.amount, 0);
            return { label: shortDate(day), title: shortDate(day), value, current: i === 29, showLabel: i % 7 === 1 };
          })
        : range === "3M"
          ? Array.from({ length: 13 }, (_, i) => {
              const to = end - (12 - i) * 7 * 86_400_000;
              const from = to - 7 * 86_400_000;
              const start = new Date(from + 86_400_000).toISOString().slice(0, 10);
              const value = state.transactions.filter((t) => isSpend(t) && Date.parse(t.date) > from && Date.parse(t.date) <= to).reduce((a, t) => a - t.amount, 0);
              return { label: shortDate(start), title: `Week of ${shortDate(start)}`, value, current: i === 12, showLabel: i % 3 === 0 };
            })
          : [...new Set(state.transactions.map((t) => ymOf(t.date)))].sort().map((m) => ({ label: monthShort(m), title: monthName(m), value: monthTotals(state, m).spend, current: m === ym }));
    const categories = [...new Set(state.transactions.map((t) => t.category))].sort();
    return { rows, base, bars, categories, io: incomeOut(base), top: categoryBreakdown(base).slice(0, 3), ym };
  }, [state, date, q, cats, range]);

  if (loading || !state || !d) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const total = d.io.in + d.io.out || 1;
  const scope = [date === "all" ? "All dates" : DATES.find((x) => x[0] === date)?.[1], q && `“${q}”`].filter(Boolean).join(" · ");

  return (
    <Page title="Transactions">
      <div className="grid grid-cols-1 items-stretch gap-5 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Section title="Spending" aside={<span className="ml-auto"><Segmented label="Range" value={range} options={RANGES} onChange={setRange} /></span>}>
          <Card className="flex-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-muted">{range === "1M" ? "Daily spend · last 30 days" : range === "3M" ? "Weekly spend · last 13 weeks" : "Monthly spend"}</span>
              <span className="num text-2xl font-semibold">{money(d.bars.reduce((a, b) => a + b.value, 0))}</span>
            </div>
            <Bars bars={d.bars} aria={`Spending, ${range}`} height={180} />
          </Card>
        </Section>
        <Section title="Summary">
          <Card className="flex-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-muted">Net · {scope}</span>
              <span className={cx("num text-2xl font-semibold", d.io.net >= 0 && "text-positive")}>{(d.io.net >= 0 ? "+" : "−") + money(Math.abs(d.io.net))}</span>
            </div>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
              <div className="bg-positive" style={{ width: `${(d.io.in / total) * 100}%` }} />
              <div className="bg-chart" style={{ width: `${(d.io.out / total) * 100}%` }} />
            </div>
            <div className="flex text-[13px]">
              <span className="flex-1 text-muted">
                In <span className="num font-medium text-text">{money(d.io.in)}</span>
              </span>
              <span className="text-muted">
                Out <span className="num font-medium text-text">{money(d.io.out)}</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="pb-1 text-xs font-medium text-faint">Top categories</span>
              {d.top.map((c, i) => (
                <div key={c.category} className={cx("flex py-2 text-sm", i && "border-t border-border")}>
                  <span className="flex-1">{c.category}</span>
                  <span className="num">{money(c.spend)}</span>
                </div>
              ))}
            </div>
            <Btn kind="link" className="mt-auto self-start" onClick={() => openAssistant("Categorize my recent transactions")}>
              <Sparkles size={14} /> Check categories with AI →
            </Btn>
          </Card>
        </Section>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">Transactions</h2>
        {searchOpen && (
          <>
            <label htmlFor="tx-search" className="sr-only">
              Search merchants
            </label>
            <input
              id="tx-search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search merchants"
              className="h-9 w-[200px] rounded-full border border-border-strong bg-surface px-3.5 text-[13px] outline-none placeholder:text-faint"
            />
          </>
        )}
        <Btn
          small
          kind={searchOpen || q ? "primary" : "secondary"}
          onClick={() => {
            if (searchOpen) setQ("");
            setSearchOpen(!searchOpen);
            setMenu(null);
          }}
        >
          {searchOpen ? <X size={14} /> : <Search size={14} />}
          {searchOpen ? "Close" : "Search"}
        </Btn>
        <Menu
          open={menu === "date"}
          onToggle={() => setMenu(menu === "date" ? null : "date")}
          onClose={() => setMenu(null)}
          active={date !== "all"}
          label={date === "all" ? "Date" : DATES.find((x) => x[0] === date)![1]}
        >
          {DATES.map(([id, label]) => (
            <MenuItem
              key={id}
              on={date === id}
              role="menuitemradio"
              onClick={() => {
                setDate(id);
                setMenu(null);
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
        <Menu
          open={menu === "cat"}
          onToggle={() => setMenu(menu === "cat" ? null : "cat")}
          onClose={() => setMenu(null)}
          active={cats.length > 0}
          label={cats.length === 0 ? "Categories" : cats.length === 1 ? cats[0] : `${cats.length} categories`}
        >
          <MenuItem on={cats.length === 0} role="menuitemcheckbox" onClick={() => setCats([])}>
            All categories
          </MenuItem>
          {d.categories.map((c) => (
            <MenuItem key={c} on={cats.includes(c)} role="menuitemcheckbox" onClick={() => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}>
              {c}
            </MenuItem>
          ))}
        </Menu>
      </div>
      <Card flush>
        <TxRows rows={d.rows.slice(0, limit)} selected={sel?.id} onOpen={setSel} />
        {d.rows.length === 0 && <p className="px-5 py-6 text-sm text-muted">No transactions match these filters.</p>}
        {d.rows.length > limit && (
          <div className="px-5 pb-3 pt-1.5">
            <Btn kind="link" onClick={() => setLimit((l) => l + 40)}>
              Show more ({d.rows.length - limit} left) →
            </Btn>
          </div>
        )}
      </Card>
      {sel && <TxDrawer tx={sel} onClose={() => setSel(null)} />}
    </Page>
  );
}

export function Menu({ open, onToggle, onClose, active, label, children }: { open: boolean; onToggle: () => void; onClose: () => void; active: boolean; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return (
    <div ref={ref} className="relative">
      <Btn small kind={active ? "primary" : "secondary"} aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>
        {label}
        <ChevronDown size={14} />
      </Btn>
      {open && (
        <div role="menu" className="absolute right-0 top-[42px] z-20 flex max-h-80 min-w-[210px] flex-col overflow-y-auto rounded-[14px] border border-border-strong bg-surface-2 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ on, role, onClick, children }: { on: boolean; role: "menuitemradio" | "menuitemcheckbox"; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role={role} aria-checked={on} onClick={onClick} className={cx("flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-left text-sm", on ? "bg-surface-3" : "hover:bg-white/[0.04]")}>
      <span className="flex-1">{children}</span>
      {on && <Check size={14} className="text-accent" />}
    </button>
  );
}
