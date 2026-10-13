"use client";

// Charts for the Clean design, rendered with AG Charts (Community) and themed
// to the Clean tokens: transparent background, faint labels, hairline grid,
// PayPal blue for the current period.

import { useEffect, useMemo, useRef, useState } from "react";
import { AgCharts } from "ag-charts-react";
import { AllCommunityModule, ModuleRegistry, type AgChartOptions } from "ag-charts-community";
import { compactUSD } from "./format";
import { money } from "./ui";

ModuleRegistry.registerModules([AllCommunityModule]);

const BLUE = "#3d8bff";
const INK = "#8a8a8a";
const GRID = "rgba(255,255,255,0.06)";

/** Canvas can't resolve CSS variables, so read the page's real font stack once mounted. */
function useFont() {
  const [font] = useState(() => (typeof document === "undefined" ? "" : getComputedStyle(document.body).fontFamily) || "ui-sans-serif, system-ui, sans-serif");
  return font;
}

const baseOf = (fontFamily: string) => ({
  background: { visible: false },
  padding: { top: 12, right: 4, bottom: 0, left: 0 },
  legend: { enabled: false },
  theme: {
    baseTheme: "ag-default-dark" as const,
    params: { fontFamily, foregroundColor: "#ededed" },
    overrides: {
      common: {
        axes: {
          category: { line: { enabled: false }, tick: { enabled: false }, gridLine: { enabled: false }, label: { color: INK, fontSize: 11 } },
          number: { line: { enabled: false }, tick: { enabled: false }, label: { color: INK, fontSize: 11 }, gridLine: { style: [{ stroke: GRID, lineDash: [] }] } },
        },
      },
    },
  },
});

const usdAxis = { type: "number" as const, position: "left" as const, label: { color: INK, fontSize: 11, formatter: ({ value }: { value: number }) => compactUSD(value) } };

