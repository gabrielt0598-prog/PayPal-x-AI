import { z } from "zod";
import { parseBody } from "@/lib/services/http";
import { jev } from "@/lib/services/jev";

const Body = z.object({
  merchant: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).default(""),
  amount: z.number().finite(),
});

// POST /api/jev/categorize { merchant, description, amount } -> { category, confidence, mode }
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  return Response.json(await jev.categorizeTransaction(body.data));
}
