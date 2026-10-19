import { runDecision, score1To5, WardrobeApiError, type SystemOneAnswers } from "@/services/api/wardrobe-api";
import type { Item, Outfit } from "@/data/mock";

/**
 * Typed decision helpers backed by Clef-flash (Jev/System One compatible).
 * Every helper is one small /v1/decide call — 38ms, fractions of a cent, no
 * output billing. Failures throw WardrobeApiError; callers decide fallbacks.
 */

function noulOf(answers: SystemOneAnswers, key: string): number | null {
  const a = answers[key];
  return a && a.type === "noul" ? a.noul : null;
}

function choiceOf(answers: SystemOneAnswers, key: string): { choice: string; confidence: number; probabilities: Record<string, number> } | null {
  const a = answers[key];
  return a && a.type === "choice" ? { choice: a.choice, confidence: a.confidence, probabilities: a.probabilities } : null;
}

function scoreOf(answers: SystemOneAnswers, key: string): number | null {
  const a = answers[key];
  return a && a.type === "score" ? score1To5(a.score) : null;
}

export type WardrobeDiff =
  | { kind: "added"; items: Item[] }
  | { kind: "deleted"; itemIds: string[] }
  | { kind: "edited"; items: Item[]; changedFields: string[][] };

export type TriageVerdict = {
  regenerate: boolean;
  reason: string;
  impact: string;
};

/**
 * Decide whether a wardrobe diff is worth a full restyle session.
 * Hard-rule pre-checks live in use-daily-looks; this is the judgment call
 * ("is a 4th pair of white sneakers worth restyling today's looks?").
 */
export async function triageWardrobeDiff(
  diff: WardrobeDiff,
  todayLooks: Outfit[],
  wardrobe: Item[],
): Promise<TriageVerdict> {
  const roleCounts: Record<string, number> = {};
  for (const item of wardrobe) roleCounts[item.role] = (roleCounts[item.role] ?? 0) + 1;

  const state = {
    diff,
    role_counts: roleCounts,
    total_items: wardrobe.length,
    today_looks: todayLooks.map((look) => ({ label: look.label, item_ids: look.itemIds })),
  };

  const answers = await runDecision(state, {
    restyle: {
      type: "noul",
      instructions: "Is restyling today's looks worth triggering a full generation session for this wardrobe change?",
    },
    impact: {
      type: "choice",
      instructions: "What is the most likely impact of this change on today's looks?",
      criteria: {
        breaks_a_look: "A deleted or edited item is used in one of today's looks, or the change clearly invalidates them.",
        unlocks_new_combos: "A genuinely new piece (new role/color/formality) that opens outfit structures that did not exist before.",
        redundant: "The change duplicates what the closet (and today's looks) already cover well.",
        minor_addition: "A small addition (accessory, one more of something common) unlikely to change good looks.",
      },
    },
  });

  const restyle = noulOf(answers, "restyle");
  const impact = choiceOf(answers, "impact");
  return {
    regenerate: (restyle ?? 0) >= 0.7,
    reason: restyle == null ? "decision unavailable" : `restyle probability ${restyle.toFixed(2)}`,
    impact: impact?.choice ?? "unknown",
  };
}

export type ParsedStylingPrompt = {
  occasion: string;
  formality: number;
  warmth: number;
  styleVibe: string;
  isStylingRequest: boolean;
};

const OCCASIONS = ["dinner", "work", "casual", "date", "event", "travel", "everyday"] as const;
const STYLE_VIBES = ["minimal", "old_money", "streetwear", "clean_girl", "office", "evening"] as const;

/** Parse a free-text chat prompt into structured context for the agent. */
export async function parseStylingPrompt(prompt: string): Promise<ParsedStylingPrompt> {
  const answers = await runDecision(prompt, {
    is_styling: { type: "noul", instructions: "Is the user asking for outfit styling, outfit ideas, or wardrobe help?" },
    occasion: {
      type: "choice",
      instructions: "What occasion is closest to this request?",
      criteria: Object.fromEntries(OCCASIONS.map((o) => [o, o])),
    },
    formality: { type: "score", instructions: "How dressy should the outfit be? 1 = very casual, 5 = formal.", criteria: ["1", "2", "3", "4", "5"] },
    warmth: { type: "score", instructions: "How warm should the layers be? 1 = light/breathable, 5 = heavy/cold-weather.", criteria: ["1", "2", "3", "4", "5"] },
    style_vibe: {
      type: "choice",
      instructions: "Which style aesthetic is closest?",
      criteria: Object.fromEntries(STYLE_VIBES.map((v) => [v, v])),
    },
  });

  return {
    occasion: choiceOf(answers, "occasion")?.choice ?? "everyday",
    formality: Math.round(scoreOf(answers, "formality") ?? 3),
    warmth: Math.round(scoreOf(answers, "warmth") ?? 3),    styleVibe: choiceOf(answers, "style_vibe")?.choice ?? "minimal",
    // Calibrated on live clef-flash: a clear styling ask scores ~0.63–0.95 in
    // this combined call (0.77 when asked alone), while chit-chat sits ~0.01.
    // 0.7 misfired on real prompts, so the gate is 0.5 — a wide margin either way.
    isStylingRequest: (noulOf(answers, "is_styling") ?? 0) >= 0.5,
  };
}

