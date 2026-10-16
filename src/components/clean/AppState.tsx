"use client";

// UI state for the Clean shell: current page (synced to the URL hash), the
// side panel's expanded state, toasts, PayPal Rewards points, and the demo
// money-movement endpoint behind Top up / Transfer / Redeem / Reorder.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import type { MoneyMove } from "@/lib/store";

export const PAGES = ["home", "wallet", "transactions", "budget", "recurring", "essentials", "offers", "rewards", "insights", "account"] as const;
export type PageId = (typeof PAGES)[number];

export const REWARD_CATS = ["Groceries", "Gas & fuel", "Restaurants", "Health & beauty", "Clothing & apparel"] as const;
export type RewardCat = (typeof REWARD_CATS)[number];

/** The transaction category (src/lib/types.ts Category) that each 5% reward category earns on. */
export const REWARD_TX_CATEGORY: Record<RewardCat, string> = {
  Groceries: "Groceries",
  "Gas & fuel": "Transport",
  Restaurants: "Dining",
  "Health & beauty": "Other",
  "Clothing & apparel": "Shopping",
};

export interface RewardsLog {
  /** Shown as the Merchant column (logo + name). */
  merchant: string;
  /** Shown as the Category column, e.g. "Restaurants · 5%" or "Cash redemption". */
  cat: string;
  label: string;
  date: string;
  status: "Earned" | "Redeemed";
  pts: number;
}

export type ToastKind = "success" | "warn" | "info";

interface Toast {
  id: number;
  title: string;
  sub?: string;
  kind: ToastKind;
  undo?: () => void;
  /** Fading out; removed once the exit animation has played. */
  out?: boolean;
}

export interface ToastOpts {
  kind?: ToastKind;
  /** Shows an Undo action; the callback runs when it is pressed. */
  undo?: () => void;
}

/** Dark-mode toast palette: [background, border, icon fill, text, action colour]. */
const TOAST_COLORS: Record<ToastKind, [string, string, string, string, string]> = {
  success: ["#0f2b1e", "#1d5a3b", "#1f9d5c", "#d8f3e4", "#7fe0a8"],
  warn: ["#2c2209", "#6a4d12", "#c27a04", "#fbe8bd", "#f2c466"],
  info: ["#0d2236", "#1c4a78", "#1f6fd1", "#d5e7fb", "#8cc4ff"],
};

interface CleanState {
  page: PageId;
  go: (p: PageId) => void;
  /** Rows Stella just changed (page + ids): the page tints them. */
  flash: { page: PageId; ids: string[] } | null;
  flashChange: (page: PageId, ids: string[]) => void;
  toast: (title: string, sub?: string, opts?: ToastOpts) => void;
  dismissToast: (id?: number) => void;
  moveMoney: (kind: MoneyMove, amount: number, merchant?: string, note?: string) => Promise<boolean>;
  rewards: {
    pts: number;
    cat: RewardCat;
    setCat: (c: RewardCat) => void;
    log: RewardsLog[];
    redeem: (mode: "cash" | "credit", pts: number) => Promise<void>;
  };
}

const Ctx = createContext<CleanState | null>(null);

// PayPal Rewards has no public API, so points start from a sample balance.
const SEED_LOG: RewardsLog[] = [
  { merchant: "Lilia", cat: "Restaurants · 5%", label: "Restaurants · 5%", date: "2026-10-07", status: "Earned", pts: 275 },
  { merchant: "Plateful", cat: "Restaurants · 5%", label: "Restaurants · 5%", date: "2026-10-05", status: "Earned", pts: 345 },
  { merchant: "PayPal", cat: "Cash redemption", label: "Cash redemption", date: "2026-09-30", status: "Redeemed", pts: -1000 },
  { merchant: "Various", cat: "Restaurants · 5%", label: "Restaurants · 5%", date: "2026-09-30", status: "Earned", pts: 1640 },
  { merchant: "Thistle", cat: "Offer bonus", label: "Offer bonus", date: "2026-09-12", status: "Earned", pts: 205 },
];

function pageFromHash(): PageId {
  if (typeof window === "undefined") return "home";
  const h = window.location.hash.slice(1) as PageId;
  return PAGES.includes(h) ? h : "home";
}

