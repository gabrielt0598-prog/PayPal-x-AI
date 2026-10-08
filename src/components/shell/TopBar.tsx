"use client";

import { Search } from "lucide-react";
import { longDate } from "@/components/dashboard/utils";
import { useAssistantUI, useFinance } from "@/components/state/AppProviders";

export function TopBar() {
  const { state } = useFinance();
  const { openAssistant } = useAssistantUI();
  const first = state?.userProfile.name.split(" ")[0] ?? "Jordan";
  const initials = (state?.userProfile.name ?? "Jordan Lee")
    .split(" ")
    .map((s) => s[0])
    .join("");

  return (
    <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="min-w-0 sm:mr-auto">
        <h1 className="text-xl font-semibold tracking-tight">Hello, {first}</h1>
        <p className="text-xs text-muted">{state ? longDate(state.asOf) : " "}</p>
      </div>
      <button
        onClick={() => openAssistant()}
        className="order-last flex w-full items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-left text-sm text-faint transition-colors hover:border-border-strong sm:order-none sm:max-w-xl sm:flex-1"
      >
        <Search size={15} aria-hidden />
        <span className="flex-1">Ask anything…</span>
        <kbd className="hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-muted sm:inline">⌘K</kbd>
      </button>
      <span className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold sm:ml-0" aria-label={state?.userProfile.name}>
        {initials}
      </span>
    </header>
  );
}
