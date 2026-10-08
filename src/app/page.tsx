import { Assistant } from "@/components/assistant/Assistant";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { AppShell } from "@/components/shell";

export default function Home() {
  return (
    <>
      <AppShell>
        <Dashboard />
      </AppShell>
      <Assistant />
    </>
  );
}
