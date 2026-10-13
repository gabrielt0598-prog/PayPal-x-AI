"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Brain, ChevronDown, ShieldCheck, ShieldAlert, SquarePen, X } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import type { AgentResponse } from "@/lib/agent/types";
import type { MemoryFact } from "@/lib/services/contracts";
import { ActionList } from "./ActionCards";
import { Markdown } from "./Markdown";
import { Sparkles } from "@/components/clean/SparkleIcon";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AgentResponse;
  error?: boolean;
}

// Starter pills: short label -> the full prompt sent to the real agent. Ordered as a walkthrough of what the app does:
// a verified what-if, an analysis, changes on the page, PayPal Subscriptions and Orders API actions, a cloud-browser
// cancellation (Kernel), and a PayPal offer.
const STARTERS: [string, string][] = [
  ["What if I skip dining?", "What if I skip dining out for the rest of the month?"],
  ["Unused subscriptions", "Which subscriptions am I not using?"],
  ["Set dining limit to $212", "Set my dining limit to $212"],
  ["Pause Kitebird+", "Pause my Kitebird+ subscription"],
  ["Pay for Essentials", "Pay for my Essentials order with PayPal"],
  ["Cancel Vantage", "Cancel my Vantage subscription"],
  ["Best offer", "Apply my best offer"],
];

const FOLLOW_DEFAULT = ["Pay for my Essentials order with PayPal", "Which subscriptions am I not using?", "Apply my best offer"];

/** Follow-up chips derived from what the reply was about (its actions, then the tools it used). */
function followUps(r?: AgentResponse): string[] {
  if (!r) return FOLLOW_DEFAULT;
  const types = new Set(r.actions.map((a) => a.type));
  const tools = new Set((r.toolResults ?? []).map((t) => t.tool));
  if (types.has("what_if_compare") || tools.has("what_if")) return ["Set my dining limit to $212", "What if I buy a $900 laptop?"];
  if (types.has("budget_limit_set")) return ["Pause my Kitebird+ subscription", "Pay for my Essentials order with PayPal"];
  if (types.has("subscription_paused")) return ["Pay for my Essentials order with PayPal", "Cancel my Vantage subscription"];
  if (types.has("paypal_payment")) return ["Which subscriptions am I not using?", "Apply my best offer"];
  if (types.has("cancellation_preview")) return ["Which subscriptions am I not using?"];
  if (types.has("subscription_cancelled")) return ["Pay for my Essentials order with PayPal", "Apply my best offer"];
  if (types.has("offer_applied")) return ["Which subscriptions am I not using?", "What if I skip dining out for the rest of the month?"];
  if (types.has("fact_remembered")) return ["Am I on track with my budget this month?", "What if I skip dining out for the rest of the month?"];
  if ([...tools].some((t) => /subscri/i.test(t))) return ["Pause my Kitebird+ subscription", "Cancel my Vantage subscription"];
  if ([...tools].some((t) => /offer/i.test(t))) return ["Which subscriptions am I not using?", "What if I skip dining out for the rest of the month?"];
  return FOLLOW_DEFAULT;
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem("pfm-assistant-session");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("pfm-assistant-session", id);
    }
    return id;
  } catch {
    return (globalThis as { __pfmSid?: string }).__pfmSid ?? ((globalThis as { __pfmSid?: string }).__pfmSid = crypto.randomUUID());
  }
}

const uid = () => Math.random().toString(36).slice(2);

/**
 * Stella drawer. Docked between the side panel and the page on wide screens
 * (the page stays visible and usable), full screen on phones. Talks to POST
 * /api/agent: Claude with tools over the PayPal data, every reply checked by Jev.
 */
