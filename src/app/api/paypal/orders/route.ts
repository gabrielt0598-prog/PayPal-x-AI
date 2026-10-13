import { connection } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { limit } from "@/lib/services/limits";

const Body = z.object({ amount: z.number().positive().max(10_000), description: z.string().min(1).max(127) });

// POST /api/paypal/orders { amount, description } -> Orders API createOrder
// Live: { ok, orderId, status: "PAYER_ACTION_REQUIRED", approveUrl } (open approveUrl, then capture).
// Mock: { ok, orderId: "SIM-…", status: "CREATED" } with no approval step.
export async function POST(req: Request) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError(400, "amount and description are required");
  const origin = new URL(req.url).origin;
  const r = await paypal.createOrder({ ...body.data, returnUrl: `${origin}/paypal/return?result=approved`, cancelUrl: `${origin}/paypal/return?result=cancelled` });
  if (!r.ok) return jsonError(502, r.error ?? "Could not create the PayPal order", { mode: paypal.mode() });
  return Response.json({ ...r, mode: paypal.mode() });
}
