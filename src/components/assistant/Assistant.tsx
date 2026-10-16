"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, SquarePen, X } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import type { AgentResponse } from "@/lib/agent/types";
import { ActionList } from "./ActionCards";
import { Markdown } from "./Markdown";
import { Sparkles } from "@/components/clean/SparkleIcon";
import { DailyBrief, useDailyBrief } from "./DailyBrief";

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
  const [mode, setMode] = useState<AgentResponse["mode"] | null>(null);
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
        closeAssistant();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleAssistant, closeAssistant, open]);

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

  // First load: the panel slides in after the page content has settled. Closing and reopening it later is immediate.
  const [late, setLate] = useState(true);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setLate(false), 1500);
    return () => clearTimeout(id);
  }, [open]);

  const brief = useDailyBrief();

  if (!open) return null;

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const firstUser = messages.find((m) => m.role === "user")?.content;
  const title = firstUser ? (firstUser.length > 40 ? `${firstUser.slice(0, 38)}…` : firstUser) : "Stella";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const firstName = state?.userProfile.name.split(" ")[0] ?? "there";

  return (
    <aside
      aria-label="Stella"
      className={`m-in-right ${late ? "m-late" : ""} fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface lg:inset-y-2 lg:left-auto lg:right-2 lg:z-30 lg:w-[380px] lg:rounded-2xl lg:border lg:border-border-strong`}
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
      </header>

      <div ref={scrollRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4">
        {messages.length === 0 && brief && <DailyBrief brief={brief} firstName={firstName} starters={STARTERS} onAsk={(q) => void send(q)} />}
        {messages.length === 0 && !brief && (
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

/** Assistant bubble. The model's [ev_n]/[tool_n] source markers (used by the fact-check) are stripped from what the user reads. */
function AssistantMessage({ message: m, canAnswer, onSend }: { message: UIMessage; canAnswer: boolean; onSend: (text: string) => void }) {
  const response = m.response;
  const text = m.content.replace(/\s*\[?(?:ev|tool)_\d+\]?/g, "");

  return (
    <article className="flex items-start gap-3">
      <AiAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
        <div className={`max-w-[36em] text-sm leading-relaxed ${m.error ? "rounded-2xl bg-negative-bg px-3.5 py-2.5" : ""}`}>
          <Markdown text={text} />
        </div>
        {response && <ActionList actions={response.actions} canAnswer={canAnswer} onSend={onSend} />}
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


