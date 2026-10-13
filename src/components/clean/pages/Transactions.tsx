"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import { isSpend } from "@/lib/finance";
import type { Transaction } from "@/lib/types";
import { niceCap, SpendBars, type SpendBar } from "../charts";
import { asOfDate, daysInMonth, prevYm, ymOf } from "../data";
import { TxDrawer, TxGrid, TxPager, useTxOverrides } from "../TxTable";
import { Btn, Card, cx, money, money0, monthName, monthShort, Page, Section, Segmented, shortDate, Skeleton } from "../ui";

const RANGES = ["1M", "3M", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];
const DATES = [
  ["all", "All dates"],
  ["7d", "Last 7 days"],
  ["month", "This month"],
  ["last", "Last month"],
] as const;
type DateId = (typeof DATES)[number][0];
const PAGE = 10;
const CAT_ORDER = ["Essential bills", "Dining", "Shopping", "Subscriptions", "Income"];
const SEG_COLORS = ["var(--chart)", "#e8833a", "#22a06b", "#a46ee8", "#8a8f98"];
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Spending chart data for a range, ending today. Periods before the first transaction have no value. */
function buildChart(txns: Transaction[], today: string, range: Range) {
  const byDay = new Map<string, number>();
  let first = today;
  for (const t of txns) {
    const d = t.date.slice(0, 10);
    if (d < first) first = d;
    if (isSpend(t)) byDay.set(d, (byDay.get(d) ?? 0) - t.amount);
  }
  const sumDays = (from: string, to: string) => {
    let v = 0;
    for (const [d, x] of byDay) if (d >= from && d <= to) v += x;
    return v;
  };
  const t0 = Date.parse(`${today}T12:00:00Z`);
  const ym = ymOf(today);
  const dayNum = Number(today.slice(8, 10));
  let bars: SpendBar[];
  let sub: string;
  let w: number;
  let unit: string;
  if (range === "1M") {
    unit = "day";
    w = 18;
    bars = Array.from({ length: daysInMonth(ym) }, (_, i) => {
      const day = `${ym}-${String(i + 1).padStart(2, "0")}`;
      return { x: [0, 4, 9, 14, 19, 24, 30].includes(i) ? String(i + 1) : "", title: shortDate(day), value: i < dayNum ? sumDays(day, day) : undefined, current: i === dayNum - 1 };
    });
    const total = bars.reduce((a, b) => a + (b.value ?? 0), 0);
    sub = `spent in ${monthName(ym)} so far · avg ${money0(total / dayNum)}/day`;
  } else if (range === "3M") {
    unit = "week";
    w = 28;
    let prevM = "";
    bars = Array.from({ length: 13 }, (_, i) => {
      const end = iso(t0 - (12 - i) * 7 * DAY);
      const start = iso(t0 - (12 - i) * 7 * DAY - 6 * DAY);
      const m = ymOf(start);
      const x = m !== prevM ? monthShort(m) : "";
      prevM = m;
      return { x, title: `Week of ${shortDate(start)}`, value: end >= first ? sumDays(start, end) : undefined, current: i === 12 };
    });
    sub = `spent in the last 13 weeks · avg ${money0(bars.reduce((a, b) => a + (b.value ?? 0), 0) / 13)}/week`;
  } else if (range === "1Y") {
    unit = "month";
    w = 36;
    const yms: string[] = [];
    for (let m = ym, i = 0; i < 12; i++, m = prevYm(m)) yms.unshift(m);
    bars = yms.map((m) => ({
      x: monthShort(m),
      title: `${monthShort(m)} ${m.slice(0, 4)}${m === ym ? " (to date)" : ""}`,
      value: m >= ymOf(first) ? sumDays(`${m}-01`, `${m}-31`) : undefined,
      current: m === ym,
    }));
    const have = bars.filter((b) => b.value !== undefined).length || 1;
    sub = `spent in the last 12 months · avg ${money0(bars.reduce((a, b) => a + (b.value ?? 0), 0) / have)}/month`;
  } else {
    unit = "year";
    w = 64;
    const y0 = Number(first.slice(0, 4));
    const y1 = Number(ym.slice(0, 4));
    bars = Array.from({ length: y1 - y0 + 1 }, (_, i) => {
      const y = String(y0 + i);
      return { x: y, title: `${y}${y === ym.slice(0, 4) ? " (to date)" : ""}`, value: sumDays(`${y}-01-01`, `${y}-12-31`), current: y === ym.slice(0, 4) };
    });
    sub = `spent since ${monthName(ymOf(first))} ${first.slice(0, 4)}`;
  }
  const total = bars.reduce((a, b) => a + (b.value ?? 0), 0);
  const cap = niceCap(bars.map((b) => b.value ?? 0));
  const aria = `Spending by ${unit}: ${bars.filter((b) => b.value !== undefined).map((b) => `${b.title} ${money(b.value!)}`).join(", ")}.`;
  return { bars, total, sub, w, cap, aria, first };
}

