"use client";

// Lightweight SVG/CSS charts in the Clean style (no chart library).

import { compactUSD } from "./format";
import { cx, money } from "./ui";

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Ticks({ max, count = 4 }: { max: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count + 1 }, (_, i) => {
        const v = (max / count) * i;
        return (
          <div key={i} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${(i / count) * 100}%` }}>
            <span className="absolute right-full top-0 mr-2.5 -translate-y-1/2 whitespace-nowrap text-[11px] text-faint">{compactUSD(v)}</span>
          </div>
        );
      })}
    </>
  );
}

/** Cumulative spend this month (solid) vs the whole of last month (dashed). */
export function CompareLine({ cur, prev, days, today, curLabel, prevLabel }: { cur: number[]; prev: number[]; days: number; today: number; curLabel: string; prevLabel: string }) {
  const max = niceMax(Math.max(...cur, ...prev, 1));
  const x = (i: number) => (i / Math.max(1, days - 1)) * 100;
  const y = (v: number) => 100 - (v / max) * 100;
  const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = cur.length ? `${path(cur)} L${x(cur.length - 1).toFixed(2)},100 L0,100 Z` : "";
  const curNow = cur[cur.length - 1] ?? 0;
  const prevNow = prev[Math.min(today, prev.length) - 1] ?? 0;
  const labels = [1, 8, 15, 22, 29].filter((d) => d <= days);
  return (
    <div className="flex flex-col gap-1">
      <div role="img" aria-label={`${curLabel}: ${money(curNow)} so far. ${prevLabel} at the same point: ${money(prevNow)}.`} className="relative ml-12 mt-3 h-[200px]">
        <Ticks max={max} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
          <path d={area} fill="var(--chart)" opacity={0.14} />
          <path d={path(prev)} fill="none" stroke="var(--text-faint)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={path(cur)} fill="none" stroke="var(--chart)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-y-0 border-l border-dashed border-border-strong" style={{ left: `${x(today - 1)}%` }} />
        <span className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-chart ring-4 ring-chart/20" style={{ left: `${x(today - 1)}%`, bottom: `${(curNow / max) * 100}%` }} />
        <div className="absolute -translate-x-1/2 rounded-lg bg-surface-2 px-2 py-1 text-center" style={{ left: `${Math.min(88, Math.max(12, x(today - 1)))}%`, bottom: `calc(${(curNow / max) * 100}% + 14px)` }}>
          <div className="num text-[13px] font-semibold">{money(curNow)}</div>
        </div>
      </div>
      <div className="relative ml-12 h-[18px]">
        {labels.map((d) => (
          <span key={d} className="absolute -translate-x-1/2 text-[11px] text-faint" style={{ left: `${x(d - 1)}%` }}>
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-[18px] text-xs font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-4 rounded-sm border-t-[3px] border-chart" />
          {curLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-faint" />
          {prevLabel}
        </span>
      </div>
    </div>
  );
}

export interface Bar {
  label: string;
  value: number;
  title: string;
  current?: boolean;
  showLabel?: boolean;
}

/** Vertical bars; the current bucket is solid, the rest slightly dimmed. */
export function Bars({ bars, height = 200, aria }: { bars: Bar[]; height?: number; aria: string }) {
  const max = niceMax(Math.max(...bars.map((b) => b.value), 1));
  return (
    <div className="flex flex-col gap-1">
      <div role="img" aria-label={aria} className="relative ml-12 mt-3" style={{ height }}>
        <Ticks max={max} />
        <div className="absolute inset-0 flex items-end gap-1">
          {bars.map((b, i) => (
            <div key={i} title={`${b.title} · ${money(b.value)}`} className="flex h-full flex-1 items-end justify-center">
              <div className={cx("w-full max-w-9 rounded-t-[4px] rounded-b-[2px] bg-chart", !b.current && "opacity-75")} style={{ height: `${Math.max(b.value > 0 ? 1.5 : 0, (b.value / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="ml-12 flex gap-1">
        {bars.map((b, i) => (
          <span key={i} className={cx("flex-1 whitespace-nowrap text-center text-[11px]", b.current ? "font-semibold text-text" : "text-faint")}>
            {b.showLabel === false ? "" : b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Donut with rounded, gapped segments (stroke-dash trick). */
export function Donut({ parts, size = 280, center, sub, aria }: { parts: { value: number; color: string }[]; size?: number; center: string; sub: string; aria: string }) {
  const C = 2 * Math.PI * 43;
  const sw = 8;
  const gap = 2;
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const lens = parts.map((p) => (p.value / total) * C);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, l) => a + l, 0));
  return (
    <div role="img" aria-label={aria} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full">
        <g transform="rotate(-90 50 50)">
          {parts.map((p, i) => (
            <circle
              key={i}
              cx={50}
              cy={50}
              r={43}
              fill="none"
              stroke={p.color}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(lens[i] - sw - gap, 0.01)} ${C}`}
              strokeDashoffset={-(starts[i] + sw / 2 + gap / 2)}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="num text-[30px] font-semibold">{center}</span>
        <span className="text-[13px] text-faint">{sub}</span>
      </div>
    </div>
  );
}
