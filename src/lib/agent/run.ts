// Orchestrates one chat turn: build context, run the LLM (or the rule-based
// fallback), then pass the draft through the TypeSafe Jev guardrail.

import type Anthropic from "@anthropic-ai/sdk";
import { jev, memory } from "@/lib/services";
import type { GuardrailResult } from "@/lib/services/contracts";
import { getState } from "@/lib/store";
import { mockAgent } from "./mock";
import { DEFAULT_MODEL, modelName, runLoop } from "./llm";
import { buildContextBlock } from "./prompt";
import { accountOverview, type ToolContext } from "./tools";
import type { AgentRequest, AgentResponse, GuardrailOutcome } from "./types";

const MAX_HISTORY = 12;
const MAX_CHARS = 4000;

async function verify(reply: string, groundTruth: string): Promise<GuardrailResult> {
  try {
    return await jev.verifyReply({ reply, groundTruth });
  } catch {
    return { verdict: "pass", unsupportedFigures: [], unknownTransactionIds: [], mode: "mock" };
  }
}

function safeReply(ctx: ToolContext) {
  const lines = ctx.results.filter((r) => !r.output.error).map((r) => `- ${r.output.summary}`);
  return lines.length
    ? `I couldn't fully verify my own wording, so here are just the verified results:\n${lines.join("\n")}`
    : "I couldn't verify an answer to that from your data, so I'd rather not guess. Could you rephrase or ask about a specific account, subscription or time period?";
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const state = getState();
  const history = req.messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (history.length > 1 && history[0].role !== "user") history.shift();
  const latest = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const facts = await memory.list(req.sessionId);
  const ctx: ToolContext = { sessionId: req.sessionId, latestUserMessage: latest, actions: [], results: [] };

  let live = Boolean(process.env.ANTHROPIC_API_KEY);
  let warning: string | undefined;
  let draft = "";
  let convo: Anthropic.MessageParam[] = [];

  if (live) {
    try {
      convo = history.map((m) => ({ role: m.role, content: m.content }));
      const last = convo[convo.length - 1];
      // Volatile context (date + remembered facts) rides in the last user turn so the cached prefix stays stable.
      last.content = [
        { type: "text", text: buildContextBlock({ asOf: state.asOf, userName: state.userProfile.name, facts }) },
        { type: "text", text: String(last.content) },
      ];
      draft = await runLoop(convo, ctx);
    } catch (e) {
      live = false;
      warning = `Live model unavailable (${e instanceof Error ? e.constructor.name : "error"}); answered with the rule-based agent.`;
      ctx.actions.length = 0;
      ctx.results.length = 0;
    }
  }
  if (!live) draft = await mockAgent(ctx);

  const currentFacts = await memory.list(req.sessionId);
  const groundTruth = [
    "USER MESSAGES:\n" + history.filter((m) => m.role === "user").map((m) => m.content).join("\n"),
    "TOOL RESULTS:\n" + ctx.results.map((r) => JSON.stringify(r.output)).join("\n"),
    "REMEMBERED FACTS:\n" + JSON.stringify(currentFacts),
    "ACCOUNT OVERVIEW:\n" + JSON.stringify(await accountOverview()),
  ].join("\n\n");

  let reply = draft || safeReply(ctx);
  let guard = await verify(reply, groundTruth);
  let retried = false;
  let outcome: GuardrailOutcome = "verified";

  if (guard.verdict === "block") {
    retried = true;
    if (live) {
      try {
        convo.push({
          role: "user",
          content: `Your draft reply contained figures or ids that are not in the tool results or remembered facts: ${[...guard.unsupportedFigures, ...guard.unknownTransactionIds].join(", ") || "unspecified"}. Rewrite the reply using only values taken verbatim from tool results (call a tool if you need data). Do not mention this correction.`,
        });
        reply = (await runLoop(convo, ctx, 3)) || reply;
      } catch {
        reply = safeReply(ctx);
      }
    } else {
      reply = safeReply(ctx);
    }
    guard = await verify(reply, groundTruth + "\n" + ctx.results.map((r) => JSON.stringify(r.output)).join("\n"));
    outcome = "corrected";
    if (guard.verdict === "block") {
      reply = safeReply(ctx);
      outcome = "blocked";
    }
  }

  return {
    reply,
    actions: ctx.actions,
    guardrail: { ...guard, retried, outcome },
    memory: await memory.list(req.sessionId),
    mode: { llm: live ? "live" : "mock", model: live ? modelName() : "rule-based" },
    ...(warning ? { warning } : {}),
  };
}

export { DEFAULT_MODEL };
