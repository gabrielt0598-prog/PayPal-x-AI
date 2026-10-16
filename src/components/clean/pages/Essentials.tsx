"use client";

// Essentials: household items reordered from a merchant that exposes its catalog
// through PayPal Store Sync (agentic commerce). Store Sync needs merchant access
// that this project doesn't have, so the catalog and merchant are samples; the
// payment posts to the PayPal balance through the demo ledger (/api/demo/move-money).

import { useEffect, useRef, useState } from "react";
import { payWithPayPal } from "../paypalOrder";
import { Check, ChevronLeft, ChevronRight, ShoppingCart, Wallet } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import { useClean } from "../AppState";
import { Product, type ProductKind } from "../Product";
import { Btn, Card, cx, money, Page, Pill } from "../ui";

const MERCHANT = "Harbor & Home";

// Unsplash photo with the drawn product art as a fallback if the image can't load.
function Photo({ src, alt, kind }: { src: string; alt: string; kind: ProductKind }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Product kind={kind} size={170} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} className="size-full rounded-[10px] object-cover" />;
}

interface Item {
  id: ProductKind;
  img: string;
  brand: string;
  n: string;
  short: string;
  price: number;
  was?: number;
  every: number;
  last: string;
}

const ITEMS: Item[] = [
  { id: "tp", img: "https://images.unsplash.com/photo-1584743579083-b331c4adbb15?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8MXx8dG9pbGV0JTIwcGFwZXIlMjByb2xsc3xlbnwwfDJ8fHwxNzkxODY0NzM0fDI&ixlib=rb-4.1.0&q=80&w=600", brand: "Cloudsoft", n: "Ultra Comfort Toilet Paper", short: "Cloudsoft toilet paper", price: 31.99, was: 36.99, every: 35, last: "Sep 2" },
  { id: "sponge", img: "https://images.unsplash.com/photo-1778178965223-e5a29e612504?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8MXx8c2NydWIlMjBzcG9uZ2VzJTIwa2l0Y2hlbiUyMGNsZWFuaW5nfGVufDB8fHx8MTc5MTg2NDUzN3wy&ixlib=rb-4.1.0&q=80&w=600", brand: "Scrubwell", n: "Zero Scratch Scrub Sponges", short: "Scrubwell sponges", price: 7.99, every: 42, last: "Aug 20" },
  { id: "bodywash", img: "https://images.unsplash.com/photo-1772037533346-203fc4d2dca0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8Mnx8Ym9keSUyMHdhc2glMjBib3R0bGV8ZW58MHwyfHx8MTc5MTg2NDczNHwy&ixlib=rb-4.1.0&q=80&w=600", brand: "Tideline Men", n: "Body Wash, Sea + Surf", short: "Tideline body wash", price: 11.48, every: 45, last: "Sep 14" },
  { id: "toothpaste", img: "https://images.unsplash.com/photo-1763048819607-ea55217cff34?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8Mnx8dG9vdGhwYXN0ZSUyMHR1YmV8ZW58MHwyfHx8MTc5MTg2NDczNHwy&ixlib=rb-4.1.0&q=80&w=600", brand: "Calmwhite", n: "Extra Whitening Toothpaste, Cool Mint", short: "Calmwhite toothpaste", price: 21.24, was: 26.55, every: 120, last: "Jun 30" },
  { id: "soap", img: "https://images.unsplash.com/photo-1611861317409-7dcc62856a8a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8Mnx8bGlxdWlkJTIwaGFuZCUyMHNvYXAlMjBib3R0bGV8ZW58MHwyfHx8MTc5MTg2NDczNHwy&ixlib=rb-4.1.0&q=80&w=600", brand: "Purelather", n: "Aquarium Hand Soap Refill", short: "Purelather refill", price: 8.29, every: 60, last: "Aug 1" },
  { id: "filter", img: "https://images.unsplash.com/photo-1768853099411-b0405e07c73d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8Nnx8d2F0ZXIlMjBmaWx0ZXIlMjBwaXRjaGVyJTIwa2l0Y2hlbnxlbnwwfHx8fDE3OTE4NjQ1Mzd8Mg&ixlib=rb-4.1.0&q=80&w=600", brand: "Clearpour", n: "Replacement Water Filters", short: "Clearpour filters", price: 23.39, was: 29.24, every: 240, last: "Mar 18" },
];

