"use client";

import { useState } from "react";
import { Avatar, Btn, cx, Drawer, KV, Modal, money, money0, monthShort, Panel, shortDate } from "../ui";
import { Field, MoneyField } from "./parts";
import type { BudInsights, BudRow, BudSection } from "./model";

const fieldCls = "flex h-12 w-full items-center gap-2 rounded-[12px] border border-border-strong bg-surface-2 px-3.5 text-sm";

function Trend({ ins }: { ins: BudInsights }) {
  const mx = Math.max(1, ...ins.bars.map((b) => b.v));
  return (
    <div className="flex flex-col gap-2 pb-4">
      <div className="flex h-24 items-end gap-2.5" role="img" aria-label={`Spending by month: ${ins.bars.map((b) => `${monthShort(b.ym)} ${money0(b.v)}`).join(", ")}`}>
        {ins.bars.map((b) => (
          <div key={b.ym} className="flex h-full flex-1 flex-col items-stretch justify-end gap-1.5">
            <span className={cx("text-center text-[11px]", b.cur ? "font-semibold text-text" : "font-medium text-faint")}>{money0(b.v)}</span>
            <div style={{ height: Math.max(4, (b.v / mx) * 72) }} className={cx("rounded-t-md rounded-b-sm", b.cur ? "bg-accent" : "bg-surface-3")} />
          </div>
        ))}
      </div>
      <div className="flex gap-2.5">
        {ins.bars.map((b) => (
          <span key={b.ym} className="flex-1 text-center text-xs text-faint">
            {monthShort(b.ym)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BudgetDrawer({
  row,
  isTotal,
  ins,
  total,
  alloc,
  spent,
  err,
  onClose,
  onCommitLimit,
  onRemove,
}: {
  row: BudRow;
  isTotal: boolean;
  ins: BudInsights | null;
  total: number;
  alloc: number;
  spent: number;
  err: { v: string; over: number; cap: number } | null;
  onClose: () => void;
  onCommitLimit: (text: string) => void;
  onRemove: () => void;
}) {
  const left = row.left;
  const unalloc = total - alloc;
  const over = (v: number) => (v < 0 ? "text-negative" : undefined);
  return (
    <Drawer label={row.item.name} onClose={onClose}>
      <Field label={isTotal ? "Monthly budget" : "Monthly limit"} htmlFor="bud-limit">
        <MoneyField id="bud-limit" large value={row.lim} errValue={err?.v} invalid={!!err} label={isTotal ? "Monthly budget" : `${row.item.name} monthly limit`} onCommit={onCommitLimit} />
        {err && (
          <span role="alert" className="text-xs leading-snug text-negative">
            Not saved. This would put you {money(err.over)} over your {money(err.cap)} monthly budget.
          </span>
        )}
        {isTotal && unalloc < 0 && <span className="text-xs leading-snug text-warning">Your category limits add up to {money(alloc)}, which is more than this budget.</span>}
      </Field>
      <Panel>
        <KV first k="Spent so far" v={money(spent)} />
        <KV k={left < 0 ? "Over budget by" : "Left this month"} v={<span className={over(left)}>{money(Math.abs(left))}</span>} />
        {isTotal ? (
          <>
            <KV k="Budgeted across categories" v={money(alloc)} />
            <KV k={unalloc < 0 ? "Over-allocated by" : "Unallocated"} v={<span className={over(unalloc)}>{money(Math.abs(unalloc))}</span>} />
          </>
        ) : (
          ins && <KV k="3-month average" v={money(ins.avg)} />
        )}
        {ins && <Trend ins={ins} />}
      </Panel>
      {ins && ins.merchants.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2.5">
          <h3 className="text-[15px] font-semibold">Biggest spend from</h3>
          <div className="flex flex-col">
            {ins.merchants.map((m) => (
              <div key={m.name} className="flex items-center gap-3 py-2.5">
                <Avatar name={m.name} size={34} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm">{m.name}</span>
                  <span className="text-xs text-faint">
                    {m.count} {m.count === 1 ? "purchase" : "purchases"} · {Math.round(m.share * 100)}% of this month
                  </span>
                </span>
                <span className="text-sm font-medium">{money(m.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {ins && ins.txs.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1">
          <h3 className="mb-1.5 text-[15px] font-semibold">Recent transactions</h3>
          {ins.txs.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={t.merchant} size={34} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm">{t.merchant}</span>
                <span className="text-xs text-faint">{shortDate(t.date)}</span>
              </span>
              <span className="text-sm font-medium">{money(-t.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {!isTotal && (
        <div className="mt-auto flex pt-2">
          <Btn kind="secondary" onClick={onRemove} className="flex-1 !bg-negative-bg !text-negative hover:!bg-negative/25">
            Remove
          </Btn>
        </div>
      )}
    </Drawer>
  );
}

export function AddCategoryModal({ sec, secName, room, cap, onClose, onAdd }: { sec: BudSection; secName: string; room: number; cap: number; onClose: () => void; onAdd: (sec: BudSection, name: string, lim: number) => void }) {
  const [name, setName] = useState("");
  const [lim, setLim] = useState("");
  const n = parseInt(lim, 10) || 0;
  const over = n - room;
  const bad = over > 0;
  const ok = name.trim() !== "" && !bad;
  const submit = () => ok && onAdd(sec, name.trim(), n);
  return (
    <Modal label={`Add to ${secName}`} onClose={onClose}>
      <Field label="Category name" htmlFor="bud-add-name">
        <input id="bud-add-name" autoFocus type="text" value={name} placeholder="e.g. Travel" onChange={(e) => setName(e.target.value.slice(0, 40))} onKeyDown={(e) => e.key === "Enter" && submit()} className={cx(fieldCls, "outline-none")} />
      </Field>
      <Field label="Monthly limit" htmlFor="bud-add-lim">
        <span className={cx(fieldCls, bad && "!border-negative")}>
          <span className="text-faint">$</span>
          <input id="bud-add-lim" type="text" inputMode="numeric" aria-invalid={bad} value={lim} placeholder="0" onChange={(e) => setLim(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))} onKeyDown={(e) => e.key === "Enter" && submit()} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
        </span>
        {bad && (
          <span role="alert" className="text-xs leading-snug text-negative">
            Not allowed. This would put you {money(over)} over your {money(cap)} monthly budget.
          </span>
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!ok} onClick={submit}>
          Add category
        </Btn>
      </div>
    </Modal>
  );
}

export function RemoveModal({ name, secName, limit, onCancel, onConfirm }: { name: string; secName: string; limit: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal label={`Remove ${name}?`} onClose={onCancel}>
      <p className="text-sm leading-relaxed text-muted">
        This removes its {money(limit)} limit from {secName} in your budget. Past transactions keep their category.
      </p>
      <div className="flex justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn onClick={onConfirm} className="!bg-negative-bg !text-negative hover:!bg-negative/25">
          Remove
        </Btn>
      </div>
    </Modal>
  );
}
