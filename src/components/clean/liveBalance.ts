"use client";

// The PayPal balance and recent transactions Home and Account show. With PayPal live this is the sandbox
// account read through the Server SDK (GET /api/paypal/home); with mock data it returns null and the pages
// keep using the sample FinanceState. `refreshKey` re-reads it after the demo moves money.

import { useEffect, useState } from "react";
import type { Transaction } from "@/lib/types";

export interface LiveBalance {
  balance: number;
  transactions: Transaction[];
}

export function useLiveBalance(refreshKey?: unknown): LiveBalance | null {
  const [live, setLive] = useState<LiveBalance | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/paypal/home", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { mode?: string; balance?: number; transactions?: Transaction[] } | null) => {
        if (off) return;
        setLive(j?.mode === "live" && typeof j.balance === "number" && Array.isArray(j.transactions) ? { balance: j.balance, transactions: j.transactions } : null);
      })
      .catch(() => {
        if (!off) setLive(null);
      });
    return () => {
      off = true;
    };
  }, [refreshKey]);
  return live;
}
