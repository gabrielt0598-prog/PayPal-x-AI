// Deterministic rule-based agent used when ANTHROPIC_API_KEY is absent (or the
// live call fails). It calls the SAME tool executors as the LLM and composes the
// reply from their `summary` strings, so the demo works for $0.

import { jev } from "@/lib/services";
import { CATEGORIES } from "@/lib/types";
import { executeTool, isConfirmation, pendingCancels, type ToolContext, type ToolOutput } from "./tools";

const CATEGORY_ALIASES: [RegExp, (typeof CATEGORIES)[number]][] = [
  [/dining|restaurant|eat(ing)? out|food|coffee|takeout/i, "Dining"],
  [/grocer/i, "Groceries"],
  [/shopping|clothes|retail/i, "Shopping"],
  [/subscription|streaming|membership|software|apps?\b/i, "Subscriptions"],
  [/transport|transit|hopline|commut|rides?\b/i, "Transport"],
  [/bills?\b|rent|housing|utilit/i, "Essential bills"],
  [/\bother\b/i, "Other"],
];

function parseSalary(m: string) {
  const hit = m.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)\s*(k)?/i) ?? m.replace(/,/g, "").match(/(\d{4,}(?:\.\d+)?)\s*(k)?/i);
  if (!hit) return undefined;
  const v = Number(hit[1]) * (hit[2] ? 1000 : 1);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}


