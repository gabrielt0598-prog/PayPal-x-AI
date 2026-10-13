"use client";

// App frame for the Final design: the page fills the window, the bottom dock
// floats over it, and the PayPal AI panel opens from the right over the page
// (the page makes room for it). The page area is a size container, so grids
// stack to one column whenever the content gets narrow.

import type { ComponentType, CSSProperties } from "react";
import { Assistant } from "@/components/assistant/Assistant";
import { useAssistantUI } from "@/components/state/AppProviders";
import { CleanStateProvider, useClean, type PageId } from "./AppState";
import { useEffect, useRef, useState } from "react";
import { Dock, type DockBubble } from "./Dock";
import { BudgetPage } from "./pages/Budget";
import { AccountPage } from "./pages/Account";
import { WalletPage } from "./pages/Wallet";
import { EssentialsPage } from "./pages/Essentials";
import { HomePage } from "./pages/Home";
import { InsightsPage } from "./pages/Insights";
import { OffersPage } from "./pages/Offers";
import { RecurringPage } from "./pages/Recurring";
import { RewardsPage } from "./pages/Rewards";
import { TransactionsPage } from "./pages/Transactions";

const PAGE: Record<PageId, ComponentType> = {
  home: HomePage,
  wallet: WalletPage,
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
  const { open: aiOpen, closeAssistant } = useAssistantUI();
  const Current = PAGE[page];
  const [bubble, setBubble] = useState<DockBubble | null>(null);
  const closeRef = useRef(closeAssistant);
  useEffect(() => {
    closeRef.current = closeAssistant;
  }, [closeAssistant]);

  // Alerts arrive as a chat bubble above the PayPal AI button. Pressing it opens
  // the panel and starts the conversation. Any part of the app can raise one with
  //   window.dispatchEvent(new CustomEvent("pfm:alert", { detail: { title, body, prompt } }))
  // and `/?alert=suspicious-charge` raises the demo alert for walkthroughs.
  useEffect(() => {
    const onAlert = (e: Event) => setBubble((e as CustomEvent<DockBubble>).detail);
    window.addEventListener("pfm:alert", onAlert);
    if (new URLSearchParams(window.location.search).get("alert") === "suspicious-charge") {
      // The alert bubble sits above the AI button, so the demo starts with the panel closed.
      closeRef.current();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- demo alert read from the URL after mount
      setBubble({
        title: "Suspicious charge · $450.00",
        body: "Voltmart Online charged your Debit Card ••4821. Was this you?",
        prompt: "That wasn’t me. Voltmart Online charged my Debit Card $450.00. What can you do?",
      });
    }
    return () => window.removeEventListener("pfm:alert", onAlert);
  }, []);

  // --sec-gap is the space between page sections: 32px, or 16px while the AI
  // panel covers the right of the page.
  return (
    <div className="relative h-dvh min-h-[560px] w-full overflow-hidden">
      <main
        key={page}
        style={{ "--sec-gap": aiOpen ? "16px" : "32px" } as CSSProperties}
        className={`@container h-full min-w-0 overflow-y-auto px-4 pb-28 pt-7 sm:px-20 ${aiOpen ? "lg:pr-[396px]" : ""}`}
      >
        <Current />
      </main>
      <Assistant />
      <Dock bubble={bubble} onBubble={() => setBubble(null)} />
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
