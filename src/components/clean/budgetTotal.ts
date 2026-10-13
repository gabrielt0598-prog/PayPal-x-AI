"use client";

// The monthly budget target ("Monthly budget" on the Budget page, default
// $3,000). The Budget page persists its whole state under `clean.budget.v1`;
// Home reads the total from there when it mounts, so editing it on the Budget
// page shows up on the Home budget card.

import { useEffect, useState } from "react";

export const DEFAULT_BUDGET_TOTAL = 3000;
const KEY = "clean.budget.v1";

export function readBudgetTotal(): number {
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { total?: unknown } | null;
    return typeof p?.total === "number" && p.total > 0 ? p.total : DEFAULT_BUDGET_TOTAL;
  } catch {
    return DEFAULT_BUDGET_TOTAL;
  }
}

export function useBudgetTotal(): number {
  const [total, setTotal] = useState(DEFAULT_BUDGET_TOTAL);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the persisted total after mount
    setTotal(readBudgetTotal());
  }, []);
  return total;
}
