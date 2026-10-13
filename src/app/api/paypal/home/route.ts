import { connection } from "next/server";
import { jsonError } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { demoBalanceDelta, getState } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { limit } from "@/lib/services/limits";

// GET /api/paypal/home -> { mode, balance, currency, transactions, demoDelta }
// What the Home page shows for the PayPal balance and recent transactions.
//   live: the sandbox balance and transactions read through the APIMatic PayPal Server SDK, with the sample history
//         and whatever the demo itself posted (Top up, Transfer, rewards cash-out, simulated spend) listed beneath
//         them. The demo's moves still shift the number: balance = sandbox balance + demoDelta.
//   mock: { mode: "mock" } and the page keeps using the sample data from /api/state.
export async function GET(req: Request) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  try {
    const { balance, mode } = await paypal.getBalance();
    if (mode !== "live") return Response.json({ mode: "mock" });
    const live = await paypal.listTransactions();
    // The sandbox only holds a few records (e.g. the "Initial balance" deposit), so the sample history and anything the
    // demo posted sit underneath them. Only the live balance and demoDelta feed the balance; sample rows never do.
    const demoDelta = demoBalanceDelta();
    const transactions: Transaction[] = [...live, ...getState().transactions].sort((a, b) => b.date.localeCompare(a.date));
    return Response.json({ mode: "live", balance: Math.round((balance + demoDelta) * 100) / 100, currency: "USD", transactions, demoDelta });
  } catch {
    return jsonError(502, "Could not load the PayPal balance");
  }
}
