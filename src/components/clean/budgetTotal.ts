"use client";

// Budget figures shared with Home. The Budget page persists its whole state
// (total, limits, categories) under `clean.budget.v1`; Home reads the same state
// when it mounts and computes spend the same way the Budget page does, so the
// "remaining" amounts always match.

import { useEffect, useState } from "react";
import type { Transaction } from "@/lib/types";
import { DEFAULT_STATE, loadBudget, spentIn } from "./budget/model";
import { ymOf } from "./data";

export function useBudgetSummary(txns: Transaction[] | undefined, today: string | undefined) {
  const [bud, setBud] = useState(DEFAULT_STATE);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the persisted budget after mount
    setBud(loadBudget() ?? DEFAULT_STATE);
  }, []);
  const ym = today ? ymOf(today) : "";
  const spent = txns && ym ? bud.items.reduce((a, it) => a + spentIn(txns, it.cat, ym), 0) : 0;
  return { total: bud.total, spent };
}
