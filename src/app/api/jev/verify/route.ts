import { z } from "zod";
import { parseBody } from "@/lib/services/http";
import { jev } from "@/lib/services/jev";

const Body = z.object({
  reply: z.string().min(1).max(20_000),
  groundTruth: z.string().max(200_000),
});

// POST /api/jev/verify { reply, groundTruth } -> GuardrailResult
// { verdict: "pass"|"block", unsupportedFigures, unknownTransactionIds, hallucinationProbability?, mode }
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  return Response.json(await jev.verifyReply(body.data));
}
