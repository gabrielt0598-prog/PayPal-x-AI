import { connection } from "next/server";
import { getState, resetState } from "@/lib/store";

// GET /api/state — full FinanceState snapshot for the dashboard.
export async function GET() {
  await connection(); // in-memory state changes at runtime; never prerender
  return Response.json(getState());
}

// DELETE /api/state — reset the demo back to the seed data.
export async function DELETE() {
  return Response.json(resetState());
}
