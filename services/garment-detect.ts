import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import type { ClothingCategory } from "@/data/mock";
import { isWardrobeApiConfigured, runDecision, score1To5, WardrobeApiError } from "@/services/api/wardrobe-api";
import type { AiAttribute, WarmthBand } from "@/types/domain";

/**
 * Bounded-attribute garment extraction on Clef-flash (multimodal decision
 * call). No free-form JSON: every attribute is a typed choice/score question
 * with probabilities, so we get per-field confidence and feed
 * AiAttribute.reviewStatus (auto-confirm high confidence, tap-to-confirm the
 * rest). Names come from a deterministic template, never the model.
 */

const MAX_INPUT = 768;
/** At/above this confidence an attribute is stored as already confirmed. */
export const AUTO_CONFIRM_THRESHOLD = 0.85;

const CATEGORY_VALUES = ["top", "bottom", "outerwear", "shoes", "accessory"] as const;
const COLOR_VALUES = [
  "black", "white", "cream", "gray", "navy", "blue", "green",
  "red", "pink", "brown", "beige", "tan", "camel", "yellow", "purple", "orange",
] as const;
const FIT_VALUES = ["slim", "regular", "relaxed", "oversized", "wide"] as const;
const SLEEVE_VALUES = ["sleeveless", "short", "three-quarter", "long"] as const;
const PATTERN_VALUES = ["solid", "striped", "plaid", "floral", "graphic", "other"] as const;
const TEXTURE_VALUES = ["smooth", "knit", "denim", "woven", "fleece", "leather-like", "satin-like"] as const;

const FORMALITY_BY_SCORE: Record<number, string> = { 1: "casual", 2: "casual", 3: "smart-casual", 4: "formal", 5: "formal" };
const WARMTH_BY_SCORE: Record<number, WarmthBand> = { 1: "light", 2: "light", 3: "medium", 4: "heavy", 5: "heavy" };

const CATEGORY_NOUN: Record<ClothingCategory, string> = {
  top: "top",
  bottom: "bottom",
  outerwear: "jacket",
  shoes: "shoes",
  accessory: "accessory",
};

export type GarmentAttributes = {
  category: ClothingCategory;
  name: string;
  primary_color: string;
  secondary_colors: string[];
  fit: string;
  sleeve_length: string;
  pattern: string;
  material: string;
  formality: string;
  warmth: WarmthBand;
  /** Per-field model confidence in [0, 1]. */
  confidences: Record<string, number>;
  /** Fields below AUTO_CONFIRM_THRESHOLD — surface as tap-to-confirm chips. */
  suggestedFields: string[];
};

function log(...args: unknown[]) {
  try {
    // eslint-disable-next-line no-console
    console.log("[garment-detect]", ...args);
  } catch {}
}

function normalizeColor(c: string): string {
  const value = (c ?? "").trim().toLowerCase();
  if (!value) return "black";
  const match = (COLOR_VALUES as readonly string[]).find((f) => value === f || value.includes(f));
  return match ?? value;
}

/** Deterministic, editable name template — the model never writes names. */
function templateName(color: string, fit: string, pattern: string, category: ClothingCategory): string {
  const parts = [color || "unknown"];
  if (fit && fit !== "regular") parts.push(fit);
  if (pattern && pattern !== "solid") parts.push(pattern);
  parts.push(CATEGORY_NOUN[category] ?? "piece");
  const name = parts.join(" ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const CATEGORY_KEYWORDS: Array<[ClothingCategory, string[]]> = [
  ["shoes", ["shoe", "sneaker", "boot", "loafer", "heel", "sandal", "trainer"]],
  ["accessory", ["bag", "belt", "hat", "scarf", "jewelry", "necklace", "earring", "watch", "gloves", "cap", "purse", "wallet", "sunglasses"]],
  ["outerwear", ["coat", "jacket", "blazer", "cardigan", "puffer", "parka", "windbreaker", "vest"]],
  ["bottom", ["jean", "pant", "trouser", "skirt", "shorts", "denim", "legging", "pants"]],
  ["top", ["shirt", "t-shirt", "tee", "hoodie", "sweater", "knit", "polo", "blouse", "tank", "sweatshirt", "dress", "jersey"]],
];

export function mapCategory(raw: string | undefined | null): ClothingCategory {
  const value = (raw ?? "").toLowerCase();
  if ((["top", "bottom", "outerwear", "shoes", "accessory"] as ClothingCategory[]).includes(value as ClothingCategory)) {
    return value as ClothingCategory;
  }
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => value.includes(k))) return cat;
  }
  return "top";
}

