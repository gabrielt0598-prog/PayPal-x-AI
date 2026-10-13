"use client";

// Bottom dock: a floating, blurred pill with the pages and the account, and a
// round PayPal AI button beside it. The dock stays centred in the page; the AI
// panel opens from the right over the page. An optional bubble above the AI
// button announces an event (e.g. a suspicious charge); pressing it opens the
// panel and starts the conversation.

import { ChartLine, Gift, House, List, Repeat, ShoppingCart, Target, Trophy, Wallet, type LucideIcon } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { useClean, type PageId } from "./AppState";
import { cx } from "./ui";
import { Sparkles } from "./SparkleIcon";

export const NAV: [string, LucideIcon, PageId][] = [
  ["Home", House, "home"],
  ["Wallet", Wallet, "wallet"],
  ["Transactions", List, "transactions"],
  ["Budget", Target, "budget"],
  ["Recurring", Repeat, "recurring"],
  ["Essentials", ShoppingCart, "essentials"],
  ["Offers", Gift, "offers"],
  ["Rewards", Trophy, "rewards"],
  ["Insights", ChartLine, "insights"],
];

export interface DockBubble {
  title: string;
  body: string;
  /** Prompt sent to PayPal AI when the bubble is pressed. */
  prompt: string;
}

export function Dock({ bubble, onBubble }: { bubble?: DockBubble | null; onBubble?: () => void }) {
  const { page, go } = useClean();
  const { open: aiOpen, toggleAssistant, openAssistant } = useAssistantUI();
  const { state } = useFinance();
  const name = state?.userProfile.name ?? "Jordan Lee";
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-2">
        <nav
          aria-label="Primary"
          className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-border-strong bg-surface-2/70 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-[18px] backdrop-saturate-[1.3]"
        >
          {NAV.map(([label, Icon, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={page === id ? "page" : undefined}
              aria-label={label}
              title={label}
              className={cx("flex size-11 shrink-0 items-center justify-center rounded-full transition", page === id ? "bg-nav-on text-text" : "text-muted hover:bg-white/[0.06] hover:text-text")}
            >
              <Icon size={20} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => go("account")}
            aria-current={page === "account" ? "page" : undefined}
            aria-label={`Account · ${name}`}
            title={name}
            className={cx("flex size-11 shrink-0 items-center justify-center rounded-full", page === "account" ? "bg-nav-on" : "")}
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-border-strong bg-surface-3 text-xs font-semibold text-text">{initials}</span>
          </button>
        </nav>

        <div className="relative flex">
          {bubble && !aiOpen && (
            <button
              type="button"
              onClick={() => {
                onBubble?.();
                openAssistant(bubble.prompt);
              }}
              aria-label={`${bubble.title}. Open PayPal AI`}
              className="anim-pop-in absolute bottom-[calc(100%+14px)] left-1/2 flex w-80 max-w-[calc(100vw-24px)] -translate-x-1/2 gap-3 rounded-[18px] border border-border-strong bg-surface-2 px-4 py-3.5 text-left shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-strong text-base font-bold italic text-white">P</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex gap-2 text-xs text-faint">
                  <span className="font-semibold text-muted">PayPal</span>
                  <span>now</span>
                </span>
                <span className="text-sm font-semibold">{bubble.title}</span>
                <span className="text-[13px] leading-snug text-muted">{bubble.body}</span>
              </span>
              <span aria-hidden className="absolute -bottom-1.5 left-[calc(50%-5px)] size-2.5 rotate-45 border-b border-r border-border-strong bg-surface-2" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleAssistant}
            aria-expanded={aiOpen}
            aria-label="Ask PayPal AI"
            title="Ask PayPal AI"
            className={cx(
              "flex size-14 items-center justify-center rounded-full border backdrop-blur-[18px]",
              !aiOpen && "border-border-strong shadow-[0_12px_32px_rgba(0,0,0,0.45)]",
              aiOpen ? "border-accent bg-accent text-[#0a0a0a] shadow-[0_0_0_4px_var(--accent-bg),0_12px_32px_rgba(0,0,0,0.45)]" : "bg-accent-bg text-accent",
            )}
          >
            <Sparkles size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
