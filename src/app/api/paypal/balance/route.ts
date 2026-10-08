import { connection } from "next/server";
import { jsonError } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";

// GET /api/paypal/balance -> { balance, currency, mode }
export async function GET() {
  await connection();
  try {
    return Response.json({ balance: await paypal.getBalance(), currency: "USD", mode: paypal.mode() });
  } catch {
    return jsonError(502, "Could not load balance");
  }
}
