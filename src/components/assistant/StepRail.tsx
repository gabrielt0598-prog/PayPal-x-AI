import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { RailStep } from "@/lib/agent/types";

/** Renders **bold** segments of a subtitle. */
function boldParts(text: string): ReactNode[] {
  return text.split("**").map((t, i) => (i % 2 ? <strong key={i} className="font-semibold text-text">{t}</strong> : t));
}

/**
 * Vertical step rail: a round check avatar per step joined by a thin connector, title + subtitle in the left
 * column (they wrap there and never run under the status), status in its own right column top-aligned with the title.
 * Step spacing is a fixed padding, so it stays equal however many lines a step has.
 */
export function StepRail({ steps }: { steps: RailStep[] }) {
  return (
    <ol className="rounded-xl border border-border-strong bg-surface-2 px-3 py-4 text-[13px]">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <span className="flex shrink-0 flex-col items-center">
              <span className="flex size-6 items-center justify-center rounded-full bg-positive-bg text-positive">
                <Check size={13} strokeWidth={2.5} />
              </span>
              {!last && <span aria-hidden="true" className="my-1 min-h-3 w-0.5 flex-1 rounded-full bg-border-strong" />}
            </span>
            <div className={`flex min-w-0 flex-1 items-start gap-3 ${last ? "" : "pb-4"}`}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="pt-1 text-[13px] font-medium leading-snug">{s.title}</span>
                {s.sub && <span className="break-words text-[12px] leading-snug text-faint">{boldParts(s.sub)}</span>}
              </div>
              <span className="shrink-0 whitespace-nowrap pt-1 text-[12px] font-semibold leading-normal text-positive">{s.status}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
