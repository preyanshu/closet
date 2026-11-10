import { WardrobeApiError } from "@/services/api/wardrobe-api";
import { avoidNote, pickFresh, type BlockedLook } from "@/services/look-memory";
import type { ComposeAIResult } from "@/services/outfit-engine";

/**
 * One daily batch that never re-serves what the user owns, recently saw, or
 * rejected. The stylist is told what to avoid; its output is filtered anyway;
 * and if the whole batch was repeats it gets exactly one more try.
 */
export async function composeFreshBatch(
  compose: (userRequest?: string) => Promise<ComposeAIResult>,
  blocked: BlockedLook[],
): Promise<{ result: ComposeAIResult; outfits: ComposeAIResult["outfits"]; retried: boolean }> {
  const note = avoidNote(blocked);
  const run = (extra = "") => compose(`${note}${extra}`.trim() || undefined);

  let result = await run();
  let picked = pickFresh(result.outfits, blocked);
  let retried = false;
  if ((picked.looks.length === 0 || picked.onlyRepeats) && result.outfits.length > 0) {
    retried = true;
    const again = await run("\nYour previous attempt repeated blocked looks. Use different tops, bottoms or shoes this time.").catch(() => null);
    if (again) {
      const second = pickFresh(again.outfits, blocked);
      if (second.looks.length > 0 && !second.onlyRepeats) { result = again; picked = second; }
    }
  }
  if (picked.looks.length === 0 && result.outfits.length > 0) {
    throw new WardrobeApiError("Alta only had looks you've already passed on. Add a few new pieces and try again.");
  }
  return { result, outfits: picked.looks, retried };
}
