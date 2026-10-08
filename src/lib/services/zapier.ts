// STUB — replaced by the services builder with the real Zapier webhook.
import type { ZapierService } from "./contracts";
export const zapier: ZapierService = {
  async sendLowBalanceAlert() { return { delivered: false, mode: "mock" }; },
};
