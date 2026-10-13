import { connection } from "next/server";
import { jsonError } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { limit } from "@/lib/services/limits";

// GET /api/paypal/balance -> { balance, currency, mode }
export async function GET(req: Request) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  try {
    const { balance, mode } = await paypal.getBalance();
    return Response.json({ balance, currency: "USD", mode });
  } catch {
    return jsonError(502, "Could not load balance");
  }
}
