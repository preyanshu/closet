import { supabase } from "@/services/supabase";
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

export type WardrobeApiErrorKind = "unreachable" | "not_configured" | "busy" | "server" | "bad_response";

/**
 * An error that is safe to show the user: `message` is plain language with no
 * URLs, status codes or setup hints. The technical reason goes in `detail` and
 * is only written to the console for developers.
 */
export class WardrobeApiError extends Error {
  kind: WardrobeApiErrorKind;
  detail?: string;
  constructor(message: string, kind: WardrobeApiErrorKind = "bad_response", detail?: string) {
    super(message);
    this.name = "WardrobeApiError";
    this.kind = kind;
    this.detail = detail;
    if (detail && typeof __DEV__ !== "undefined" && __DEV__) console.warn(`[wardrobe-api] ${kind}: ${detail}`);
  }
}

const COPY = {
  unreachable: "Can't reach Alta right now. Check your internet connection and try again.",
  not_configured: "Alta isn't available on this device right now.",
  busy: "Alta is busy right now. Give it a moment and try again.",
  server: "Alta ran into a problem on its end. Try again in a moment.",
  bad_response: "Alta sent back something unexpected. Try again.",
} as const;

/** A readable one-line reason for logs, including SDK errors that are plain objects. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { code, message, underlyingErrorMessage, readableErrorCode } = error as Record<string, unknown>;
    const parts = [readableErrorCode ?? code, message, underlyingErrorMessage].filter((part) => part != null && part !== "").map(String);
    if (parts.length > 0) return parts.join(" | ");
    try { return JSON.stringify(error); } catch { /* fall through */ }
  }
  return String(error);
}

/** Headline for an error card, by kind. */
export function errorTitle(kind?: string): string {
  switch (kind) {
    case "unreachable": return "Can't reach Alta";
    case "not_configured": return "Alta isn't available";
    case "busy": return "Alta is busy";
    case "server": return "Alta is having trouble";
    default: return "Something went wrong";
  }
}

/** Safe text for any caught error: our own messages pass through, anything else is generic. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  return error instanceof WardrobeApiError ? error.message : fallback;
}

function failFor(status: number, what: string, body: string): WardrobeApiError {
  if (status === 402) return new WardrobeApiError("An active subscription is required.", "server", `${what} failed (402): ${body.slice(0, 200)}`);
  if (status === 401) return new WardrobeApiError("Your session expired. Sign out and sign in again to continue.", "server", `${what} failed (401): ${body.slice(0, 200)}`);
  const kind: WardrobeApiErrorKind = status === 429 ? "busy" : "server";
  return new WardrobeApiError(COPY[kind], kind, `${what} failed (${status}): ${body.slice(0, 200)}`);
}

export function isWardrobeApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

function notConfigured(): WardrobeApiError {
  return new WardrobeApiError(COPY.not_configured, "not_configured", "EXPO_PUBLIC_WARDROBE_API_URL is not set");
}

function endpoint(path: string): string {
  return `${API_BASE_URL}${path}`;
}

type FetchInit = NonNullable<Parameters<typeof expoFetch>[1]>;
type FetchResponse = Awaited<ReturnType<typeof expoFetch>>;

/** Fetch with a diagnosable error: surface the URL and the underlying reason. */
async function post(path: string, init: FetchInit): Promise<FetchResponse> {
  try {
    // The worker only answers signed-in users.
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const headers = { ...(init.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    return await expoFetch(endpoint(path), { ...init, headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new WardrobeApiError(COPY.unreachable, "unreachable", `${API_BASE_URL || "(unset)"} — ${reason}`);
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
    throw notConfigured();
  }
  const response = await post("/v1/detect", { method: "POST", body: form });
  const text = await response.text();
  if (response.status !== 200) {
    throw failFor(response.status, "Garment detection", text);
  }
  const data = parseJson(text);
  if (typeof data.text !== "string") throw new WardrobeApiError(COPY.bad_response, "bad_response", "Garment detection returned no text");
  return data.text;
}

export async function requestStaging(form: FormData): Promise<string> {
  if (!isWardrobeApiConfigured()) {
    throw notConfigured();
  }
  const response = await post("/v1/stage", { method: "POST", body: form });
  const text = await response.text();
  if (response.status !== 200) {
    throw failFor(response.status, "Garment staging", text);
  }
  const data = parseJson(text);
  if (typeof data.image !== "string" || !data.image) throw new WardrobeApiError(COPY.bad_response, "bad_response", "Garment staging returned no image");
  return data.image;
}

// ── Stylist agent turn (thin tool-loop proxy) ────────────────────────────────

export type StyleToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type StyleTurnResult = {
  tool_calls?: StyleToolCall[];
  text?: string;
};

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
    throw notConfigured();
  }
  const response = await post("/v1/style/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tools, max_tokens: maxTokens ?? 1200, temperature: temperature ?? 0.8 }),
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw failFor(response.status, "Stylist turn", text);
  }
  const data = parseJson(text);
  if (Array.isArray(data.tool_calls) && data.tool_calls.length > 0) {
    return { tool_calls: data.tool_calls as StyleToolCall[] };
  }
  if (typeof data.text === "string") return { text: data.text };
  throw new WardrobeApiError(COPY.bad_response, "bad_response", "Stylist turn returned neither tool_calls nor text");
}

/** Streaming turn: text deltas arrive live; tool calls are returned at the end. */
export async function runStyleTurnStream(
  messages: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  maxTokens: number | undefined,
  temperature: number | undefined,
  onDelta: (text: string) => void,
): Promise<StyleTurnResult> {
  if (!isWardrobeApiConfigured()) {
    throw notConfigured();
  }
  const response = await post("/v1/style/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tools, max_tokens: maxTokens ?? 1200, temperature: temperature ?? 0.8 }),
  });
  if (response.status !== 200 || !response.body) {
    const text = await response.text().catch(() => "");
    throw failFor(response.status, "Stylist stream", text);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let toolCalls: StyleToolCall[] | undefined;

  const handleBlock = (block: string) => {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    const payload = parseJson(data);
    if (event === "delta" && typeof payload.text === "string") {
      text += payload.text;
      onDelta(payload.text);
    } else if (event === "tool_calls" && Array.isArray(payload.tool_calls)) {
      toolCalls = payload.tool_calls as StyleToolCall[];
    } else if (event === "error") {
      throw new WardrobeApiError(COPY.server, "server", typeof payload.error === "string" ? payload.error : "Stylist stream failed");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        handleBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) handleBlock(buffer);
  } finally {
    reader.releaseLock();
  }

  if (toolCalls && toolCalls.length > 0) return text ? { tool_calls: toolCalls, text } : { tool_calls: toolCalls };
  if (text) return { text };
  throw new WardrobeApiError(COPY.bad_response, "bad_response", "Stylist stream returned neither tool_calls nor text");
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
    throw notConfigured();
  }
  const response = await post("/v1/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, questions, images: images && images.length > 0 ? images : undefined }),
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw failFor(response.status, "Decision", text);
  }
  const data = parseJson(text);
  return (data.answers ?? {}) as SystemOneAnswers;
}
