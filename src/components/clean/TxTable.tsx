"use client";

// Transactions table (Merchant | Date | Category | Amount), its pager, and the details drawer,
// as drawn in design/clean/ProtoClean.dc.html.

import { useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { METHOD_LABEL } from "./format";
import type { Category, Offer, Transaction } from "@/lib/types";
import { useClean } from "./AppState";
import { Logo, logoMark } from "./Logo";
import { Avatar, Btn, cx, Drawer, money, Panel, Pill, shortDate } from "./ui";
import { Sparkles } from "./SparkleIcon";

// ---- Local category changes -------------------------------------------------------------
// There is no endpoint for changing a category from the UI, so a change made in the drawer is kept
// for the session and applied wherever transactions are listed (table, summary, drawer).
const overrides = new Map<string, Category>();
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
export function setTxCategory(id: string, category: Category) {
  overrides.set(id, category);
  version++;
  listeners.forEach((l) => l());
}
/** Re-renders when a category changes; returns a function that applies the changes to a transaction. */
export function useTxOverrides() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return <T extends Transaction>(t: T): T => {
    const c = overrides.get(t.id);
    return c ? { ...t, category: c, needsReview: false } : t;
  };
}

/** Merchant mark: the design's logo where it has one, a letter avatar otherwise. */
export function MerchantMark({ name, size = 34 }: { name: string; size?: number }) {
  const mark = logoMark(name);
  return mark ? <Logo mark={mark} size={size} /> : <Avatar name={name} size={size} className="text-[13px]" />;
}

/** Cash back tied to a purchase. */
function cashLine(t: Transaction, offers: Offer[], all: Transaction[]) {
  const o = t.appliedOfferId ? offers.find((x) => x.id === t.appliedOfferId) : undefined;
  if (!o) return null;
  if (o.status === "pending") return { text: `+${money(o.pendingCashback ?? 0)}`, pending: true, tone: "text-warning" };
  const credit = all.find((x) => x.category === "Cashback" && x.description === `Cash back — ${o.title}`);
  return credit ? { text: `+${money(credit.amount)} · added ${shortDate(credit.date)}`, pending: false, tone: "text-positive" } : null;
}

const COLS = "grid grid-cols-[minmax(0,2.15fr)_minmax(84px,0.85fr)_minmax(0,1.4fr)_minmax(112px,0.9fr)] items-center gap-4 px-5";
const signed = (n: number) => (n > 0 ? "+" : "") + money(Math.abs(n));

