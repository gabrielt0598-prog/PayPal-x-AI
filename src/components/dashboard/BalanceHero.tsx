"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CreditCard, FlaskConical, RefreshCw } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import { formatUSD } from "@/lib/finance";
import { Card, Chip, Skeleton, cx } from "./ui";

interface SimResult {
  balanceAfter?: number;
  crossedBelowThreshold?: boolean;
  zapier?: unknown;
}

export function BalanceHero() {
  const { state, loading, refresh, reset } = useFinance();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 9000);
    return () => clearTimeout(t);
  }, [note]);

  if (loading || !state) {
    return (
      <Card id="overview">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-12 w-64" />
        <Skeleton className="mt-6 h-2 w-full" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </Card>
    );
  }

  const p = state.userProfile;
  const { threshold, reloadAmount, fundingSource, enabled } = p.autoReload;
  const low = p.paypalBalance < threshold;
  const scaleMax = Math.max(threshold * 4, p.paypalBalance);
  const fill = Math.min(100, Math.max(0, (p.paypalBalance / scaleMax) * 100));
  const mark = (threshold / scaleMax) * 100;

  async function simulate() {
    setMenuOpen(false);
    setBusy(true);
    try {
      const res = await fetch("/api/demo/simulate-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: "Best Buy", amount: 1900 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json()) as SimResult;
      await refresh();
      const after = typeof r.balanceAfter === "number" ? ` Balance is now ${formatUSD(r.balanceAfter)}.` : "";
      setNote(
        r.crossedBelowThreshold
          ? { tone: "warn", text: `Best Buy purchase simulated.${after} Balance dropped below the auto-reload threshold, alert sent.` }
          : { tone: "ok", text: `Best Buy purchase simulated.${after}` },
      );
    } catch (e) {
      setNote({ tone: "err", text: `Simulation failed (${e instanceof Error ? e.message : "error"}).` });
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setMenuOpen(false);
    setBusy(true);
    try {
      await reset();
      setNote({ tone: "ok", text: "Demo data reset." });
    } catch {
      setNote({ tone: "err", text: "Reset failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="overview" className="relative overflow-visible">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">PayPal balance</p>
          <p className="num mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{formatUSD(p.paypalBalance)}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <CreditCard size={13} aria-hidden />
            {p.card.product} ••{p.card.last4}
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-faint transition-colors hover:border-border-strong hover:text-muted disabled:opacity-50"
          >
            {busy ? <RefreshCw size={12} className="animate-spin" /> : <FlaskConical size={12} />}
            Demo
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border-strong bg-surface-2 py-1 shadow-xl"
            >
              <button role="menuitem" onClick={simulate} className="block w-full px-3 py-2 text-left text-xs hover:bg-surface-3">
                Simulate $1,900 purchase
              </button>
              <button role="menuitem" onClick={doReset} className="block w-full px-3 py-2 text-left text-xs text-muted hover:bg-surface-3">
                Reset demo data
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href="#transactions" className="rounded-full bg-accent-strong px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent">
          Details
        </a>
        <button className="rounded-full border border-border-strong px-4 py-2 text-xs font-medium transition-colors hover:bg-surface-2">
          Add money
        </button>
        <button className="rounded-full border border-border-strong px-4 py-2 text-xs font-medium transition-colors hover:bg-surface-2">
          Move
        </button>
      </div>

      <div className={cx("mt-6 rounded-xl border p-3.5", low ? "border-warning/40 bg-warning-bg" : "border-border bg-surface-2")}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            {low && <AlertTriangle size={13} className="text-warning" aria-hidden />}
            Auto-reload {enabled ? "on" : "off"}
          </span>
          {low ? <Chip tone="warning">Below {formatUSD(threshold)} threshold</Chip> : <Chip tone="positive">Healthy</Chip>}
        </div>
        <div
          className="relative mt-3 h-1.5 rounded-full bg-surface-3"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={scaleMax}
          aria-valuenow={p.paypalBalance}
          aria-label="Balance versus auto-reload threshold"
        >
          <div className={cx("h-full rounded-full", low ? "bg-warning" : "bg-accent")} style={{ width: `${fill}%` }} />
          <div className="absolute -top-1 h-3.5 w-px bg-text/60" style={{ left: `${mark}%` }} />
        </div>
        <p className="mt-2.5 text-[11px] text-muted">
          Reloads {formatUSD(reloadAmount)} from {fundingSource} when balance falls below {formatUSD(threshold)}.
        </p>
      </div>

      {note && (
        <p
          role="status"
          className={cx(
            "mt-3 rounded-lg px-3 py-2 text-xs",
            note.tone === "ok" && "bg-positive-bg text-positive",
            note.tone === "warn" && "bg-warning-bg text-warning",
            note.tone === "err" && "bg-negative-bg text-negative",
          )}
        >
          {note.text}
        </p>
      )}
    </Card>
  );
}
