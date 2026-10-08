import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getState } from "@/lib/store";
import { isMerchantStep, merchantPageParts } from "@/lib/services/merchant-sites";

// Sandbox merchant site: a fake account / cancellation flow for one mock subscription, served for humans and
// (when PUBLIC_BASE_URL points at a tunnel) for the Kernel cloud browser. Steps: ?step=account|cancel|confirm|cancelled.
// It never changes any state; the real cancellation record is written by the assistant / /api/kernel/cancel.

export const metadata: Metadata = { title: "Sandbox merchant account", robots: { index: false, follow: false } };

async function MerchantPage({
  params,
  searchParams,
}: {
  params: Promise<{ recurringId: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { recurringId } = await params;
  const { step: rawStep } = await searchParams;
  const sub = getState().recurring.find((r) => r.id === recurringId && r.cancelChannel === "kernel_browser");
  if (!sub) notFound();
  const stepParam = Array.isArray(rawStep) ? rawStep[0] : rawStep;
  const step = isMerchantStep(stepParam) ? stepParam : "account";
  const p = merchantPageParts(sub, step, { inline: false });
  return (
    // Fixed full-screen layer so the app's global styles/shell don't leak into the fake merchant page.
    <div style={{ position: "fixed", inset: 0, overflow: "auto", zIndex: 50, background: "#f4f5f7", colorScheme: "light" }}>
      <title>{p.title}</title>
      <style dangerouslySetInnerHTML={{ __html: p.css }} />
      <div dangerouslySetInnerHTML={{ __html: p.body }} />
    </div>
  );
}

export default function Page(props: {
  params: Promise<{ recurringId: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  return (
    <Suspense fallback={null}>
      <MerchantPage {...props} />
    </Suspense>
  );
}
