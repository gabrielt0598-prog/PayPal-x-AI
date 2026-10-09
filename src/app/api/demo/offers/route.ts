import { z } from "zod";
import { jsonError, parseBody } from "@/lib/services/http";
import { setOfferAdded } from "@/lib/store";

const Body = z.object({ offerId: z.string().trim().min(1).max(64), added: z.boolean() });

// POST /api/demo/offers { offerId, added } -> Offer
// Saves an offer to the account (Added) or removes it, before any matching purchase.
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const r = setOfferAdded(body.data.offerId, body.data.added);
  return r.ok ? Response.json(r.value) : jsonError(409, r.error);
}
