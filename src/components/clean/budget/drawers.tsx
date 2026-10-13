"use client";

import { useState } from "react";
import { Avatar, Btn, cx, Drawer, Modal, money, money0, monthName, monthShort, Panel, shortDate } from "../ui";
import { Field, MoneyField } from "./parts";
import type { BudInsights, BudRow, BudSection } from "./model";

const fieldCls = "flex h-12 w-full items-center gap-2 rounded-[12px] border border-border-strong bg-surface-2 px-3.5 text-sm";

function trendText(ins: BudInsights) {
  const [, prev, cur] = ins.bars;
  const diff = cur.v - prev.v;
  return `${monthName(cur.ym)} so far is ${money(Math.abs(diff))} ${diff >= 0 ? "above" : "below"} ${monthName(prev.ym)}’s ${money(prev.v)}.`;
}

function Line({ k, v, red, first }: { k: string; v: string; red?: boolean; first?: boolean }) {
  return (
    <div className={cx("flex items-center gap-3 py-4", !first && "border-t border-border")}>
      <span className="flex-1 text-[13px] text-muted">{k}</span>
      <span className={cx("text-[13px] font-medium", red && "text-negative")}>{v}</span>
    </div>
  );
}

function Trend({ ins }: { ins: BudInsights }) {
  const mx = Math.max(1, ...ins.bars.map((b) => b.v));
  return (
    <div className="flex flex-col gap-2 pb-4">
      <div className="flex h-24 items-end gap-2.5" role="img" aria-label={trendText(ins)}>
        {ins.bars.map((b) => (
          <div key={b.ym} className="flex h-full flex-1 flex-col items-stretch justify-end gap-1.5">
            <span className={cx("text-center text-[11px]", b.cur ? "font-semibold text-text" : "font-medium text-faint")}>{money0(b.v)}</span>
            <div style={{ height: Math.max(4, (b.v / mx) * 72) }} className={cx("m-by rounded-t-md rounded-b-sm", b.cur ? "bg-accent" : "bg-surface-3")} />
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
  secName,
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
  secName: string;
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
  const catLabel = (row.item.cat ?? "").toLowerCase();
  return (
    <Drawer label={secName} onClose={onClose}>
      <span className="text-[26px] font-semibold leading-[1.15] tracking-tight">{row.item.name}</span>
      <Field label={isTotal ? "Monthly budget" : "Monthly limit"} htmlFor="bud-limit">
        <MoneyField id="bud-limit" value={row.lim} errValue={err?.v} invalid={!!err} label={isTotal ? "Monthly budget" : `${row.item.name} monthly limit`} onCommit={onCommitLimit} />
        {err && (
          <span role="alert" className="text-xs leading-snug text-negative">
            Not saved. This would put you {money(err.over)} over your {money(err.cap)} monthly budget.
          </span>
        )}
        {isTotal && unalloc < 0 && <span className="text-xs leading-snug text-warning">Your category limits add up to {money(alloc)}, which is more than this budget.</span>}
      </Field>
      <Panel>
        <Line first k="Spent so far" v={money(isTotal ? spent : row.sp)} />
        <Line k={left < 0 ? "Over budget by" : "Left this month"} v={money(Math.abs(left))} red={left < 0} />
        {isTotal ? (
          <>
            <Line k="Budgeted across categories" v={money(alloc)} />
            <Line k={unalloc < 0 ? "Over-allocated by" : "Unallocated"} v={money(Math.abs(unalloc))} red={unalloc < 0} />
          </>
        ) : (
          <Line k="3-month average" v={money(ins?.avg ?? 0)} />
        )}
        {ins && <Trend ins={ins} />}
      </Panel>
      {ins?.big && (
        <div className="mt-2.5 flex flex-col gap-2.5">
          <h3 className="text-[15px] font-semibold">Biggest spend</h3>
          <div className="flex items-center gap-3 rounded-[var(--radius,12px)] border border-border bg-surface-2 p-3.5">
            <Avatar name={ins.big.tx.merchant} size={34} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-medium">
                {money(-ins.big.tx.amount)} at {ins.big.tx.merchant}
              </span>
              <span className="text-[13px] text-faint">
                {shortDate(ins.big.tx.date)} · {Math.round(ins.big.share * 100)}% of your recent {catLabel} spending
              </span>
            </span>
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
                <span className="text-sm">{t.merchant}</span>
                <span className="text-xs text-faint">{shortDate(t.date)}</span>
              </span>
              <span className="text-sm font-medium">{money(-t.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {!isTotal && (
        <div className="mt-auto flex pt-2">
          <Btn onClick={onRemove} className="flex-1 !border !border-[var(--danger,#c93a3a)] !bg-[var(--danger,#c93a3a)] !text-white hover:!opacity-90">
            Remove
          </Btn>
        </div>
      )}
    </Drawer>
  );
}

export function AddCategoryModal({ sec, secName, onClose, onAdd }: { sec: BudSection; secName: string; onClose: () => void; onAdd: (sec: BudSection, name: string, lim: number) => void }) {
  const [name, setName] = useState("");
  const [lim, setLim] = useState("");
  const ok = name.trim() !== "";
  const n = parseInt(lim, 10) || 0;
  const submit = () => ok && onAdd(sec, name.trim(), n);
  return (
    <Modal label={`Add to ${secName}`} onClose={onClose}>
      <div className="mt-2 flex flex-col gap-6">
        <Field label="Category name" htmlFor="bud-add-name">
          <input id="bud-add-name" autoFocus type="text" value={name} placeholder="For example, Travel" onChange={(e) => setName(e.target.value.slice(0, 40))} onKeyDown={(e) => e.key === "Enter" && submit()} className={cx(fieldCls, "text-[15px] outline-none")} />
        </Field>
        <Field label="Monthly limit" htmlFor="bud-add-lim">
          <span className={fieldCls}>
            <span className="text-faint">$</span>
            <input id="bud-add-lim" type="text" inputMode="numeric" value={lim} placeholder="0" onChange={(e) => setLim(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))} onKeyDown={(e) => e.key === "Enter" && submit()} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          </span>
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!ok} onClick={submit}>
          Add category
        </Btn>
      </div>
    </Modal>
  );
}

export function RemoveModal({ name, limit, onCancel, onConfirm }: { name: string; limit: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal label={`Remove ${name}?`} onClose={onCancel}>
      <p className="text-[13px] leading-normal text-muted">This removes its {money(limit)} limit from your budget. Past transactions keep their category.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn onClick={onConfirm} className="!border !border-[var(--danger,#c93a3a)] !bg-[var(--danger,#c93a3a)] !text-white hover:!opacity-90">
          Remove
        </Btn>
      </div>
    </Modal>
  );
}