export function suggestAesthetics(attrs: Partial<GarmentAttributes>): string[] {
  const tags = new Set<string>();
  const haystack = [attrs.category, attrs.name, attrs.fit, attrs.pattern, attrs.sleeve_length, attrs.material, attrs.formality]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(office|blouse|trouser|shirt|blazer|loafer|suit|silk|charcoal|tailored)/.test(haystack)) tags.add("office");
  if (/(oversized|hoodie|sneaker|graphic|street|cap|denim|puffer)/.test(haystack)) tags.add("streetwear");
  if (/(knit|wool|camel|cashmere|coat|loafer|pearl|prep)/.test(haystack)) tags.add("old-money");
  if (/(white|cream|ivory|clean|tank|linen|minimal)/.test(haystack)) tags.add("clean-girl");
  if (/(silk|satin|slip|evening|black|dress|heel)/.test(haystack)) tags.add("evening");
  if (/(minimal|solid|black|white|tailored|straight)/.test(haystack)) tags.add("minimal");

  if (tags.size === 0) tags.add("minimal");
  return [...tags];
}

/** Build AiAttribute evidence rows from a detection result. */
export function toAiAttributes(attrs: GarmentAttributes): AiAttribute[] {
  const now = new Date().toISOString();
  const fields: Array<[string, string]> = [
    ["category", attrs.category],
    ["primary_color", attrs.primary_color],
    ["fit", attrs.fit],
    ["sleeve_length", attrs.sleeve_length],
    ["pattern", attrs.pattern],
    ["texture", attrs.material],
    ["formality", attrs.formality],
    ["warmth", attrs.warmth],
  ];
  return fields
    .filter(([, value]) => Boolean(value))
    .map(([field, value]) => {
      const confidence = attrs.confidences[field] ?? 0;
      return {
        field,
        value,
        source: "vision_model" as const,
        modelVersion: "clef-flash",
        schemaVersion: 1,
        reviewStatus: (confidence >= AUTO_CONFIRM_THRESHOLD ? "confirmed" : "suggested") as AiAttribute["reviewStatus"],
        confidence,
        generatedAt: now,
      };
    });
}

/**
 * Clef's own `confidence` is a weak signal (often ~0.1 even for peaked
 * answers); the probability mass on the chosen label is the honest one.
 */
function bestProbability(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const values = Object.values(raw as Record<string, unknown>).filter((value): value is number => typeof value === "number");
  return values.length > 0 ? Math.max(...values) : null;
}

function choiceAnswer(answers: Record<string, unknown>, key: string): { choice: string; confidence: number } | null {
  const answer = answers[key] as { type?: string; choice?: string; confidence?: number; probabilities?: unknown } | undefined;
  if (answer?.type === "choice" && typeof answer.choice === "string") {
    const confidence = bestProbability(answer.probabilities) ?? (typeof answer.confidence === "number" ? answer.confidence : 0);
    return { choice: answer.choice, confidence };
  }
  return null;
}

function scoreAnswer(answers: Record<string, unknown>, key: string): { score: number; confidence: number } | null {
  const answer = answers[key] as { type?: string; score?: number; confidence?: number; probabilities?: unknown } | undefined;
  if (answer?.type === "score" && typeof answer.score === "number") {
    const confidence = bestProbability(answer.probabilities) ?? (typeof answer.confidence === "number" ? answer.confidence : 0);
    return { score: score1To5(answer.score), confidence };
  }
  return null;
}

function bandFor<T>(map: Record<number, T>, score: number, fallback: T): T {
  const rounded = Math.min(5, Math.max(1, Math.round(score)));
  return map[rounded] ?? fallback;
}