export type RetryDirection =
  | "shift_palette"
  | "change_formality"
  | "different_silhouette"
  | "lighter_layers"
  | "dressier";

/** After a rejection, pick a targeted direction for the retry session. */
export async function decideRetryDirection(
  rejectedLabels: string[],
  rejectedItemIds: string[][],
  originalPrompt: string,
): Promise<RetryDirection> {
  const state = {
    original_prompt: originalPrompt,
    rejected: rejectedLabels.map((label, i) => ({ label, item_ids: rejectedItemIds[i] ?? [] })),
  };
  const answers = await runDecision(state, {
    direction: {
      type: "choice",
      instructions: "What single direction should the next styling attempt take to be visibly different from what was rejected?",
      criteria: {
        shift_palette: "Change the color story (different neutrals or accent colors).",
        change_formality: "Move up or down the formality scale.",
        different_silhouette: "Different silhouette / hero piece / proportions.",
        lighter_layers: "Fewer or lighter layers.",
        dressier: "Noticeably dressier / more elevated pieces.",
      },
    },
  });
  const direction = choiceOf(answers, "direction")?.choice;
  return (direction as RetryDirection) ?? "different_silhouette";
}

/** Courtesy gate after repeated try-agains. */
export async function shouldAskToNarrowDown(retryCount: number, originalPrompt: string): Promise<boolean> {
  if (retryCount < 2) return false;
  try {
    const answers = await runDecision({ retry_count: retryCount, original_prompt: originalPrompt }, {
      narrow: { type: "noul", instructions: "Should the assistant ask the user to narrow down their request instead of retrying again?" },
    });
    return (noulOf(answers, "narrow") ?? 0) >= 0.6;
  } catch {
    return retryCount >= 3;
  }
}

export type CoherenceVerdict = { ok: boolean; paletteScore: number; issues: string[] };

/** Taste gate after deterministic verify/repair: catch "valid but ugly". */
export async function checkCoherence(
  outfitItemIds: string[],
  wardrobe: Item[],
  context: { occasion: string; season?: string; styleTags?: string[] },
): Promise<CoherenceVerdict> {
  const items = outfitItemIds
    .map((id) => wardrobe.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item))
    .map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      primaryColor: item.primaryColor,
      secondaryColors: item.secondaryColors,
      formality: item.formality,
      warmth: item.warmthBand,
      styleTags: item.styleTags,
    }));

  const answers = await runDecision({ outfit: items, context }, {
    coherent: {
      type: "noul",
      instructions: "Does this outfit read as one cohesive look for the stated occasion (not two outfits stitched together, nothing obviously missing)?",
    },
    palette: { type: "score", instructions: "How cohesive is the color palette? 1 = clashing, 5 = excellent.", criteria: ["1", "2", "3", "4", "5"] },
  });

  const coherent = (noulOf(answers, "coherent") ?? 0) >= 0.6;
  const paletteScore = scoreOf(answers, "palette") ?? 3;
  const issues: string[] = [];
  if (!coherent) issues.push("cohesion");
  if (paletteScore < 2.5) issues.push("palette");
  return { ok: coherent && paletteScore >= 2.5, paletteScore, issues };
}

/**
 * Salvage a failed session: pick the best available candidate (or fall back
 * to rules) instead of burning a full retry session.
 */
export async function salvageCandidates(
  candidates: Array<{ label: string; item_ids: string[] }>,
  context: { occasion: string; styleTags?: string[] },
): Promise<{ label: string; item_ids: string[] } | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const answers = await runDecision({ candidates, context }, {
    best: {
      type: "choice",
      instructions: "Which candidate is the best outfit for the stated occasion?",
      criteria: Object.fromEntries(candidates.map((c, i) => [`c${i}`, c.label || `Candidate ${i + 1}`])),
    },
  });
  const best = choiceOf(answers, "best")?.choice;
  const index = best ? Number(best.replace("c", "")) : NaN;
  return Number.isFinite(index) && candidates[index] ? candidates[index] : candidates[0];
}

export { WardrobeApiError };
