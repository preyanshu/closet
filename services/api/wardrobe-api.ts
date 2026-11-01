import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";

/**
 * Thin client for the wardrobe Worker. The app uploads a downscaled photo as
 * multipart/form-data; the Worker runs the AI model and returns text or an
 * image. No provider credentials live on the client.
 */

/**
 * Resolve the worker origin. An explicit EXPO_PUBLIC_WARDROBE_API_URL wins;
 * the special value "auto" (also the default) follows Metro's host so the app
 * keeps working when the dev machine's LAN IP changes.
 */
function resolveBaseUrl(): string {
  const configured = (process.env.EXPO_PUBLIC_WARDROBE_API_URL ?? "").trim().replace(/\/+$/, "");
  if (configured && configured !== "auto") return configured;
  const host = (Constants.expoConfig?.hostUri ?? "").split(":")[0];
  return host ? `http://${host}:8787` : "";
}

const API_BASE_URL = resolveBaseUrl();

export class WardrobeApiError extends Error {}

export function isWardrobeApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

function endpoint(path: string): string {
  return `${API_BASE_URL}${path}`;
}

type FetchInit = NonNullable<Parameters<typeof expoFetch>[1]>;
type FetchResponse = Awaited<ReturnType<typeof expoFetch>>;

/** Fetch with a diagnosable error: surface the URL and the underlying reason. */
async function post(path: string, init: FetchInit): Promise<FetchResponse> {
  try {
    return await expoFetch(endpoint(path), init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new WardrobeApiError(
      `Can't reach the wardrobe API at ${API_BASE_URL || "(unset)"} — ${reason}. Check EXPO_PUBLIC_WARDROBE_API_URL and that the worker is running.`,
    );
  }
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
  const response = await post("/v1/detect", { method: "POST", body: form });
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
  const response = await post("/v1/stage", { method: "POST", body: form });
  const text = await response.text();
  if (response.status !== 200) {
    throw new WardrobeApiError(`Garment staging failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = parseJson(text);
  if (typeof data.image !== "string" || !data.image) throw new WardrobeApiError("Garment staging returned no image.");
  return data.image;
}

// ── Stylist agent turn (thin tool-loop proxy) ────────────────────────────────

export type StyleToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type StyleTurnResult =
  | { tool_calls: StyleToolCall[]; text?: undefined }
  | { text: string; tool_calls?: undefined };

/** One turn of the client-side stylist agent loop. The client owns the
 * persona, tools (executed locally), and the loop; the worker just proxies
 * to Workers AI with the tools schema. */
export async function runStyleTurn(
  messages: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  maxTokens?: number,
  temperature?: number,
): Promise<StyleTurnResult> {
  if (!isWardrobeApiConfigured()) {
    throw new WardrobeApiError("Wardrobe API not configured (set EXPO_PUBLIC_WARDROBE_API_URL).");
  }
  const response = await post("/v1/style/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tools, max_tokens: maxTokens ?? 1200, temperature: temperature ?? 0.8 }),
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw new WardrobeApiError(`Stylist turn failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = parseJson(text);
  if (Array.isArray(data.tool_calls) && data.tool_calls.length > 0) {
    return { tool_calls: data.tool_calls as StyleToolCall[] };
  }
  if (typeof data.text === "string") return { text: data.text };
  throw new WardrobeApiError("Stylist turn returned neither tool_calls nor text.");
}

// ── Decision model (Clef-flash / System One) ─────────────────────────────────

export type SystemOneQuestion = {
  type: "noul" | "choice" | "score";
  instructions?: string;
  /**
   * choice → Record<value, label>; score → ordered string[] (the scale legend,
   * e.g. ["1", "2", "3", "4", "5"]). Real clef-flash rejects `levels` and
   * requires `criteria` for score questions.
   */
  criteria?: Record<string, string> | string[];
};

export type SystemOneAnswers = Record<
  string,
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | {
      type: "score";
      /** 0-based index mean over `criteria` (0..n-1); use score1To5() for a 1–5 band. */
      score: number;
      legend?: Record<string, string>;
      probabilities?: Record<string, number>;
      confidence?: number;
    }
>;

/** Convert a clef score answer (0-based index mean) to a 1–5 integer band. */
export function score1To5(raw: number | null | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 3;
  return Math.min(5, Math.max(1, Math.round(raw + 1)));
}

/** Typed decision call (triage, prompt parsing, coherence gates, vision extraction). */
export async function runDecision(
  state: string | Record<string, unknown> | Array<unknown>,
  questions: Record<string, SystemOneQuestion>,
  images?: string[],
): Promise<SystemOneAnswers> {
  if (!isWardrobeApiConfigured()) {
    throw new WardrobeApiError("Wardrobe API not configured (set EXPO_PUBLIC_WARDROBE_API_URL).");
  }
  const response = await post("/v1/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, questions, images: images && images.length > 0 ? images : undefined }),
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw new WardrobeApiError(`Decision failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = parseJson(text);
  return (data.answers ?? {}) as SystemOneAnswers;
}
