"use client";

import { BalanceHero } from "./BalanceHero";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { IntegrationsStatus } from "./IntegrationsStatus";
import { KpiRow } from "./KpiRow";
import { OffersWidget } from "./OffersWidget";
import { SpendingChart } from "./SpendingChart";
import { SubscriptionsSection } from "./SubscriptionsSection";
import { TransactionsGrid } from "./TransactionsGrid";
import { UpcomingCharges } from "./UpcomingCharges";

export function Dashboard() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <BalanceHero />
          <KpiRow />
          <SpendingChart />
          <TransactionsGrid />
        </div>
        <aside className="min-w-0 space-y-4" aria-label="Widgets">
          <OffersWidget />
          <UpcomingCharges />
          <CategoryBreakdown />
          <IntegrationsStatus />
        </aside>
      </div>
      <SubscriptionsSection />
    </div>
  );
}