export async function detectGarment(uri: string): Promise<GarmentAttributes> {
  log("detectGarment called, input uri:", uri);

  if (!isWardrobeApiConfigured()) {
    log("ERROR: wardrobe API not configured");
    throw new WardrobeApiError("Wardrobe API not configured (set EXPO_PUBLIC_WARDROBE_API_URL).");
  }

  let resized;
  try {
    resized = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_INPUT } }],
      { compress: 0.9, format: SaveFormat.JPEG }
    );
    log("Downscaled OK, resized.uri:", resized.uri);
  } catch (e: any) {
    log("ERROR: manipulateAsync (downscale) failed:", e);
    throw new Error(`Failed to downscale image: ${e?.message ?? e}`);
  }

  let dataUri: string;
  try {
    const b64 = await new File(resized.uri).base64();
    dataUri = `data:image/jpeg;base64,${b64}`;
  } catch (e: any) {
    log("ERROR: base64 encode failed:", e);
    throw new Error(`Failed to read image: ${e?.message ?? e}`);
  }

  const answers = await runDecision(
    { task: "extract_garment_attributes", note: "Answer from the photo; pick the closest allowed value." },
    {
      category: { type: "choice", instructions: "What kind of garment is this?", criteria: Object.fromEntries(CATEGORY_VALUES.map((v) => [v, v])) },
      primary_color: { type: "choice", instructions: "What is the dominant color?", criteria: Object.fromEntries(COLOR_VALUES.map((v) => [v, v])) },
      fit: { type: "choice", instructions: "How does it fit?", criteria: Object.fromEntries(FIT_VALUES.map((v) => [v, v])) },
      sleeve_length: { type: "choice", instructions: "Sleeve/leg length as visible. If not applicable, pick the closest.", criteria: Object.fromEntries(SLEEVE_VALUES.map((v) => [v, v])) },
      pattern: { type: "choice", instructions: "What is the pattern?", criteria: Object.fromEntries(PATTERN_VALUES.map((v) => [v, v])) },
      texture: { type: "choice", instructions: "What is the visible surface texture?", criteria: Object.fromEntries(TEXTURE_VALUES.map((v) => [v, v])) },
      formality: { type: "score", instructions: "How dressy is this piece? 1 = very casual, 5 = formal.", criteria: ["1", "2", "3", "4", "5"] },
      warmth: { type: "score", instructions: "How warm is this piece? 1 = light/breathable, 5 = heavy/cold-weather.", criteria: ["1", "2", "3", "4", "5"] },
    },
    [dataUri],
  );

  const categoryAnswer = choiceAnswer(answers, "category");
  const colorAnswer = choiceAnswer(answers, "primary_color");
  const fitAnswer = choiceAnswer(answers, "fit");
  const sleeveAnswer = choiceAnswer(answers, "sleeve_length");
  const patternAnswer = choiceAnswer(answers, "pattern");
  const textureAnswer = choiceAnswer(answers, "texture");
  const formalityAnswer = scoreAnswer(answers, "formality");
  const warmthAnswer = scoreAnswer(answers, "warmth");

  const confidences: Record<string, number> = {
    category: categoryAnswer?.confidence ?? 0,
    primary_color: colorAnswer?.confidence ?? 0,
    fit: fitAnswer?.confidence ?? 0,
    sleeve_length: sleeveAnswer?.confidence ?? 0,
    pattern: patternAnswer?.confidence ?? 0,
    texture: textureAnswer?.confidence ?? 0,
    formality: formalityAnswer?.confidence ?? 0,
    warmth: warmthAnswer?.confidence ?? 0,
  };

  const category = mapCategory(categoryAnswer?.choice);
  const primaryColor = normalizeColor(colorAnswer?.choice ?? "black");
  const fit = fitAnswer?.choice ?? "regular";
  const pattern = patternAnswer?.choice ?? "solid";
  const material = textureAnswer?.choice ?? "";

  const attrs: GarmentAttributes = {
    category,
    name: templateName(primaryColor, fit, pattern, category),
    primary_color: primaryColor,
    secondary_colors: [],
    fit,
    sleeve_length: sleeveAnswer?.choice ?? "",
    pattern,
    material,
    formality: formalityAnswer ? bandFor(FORMALITY_BY_SCORE, formalityAnswer.score, "smart-casual") : "smart-casual",
    warmth: warmthAnswer ? bandFor(WARMTH_BY_SCORE, warmthAnswer.score, "medium") : "medium",
    confidences,
    suggestedFields: Object.entries(confidences)
      .filter(([, confidence]) => confidence < AUTO_CONFIRM_THRESHOLD)
      .map(([field]) => field),
  };

  log("Final attributes:", attrs);
  return attrs;
}
