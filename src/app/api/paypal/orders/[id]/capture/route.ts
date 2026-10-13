import { connection } from "next/server";
import { jsonError } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { limit } from "@/lib/services/limits";

// POST /api/paypal/orders/:id/capture -> Orders API captureOrder
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  const { id } = await ctx.params;
  if (!/^[A-Z0-9-]{6,40}$/i.test(id)) return jsonError(400, "Invalid order id");
  const r = await paypal.captureOrder(id);
  if (!r.ok) return jsonError(422, r.error ?? "The order was not approved yet", { mode: paypal.mode() });
  return Response.json({ ...r, mode: paypal.mode() });
}
