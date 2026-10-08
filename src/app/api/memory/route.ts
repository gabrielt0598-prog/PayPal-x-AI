import { connection } from "next/server";
import { z } from "zod";
import { parseBody, validate } from "@/lib/services/http";
import { memory } from "@/lib/services/memory";

const Session = z.string().trim().min(1).max(128).default("default");
const PostBody = z.object({
  sessionId: Session,
  key: z.string().trim().min(1).max(64),
  value: z.string().trim().min(1).max(1_000),
  source: z.enum(["user", "agent"]).default("user"),
});
const DeleteParams = z.object({ sessionId: Session, key: z.string().trim().min(1).max(64) });

// GET /api/memory?sessionId=abc -> MemoryFact[]
export async function GET(req: Request) {
  await connection();
  const v = validate(z.object({ sessionId: Session }), { sessionId: new URL(req.url).searchParams.get("sessionId") ?? undefined });
  if ("response" in v) return v.response;
  return Response.json(await memory.list(v.data.sessionId));
}

// POST /api/memory { sessionId, key, value, source? } -> MemoryFact
export async function POST(req: Request) {
  const body = await parseBody(req, PostBody);
  if ("response" in body) return body.response;
  const { sessionId, key, value, source } = body.data;
  return Response.json(await memory.remember(sessionId, key, value, source));
}

// DELETE /api/memory?sessionId=abc&key=monthly_salary (or JSON body {sessionId,key}) -> { deleted }
export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  let raw: Record<string, unknown> = { sessionId: sp.get("sessionId") ?? undefined, key: sp.get("key") ?? undefined };
  if (!raw.key) {
    const b = await req.json().catch(() => null);
    if (b && typeof b === "object") raw = { ...raw, ...(b as Record<string, unknown>) };
  }
  const v = validate(DeleteParams, raw);
  if ("response" in v) return v.response;
  return Response.json({ deleted: await memory.forget(v.data.sessionId, v.data.key) });
}
