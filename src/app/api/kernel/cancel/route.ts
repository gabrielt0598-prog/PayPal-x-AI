import { z } from "zod";
import { jsonError, parseBody } from "@/lib/services/http";
import { kernel } from "@/lib/services/kernel";
import { cancelRecurring, getState } from "@/lib/store";

const Body = z.object({ recurringId: z.string().trim().min(1).max(100) });

// POST /api/kernel/cancel { recurringId } -> { result: BrowserCancellationResult, cancelledInStore, recurring }
// Runs the merchant-site cancellation in a Kernel cloud browser. The subscription is marked cancelled in the
// store only when the result is "completed" or "simulated" (never while a human still has to confirm).
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const sub = getState().recurring.find((r) => r.id === body.data.recurringId);
  if (!sub) return jsonError(404, `No recurring payment with id ${body.data.recurringId}`);
  if (!sub.cancellable) return jsonError(422, `${sub.merchant} (${sub.plan}) cannot be cancelled from the app`);
  if (sub.status === "cancelled") return jsonError(409, `${sub.merchant} is already cancelled`);
  if (sub.cancelChannel !== "kernel_browser") {
    return jsonError(422, `${sub.merchant} is cancelled through ${sub.cancelChannel}, not a merchant-site browser`);
  }

  const result = await kernel.cancelOnMerchantSite(sub);
  let cancelledInStore = false;
  if (result.status === "completed" || result.status === "simulated") {
    cancelledInStore = cancelRecurring(sub.id).ok;
  }
  return Response.json({ result, cancelledInStore, recurring: getState().recurring.find((r) => r.id === sub.id) });
}
