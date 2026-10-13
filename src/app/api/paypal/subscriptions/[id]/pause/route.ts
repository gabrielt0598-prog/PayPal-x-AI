import { connection } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { limit } from "@/lib/services/limits";

const Body = z.object({ paused: z.boolean(), reason: z.string().max(128).optional() });

// POST /api/paypal/subscriptions/:id/pause { paused } -> Subscriptions API suspend / activate
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const r = await paypal.setSubscriptionPaused(id, body.data.paused, body.data.reason ?? (body.data.paused ? "Paused by user" : "Resumed by user"));
  if (!r.ok) return jsonError(422, r.error ?? "Could not change the subscription", { mode: paypal.mode() });
  return Response.json({ ...r, mode: paypal.mode() });
}
