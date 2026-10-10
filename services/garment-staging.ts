import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import { isWardrobeApiConfigured, requestStaging } from "@/services/api/wardrobe-api";

const STAGING_PROMPT = `Professional e-commerce product photography of the [GARMENT TYPE], laid completely flat and straightened on a pure white (#FFFFFF) seamless background. This is [EXACT SLEEVE/LENGTH TYPE — e.g. sleeveless / short-sleeve / long-sleeve / cropped / full-length] — do NOT change the sleeve or leg length, do NOT add or remove sleeves, do NOT alter the original cut in any way. Preserve the exact silhouette, neckline/collar, hem shape, and proportions exactly as shown in the original photo. Fabric is smooth and taut with no wrinkles, folds, creases, or draping — as if steamed and pinned flat for a catalog shoot. Preserve exact color, pattern, graphic print, text, stitching, and hardware (buttons, zippers, drawstrings) exactly as in the original — do not invent or omit any design details. Studio lighting, soft even shadows only, sharp focus, high resolution, centered composition. No mannequin, no model, no hangers, no props — just the garment isolated on white.`;

const MAX_INPUT = 512;
const MAX_RETRIES = 3;

function log(...args: any[]) {
  try {
    // eslint-disable-next-line no-console
    console.log("[garment-staging]", ...args);
  } catch {}
}

export type StagingResult = {
  cleanUri: string;
  originalUri: string;
};

/**
 * Stage a single garment photo into a clean e-commerce product image.
 * Calls Cloudflare FLUX.2 Klein directly (no post-processing) with the
 * e-commerce staging prompt, then saves the returned image.
 */
export async function stageGarment(uri: string): Promise<StagingResult> {
  log("stageGarment called, input uri:", uri);

  if (!isWardrobeApiConfigured()) {
    log("ERROR: wardrobe API not configured");
    throw new Error("Wardrobe API not configured (set EXPO_PUBLIC_WARDROBE_API_URL).");
  }

  // 1. Downscale to <=512 (FLUX requires input <512x512)
  let resized;
  try {
    resized = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_INPUT } }],
      { compress: 1, format: SaveFormat.PNG }
    );
    log("Downscaled OK, resized.uri:", resized.uri);
  } catch (e: any) {
    log("ERROR: manipulateAsync (downscale) failed:", e);
    throw new Error(`Failed to downscale image: ${e?.message ?? e}`);
  }

  // 2. Upload to the wardrobe Worker, which runs FLUX.2 Klein server-side.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      log("Attempt", attempt + 1, "/", MAX_RETRIES);
      const form = new FormData();
      // SDK 57's native FormData implementation no longer accepts React
      // Native's legacy `{ uri, name, type }` descriptor. Expo File implements
      // Blob and can be streamed by expo/fetch without loading a second base64
      // copy of the image into JavaScript memory.
      const upload = new File(resized.uri);
      log("Upload file:", { name: upload.name, type: upload.type, size: upload.size });
      form.append("image", upload as any);
      form.append("prompt", STAGING_PROMPT);

      const imageData = await requestStaging(form);

      const base64Data = imageData.includes(",") ? imageData.split(",", 2)[1] : imageData;

      const filename = `staged-${Date.now()}.png`;
      const outputFile = new File(Paths.document, filename);
      const bytes = base64ToBytes(base64Data);
      outputFile.write(bytes);
      log("Saved clean image:", outputFile.uri, "bytes:", bytes.byteLength);

      return { cleanUri: outputFile.uri, originalUri: uri };
    } catch (e: any) {
      lastError = e;
      log("ERROR (catch):", e);
      if (attempt < MAX_RETRIES - 1) {
        await delay(2 ** attempt);
        continue;
      }
    }
  }

  log("All attempts failed, final error:", lastError);
  throw lastError ?? new Error("Garment staging failed.");
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/=+$/, "");
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    const value = alphabet.indexOf(character);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
