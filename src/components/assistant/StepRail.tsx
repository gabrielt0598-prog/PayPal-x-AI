import type { CSSProperties, ReactNode } from "react";
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
 * Steps appear one after another (the design's m-step motion): the step rises, its avatar pops, its connector draws down.
 */
export function StepRail({ steps }: { steps: RailStep[] }) {
  return (
    <ol className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-4 text-[13px]">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const state = s.state ?? "done";
        const avatar = state === "done" ? "bg-positive-bg text-positive" : state === "current" ? "bg-accent-bg text-accent" : "bg-surface-3 text-faint";
        return (
          <li key={i} className="m-step flex gap-3" style={{ "--d": `${i * 450}ms` } as CSSProperties}>
            <span className="flex shrink-0 flex-col items-center">
              <span className={`m-av flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ${avatar}`}>
                {state === "done" ? <Check size={13} strokeWidth={2.5} /> : state === "current" ? "●" : i + 1}
              </span>
              {!last && <span aria-hidden="true" className={`m-line my-1 min-h-3 w-0.5 flex-1 rounded-full ${state === "done" ? "bg-positive" : "bg-border-strong"}`} />}
            </span>
            <div className={`flex min-w-0 flex-1 items-start gap-3 ${last ? "" : "pb-4"}`}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`pt-1 text-[13px] leading-snug ${state === "pending" ? "font-normal text-faint" : state === "current" ? "font-semibold" : "font-medium"}`}>{s.title}</span>
                {s.sub && <span className="break-words text-[12px] leading-snug text-faint">{boldParts(s.sub)}</span>}
              </div>
              <span className={`shrink-0 whitespace-nowrap pt-1 text-[12px] font-semibold leading-normal ${state === "done" ? "text-positive" : state === "current" ? "text-accent" : "text-faint"}`}>{s.status}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
