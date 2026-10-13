// Orchestrates one chat turn:
//   1. retrieve + Jev-rerank evidence for the latest user message (one Jev call, also routes the intent)
//   2. run the LLM (or the rule-based fallback) with the evidence in its turn context
//   3. verify the draft claim by claim (one Jev call) + deterministic figure/id check
//   4. on a block: ONE correction re-prompt listing only the unsupported claims, re-verify (second Jev call),
//      then drop whatever is still unsupported ("select instead of generate") and keep the verified sentences.
// Jev calls per turn: 1 (retrieve + route) + 1 (verify) + at most 1 (re-verify after the correction retry).

import type Anthropic from "@anthropic-ai/sdk";
import { jev, memory } from "@/lib/services";
import type { ClaimCheck, GuardrailResult, SourceDoc } from "@/lib/services/contracts";
import { evidenceSources, formatEvidenceBlock, knownEntities, retrieveEvidence, type EvidenceDoc, type RetrievalResult } from "@/lib/services/evidence";
import { checkReplyAgainstGroundTruth, rebuildReply, segmentReply } from "@/lib/services/guardrail";
import { claimThreshold } from "@/lib/services/jev";
import { getState } from "@/lib/store";
import { mockAgent } from "./mock";
import { DEFAULT_MODEL, modelName, runLoop } from "./llm";
import { buildContextBlock } from "./prompt";
import { accountOverview, type ToolContext } from "./tools";
import type { AgentRequest, AgentResponse, GuardrailOutcome, ToolEvidence } from "./types";

const MAX_HISTORY = 12;
const MAX_CHARS = 4000;
const MAX_TOOL_SOURCE_CHARS = 6000;

function safeReply(ctx: ToolContext) {
  const lines = ctx.results.flatMap((r, i) => (r.output.error ? [] : [`- ${r.output.summary} [tool_${i + 1}]`]));
  return lines.length
    ? `I couldn't fully verify my own wording, so here are just the verified results:\n${lines.join("\n")}`
    : "I couldn't verify an answer to that from your data, so I'd rather not guess. Could you rephrase or ask about a specific account, subscription or time period?";
}

const emptyRetrieval = (): RetrievalResult => ({ documents: [], mode: "mock", ranking: [], candidates: { built: 0, prefiltered: 0 } });

export interface VerifyOptions {
  draft: string;
  ctx: ToolContext;
  evidence: EvidenceDoc[];
  entities: string[];
  userText: string;
  facts: string;
  overview: string;
  /** Live LLM only: re-prompt the model once with `message` and return its new draft. Omitted for the rule-based agent. */
  retry?: (message: string) => Promise<string>;
}

export interface VerifyOutcome {
  reply: string;
  guard: GuardrailResult;
  retried: boolean;
  outcome: GuardrailOutcome;
  removed: ClaimCheck[];
}