function Legend({ items }: { items: { label: string; kind: "solid" | "dashed" }[] }) {
  return (
    <div className="flex flex-wrap gap-[18px] text-xs font-medium text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={i.kind === "solid" ? "w-4 rounded-sm border-t-[3px] border-chart" : "w-4 border-t-2 border-dashed border-faint"} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Cumulative spend this month (filled line) vs the whole of last month (dashed), with a day tooltip. */
export function CompareLine({
  cur,
  prev,
  days,
  today,
  curLabel,
  prevLabel,
  monthAbbr,
  prevAbbr,
}: {
  cur: number[];
  prev: number[];
  days: number;
  today: number;
  curLabel: string;
  prevLabel: string;
  /** Short month names for the axis and tooltip ("Oct", "Sep"); default to the first three letters of the labels. */
  monthAbbr?: string;
  prevAbbr?: string;
}) {
  const cm = monthAbbr ?? curLabel.slice(0, 3);
  const pm = prevAbbr ?? prevLabel.slice(0, 3);
  const n = Math.max(days, 2);
  const todayIdx = Math.min(Math.max(today, 1), cur.length || 1) - 1;
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const step = 1000 * Math.max(1, Math.ceil(Math.max(1, Math.ceil(Math.max(...cur, ...prev, 0) / 1000)) / 4));
  const yMax = Math.max(step, Math.ceil(Math.max(...cur, ...prev, 0) / step) * step);
  const ticks = Array.from({ length: yMax / step + 1 }, (_, k) => k * step);
  const px = (i: number) => (i / (n - 1)) * 100;
  const py = (v: number) => 100 - (v / yMax) * 100;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(2)} ${py(v).toFixed(2)}`).join(" ");
  const curPts = cur.slice(0, todayIdx + 1);
  const tx = px(todayIdx);
  const area = curPts.length ? `${path(curPts)} L${tx.toFixed(2)} 100 L0 100 Z` : "";

  // The left-to-right reveal on mount, skipped for reduced motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    svgRef.current?.animate([{ clipPath: "inset(-12px 100% -12px -12px)" }, { clipPath: "inset(-12px)" }], { duration: 1000, delay: 150, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" });
  }, []);

  const idx = hover ?? todayIdx;
  const ax = px(idx);
  const hasCur = idx <= todayIdx;
  const pv = prev[Math.min(idx, prev.length - 1)] ?? 0;
  const cv = hasCur ? cur[idx] : undefined;
  const flip = ax > 60;
  const anchorY = py(cv ?? pv);
  const main = cv === undefined ? money(pv) : idx === todayIdx ? `${money(cv)} today` : `${money(cv)} on ${cm} ${idx + 1}`;
  const sub = cv === undefined ? `${pm} ${idx + 1}` : `${pm} ${idx + 1} was ${money(pv)}`;
  const xs = [1, 8, 15, 22, 29].filter((d) => d <= days);

  const at = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.round(((clientX - r.left) / (r.width || 1)) * (n - 1))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -n : e.key === "End" ? n : 0;
    if (!d) return;
    e.preventDefault();
    setHover(Math.min(n - 1, Math.max(0, idx + d)));
  };

  return (
    <>
      <div
        role="group"
        tabIndex={0}
        aria-label={`${curLabel}: ${money(cur[cur.length - 1] ?? 0)} so far. ${prevLabel}: ${money(prev[prev.length - 1] ?? 0)} for the month. ${main}; ${sub}. Use the arrow keys to move between days.`}
        onPointerMove={(e) => setHover(at(e.clientX, e.currentTarget))}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
        className="relative ml-12 mt-3 h-[200px] rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        {ticks.map((v, i) => (
          <div key={v} className={`absolute inset-x-0 h-0 border-t ${i ? "border-dashed border-border" : "border-solid border-border-strong"}`} style={{ bottom: `${(v / yMax) * 100}%` }}>
            <span className="absolute right-full top-0 mr-2.5 -translate-y-1/2 whitespace-nowrap text-[11px] text-faint">{v ? `$${v / 1000}k` : "$0"}</span>
          </div>
        ))}
        <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
          <path d={area} className="fill-chart opacity-[0.14]" />
          <path d={path(prev)} fill="none" className="stroke-faint" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={path(curPts)} fill="none" className="stroke-chart" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-border-strong" style={{ left: `${ax.toFixed(2)}%` }} />
        <span className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-faint bg-surface" style={{ left: `${ax.toFixed(2)}%`, top: `${py(pv).toFixed(2)}%` }} />
        {cv !== undefined && (
          <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart shadow-[0_0_0_3px_var(--surface)]" style={{ left: `${ax.toFixed(2)}%`, top: `${py(cv).toFixed(2)}%` }} />
        )}
        <div
          aria-hidden
          className={`pointer-events-none absolute z-[6] flex flex-col gap-px whitespace-nowrap rounded-[10px] border border-border bg-surface-2 px-2.5 py-1.5 ${flip ? "-translate-x-full" : ""}`}
          style={{ left: `calc(${ax.toFixed(2)}% ${flip ? "-" : "+"} 14px)`, top: `calc(${anchorY.toFixed(2)}% + 14px)` }}
        >
          <span className="num text-[13px] font-semibold">{main}</span>
          <span className="text-[11px] text-faint">{sub}</span>
        </div>
      </div>
      <div className="relative ml-12 h-[18px]" aria-hidden>
        {xs.map((d, k) => (
          <span key={d} className="absolute top-1 whitespace-nowrap text-[11px] text-faint" style={{ left: `${px(d - 1).toFixed(2)}%`, transform: `translateX(${k === 0 ? "0" : k === xs.length - 1 ? "-100%" : "-50%"})` }}>
            {cm} {d}
          </span>
        ))}
      </div>
      <Legend
        items={[
          { label: curLabel, kind: "solid" },
          { label: prevLabel, kind: "dashed" },
        ]}
      />
    </>
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
  const font = useFont();
  const options = useMemo(() => {
    const base = baseOf(font);
    const hidden = new Set(bars.filter((b) => b.showLabel === false).map((b) => b.label));
    return {
      ...base,
      data: bars,
      series: [
        {
          type: "bar",
          xKey: "label",
          yKey: "value",
          yName: "Spent",
          fill: BLUE,
          cornerRadius: 4,
          itemStyler: ({ datum }: { datum: Bar }) => ({ fillOpacity: datum.current ? 1 : 0.75 }),
          tooltip: { renderer: ({ datum }: { datum: Bar }) => ({ heading: datum.title, data: [{ label: "Spent", value: money(datum.value) }] }) },
        },
      ],
      axes: {
        x: { type: "category", position: "bottom", paddingInner: 0.25, label: { color: INK, fontSize: 11, autoRotate: false, avoidCollisions: false, formatter: ({ value }: { value: string }) => (hidden.has(value) ? "" : value) } },
        y: usdAxis,
      },
    } as unknown as AgChartOptions;
  }, [bars, font]);
  return (
    <div role="img" aria-label={aria} style={{ height: height + 24 }}>
      <AgCharts options={options} style={{ height: "100%" }} />
    </div>
  );
}

/** Donut with rounded, spaced segments and the total in the middle. */
export function Donut({ parts, size = 280, center, sub, aria }: { parts: { label: string; value: number; color: string }[]; size?: number; center: string; sub: string; aria: string }) {
  const font = useFont();
  const options = useMemo(
    () =>
      ({
        ...baseOf(font),
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        data: parts,
        series: [
          {
            type: "donut",
            angleKey: "value",
            legendItemKey: "label",
            fills: parts.map((p) => p.color),
            strokeWidth: 0,
            innerRadiusRatio: 0.84,
            cornerRadius: 6,
            sectorSpacing: 4,
            calloutLabel: { enabled: false },
            innerLabels: [
              { text: center, fontSize: 30, fontWeight: 600, color: "#ededed", spacing: 6 },
              { text: sub, fontSize: 13, color: INK },
            ],
            tooltip: { renderer: ({ datum }: { datum: { label: string; value: number } }) => ({ heading: datum.label, data: [{ label: "Spent", value: money(datum.value) }] }) },
          },
        ],
      }) as unknown as AgChartOptions,
    [parts, center, sub, font],
  );
  return (
    <div role="img" aria-label={aria} className="shrink-0" style={{ width: size, height: size }}>
      <AgCharts options={options} style={{ height: "100%" }} />
    </div>
  );
}

export interface SpendBar {
  /** X axis label under the bar ("" to hide). */
  x: string;
  title: string;
  /** undefined = no data yet (upcoming); drawn as a small stub. */
  value?: number;
  current?: boolean;
}

const fmtTick = (v: number) => (v >= 1000 ? `$${+(v / 1000).toFixed(2)}k` : `$${v}`);

/** Round the cap to a clean axis (four equal steps), ignoring bars far above the rest (they are drawn cut off). */
export function niceCap(values: number[]) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 100;
  const med = v[Math.floor(v.length / 2)];
  const ref = Math.max(...v.filter((x) => x <= med * 4), med);
  const mag = 10 ** Math.floor(Math.log10(ref * 1.05));
  return [1, 2, 4, 8, 10].map((m) => m * mag).find((c) => c >= ref * 1.05) ?? 10 * mag;
}

/** The Transactions "Spending" chart: dashed grid, hover tips, current bar solid, the rest faded. */
export function SpendBars({ bars, cap, maxBarWidth, aria }: { bars: SpendBar[]; cap: number; maxBarWidth: number; aria: string }) {
  const step = cap / 4;
  return (
    <>
      <div role="img" aria-label={aria} className="relative ml-10 mt-3.5 h-40">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`absolute inset-x-0 h-0 border-t ${i ? "border-dashed border-border" : "border-solid border-border-strong"}`} style={{ bottom: `${i * 25}%` }}>
            <span className="absolute right-full top-0 mr-2.5 -translate-y-1/2 whitespace-nowrap text-[11px] text-faint">{fmtTick(i * step)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-1">
          {bars.map((b, i) => {
            const past = b.value !== undefined;
            const capped = past && b.value! > cap;
            const pct = past ? (Math.min(b.value!, cap) / cap) * (capped ? 88 : 100) : 0;
            const tip = `${b.title}${past ? ` · ${money(b.value!)}` : " · upcoming"}`;
            return (
              <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                <span
                  className="pointer-events-none absolute left-1/2 z-[6] hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-2 px-[9px] py-[5px] text-xs font-medium shadow-[0_8px_24px_rgba(0,0,0,0.45)] group-hover:block"
                  style={{ bottom: `calc(${past ? `${pct.toFixed(1)}%` : "4px"} + 8px)` }}
                >
                  {tip}
                </span>
                <div
                  className={`w-full rounded-t rounded-b-[2px] ${past ? "bg-chart group-hover:!opacity-100 group-hover:brightness-[1.35]" : "bg-surface-3"}`}
                  style={{ maxWidth: maxBarWidth, height: past ? `${pct.toFixed(1)}%` : 4, opacity: past ? (b.current ? 1 : 0.3) : undefined }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-10 flex gap-1 pt-1.5" aria-hidden>
        {bars.map((b, i) => (
          <span key={i} className={`min-w-0 flex-1 whitespace-nowrap text-center text-[11px] ${b.current ? "font-semibold text-text" : "text-faint"}`}>
            {b.x}
          </span>
        ))}
      </div>
    </>
  );
}

/** Insights donut: thin rounded segments with gaps, total in the middle (SVG, no canvas). */
export function SvgDonut({ parts, size = 240, center, sub, aria }: { parts: { label: string; value: number; color: string }[]; size?: number; center: string; sub: string; aria: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const C = 2 * Math.PI * 43;
  const sw = 8;
  const gap = 2;
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((a, p) => a + (p.value / total) * C, 0));
  return (
    <div role="img" aria-label={aria} className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full">
        <g transform="rotate(-90 50 50)">
          {parts.map((p, i) => {
            const len = (p.value / total) * C;
            const dash = Math.max(len - sw - gap, 0.01);
            const o = -(starts[i] + sw / 2 + gap / 2);
            return <circle key={p.label} cx="50" cy="50" r="43" fill="none" stroke={p.color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${dash.toFixed(2)} ${C.toFixed(2)}`} strokeDashoffset={o.toFixed(2)} />;
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="num text-[30px] font-semibold">{center}</span>
        <span className="text-[13px] text-faint">{sub}</span>
      </div>
    </div>
  );
}
