import { connection } from "next/server";
import { jsonError } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";

// GET /api/paypal/balance -> { balance, currency, mode }
export async function GET() {
  await connection();
  try {
    const { balance, mode } = await paypal.getBalance();
    return Response.json({ balance, currency: "USD", mode });
  } catch {
    return jsonError(502, "Could not load balance");
  }
}
