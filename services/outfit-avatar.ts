import type { ClothingItem } from "@/data/mock";
import { itemImageSource } from "@/services/item-image";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import { fetch } from "expo/fetch";

/** Add three garments per pass, reserving one reference for the previous avatar. */
export async function generateOutfitAvatar(items: ClothingItem[], signal: AbortSignal, onProgress: (message: string) => void): Promise<string> {
  const account = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.EXPO_PUBLIC_CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error("Avatar generation is not configured yet. Your selected pieces are still here.");
  if (!items.length) throw new Error("Choose some pieces first.");
  let avatar: string | undefined;
  for (let start = 0; start < items.length; start += 3) {
    if (signal.aborted) throw new Error("Generation cancelled.");
    const batch = items.slice(start, start + 3);
    onProgress(start ? `Adding layers and details · ${Math.min(start + 3, items.length)} of ${items.length} pieces` : "Creating your outfit avatar…");
    const form = new FormData();
    const sources = [...(avatar ? [{ uri: avatar }] : []), ...batch.map((item) => itemImageSource(item.imageUrl))];
    for (let index = 0; index < sources.length; index++) {
      const image = await Image.loadAsync(sources[index]);
      const context = ImageManipulator.manipulate(image);
      try {
        context.resize(image.width >= image.height ? { width: 512 } : { height: 512 });
        const rendered = await context.renderAsync();
        try {
          const resized = await rendered.saveAsync({ format: SaveFormat.PNG });
          form.append(`input_image_${index}`, new File(resized.uri) as unknown as Blob);
        } finally { rendered.release(); }
      } finally { context.release(); image.release(); }
    }
    const references = batch.map((item, index) => `Reference ${index + (avatar ? 2 : 1)}: ${item.name} (${item.category}).`).join(" ");
    form.append("prompt", `${avatar ? "Reference 1 is the existing outfit avatar. Preserve the exact same person, pose, background, and ALL previously worn pieces. Add the following pieces." : "Create a realistic full-body adult fashion avatar wearing the supplied clothing references. Neutral standing pose, head and shoes fully visible, warm ivory studio background, soft editorial lighting."} ${references} Preserve each referenced garment's actual color, cut, texture and details. Layer outerwear in reference order, inner to outer, keeping earlier layers visible where possible. Wear all accessories together, including socks, eyewear, rings, jewellery and bags. Do not replace earlier accessories. No text, collage or product tiles. Complete outfit: ${items.map(item => item.name).join(", ")}.`);
    form.append("width", "768");
    form.append("height", "1024");
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal });
    if (!response.ok) throw new Error("Couldn't generate your avatar. Please try again.");
    const result = await response.json() as { success?: boolean; result?: { image?: string } };
    const encoded = result.result?.image;
    if (!result.success || !encoded) throw new Error("No preview was returned. Please try again.");
    if (signal.aborted) throw new Error("Generation cancelled.");
    const binary = atob(encoded.includes(",") ? encoded.split(",")[1] : encoded);
    const output = new File(Paths.document, `outfit-avatar-${Date.now()}-${start}.png`);
    output.write(Uint8Array.from(binary, character => character.charCodeAt(0)));
    avatar = output.uri;
  }
  return avatar!;
}
