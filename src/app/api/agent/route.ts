import Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "@/lib/agent/run";
import { limit } from "@/lib/services/limits";
import type { ChatMessage } from "@/lib/agent/types";

// POST /api/agent — one assistant turn. Non-streaming JSON.
export async function POST(request: Request) {
  const limited = limit(request, "agent");
  if (limited) return limited;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const sessionId = typeof b.sessionId === "string" ? b.sessionId.trim() : "";
  if (sessionId.length < 8 || sessionId.length > 100) {
    return Response.json({ error: "sessionId (8-100 chars) is required" }, { status: 400 });
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array" }, { status: 400 });
  }
  const messages: ChatMessage[] = [];
  for (const m of b.messages) {
    const r = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    if ((r.role !== "user" && r.role !== "assistant") || typeof r.content !== "string" || !r.content.trim()) {
      return Response.json({ error: "Each message needs a role (user|assistant) and non-empty content" }, { status: 400 });
    }
    messages.push({ role: r.role, content: r.content });
  }
  if (messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "The last message must be from the user" }, { status: 400 });
  }
  // The API requires the first message to be from the user.
  while (messages.length > 1 && messages[0].role !== "user") messages.shift();

  try {
    return Response.json(await runAgent({ sessionId, messages }));
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[agent] Anthropic error", e.status, e.message);
      return Response.json({ error: "The language model request failed" }, { status: 502 });
    }
    console.error("[agent] error", e instanceof Error ? e.message : e);
    return Response.json({ error: "The assistant hit an unexpected error" }, { status: 500 });
  }
}
