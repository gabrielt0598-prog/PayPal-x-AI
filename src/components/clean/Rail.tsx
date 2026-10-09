"use client";

// Docked side panel: a 72px icon rail that expands to 248px. Top to bottom:
// logo row (toggles the panel), PayPal AI, the pages, then the account.

import { ChartLine, Gift, House, List, PanelLeft, Repeat, ShoppingCart, Sparkles, Trophy, type LucideIcon } from "lucide-react";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";
import { useClean, type PageId } from "./AppState";
import { cx } from "./ui";

const NAV: [string, LucideIcon, PageId][] = [
  ["Home", House, "home"],
  ["Transactions", List, "transactions"],
  ["Recurring", Repeat, "recurring"],
  ["Essentials", ShoppingCart, "essentials"],
  ["Offers", Gift, "offers"],
  ["Rewards", Trophy, "rewards"],
  ["Insights", ChartLine, "insights"],
];

export function Rail() {
  const { page, go, navOpen: open, setNavOpen } = useClean();
  const { open: aiOpen, toggleAssistant } = useAssistantUI();
  const { state } = useFinance();
  const name = state?.userProfile.name ?? "Jordan Lee";
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2);

  const item = (active: boolean) =>
    cx(
      "flex min-h-10 items-center gap-2.5 rounded-[10px] text-sm font-medium transition",
      open ? "px-3" : "w-10 justify-center self-center",
      active ? "bg-nav-on text-white" : "text-muted hover:bg-white/[0.04] hover:text-text",
    );

  return (
    <nav aria-label="Primary" className={cx("hidden h-full shrink-0 flex-col py-3 pl-3 lg:flex", open ? "w-[248px]" : "w-[72px]")}>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2">
        <div className="mb-1 flex min-h-11 items-center gap-1">
          <button
            type="button"
            onClick={() => setNavOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Collapse side panel" : "Open side panel"}
            title={open ? "Collapse side panel" : "Open side panel"}
            className={cx("flex h-11 flex-1 items-center gap-2.5 rounded-[10px]", open ? "px-1.5" : "justify-center")}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-strong text-base font-bold text-white">P</span>
            {open && <span className="text-base font-semibold">PayPal</span>}
          </button>
          {open && (
            <button type="button" onClick={() => setNavOpen(false)} aria-label="Close side panel" title="Close side panel" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-text">
              <PanelLeft size={18} />
            </button>
          )}
        </div>

        <button type="button" onClick={toggleAssistant} aria-expanded={aiOpen} aria-label="PayPal AI" title="PayPal AI" className={cx(item(false), aiOpen && "!bg-accent-bg !text-accent")}>
          <Sparkles size={18} />
          {open && <span>PayPal AI</span>}
        </button>

        {NAV.map(([label, Icon, id]) => (
          <button key={id} type="button" onClick={() => go(id)} aria-current={page === id ? "page" : undefined} aria-label={label} title={label} className={item(page === id)}>
            <Icon size={18} />
            {open && <span>{label}</span>}
          </button>
        ))}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => go("account")}
          aria-current={page === "account" ? "page" : undefined}
          aria-label={`Account · ${name}`}
          title={name}
          className={cx(item(page === "account"), "min-h-[52px]", open && "!px-2")}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-text">{initials}</span>
          {open && (
            <span className="flex flex-col text-left">
              <span className="text-[13px] font-medium text-text">{name}</span>
              <span className="text-xs font-normal text-faint">Personal · USD</span>
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}

/** Bottom tab bar on narrow screens, where the rail is hidden. */
export function MobileTabs() {
  const { page, go } = useClean();
  const { toggleAssistant } = useAssistantUI();
  const tabs: [string, LucideIcon, PageId][] = [NAV[0], NAV[1], NAV[2], NAV[4], NAV[6]];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-border bg-surface px-2 py-1.5 lg:hidden">
      {tabs.slice(0, 2).map(([label, Icon, id]) => (
        <button key={id} type="button" onClick={() => go(id)} aria-current={page === id ? "page" : undefined} className={cx("flex flex-col items-center gap-0.5 px-2 py-1 text-[11px]", page === id ? "text-text" : "text-muted")}>
          <Icon size={20} />
          {label}
        </button>
      ))}
      <button type="button" onClick={toggleAssistant} aria-label="PayPal AI" className="flex size-12 items-center justify-center rounded-full bg-accent-strong text-white">
        <Sparkles size={20} />
      </button>
      {tabs.slice(2).map(([label, Icon, id]) => (
        <button key={id} type="button" onClick={() => go(id)} aria-current={page === id ? "page" : undefined} className={cx("flex flex-col items-center gap-0.5 px-2 py-1 text-[11px]", page === id ? "text-text" : "text-muted")}>
          <Icon size={20} />
          {label}
        </button>
      ))}
    </nav>
  );
}
