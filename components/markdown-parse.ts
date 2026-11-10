/**
 * Pure markdown block parsing for chat. No React Native imports, so it can be
 * unit-tested under plain Node.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "ul" | "ol"; items: Array<{ text: string; depth: number; n?: number }> }
  | { type: "quote"; text: string }
  | { type: "code"; text: string; lang?: string }
  | { type: "hr" };

/** Close constructs the model hasn't finished yet so partial text renders cleanly. */
export function closeOpenMarkers(src: string): string {
  let text = src;
  if ((text.match(/```/g)?.length ?? 0) % 2 === 1) return `${text}\n\`\`\``;
  const lastBreak = text.lastIndexOf("\n\n");
  const head = lastBreak >= 0 ? text.slice(0, lastBreak + 2) : "";
  let tail = lastBreak >= 0 ? text.slice(lastBreak + 2) : text;
  tail = tail.replace(/(^|[^*\\])\*$/, "$1"); // dangling single asterisk
  tail = tail.replace(/(^|[^\\])\[([^\]]*)$/, "$1$2"); // unfinished link text
  if ((tail.match(/\*\*/g)?.length ?? 0) % 2 === 1) tail += "**";
  if ((tail.match(/(^|[^`])`(?!`)/g)?.length ?? 0) % 2 === 1) tail += "`";
  if ((tail.match(/~~/g)?.length ?? 0) % 2 === 1) tail += "~~";
  return head + tail;
}

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Extract<Block, { type: "ul" | "ol" }> | null = null;
  let quote: string[] = [];

  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join("\n") }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  const flushQuote = () => { if (quote.length) { blocks.push({ type: "quote", text: quote.join("\n") }); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      flushAll();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { body.push(lines[i]); i += 1; }
      blocks.push({ type: "code", text: body.join("\n"), lang: fence[1] || undefined });
      continue;
    }
    if (!line.trim()) { flushAll(); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); blocks.push({ type: "hr" }); continue; }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) { flushAll(); blocks.push({ type: "h", level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, "") }); continue; }

    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }

    const bullet = line.match(/^(\s*)[-*•+]\s+(.*)$/);
    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (bullet || ordered) {
      flushPara(); flushQuote();
      const kind = bullet ? "ul" : "ol";
      if (!list || list.type !== kind) { flushList(); list = { type: kind, items: [] }; }
      const indent = (bullet ? bullet[1] : ordered![1]).replace(/\t/g, "  ").length;
      list.items.push({
        text: bullet ? bullet[2] : ordered![3],
        depth: Math.min(2, Math.floor(indent / 2)),
        n: ordered ? Number(ordered[2]) : undefined,
      });
      continue;
    }

    // Soft-wrapped continuation of a list item.
    if (list && /^\s+\S/.test(line)) { list.items[list.items.length - 1].text += ` ${line.trim()}`; continue; }

    flushList(); flushQuote();
    para.push(line);
  }
  flushAll();
  return blocks;
}