export function Assistant() {
  const { open, closeAssistant, toggleAssistant, pendingPrompt, clearPendingPrompt } = useAssistantUI();
  const { refresh, state } = useFinance();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [memory, setMemory] = useState<MemoryFact[]>([]);
  const [mode, setMode] = useState<AgentResponse["mode"] | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  const loadingRef = useRef(false);
  const lastPending = useRef<string | null>(null);
  messagesRef.current = messages;

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || loadingRef.current) return;
      loadingRef.current = true;
      const next: UIMessage[] = [...messagesRef.current, { id: uid(), role: "user", content }];
      messagesRef.current = next;
      setMessages(next);
      setInput("");
      setLoading(true);
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: getSessionId(),
            messages: next.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = (await res.json()) as AgentResponse | { error: string };
        if (res.status === 429 && "error" in data) {
          setMessages((m) => [...m, { id: uid(), role: "assistant", content: data.error, error: true }]);
          return;
        }
        if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: data.reply, response: data }]);
        setMemory(data.memory);
        setMode(data.mode);
        if (data.actions.length) void refresh();
      } catch (e) {
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: `Sorry, something went wrong: ${e instanceof Error ? e.message : "unknown error"}`, error: true }]);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [refresh],
  );

  // Global shortcuts: Cmd/Ctrl+K toggles, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleAssistant();
      } else if (e.key === "Escape" && open) {
        if (showMemory) setShowMemory(false);
        else closeAssistant();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleAssistant, closeAssistant, open, showMemory]);

  // Focus the input when the drawer opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  // Auto-send a prompt queued by the page (Cancel / Apply / Ask about this buttons).
  useEffect(() => {
    if (pendingPrompt === null) {
      lastPending.current = null;
      return;
    }
    if (lastPending.current === pendingPrompt) return;
    lastPending.current = pendingPrompt;
    clearPendingPrompt();
    void send(pendingPrompt);
  }, [pendingPrompt, clearPendingPrompt, send]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  if (!open) return null;

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const salary = memory.find((f) => /salary/i.test(f.key));
  const firstUser = messages.find((m) => m.role === "user")?.content;
  const title = firstUser ? (firstUser.length > 40 ? `${firstUser.slice(0, 38)}…` : firstUser) : "Stella";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const firstName = state?.userProfile.name.split(" ")[0] ?? "there";

  return (
    <aside
      aria-label="Stella"
      className="m-in-right fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface lg:inset-y-2 lg:left-auto lg:right-2 lg:z-30 lg:w-[380px] lg:rounded-2xl lg:border lg:border-border-strong"
    >
      <header className="relative flex items-center gap-0.5 border-b border-border py-2.5 pl-4 pr-2">
        <span className="mr-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-bg text-accent">
          <Sparkles size={13} />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold leading-normal">{title}</h2>
        {mode && (
          <span
            title={mode.llm === "live" ? `Live Claude model · ${mode.model}` : "Rule-based demo mode (no API key)"}
            className={`mr-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${mode.llm === "live" ? "bg-positive-bg text-positive" : "bg-warning-bg text-warning"}`}
          >
            {mode.llm === "live" ? "live" : "mock"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowMemory((v) => !v)}
          aria-expanded={showMemory}
          aria-label="Memory"
          title={salary ? `Remembers: salary ${salary.value}` : memory.length ? `Remembers ${memory.length}` : "Memory"}
          className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-text"
        >
          <Brain size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setInput("");
          }}
          aria-label="New chat"
          title="New chat"
          className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-text"
        >
          <SquarePen size={16} />
        </button>
        <button type="button" onClick={closeAssistant} aria-label="Close Stella" title="Close" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-text">
          <X size={18} />
        </button>
        {showMemory && (
          <div className="absolute right-3 top-full z-10 mt-1 w-72 rounded-xl border border-border-strong bg-surface-2 p-3 shadow-xl">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Remembered this session</div>
            {memory.length ? (
              <ul className="space-y-1.5 text-[13px]">
                {memory.map((f) => (
                  <li key={f.key} className="flex justify-between gap-3">
                    <span className="text-muted">{f.key}</span>
                    <span className="text-right text-text">{f.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Nothing yet. Tell me your salary or a savings goal.</p>
            )}
          </div>
        )}
      </header>

      <div ref={scrollRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent-bg text-accent">
              <Sparkles size={22} />
            </span>
            <span className="text-[17px] font-semibold">How can I help, {firstName}?</span>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map(([label, prompt]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="h-9 whitespace-nowrap rounded-full border border-border-strong bg-transparent px-3.5 text-[13px] text-muted transition hover:text-text"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="m-rise max-w-[min(80%,36em)] self-end whitespace-pre-wrap rounded-[18px_18px_4px_18px] bg-surface-3 px-4 py-2.5 text-sm leading-normal">
              {m.content}
            </div>
          ) : (
            <AssistantMessage key={m.id} message={m} canAnswer={m.id === lastAssistantId && !loading} onSend={(t) => void send(t)} />
          ),
        )}

        {loading && (
          <div className="m-fade flex items-center gap-3" role="status">
            <AiAvatar />
            <span className="text-sm text-faint">Reading your account…</span>
          </div>
        )}

        {messages.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1.5">
            {(lastAssistant?.error ? FOLLOW_DEFAULT : followUps(lastAssistant?.response)).map((q) => (
              <button key={q} type="button" onClick={() => void send(q)} className="h-[34px] rounded-full border border-border bg-surface px-3.5 text-[13px] text-muted transition hover:border-border-strong hover:text-text">
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mx-3 mb-3 flex items-center gap-2 rounded-[14px] border border-border-strong bg-surface-2 py-1.5 pl-3.5 pr-1.5 focus-within:border-accent/60"
      >
        <label htmlFor="ai-input" className="sr-only">
          Message Stella
        </label>
        <input
          id="ai-input"
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this page or your money…"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint"
        />
        <button type="submit" disabled={!input.trim() || loading} aria-label="Send" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[#0a0a0a] transition disabled:cursor-not-allowed disabled:opacity-40">
          <ArrowUp size={14} />
        </button>
      </form>
    </aside>
  );
}

type CiteInfo = { kind: "evidence" | "tool"; title: string; text: string } | null;

function lookupCitation(response: AgentResponse | undefined, id: string): CiteInfo {
  const ev = response?.evidence?.find((d) => d.id === id);
  if (ev) return { kind: "evidence", title: ev.title, text: ev.text };
  const tool = response?.toolResults?.find((t) => t.id === id);
  if (tool) return { kind: "tool", title: `Tool result: ${tool.tool.replace(/_/g, " ")}`, text: tool.summary };
  return null;
}

/** Assistant bubble with [ev_n]/[tool_n] citations rendered as chips; hover previews, click pins the source below the bubble. */
function AssistantMessage({ message: m, canAnswer, onSend }: { message: UIMessage; canAnswer: boolean; onSend: (text: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const response = m.response;
  const shown = hover ?? pinned;
  const info = shown ? lookupCitation(response, shown) : null;

  const cite = (id: string, key: string): ReactNode => {
    const known = lookupCitation(response, id);
    const active = shown === id;
    return (
      <button
        key={key}
        type="button"
        onMouseEnter={() => setHover(id)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(id)}
        onBlur={() => setHover(null)}
        onClick={() => setPinned((p) => (p === id ? null : id))}
        aria-expanded={active}
        aria-label={known ? `Source ${id}: ${known.title}` : `Source ${id} (not found)`}
        className={`rounded-md border px-1 font-mono text-[10px] leading-4 transition ${
          !known
            ? "border-negative/40 bg-negative-bg text-negative"
            : active
              ? "border-accent/60 bg-accent/20 text-text"
              : known.kind === "tool"
                ? "border-border-strong bg-surface-3 text-muted hover:text-text"
                : "border-accent/30 bg-accent/10 text-accent hover:border-accent/60"
        }`}
      >
        {id}
      </button>
    );
  };

  const cited = Array.from(new Set(m.content.match(/(?:ev|tool)_\d+/g) ?? [])).filter((id) => lookupCitation(response, id));

  return (
    <article className="flex items-start gap-3">
      <AiAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
        <div className={`max-w-[36em] text-sm leading-relaxed ${m.error ? "rounded-2xl bg-negative-bg px-3.5 py-2.5" : ""}`}>
          <Markdown text={m.content} cite={response ? cite : undefined} />
        </div>
        {response && <ActionList actions={response.actions} canAnswer={canAnswer} onSend={onSend} />}
        {cited.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cited.map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() => setPinned((p) => (p === id ? null : id))}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                aria-expanded={shown === id}
                className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[12px] transition ${shown === id ? "border-border-strong bg-surface-3 text-text" : "border-border bg-surface-2 text-muted hover:text-text"}`}
              >
                {i + 1} · {lookupCitation(response, id)?.title}
              </button>
            ))}
          </div>
        )}
        {shown && (
          <div className="rounded-[10px] border border-border-strong bg-surface-2 px-3 py-2 text-[12px] leading-relaxed" role="note">
            <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
              <span className="font-mono normal-case">{shown}</span>
              <span className="truncate normal-case tracking-normal text-muted">{info ? info.title : "Not a known source"}</span>
              {pinned === shown && (
                <button type="button" onClick={() => setPinned(null)} aria-label="Close source" className="ml-auto rounded p-0.5 hover:text-text">
                  <X size={11} />
                </button>
              )}
            </div>
            <p className={info ? "text-text" : "text-negative"}>{info ? info.text : "This citation does not match any evidence or tool result from this turn."}</p>
          </div>
        )}
        {response && <GuardrailBadge response={response} />}
      </div>
    </article>
  );
}

function AiAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-bg text-accent">
      <Sparkles size={16} />
    </span>
  );
}

const pctLabel = (p: number) => `${Math.round(p * 100)}%`;

function GuardrailBadge({ response }: { response: AgentResponse }) {
  const [open, setOpen] = useState(false);
  const g = response.guardrail;
  const corrected = g.outcome !== "verified";
  const Icon = corrected ? ShieldAlert : ShieldCheck;
  const claims = g.claims ?? [];
  const removed = g.removedClaims ?? [];
  const supportedCount = claims.filter((c) => c.verdict === "supported").length;
  const label = g.outcome === "blocked" ? "Restated by Jev" : corrected ? "Corrected by Jev" : "Verified by Jev";
  const count =
    g.outcome === "verified" ? (claims.length ? ` · ${supportedCount}/${claims.length} claims` : "") : removed.length ? ` · ${removed.length} claim${removed.length === 1 ? "" : "s"} removed` : "";
  const hasDetail = claims.length > 0 || removed.length > 0 || response.evidence?.length > 0;
  const retrieval = response.retrieval;
  return (
    <div className={`text-[11px] ${corrected ? "text-warning" : "text-faint"}`}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={open}
        title={`TypeSafe Jev (${g.mode})${g.unsupportedFigures.length ? ` · flagged: ${g.unsupportedFigures.join(", ")}` : ""}${response.warning ? ` · ${response.warning}` : ""}`}
        className={`inline-flex items-center gap-1 ${hasDetail ? "cursor-pointer hover:text-text" : "cursor-default"}`}
      >
        <Icon size={12} /> {label}
        {count}
        {g.mode === "mock" ? " (mock)" : ""}
        {hasDetail && <ChevronDown size={11} className={`transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-xl border border-border bg-surface-2 p-2.5 text-muted">
          {retrieval && (
            <p className="text-[11px] text-faint">
              Evidence: {response.evidence.length} of {retrieval.candidates.prefiltered} reranked candidates ({retrieval.candidates.built} built) · {retrieval.mode === "live" ? "Jev rerank" : "lexical rerank (mock)"}
              {retrieval.intent ? ` · intent: ${retrieval.intent.intent.replace(/_/g, " ")}` : ""}
            </p>
          )}
          {claims.length > 0 && (
            <ul className="space-y-1.5">
              {claims.map((c, i) => (
                <ClaimRow key={i} text={c.text} supported={c.supported} citations={c.citations} ok={c.verdict === "supported"} />
              ))}
            </ul>
          )}
          {removed.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-warning">Removed (unsupported, threshold {pctLabel(g.claimThreshold ?? 0.6)})</div>
              <ul className="space-y-1.5">
                {removed.map((c, i) => (
                  <ClaimRow key={i} text={c.text} supported={c.supported} citations={c.citations} ok={false} removed />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClaimRow({ text, supported, citations, ok, removed }: { text: string; supported: number; citations: string[]; ok: boolean; removed?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-[12px] leading-snug">
      <span className={`mt-px w-9 shrink-0 text-right font-mono text-[11px] ${ok ? "text-positive" : "text-negative"}`} title="Jev: probability the cited evidence supports this claim">
        {pctLabel(supported)}
      </span>
      <span className={`min-w-0 flex-1 ${removed ? "text-faint line-through decoration-negative/50" : "text-text"}`}>
        {text}
        {citations.length > 0 && <span className="ml-1 font-mono text-[10px] text-faint">{citations.join(" ")}</span>}
      </span>
    </li>
  );
}
