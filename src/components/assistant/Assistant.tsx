"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, ShieldCheck, ShieldAlert, Sparkles, X } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import type { AgentResponse } from "@/lib/agent/types";
import type { MemoryFact } from "@/lib/services/contracts";
import { ActionCard } from "./ActionCards";
import { Markdown } from "./Markdown";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AgentResponse;
  error?: boolean;
}

const SUGGESTIONS = [
  "How much did I spend on dining last month?",
  "Which subscriptions am I not using?",
  "Cancel my Max subscription",
  "Apply my best offer",
  "My salary is $75,000 a year",
  "Categorize my recent transactions",
];

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

export function Assistant() {
  const { open, closeAssistant, toggleAssistant, pendingPrompt, clearPendingPrompt } = useAssistantUI();
  const { refresh } = useFinance();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [memory, setMemory] = useState<MemoryFact[]>([]);
  const [mode, setMode] = useState<AgentResponse["mode"] | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  // Focus the input when the panel opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  // Auto-send a prompt queued by the dashboard (Cancel / Apply buttons).
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

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const salary = memory.find((f) => /salary/i.test(f.key));

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={closeAssistant}
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-label="Assistant"
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-border-strong bg-surface shadow-2xl shadow-black/60 transition-transform duration-300 ease-out sm:w-[440px] ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="relative flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles size={16} className="text-accent" />
          <h2 className="text-[15px] font-semibold text-text">Assistant</h2>
          {mode && (
            <span
              title={mode.llm === "live" ? "Live Claude model" : "Rule-based demo mode (no API key)"}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${mode.llm === "live" ? "border-positive/30 bg-positive-bg text-positive" : "border-warning/30 bg-warning-bg text-warning"}`}
            >
              {mode.llm === "live" ? "live" : "mock"} · {mode.model}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setShowMemory((v) => !v)}
              className="flex max-w-[170px] items-center gap-1 rounded-full border border-border-strong bg-surface-2 px-2.5 py-1 text-[11px] text-muted transition hover:text-text"
              aria-expanded={showMemory}
            >
              <Brain size={12} className="shrink-0" />
              <span className="truncate">{salary ? `Remembers: salary ${salary.value}` : memory.length ? `Remembers ${memory.length}` : "Memory"}</span>
            </button>
            <button onClick={closeAssistant} aria-label="Close assistant" className="rounded-lg p-1.5 text-muted transition hover:bg-surface-3 hover:text-text">
              <X size={16} />
            </button>
          </div>
          {showMemory && (
            <div className="absolute right-4 top-full z-10 mt-1 w-72 rounded-xl border border-border-strong bg-surface-2 p-3 shadow-xl">
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

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="pt-6">
              <p className="text-[18px] font-semibold text-text">What can I help with?</p>
              <p className="mt-1 text-[13px] text-muted">Ask about your spending, subscriptions and offers, or tell me to act on them.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void send(s)} className="rounded-full border border-border-strong bg-surface-2 px-3 py-1.5 text-left text-[12.5px] text-muted transition hover:border-accent/50 hover:text-text">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-strong px-3.5 py-2 text-[14px] text-white">{m.content}</div>
              </div>
            ) : (
              <div key={m.id} className="space-y-2">
                <div className={`rounded-2xl rounded-bl-md border px-3.5 py-2.5 ${m.error ? "border-negative/30 bg-negative-bg" : "border-border bg-surface-2"}`}>
                  <Markdown text={m.content} />
                </div>
                {m.response?.actions.map((a, i) => (
                  <ActionCard key={i} action={a} canAnswer={m.id === lastAssistantId && !loading} onSend={(t) => void send(t)} />
                ))}
                {m.response && <GuardrailBadge response={m.response} />}
              </div>
            ),
          )}

          {loading && (
            <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3.5 py-3" aria-label="Assistant is typing">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-border p-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface-2 px-3 py-2 focus-within:border-accent/60">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask anything about your money…"
              className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-[14px] text-text outline-none placeholder:text-faint"
            />
            <button type="submit" disabled={!input.trim() || loading} aria-label="Send" className="rounded-lg bg-accent p-1.5 text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40">
              <ArrowUp size={16} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-faint">⌘K to toggle · Esc to close</p>
        </form>
      </aside>
    </div>
  );
}

function GuardrailBadge({ response }: { response: AgentResponse }) {
  const g = response.guardrail;
  const corrected = g.outcome !== "verified";
  const Icon = corrected ? ShieldAlert : ShieldCheck;
  const label = g.outcome === "blocked" ? "Restated by Jev" : corrected ? "Corrected by Jev" : "Verified by Jev";
  return (
    <div
      title={`TypeSafe Jev (${g.mode})${g.unsupportedFigures.length ? ` · flagged: ${g.unsupportedFigures.join(", ")}` : ""}${response.warning ? ` · ${response.warning}` : ""}`}
      className={`inline-flex items-center gap-1 text-[11px] ${corrected ? "text-warning" : "text-faint"}`}
    >
      <Icon size={12} /> {label}
      {g.mode === "mock" ? " (mock)" : ""}
    </div>
  );
}
