"use client";

// App frame for the Final design: the page fills the window, the bottom dock
// floats over it, and the PayPal AI panel opens from the right over the page
// (the page makes room for it). The page area is a size container, so grids
// stack to one column whenever the content gets narrow.

import type { ComponentType } from "react";
import { Assistant } from "@/components/assistant/Assistant";
import { useAssistantUI } from "@/components/state/AppProviders";
import { CleanStateProvider, useClean, type PageId } from "./AppState";
import { Dock } from "./Dock";
import { BudgetPage } from "./pages/Budget";
import { AccountPage } from "./pages/Account";
import { EssentialsPage } from "./pages/Essentials";
import { HomePage } from "./pages/Home";
import { InsightsPage } from "./pages/Insights";
import { OffersPage } from "./pages/Offers";
import { RecurringPage } from "./pages/Recurring";
import { RewardsPage } from "./pages/Rewards";
import { TransactionsPage } from "./pages/Transactions";

const PAGE: Record<PageId, ComponentType> = {
  home: HomePage,
  transactions: TransactionsPage,
  budget: BudgetPage,
  recurring: RecurringPage,
  essentials: EssentialsPage,
  offers: OffersPage,
  rewards: RewardsPage,
  insights: InsightsPage,
  account: AccountPage,
};

function Frame() {
  const { page } = useClean();
  const { open: aiOpen } = useAssistantUI();
  const Current = PAGE[page];
  // --sec-gap is the space between page sections: 32px, or 16px while the AI
  // panel covers the right of the page.
  return (
    <div className="relative h-dvh min-h-[560px] w-full overflow-hidden">
      <main
        key={page}
        style={{ "--sec-gap": aiOpen ? "16px" : "32px" } as React.CSSProperties}
        className={`@container h-full min-w-0 overflow-y-auto px-4 pb-28 pt-7 sm:px-20 ${aiOpen ? "lg:pr-[396px]" : ""}`}
      >
        <Current />
      </main>
      <Assistant />
      <Dock />
    </div>
  );
}

export function CleanApp() {
  return (
    <CleanStateProvider>
      <Frame />
    </CleanStateProvider>
  );
}