/** Verify a draft claim by claim; on a block: one correction retry, then drop unsupported sentences, then safe restatement. */
export async function verifyAndCorrect(o: VerifyOptions): Promise<VerifyOutcome> {
  const { ctx } = o;
  const evidenceBlock = formatEvidenceBlock(o.evidence);
  const buildSources = (): SourceDoc[] => [
    ...evidenceSources(o.evidence),
    ...ctx.results.map((r, i): SourceDoc => ({ id: `tool_${i + 1}`, title: r.tool, text: JSON.stringify(r.output).slice(0, MAX_TOOL_SOURCE_CHARS) })),
    { id: "user_messages", title: "What the user said", text: o.userText, shared: true },
    { id: "remembered_facts", title: "Remembered facts", text: o.facts },
    { id: "account_overview", title: "Account overview", text: o.overview },
  ];
  const groundTruthOf = (sources: SourceDoc[]) => sources.map((s) => `${s.id}: ${s.text}`).join("\n\n");
  const verify = async (reply: string): Promise<GuardrailResult> => {
    const sources = buildSources();
    try {
      return await jev.verifyReply({ reply, groundTruth: groundTruthOf(sources), sources, entities: o.entities });
    } catch {
      return { verdict: "pass", unsupportedFigures: [], unknownTransactionIds: [], claims: [], claimThreshold: claimThreshold(), mode: "mock" };
    }
  };

  let reply = o.draft || safeReply(ctx);
  let guard = await verify(reply);
  let retried = false;
  let outcome: GuardrailOutcome = "verified";
  let removed: ClaimCheck[] = [];

  if (guard.verdict === "block") {
    // Correction re-prompt (live LLM only; the rule-based draft would just repeat itself). Only the unsupported
    // claims are listed, plus the evidence, so the model can fix or remove exactly those.
    if (o.retry) {
      retried = true;
      try {
        const bad = guard.claims.filter((c) => c.verdict === "unsupported");
        reply =
          (await o.retry(
            `Verification failed for these sentences of your draft (not supported by the evidence or tool results they cite):\n${
              bad.length ? bad.map((c) => `- "${c.text}"${c.citations.length ? ` (cited ${c.citations.join(", ")})` : ""}`).join("\n") : "- (none individually flagged)"
            }${guard.unsupportedFigures.length || guard.unknownTransactionIds.length ? `\nFigures/ids not found anywhere: ${[...guard.unsupportedFigures, ...guard.unknownTransactionIds].join(", ")}` : ""}\n\nAvailable evidence:\n${evidenceBlock}\n\nRewrite the reply: remove or fix ONLY those sentences, using values verbatim from the evidence or tool results (call a tool if you need data) and cite [ev_n]/[tool_n]. Keep the supported sentences. Do not mention this correction.`,
          )) || reply;
        guard = await verify(reply);
        if (guard.verdict === "pass") outcome = "corrected";
      } catch {
        // keep the previous draft + verdict; the drop step below decides what survives
      }
    }

    // Still blocked: select instead of generate. Drop the unsupported sentences, keep the verified ones verbatim.
    if (guard.verdict === "block") {
      const segs = segmentReply(reply);
      const claimSegs = segs.filter((s) => s.isClaim);
      const dropped = new Set(claimSegs.filter((_, i) => guard.claims[i]?.verdict === "unsupported"));
      const keptClaims = guard.claims.filter((c) => c.verdict === "supported");
      const trimmed = rebuildReply(segs, (s) => !dropped.has(s));
      const recheck = trimmed ? checkReplyAgainstGroundTruth(trimmed, groundTruthOf(buildSources())) : null;
      removed = guard.claims.filter((c) => c.verdict === "unsupported");
      if (keptClaims.length > 0 && trimmed && recheck && recheck.unsupportedFigures.length === 0 && recheck.unknownTransactionIds.length === 0) {
        reply = trimmed;
        guard = { ...guard, verdict: "pass", unsupportedFigures: [], unknownTransactionIds: [], claims: keptClaims };
        outcome = "corrected";
      } else {
        reply = safeReply(ctx);
        outcome = "blocked";
      }
    }
  }
  return { reply, guard, retried, outcome, removed };
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const state = getState();
  const history = req.messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (history.length > 1 && history[0].role !== "user") history.shift();
  const latest = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const facts = await memory.list(req.sessionId);
  const ctx: ToolContext = { sessionId: req.sessionId, latestUserMessage: latest, origin: req.origin, actions: [], results: [] };

  // 1. Evidence retrieval + Jev reranking. A failure only means "no pre-retrieved evidence": tools still work.
  let retrieval = emptyRetrieval();
  try {
    retrieval = await retrieveEvidence(latest, state, facts);
  } catch (e) {
    console.error("[agent] evidence retrieval failed:", e instanceof Error ? e.message : e);
  }
  ctx.intent = retrieval.intent;
  const evidenceBlock = formatEvidenceBlock(retrieval.documents);

  let live = Boolean(process.env.ANTHROPIC_API_KEY);
  let warning: string | undefined;
  let draft = "";
  let convo: Anthropic.MessageParam[] = [];

  if (live) {
    try {
      convo = history.map((m) => ({ role: m.role, content: m.content }));
      const last = convo[convo.length - 1];
      // Volatile context (date, remembered facts, evidence) rides in the last user turn so the cached prefix stays stable.
      last.content = [
        { type: "text", text: buildContextBlock({ asOf: state.asOf, userName: state.userProfile.name, facts, evidence: evidenceBlock }) },
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

  // 2. Claim-level verification + correction.
  const currentFacts = await memory.list(req.sessionId);
  const overview = JSON.stringify(await accountOverview());
  const userText = history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const { reply, guard, retried, outcome, removed } = await verifyAndCorrect({
    draft,
    ctx,
    evidence: retrieval.documents,
    entities: knownEntities(state),
    userText,
    facts: JSON.stringify(currentFacts),
    overview,
    // Live correction retry: one extra Claude loop (<= 3 tool rounds) on the same conversation.
    retry: live
      ? async (message) => {
          convo.push({ role: "user", content: message });
          return runLoop(convo, ctx, 3);
        }
      : undefined,
  });

  const toolResults: ToolEvidence[] = ctx.results.map((r, i) => ({ id: `tool_${i + 1}`, tool: r.tool, summary: r.output.summary }));
  const evidence: EvidenceDoc[] = retrieval.documents;
  return {
    reply,
    actions: ctx.actions,
    guardrail: { ...guard, retried, outcome, ...(removed.length ? { removedClaims: removed } : {}) },
    evidence,
    toolResults,
    retrieval: { mode: retrieval.mode, intent: retrieval.intent, ranking: retrieval.ranking.slice(0, 12), candidates: retrieval.candidates },
    memory: await memory.list(req.sessionId),
    mode: { llm: live ? "live" : "mock", model: live ? modelName() : "rule-based" },
    ...(warning ? { warning } : {}),
  };
}

export { DEFAULT_MODEL };
