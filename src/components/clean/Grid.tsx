"use client";

// AG Grid (Community) themed to the Clean tables: no borders or zebra rows,
// faint 13px headers, roomy 66px rows, hover/selection in the Clean tokens.

import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export const cleanGridTheme = themeQuartz.withParams({
  backgroundColor: "#0a0a0a",
  foregroundColor: "#ededed",
  browserColorScheme: "dark",
  borderColor: "transparent",
  headerBackgroundColor: "#0a0a0a",
  headerTextColor: "#8a8a8a",
  headerFontSize: 13,
  headerFontWeight: 400,
  headerHeight: 40,
  oddRowBackgroundColor: "#0a0a0a",
  rowHoverColor: "rgba(255,255,255,0.03)",
  selectedRowBackgroundColor: "rgba(0,112,224,0.16)",
  accentColor: "#52a8ff",
  fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  fontSize: 15,
  rowHeight: 66,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  columnBorder: false,
  rowBorder: false,
  headerRowBorder: false,
  cellHorizontalPadding: 20,
  inputBackgroundColor: "#1d1e22",
  menuBackgroundColor: "#1d1e22",
  iconSize: 14,
});

/** An auto-height grid that sits inside a Clean card. */
export function Grid<T>(props: AgGridReactProps<T>) {
  return (
    <div className="w-full">
      <AgGridReact<T>
        theme={cleanGridTheme}
        domLayout="autoHeight"
        suppressCellFocus
        suppressMovableColumns
        animateRows={false}
        defaultColDef={{ cellStyle: { display: "flex", alignItems: "center" }, ...props.defaultColDef }}
        {...props}
      />
    </div>
  );
}
