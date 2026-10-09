"use client";

// Transaction rows (Merchant | Date | Category | Amount) and the details drawer.

import { Sparkles } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { METHOD_LABEL } from "./format";
import type { Transaction } from "@/lib/types";
import { amt, Avatar, Btn, cx, Drawer, GRID4, KV, money, Panel, Pill, shortDate, TableHead } from "./ui";

export function TxRows({ rows, selected, onOpen }: { rows: Transaction[]; selected?: string | null; onOpen: (t: Transaction) => void }) {
  return (
    <div role="table" aria-label="Transactions">
      <TableHead cols={["Merchant", "Date", "Category", "Amount"]} />
      {rows.map((t) => (
        <button
          key={t.id}
          type="button"
          role="row"
          onClick={() => onOpen(t)}
          className={cx(GRID4, "w-full py-[13px] text-left transition", selected === t.id ? "bg-accent-bg" : "hover:bg-white/[0.03]")}
        >
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={t.merchant} />
            <span className="truncate text-[15px]">{t.merchant}</span>
          </span>
          <span className="text-sm text-muted">{shortDate(t.date)}</span>
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate">{t.category}</span>
            {t.status === "pending" && <Pill tone="warn">Pending</Pill>}
          </span>
          <span className={cx("num text-[15px]", t.amount > 0 && "text-positive")}>{amt(t.amount)}</span>
        </button>
      ))}
    </div>
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
