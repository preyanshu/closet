import { Hono } from "hono";
import { cors } from "hono/cors";

/**
 * Wardrobe API Worker.
 *
 * Runs locally via `wrangler dev`. It calls the Cloudflare AI REST API with the
 * same credentials the client used to hold (`CLOUDFLARE_ACCOUNT_ID` /
 * `CLOUDFLARE_API_TOKEN`, supplied through `server/.dev.vars`). This keeps the
 * token out of the app bundle while avoiding a deploy or a Workers AI binding.
 */

type Env = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
};

const DETECT_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const STAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const STYLE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DECIDE_MODEL = "@cf/cloudflare/clef-flash";

const DEFAULT_DETECT_PROMPT = `You are a garment attribute extractor. Given a single clothing item photo, return ONLY valid JSON (no prose, no markdown fences) with exactly these fields:
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

const DEFAULT_STAGING_PROMPT = `Professional e-commerce product photography of the garment, laid completely flat and straightened on a pure white (#FFFFFF) seamless background. Preserve the exact sleeve/leg length, silhouette, neckline/collar, hem shape, color, pattern, graphic print, text, stitching, and hardware exactly as in the original photo. Fabric smooth and taut with no wrinkles or draping. Studio lighting, soft even shadows, sharp focus, centered composition. No mannequin, model, hangers, or props — just the garment isolated on white.`;

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/health", (c) => c.json({ ok: true, credentials: Boolean(credentials(c.env)) }));

app.post("/v1/detect", async (c) => {
  const creds = credentials(c.env);
  if (!creds) return c.json({ error: "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured" }, 500);

  const form = await c.req.formData();
  const image = form.get("image") as unknown as File | null;
  const prompt = form.get("prompt");
  if (!image || typeof image.arrayBuffer !== "function") return c.json({ error: "multipart field 'image' is required" }, 400);

  const dataUri = await fileToDataUri(image);
  const response = await fetch(aiRunUrl(creds.accountId, DETECT_MODEL), {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: typeof prompt === "string" && prompt ? prompt : DEFAULT_DETECT_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUri } },
            { type: "text", text: "Extract the garment attributes as JSON." },
          ],
        },
      ],
      max_tokens: 250,
      temperature: 0.1,
    }),
  });

  const data = await readJson(response);
  if (!response.ok || data?.success === false) return c.json({ error: describeError(data, response.status) }, 502);
  return c.json({ text: extractText(data?.result) });
});

