import type { CompareTable } from "@/lib/agent/types";

const cols = "grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]";

/** "Now vs What if" side-by-side: row label column, Now column, highlighted What if column with a small delta line. */
export function CompareCard({ title, compare }: { title?: string; compare: CompareTable }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-strong bg-surface-2 text-[13px]">
      {title && <div className="border-b border-border px-3 py-2 text-[12px] font-medium text-muted">{title}</div>}
      <div className={cols}>
        <span className="px-3 py-2.5" />
        <span className="px-3 py-2.5 text-[12px] font-semibold text-muted">{compare.colA}</span>
        <span className="bg-accent-bg px-3 py-2.5 text-[12px] font-semibold text-accent">{compare.colB}</span>
      </div>
      {compare.rows.map((r, i) => (
        <div key={i} className={`${cols} border-t border-border`}>
          <span className="p-3 text-[12px] leading-snug text-muted">{r.label}</span>
          <span className="whitespace-nowrap p-3 font-medium">{r.now}</span>
          <span className="flex flex-col gap-0.5 bg-accent-bg p-3">
            <span className="whitespace-nowrap font-semibold">{r.whatIf}</span>
            {r.delta && <span className={`whitespace-nowrap text-[11px] font-medium ${r.tone === "neg" ? "text-negative" : "text-positive"}`}>{r.delta}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
