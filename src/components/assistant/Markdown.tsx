import type { ReactNode } from "react";

// Tiny markdown subset: **bold**, `code`, "-"/"*" and "1." lists, line breaks, plus [ev_3] / [tool_2] citations
// (rendered by the optional `cite` callback, e.g. as small chips; dropped from view when there is no callback).
const CITE = String.raw`\[\s*(?:ev|tool)_\d+(?:\s*[,;]\s*(?:ev|tool)_\d+)*\s*\]`;
const SPLIT = new RegExp(String.raw`(\*\*[^*]+\*\*|\`[^\`]+\`|${CITE})`, "g");
const IS_CITE = new RegExp(`^${CITE}$`);

export type CiteRenderer = (id: string, key: string) => ReactNode;

function inline(text: string, keyBase: string, cite?: CiteRenderer): ReactNode[] {
  return text.split(SPLIT).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (IS_CITE.test(part)) {
      if (!cite) return part;
      const ids = part.match(/(?:ev|tool)_\d+/g) ?? [];
      return <span key={key} className="mx-0.5 inline-flex gap-0.5 align-baseline">{ids.map((id, j) => cite(id, `${key}-${j}`))}</span>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={key} className="font-semibold text-text">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={key} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

export function Markdown({ text, cite }: { text: string; cite?: CiteRenderer }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"} marker:text-faint`}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `li${blocks.length}-${i}`, cite)}</li>)}
      </Tag>,
    );
    list = null;
  };
  text.split("\n").forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]);
      return;
    }
    flush();
    if (!line.trim()) { blocks.push(<div key={`s${idx}`} className="h-2" />); return; }
    blocks.push(<p key={`p${idx}`}>{inline(line, `p${idx}`, cite)}</p>);
  });
  flush();
  return <div className="space-y-0.5 break-words text-[14px] leading-relaxed text-text">{blocks}</div>;
}
