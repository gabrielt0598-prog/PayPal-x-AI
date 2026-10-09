"use client";

// UI state for the Clean shell: current page (synced to the URL hash), the
// side panel's expanded state, toasts, PayPal Rewards points, and the demo
// money-movement endpoint behind Add money / Transfer / Redeem / Reorder.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFinance } from "@/components/state/AppProviders";
import type { MoneyMove } from "@/lib/store";

export const PAGES = ["home", "transactions", "recurring", "essentials", "offers", "rewards", "insights", "account"] as const;
export type PageId = (typeof PAGES)[number];

export const REWARD_CATS = ["Dining", "Groceries", "Shopping", "Transport"] as const;
export type RewardCat = (typeof REWARD_CATS)[number];

export interface RewardsLog {
  label: string;
  date: string;
  status: "Pending" | "Ready" | "Done";
  pts: number;
}

interface Toast {
  id: number;
  title: string;
  sub?: string;
}

interface CleanState {
  page: PageId;
  go: (p: PageId) => void;
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
  toast: (title: string, sub?: string) => void;
  moveMoney: (kind: MoneyMove, amount: number, merchant?: string) => Promise<boolean>;
  rewards: {
    pts: number;
    pending: number;
    cat: RewardCat;
    setCat: (c: RewardCat) => void;
    log: RewardsLog[];
    redeem: (mode: "cash" | "credit", pts: number) => Promise<void>;
  };
}

const Ctx = createContext<CleanState | null>(null);

// PayPal Rewards has no public API, so points start from a sample balance.
const SEED_LOG: RewardsLog[] = [
  { label: "Dining · 5% category", date: "2026-10-07", status: "Pending", pts: 275 },
  { label: "Dining · 5% category", date: "2026-10-05", status: "Pending", pts: 345 },
  { label: "Redeemed · cash to balance", date: "2026-09-30", status: "Done", pts: -1000 },
  { label: "Dining · 5% category", date: "2026-09-30", status: "Ready", pts: 1640 },
  { label: "Uniqlo offer bonus", date: "2026-09-12", status: "Ready", pts: 205 },
];

function pageFromHash(): PageId {
  if (typeof window === "undefined") return "home";
  const h = window.location.hash.slice(1) as PageId;
  return PAGES.includes(h) ? h : "home";
}

export function CleanStateProvider({ children }: { children: ReactNode }) {
  const { refresh, state } = useFinance();
  const [page, setPage] = useState<PageId>("home");
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pts, setPts] = useState(1845);
  const [cat, setCat] = useState<RewardCat>("Dining");
  const [log, setLog] = useState<RewardsLog[]>(SEED_LOG);
  const tid = useRef(0);

  useEffect(() => {
    const sync = () => setPage(pageFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = useCallback((p: PageId) => {
    setPage(p);
    if (window.location.hash.slice(1) !== p) history.replaceState(null, "", `#${p}`);
  }, []);

  const toast = useCallback((title: string, sub?: string) => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, title, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const moveMoney = useCallback(
    async (kind: MoneyMove, amount: number, merchant?: string) => {
      try {
        const res = await fetch("/api/demo/move-money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, amount, merchant }) });
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
      setLog((l) => [{ label: `Redeemed · ${mode === "cash" ? "cash to balance" : "shopping credit"}`, date: asOf, status: "Done", pts: -n }, ...l]);
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
      navOpen,
      setNavOpen,
      toast,
      moveMoney,
      rewards: {
        pts,
        pending: SEED_LOG.filter((l) => l.status === "Pending").reduce((a, l) => a + l.pts, 0),
        cat,
        setCat: (c) => {
          if (c === cat) return;
          setCat(c);
          toast(`5% category set to ${c}`, "Applies to Debit Card purchases through the end of the month");
        },
        log,
        redeem,
      },
    }),
    [page, go, navOpen, toast, moveMoney, pts, cat, log, redeem],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="flex flex-col rounded-2xl bg-[#ededed] px-4 py-3 text-black shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
            <span className="text-sm font-semibold">{t.title}</span>
            {t.sub && <span className="text-xs opacity-80">{t.sub}</span>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useClean() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useClean must be used inside <CleanStateProvider>");
  return c;
}
