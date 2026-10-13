import { z } from "zod";
import { parseBody } from "@/lib/services/http";
import { jev } from "@/lib/services/jev";
import { simulateSpend } from "@/lib/store";
import { maybeAlertLowBalance } from "@/lib/services/zapier";
import { limit } from "@/lib/services/limits";

const Body = z.object({
  merchant: z.string().trim().min(1).max(80),
  amount: z.number().finite().refine((n) => n !== 0 && Math.abs(n) <= 100_000, "amount must be non-zero and at most 100000"),
});

// POST /api/demo/simulate-spend { merchant, amount }
//   -> { transaction, balanceBefore, balanceAfter, crossedBelowThreshold, zapier: ZapierResult | null }
// Posts a card purchase to the store (category via Jev), then fires the Zapier low-balance alert if it crossed
// below the auto-reload threshold.
export async function POST(req: Request) {
  const limited = limit(req, "zapier");
  if (limited) return limited;
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const { merchant, amount } = body.data;
  const { category } = await jev.categorizeTransaction({ merchant, description: "Card purchase", amount: -Math.abs(amount) });
  const { transaction, ...change } = simulateSpend(merchant, amount, category);
  const zapier = await maybeAlertLowBalance(change, { merchant, amount: Math.abs(amount), transactionId: transaction.id });
  return Response.json({ transaction, ...change, zapier });
}
