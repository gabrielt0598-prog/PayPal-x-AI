"use client";

// Transactions table (AG Grid: Merchant | Date | Category | Amount) and the details drawer.

import { useMemo } from "react";
import type { CellClassParams, ColDef, ICellRendererParams } from "ag-grid-community";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { METHOD_LABEL } from "./format";
import type { Offer, Transaction } from "@/lib/types";
import { Grid } from "./Grid";
import { amt, Avatar, Btn, cx, Drawer, KV, money, Panel, Pill, shortDate } from "./ui";
import { Sparkles } from "./SparkleIcon";

/** Cash back tied to a purchase, shown under the merchant as on the Clean design. */
function cashLine(t: Transaction, offers: Offer[], all: Transaction[]) {
  const o = t.appliedOfferId ? offers.find((x) => x.id === t.appliedOfferId) : undefined;
  if (!o) return null;
  if (o.status === "pending") return { text: `+${money(o.pendingCashback ?? 0)} · pending`, tone: "text-warning" };
  const credit = all.find((x) => x.category === "Cashback" && x.description === `Cash back — ${o.title}`);
  return credit ? { text: `+${money(credit.amount)} · added ${shortDate(credit.date)}`, tone: "text-positive" } : null;
}

function txCols(selected: string | null | undefined, offers: Offer[], all: Transaction[]): ColDef<Transaction>[] {
  const cols: ColDef<Transaction>[] = [
  {
    field: "merchant",
    headerName: "Merchant",
    flex: 2,
    minWidth: 180,
    getQuickFilterText: (p) => `${p.data?.merchant} ${p.data?.description}`,
    cellRenderer: ({ data }: ICellRendererParams<Transaction>) =>
      data ? (
        <span className="flex h-full min-w-0 items-center gap-3">
          <Avatar name={data.merchant} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate">{data.merchant}</span>
            {(() => {
              const c = cashLine(data, offers, all);
              return c ? <span className={cx("truncate text-xs font-medium", c.tone)}>{c.text}</span> : null;
            })()}
          </span>
        </span>
      ) : null,
  },
  { field: "date", headerName: "Date", flex: 1, minWidth: 90, sort: "desc", cellClass: "text-muted !text-sm", valueFormatter: (p) => (p.value ? shortDate(p.value as string) : "") },
  {
    field: "category",
    headerName: "Category",
    flex: 1,
    minWidth: 120,
    cellRenderer: ({ data }: ICellRendererParams<Transaction>) =>
      data ? (
        <span className="flex h-full min-w-0 items-center gap-2 text-sm">
          {data.needsReview ? <span className="truncate font-medium text-accent">✦ Needs review</span> : <span className="truncate">{data.category}</span>}
          {data.status === "pending" && <Pill tone="warn">Pending</Pill>}
        </span>
      ) : null,
  },
  {
    field: "amount",
    headerName: "Amount",
    flex: 1,
    minWidth: 100,
    cellClass: (p) => cx("num", (p.value as number) > 0 && "!text-positive"),
    valueFormatter: (p) => amt(p.value as number),
  },
  ];
  return cols.map((c) => ({ ...c, cellClassRules: { "!bg-accent-bg": (p: CellClassParams<Transaction>) => !!selected && p.data?.id === selected } }));
}

/** Transactions table on AG Grid: sortable columns, quick filter, optional pagination. */
export function TxGrid({ rows, selected, onOpen, quickFilter, pageSize }: { rows: Transaction[]; selected?: string | null; onOpen: (t: Transaction) => void; quickFilter?: string; pageSize?: number }) {
  const { state } = useFinance();
  const columnDefs = useMemo(() => txCols(selected, state?.offers ?? [], state?.transactions ?? []), [selected, state]);
  return (
    <Grid<Transaction>
      rowData={rows}
      columnDefs={columnDefs}
      getRowId={(p) => p.data.id}
      quickFilterText={quickFilter}
      onRowClicked={(e) => e.data && onOpen(e.data)}
      rowClass="cursor-pointer"
      pagination={!!pageSize}
      paginationPageSize={pageSize}
      paginationPageSizeSelector={pageSize ? [pageSize, 50, 100] : undefined}
      overlayNoRowsTemplate='<span style="color:#a1a1a1;font-size:14px">No transactions match these filters.</span>'
    />
  );
}

export function TxDrawer({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { openAssistant } = useAssistantUI();
  const { state } = useFinance();
  const offer = tx.appliedOfferId ? state?.offers.find((o) => o.id === tx.appliedOfferId) : undefined;
  const fromMerchant = state?.transactions.filter((t) => t.merchant === tx.merchant && t.amount < 0) ?? [];
  const total = fromMerchant.reduce((a, t) => a - t.amount, 0);
  return (
    <Drawer label="Transaction" onClose={onClose}>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <span className={cx("num text-[32px] font-semibold leading-tight", tx.amount > 0 && "text-positive")}>{(tx.amount > 0 ? "+" : "") + money(tx.amount)}</span>
          <span className="text-[13px] text-muted">
            {tx.merchant} · {new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(tx.date))}
          </span>
        </div>
        <Avatar name={tx.merchant} size={48} />
      </div>
      {tx.needsReview && (
        <div className="flex flex-col gap-2 rounded-xl bg-accent-bg p-3.5 text-[13px] leading-normal">
          <span>
            <span className="font-medium">PayPal AI isn’t sure about this one.</span> “{tx.merchant}” looks like a coffee shop, so it’s probably Dining.
          </span>
          <Btn small kind="primary" className="self-start" onClick={() => openAssistant(`Categorize my recent transactions`)}>
            Check with PayPal AI
          </Btn>
        </div>
      )}
      <Btn small onClick={() => openAssistant(`Tell me about my ${tx.merchant} spending`)} className="self-start">
        <Sparkles size={14} className="text-accent" /> Ask PayPal AI about this
      </Btn>
      <Panel>
        <KV first k="Status" v={<Pill tone={tx.status === "pending" ? "warn" : "neu"}>{tx.status === "pending" ? "Pending" : "Completed"}</Pill>} />
        <KV k="Category" v={tx.category} />
        <KV k="Paid with" v={tx.method === "paypal_debit_card" ? `Debit card ••${state?.userProfile.card.last4 ?? ""}` : METHOD_LABEL[tx.method]} />
        <KV k="Description" v={tx.description} />
        <KV k="Balance after" v={money(tx.balanceAfter)} />
        <KV k="PayPal ID" v={<span className="font-mono text-xs">{tx.id}</span>} />
      </Panel>
      {offer && (
        <Panel>
          <KV first k="Offer applied" v={<Pill tone="pos">{offer.title}</Pill>} />
        </Panel>
      )}
      {fromMerchant.length > 1 && tx.amount < 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3.5">
          <span className="text-[13px] font-medium">Merchant history</span>
          <p className="text-[13px] leading-normal text-muted">
            {fromMerchant.length} payments to {tx.merchant} since {shortDate(fromMerchant[0].date)} · {money(total)} in total · avg {money(total / fromMerchant.length)}.
          </p>
        </div>
      )}
    </Drawer>
  );
}
