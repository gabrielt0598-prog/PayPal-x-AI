import { connection } from "next/server";
import { jevMode } from "@/lib/services/jev";
import { kernelMode } from "@/lib/services/kernel";
import { memoryMode } from "@/lib/services/memory";
import { paypalMode } from "@/lib/services/paypal";
import type { ServiceMode } from "@/lib/services/contracts";

// GET /api/integrations/status -> which integrations run live vs on local mocks (never returns secrets).
export async function GET() {
  await connection(); // env + memory file are runtime state
  const anthropic: ServiceMode = process.env.ANTHROPIC_API_KEY?.trim() ? "live" : "mock";
  return Response.json({
    anthropic,
    jev: jevMode(),
    paypal: paypalMode(),
    kernel: kernelMode(),
    memory: await memoryMode(),
  });
}
