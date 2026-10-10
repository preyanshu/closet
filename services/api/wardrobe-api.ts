import { fetch as expoFetch } from "expo/fetch";

/**
 * Thin client for the wardrobe Worker. The app uploads a downscaled photo as
 * multipart/form-data; the Worker runs the AI model and returns text or an
 * image. No provider credentials live on the client.
 */

const API_BASE_URL = (process.env.EXPO_PUBLIC_WARDROBE_API_URL ?? "").replace(/\/+$/, "");

export class WardrobeApiError extends Error {}

export function isWardrobeApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

function endpoint(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function requestDetection(form: FormData): Promise<string> {
  if (!isWardrobeApiConfigured()) {
    throw new WardrobeApiError("Wardrobe API not configured (set EXPO_PUBLIC_WARDROBE_API_URL).");
  }
  const response = await expoFetch(endpoint("/v1/detect"), { method: "POST", body: form });
  const text = await response.text();
  if (response.status !== 200) {
    throw new WardrobeApiError(`Garment detection failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = parseJson(text);
  if (typeof data.text !== "string") throw new WardrobeApiError("Garment detection returned no text.");
  return data.text;
}

export async function requestStaging(form: FormData): Promise<string> {
  if (!isWardrobeApiConfigured()) {
    throw new WardrobeApiError("Wardrobe API not configured (set EXPO_PUBLIC_WARDROBE_API_URL).");
  }
  const response = await expoFetch(endpoint("/v1/stage"), { method: "POST", body: form });
  const text = await response.text();
  if (response.status !== 200) {
    throw new WardrobeApiError(`Garment staging failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = parseJson(text);
  if (typeof data.image !== "string" || !data.image) throw new WardrobeApiError("Garment staging returned no image.");
  return data.image;
}
