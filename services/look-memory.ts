import { readPreferenceValue, writePreference } from "@/services/storage/wardrobe-repository";

/**
 * Look memory: what the stylist already showed and what the user rejected.
 * Used two ways: an "avoid" note in the prompt (so the model does not propose
 * repeats) and a hard filter on its output (so a repeat never reaches the UI
 * even if the model ignores the note).
 */

export type LookStatus = "shown" | "disliked";

export type MemoryEntry = { key: string; itemIds: string[]; label: string; status: LookStatus; at: number };

export type BlockedLook = { itemIds: string[]; label: string; reason: "disliked" | "seen recently" | "already saved"; hard: boolean };

type LookLike = { itemIds: string[]; label: string };

const STORAGE_KEY = "look_memory_v1";
const CAP = 160;
/** A look shown within this window counts as a repeat. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
/** Jaccard overlap at which two looks read as the same outfit (e.g. one accessory swapped). */
const SAME_LOOK = 0.6;

export const lookKey = (itemIds: string[]) => [...new Set(itemIds)].sort().join("|");

export function similarity(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const id of left) if (right.has(id)) shared += 1;
  return shared / (left.size + right.size - shared);
}

let cache: MemoryEntry[] | null = null;

/** Drop the in-session copy so the next read hits storage (used by tests). */
export function resetLookMemoryCache() {
  cache = null;
}

export async function loadLookMemory(): Promise<MemoryEntry[]> {
  if (cache) return cache;
  try {
    const raw = await readPreferenceValue(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as MemoryEntry[]) : [];
    cache = Array.isArray(parsed) ? parsed.filter((entry) => Array.isArray(entry?.itemIds)) : [];
    return cache;
  } catch {
    // Do not cache a failed read; the next call tries again.
    return [];
  }
}

async function persist(entries: MemoryEntry[]) {
  cache = entries;
  await writePreference(STORAGE_KEY, JSON.stringify(entries)).catch(() => undefined);
}

export async function rememberLooks(looks: LookLike[], status: LookStatus): Promise<void> {
  if (looks.length === 0) return;
  const memory = [...(await loadLookMemory())];
  const now = Date.now();
  for (const look of looks) {
    if (look.itemIds.length === 0) continue;
    const key = lookKey(look.itemIds);
    const index = memory.findIndex((entry) => entry.key === key);
    if (index >= 0) {
      // A dislike is permanent; merely seeing it again must not soften it.
      const keepStatus = memory[index].status === "disliked" ? "disliked" : status;
      memory[index] = { ...memory[index], status: keepStatus, at: now };
    } else {
      memory.push({ key, itemIds: look.itemIds, label: look.label, status, at: now });
    }
  }
  memory.sort((a, b) => b.at - a.at);
  // Never evict dislikes to make room for "shown" noise.
  const disliked = memory.filter((entry) => entry.status === "disliked");
  const shown = memory.filter((entry) => entry.status === "shown").slice(0, Math.max(0, CAP - disliked.length));
  await persist([...disliked, ...shown].sort((a, b) => b.at - a.at));
}

export const dislikeLook = (look: LookLike) => rememberLooks([look], "disliked");

/** Undo a dislike (the user changed their mind). The look goes back to plain "shown". */
export async function undislikeLook(look: LookLike): Promise<void> {
  const key = lookKey(look.itemIds);
  const memory = await loadLookMemory();
  if (!memory.some((entry) => entry.key === key && entry.status === "disliked")) return;
  await persist(memory.map((entry) => (entry.key === key ? { ...entry, status: "shown" as const, at: Date.now() } : entry)));
}

/** Everything the next batch should not repeat. `saved` are looks the user already owns. */
export function blockedLooks(memory: MemoryEntry[], saved: LookLike[] = [], now = Date.now()): BlockedLook[] {
  const blocked: BlockedLook[] = [];
  for (const entry of memory) {
    if (entry.status === "disliked") blocked.push({ itemIds: entry.itemIds, label: entry.label, reason: "disliked", hard: true });
    else if (now - entry.at < RECENT_MS) blocked.push({ itemIds: entry.itemIds, label: entry.label, reason: "seen recently", hard: false });
  }
  for (const look of saved) blocked.push({ itemIds: look.itemIds, label: look.label, reason: "already saved", hard: false });
  return blocked;
}

const repeats = (look: LookLike, blocked: BlockedLook[]) => blocked.some((entry) => similarity(look.itemIds, entry.itemIds) >= SAME_LOOK);

/**
 * Drop repeats. Disliked looks are always removed. Seen/saved repeats are removed
 * too, unless that would leave nothing (a small closet can only make so many
 * looks), in which case the least-bad leftovers are kept.
 */
export function pickFresh<T extends LookLike>(looks: T[], blocked: BlockedLook[]): { looks: T[]; onlyRepeats: boolean } {
  const notDisliked = looks.filter((look) => !repeats(look, blocked.filter((entry) => entry.hard)));
  const fresh = notDisliked.filter((look) => !repeats(look, blocked));
  if (fresh.length > 0) return { looks: fresh, onlyRepeats: false };
  return { looks: notDisliked, onlyRepeats: notDisliked.length > 0 };
}

/** Prompt block telling the stylist what to steer away from. */
export function avoidNote(blocked: BlockedLook[], options: { hardOnly?: boolean; passive?: boolean } = {}): string {
  const pool = (options.hardOnly ? blocked.filter((entry) => entry.hard) : blocked)
    .sort((a, b) => Number(b.hard) - Number(a.hard))
    .slice(0, 14);
  if (pool.length === 0) return "";
  const lines = pool.map((entry) => `- ${entry.label} = ${entry.itemIds.join(" + ")} (${entry.reason})`);
  return [
    "",
    "<avoid_looks>",
    options.passive
      ? "Background only. The user rejected these combinations in the past. IF you later show outfits, steer clear of them. Otherwise ignore this list entirely. It is not a request to build outfits. Never mention it."
      : "Do not propose these combinations again, or ones that only swap a single accessory. Build visibly different looks. Never mention this list to the user.",
    ...lines,
    "</avoid_looks>",
  ].join("\n");
}
