import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";

const CF_ACCOUNT_ID = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID ?? "";
const CF_API_TOKEN = process.env.EXPO_PUBLIC_CLOUDFLARE_API_TOKEN ?? "";
const CF_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;

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

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    log("ERROR: Cloudflare credentials missing", {
      hasAccount: !!CF_ACCOUNT_ID,
      hasToken: !!CF_API_TOKEN,
    });
    throw new Error("Cloudflare credentials not configured (EXPO_PUBLIC_CLOUDFLARE_*).");
  }
  log("Credentials present:", {
    hasAccount: !!CF_ACCOUNT_ID,
    hasToken: !!CF_API_TOKEN,
  });

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

  // 2. Send to Cloudflare FLUX.2 Klein via multipart form data
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      log("Attempt", attempt + 1, "/", MAX_RETRIES);
      const form = new FormData();
      const upload: any = {
        uri: resized.uri,
        name: "input.png",
        type: "image/png",
      };
      log("Upload file descriptor:", upload);
      form.append("input_image_0", upload);
      form.append("prompt", STAGING_PROMPT);
      form.append("width", "1024");
      form.append("height", "1024");
      form.append("guidance", "3.0");
      form.append("steps", "10");

      log("POST", CF_API_URL);
      const response = await fetch(CF_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
        body: form,
      });

      log("HTTP status:", response.status);
      if (response.status !== 200) {
        const text = await response.text();
        log("ERROR: non-200 response body:", text.slice(0, 1000));
        if (attempt < MAX_RETRIES - 1) {
          await delay(2 ** attempt);
          continue;
        }
        throw new Error(`Cloudflare request failed (${response.status}): ${text.slice(0, 200)}`);
      }

      const text = await response.text();
      log("Raw response (first 500):", text.slice(0, 500));
      const result = JSON.parse(text);

      if (!result.success) {
        const err = JSON.stringify(result.errors ?? []);
        log("ERROR: Cloudflare success=false, errors:", err);
        if (attempt < MAX_RETRIES - 1) {
          await delay(2 ** attempt);
          continue;
        }
        throw new Error(`Cloudflare error: ${err}`);
      }

      const imageData: string = result.result?.image;
      if (!imageData) {
        log("ERROR: no image in result.result:", JSON.stringify(result.result).slice(0, 500));
        throw new Error("Cloudflare returned no image.");
      }

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
  const base64 = Buffer.from(b64, "base64");
  return new Uint8Array(base64.buffer, base64.byteOffset, base64.byteLength);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
