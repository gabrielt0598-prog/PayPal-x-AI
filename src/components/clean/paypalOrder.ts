// Client side of PayPal Orders API payments: create the order, get the payer's approval, capture it.
// Live mode opens PayPal's approval page in a popup (the sandbox buyer logs in there); mock mode simulates the approval.

export interface OrderIds {
  orderId: string;
  captureId?: string;
  /** True when PayPal credentials aren't configured and the order is simulated. */
  simulated: boolean;
}

export type OrderStage = "creating" | "approving" | "capturing";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** Opens PayPal's approval page and resolves when the payer approves; rejects if they cancel or close it. */
function approve(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, "paypal-approval", "width=480,height=720");
    if (!popup) return reject(new Error("Allow pop-ups to approve the payment with PayPal"));
    const done = (fn: () => void) => {
      window.removeEventListener("message", onMessage);
      clearInterval(poll);
      fn();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== "paypal-approval") return;
      done(e.data.result === "approved" ? resolve : () => reject(new Error("The payment was cancelled")));
    };
    const poll = setInterval(() => {
      if (popup.closed) done(() => reject(new Error("The PayPal window was closed before approving")));
    }, 500);
    window.addEventListener("message", onMessage);
  });
}

/**
 * Pays `amount` USD through the Orders API. `onStage` fires as each step starts; `onOrder` fires once the order exists
 * (with its id) so the UI can show it while the payer approves.
 */
export async function payWithPayPal(input: {
  amount: number;
  description: string;
  onStage?: (stage: OrderStage) => void;
  onOrder?: (ids: OrderIds) => void;
}): Promise<OrderIds> {
  input.onStage?.("creating");
  const order = await post<{ orderId: string; approveUrl?: string }>("/api/paypal/orders", { amount: input.amount, description: input.description });
  const simulated = !order.approveUrl;
  input.onOrder?.({ orderId: order.orderId, simulated });
  input.onStage?.("approving");
  if (order.approveUrl) await approve(order.approveUrl);
  else await new Promise((r) => setTimeout(r, 900));
  input.onStage?.("capturing");
  const cap = await post<{ captureId?: string }>(`/api/paypal/orders/${encodeURIComponent(order.orderId)}/capture`);
  return { orderId: order.orderId, captureId: cap.captureId, simulated };
}
