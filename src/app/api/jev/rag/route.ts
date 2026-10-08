import { z } from "zod";
import { memory } from "@/lib/services";
import { retrieveEvidence } from "@/lib/services/evidence";
import { parseBody } from "@/lib/services/http";
import { getState } from "@/lib/store";

const Body = z.object({
  question: z.string().trim().min(1).max(1_000),
  /** Optional: include this session's remembered facts as candidate evidence. */
  sessionId: z.string().trim().min(8).max(100).optional(),
});

// POST /api/jev/rag { question, sessionId? } -> { documents, mode, ranking, intent, candidates }
// Debug / demo route: shows the code-built candidate evidence, Jev's 0..3 relevance score per candidate, and what the agent would see.
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const facts = body.data.sessionId ? await memory.list(body.data.sessionId) : [];
  return Response.json(await retrieveEvidence(body.data.question, getState(), facts));
}