interface Order {
  date: string;
  m: string;
  via: string;
  ids: string[];
  items: string;
  total: number;
  conf: string;
  status: string;
}

const INITIAL_ORDERS: Order[] = [
  { date: "Sep 14", m: "a", via: "Cartly", ids: ["bodywash"], items: "Tideline Men Body Wash", total: 12.47, conf: "112-6620418-3381024", status: "Delivered" },
  { date: "Sep 2", m: "a", via: "Cartly", ids: ["tp"], items: "Cloudsoft Toilet Paper", total: 34.75, conf: "112-9083317-5520941", status: "Delivered" },
  { date: "Aug 20", m: "a", via: "Cartly", ids: ["sponge"], items: "Scrubwell Zero Scratch Sponges", total: 8.68, conf: "112-4471902-6610385", status: "Delivered" },
  { date: "Aug 1", m: "a", via: "Cartly", ids: ["soap"], items: "Purelather Aquarium Refill", total: 9.01, conf: "112-2093846-1175520", status: "Delivered" },
  { date: "Jun 30", m: "a", via: "Cartly", ids: ["toothpaste"], items: "Calmwhite Extra Whitening, pack of 4", total: 23.07, conf: "112-8830165-0942217", status: "Delivered" },
  { date: "Mar 18", m: "a", via: "Cartly", ids: ["filter"], items: "Clearpour Filters, 4 pack", total: 25.41, conf: "112-5519027-3308861", status: "Delivered" },
];

const PAGE_SIZE = 10;
const newConfirmation = () => "HH-" + String(Math.floor(10000 + Math.random() * 89999));
const clampQty = (n: number) => Math.max(1, Math.min(9, n));

