import { connection } from "next/server";
import { jsonError } from "@/lib/services/http";
import { paypal } from "@/lib/services/paypal";
import { createSeedState } from "@/lib/mock-data";
import { demoBalanceDelta, getState } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { limit } from "@/lib/services/limits";

// GET /api/paypal/home -> { mode, balance, currency, transactions, demoDelta }
// What the Home page shows for the PayPal balance and recent transactions.
//   live: the sandbox balance and transactions read through the APIMatic PayPal Server SDK, plus whatever the
//         demo itself has posted on top (Add money, Transfer, rewards cash-out, simulated spend), so those
//         buttons still move the number: balance = sandbox balance + demoDelta.
//   mock: { mode: "mock" } and the page keeps using the sample data from /api/state.
export async function GET(req: Request) {
  const limited = limit(req, "paypal");
  if (limited) return limited;
  await connection();
  try {
    const { balance, mode } = await paypal.getBalance();
    if (mode !== "live") return Response.json({ mode: "mock" });
    const live = await paypal.listTransactions();
    const seed = createSeedState();
    const seedIds = new Set(seed.transactions.map((t) => t.id));
    const state = getState();
    const demoTxns: Transaction[] = state.transactions.filter((t) => !seedIds.has(t.id));
    const demoDelta = demoBalanceDelta();
    const transactions = [...demoTxns, ...live].sort((a, b) => b.date.localeCompare(a.date));
    return Response.json({ mode: "live", balance: Math.round((balance + demoDelta) * 100) / 100, currency: "USD", transactions, demoDelta });
  } catch {
    return jsonError(502, "Could not load the PayPal balance");
  }
}
