"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Building2, ChevronDown, CreditCard, Eye, EyeOff, Plus, Snowflake } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import type { MemoryFact } from "@/lib/services/contracts";
import { useClean } from "../AppState";
import { Btn, cx, Drawer, Modal, money, Page, Panel, Pill, Skeleton } from "../ui";
import { useLiveBalance } from "../liveBalance";

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

interface PM {
  id: string;
  kind: "bank" | "card";
  n: string;
  sub: string;
  rows: [string, string][];
}

const DANGER = "!border !border-[var(--danger,#c93a3a)] !bg-[var(--danger,#c93a3a)] !text-white hover:!opacity-90";

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      style={{ background: on ? "#0070e0" : "#3a3a3a" }}
      className={cx("flex h-[22px] w-10 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "justify-end" : "justify-start")}
    >
      <span className="size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
    </button>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Panel>
      {rows.map(([k, v], i) => (
        <div key={k} className={cx("flex items-center gap-3 py-4", i && "border-t border-border")}>
          <span className="flex-1 text-[13px] text-muted">{k}</span>
          <span className="text-right text-[13px] font-medium">{v}</span>
        </div>
      ))}
    </Panel>
  );
}

function Heading({ children, aside, min = "min-h-9" }: { children: ReactNode; aside?: ReactNode; min?: string }) {
  return (
    <div className={cx("flex items-center gap-2.5", min)}>
      <h2 className="text-lg font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

const fieldCls = "flex h-12 w-full items-center gap-2 rounded-[12px] border border-border-strong bg-surface-2 px-3.5 text-sm";

export function AccountPage() {
  const { state, loading, refresh } = useFinance();
  const liveBal = useLiveBalance(state?.userProfile.paypalBalance);
  const { rewards, toast, moveMoney } = useClean();
  const [show, setShow] = useState(false);
  const [facts, setFacts] = useState<MemoryFact[] | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [sandbox, setSandbox] = useState<{ balance: number; mode: string } | null>(null);

  const [move, setMove] = useState<{ mode: "add" | "transfer"; amt: number } | null>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [pref, setPref] = useState<string | null>("chase");
  const [pmSel, setPmSel] = useState<string | null>(null);
  const [pmAsk, setPmAsk] = useState(false);
  const [autoModal, setAutoModal] = useState(false);
  const [auto, setAuto] = useState<{ on: boolean; amt: number; min: number; src: string | null } | null>(null);
  const [srcOpen, setSrcOpen] = useState(false);
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
  const bal = liveBal?.balance ?? p.paypalBalance;
  const initials = p.name.split(" ").map((s) => s[0]).join("");
  const frozen = p.card.frozen === true;
  const bankName = p.linkedBank.replace(/\s*••\d+$/, "");
  const bankEnd = p.linkedBank.match(/••(\d{4})/)?.[1] ?? "7712";

  const PMS: PM[] = [
    { id: "chase", kind: "bank", n: bankName, sub: `••${bankEnd} · auto-reload source`, rows: [["Type", "Checking account"], ["Account ending", bankEnd], ["Status", "Verified"], ["Linked", "Mar 14, 2025"]] },
    { id: "ally", kind: "bank", n: "Ally Online Savings", sub: "••3390", rows: [["Type", "Savings account"], ["Account ending", "3390"], ["Status", "Verified"], ["Linked", "Aug 2, 2025"]] },
    { id: "sapphire", kind: "card", n: "Chase Sapphire Preferred · Visa", sub: "Credit ••1123 · expires 04/28", rows: [["Type", "Visa credit card"], ["Card ending", "1123"], ["Expires", "04/28"], ["Status", "Verified"], ["Linked", "Jan 9, 2025"]] },
    { id: "apple", kind: "card", n: "Apple Card · Mastercard", sub: "Credit ••6620 · expires 11/27", rows: [["Type", "Mastercard credit card"], ["Card ending", "6620"], ["Expires", "11/27"], ["Status", "Verified"], ["Linked", "Nov 21, 2025"]] },
  ];
  const live = PMS.filter((m) => !gone[m.id]);
  const pmCur = live.find((m) => m.id === pmSel);
  const label = (m?: PM) => (m ? `${m.n} ${m.sub.match(/••\d{4}/)?.[0] ?? ""}`.trim() : "No account linked");

  const a = auto ?? { on: p.autoReload.enabled, amt: p.autoReload.reloadAmount, min: p.autoReload.threshold, src: null };
  const srcAcc = live.find((m) => m.id === a.src) ?? live.find((m) => m.kind === "bank" && m.id === pref) ?? live.find((m) => m.kind === "bank") ?? live[0];
  const setA = (patch: Partial<typeof a>) => setAuto({ ...a, ...patch });
  const closeAuto = () => {
    setAutoModal(false);
    setSrcOpen(false);
    toast(a.on ? "Auto reload saved" : "Auto reload is off", a.on ? `Reloads ${money(a.amt)} when your balance falls below ${money(a.min)}` : "Your balance won’t top up automatically", { kind: a.on ? "success" : "warn" });
  };

  const makePref = (m: PM) => {
    setPref(m.id);
    toast("Preferred payment method updated", m.n);
  };
  const removePm = (m: PM) => {
    const left = PMS.filter((x) => !gone[x.id] && x.id !== m.id);
    setGone({ ...gone, [m.id]: true });
    setPmSel(null);
    setPmAsk(false);
    if (pref === m.id) setPref(left[0]?.id ?? null);
    toast(`Removed ${m.n}`, "No longer available for top ups", { kind: "warn" });
  };

  const toggleFreeze = async () => {
    const next = !frozen;
    try {
      const res = await fetch("/api/demo/card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frozen: next }) });
      if (!res.ok) throw new Error(String(res.status));
      await refresh();
      toast(next ? "Card frozen" : "Card unfrozen", next ? "New purchases are declined until you unfreeze it" : "Your PayPal Debit Card works again", { kind: next ? "warn" : "success" });
    } catch {
      toast("Something went wrong", "The card was not changed", { kind: "warn" });
    }
  };

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

  const cardArt: CSSProperties = {
    background: "linear-gradient(145deg, #1d4ba8 0%, #0a1f4d 55%, #061433 100%)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.25) inset, 0 -2px 6px rgba(0,0,0,0.35) inset, 0 14px 24px -12px rgba(0,0,0,0.6)",
    ...(frozen ? { filter: "grayscale(1)", opacity: 0.55 } : {}),
  };
  const mono = "font-[Menlo,Monaco,monospace]";

  const pmRow = (m: PM) => (
    <div key={m.id} className="flex flex-wrap items-center gap-3 py-4">
      <button type="button" onClick={() => { setPmSel(m.id); setPmAsk(false); }} aria-label={`${m.n} details`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-3 text-muted">{m.kind === "bank" ? <Building2 size={18} /> : <CreditCard size={18} />}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{m.n}</span>
          <span className="text-xs text-faint">{m.sub}</span>
        </span>
      </button>
      {pref === m.id ? (
        <Pill tone="acc">Preferred</Pill>
      ) : (
        <Btn small onClick={() => makePref(m)}>
          Make preferred
        </Btn>
      )}
    </div>
  );
  const banks = live.filter((m) => m.kind === "bank");
  const cards = live.filter((m) => m.kind === "card");

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
    <Page title="Wallet">
      <div className="flex flex-wrap items-start gap-[var(--sec-gap,32px)]">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3">
          <section aria-label="PayPal balance" className="flex flex-col gap-3.5 rounded-[20px] bg-surface p-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-sm text-muted">PayPal balance</span>
                <span className="num text-[32px] font-semibold leading-[1.1]">{money(bal)}</span>
              </span>
              <Btn onClick={() => setMove({ mode: "transfer", amt: 100 })}>Transfer</Btn>
              <Btn kind="primary" onClick={() => setMove({ mode: "add", amt: 100 })}>
                <Plus size={16} />
                Top up
              </Btn>
            </div>
            <div className="flex items-center gap-3 border-t border-border-strong pt-3.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="text-sm">Auto reload</span>
                  <Pill tone={a.on ? "pos" : "neu"}>{a.on ? "Active" : "Off"}</Pill>
                </span>
                <span className="text-xs text-faint">{a.on ? `Reloads ${money(a.amt)} when your balance falls below ${money(a.min)}` : "Off"}</span>
              </span>
              <Btn small onClick={() => setAutoModal(true)}>
                Configure
              </Btn>
            </div>
          </section>
          <div className="h-2" />
          <Heading
            aside={
              <>
                <span className="flex-1" />
                <Btn onClick={() => toast("Link a bank or card", "Opens PayPal’s secure linking flow", { kind: "info" })}>
                  <Plus size={16} />
                  Link a bank or card
                </Btn>
              </>
            }
          >
            Linked accounts
          </Heading>
          <section aria-label="Linked accounts" className="rounded-[20px] bg-surface px-5 pb-1.5 pt-4">
            <h3 className="mb-2.5 text-[15px] font-semibold">Banks</h3>
            {banks.map(pmRow)}
            {!banks.length && <span className="block py-2.5 text-[13px] text-faint">No banks linked</span>}
            <div aria-hidden className="h-[18px]" />
            <h3 className="mb-2.5 text-[15px] font-semibold">Cards</h3>
            {cards.map(pmRow)}
            {!cards.length && <span className="block py-2.5 text-[13px] text-faint">No cards linked</span>}
          </section>
        </div>

        <section aria-label="PayPal Debit Card" className="flex max-w-[440px] flex-[1_1_360px] flex-col gap-6 rounded-[20px] bg-surface p-5">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-[15px] font-semibold">PayPal Debit Card</h2>
          </div>
          <div className="-mb-2 flex w-full justify-center">
            <div style={cardArt} className="relative flex aspect-[1.586] w-full max-w-[380px] flex-col items-start justify-between overflow-hidden rounded-[14px] px-5 py-[18px] text-white">
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: "linear-gradient(105deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 32%, rgba(255,255,255,0) 48%, rgba(0,0,0,0.22) 100%)" }} />
              <div className="relative flex w-full items-center">
                <span className="flex-1 text-[22px] font-bold italic tracking-[-0.01em]">PayPal</span>
                <span className="text-[11px] font-semibold tracking-[0.08em]">DEBIT</span>
              </div>
              <span className="relative h-7 w-[38px] rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: "linear-gradient(135deg, #f1dfa6 0%, #c9ad66 50%, #e6cf8e 100%)" }} />
              <div className={cx("relative text-[17px] tracking-[0.08em]", mono)}>{show ? `5412 7534 1209 ${p.card.last4}` : `•••• •••• •••• ${p.card.last4}`}</div>
              <div className="relative flex w-full items-end gap-3">
                <span className="flex-1 text-[11px] font-semibold tracking-[0.08em]">{p.name.toUpperCase()}</span>
                <span className="flex flex-col gap-px">
                  <span className="text-[8px] font-semibold tracking-[0.08em] opacity-70">EXP</span>
                  <span className={cx("text-xs", mono)}>{show ? "09/29" : "••/••"}</span>
                </span>
                <span className="flex flex-col gap-px">
                  <span className="text-[8px] font-semibold tracking-[0.08em] opacity-70">CVV</span>
                  <span className={cx("text-xs", mono)}>{show ? "318" : "•••"}</span>
                </span>
                <span aria-hidden className="flex">
                  <span className="size-6 rounded-full bg-[#eb001b]" />
                  <span className="-ml-2.5 size-6 rounded-full bg-[#f79e1b] opacity-90" />
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn className="flex-1" onClick={() => setShow(!show)}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
              {show ? "Hide details" : "Show details"}
            </Btn>
            <Btn className="flex-1" onClick={toggleFreeze}>
              <Snowflake size={16} />
              {frozen ? "Unfreeze card" : "Freeze card"}
            </Btn>
          </div>
          {frozen && (
            <div role="note" className="rounded-[10px] border border-[rgba(242,184,75,0.35)] bg-warning-bg px-3.5 py-3 text-xs leading-normal">
              Card frozen. New purchases and ATM withdrawals are declined. Subscriptions you already set up and refunds still go through.
            </div>
          )}
          <Rows rows={[["Cash back", `5% on ${rewards.cat}`], ["ATM withdrawals", "$400 per day"], ["Draws from", "PayPal balance"]]} />
        </section>
      </div>

      <header className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-3 text-lg font-semibold">{initials}</span>
        <div className="flex flex-1 flex-col gap-0.5">
          <h2 className="text-2xl font-semibold leading-tight">Profile</h2>
          <span className="text-[13px] text-faint">{p.name} · Personal · USD</span>
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

      {pmCur && (
        <Drawer label={pmCur.kind === "bank" ? "Bank account" : "Card"} onClose={() => { setPmSel(null); setPmAsk(false); }}>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[22px] font-semibold leading-tight tracking-tight">{pmCur.n}</span>
              <span className="text-[13px] text-muted">{pmCur.sub}</span>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-3 text-muted">{pmCur.kind === "bank" ? <Building2 size={18} /> : <CreditCard size={18} />}</span>
          </div>
          {pref === pmCur.id && <Pill tone="acc" className="self-start">Preferred</Pill>}
          <Rows rows={pmCur.rows} />
          <div className="mt-auto flex pt-2">
            <Btn className={cx("flex-1", DANGER)} onClick={() => setPmAsk(true)}>
              Remove
            </Btn>
          </div>
        </Drawer>
      )}
      {pmCur && pmAsk && (
        <Modal label={`Remove ${pmCur.n}?`} onClose={() => setPmAsk(false)}>
          <p className="text-[13px] leading-normal text-muted">
            Remove {pmCur.n} from your linked accounts? {pref === pmCur.id ? "It is your preferred method, so the next one you have linked becomes preferred. " : ""}You can link it again any time.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Btn onClick={() => setPmAsk(false)}>Cancel</Btn>
            <Btn className={DANGER} onClick={() => removePm(pmCur)}>
              Remove
            </Btn>
          </div>
        </Modal>
      )}

      {move && (
        <Modal label={move.mode === "add" ? "Add money to PayPal" : "Transfer to your bank"} onClose={() => setMove(null)}>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-faint">Amount</span>
            <span className="num text-[40px] font-semibold tracking-tight">{money(move.amt)}</span>
          </div>
          <div role="group" aria-label="Amount" className="flex flex-wrap gap-2">
            {[50, 100, 250, 500].map((v) => (
              <Btn key={v} small kind={move.amt === v ? "primary" : "secondary"} aria-pressed={move.amt === v} onClick={() => setMove({ ...move, amt: v })}>
                ${v}
              </Btn>
            ))}
          </div>
          <Rows
            rows={[
              ["From", move.mode === "add" ? p.linkedBank : `PayPal balance · ${money(bal)}`],
              ["To", move.mode === "add" ? "PayPal balance" : p.linkedBank],
              ["Arrives", move.mode === "add" ? "Instantly" : "1–3 business days · free"],
              ["Balance after", <b key="a" className="num font-semibold">{money(bal + (move.mode === "add" ? move.amt : -move.amt))}</b>],
            ]}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Btn onClick={() => setMove(null)}>Cancel</Btn>
            <Btn
              kind="primary"
              disabled={move.mode === "transfer" && move.amt > bal}
              onClick={async () => {
                const m = move;
                setMove(null);
                if (!(await moveMoney(m.mode, m.amt))) return;
                toast(m.mode === "add" ? `${money(m.amt)} added to PayPal` : `${money(m.amt)} transfer started`, m.mode === "add" ? `From ${p.linkedBank} · available now` : `To ${p.linkedBank} · arrives in 1–3 business days`);
              }}
            >
              {ctaLabel(move)}
            </Btn>
          </div>
        </Modal>
      )}

      {autoModal && (
        <Modal label="Auto reload" onClose={closeAuto}>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">Auto reload</span>
              <span className="text-xs text-faint">Keep your balance topped up automatically</span>
            </span>
            <Toggle on={a.on} label="Auto reload" onClick={() => setA({ on: !a.on })} />
          </div>
          {a.on && (
            <div className="mt-2 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="auto-amt" className="text-sm">
                  Reload amount
                </label>
                <span className={fieldCls}>
                  <span className="text-faint">$</span>
                  <input id="auto-amt" type="text" inputMode="numeric" value={a.amt ? String(a.amt) : ""} onChange={(e) => setA({ amt: Math.min(parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0, 5000) })} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="auto-min" className="text-sm">
                  When balance falls below
                </label>
                <span className={fieldCls}>
                  <span className="text-faint">$</span>
                  <input id="auto-min" type="text" inputMode="numeric" value={a.min ? String(a.min) : ""} onChange={(e) => setA({ min: Math.min(parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0, 5000) })} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                </span>
              </div>
              <div className="relative flex flex-col gap-2">
                <span className="text-sm">Reload from</span>
                <button type="button" aria-haspopup="menu" aria-expanded={srcOpen} onClick={() => setSrcOpen(!srcOpen)} className={cx(fieldCls, "text-left text-[15px]")}>
                  <span className="min-w-0 flex-1 truncate">{label(srcAcc)}</span>
                  <ChevronDown size={16} className={cx("text-muted transition-transform", srcOpen && "rotate-180")} />
                </button>
                {srcOpen && (
                  <div role="menu" aria-label="Reload from" className="absolute inset-x-0 top-full z-[5] mt-1 rounded-[12px] border border-border-strong bg-surface-2 px-3.5 py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
                    {live.map((m, i) => (
                      <button
                        key={m.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={srcAcc?.id === m.id}
                        onClick={() => {
                          setA({ src: m.id });
                          setSrcOpen(false);
                        }}
                        className={cx("flex w-full items-center gap-3 py-3 text-left", i && "border-t border-border")}
                      >
                        <span className="min-w-0 flex-1 text-sm">{label(m)}</span>
                        <span className="text-sm text-accent">{srcAcc?.id === m.id ? "✓" : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="-mt-3 text-xs leading-normal text-faint">Reloads {money(a.amt)} whenever your balance falls below {money(a.min)}. You’ll get a notification each time.</span>
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <Btn kind="primary" onClick={closeAuto}>
              Done
            </Btn>
          </div>
        </Modal>
      )}
    </Page>
  );
}

function ctaLabel(m: { mode: "add" | "transfer"; amt: number }) {
  return `${m.mode === "add" ? "Add" : "Transfer"} ${money(m.amt)}`;
}
