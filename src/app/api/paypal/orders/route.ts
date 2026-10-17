import { connection } from "next/server";
import { z } from "zod";
import { SHIP_TO, priceOrder } from "@/lib/demo-user";
import { jsonError } from "@/lib/services/http";
import { verifyListing, type SignedListing } from "@/lib/services/linkReader";
import { paypal } from "@/lib/services/paypal";
import { limit } from "@/lib/services/limits";
import type { OrderLineItem } from "@/lib/services/contracts";

const Plain = z.object({ amount: z.number().positive().max(10_000), description: z.string().min(1).max(127) });

const Listing = z.object({
  url: z.string().max(2048),
  host: z.string().max(255),
  store: z.string().max(60),
  title: z.string().max(120),
  price: z.number().positive().max(2_000),
  imageUrl: z.string().max(2048).optional(),
  sig: z.string().max(128),
});
const Lines = z.object({
  lines: z
    .array(
      z.discriminatedUnion("kind", [
        // Catalog items are the Store Sync samples; their price is the app's, as before.
        z.object({ kind: z.literal("catalog"), name: z.string().min(1).max(127), unitPrice: z.number().positive().max(1_000), quantity: z.number().int().min(1).max(9), sku: z.string().max(60).optional() }),
        // Items built from a pasted link: the price must be the one this server read (signed), never the browser's.
        z.object({ kind: z.literal("link"), listing: Listing, quantity: z.number().int().min(1).max(9) }),
      ]),
    )
    .min(1)
    .max(12),
  description: z.string().min(1).max(127).optional(),
  /** One id per payment attempt: PayPal ignores a repeat, so a double click can't create two orders. */
  requestId: z.string().uuid().optional(),
});

// POST /api/paypal/orders -> Orders API createOrder
//   { amount, description }              a single amount (top-ups, agent payments)
//   { lines: [...], requestId? }         Essentials: line items with product link + photo, tax, shipping and the delivery address
// Live: { ok, orderId, status: "PAYER_ACTION_REQUIRED", approveUrl, total } (open approveUrl, then capture).
// Mock: { ok, orderId: "SIM-…", status: "CREATED" } with no approval step.
export async function POST(req: Request) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  const json = await req.json().catch(() => null);
  const origin = new URL(req.url).origin;
  const urls = { returnUrl: `${origin}/paypal/return?result=approved`, cancelUrl: `${origin}/paypal/return?result=cancelled` };

  const plain = Plain.safeParse(json);
  if (plain.success) {
    const r = await paypal.createOrder({ ...plain.data, ...urls });
    if (!r.ok) return jsonError(502, r.error ?? "Could not create the PayPal order", { mode: paypal.mode() });
    return Response.json({ ...r, mode: paypal.mode() });
  }

  const lines = Lines.safeParse(json);
  if (!lines.success) return jsonError(400, "amount and description (or order lines) are required");
  const items: OrderLineItem[] = [];
  for (const [i, l] of lines.data.lines.entries()) {
    if (l.kind === "catalog") {
      items.push({ name: l.name, unitPrice: l.unitPrice, quantity: l.quantity, sku: l.sku });
    } else {
      if (!verifyListing(l.listing as SignedListing)) return jsonError(400, `Line ${i + 1}: this listing wasn't read by Stella. Add it again from its link`);
      const { title, price, url, imageUrl, store, host } = l.listing;
      items.push({ name: title, unitPrice: price, quantity: l.quantity, description: `From ${store}`, sku: `LINK-${host}`.slice(0, 60), url, ...(imageUrl ? { imageUrl } : {}) });
    }
  }
  const sub = items.reduce((a, i) => a + Math.round(i.unitPrice * 100) * i.quantity, 0) / 100;
  const price = priceOrder(sub);
  const description = lines.data.description ?? `Stella · ${items.map((i) => i.name).join(", ")}`.slice(0, 127);
  const requestId = lines.data.requestId;
  const r = await paypal.createOrder({
    amount: price.total,
    description,
    ...urls,
    details: { items, shipping: price.ship, tax: price.tax, shipTo: { ...SHIP_TO }, ...(requestId ? { requestId, invoiceId: `STELLA-${requestId.slice(0, 8).toUpperCase()}` } : {}) },
  });
  if (!r.ok) return jsonError(502, r.error ?? "Could not create the PayPal order", { mode: paypal.mode() });
  return Response.json({ ...r, total: price.total, mode: paypal.mode() });
}
