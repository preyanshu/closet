import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import type { ClothingCategory } from "@/data/mock";
import { isWardrobeApiConfigured, runDecision, score1To5, WardrobeApiError } from "@/services/api/wardrobe-api";
import { deriveAlternateRoles } from "@/services/item-roles";
import {
  CATEGORY_BY_ROLE, CATEGORY_VALUES, COLOR_VALUES, FIT_VALUES, PATTERN_VALUES, ROLE_BY_CATEGORY, ROLE_BY_SUBCATEGORY,
  SLEEVE_VALUES, SUBCATEGORY_VALUES, TEXTURE_VALUES,
} from "@/services/item-options";
import { suggestAesthetics } from "@/services/vibes";
import type { AiAttribute, ItemRole, WarmthBand, WearerPresentation } from "@/types/domain";

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

const FORMALITY_BY_SCORE: Record<number, string> = { 1: "casual", 2: "casual", 3: "smart-casual", 4: "formal", 5: "formal" };
const WARMTH_BY_SCORE: Record<number, WarmthBand> = { 1: "light", 2: "light", 3: "medium", 4: "heavy", 5: "heavy" };

const CATEGORY_NOUN: Record<ClothingCategory, string> = {
  top: "top",
  bottom: "bottom",
  outerwear: "jacket",
  shoes: "shoes",
  accessory: "accessory",
};

const MATERIAL_WORD: Record<string, string> = {
  knit: "knit",
  denim: "denim",
  fleece: "fleece",
  "leather-like": "leather",
  "satin-like": "satin",
  woven: "",
  smooth: "",
};