export async function mockAgent(ctx: ToolContext): Promise<string> {
  const m = ctx.latestUserMessage;
  const lower = m.toLowerCase();
  const call = (name: string, input: unknown = {}) => executeTool(name, input, ctx);
  // Cite the tool result the way the live model does ("[tool_2]"), so the UI chips and the claim check work in mock mode too.
  const cite = (o: ToolOutput) => `${o.summary} [tool_${ctx.results.findIndex((r) => r.output === o) + 1}]`;
  // Retrieval already asked Jev for the intent in the same call as the evidence ranking; only ask again if it did not.
  const hint = ctx.intent ?? (await jev.classifyIntent(m).catch(() => undefined));

  // 1. Follow-up to a pending cancellation preview.
  const pending = pendingCancels.get(ctx.sessionId);
  if (pending) {
    if (isConfirmation(m)) return cite(await call("cancel_subscription", { recurring_id: pending, confirmed: true }));
    if (/\b(keep|no|nope|don't|never ?mind)\b/i.test(m)) {
      pendingCancels.delete(ctx.sessionId);
      return "No problem, I'll keep that subscription active. Nothing was changed.";
    }
  }

  // 1a-ii. Pay with PayPal (Orders API). The default Essentials order is the three items selected on the Essentials page.
  if (/\bpay\b.*\b(essentials|order)\b|\bpay\b.*\bwith paypal\b/i.test(lower)) {
    const stated = /\$\s*\d/.test(m) ? parseSalary(m) : undefined;
    const amount = stated ?? 52.43;
    return cite(await call("pay_with_paypal", { amount, merchant: "Harbor & Home", description: stated ? "PayPal payment" : "Essentials order: Cloudsoft toilet paper, Scrubwell sponges, Purelather refill" }));
  }

  // 1a. Card controls: fraud report ("that wasn't me") or freeze / unfreeze.
  if (/wasn.?t me|not me\b|didn.?t (make|authori[sz]e)|unauthori[sz]ed|fraud/i.test(lower)) {
    const amount = parseSalary(m);
    const merchant = m.match(/(?:from|by|at)?\s*([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*)*)\s+charged/)?.[1] ?? m.match(/\bat\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*)*)/)?.[1];
    if (amount !== undefined && merchant) return cite(await call("report_unauthorized_charge", { merchant, amount }));
    return "I can freeze your card and file a claim right away. Which charge wasn't you? Tell me the merchant and the amount.";
  }
  if (/\b(freeze|lock|unfreeze|unlock)\b.*\bcard\b|\bcard\b.*\b(freeze|lock|unfreeze|unlock)\b/i.test(lower)) {
    return cite(await call("freeze_card", { frozen: !/unfreeze|unlock/i.test(lower) }));
  }

  // 1b. What-if projections.
  if (/what if|what happens if|\bwhat would happen\b/i.test(lower)) {
    const amount = /\b(buy|bought|purchase|spend|get)\b|laptop|\$\s*\d/i.test(lower) ? parseSalary(m) : undefined;
    if (amount !== undefined) {
      const item = lower.match(/\$\s*[\d,.]+k?\s+([a-z]+)/)?.[1] ?? lower.match(/\b(?:buy|buying|purchase|get)\s+(?:a|an|the)?\s*([a-z]+)/)?.[1];
      return cite(await call("what_if", { scenario: "purchase", amount, ...(item && !/^(a|an|the|for)$/.test(item) ? { label: item } : {}) }));
    }
    const category = CATEGORY_ALIASES.find(([re]) => re.test(lower))?.[1];
    if (category) return cite(await call("what_if", { scenario: "skip_category", category }));
    return "Happy to model that. Try \"What if I skip dining out for the rest of the month?\" or \"What if I buy a $900 laptop?\"";
  }

  // 2. Cancel a subscription (or explain why it can't be).
  if (/\b(cancel|unsubscribe|stop paying)\b/i.test(lower) || hint?.intent === "cancel_subscription") {
    const list = await call("list_recurring", { status: "active" });
    const items = (list.items as { id: string; merchant: string; plan: string }[]) ?? [];
    const target = items.find((i) => lower.includes(i.merchant.toLowerCase()) || lower.includes(i.id.replace(/^(sub|bill|var)_/, "")));
    if (target) {
      const r = await call("cancel_subscription", { recurring_id: target.id, confirmed: false });
      return r.status === "needs_confirmation" ? `${cite(r)}\n\nReply **yes** to confirm or **keep it** to leave it as is.` : cite(r);
    }
    return `Which one should I cancel? Your active subscriptions are: ${items.filter((i) => i.id.startsWith("sub_")).map((i) => i.merchant).join(", ")}.`;
  }

  // 3. Offers.
  if (/offer|cash ?back|deal/i.test(lower) || hint?.intent === "apply_offer") {
    const offers = await call("list_offers");
    const wantsApply = /\b(apply|redeem|use|claim|activate)\b/i.test(lower);
    const best = offers.bestOfferId as string | null;
    if (wantsApply && best) {
      const list = offers.offers as { offerId: string; transactionId: string | null }[];
      const pick = list.find((o) => lower.includes(o.offerId.split("_")[1] ?? "~")) ?? list.find((o) => o.offerId === best);
      return cite(await call("apply_offer", { offer_id: pick?.offerId ?? best, transaction_id: pick?.transactionId ?? undefined }));
    }
    return cite(offers);
  }

  // 4. Categorize.
  if (/categori[sz]|re-?label|recategori/i.test(lower) || hint?.intent === "categorize") {
    return cite(await call("categorize_transactions", {}));
  }

  // 5. Remember a fact (salary).
  const salary = /salary|i (make|earn)|paid|income/i.test(lower) ? parseSalary(m) : undefined;
  if (salary !== undefined) {
    const monthly = /month|\/mo\b/i.test(lower);
    const fact = await call("remember_fact", { key: "salary", value: `$${salary.toLocaleString("en-US")} per ${monthly ? "month" : "year"}` });
    const spend = await call("spending_summary", { granularity: "month", period: "last_month" });
    return `${cite(fact)}\n\n${cite(spend)}`;
  }
  const rememberMatch = lower.match(/remember (?:that )?(?:my )?([a-z ]{2,30}?) (?:is|=) (.+)/);
  if (rememberMatch) return cite(await call("remember_fact", { key: rememberMatch[1].trim().replace(/\s+/g, "_"), value: rememberMatch[2].trim() }));
  const forgetMatch = lower.match(/forget (?:my )?([a-z ]{2,30})/);
  if (forgetMatch) return cite(await call("forget_fact", { key: forgetMatch[1].trim().replace(/\s+/g, "_") }));

  // 6. Subscriptions / recurring.
  if (/subscri|unused|not using|recurring|bills?\b|overlap/i.test(lower)) {
    const kind = /bills?\b/i.test(lower) ? undefined : "subscription";
    return cite(await call("list_recurring", { kind }));
  }

  // 7. Spending questions.
  if (/spen[dt]|spending|how much|cost|total|average|expenses?/i.test(lower)) {
    const category = CATEGORY_ALIASES.find(([re]) => re.test(lower))?.[1];
    const period = /last month|previous month/.test(lower) ? "last_month" : /30 days|past month/.test(lower) ? "last_30_days" : /all|ever|overall/.test(lower) ? "all" : "this_month";
    const granularity = /\b(daily|per day|each day)\b/.test(lower) ? "day" : /\b(year|yearly|annual)\b/.test(lower) ? "year" : "month";
    return cite(await call("spending_summary", { granularity, period, ...(category ? { category } : {}) }));
  }

  // 8. Recent transactions.
  if (/transaction|purchase|recent/i.test(lower)) {
    const r = await call("query_transactions", { limit: 8 });
    const rows = (r.transactions as { id: string; date: string; merchant: string; amount: string }[]).map((t) => `- ${t.date} ${t.merchant}: ${t.amount} (${t.id})`);
    return `${cite(r)}\n${rows.join("\n")}`;
  }

  // 9. Default: account overview + what I can do.
  const o = await call("get_account_overview");
  return `${cite(o)}\n\nI can answer spending questions, find unused subscriptions, cancel them, apply PayPal offers, categorize transactions and remember facts like your salary.`;
}
