import { supabase } from "@/services/supabase";
import { File } from "expo-file-system";

/** Piece photos live in a private bucket; the app shows them through signed links. */
const BUCKET = "closet-images";
/** Links last a week; every launch and reload fetches fresh ones. */
const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;

export const isLocalFile = (uri: string) => uri.startsWith("file://") || uri.startsWith("/");

const extensionOf = (uri: string) => (/\.(png|jpe?g|webp|heic)$/i.exec(uri.split("?")[0])?.[1] ?? "jpg").toLowerCase().replace("jpeg", "jpg");
const contentTypeOf = (extension: string) => (extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "heic" ? "image/heic" : "image/jpeg");

/** Upload a photo from this phone; returns its storage path. */
export async function uploadImage(userId: string, itemId: string, slot: "display" | "original", uri: string): Promise<string> {
  const extension = extensionOf(uri);
  const path = `${userId}/items/${itemId}/${slot}.${extension}`;
  const buffer = await new File(uri).arrayBuffer();
  const { error } = await supabase!.storage.from(BUCKET).upload(path, buffer, { contentType: contentTypeOf(extension), upsert: true });
  if (error) throw new Error(`image upload: ${error.message}`);
  return path;
}

/** Signed links for many paths at once (path -> url). Paths that fail to sign are left out. */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths)];
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrls(chunk, SIGNED_URL_SECONDS);
    if (error || !data) continue;
    for (const entry of data) if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

export async function removeImages(paths: string[]): Promise<void> {
  const real = paths.filter(Boolean);
  if (real.length > 0) await supabase!.storage.from(BUCKET).remove(real);
}
