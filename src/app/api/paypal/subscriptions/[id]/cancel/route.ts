import { z } from "zod";
import { jsonError, parseBody } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { limit } from "@/lib/services/limits";

const Body = z.object({ reason: z.string().trim().min(1).max(128).default("Cancelled by user") });

// POST /api/paypal/subscriptions/:id/cancel { reason } -> { ok, channel, note?, mode }
// `id` is a store recurring id (sub_disney) in mock mode, or a PayPal subscription id (I-XXXX) in live mode.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  const { id } = await ctx.params;
  const body = await parseBody(req, Body.default({ reason: "Cancelled by user" }));
  if ("response" in body) return body.response;
  const result = await paypal.cancelSubscription(id, body.data.reason);
  if (!result.ok) return jsonError(result.error?.startsWith("No recurring") ? 404 : 422, result.error ?? "Cancellation failed", { mode: paypal.mode() });
  return Response.json({ ...result, mode: paypal.mode() });
}
