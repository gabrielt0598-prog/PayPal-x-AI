"use client";

// App frame for the Clean design: docked side panel | PayPal AI drawer | page.
// The page area is a size container, so grids stack to one column whenever the
// content gets narrow (e.g. side panel and AI drawer both open).

import type { ComponentType } from "react";
import { Assistant } from "@/components/assistant/Assistant";
import { CleanStateProvider, useClean, type PageId } from "./AppState";
import { MobileTabs, Rail } from "./Rail";
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
  recurring: RecurringPage,
  essentials: EssentialsPage,
  offers: OffersPage,
  rewards: RewardsPage,
  insights: InsightsPage,
  account: AccountPage,
};

function Frame() {
  const { page } = useClean();
  const Current = PAGE[page];
  return (
    <div className="flex h-dvh min-h-[560px] w-full overflow-hidden">
      <Rail />
      <Assistant />
      <main key={page} className="@container min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-8 lg:pb-8 lg:pt-7">
        <Current />
      </main>
      <MobileTabs />
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
