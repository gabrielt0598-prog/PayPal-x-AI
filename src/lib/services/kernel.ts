// STUB — replaced by the services builder with the real Kernel browser integration.
import type { KernelService } from "./contracts";
export const kernel: KernelService = {
  async cancelOnMerchantSite(sub) { return { status: "simulated", steps: [`Simulated cancellation of ${sub.merchant}`], mode: "mock" }; },
};
