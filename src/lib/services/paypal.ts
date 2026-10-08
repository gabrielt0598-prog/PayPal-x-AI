// STUB — replaced by the services builder with the APIMatic PayPal SDK adapter.
import type { PayPalService } from "./contracts";
import { cancelRecurring, getState } from "../store";
export const paypal: PayPalService = {
  mode: () => "mock",
  async listTransactions() { return getState().transactions; },
  async getBalance() { return getState().userProfile.paypalBalance; },
  async listRecurring() { return getState().recurring; },
  async cancelSubscription(id) { const r = cancelRecurring(id); return r.ok ? { ok: true } : { ok: false, error: r.error }; },
};
