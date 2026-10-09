"use client";

// Charts for the Clean design, rendered with AG Charts (Community) and themed
// to the Clean tokens: transparent background, faint labels, hairline grid,
// PayPal blue for the current period.

import { useMemo, useState } from "react";
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

/** Cumulative spend this month (area) vs the whole of last month (dashed). */
export function CompareLine({ cur, prev, days, today, curLabel, prevLabel }: { cur: number[]; prev: number[]; days: number; today: number; curLabel: string; prevLabel: string }) {
  const font = useFont();
  const options = useMemo(() => {
    const base = baseOf(font);
    const data = Array.from({ length: days }, (_, i) => ({ day: i + 1, cur: i < cur.length ? cur[i] : undefined, prev: prev[i] }));
    const tip = (label: string) => ({
      renderer: ({ datum, yKey }: { datum: Record<string, number>; yKey: string }) => ({ heading: `Day ${datum.day}`, data: [{ label, value: money(datum[yKey]) }] }),
    });
    return {
      ...base,
      data,
      series: [
        { type: "line", xKey: "day", yKey: "prev", yName: prevLabel, stroke: INK, strokeWidth: 1.5, lineDash: [4, 4], marker: { enabled: false }, tooltip: tip(prevLabel) },
        {
          type: "area",
          xKey: "day",
          yKey: "cur",
          yName: curLabel,
          fill: BLUE,
          fillOpacity: 0.14,
          stroke: BLUE,
          strokeWidth: 2.5,
          marker: { enabled: true, size: 0, itemStyler: ({ datum }: { datum: { day: number } }) => (datum.day === today ? { size: 10, fill: BLUE, stroke: "#0a0a0a", strokeWidth: 2 } : { size: 0 }) },
          tooltip: tip(curLabel),
        },
      ],
      axes: {
        x: { type: "number", position: "bottom", min: 1, max: days, interval: { values: [1, 8, 15, 22, 29].filter((d) => d <= days) }, label: { color: INK, fontSize: 11 }, gridLine: { enabled: false } },
        y: usdAxis,
      },
    } as unknown as AgChartOptions;
  }, [cur, prev, days, today, curLabel, prevLabel, font]);

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`${curLabel}: ${money(cur[cur.length - 1] ?? 0)} so far. ${prevLabel}: ${money(prev[prev.length - 1] ?? 0)} for the month.`} className="h-[230px]">
        <AgCharts options={options} style={{ height: "100%" }} />
      </div>
      <Legend
        items={[
          { label: curLabel, kind: "solid" },
          { label: prevLabel, kind: "dashed" },
        ]}
      />
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
