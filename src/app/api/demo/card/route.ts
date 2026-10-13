import { z } from "zod";
import { parseBody } from "@/lib/services/http";
import { setCardFrozen } from "@/lib/store";

const Body = z.object({ frozen: z.boolean() });

// POST /api/demo/card { frozen } -> { frozen, last4 }
// Mock card control behind the Freeze card button (PayPal has no public freeze API).
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  return Response.json(setCardFrozen(body.data.frozen));
}
