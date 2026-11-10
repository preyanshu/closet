/**
 * After every tool call the model tends to re-introduce its answer, so one
 * reply can contain the same opening line several times. These helpers spot a
 * block that repeats earlier text, including one that is still streaming in.
 */

const normalize = (text: string) =>
  text.toLowerCase().replace(/[*_`#>]/g, " ").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

const tokens = (text: string) => new Set(text.split(" ").filter(Boolean));

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** True if `text` repeats something in `earlier` (same text, a growing prefix of it, or nearly the same words). */
export function isRepeat(text: string, earlier: string[]): boolean {
  const n = normalize(text);
  if (n.length < 8) return false;
  const nTokens = tokens(n);
  return earlier.some((previous) => {
    const m = normalize(previous);
    if (!m) return false;
    // A block still streaming in that matches the start of an earlier one.
    if (m.startsWith(n)) return true;
    const ratio = Math.min(n.length, m.length) / Math.max(n.length, m.length);
    return ratio > 0.6 && overlap(nTokens, tokens(m)) >= 0.75;
  });
}

/** Keep the first occurrence of each block, drop later repeats. */
export function dropRepeatedText<T>(blocks: T[], textOf: (block: T) => string): T[] {
  const kept: T[] = [];
  const seen: string[] = [];
  for (const block of blocks) {
    const text = textOf(block);
    if (isRepeat(text, seen)) continue;
    kept.push(block);
    seen.push(text);
  }
  return kept;
}

/** Within one block, drop a paragraph that repeats an earlier paragraph of the same block. */
export function dedupeParagraphs(text: string): string {
  if (!/\n\s*\n/.test(text)) return text;
  const paragraphs = text.split(/\n\s*\n/);
  return dropRepeatedText(paragraphs, (paragraph) => paragraph).join("\n\n");
}
