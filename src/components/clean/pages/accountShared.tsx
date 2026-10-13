"use client";

import type { ReactNode } from "react";
import { cx, Panel } from "../ui";

export function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
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

export function Rows({ rows }: { rows: [string, ReactNode][] }) {
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
