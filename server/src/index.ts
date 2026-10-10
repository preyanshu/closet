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
