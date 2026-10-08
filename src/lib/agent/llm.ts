// Live LLM agent loop (manual tool loop on the official Anthropic SDK).
// Works on Haiku 5.5 and Sonnet 5.5: no thinking params, no prefill, tool_choice
// "auto" only (or "none" for the wrap-up call), effort "low" for chat turns.

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";
import { executeTool, TOOLS, type ToolContext } from "./tools";

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const MAX_TOKENS = 1500;
export const MAX_ITERATIONS = 6;

export function modelName() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 }));

const textOf = (content: Anthropic.ContentBlock[]) =>
  content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

/** Runs the tool loop until the model answers in text. Mutates `messages`. */
export async function runLoop(messages: Anthropic.MessageParam[], ctx: ToolContext, maxIterations = MAX_ITERATIONS): Promise<string> {
  const api = getClient();
  for (let i = 0; i <= maxIterations; i++) {
    const wrapUp = i === maxIterations; // out of budget: force a text answer from what we have
    const res = await api.messages.create({
      model: modelName(),
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" },
      // Cache breakpoint on the system block caches tools + system (stable prefix).
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      ...(wrapUp ? { tool_choice: { type: "none" as const } } : {}),
      messages,
    });

    if (res.stop_reason === "refusal") return "I can't help with that request.";
    messages.push({ role: "assistant", content: res.content });

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || uses.length === 0) {
      const text = textOf(res.content);
      return text || (res.stop_reason === "max_tokens" ? "That answer got cut off, could you ask again more narrowly?" : "Done.");
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const out = await executeTool(u.name, u.input, ctx);
      results.push({
        type: "tool_result",
        tool_use_id: u.id,
        content: JSON.stringify(out),
        ...(typeof out.error === "string" ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }
  return "";
}
