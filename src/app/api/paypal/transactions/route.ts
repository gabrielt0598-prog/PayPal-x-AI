import { connection } from "next/server";
import { z } from "zod";
import { jsonError, validate } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { limit } from "@/lib/services/limits";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const Query = z.object({ from: date.optional(), to: date.optional() });

// GET /api/paypal/transactions?from=2026-09-01&to=2026-10-07 -> Transaction[]
export async function GET(req: Request) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  const sp = new URL(req.url).searchParams;
  const v = validate(Query, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  if ("response" in v) return v.response;
  try {
    return Response.json(await paypal.listTransactions(v.data));
  } catch {
    return jsonError(502, "Could not load transactions");
  }
}
