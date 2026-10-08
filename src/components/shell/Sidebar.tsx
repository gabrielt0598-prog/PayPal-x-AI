"use client";

import { cx } from "@/components/dashboard/ui";
import { NAV_ITEMS } from "./nav";

export function Sidebar({ active, onNavigate }: { active: string; onNavigate: (id: string) => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
      <div className="mb-8 flex items-center gap-2.5 px-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-strong text-xs font-bold text-white">P</span>
        <span className="text-sm font-semibold tracking-tight">PayPal × AI</span>
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={() => onNavigate(id)}
            aria-current={active === id ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active === id ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon size={16} aria-hidden />
            {label}
          </a>
        ))}
      </nav>
      <p className="mt-auto px-3 text-[11px] text-faint">Closed-loop money, powered by your PayPal balance.</p>
    </aside>
  );
}
