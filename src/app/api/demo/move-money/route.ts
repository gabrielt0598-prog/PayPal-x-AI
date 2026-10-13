import { z } from "zod";
import { parseBody } from "@/lib/services/http";
import { moveMoney } from "@/lib/store";

const Body = z.object({
  kind: z.enum(["add", "transfer", "rewards", "purchase"]),
  amount: z.number().finite().positive().max(100_000),
  merchant: z.string().trim().min(1).max(80).optional(),
});

// POST /api/demo/move-money { kind, amount, merchant? }
//   -> { transaction, balanceBefore, balanceAfter }
// Backs Top up / Transfer on the balance card, rewards redemption and Store Sync reorders.
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const { kind, amount, merchant } = body.data;
  const { transaction, ...change } = moveMoney(kind, amount, merchant);
  return Response.json({ transaction, ...change });
}
