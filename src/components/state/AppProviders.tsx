"use client";

// Shared client state: the FinanceState snapshot from GET /api/state plus the
// assistant panel's open/closed state. Dashboard and assistant both read from
// here; the assistant calls refresh() after any agent action so the grid and
// charts update in place.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FinanceState } from "@/lib/types";

interface FinanceContextValue {
  state: FinanceState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
}

interface AssistantUIValue {
  open: boolean;
  /** Open the assistant panel, optionally pre-filling (and sending) a prompt. */
  openAssistant: (prompt?: string) => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  /** Prompt queued by openAssistant(prompt); the assistant consumes and clears it. */
  pendingPrompt: string | null;
  clearPendingPrompt: () => void;
}

async function fetchState(init?: RequestInit): Promise<FinanceState> {
  const res = await fetch("/api/state", { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} /api/state ${res.status}`);
  return (await res.json()) as FinanceState;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);
const AssistantUIContext = createContext<AssistantUIValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FinanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Stella is open by default; closing it is up to the user.
  const [open, setOpen] = useState(true);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const apply = useCallback((p: Promise<FinanceState>) => {
    return p.then(
      (s) => {
        setState(s);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    void apply(fetchState());
  }, [apply]);

  const load = useCallback((init?: RequestInit) => apply(fetchState(init)), [apply]);

  const finance = useMemo<FinanceContextValue>(
    () => ({ state, loading, error, refresh: () => load(), reset: () => load({ method: "DELETE" }) }),
    [state, loading, error, load],
  );

  const ui = useMemo<AssistantUIValue>(
    () => ({
      open,
      openAssistant: (prompt) => {
        if (prompt) setPendingPrompt(prompt);
        setOpen(true);
      },
      closeAssistant: () => setOpen(false),
      toggleAssistant: () => setOpen((o) => !o),
      pendingPrompt,
      clearPendingPrompt: () => setPendingPrompt(null),
    }),
    [open, pendingPrompt],
  );

  return (
    <FinanceContext.Provider value={finance}>
      <AssistantUIContext.Provider value={ui}>{children}</AssistantUIContext.Provider>
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside <AppProviders>");
  return ctx;
}

export function useAssistantUI() {
  const ctx = useContext(AssistantUIContext);
  if (!ctx) throw new Error("useAssistantUI must be used inside <AppProviders>");
  return ctx;
}
