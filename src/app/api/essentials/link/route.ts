import { connection } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/services/http";
import { limit } from "@/lib/services/limits";
import { readProductLink } from "@/lib/services/linkReader";

const Body = z.object({ url: z.string().trim().min(8).max(2000) });

// POST /api/essentials/link { url } -> { listing }  (title, price, photo, store; HMAC-signed so the price can't be edited)
export async function POST(req: Request) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError(400, "Paste a product link");
  const r = await readProductLink(body.data.url, { allowHost: new URL(req.url).host });
  if (!r.ok) return jsonError(422, r.error);
  return Response.json({ listing: r.listing });
}
