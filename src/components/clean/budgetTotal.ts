"use client";

// The monthly budget target ("Monthly budget" on the Budget page, default
// $3,000). Home reads the same value, so editing it on the Budget page shows up
// on the Home budget card. Kept in localStorage; every read is guarded.

import { useEffect, useState } from "react";

export const DEFAULT_BUDGET_TOTAL = 3000;
const KEY = "pfm.budget.total";
const EVENT = "pfm:budget-total";

export function readBudgetTotal(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_TOTAL;
  } catch {
    return DEFAULT_BUDGET_TOTAL;
  }
}

export function writeBudgetTotal(n: number) {
  try {
    window.localStorage.setItem(KEY, String(n));
  } catch {
    /* storage unavailable: the value only lives for this render */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useBudgetTotal(): number {
  const [total, setTotal] = useState(DEFAULT_BUDGET_TOTAL);
  useEffect(() => {
    const sync = () => setTotal(readBudgetTotal());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return total;
}
