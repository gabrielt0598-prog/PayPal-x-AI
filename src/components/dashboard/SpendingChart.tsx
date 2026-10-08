"use client";

import { useMemo, useState } from "react";
import { AgCharts } from "ag-charts-react";
import { AllCommunityModule, ModuleRegistry, type AgChartOptions } from "ag-charts-community";
import { useFinance } from "@/components/state/AppProviders";
import { formatUSD, projectAnnual, spendByDay, spendByMonth } from "@/lib/finance";
import type { FinanceState } from "@/lib/types";
import { Card, CardHeader, Segmented, Skeleton } from "./ui";
import { compactUSD, dateOnly, shortDate } from "./utils";

ModuleRegistry.registerModules([AllCommunityModule]);

type View = "day" | "month" | "year";

// Series colours (checked against #0f0f12): spend = PayPal blue, income = green, reference = slate.
const SPEND = "#3d8bff";
const INCOME = "#3ecf8e";
const REF = "#8b8b94";
const INK = "#8b8b94";
const GRID = "rgba(255,255,255,0.06)";

const baseOptions = {
  background: { visible: false },
  padding: { top: 8, right: 8, bottom: 0, left: 0 },
  legend: { enabled: false },
  theme: {
    baseTheme: "ag-default-dark" as const,
    overrides: {
      common: {
        axes: {
          category: { line: { enabled: false }, tick: { enabled: false }, label: { color: INK, fontSize: 11 } },
          number: {
            line: { enabled: false },
            tick: { enabled: false },
            label: { color: INK, fontSize: 11 },
            gridLine: { style: [{ stroke: GRID, lineDash: [] }] },
          },
        },
      },
    },
  },
};

const usdAxis = { type: "number" as const, label: { formatter: ({ value }: { value: number }) => compactUSD(value) } };

function buildOptions(view: View, state: FinanceState): AgChartOptions {
  const tx = state.transactions;
  if (view === "day") {
    const data = spendByDay(tx, state.asOf, 30);
    return {
      ...baseOptions,
      data,
      series: [
        {
          type: "bar",
          xKey: "label",
          yKey: "spend",
          yName: "Spent",
          fill: SPEND,
          cornerRadius: 3,
          tooltip: {
            renderer: ({ datum }: { datum: Record<string, unknown> }) => ({ heading: String(datum.label), data: [{ label: "Spent", value: formatUSD(datum.spend as number) }] }),
          },
        },
      ],
      axes: [
        { type: "category", position: "bottom", label: { autoRotate: false, avoidCollisions: true } },
        { ...usdAxis, position: "left" },
      ],
    } as unknown as AgChartOptions;
  }
  if (view === "month") {
    const months = spendByMonth(tx);
    const data = months.map((m, i) => ({
      ...m,
      label: i === 0 || i === months.length - 1 ? `${m.label} (partial)` : m.label,
    }));
    return {
      ...baseOptions,
      legend: { enabled: true, position: "top", item: { label: { color: INK, fontSize: 11 }, marker: { size: 8 } } },
      data,
      series: [
        { type: "bar", xKey: "label", yKey: "spend", yName: "Spent", fill: SPEND, cornerRadius: 3, stroke: "transparent" },
        { type: "bar", xKey: "label", yKey: "income", yName: "Income", fill: INCOME, cornerRadius: 3, stroke: "transparent" },
      ].map((s) => ({
        ...s,
        tooltip: {
          renderer: ({ datum, yKey, yName }: { datum: Record<string, unknown>; yKey: string; yName?: string }) => ({
            heading: String(datum.label),
            data: [{ label: yName ?? yKey, value: formatUSD(datum[yKey] as number) }],
          }),
        },
      })),
      axes: [
        { type: "category", position: "bottom", label: { autoRotate: false } },
        { ...usdAxis, position: "left" },
      ],
    } as unknown as AgChartOptions;
  }
  const proj = projectAnnual(tx);
  const observed = spendByMonth(tx).reduce((a, m) => a + m.spend, 0);
  const data = [
    { label: "Observed spend", value: observed, color: SPEND },
    { label: "Projected annual spend", value: proj.annualSpend, color: "#7fb2ff" },
    { label: "Annual salary (gross)", value: state.userProfile.annualSalary, color: REF },
  ];
  return {
    ...baseOptions,
    data,
    series: [
      {
        type: "bar",
        direction: "horizontal",
        xKey: "label",
        yKey: "value",
        cornerRadius: 4,
        itemStyler: ({ datum }: { datum: { color: string } }) => ({ fill: datum.color }),
        label: { enabled: true, color: "#ededf0", fontSize: 12, formatter: ({ value }: { value: number }) => formatUSD(value) },
        tooltip: {
          renderer: ({ datum }: { datum: { label: string; value: number } }) => ({
            heading: datum.label,
            data: [{ label: "Amount", value: formatUSD(datum.value) }],
          }),
        },
      },
    ],
    axes: [
      { type: "category", position: "left", label: { color: "#ededf0", fontSize: 12 } },
      { ...usdAxis, position: "bottom", max: Math.max(proj.annualSpend, state.userProfile.annualSalary) * 1.25 },
    ],
  } as unknown as AgChartOptions;
}

export function SpendingChart() {
  const { state, loading } = useFinance();
  const [view, setView] = useState<View>("day");
  const options = useMemo(() => (state ? buildOptions(view, state) : null), [state, view]);

  const caption = useMemo(() => {
    if (!state) return "";
    const first = state.transactions.reduce((m, t) => (t.date < m ? t.date : m), state.asOf);
    const p = projectAnnual(state.transactions);
    if (view === "day") return "Daily spending over the last 30 days. Transfers and auto-reloads are excluded.";
    if (view === "month") return "Spending versus income per month. The first and last months cover only part of the month.";
    const pct = Math.round((p.annualSpend / state.userProfile.annualSalary) * 100);
    return `Observed spend since ${shortDate(dateOnly(first))}, projected from the monthly run-rate over full months: ${formatUSD(p.annualSpend)} a year, about ${pct}% of your ${formatUSD(state.userProfile.annualSalary)} salary.`;
  }, [state, view]);

  return (
    <Card id="insights">
      <CardHeader
        title="Spending"
        subtitle={view === "year" ? "This year vs salary" : view === "month" ? "Spend vs income by month" : "Last 30 days"}
        right={
          <Segmented<View>
            label="Chart period"
            value={view}
            onChange={setView}
            options={[
              { value: "day", label: "Day" },
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
            ]}
          />
        }
      />
      {loading || !options ? (
        <Skeleton className="h-[280px] w-full" />
      ) : (
        <div className="h-[280px] w-full">
          <AgCharts options={options} style={{ height: "100%", width: "100%" }} />
        </div>
      )}
      <p className="mt-3 text-xs text-muted">{caption}</p>
    </Card>
  );
}