export function EssentialsPage() {
  const { state } = useFinance();
  const { moveMoney, toast } = useClean();
  const [tab, setTab] = useState<"items" | "history">("items");
  const [sel, setSel] = useState<Record<string, boolean>>({ tp: true, sponge: true, soap: true });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [last, setLast] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<Record<string, boolean> | null>(null);
  const [run, setRun] = useState<{ step: number; done?: boolean; conf?: string; orderId?: string; captureId?: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [pg, setPg] = useState(0);
  // Bumped whenever the order sheet closes or a new run starts, so a late async step can't touch a stale run.
  const alive = useRef(0);
  useEffect(() => () => { alive.current += 1; }, []);

  const view = ITEMS.map((e) => {
    const l = last[e.id] ?? e.last;
    return { ...e, last: l, qty: qty[e.id] ?? 1 };
  });
  const totals = (ids: Record<string, boolean>) => {
    const items = view.filter((e) => ids[e.id]);
    const sub = items.reduce((a, e) => a + e.price * e.qty, 0);
    const tax = Math.round(sub * 0.08625 * 100) / 100;
    const ship = !items.length || sub >= 35 ? 0 : 5.99;
    return { items, sub, tax, ship, total: sub + tax + ship };
  };
  const cart = totals(sel);
  const sheetT = sheet ? totals(sheet) : null;
  const balance = state?.userProfile.paypalBalance;

  const closeSheet = () => {
    alive.current += 1;
    setSheet(null);
    setRun(null);
  };
  const open = (ids: Record<string, boolean>) => {
    setSheet(ids);
    setRun(null);
  };

  const runOrder = async () => {
    if (!sheetT) return;
    const t = sheetT;
    const token = ++alive.current;
    const live = () => alive.current === token;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setRun({ step: 0 });
    try {
      // Catalog, price and cart are Store Sync samples; the payment itself goes through PayPal's Orders API.
      await wait(450);
      if (!live()) return;
      setRun({ step: 1 });
      await wait(450);
      if (!live()) return;
      setRun({ step: 2 });
      await wait(450);
      if (!live()) return;
      setRun({ step: 3 });
      let ids = { orderId: "", captureId: "" };
      const paidWith = await payWithPayPal({
        amount: Math.round(t.total * 100) / 100,
        description: `${MERCHANT} · ${t.items.map((e) => e.short).join(", ")}`,
        onOrder: (o) => {
          ids = { ...ids, orderId: o.orderId };
          if (live()) setRun({ step: 4, orderId: o.orderId });
        },
        onStage: (s) => {
          if (s === "capturing" && live()) setRun({ step: 5, orderId: ids.orderId });
        },
      });
      if (!live()) return;
      ids = { orderId: paidWith.orderId, captureId: paidWith.captureId ?? "" };
      setRun({ step: 6, ...ids });
      await wait(450);
      if (!live()) return;
      setRun({ step: 7, ...ids });
      const ok = await moveMoney("purchase", t.total, MERCHANT);
      if (!live()) return;
      if (!ok) {
        setRun(null);
        return;
      }
      const conf = newConfirmation();
      setLast((l) => {
        const n = { ...l };
        t.items.forEach((e) => (n[e.id] = "Oct 7"));
        return n;
      });
      setSel((s) => {
        const n = { ...s };
        t.items.forEach((e) => delete n[e.id]);
        return n;
      });
      setOrders((o) => [
        { date: "Oct 7", m: "H", via: "Harbor & Home · PayPal", ids: t.items.map((e) => e.id), items: t.items.map((e) => e.short + (e.qty > 1 ? " ×" + e.qty : "")).join(", "), total: t.total, conf, status: "Arriving Oct 12" },
        ...o,
      ]);
      setRun({ step: 8, done: true, conf, ...ids });
      toast(`Order placed with ${MERCHANT}`, `${money(t.total)} · paid with PayPal · arrives Oct 12`);
    } catch (e) {
      if (!live()) return;
      setRun(null);
      toast("Payment not completed", e instanceof Error ? e.message : "PayPal could not take the payment", { kind: "warn" });
    }
  };

  const steps = sheetT
    ? [
        "Found the items in Harbor & Home’s Store Sync catalog",
        `Checked price and stock · ${money(sheetT.total)}`,
        `Created a cart with ${sheetT.items.length} item${sheetT.items.length === 1 ? "" : "s"} · shipping to 2211 N First St`,
        run?.orderId ? `Created PayPal order ${run.orderId}` : "Creating a PayPal order (Orders API)",
        "Approved with PayPal",
        run?.captureId ? `Captured the payment · ${run.captureId}` : "Captured the payment",
        "Harbor & Home confirmed the order",
        "Saved the receipt to PayPal Activity",
      ]
    : [];
  const rStep = run ? run.step : 0;
  const done = !!run?.done;

  const pages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const p = Math.min(pg, pages - 1);
  const rows = orders.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  const from = orders.length ? p * PAGE_SIZE + 1 : 0;
  const to = Math.min(orders.length, (p + 1) * PAGE_SIZE);

  return (
    <Page
      title="Essentials"
      actions={
        <Btn kind="primary" disabled={!cart.items.length} onClick={() => cart.items.length && open({ ...sel })}>
          <ShoppingCart size={16} />
          {cart.items.length ? `Reorder ${cart.items.length} item${cart.items.length === 1 ? "" : "s"}` : "Select items to reorder"}
        </Btn>
      }
    >
      <div role="tablist" aria-label="Essentials views" className="flex gap-1 self-start rounded-full border border-border bg-surface-2 p-[3px]">
        {(
          [
            ["items", `Items · ${ITEMS.length}`],
            ["history", `Order history · ${orders.length}`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("h-8 rounded-full px-4 text-[13px] font-medium", tab === id ? "bg-surface-3 text-text" : "text-muted")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "items" ? (
        <div role="tabpanel" aria-label="Items" className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {view.map((e) => {
            const on = !!sel[e.id];
            return (
              <article key={e.id} className={cx("flex h-full flex-col gap-3 rounded-[20px] bg-surface p-3.5", on && "ring-1 ring-accent")}>
                <div className="flex aspect-square w-full shrink-0 items-center justify-center rounded-[10px] bg-surface-2">
                  <Photo src={e.img} alt={e.n} kind={e.id} />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="num text-lg font-semibold">{money(e.price)}</span>
                    {e.was && (
                      <>
                        <span className="num text-sm text-faint line-through">{money(e.was)}</span>
                        <Pill tone="pos">{Math.round((1 - e.price / e.was) * 100)}% off</Pill>
                      </>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="block truncate text-base leading-[22px]">{e.n}</span>
                    <span className="block truncate text-[13px] text-faint">Sold by {MERCHANT}</span>
                  </div>
                </div>
                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSel((s) => { const n = { ...s }; if (n[e.id]) delete n[e.id]; else n[e.id] = true; return n; })}
                    className={cx("inline-flex h-9 w-full min-w-0 items-center justify-center rounded-full px-3.5 text-[13px] font-medium transition", on ? "bg-accent-bg text-accent" : "bg-white text-[#0a0a0a] hover:bg-white/90")}
                  >
                    {on ? "✓ Added" : "Add"}
                  </button>
                </div>
              </article>
            );
          })}
          <p className="col-span-full text-xs text-faint">Product photos from Unsplash: Christine Sandu, Gaana Srinivas, andrew davies, Tosan Dudun, Jonathan Cooper and Jim Luo.</p>
        </div>
      ) : (
        <>
          <Card flush className="!py-0">
            <div role="tabpanel" aria-label="Order history">
              {rows.map((o, i) => (
                <div key={o.conf} className={cx("flex items-center gap-3 px-5 py-3", i && "border-t border-border")}>
                  <span aria-hidden className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-surface-3 text-[13px] font-semibold">{o.m}</span>
                  <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="block truncate text-sm font-medium">{o.items}</span>
                    <span className="block truncate text-xs text-faint">{o.date} · {o.via} · Order {o.conf}</span>
                  </span>
                  <span className="flex w-[120px] justify-start">
                    <Pill tone={o.status === "Delivered" ? "neu" : "acc"}>{o.status}</Pill>
                  </span>
                  <span className="num w-20 text-left text-sm font-medium">{money(o.total)}</span>
                  <Btn small onClick={() => open(Object.fromEntries(o.ids.map((x) => [x, true])))}>Buy again</Btn>
                </div>
              ))}
            </div>
          </Card>
          {orders.length > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-faint">
              <span>Showing {from} to {to} of {orders.length}</span>
              <div className="flex items-center gap-3">
                <span>Page {p + 1} of {pages}</span>
                <div className="flex gap-2">
                  <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPg(p - 1)} className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-text disabled:opacity-35">
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPg(p + 1)} className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-text disabled:opacity-35">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {sheetT && (
        <div className="m-fade fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
          <div role="dialog" aria-labelledby="ess-sheet-title" aria-live="polite" className="m-pop flex max-h-full w-full max-w-[540px] flex-col gap-3.5 overflow-y-auto rounded-[20px] border border-border-strong bg-surface p-6 pb-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-2.5">
              <h2 id="ess-sheet-title" className="flex-1 text-xl font-semibold">{done ? "Order placed" : run ? "Checking out with PayPal…" : "Your order"}</h2>
              <Pill tone={done ? "pos" : run ? "acc" : "neu"}>{done ? "Completed" : run ? "● Store Sync" : MERCHANT}</Pill>
            </div>
            <div className="rounded-[10px] border border-border bg-surface-2 px-3.5">
              {sheetT.items.map((e, i) => (
                <div key={e.id} className={cx("flex items-center gap-3 py-4", i && "border-t border-border")}>
                  <span className="flex min-w-0 grow flex-col">
                    <span className="block truncate text-[13px] font-medium">{e.brand} {e.n}</span>
                    <span className="text-xs text-faint">{money(e.price)} each</span>
                  </span>
                  {!run && (
                    <div className="flex h-8 items-center rounded-full border border-border-strong">
                      <button type="button" aria-label={`Fewer ${e.short}`} onClick={() => setQty((q) => ({ ...q, [e.id]: clampQty(e.qty - 1) }))} className="size-[30px] rounded-full text-base">−</button>
                      <span className="num min-w-[18px] text-center text-[13px] font-semibold">{e.qty}</span>
                      <button type="button" aria-label={`More ${e.short}`} onClick={() => setQty((q) => ({ ...q, [e.id]: clampQty(e.qty + 1) }))} className="size-[30px] rounded-full text-base">+</button>
                    </div>
                  )}
                  {run && <span className="text-[13px] text-faint">× {e.qty}</span>}
                  <span className="num w-[72px] text-right text-[13px] font-medium">{money(e.price * e.qty)}</span>
                </div>
              ))}
            </div>

            {!run && (
              <>
                <div className="rounded-[10px] border border-border bg-surface-2 px-3.5">
                  <div className="flex py-4 text-[13px]"><span className="flex-1 text-muted">Subtotal</span><span className="num">{money(sheetT.sub)}</span></div>
                  <div className="flex border-t border-border py-4 text-[13px]"><span className="flex-1 text-muted">Shipping · free over $35</span><span className="num">{sheetT.ship ? money(sheetT.ship) : "Free"}</span></div>
                  <div className="flex border-t border-border py-4 text-[13px]"><span className="flex-1 text-muted">Est. tax</span><span className="num">{money(sheetT.tax)}</span></div>
                  <div className="flex border-t border-border py-4 text-sm font-semibold"><span className="flex-1">Total</span><span className="num">{money(sheetT.total)}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex items-center gap-2.5 rounded-[10px] border border-accent px-3 py-2.5">
                    <Wallet size={18} className="shrink-0 text-accent" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium">PayPal balance</span>
                      <span className="block truncate text-xs text-faint">{balance !== undefined ? `${money(balance)} · ` : ""}backup Northwind ••7712</span>
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col justify-center rounded-[10px] border border-border px-3 py-2.5">
                    <span className="text-[13px] font-medium">Ship to John Doe</span>
                    <span className="block truncate text-xs text-faint">2211 N First St · arrives Mon, Oct 12</span>
                  </div>
                </div>
                <p className="text-xs leading-normal text-faint">Sold and shipped by {MERCHANT} through PayPal Store Sync. Your receipt and tracking land in PayPal Activity.</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Btn onClick={closeSheet}>Not now</Btn>
                  <Btn kind="primary" onClick={runOrder}>Pay with PayPal · {money(sheetT.total)}</Btn>
                </div>
              </>
            )}

            {run && !done && (
              <ol aria-label="Order steps" className="rounded-[10px] border border-border bg-surface-2 px-4 py-5">
                {steps.map((label, i) => {
                  const past = i < rStep;
                  const cur = i === rStep;
                  const last = i === steps.length - 1;
                  return (
                    <li key={label} className="flex items-stretch gap-3.5">
                      <span className="flex flex-col items-center self-stretch">
                        <span className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", past ? "bg-positive-bg text-positive" : cur ? "bg-accent-bg text-accent" : "bg-surface-3 text-faint")}>
                          {past ? "✓" : cur ? "●" : i + 1}
                        </span>
                        {!last && <span className={cx("mt-1.5 min-h-3 w-0.5 flex-1 rounded-sm", past ? "bg-positive" : "bg-border-strong")} />}
                      </span>
                      <span className={cx("flex min-h-[22px] min-w-0 grow items-center gap-3", !last && "pb-[22px]")}>
                        <span className={cx("flex-1 text-[13px]", i <= rStep ? (cur ? "font-semibold" : "font-normal") : "text-faint")}>{label}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {done && (
              <>
                <div className="flex items-center gap-3 rounded-[10px] bg-positive-bg px-3.5 py-3">
                  <Check size={18} className="shrink-0 text-positive" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">Order placed · {money(sheetT.total)}</span>
                    <span className="text-xs text-muted">{MERCHANT} order {run?.conf} · PayPal order {run?.orderId} · arrives Mon, Oct 12</span>
                  </span>
                </div>
                <div className="flex justify-end">
                  <Btn kind="primary" onClick={closeSheet}>Done</Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
