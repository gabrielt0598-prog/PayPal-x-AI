// Usage limits for the routes that spend your money or quota (Claude, TypeSafe Jev, Kernel, PayPal).
//
// Each guarded route has a per-visitor rate (per minute and per day) and a global daily cap, so a crowd of
// judges and participants cannot run up the bill. Visitors are told how long to wait (HTTP 429 + Retry-After).
//
// IMPORTANT: counters live in server memory. On a single server (localhost) that is exact. On Vercel every
// serverless instance has its own counters, so the effective limit can be a few times higher. Treat this as
// the first fence and also set hard caps at the providers (Anthropic Console spend limit, Kernel plan) and a Vercel Firewall rate-limit rule. See README "Usage limits".
//
// Tune with env vars, e.g. LIMIT_AGENT_PER_MIN=5 LIMIT_AGENT_PER_DAY=40 LIMIT_AGENT_GLOBAL_PER_DAY=800.
// Set RATE_LIMITS=off to disable (local development only).

import { jsonError } from "./http";

type Name = "agent" | "kernel" | "jev" | "paypal";

interface Rule {
  perMin: number;
  perDay: number;
  globalPerDay: number;
  /** What to tell the visitor when they hit the limit. */
  what: string;
}

const DEFAULTS: Record<Name, Rule> = {
  agent: { perMin: 10, perDay: 80, globalPerDay: 1500, what: "PayPal AI messages" },
  kernel: { perMin: 2, perDay: 6, globalPerDay: 60, what: "cloud-browser cancellations" },
  jev: { perMin: 20, perDay: 200, globalPerDay: 2000, what: "fact-check requests" },
  paypal: { perMin: 60, perDay: 1000, globalPerDay: 20000, what: "PayPal requests" },
};

const MIN = 60_000;
const DAY = 86_400_000;

const g = globalThis as typeof globalThis & { __pfmLimits?: Map<string, number[]>; __pfmGlobal?: Map<string, { day: number; n: number }> };

function num(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function rule(name: Name): Rule {
  const d = DEFAULTS[name];
  const k = name.toUpperCase();
  return {
    perMin: num(`LIMIT_${k}_PER_MIN`, d.perMin),
    perDay: num(`LIMIT_${k}_PER_DAY`, d.perDay),
    globalPerDay: num(`LIMIT_${k}_GLOBAL_PER_DAY`, d.globalPerDay),
    what: d.what,
  };
}

/** Best-effort visitor id: the first address in x-forwarded-for (set by Vercel), else x-real-ip. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "local";
}

/**
 * Counts one use of `name` for this visitor. Returns null when allowed, or a ready-to-return 429 Response.
 * Call it first in a route handler: `const limited = limit(req, "agent"); if (limited) return limited;`
 */
export function limit(req: Request, name: Name, now = Date.now()): Response | null {
  if (process.env.RATE_LIMITS?.trim().toLowerCase() === "off") return null;
  const r = rule(name);
  const hits: Map<string, number[]> = (g.__pfmLimits ??= new Map<string, number[]>());
  const globals: Map<string, { day: number; n: number }> = (g.__pfmGlobal ??= new Map<string, { day: number; n: number }>());
  const key = `${name}:${clientKey(req)}`;

  const recent = (hits.get(key) ?? []).filter((t) => now - t < DAY);
  const lastMin = recent.filter((t) => now - t < MIN);
  const gl = globals.get(name);
  const today = Math.floor(now / DAY);
  const gCount = gl && gl.day === today ? gl.n : 0;

  const refuse = (retryAfterSec: number, message: string) =>
    new Response(JSON.stringify({ error: message, retryAfterSeconds: retryAfterSec }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSec) },
    });

  if (gCount >= r.globalPerDay) {
    return refuse(3600, `The demo has reached its daily limit for ${r.what}. Please try again tomorrow.`);
  }
  if (lastMin.length >= r.perMin) {
    const wait = Math.max(1, Math.ceil((lastMin[0] + MIN - now) / 1000));
    return refuse(wait, `You're going a bit fast. Please wait ${wait}s before sending more ${r.what}.`);
  }
  if (recent.length >= r.perDay) {
    const wait = Math.max(60, Math.ceil((recent[0] + DAY - now) / 1000));
    return refuse(wait, `You've used today's allowance of ${r.perDay} ${r.what}. Please come back later.`);
  }

  recent.push(now);
  hits.set(key, recent);
  globals.set(name, { day: today, n: gCount + 1 });
  // Keep the map small: drop visitors with no recent hits now and then.
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < DAY)) hits.delete(k);
  return null;
}

export { jsonError };
