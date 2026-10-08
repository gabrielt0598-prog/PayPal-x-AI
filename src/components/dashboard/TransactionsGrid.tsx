"use client";

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { Search } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import { formatUSD } from "@/lib/finance";
import type { Category, Transaction } from "@/lib/types";
import { Avatar, Card, CardHeader, Chip, Skeleton, cx } from "./ui";
import { METHOD_LABEL } from "./utils";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: "#0f0f12",
  foregroundColor: "#ededf0",
  browserColorScheme: "dark",
  borderColor: "rgba(255,255,255,0.06)",
  headerBackgroundColor: "#0f0f12",
  headerTextColor: "#8b8b94",
  headerFontSize: 11,
  headerFontWeight: 500,
  oddRowBackgroundColor: "#0f0f12",
  rowHoverColor: "#151519",
  accentColor: "#3d8bff",
  fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  rowHeight: 52,
  headerHeight: 38,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  columnBorder: false,
  rowBorder: { style: "solid", color: "rgba(255,255,255,0.06)" },
  headerRowBorder: { style: "solid", color: "rgba(255,255,255,0.10)" },
  inputBackgroundColor: "#151519",
  selectedRowBackgroundColor: "rgba(61,139,255,0.10)",
});

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function MerchantCell({ data }: ICellRendererParams<Transaction>) {
  if (!data) return null;
  return (
    <div className="flex h-full items-center gap-3">
      <Avatar name={data.merchant} size={30} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{data.merchant}</span>
          {data.appliedOfferId && <Chip tone="positive">Offer applied</Chip>}
        </div>
        <div className="truncate text-[11px] text-muted">{data.description}</div>
      </div>
    </div>
  );
}

function CategoryCell({ value }: ICellRendererParams<Transaction, Category>) {
  return (
    <span className="inline-flex h-full items-center">
      <Chip>{value}</Chip>
    </span>
  );
}

function StatusCell({ value }: ICellRendererParams<Transaction, Transaction["status"]>) {
  return (
    <span className="inline-flex h-full items-center">
      {value === "pending" ? <Chip tone="warning">Pending</Chip> : <span className="text-xs text-faint">Completed</span>}
    </span>
  );
}

export function TransactionsGrid() {
  const { state, loading } = useFinance();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");

  const rows = useMemo(
    () => (state ? [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [state],
  );
  const filtered = useMemo(() => (category === "All" ? rows : rows.filter((t) => t.category === category)), [rows, category]);
  const categories = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const t of rows) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [rows]);

  const last4 = state?.userProfile.card.last4 ?? "";
  const columns = useMemo<ColDef<Transaction>[]>(
    () => [
      {
        field: "date",
        headerName: "Date",
        width: 120,
        sort: "desc",
        valueFormatter: (p) => (p.value ? dateFmt.format(new Date(p.value as string)) : ""),
        cellRenderer: (p: ICellRendererParams<Transaction>) => (
          <div className="leading-tight">
            <div>{p.value ? dateFmt.format(new Date(p.value as string)) : ""}</div>
            <div className="text-[11px] text-faint">{p.value ? timeFmt.format(new Date(p.value as string)) : ""}</div>
          </div>
        ),
      },
      { field: "merchant", headerName: "Merchant", flex: 2, minWidth: 220, cellRenderer: MerchantCell, getQuickFilterText: (p) => `${p.data?.merchant} ${p.data?.description}` },
      { field: "category", headerName: "Category", width: 150, cellRenderer: CategoryCell },
      {
        field: "method",
        headerName: "Method",
        width: 150,
        valueFormatter: (p) => (p.value === "paypal_debit_card" ? `Card ••${last4}` : METHOD_LABEL[p.value as keyof typeof METHOD_LABEL] ?? String(p.value)),
        cellClass: "text-muted",
      },
      { field: "status", headerName: "Status", width: 120, cellRenderer: StatusCell },
      {
        field: "amount",
        headerName: "Amount",
        width: 130,
        type: "rightAligned",
        valueFormatter: (p) => `${(p.value as number) > 0 ? "+" : ""}${formatUSD(p.value as number).replace("-", "−")}`,
        cellClass: (p) => cx("num font-medium", (p.value as number) > 0 ? "text-positive" : "text-text"),
      },
      {
        field: "balanceAfter",
        headerName: "Balance after",
        width: 140,
        type: "rightAligned",
        valueFormatter: (p) => formatUSD(p.value as number),
        cellClass: "num text-muted",
      },
    ],
    [last4],
  );

  return (
    <Card id="transactions" className="!p-0">
      <div className="p-4 pb-3 sm:p-5 sm:pb-3">
        <CardHeader
          title="Transactions"
          subtitle={state ? `${filtered.length} of ${rows.length} shown` : undefined}
          right={
            <label className="relative block w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search merchant or note"
                aria-label="Search transactions"
                className="w-full rounded-full border border-border bg-surface-2 py-2 pl-9 pr-3 text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
          }
        />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by category">
          {(["All", ...categories] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cx(
                "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                category === c ? "border-transparent bg-text text-bg" : "border-border text-muted hover:border-border-strong hover:text-text",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {loading || !state ? (
        <div className="space-y-2 p-5 pt-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="h-[560px] w-full overflow-x-auto">
          <div className="h-full min-w-[860px]">
            <AgGridReact<Transaction>
              theme={gridTheme}
              rowData={filtered}
              columnDefs={columns}
              quickFilterText={query}
              getRowId={(p) => p.data.id}
              defaultColDef={{ sortable: true, resizable: false, suppressMovable: true }}
              animateRows
              suppressCellFocus
              overlayNoRowsTemplate="No matching transactions"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
