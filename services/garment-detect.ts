import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import type { ClothingCategory } from "@/data/mock";
import { isWardrobeApiConfigured, requestDetection } from "@/services/api/wardrobe-api";

const DETECT_PROMPT = `You are a garment attribute extractor. Given a single clothing item photo, return ONLY valid JSON (no prose, no markdown fences) with exactly these fields:
{
  "category": one of ["top", "bottom", "outerwear", "shoes", "accessory"],
  "name": a short product name, e.g. "Oversized hoodie",
  "primary_color": a simple color word, e.g. "black", "white", "navy", "gray", "brown", "cream", "blue", "camel",
  "secondary_colors": array of other visible color words,
  "fit": e.g. "baggy", "straight", "slim", "oversized", "regular", "cropped",
  "sleeve_length": e.g. "short", "long", "sleeveless",
  "pattern": e.g. "plain", "striped", "graphic", "checkered",
  "material": fabric if visible, else ""
}`;

export type GarmentAttributes = {
  category: ClothingCategory;
  name: string;
  primary_color: string;
  secondary_colors: string[];
  fit: string;
  sleeve_length: string;
  pattern: string;
  material: string;
};

const MAX_INPUT = 768;

function log(...args: any[]) {
  try {
    // eslint-disable-next-line no-console
    console.log("[garment-detect]", ...args);
  } catch {}
}

function cleanJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

const COLOR_FALLBACKS = ["black", "white", "navy", "gray", "brown", "cream", "blue", "camel"];

function normalizeColor(c: string): string {
  const value = (c ?? "").trim().toLowerCase();
  return COLOR_FALLBACKS.find((f) => value.includes(f)) ?? (value || "black");
}

const CATEGORY_KEYWORDS: Array<[ClothingCategory, string[]]> = [
  ["shoes", ["shoe", "sneaker", "boot", "loafer", "heel", "boots", "sandal", "trainer"]],
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
  const haystack = [attrs.category, attrs.name, attrs.fit, attrs.pattern, attrs.sleeve_length, attrs.material]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(office|blouse|trouser|shirt|blazer|loafer|suit|silk|charcoal|tailored)/.test(haystack)) tags.add("office");
  if (/(oversized|hoodie|sneaker|graphic|street|cap|denim|puffer)/.test(haystack)) tags.add("streetwear");
  if (/(knit|wool|camel|cashmere|coat|loafer|pearl|prep)/.test(haystack)) tags.add("old-money");
  if (/(white|cream|ivory|clean|tank|linen|minimal)/.test(haystack)) tags.add("clean-girl");
  if (/(silk|satin|slip|evening|black|dress|heel)/.test(haystack)) tags.add("evening");
  if (/(minimal|plain|black|white|tailored|straight)/.test(haystack)) tags.add("minimal");

  if (tags.size === 0) tags.add("minimal");
  return [...tags];
}

export async function detectGarment(uri: string): Promise<GarmentAttributes> {
  log("detectGarment called, input uri:", uri);

  if (!isWardrobeApiConfigured()) {
    log("ERROR: wardrobe API not configured");
    throw new Error("Wardrobe API not configured (set EXPO_PUBLIC_WARDROBE_API_URL).");
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

  const form = new FormData();
  form.append("image", new File(resized.uri) as any);
  form.append("prompt", DETECT_PROMPT);

  const rawText = await requestDetection(form);
  log("Model response:", rawText);

  let parsed: any = {};
  try {
    parsed = JSON.parse(cleanJson(rawText));
  } catch (e) {
    log("WARN: could not parse JSON from model, using fallback:", e);
    parsed = {};
  }

  const name = (parsed.name ?? "").trim() || (parsed.category ?? "Item");

  const attrs: GarmentAttributes = {
    category: mapCategory(parsed.category),
    name: name || "Unnamed item",
    primary_color: normalizeColor(parsed.primary_color ?? parsed.color),
    secondary_colors: Array.isArray(parsed.secondary_colors)
      ? parsed.secondary_colors.map(String)
      : [],
    fit: parsed.fit ?? "",
    sleeve_length: parsed.sleeve_length ?? "",
    pattern: parsed.pattern ?? "",
    material: parsed.material ?? "",
  };

  log("Final attributes:", attrs);
  return attrs;
}