export function CleanStateProvider({ children }: { children: ReactNode }) {
  const { refresh, state } = useFinance();
  const [page, setPage] = useState<PageId>("home");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState<{ page: PageId; ids: string[] } | null>(null);
  const [pts, setPts] = useState(1845);
  const [cat, setCat] = useState<RewardCat>("Restaurants");
  const [log, setLog] = useState<RewardsLog[]>(SEED_LOG);
  const tid = useRef(0);

  useEffect(() => {
    const sync = () => {
      setPage(pageFromHash());
      setFlash(null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = useCallback((p: PageId) => {
    setPage(p);
    setFlash(null);
    if (window.location.hash.slice(1) !== p) history.replaceState(null, "", `#${p}`);
  }, []);

  const flashChange = useCallback((p: PageId, ids: string[]) => setFlash({ page: p, ids }), []);

  // Toasts fade/scale in and fade out (the film's motion): dismissing marks them `out`, then removes them after the exit.
  const dismissToast = useCallback((id?: number) => {
    setToasts((t) => t.map((x) => (id === undefined || x.id === id ? { ...x, out: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => !x.out)), 350);
  }, []);
  const toast = useCallback(
    (title: string, sub?: string, opts?: ToastOpts) => {
      const id = ++tid.current;
      setToasts([{ id, title, sub, kind: opts?.kind ?? "success", undo: opts?.undo }]);
      setTimeout(() => dismissToast(id), 4150);
    },
    [dismissToast],
  );

  const moveMoney = useCallback(
    async (kind: MoneyMove, amount: number, merchant?: string, note?: string) => {
      try {
        const res = await fetch("/api/demo/move-money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, amount, merchant, note }) });
        if (!res.ok) throw new Error(String(res.status));
        await refresh();
        return true;
      } catch {
        toast("Something went wrong", "The balance was not changed");
        return false;
      }
    },
    [refresh, toast],
  );

  const asOf = state?.asOf.slice(0, 10) ?? "2026-10-07";
  const redeem = useCallback(
    async (mode: "cash" | "credit", n: number) => {
      if (n <= 0 || n > pts) return;
      const usd = n / 100;
      if (mode === "cash" && !(await moveMoney("rewards", usd))) return;
      setPts((p) => p - n);
      setLog((l) => [{ merchant: "PayPal", cat: mode === "cash" ? "Cash redemption" : "Shopping credit", label: mode === "cash" ? "Cash redemption" : "Shopping credit", date: asOf, status: "Redeemed", pts: -n }, ...l]);
      toast(
        mode === "cash" ? `${usd.toLocaleString("en-US", { style: "currency", currency: "USD" })} added to your PayPal balance` : `${usd.toLocaleString("en-US", { style: "currency", currency: "USD" })} shopping credit ready`,
        `${n.toLocaleString("en-US")} points redeemed`,
      );
    },
    [pts, moveMoney, toast, asOf],
  );

  const value = useMemo<CleanState>(
    () => ({
      page,
      go,
      flash,
      flashChange,
      toast,
      dismissToast,
      moveMoney,
      rewards: {
        pts,
        cat,
        setCat: (c) => {
          if (c === cat) return;
          setCat(c);
          const end = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), 0));
          toast(`5% category set to ${c}`, `Applies to Debit Card purchases from today through ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(end)}`);
        },
        log,
        redeem,
      },
    }),
    [page, go, flash, flashChange, toast, dismissToast, moveMoney, pts, cat, log, redeem, asOf],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-[88px] left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => {
          const [bg, bd, icon, fg, act] = TOAST_COLORS[t.kind];
          return (
            <div key={t.id} role="status" style={{ background: bg, borderColor: bd, color: fg }} className={`${t.out ? "m-toast-out" : "m-toast-in"} pointer-events-auto flex items-center gap-3 rounded-2xl border py-3 pl-3.5 pr-4 shadow-[0_20px_40px_rgba(0,0,0,0.6)]`}>
              <span style={{ background: icon }} className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-base font-bold text-white">
                {t.kind === "success" ? <Check size={18} /> : t.kind === "warn" ? "!" : "i"}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{t.title}</span>
                {t.sub && <span className="text-xs opacity-80">{t.sub}</span>}
              </span>
              {t.undo && (
                <button
                  type="button"
                  style={{ color: act }}
                  onClick={() => {
                    t.undo?.();
                    dismissToast(t.id);
                  }}
                  className="min-h-9 px-1 text-[13px] font-semibold underline"
                >
                  Undo
                </button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} style={{ color: fg }} className="flex size-7 items-center justify-center rounded-full opacity-70 hover:opacity-100">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useClean() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useClean must be used inside <CleanStateProvider>");
  return c;
}
