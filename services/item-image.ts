/** Shared asset resolution for the closet, builder, and image generation. */
export function itemImageSource(uri: string) {
  switch (uri) {
    case "@/assets/look-preview.png": return require("@/assets/look-preview.png");
    case "@/assets/item-1.png": return require("@/assets/item-1.png");
    case "@/assets/item-2.png": return require("@/assets/item-2.png");
    case "@/assets/item-3.png": return require("@/assets/item-3.png");
    case "@/assets/item-4.png": return require("@/assets/item-4.png");
    default:
      // Signed cloud links change every launch; key the image cache on the stable part so photos aren't re-downloaded.
      return uri.includes("/storage/v1/object/sign/") ? { uri, cacheKey: uri.split("?")[0] } : { uri };
  }
}
