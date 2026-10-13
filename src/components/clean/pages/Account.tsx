"use client";

import { useCallback, useEffect, useState } from "react";
import { useFinance } from "@/components/state/AppProviders";
import type { MemoryFact } from "@/lib/services/contracts";
import { useClean } from "../AppState";
import { Btn, cx, money, Pill, Skeleton } from "../ui";
import { Toggle } from "./accountShared";

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
  const { state, loading } = useFinance();
  const { toast } = useClean();
  const [facts, setFacts] = useState<MemoryFact[] | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [sandbox, setSandbox] = useState<{ balance: number; mode: string } | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ twoStep: true, bio: true, push: true, pay: true, low: true, news: false, learn: true });
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [newMem, setNewMem] = useState("");

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

  const togglePref = (key: string, text: string) => {
    const was = prefs[key];
    setPrefs({ ...prefs, [key]: !was });
    toast(`${text}${was ? " off" : " on"}`, undefined, { kind: was ? "warn" : "success" });
  };

  const sessionQ = encodeURIComponent(sessionId());
  const factLabel = (k: string) => (/^note_/.test(k) ? "Note" : k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));
  const saveNote = async () => {
    const v = newMem.trim();
    if (!v) return;
    await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionId(), key: `note_${Date.now()}`, value: v, source: "user" }) }).catch(() => null);
    setNewMem("");
    loadFacts();
    toast("Saved to Memory", v);
  };
  const saveEdit = async (f: MemoryFact) => {
    const v = editVal.trim();
    if (!v) return;
    await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionId(), key: f.key, value: v, source: "user" }) }).catch(() => null);
    setEditKey(null);
    loadFacts();
    toast("Memory updated", `${factLabel(f.key)} · ${v}`);
  };
  const forget = async (f: MemoryFact) => {
    await fetch(`/api/memory?sessionId=${sessionQ}&key=${encodeURIComponent(f.key)}`, { method: "DELETE" }).catch(() => null);
    setEditKey(null);
    loadFacts();
    toast("Forgotten", `${factLabel(f.key)} won’t be used in future answers`, { kind: "warn" });
  };
  const settings: { title: string; rows: ({ label: string; sub?: string } & ({ value: string } | { key: string }))[] }[] = [
    { title: "Profile", rows: [{ label: "Name", value: p.name }, { label: "Email", value: p.email }, { label: "Phone", value: "•••• 0142" }, { label: "Address", value: "1458 Fell St", sub: "Used for deliveries from Essentials" }] },
    { title: "Security", rows: [{ label: "Password", value: "Changed 3 months ago" }, { label: "Two-step verification", key: "twoStep", sub: "Ask for a code when signing in on a new device" }, { label: "Face ID sign-in", key: "bio" }] },
    { title: "Notifications", rows: [{ label: "Push notifications", key: "push" }, { label: "Payment alerts", key: "pay", sub: "Every purchase over $25" }, { label: "Low balance alerts", key: "low", sub: "When your balance drops under $25" }, { label: "Offers and news", key: "news" }] },
    { title: "PayPal AI", rows: [{ label: "Learn from my chats", key: "learn", sub: "Remember preferences you share to personalise answers" }, { label: "Actions", value: "Asks before acting", sub: "Cancellations, payments and disputes always need your approval" }] },
  ];
  const settingsRows = (rows: (typeof settings)[number]["rows"]) =>
    rows.map((r, i) => (
      <div key={r.label} className={cx("flex items-center gap-4 py-4", i && "border-t border-border")}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm">{r.label}</span>
          {r.sub && <span className="text-xs text-faint">{r.sub}</span>}
        </span>
        {"key" in r ? <Toggle on={prefs[r.key]} label={r.label} onClick={() => togglePref(r.key, r.label)} /> : <span className="text-right text-sm text-muted">{r.value}</span>}
      </div>
    ));

  const sectionCard = "rounded-[20px] bg-surface px-5";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[var(--sec-gap,32px)]">
      <header className="flex items-center gap-4">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-3">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-strong text-lg font-bold italic text-white">
              P
            </span>
            <h1 className="text-2xl font-semibold leading-tight">Profile</h1>
          </span>
          <span className="pl-12 text-[13px] text-faint">{p.name} · Personal · USD</span>
        </div>
      </header>

      <div className="flex w-full max-w-[760px] flex-col gap-[var(--sec-gap,32px)]">
        {settings.map((sec) => (
          <div key={sec.title} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{sec.title}</h2>
            <section aria-label={sec.title} className={sectionCard}>
              {settingsRows(sec.rows)}
            </section>
          </div>
        ))}

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Memory</h2>
          <section aria-label="Memory" className={sectionCard}>
            {facts === null ? (
              <Skeleton className="my-4 h-16" />
            ) : (
              facts.map((f, i) => (
                <div key={f.key} className={cx("flex flex-wrap items-center gap-3 py-4", i && "border-t border-border")}>
                  {editKey === f.key ? (
                    <>
                      <input
                        autoFocus
                        aria-label={`Edit ${factLabel(f.key)}`}
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(f);
                          if (e.key === "Escape") setEditKey(null);
                        }}
                        className="h-10 min-w-0 flex-1 rounded-[12px] border border-border-strong bg-surface-2 px-3.5 text-sm outline-none"
                      />
                      <Btn small kind="primary" onClick={() => saveEdit(f)}>
                        Save
                      </Btn>
                      <Btn small onClick={() => setEditKey(null)}>
                        Cancel
                      </Btn>
                    </>
                  ) : (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-xs text-faint">{factLabel(f.key)}</span>
                        <span className="text-sm">{f.value}</span>
                        <span className="text-xs text-faint">{f.source === "user" ? "You added it" : "Saved by PayPal AI"}</span>
                      </span>
                      <Btn
                        small
                        aria-label={`Edit ${factLabel(f.key)}`}
                        onClick={() => {
                          setEditKey(f.key);
                          setEditVal(f.value);
                        }}
                      >
                        Edit
                      </Btn>
                      <Btn small kind="ghost" aria-label={`Forget ${factLabel(f.key)}`} onClick={() => forget(f)}>
                        Forget
                      </Btn>
                    </>
                  )}
                </div>
              ))
            )}
            {facts !== null && facts.length === 0 && <p className="py-4 text-sm leading-normal text-muted">Nothing yet. Tell PayPal AI something like “my salary is $75,000 a year” and it will use it in answers.</p>}
            <div className={cx("flex items-center gap-2 py-4", facts?.length && "border-t border-border")}>
              <input
                aria-label="Add a note to Memory"
                value={newMem}
                placeholder="Add something for PayPal AI to remember"
                onChange={(e) => setNewMem(e.target.value.slice(0, 200))}
                onKeyDown={(e) => e.key === "Enter" && saveNote()}
                className="h-10 min-w-0 flex-1 rounded-[12px] border border-border-strong bg-surface-2 px-3.5 text-sm outline-none"
              />
              <Btn small kind="primary" disabled={!newMem.trim()} onClick={saveNote}>
                Save
              </Btn>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Connected services</h2>
          <section aria-label="Connected services" className="overflow-hidden rounded-[20px] bg-surface py-1">
            {SERVICES.map(([key, name, sub], i) => {
              const on = status ? liveOf(status[key]) : null;
              return (
                <div key={key} className={cx("flex items-center gap-3 px-5 py-4", i && "border-t border-border")}>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-sm">{name}</span>
                    <span className="text-xs text-faint">{key === "paypal" && sandbox?.mode === "live" ? `Live sandbox balance ${money(sandbox.balance)} read through the SDK` : sub}</span>
                  </span>
                  <Pill tone={on === null ? "neu" : on ? "pos" : "warn"}>{on === null ? "Unknown" : on ? "Live" : "Sample data"}</Pill>
                </div>
              );
            })}
          </section>
        </div>

        <div>
          <Btn onClick={() => toast("Signed out of this demo", "Nothing changes in the prototype", { kind: "info" })}>Sign out</Btn>
        </div>
      </div>
    </div>
  );
}
