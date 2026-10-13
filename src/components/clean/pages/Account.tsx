"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Landmark, Snowflake, Trash2 } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import type { MemoryFact } from "@/lib/services/contracts";
import { useClean } from "../AppState";
import { Btn, Card, cx, KV, money, Page, Panel, Pill, Section, Skeleton } from "../ui";

function sessionId() {
  try {
    return sessionStorage.getItem("pfm-assistant-session") ?? "default";
  } catch {
    return "default";
  }
}

const SERVICES = [
  ["paypal", "PayPal Server SDK", "Transactions, balance, subscriptions"],
  ["anthropic", "Claude", "PayPal AI assistant"],
  ["jev", "TypeSafe Jev", "Fact-checks every reply"],
  ["kernel", "Kernel", "Cancels on merchant sites"],
  ["zapier", "Zapier", "Low-balance alerts"],
] as const;

function liveOf(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") return /live|connected|on|ok/i.test(v) ? true : /mock|off|demo|sim/i.test(v) ? false : null;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return liveOf(o.mode ?? o.status ?? o.live);
  }
  return null;
}

export function AccountPage() {
  const { state, loading, refresh } = useFinance();
  const { rewards, toast } = useClean();
  const [show, setShow] = useState(false);
  const frozen = state?.userProfile.card.frozen === true;
  const [facts, setFacts] = useState<MemoryFact[] | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [sandbox, setSandbox] = useState<{ balance: number; mode: string } | null>(null);

  const loadFacts = useCallback(() => {
    fetch(`/api/memory?sessionId=${encodeURIComponent(sessionId())}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((f: MemoryFact[]) => setFacts(f))
      .catch(() => setFacts([]));
  }, []);

  useEffect(() => {
    loadFacts();
    fetch("/api/integrations/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
    // A live read through the PayPal Server SDK (Transaction Search), so the page shows the integration working.
    fetch("/api/paypal/balance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { balance?: number; mode?: string } | null) => setSandbox(b && typeof b.balance === "number" ? { balance: b.balance, mode: String(b.mode) } : null))
      .catch(() => setSandbox(null));
  }, [loadFacts]);

  if (loading || !state) return <Skeleton className="mx-auto h-[600px] w-full max-w-[1600px]" />;
  const p = state.userProfile;
  const initials = p.name.split(" ").map((s) => s[0]).join("");

  return (
    <Page
      title={
        <span className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-surface-3 text-lg font-semibold">{initials}</span>
          {p.name}
        </span>
      }
    >
      <Section title="Wallet">
        <div className="flex flex-wrap items-start gap-6">
          <Card className="max-w-[440px] flex-[1_1_360px]">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-[15px] font-semibold">PayPal Debit Card</h3>
            </div>
            <div className={cx("flex aspect-[1.586] flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0b3a8c] via-[#0a54c2] to-[#0070e0] p-5 text-white", frozen && "opacity-60 grayscale")}>
              <div className="flex items-center">
                <span className="flex-1 text-[17px] font-bold italic">PayPal</span>
                <span className="text-[11px] font-semibold tracking-[0.08em] opacity-80">DEBIT</span>
              </div>
              <span className="h-[26px] w-9 rounded-md bg-[#d9c38a]" />
              <div className="font-mono text-[17px] tracking-[0.08em]">{show ? `5412 7534 1209 ${p.card.last4}` : `•••• •••• •••• ${p.card.last4}`}</div>
              <div className="flex items-end gap-3">
                <span className="flex-1 text-[11px] font-semibold tracking-[0.08em]">{p.name.toUpperCase()}</span>
                <span className="flex flex-col gap-px">
                  <span className="text-[8px] font-semibold tracking-[0.08em] opacity-70">EXP</span>
                  <span className="font-mono text-xs">{show ? "09/29" : "••/••"}</span>
                </span>
                <span className="flex flex-col gap-px">
                  <span className="text-[8px] font-semibold tracking-[0.08em] opacity-70">CVV</span>
                  <span className="font-mono text-xs">{show ? "318" : "•••"}</span>
                </span>
                <span aria-hidden className="flex">
                  <span className="size-6 rounded-full bg-[#eb001b]" />
                  <span className="-ml-2.5 size-6 rounded-full bg-[#f79e1b]/90" />
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Btn className="flex-1" onClick={() => setShow(!show)}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? "Hide details" : "Show details"}
              </Btn>
              <Btn
                className="flex-1"
                onClick={async () => {
                  const next = !frozen;
                  try {
                    const res = await fetch("/api/demo/card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frozen: next }) });
                    if (!res.ok) throw new Error(String(res.status));
                    await refresh();
                    toast(next ? "Card frozen" : "Card unfrozen", next ? "New purchases and ATM withdrawals are declined" : "Purchases work again", { kind: next ? "warn" : "success" });
                  } catch {
                    toast("Something went wrong", "The card was not changed", { kind: "warn" });
                  }
                }}
              >
                <Snowflake size={16} /> {frozen ? "Unfreeze card" : "Freeze card"}
              </Btn>
            </div>
            <Panel>
              <KV first k="Cash back" v={`5% on ${rewards.cat} this month`} />
              <KV k="ATM withdrawals" v="$400 per day" />
            </Panel>
          </Card>

          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
            <Card>
              <h3 className="text-[15px] font-semibold">PayPal balance</h3>
              <span className="num text-[32px] font-semibold">{money(p.paypalBalance)}</span>
              <Panel>
                <KV first k="Auto-reload" v={p.autoReload.enabled ? <Pill tone="pos">On</Pill> : <Pill>Off</Pill>} />
                <KV k="When balance drops below" v={money(p.autoReload.threshold)} />
                <KV k="Reload amount" v={money(p.autoReload.reloadAmount)} />
                <KV k="Paycheck" v={`${money(p.netPaycheck)} every two weeks`} />
              </Panel>
            </Card>
            <Card>
              <h3 className="text-[15px] font-semibold">Banks</h3>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-3">
                  <Landmark size={18} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px]">{p.linkedBank}</span>
                  <span className="text-[13px] text-faint">Funds auto-reload and transfers</span>
                </span>
                <Pill>Primary</Pill>
              </div>
            </Card>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 items-start gap-[var(--sec-gap,32px)] @3xl:grid-cols-2">
        <Section title="Memory">
          <Card flush>
            {facts === null ? (
              <Skeleton className="m-5 h-16" />
            ) : facts.length ? (
              facts.map((f, i) => (
                <div key={f.key} className={cx("flex items-center gap-3 px-5 py-3.5", i && "border-t border-border")}>
                  <span className="flex flex-1 flex-col">
                    <span className="text-[13px] text-faint">{f.key.replace(/_/g, " ")}</span>
                    <span className="text-[15px]">{f.value}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Forget ${f.key}`}
                    onClick={async () => {
                      await fetch(`/api/memory?sessionId=${encodeURIComponent(sessionId())}&key=${encodeURIComponent(f.key)}`, { method: "DELETE" });
                      loadFacts();
                      toast("Forgotten", f.key.replace(/_/g, " "));
                    }}
                    className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-white/[0.06] hover:text-text"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <p className="px-5 py-4 text-sm leading-normal text-muted">Nothing yet. Tell PayPal AI something like “my salary is $75,000 a year” and it will use it in answers.</p>
            )}
          </Card>
        </Section>
        <Section title="Connected services">
          <Card flush>
            {SERVICES.map(([key, label, sub], i) => {
              const live = status ? liveOf(status[key]) : null;
              return (
                <div key={key} className={cx("flex items-center gap-3 px-5 py-3.5", i && "border-t border-border")}>
                  <span className="flex flex-1 flex-col">
                    <span className="text-[15px]">{label}</span>
                    <span className="text-[13px] text-faint">
                      {key === "paypal" && sandbox?.mode === "live" ? `Live sandbox balance ${money(sandbox.balance)} read through the SDK` : sub}
                    </span>
                  </span>
                  <Pill tone={live === null ? "neu" : live ? "pos" : "warn"}>{live === null ? "Unknown" : live ? "Live" : "Sample data"}</Pill>
                </div>
              );
            })}
          </Card>
        </Section>
      </div>
    </Page>
  );
}
