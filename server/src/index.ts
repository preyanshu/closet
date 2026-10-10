import { Hono } from "hono";
import { cors } from "hono/cors";

/**
 * Wardrobe API Worker.
 *
 * Keeps Cloudflare credentials on the server. The mobile client downscales a
 * photo, uploads it as multipart, and receives either normalized vision text
 * (detect) or a rendered product image (stage). Provider tokens never ship in
 * the app bundle.
 */

type Env = {
  AI: Ai;
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

app.get("/health", (c) => c.json({ ok: true }));

app.post("/v1/detect", async (c) => {
  const form = await c.req.formData();
  const image = form.get("image") as unknown as File | null;
  const prompt = form.get("prompt");
  if (!image || typeof image.arrayBuffer !== "function") return c.json({ error: "multipart field 'image' is required" }, 400);

  const dataUri = await fileToDataUri(image);
  const result = await c.env.AI.run(DETECT_MODEL, {
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
  } as never);

  return c.json({ text: extractText(result) });
});

app.post("/v1/stage", async (c) => {
  const form = await c.req.formData();
  const image = form.get("image") as unknown as File | null;
  const prompt = form.get("prompt");
  if (!image || typeof image.arrayBuffer !== "function") return c.json({ error: "multipart field 'image' is required" }, 400);

  const bytes = [...new Uint8Array(await image.arrayBuffer())];
  const result = (await c.env.AI.run(STAGE_MODEL, {
    prompt: typeof prompt === "string" && prompt ? prompt : DEFAULT_STAGING_PROMPT,
    input_image_0: bytes,
    width: 1024,
    height: 1024,
    guidance: 3.0,
  } as never)) as { image?: string };

  if (!result?.image) return c.json({ error: "model returned no image" }, 502);
  return c.json({ image: result.image });
});

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((error, c) => {
  console.error("[wardrobe-api]", error);
  return c.json({ error: error.message || "internal error" }, 500);
});

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
