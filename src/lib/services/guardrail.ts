import type { SourceDoc } from "./contracts";

// Deterministic hallucination guardrail: every money figure, percentage and transaction id the agent's
// reply states must be traceable to the ground truth it was given. Pure functions, no I/O, so they can be
// unit-checked directly (see extractFigures / checkReplyAgainstGroundTruth).

export type FigureKind = "money" | "percent";

export interface ExtractedFigure {
  kind: FigureKind;
  /** The text exactly as written in the reply, e.g. "$1,650.00". */
  raw: string;
  /** Absolute numeric value ($ and sign stripped, k/m suffix expanded). For percent: the percentage number. */
  value: number;
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// "-$9.99", "$1,650", "$ 12.5", "$2k", "US$5"
const MONEY_SYMBOL = new RegExp(String.raw`(?<![\w$])[-−–]?\s?(?:US)?\$\s?[-−–]?(${NUM})(\s?[kKmM]\b)?`, "g");
// "1650 dollars", "12.50 USD", "20 bucks"
const MONEY_WORD = new RegExp(String.raw`(?<![\w$.,])(${NUM})\s?(?:dollars?|USD|bucks)\b`, "gi");
const PERCENT = new RegExp(String.raw`(?<![\w.])(${NUM})\s?(?:%|percent\b)`, "gi");
const TXN_ID = /\btxn_[A-Za-z0-9]+\b/g;

const toNumber = (digits: string) => Number(digits.replace(/,/g, ""));

/** Pull every money figure and percentage out of free text. */
export function extractFigures(text: string): ExtractedFigure[] {
  const out: ExtractedFigure[] = [];
  for (const m of text.matchAll(MONEY_SYMBOL)) {
    let value = toNumber(m[1]);
    const suffix = m[2]?.trim().toLowerCase();
    if (suffix === "k") value *= 1_000;
    if (suffix === "m") value *= 1_000_000;
    out.push({ kind: "money", raw: m[0].trim(), value });
  }
  for (const m of text.matchAll(MONEY_WORD)) out.push({ kind: "money", raw: m[0].trim(), value: toNumber(m[1]) });
  for (const m of text.matchAll(PERCENT)) out.push({ kind: "percent", raw: m[0].trim(), value: toNumber(m[1]) });
  return out;
}

export function extractTransactionIds(text: string): string[] {
  return [...new Set(text.match(TXN_ID) ?? [])];
}

/** Remove things that look like numbers but are not figures (ISO dates, ids, card digits) before indexing the ground truth. */
function scrubGroundTruth(gt: string) {
  return gt
    .replace(/\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g, " ")
    .replace(/\btxn_[A-Za-z0-9]+\b/g, " ")
    .replace(/\b[a-z]+_[a-z0-9_]+\b/gi, " ") // sub_netflix, offer_target_5, bill_rent, user_jordan
    .replace(/••\d+/g, " ");
}

/** All absolute numeric values present in the ground truth (raw JSON numbers and formatted "$1,650.00" strings). */
export function groundTruthNumbers(groundTruth: string): number[] {
  const nums = new Set<number>();
  for (const m of scrubGroundTruth(groundTruth).matchAll(new RegExp(NUM, "g"))) {
    const n = toNumber(m[0]);
    if (Number.isFinite(n)) nums.add(n);
  }
  return [...nums];
}

const EPS = 0.011;

function moneySupported(value: number, truth: number[]): boolean {
  const isWhole = Number.isInteger(value);
  return truth.some(
    (g) =>
      Math.abs(g - value) <= EPS || // exact, with ±0.01 rounding tolerance
      (isWhole && (Math.round(g) === value || Math.trunc(g) === value)), // whole-dollar rounding of a ground-truth value
  );
}

function percentSupported(value: number, truth: number[]): boolean {
  const isWhole = Number.isInteger(value);
  return truth.some(
    (g) =>
      Math.abs(g - value) <= 0.051 || // "10%" vs 10 or 10.0
      Math.abs(g * 100 - value) <= 0.051 || // share stored as a 0..1 fraction
      (isWhole && (Math.round(g) === value || Math.round(g * 100) === value)),
  );
}

export interface DeterministicCheck {
  unsupportedFigures: string[];
  unknownTransactionIds: string[];
  /** Number of figures + ids that were checked (0 means the reply made no checkable claims). */
  checked: number;
}

export function checkReplyAgainstGroundTruth(reply: string, groundTruth: string): DeterministicCheck {
  const truth = groundTruthNumbers(groundTruth);
  const unsupported: string[] = [];
  const figures = extractFigures(reply);
  for (const f of figures) {
    const ok = f.kind === "money" ? moneySupported(f.value, truth) : percentSupported(f.value, truth);
    if (!ok && !unsupported.includes(f.raw)) unsupported.push(f.raw);
  }
  const knownIds = new Set(extractTransactionIds(groundTruth));
  const ids = extractTransactionIds(reply);
  const unknownTransactionIds = ids.filter((id) => !knownIds.has(id));
  return { unsupportedFigures: unsupported, unknownTransactionIds, checked: figures.length + ids.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// Claim-level helpers (pure): split a reply into factual claims in code, keep the citations each one carries, and
// check a claim deterministically against the sources it cites. Jev judges the same claims in live mode (see jev.ts);
// "select instead of generate": segments can be dropped and the reply rebuilt from the surviving sentences verbatim.
// ---------------------------------------------------------------------------------------------------------------------

/** `[ev_3]`, `[tool_2]`, `[ev_1, ev_4]` */
const CITE_GROUP = String.raw`\[\s*(?:ev|tool)_\d+(?:\s*[,;]\s*(?:ev|tool)_\d+)*\s*\]`;
const CITE_GROUP_RE = new RegExp(CITE_GROUP, "g");
const CITE_ID_RE = /(?:ev|tool)_\d+/g;
const SENTENCE_RE = new RegExp(String.raw`.+?(?:[.!?]+["')*_]*(?:\s*${CITE_GROUP})*(?=\s|$)|$)`, "g");
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

export interface ReplySegment {
  /** Index of the line in the reply this sentence belongs to. */
  line: number;
  /** Leading list marker / indentation of the line (only on its first segment). */
  prefix: string;
  /** The sentence exactly as written (markdown and citations included). */
  raw: string;
  /** The sentence without citations / markdown, used as the claim text. */
  text: string;
  citations: string[];
  /** False for greetings, questions, confirmation prompts and other non-factual text. */
  isClaim: boolean;
}

export function extractCitations(text: string): string[] {
  const ids = new Set<string>();
  for (const g of text.match(CITE_GROUP_RE) ?? []) for (const id of g.match(CITE_ID_RE) ?? []) ids.add(id);
  return [...ids];
}

export function stripCitations(text: string): string {
  return text.replace(CITE_GROUP_RE, "").replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;!?])/g, "$1").trim();
}