app.post("/v1/stage", async (c) => {
  const creds = credentials(c.env);
  if (!creds) return c.json({ error: "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured" }, 500);

  const form = await c.req.formData();
  const image = form.get("image") as unknown as File | null;
  const prompt = form.get("prompt");
  if (!image || typeof image.arrayBuffer !== "function") return c.json({ error: "multipart field 'image' is required" }, 400);

  const outbound = new FormData();
  outbound.append("input_image_0", image, image.name || "image.png");
  outbound.append("prompt", typeof prompt === "string" && prompt ? prompt : DEFAULT_STAGING_PROMPT);
  outbound.append("width", "1024");
  outbound.append("height", "1024");
  outbound.append("guidance", "3.0");

  const response = await fetch(aiRunUrl(creds.accountId, STAGE_MODEL), {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}` },
    body: outbound,
  });

  const data = await readJson(response);
  if (!response.ok || data?.success === false) return c.json({ error: describeError(data, response.status) }, 502);

  const imageData = data?.result?.image;
  if (typeof imageData !== "string" || !imageData) return c.json({ error: "model returned no image" }, 502);
  return c.json({ image: imageData });
});

/**
 * Thin stateless proxy for one turn of the client-side stylist agent loop.
 * Body: { messages, tools, max_tokens? }. The client owns the persona, the
 * tools (executed locally against the wardrobe DB), and the loop. This worker
 * just forwards to Workers AI with the tools schema and normalizes the reply
 * into { tool_calls } | { text }.
 */
app.post("/v1/style/turn", async (c) => {
  const creds = credentials(c.env);
  if (!creds) return c.json({ error: "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured" }, 500);

  const body = await c.req.json().catch(() => null);
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  const tools = Array.isArray(body?.tools) ? body.tools : null;
  if (!messages || messages.length === 0) return c.json({ error: "body.messages must be a non-empty array" }, 400);
  if (!tools || tools.length === 0) return c.json({ error: "body.tools must be a non-empty array" }, 400);
  if (messages.length > 40) return c.json({ error: `body.messages up to 40; received ${messages.length}` }, 400);

  const response = await fetch(aiRunUrl(creds.accountId, STYLE_MODEL), {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      tools,
      max_tokens: Math.min(2000, Math.max(200, Number(body?.max_tokens ?? 1200))),
      temperature: 0,
    }),
  });

  const data = await readJson(response);
  if (!response.ok || data?.success === false) return c.json({ error: describeError(data, response.status) }, 502);

  const result = data?.result ?? data;
  const toolCalls = normalizeToolCalls(result?.tool_calls);
  if (toolCalls && toolCalls.length > 0) return c.json({ tool_calls: toolCalls });
  return c.json({ text: extractText(result) });
});

/**
 * Thin proxy to a decision model (Clef-flash — Jev/System One compatible).
 * Body: { state, questions, images? }. Returns typed answers with probabilities.
 * Used for: wardrobe-diff triage, chat prompt parsing, retry direction,
 * coherence gates — fast typed judgments that must not burn an LLM session.
 */
app.post("/v1/decide", async (c) => {
  const creds = credentials(c.env);
  if (!creds) return c.json({ error: "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured" }, 500);

  const body = await c.req.json().catch(() => null);
  const state = body?.state;
  const questions = (body?.questions ?? {}) as Record<string, SystemOneQuestion>;
  const hasState = typeof state === "string" || Array.isArray(state) || Boolean(state && typeof state === "object");
  if (!hasState) return c.json({ error: "body.state (string, object, or array) is required" }, 400);
  const questionKeys = Object.keys(questions);
  if (questionKeys.length === 0 || questionKeys.length > 64) return c.json({ error: "body.questions must have 1–64 entries" }, 400);
  for (const key of questionKeys) {
    const q = questions[key];
    if (!q || !["noul", "choice", "score"].includes(q.type)) {
      return c.json({ error: `question "${key}" must be noul | choice | score` }, 400);
    }
  }

  const response = await fetch(aiRunUrl(creds.accountId, DECIDE_MODEL), {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, questions, images: Array.isArray(body?.images) ? body.images : undefined }),
  });

  const data = await readJson(response);
  if (!response.ok || data?.success === false) return c.json({ error: describeError(data, response.status) }, 502);
  return c.json({ answers: data?.result?.answers ?? data?.answers ?? {} });
});

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((error, c) => {
  console.error("[wardrobe-api]", error);
  return c.json({ error: error.message || "internal error" }, 500);
});

function credentials(env: Env): { accountId: string; token: string } | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return null;
  return { accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN };
}

function aiRunUrl(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function describeError(data: any, status: number): string {
  const detail = data?.errors ? JSON.stringify(data.errors) : data?.error ?? data?.raw ?? "";
  return `Cloudflare AI request failed (${status}): ${String(detail).slice(0, 200)}`;
}

type SystemOneQuestion = {
  type: "noul" | "choice" | "score";
  instructions?: string;
  criteria?: Record<string, string> | string[];
  levels?: string[];
};

/** Normalize Workers AI / OpenAI-style tool_calls into a stable client shape. */
function normalizeToolCalls(raw: unknown): Array<{ id: string; name: string; arguments: Record<string, unknown> }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i] as Record<string, unknown>;
    const fn = (entry?.function ?? entry) as Record<string, unknown>;
    const name = typeof fn?.name === "string" ? fn.name : typeof entry?.name === "string" ? entry.name : null;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    const rawArgs = fn?.arguments ?? entry?.arguments;
    if (typeof rawArgs === "string") {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        args = {};
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }
    calls.push({ id: typeof entry?.id === "string" ? entry.id : `call_${i}`, name, arguments: args });
  }
  return calls.length > 0 ? calls : null;
}

function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  const value = result as {
    response?: string | { content?: Array<{ text?: string }> };
    content?: Array<{ text?: string }>;
    message?: string;
    text?: string;
  };
  if (typeof value?.response === "string") return value.response;
  if (typeof value?.response?.content?.[0]?.text === "string") return value.response.content[0].text;
  if (typeof value?.content?.[0]?.text === "string") return value.content[0].text;
  if (typeof value?.message === "string") return value.message;
  if (typeof value?.text === "string") return value.text;
  return JSON.stringify(value ?? {});
}

async function fileToDataUri(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type || "image/jpeg"};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export default app;