/** Table with left-aligned headers. With `pageSize`, shows page `page` (0-based) of the rows. */
export function TxGrid({
  rows,
  selected,
  onOpen,
  quickFilter,
  pageSize,
  page = 0,
  cash = true,
}: {
  rows: Transaction[];
  selected?: string | null;
  onOpen: (t: Transaction) => void;
  quickFilter?: string;
  pageSize?: number;
  page?: number;
  /** Show the cash back line under the merchant. */
  cash?: boolean;
}) {
  const { state } = useFinance();
  const apply = useTxOverrides();
  const q = quickFilter?.trim().toLowerCase();
  const all = rows.map(apply).filter((t) => !q || `${t.merchant} ${t.description} ${t.category}`.toLowerCase().includes(q));
  const shown = pageSize ? all.slice(page * pageSize, (page + 1) * pageSize) : all;
  return (
    <div role="table" aria-label="Transactions">
      <div role="row" className={cx(COLS, "py-2.5 text-[13px] text-faint")}>
        <span role="columnheader">Merchant</span>
        <span role="columnheader">Date</span>
        <span role="columnheader">Category</span>
        <span role="columnheader">Amount</span>
      </div>
      {shown.length === 0 && <div className="px-5 py-6 text-sm text-muted">No transactions match these filters.</div>}
      {shown.map((t) => {
        const c = cash ? cashLine(t, state?.offers ?? [], state?.transactions ?? []) : null;
        return (
          <button
            key={t.id}
            type="button"
            role="row"
            onClick={() => onOpen(t)}
            className={cx(COLS, "w-full border-0 py-[13px] text-left text-text", selected === t.id ? "bg-accent-bg" : "bg-transparent hover:bg-white/[0.03]")}
          >
            <span className="flex min-w-0 items-center gap-3">
              <MerchantMark name={t.merchant} />
              <span className="flex min-w-0 flex-col">
                <span className="block truncate text-[15px]">{t.merchant}</span>
                {c && <span className={cx("block truncate text-xs font-medium", c.tone)}>{c.text}{c.pending ? " · pending" : ""}</span>}
              </span>
            </span>
            <span className="whitespace-nowrap text-sm">{shortDate(t.date)}</span>
            <span className={cx("block truncate text-sm", t.needsReview ? "font-medium text-accent" : "text-muted")}>
              {t.needsReview ? "Needs review" : t.category}
              {t.status === "pending" ? " · pending" : ""}
            </span>
            <span className={cx("num text-[15px]", t.status === "pending" ? "text-warning" : t.amount > 0 && "text-positive")}>{signed(t.amount)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Showing 1 to 10 of 614" with Previous / Next. Hidden when everything fits on one page. */
export function TxPager({ total, page, pageSize, onPage }: { total: number; page: number; pageSize: number; onPage: (p: number) => void }) {
  if (total <= pageSize) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(page, pages - 1);
  const nav = "flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-text transition hover:bg-white/[0.12] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-white/[0.08]";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-faint">
      <span>
        Showing {p * pageSize + 1} to {Math.min(total, (p + 1) * pageSize)} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex items-center gap-3">
        <span>
          Page {p + 1} of {pages}
        </span>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => onPage(p - 1)} className={nav}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => onPage(p + 1)} className={nav}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

const PICK = ["Dining", "Shopping", "Groceries", "Transport", "Essential bills", "Subscriptions", "Income"] as const;
const Row = ({ k, children, first }: { k: string; children: React.ReactNode; first?: boolean }) => (
  <div className={cx("flex items-center py-4", !first && "border-t border-border")}>
    <span className="flex-1 text-[13px] text-muted">{k}</span>
    <span className="text-[13px] font-medium">{children}</span>
  </div>
);

export function TxDrawer({ tx: raw, onClose }: { tx: Transaction; onClose: () => void }) {
  const { openAssistant } = useAssistantUI();
  const { state } = useFinance();
  const { toast } = useClean();
  const apply = useTxOverrides();
  const tx = apply(raw);
  const [pick, setPick] = useState<Category | null | false>(false); // false = details view, null = picking, string = chosen
  const cash = cashLine(tx, state?.offers ?? [], state?.transactions ?? []);
  const method = tx.method === "paypal_debit_card" ? `Debit card ••${state?.userProfile.card.last4 ?? ""}` : METHOD_LABEL[tx.method];
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(tx.date));
  const picking = pick !== false;

  const save = (c: Category) => {
    setTxCategory(tx.id, c);
    setPick(false);
    toast(`Category set to ${c}`, `Similar ${tx.merchant} charges will be sorted the same way`);
  };

  return (
    <Drawer label="Transaction" onClose={onClose}>
      {picking && (
        <button type="button" onClick={() => setPick(false)} className="-mt-1 inline-flex min-h-9 items-center gap-1 self-start pl-0.5 pr-2 text-[13px] font-medium text-muted hover:text-text">
          <ChevronLeft size={16} />
          Back
        </button>
      )}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <span className={cx("num text-[32px] font-semibold leading-[1.15] tracking-[-0.02em]", tx.amount > 0 && "text-positive")}>{signed(tx.amount)}</span>
          <span className="text-[13px] text-muted">
            {tx.merchant} · {shortDate(tx.date)}
          </span>
        </div>
        <MerchantMark name={tx.merchant} size={48} />
      </div>

      {!picking ? (
        <>
          <Panel>
            <Row first k="Date">{date}</Row>
            <Row k="Payment method">{method}</Row>
            <Row k="Category">{tx.category}</Row>
            {cash && (
              <Row k="Cash back">
                <span className="flex items-center gap-2">
                  <span className="text-positive">{cash.text}</span>
                  {cash.pending && <Pill tone="warn">Pending</Pill>}
                </span>
              </Row>
            )}
          </Panel>
          {tx.needsReview && (
            <div className="flex items-start gap-2.5 rounded-[10px] bg-accent-bg px-3.5 py-3">
              <Sparkles size={18} className="shrink-0 text-accent" />
              <p className="text-xs leading-normal">This looks like a coffee shop, so it’s probably Dining. Confirm it and similar charges will be sorted automatically.</p>
            </div>
          )}
          <div className="mt-auto flex gap-2 pt-2">
            <Btn className="flex-1 !bg-accent-bg !text-accent hover:!bg-accent-bg/70" onClick={() => openAssistant(`Tell me about my ${tx.merchant} charges`)}>
              <Sparkles size={16} /> Ask about this
            </Btn>
            <Btn className="flex-1" onClick={() => (tx.needsReview ? save("Dining") : setPick(null))}>
              {tx.needsReview ? "Confirm Dining" : "Change category"}
            </Btn>
          </div>
        </>
      ) : (
        <>
          <Panel>
            <Row first k="Current category">{tx.category}</Row>
          </Panel>
          <span className="mt-1 text-[13px] font-medium text-muted">Change to</span>
          <div role="radiogroup" aria-label="New category" className="rounded-[10px] border border-border bg-surface-2 px-3.5">
            {PICK.filter((l) => l !== tx.category).map((l, i) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={pick === l}
                onClick={() => setPick(l)}
                className={cx("flex w-full items-center gap-3 py-4 text-left text-[13px] text-text", i > 0 && "border-t border-border")}
              >
                <span className="flex-1">{l}</span>
                <span className="text-sm text-accent">{pick === l ? "✓" : ""}</span>
              </button>
            ))}
          </div>
          <div className="mt-auto flex pt-2">
            <Btn kind="primary" className="flex-1" disabled={!pick} onClick={() => pick && save(pick)}>
              Save category
            </Btn>
          </div>
        </>
      )}
    </Drawer>
  );
}
