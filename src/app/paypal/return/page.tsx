"use client";

// Landing page for the PayPal approval popup. It tells the app window how the payer answered, then closes itself.

import { useEffect } from "react";

export default function PayPalReturn() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("result") === "approved" ? "approved" : "cancelled";
    window.opener?.postMessage({ source: "paypal-approval", result, orderId: q.get("token") }, window.location.origin);
    window.close();
  }, []);
  return <main className="flex min-h-dvh items-center justify-center text-sm text-muted">Returning to PayPal AI…</main>;
}