export type GarmentAttributes = {
  category: ClothingCategory;
  /** Specific type, e.g. "sneaker", "trouser", "polo". */
  subcategory: string;
  /** Styling role derived from the subcategory (not model-reported). */
  role: ItemRole;
  /** Other jobs the piece can do in a look, e.g. a shirt that can also be worn open as a layer. */
  alternate_roles: ItemRole[];
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
function templateName(
  color: string,
  fit: string,
  material: string,
  subcategory: string,
  category: ClothingCategory,
): string {
  const materialWord = MATERIAL_WORD[material] ?? "";
  const descriptor = materialWord || (fit && fit !== "regular" ? fit : "");
  const noun = subcategory || CATEGORY_NOUN[category] || "piece";
  const name = [color || "unknown", descriptor, noun].filter(Boolean).join(" ");
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

export { suggestAesthetics };

/** Build AiAttribute evidence rows from a detection result. */
export function toAiAttributes(attrs: GarmentAttributes): AiAttribute[] {
  const now = new Date().toISOString();
  const fields: Array<[string, string]> = [
    ["category", attrs.category],
    ["subcategory", attrs.subcategory],
    ["primary_color", attrs.primary_color],
    ["secondary_color", attrs.secondary_colors.join(", ")],
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

async function prepareImageDataUri(uri: string, maxInput = MAX_INPUT): Promise<string> {
  let resized;
  try {
    resized = await manipulateAsync(
      uri,
      [{ resize: { width: maxInput } }],
      { compress: 0.9, format: SaveFormat.JPEG }
    );
    log("Downscaled OK, resized.uri:", resized.uri);
  } catch (e: any) {
    log("ERROR: manipulateAsync (downscale) failed:", e);
    throw new Error(`Failed to downscale image: ${e?.message ?? e}`);
  }

  try {
    const b64 = await new File(resized.uri).base64();
    return `data:image/jpeg;base64,${b64}`;
  } catch (e: any) {
    log("ERROR: base64 encode failed:", e);
    throw new Error(`Failed to read image: ${e?.message ?? e}`);
  }
}

export type ItemPresence = {
  present: boolean;
  confidence: number;
};

/**
 * Cheap clef-flash gate before staging/detection: one image question decides
 * whether the photo actually contains a wearable piece. Fails open so a
 * flaky gate never blocks a real scan.
 */
export async function detectItemPresence(uri: string): Promise<ItemPresence> {
  if (!isWardrobeApiConfigured()) return { present: true, confidence: 0 };
  const dataUri = await prepareImageDataUri(uri, 512);
  const answers = await runDecision(
    {
      task: "check_wearable_item",
      note: "Look at the photo and decide whether a wearable piece is clearly visible and extractable.",
    },
    {
      item_visible: {
        type: "choice",
        instructions: "Does the photo contain a physical object that is a wearable item — clothing, shoes, bags, belts, hats, jewelry, watches, or accessories — even if it is small or resting on furniture? Choose no ONLY when there is no wearable object at all (empty room, food, document, pet, plain texture).",
        criteria: { yes: "A wearable item is present, even if small", no: "No wearable item is present" },
      },
    },
    [dataUri],
  );
  const answer = choiceAnswer(answers, "item_visible");
  const confidence = answer?.confidence ?? 0;
  const present = !(answer?.choice === "no" && confidence >= 0.55);
  log("Presence gate:", { choice: answer?.choice, confidence, present });
  return { present, confidence };
}

export async function detectGarment(uri: string): Promise<GarmentAttributes> {
  log("detectGarment called, input uri:", uri);

  if (!isWardrobeApiConfigured()) {
    log("ERROR: wardrobe API not configured");
    throw new WardrobeApiError("Alta isn't available on this device right now.", "not_configured", "EXPO_PUBLIC_WARDROBE_API_URL is not set");
  }

  const dataUri = await prepareImageDataUri(uri);

  const answers = await runDecision(
    { task: "extract_garment_attributes", note: "Answer from the photo; pick the closest allowed value." },
    {
      category: { type: "choice", instructions: "What kind of piece is this? top = shirts/knits/dresses; bottom = trousers/skirts/shorts; outerwear = coats/jackets; shoes = footwear; accessory = bags/belts/hats/jewelry.", criteria: Object.fromEntries(CATEGORY_VALUES.map((v) => [v, v])) },
      subcategory: { type: "choice", instructions: "The most specific type of piece. Pick 'other' only if nothing fits.", criteria: Object.fromEntries(SUBCATEGORY_VALUES.map((v) => [v, v])) },
      primary_color: { type: "choice", instructions: "What is the dominant color?", criteria: Object.fromEntries(COLOR_VALUES.map((v) => [v, v])) },
      secondary_color: { type: "choice", instructions: "The second most prominent color, or none.", criteria: { ...Object.fromEntries(COLOR_VALUES.map((v) => [v, v])), none: "none" } },
      fit: { type: "choice", instructions: "How does it fit?", criteria: Object.fromEntries(FIT_VALUES.map((v) => [v, v])) },
      sleeve_length: { type: "choice", instructions: "Sleeve/leg length as visible. If not applicable, pick the closest.", criteria: Object.fromEntries(SLEEVE_VALUES.map((v) => [v, v])) },
      pattern: { type: "choice", instructions: "What is the pattern?", criteria: Object.fromEntries(PATTERN_VALUES.map((v) => [v, v])) },
      texture: { type: "choice", instructions: "What is the visible surface texture?", criteria: Object.fromEntries(TEXTURE_VALUES.map((v) => [v, v])) },
      formality: { type: "score", instructions: "How dressy is this piece? 1 = very casual, 5 = formal.", criteria: ["1", "2", "3", "4", "5"] },
      warmth: { type: "score", instructions: "How warm is this piece? 1 = light/breathable, 5 = heavy/cold-weather.", criteria: ["1", "2", "3", "4", "5"] },
      can_layer: { type: "choice", instructions: "Could this piece be worn open or over another top as a layer, like a button-up shirt, overshirt, open knit, cardigan, hoodie or vest? A t-shirt, tank, camisole, polo, or anything that is not a top is no.", criteria: { yes: "can be worn over another top as a layer", no: "worn on its own as a base, or not a top" } },
    },
    [dataUri],
  );

  const categoryAnswer = choiceAnswer(answers, "category");
  const subcategoryAnswer = choiceAnswer(answers, "subcategory");
  const colorAnswer = choiceAnswer(answers, "primary_color");
  const secondaryAnswer = choiceAnswer(answers, "secondary_color");
  const fitAnswer = choiceAnswer(answers, "fit");
  const sleeveAnswer = choiceAnswer(answers, "sleeve_length");
  const patternAnswer = choiceAnswer(answers, "pattern");
  const textureAnswer = choiceAnswer(answers, "texture");
  const formalityAnswer = scoreAnswer(answers, "formality");
  const warmthAnswer = scoreAnswer(answers, "warmth");
  const layerAnswer = choiceAnswer(answers, "can_layer");

  const confidences: Record<string, number> = {
    category: categoryAnswer?.confidence ?? 0,
    subcategory: subcategoryAnswer?.confidence ?? 0,
    primary_color: colorAnswer?.confidence ?? 0,
    fit: fitAnswer?.confidence ?? 0,
    sleeve_length: sleeveAnswer?.confidence ?? 0,
    pattern: patternAnswer?.confidence ?? 0,
    texture: textureAnswer?.confidence ?? 0,
    formality: formalityAnswer?.confidence ?? 0,
    warmth: warmthAnswer?.confidence ?? 0,
  };

  const subcategory = (subcategoryAnswer?.choice ?? "").trim();
  const derivedRole = ROLE_BY_SUBCATEGORY[subcategory];
  const category = (derivedRole ? CATEGORY_BY_ROLE[derivedRole] : undefined) ?? mapCategory(categoryAnswer?.choice);
  const role = derivedRole ?? ROLE_BY_CATEGORY[category];
  const primaryColor = normalizeColor(colorAnswer?.choice ?? "black");
  const secondaryColors =
    secondaryAnswer && secondaryAnswer.choice !== "none"
      ? [normalizeColor(secondaryAnswer.choice)].filter((color) => color && color !== primaryColor)
      : [];
  const fit = category === "shoes" || category === "accessory" ? "regular" : fitAnswer?.choice ?? "regular";
  const sleeve = category === "top" || category === "outerwear" ? sleeveAnswer?.choice ?? "" : "";
  const pattern = patternAnswer?.choice ?? "solid";
  const material = textureAnswer?.choice ?? "";

  const name = templateName(primaryColor, fit, material, subcategory, category);
  const alternateRoles = deriveAlternateRoles({
    role,
    subcategory,
    name,
    canLayer: layerAnswer ? { answer: layerAnswer.choice === "yes", confidence: layerAnswer.confidence } : undefined,
  });

  const attrs: GarmentAttributes = {
    category,
    subcategory,
    role,
    alternate_roles: alternateRoles,
    name,
    primary_color: primaryColor,
    secondary_colors: secondaryColors,
    fit,
    sleeve_length: sleeve,
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
