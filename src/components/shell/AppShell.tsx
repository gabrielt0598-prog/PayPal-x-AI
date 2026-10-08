"use client";

import type { ReactNode } from "react";
import { MobileDock } from "./MobileDock";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useActiveSection } from "./useActiveSection";

export function AppShell({ children }: { children: ReactNode }) {
  const [active, setActive] = useActiveSection();
  return (
    <div className="min-h-screen">
      <Sidebar active={active} onNavigate={setActive} />
      <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pl-[calc(15rem+1.5rem)] lg:pr-6">
        <TopBar />
        {children}
      </main>
      <MobileDock active={active} onNavigate={setActive} />
    </div>
  );
}
