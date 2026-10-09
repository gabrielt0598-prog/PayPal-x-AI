"use client";

// Essentials: household items reordered from a merchant that exposes its catalog
// through PayPal Store Sync (agentic commerce). Store Sync needs merchant access
// that this project doesn't have, so the catalog and merchant are samples; the
// payment posts to the PayPal balance through the demo ledger.

import { useState } from "react";
import { Minus, Package, Plus } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import { useClean } from "../AppState";
import { Btn, Card, cx, GRID4, Modal, money, Page, Pill, shortDate, TableHead } from "../ui";

const MERCHANT = "Harbor & Home";

const ITEMS = [
  { id: "tp", name: "Bath tissue, 24 double rolls", price: 27.99, every: 30, last: "2026-09-08" },
  { id: "towel", name: "Paper towels, 12 rolls", price: 24.49, every: 45, last: "2026-08-30" },
  { id: "dish", name: "Dish soap, 3 × 24 oz", price: 11.97, every: 40, last: "2026-09-01" },
  { id: "sponge", name: "Non-scratch sponges, 9 pack", price: 8.79, every: 30, last: "2026-09-05" },
  { id: "detergent", name: "Laundry detergent pods, 81 ct", price: 21.99, every: 60, last: "2026-08-20" },
  { id: "filter", name: "Water filter cartridges, 3 pack", price: 32.5, every: 90, last: "2026-07-15" },
] as const;

type ItemId = (typeof ITEMS)[number]["id"];

interface Order {
  id: string;
  date: string;
  items: number;
  total: number;
}

export function EssentialsPage() {
  const { state } = useFinance();
  const { moveMoney, toast } = useClean();
  const [tab, setTab] = useState<"items" | "orders">("items");
  const [sel, setSel] = useState<Set<ItemId>>(new Set(["tp", "sponge", "dish"]));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([{ id: "HH-20418", date: "2026-09-08", items: 3, total: 54.83 }]);
  const today = state?.asOf.slice(0, 10) ?? "2026-10-07";

  const dueIn = (it: (typeof ITEMS)[number]) => it.every - Math.round((Date.parse(today) - Date.parse(it.last)) / 86_400_000);
  const picked = ITEMS.filter((i) => sel.has(i.id));
  const subtotal = picked.reduce((a, i) => a + i.price * (qty[i.id] ?? 1), 0);
  const tax = Math.round(subtotal * 0.08875 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  return (
    <Page
      title="Essentials"
      actions={
        <Btn kind="primary" disabled={!picked.length} onClick={() => setSheet(true)}>
          Reorder {picked.length} item{picked.length === 1 ? "" : "s"}
        </Btn>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-surface-2 p-[3px]">
          {(
            [
              ["items", `Items · ${ITEMS.length}`],
              ["orders", `Order history · ${orders.length}`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("h-8 rounded-full px-3.5 text-[13px] font-medium", tab === id ? "bg-surface-3 text-text" : "text-muted")}>
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[13px] text-faint">
          From {MERCHANT} · sample merchant on PayPal Store Sync
        </span>
      </div>

      {tab === "items" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {ITEMS.map((it) => {
            const on = sel.has(it.id);
            const due = dueIn(it);
            return (
              <article key={it.id} className={cx("flex flex-col gap-3 rounded-[20px] bg-surface p-4", on && "ring-1 ring-accent")}>
                <div className="flex aspect-square items-center justify-center rounded-2xl bg-surface-2 text-faint">
                  <Package size={48} strokeWidth={1.25} />
                </div>
                <span className="line-clamp-2 min-h-[2.6em] text-[15px] font-medium leading-snug">{it.name}</span>
                <div className="flex items-center gap-2">
                  <span className="num flex-1 text-[15px] font-semibold">{money(it.price)}</span>
                  <Pill tone={due <= 0 ? "warn" : "neu"}>{due <= 0 ? "Due now" : `In ${due} day${due === 1 ? "" : "s"}`}</Pill>
                </div>
                <span className="text-xs text-faint">Every {it.every} days · last {shortDate(it.last)}</span>
                <Btn
                  small
                  kind={on ? "primary" : "secondary"}
                  aria-pressed={on}
                  className="mt-auto"
                  onClick={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (n.has(it.id)) n.delete(it.id);
                      else n.add(it.id);
                      return n;
                    })
                  }
                >
                  {on ? "Added" : "+ Add"}
                </Btn>
              </article>
            );
          })}
        </div>
      ) : (
        <Card flush>
          <TableHead cols={["Order", "Date", "Items", "Total"]} />
          {orders.map((o, i) => (
            <div key={o.id} className={cx(GRID4, "py-[13px]", i && "border-t border-border")}>
              <span className="text-[15px]">
                {MERCHANT} · {o.id}
              </span>
              <span className="text-sm text-muted">{shortDate(o.date)}</span>
              <span className="text-sm">{o.items}</span>
              <span className="num text-[15px]">{money(o.total)}</span>
            </div>
          ))}
        </Card>
      )}

      {sheet && (
        <Modal label="Your order" onClose={() => setSheet(false)}>
          <div className="flex flex-col">
            {picked.map((it, i) => (
              <div key={it.id} className={cx("flex items-center gap-3 py-2.5", i && "border-t border-border")}>
                <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label={`Fewer ${it.name}`} onClick={() => setQty((q) => ({ ...q, [it.id]: Math.max(1, (q[it.id] ?? 1) - 1) }))} className="flex size-7 items-center justify-center rounded-full bg-white/[0.08]">
                    <Minus size={12} />
                  </button>
                  <span className="num w-5 text-center text-sm">{qty[it.id] ?? 1}</span>
                  <button type="button" aria-label={`More ${it.name}`} onClick={() => setQty((q) => ({ ...q, [it.id]: (q[it.id] ?? 1) + 1 }))} className="flex size-7 items-center justify-center rounded-full bg-white/[0.08]">
                    <Plus size={12} />
                  </button>
                </div>
                <span className="num w-16 text-right text-sm">{money(it.price * (qty[it.id] ?? 1))}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-surface-2 px-3.5">
            <div className="flex py-2.5 text-[13px]">
              <span className="flex-1 text-muted">Subtotal</span>
              <span className="num">{money(subtotal)}</span>
            </div>
            <div className="flex border-t border-border py-2.5 text-[13px]">
              <span className="flex-1 text-muted">Shipping</span>
              <span>Free</span>
            </div>
            <div className="flex border-t border-border py-2.5 text-[13px]">
              <span className="flex-1 text-muted">Tax</span>
              <span className="num">{money(tax)}</span>
            </div>
            <div className="flex border-t border-border py-2.5 text-sm font-semibold">
              <span className="flex-1">Total</span>
              <span className="num">{money(total)}</span>
            </div>
          </div>
          <p className="text-xs leading-normal text-faint">Paid from your PayPal balance. {MERCHANT} receives the order through PayPal Store Sync and ships it in 2–3 days.</p>
          <Btn
            kind="primary"
            disabled={busy || !picked.length}
            onClick={async () => {
              setBusy(true);
              if (await moveMoney("purchase", total, MERCHANT)) {
                const id = `HH-${20419 + orders.length}`;
                setOrders((o) => [{ id, date: today, items: picked.length, total }, ...o]);
                toast(`Order placed with ${MERCHANT}`, `${money(total)} · paid with PayPal`);
                setSheet(false);
                setTab("orders");
              }
              setBusy(false);
            }}
          >
            Pay {money(total)} with PayPal
          </Btn>
        </Modal>
      )}
    </Page>
  );
}
