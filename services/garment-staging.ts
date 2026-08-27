import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";

const CF_ACCOUNT_ID = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID ?? "";
const CF_API_TOKEN = process.env.EXPO_PUBLIC_CLOUDFLARE_API_TOKEN ?? "";
const CF_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;

const STAGING_PROMPT = `Professional e-commerce product photography of the [GARMENT TYPE], laid completely flat and straightened on a pure white (#FFFFFF) seamless background. This is [EXACT SLEEVE/LENGTH TYPE — e.g. sleeveless / short-sleeve / long-sleeve / cropped / full-length] — do NOT change the sleeve or leg length, do NOT add or remove sleeves, do NOT alter the original cut in any way. Preserve the exact silhouette, neckline/collar, hem shape, and proportions exactly as shown in the original photo. Fabric is smooth and taut with no wrinkles, folds, creases, or draping — as if steamed and pinned flat for a catalog shoot. Preserve exact color, pattern, graphic print, text, stitching, and hardware (buttons, zippers, drawstrings) exactly as in the original — do not invent or omit any design details. Studio lighting, soft even shadows only, sharp focus, high resolution, centered composition. No mannequin, no model, no hangers, no props — just the garment isolated on white.`;

const MAX_INPUT = 512;
const MAX_RETRIES = 3;

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
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare credentials not configured (EXPO_PUBLIC_CLOUDFLARE_*).");
  }

  // 1. Downscale to <=512 (FLUX requires input <512x512)
  const resized = await manipulateAsync(
    uri,
    [{ resize: { width: MAX_INPUT } }],
    { compress: 1, format: SaveFormat.PNG }
  );

  // 2. Send to Cloudflare FLUX.2 Klein via multipart form data
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const form = new FormData();
      form.append("input_image_0", {
        uri: resized.uri,
        name: "input.png",
        type: "image/png",
      } as unknown as Blob);
      form.append("prompt", STAGING_PROMPT);
      form.append("width", "1024");
      form.append("height", "1024");
      form.append("guidance", "3.0");
      form.append("steps", "10");

      const response = await fetch(CF_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
        body: form,
      });

      if (response.status !== 200) {
        const text = await response.text();
        if (attempt < MAX_RETRIES - 1) {
          await delay(2 ** attempt);
          continue;
        }
        throw new Error(`Cloudflare request failed (${response.status}): ${text.slice(0, 200)}`);
      }

      const result = await response.json();
      if (!result.success) {
        const err = JSON.stringify(result.errors ?? []);
        if (attempt < MAX_RETRIES - 1) {
          await delay(2 ** attempt);
          continue;
        }
        throw new Error(`Cloudflare error: ${err}`);
      }

      const imageData: string = result.result?.image;
      if (!imageData) throw new Error("Cloudflare returned no image.");

      const base64Data = imageData.includes(",") ? imageData.split(",", 2)[1] : imageData;

      const filename = `staged-${Date.now()}.png`;
      const outputFile = new File(Paths.document, filename);
      outputFile.write(base64Data, { encoding: "base64" });

      return { cleanUri: outputFile.uri, originalUri: uri };
    } catch (e: any) {
      lastError = e;
      if (attempt < MAX_RETRIES - 1) {
        await delay(2 ** attempt);
        continue;
      }
    }
  }

  throw lastError ?? new Error("Garment staging failed.");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
