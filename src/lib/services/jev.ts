// STUB — replaced by the services builder with the real TypeSafe Jev integration.
import type { JevService } from "./contracts";
export const jev: JevService = {
  async categorizeTransaction() { return { category: "Shopping", confidence: 0.5, mode: "mock" }; },
  async classifyIntent() { return { intent: "question", confidence: 0.5, mode: "mock" }; },
  async verifyReply() { return { verdict: "pass", unsupportedFigures: [], unknownTransactionIds: [], mode: "mock" }; },
};