export function TransactionsPage() {
  const { state, loading } = useFinance();
  const apply = useTxOverrides();
  const [range, setRange] = useState<Range>("1M");
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [date, setDate] = useState<DateId>("all");
  const [cats, setCats] = useState<string[]>([]);
  const [menu, setMenu] = useState<"date" | "cat" | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [pg, setPg] = useState<{ k: string; p: number }>({ k: "", p: 0 });

  const chart = useMemo(() => (state ? buildChart(state.transactions, asOfDate(state), range) : null), [state, range]);

  if (loading || !state || !chart) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;

  const today = asOfDate(state);
  const ym = ymOf(today);
  const end = Date.parse(`${today}T23:59:59Z`);
  const all = [...state.transactions].reverse().filter((t) => t.category !== "Cashback").map(apply);
  const dateOk = (t: Transaction) =>
    date === "all" || (date === "7d" ? Date.parse(t.date) > end - 7 * DAY : date === "month" ? ymOf(t.date) === ym : ymOf(t.date) === prevYm(ym));
  const needle = q.trim().toLowerCase();
  const base = all.filter((t) => dateOk(t) && (!needle || t.merchant.toLowerCase().includes(needle) || t.category.toLowerCase().includes(needle)));
  const rows = base.filter((t) => !cats.length || cats.some((c) => (c === "Needs review" ? !!t.needsReview : t.category === c)));
  const present = [...new Set(state.transactions.map((t) => t.category))].filter((c) => c !== "Cashback");
  const catOptions = [...CAT_ORDER.filter((c) => present.includes(c as never)), ...present.filter((c) => !CAT_ORDER.includes(c)).sort(), "Needs review"];

  const key = [date, q, cats.join("|")].join("~");
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pg.k === key ? pg.p : 0, pages - 1);

  const sel = selId ? (all.find((t) => t.id === selId) ?? null) : null;

  // Summary: spending in this view (date + search), by category.
  const debits = base.filter((t) => isSpend(t));
  const spent = debits.reduce((a, t) => a - t.amount, 0);
  const byCat = new Map<string, number>();
  for (const t of debits) byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount);
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const catList: [string, number][] = sorted.length > 5 ? [...sorted.slice(0, 4), ["Everything else", sorted.slice(4).reduce((a, c) => a + c[1], 0)]] : sorted;
  const dates = base.map((t) => t.date.slice(0, 10)).sort();
  const scope = [date === "all" ? (dates.length ? `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}` : "All dates") : DATES.find((x) => x[0] === date)![1], q && `“${q}”`].filter(Boolean).join(" · ");
  const dateActive = date !== "all";

  return (
    <Page title="Transactions">
      <Section title="Spending">
        <Card className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-1 flex-wrap items-baseline gap-x-2.5">
              <span className="num text-2xl font-semibold">{money(chart.total)}</span>
              <span className="text-sm text-muted">{chart.sub}</span>
            </div>
            <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
          </div>
          <SpendBars key={range} bars={chart.bars} cap={chart.cap} maxBarWidth={chart.w} aria={chart.aria} />
        </Card>
      </Section>

      <div className="grid grid-cols-1 items-start gap-[var(--sec-gap,32px)] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Transactions</h2>
            <span className="flex-1" />
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
              aria-pressed={searchOpen}
              onClick={() => {
                if (searchOpen) setQ("");
                setSearchOpen(!searchOpen);
                setMenu(null);
              }}
            >
              {searchOpen ? <X size={14} /> : <Search size={14} />}
              {searchOpen ? "Clear" : "Search"}
            </Btn>
            <Menu open={menu === "date"} onToggle={() => setMenu(menu === "date" ? null : "date")} onClose={() => setMenu(null)} active={dateActive} label={dateActive ? DATES.find((x) => x[0] === date)![1] : "Date"}>
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
              {catOptions.map((c) => (
                <MenuItem key={c} on={cats.includes(c)} role="menuitemcheckbox" onClick={() => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}>
                  {c}
                </MenuItem>
              ))}
            </Menu>
          </div>
          <section aria-label="Transactions" className="overflow-hidden rounded-[20px] bg-surface py-1">
            <TxGrid rows={rows} selected={sel?.id} onOpen={(t) => { setSelId(t.id); setMenu(null); }} pageSize={PAGE} page={page} cash={false} />
          </section>
          <TxPager total={rows.length} page={page} pageSize={PAGE} onPage={(p) => setPg({ k: key, p })} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-h-9 items-center">
            <h2 className="text-lg font-semibold">Summary</h2>
          </div>
          <section aria-label="Summary" className="flex flex-col gap-[22px] rounded-[20px] bg-surface p-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-faint">Spent · {scope}</span>
              <span className="num text-[26px] font-semibold">{money(spent)}</span>
            </div>
            <div aria-hidden className="flex h-2 gap-[3px]">
              {catList.map(([n, v], i) => (
                <div key={n} className="min-w-1 rounded" style={{ flex: `${Math.max(v, 0.0001)} 1 0`, background: SEG_COLORS[n === "Everything else" ? 4 : i] }} />
              ))}
            </div>
            <div className="flex flex-col gap-[13px]">
              {catList.length === 0 && <span className="text-sm text-muted">No spending in this view</span>}
              {catList.map(([n, v], i) => (
                <div key={n} className="flex items-center gap-2.5 text-sm">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: SEG_COLORS[n === "Everything else" ? 4 : i] }} />
                  <span className="min-w-0 flex-1">{n}</span>
                  <span className="w-10 text-right text-faint">{Math.round((v / Math.max(spent, 1)) * 100)}%</span>
                  <span className="num w-[84px] text-right">{money(v)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {sel && <TxDrawer tx={sel} onClose={() => setSelId(null)} />}
    </Page>
  );
}

export function Menu({ open, onToggle, onClose, active, label, children, icon, minWidth = 210 }: { open: boolean; onToggle: () => void; onClose: () => void; active: boolean; label: string; children: ReactNode; icon?: ReactNode; minWidth?: number }) {
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
        {icon}
        {label}
        <ChevronDown size={14} />
      </Btn>
      {open && (
        <div role="menu" style={{ minWidth }} className="absolute right-0 top-[42px] z-20 flex max-h-80 flex-col overflow-y-auto rounded-[14px] border border-border-strong bg-surface-2 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ on, role, onClick, children, note }: { on: boolean; role: "menuitemradio" | "menuitemcheckbox"; onClick: () => void; children: ReactNode; note?: ReactNode }) {
  return (
    <button type="button" role={role} aria-checked={on} onClick={onClick} className={cx("flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-left text-sm", on ? "bg-surface-3" : "hover:bg-white/[0.04]")}>
      <span className="flex-1">{children}</span>
      {note && <span className="text-xs text-faint">{note}</span>}
      <span className="flex w-3 justify-end">{on && <Check size={14} className="text-accent" />}</span>
    </button>
  );
}