const plain = (s: string) => stripCitations(s).replace(/\*\*|__|`/g, "").trim();

const NON_FACTUAL = [
  /^(hi|hello|hey|sure|ok|okay|thanks|thank you|great|alright|no problem|got it|done|absolutely|of course)\b/i,
  /\b(reply|respond|say|type)\b.*\b(yes|keep)\b/i,
  /\b(would you like|do you want|want me to|should i|shall i|let me know|could you|can you|which one|i can (also )?(help|answer|find|cancel|apply|categori[sz]e|remember))\b/i,
  /^(i (don't|do not|can't|cannot|couldn't|could not|wasn't|am not able)|sorry|unfortunately|i'd rather|i would rather|nothing was changed)\b/i,
];

function hasCheckable(text: string): boolean {
  return extractFigures(text).length > 0 || extractTransactionIds(text).length > 0 || /\d{4}-\d{2}-\d{2}/.test(text);
}

/** Greetings, questions, confirmation prompts and hedges are not claims, unless they quote a figure/id/date. */
export function isFactualClaim(text: string): boolean {
  const t = text.trim();
  if (!t || t.split(/\s+/).length < 3) return hasCheckable(t);
  if (hasCheckable(t)) return true;
  if (t.endsWith("?")) return false;
  return !NON_FACTUAL.some((re) => re.test(t));
}

/** Split a reply into sentence segments, line by line, remembering list markers so it can be rebuilt. */
export function segmentReply(reply: string): ReplySegment[] {
  const out: ReplySegment[] = [];
  reply.split("\n").forEach((line, i) => {
    const marker = line.match(/^(\s*(?:[-*•]|\d+[.)])\s+)/);
    const prefix = marker ? marker[1] : "";
    const body = line.slice(prefix.length);
    if (!body.trim()) return;
    let first = true;
    for (const m of body.matchAll(SENTENCE_RE)) {
      const raw = m[0].trim();
      if (!raw) continue;
      const text = plain(raw);
      out.push({ line: i, prefix: first ? prefix : "", raw, text, citations: extractCitations(raw), isClaim: isFactualClaim(text) });
      first = false;
    }
  });
  return out;
}

/** Rebuild a reply from the segments to keep (verbatim sentences, original list markers and blank lines between paragraphs). */
export function rebuildReply(segments: ReplySegment[], keep: (s: ReplySegment) => boolean): string {
  const lines = new Map<number, string>();
  let lastLine = -1;
  const order: number[] = [];
  for (const s of segments) {
    if (!keep(s)) continue;
    const cur = lines.get(s.line);
    if (cur === undefined) {
      order.push(s.line);
      lines.set(s.line, (s.prefix || "") + s.raw);
    } else lines.set(s.line, `${cur} ${s.raw}`);
  }
  const result: string[] = [];
  for (const ln of order) {
    if (lastLine >= 0 && ln - lastLine > 1) result.push("");
    result.push(lines.get(ln)!);
    lastLine = ln;
  }
  return result.join("\n").trim();
}

export interface ClaimCheckDeterministic {
  ok: boolean;
  /** What could not be found in the sources: figures, ids, dates, entity names. */
  missing: string[];
}

/** Deterministic claim check: every figure, id, date and known entity name in the claim must appear in `sourceText`. */
export function checkClaimAgainstSources(claim: string, sourceText: string, entities: readonly string[] = []): ClaimCheckDeterministic {
  const det = checkReplyAgainstGroundTruth(claim, sourceText);
  const missing = [...det.unsupportedFigures, ...det.unknownTransactionIds];
  for (const d of claim.match(ISO_DATE) ?? []) if (!sourceText.includes(d)) missing.push(d);
  const lowerSources = sourceText.toLowerCase();
  for (const e of entities) {
    // Case-sensitive in the claim ("Max" the service, not "max" the word); case-insensitive in the sources.
    if (e.length < 3) continue;
    const re = new RegExp(String.raw`(?<![\w])${e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\w])`);
    if (re.test(claim) && !lowerSources.includes(e.toLowerCase())) missing.push(e);
  }
  return { ok: missing.length === 0, missing };
}

/** Join sources (all, or only the cited ones) into one searchable string. */
export function sourceText(sources: readonly SourceDoc[], ids?: readonly string[]): string {
  const pick = ids && ids.length ? sources.filter((s) => ids.includes(s.id)) : sources;
  return pick.map((s) => `${s.title ?? ""} ${s.text}`).join("\n");
}
