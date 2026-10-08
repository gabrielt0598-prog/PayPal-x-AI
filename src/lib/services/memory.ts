// STUB — replaced by the services builder (persistent local memory store).
import type { MemoryFact, MemoryService } from "./contracts";
const facts = new Map<string, Map<string, MemoryFact>>();
export const memory: MemoryService = {
  async list(sessionId) { return [...(facts.get(sessionId)?.values() ?? [])]; },
  async remember(sessionId, key, value, source = "user") {
    const fact = { key, value, source, updatedAt: new Date().toISOString() };
    if (!facts.has(sessionId)) facts.set(sessionId, new Map());
    facts.get(sessionId)!.set(key, fact);
    return fact;
  },
  async forget(sessionId, key) { return facts.get(sessionId)?.delete(key) ?? false; },
};
