// Persistent agent memory (salary, savings goals, pay day, ...) keyed by sessionId.
// Stored in a local JSON file (.data/memory.json, git-ignored) behind an in-process cache so facts survive a
// dev-server restart. Deliberately local: Kernel is cloud-browser infra and is NOT used for memory.
//
// If the filesystem is read-only (e.g. serverless), it degrades to in-memory only and memoryMode() reports "mock".

import { access, mkdir, readFile, rename, writeFile, constants } from "node:fs/promises";
import path from "node:path";
import type { MemoryFact, MemoryService, ServiceMode } from "./contracts";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "memory.json");

type Store = Map<string, Map<string, MemoryFact>>;
const g = globalThis as typeof globalThis & { __pfmMemory?: { store: Store; loaded: Promise<void>; persistent: boolean; queue: Promise<void> } };

function state() {
  if (!g.__pfmMemory) {
    const s = { store: new Map() as Store, loaded: Promise.resolve(), persistent: true, queue: Promise.resolve() };
    g.__pfmMemory = s;
    s.loaded = load(s);
  }
  return g.__pfmMemory;
}

async function load(s: NonNullable<typeof g.__pfmMemory>) {
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8")) as Record<string, Record<string, MemoryFact>>;
    for (const [sid, facts] of Object.entries(raw ?? {})) {
      const m = new Map<string, MemoryFact>();
      for (const [k, f] of Object.entries(facts ?? {})) {
        if (f && typeof f.value === "string") m.set(k, { key: k, value: f.value, source: f.source === "agent" ? "agent" : "user", updatedAt: String(f.updatedAt ?? "") });
      }
      s.store.set(sid, m);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") console.error("[memory] could not read .data/memory.json, starting empty:", (err as Error)?.message);
  }
}

function persist(s: NonNullable<typeof g.__pfmMemory>) {
  // Serialise writes; write to a temp file then rename so a crash never leaves a half-written file.
  s.queue = s.queue.then(async () => {
    try {
      const out: Record<string, Record<string, MemoryFact>> = {};
      for (const [sid, facts] of s.store) out[sid] = Object.fromEntries(facts);
      await mkdir(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(out, null, 2), "utf8");
      await rename(tmp, FILE);
      s.persistent = true;
    } catch (err) {
      s.persistent = false;
      console.error("[memory] could not persist to .data/memory.json (in-memory only):", (err as Error)?.message);
    }
  });
  return s.queue;
}

/** "Monthly Salary" -> "monthly_salary" */
export function normalizeKey(key: string): string {
  const k = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return k || "fact";
}

const normSession = (id: string) => (id?.trim() || "default").slice(0, 128);

export async function memoryMode(): Promise<ServiceMode> {
  const s = state();
  await s.loaded;
  if (!s.persistent) return "mock";
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await access(DATA_DIR, constants.W_OK);
    return "live";
  } catch {
    return "mock";
  }
}

export const memory: MemoryService = {
  async list(sessionId) {
    const s = state();
    await s.loaded;
    return [...(s.store.get(normSession(sessionId))?.values() ?? [])].sort((a, b) => a.key.localeCompare(b.key));
  },

  async remember(sessionId, key, value, source = "user") {
    const s = state();
    await s.loaded;
    const sid = normSession(sessionId);
    const k = normalizeKey(key);
    const fact: MemoryFact = { key: k, value: value.trim().slice(0, 1_000), source, updatedAt: new Date().toISOString() };
    if (!s.store.has(sid)) s.store.set(sid, new Map());
    s.store.get(sid)!.set(k, fact);
    await persist(s);
    return fact;
  },

  async forget(sessionId, key) {
    const s = state();
    await s.loaded;
    const removed = s.store.get(normSession(sessionId))?.delete(normalizeKey(key)) ?? false;
    if (removed) await persist(s);
    return removed;
  },
};
