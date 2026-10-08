import { buildLowBalanceAlert, deliverLowBalanceAlert } from "@/lib/services/zapier";

// POST /api/zapier/low-balance -> ZapierResult (+ the alert sent). Manual test fire with the CURRENT state;
// bypasses the 10-minute dedupe so you can fire it repeatedly while wiring up the Zap.
export async function POST() {
  const alert = buildLowBalanceAlert();
  const result = await deliverLowBalanceAlert(alert, { force: true });
  return Response.json({ ...result, alert });
}
