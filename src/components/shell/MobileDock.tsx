"use client";

import { Sparkles } from "lucide-react";
import { cx } from "@/components/dashboard/ui";
import { useAssistantUI } from "@/components/state/AppProviders";
import { NAV_ITEMS } from "./nav";

export function MobileDock({ active, onNavigate }: { active: string; onNavigate: (id: string) => void }) {
  const { openAssistant } = useAssistantUI();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100vw-24px)] items-center gap-0.5 rounded-full border border-border-strong bg-surface-2/90 p-1.5 shadow-2xl backdrop-blur lg:hidden"
    >
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          aria-label={label}
          aria-current={active === id ? "page" : undefined}
          onClick={() => onNavigate(id)}
          className={cx(
            "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
            active === id ? "bg-surface-3 text-text" : "text-muted",
          )}
        >
          <Icon size={18} aria-hidden />
        </a>
      ))}
      <button
        onClick={() => openAssistant()}
        aria-label="Ask the assistant"
        className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-accent-strong text-white"
      >
        <Sparkles size={18} aria-hidden />
      </button>
    </nav>
  );
}
