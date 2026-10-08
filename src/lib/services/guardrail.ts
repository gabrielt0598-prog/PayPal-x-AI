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
