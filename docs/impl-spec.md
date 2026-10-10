# Implementation Specification — PR1: Domain Model & Taxonomy

Decisions locked for PR1 of the wardrobe architecture migration
(report: [`wardrobe-architecture-report.md`](./wardrobe-architecture-report.md)).

## Scope
Introduce the durable domain model the backend repository and recommendation engine will
later write/read. Screens still render from in-memory state seeded by `data/mock.ts`, but
every consumer now speaks the canonical `Item`/`Outfit` vocabulary.

## Domain types (`types/domain.ts`)
- `Item` replaces the old `ClothingItem`:
  - `primaryColor: string` (renamed from `color`); optional `secondaryColors: string[]` for accents such as gold hardware or contrast stitching.
  - `styleTags: string[]` (renamed from `aesthetics`) — style-level tags only (minimal, office, streetwear…). Occasion/formality are separate facts, not vibe tags.
  - `priceMinor: number | null` + `priceCurrency: string` (USD). `null` means **unknown**; `0` means a confirmed free item. `priceToNumber()` / `formatPrice()` convert; `formatPrice` renders `—` for unknown.
  - `originalAssetUri` (source-of-truth photo, never overwritten by staging) + `displayAssetUri` (clean/segmented display version). Screens render `displayAssetUri`.
  - `subcategory?: string` (button-down vs tank vs blouse inside `top`), `role: ItemRole` (base/mid/outer layer, bottom, footwear, bag…), cosmetic `pattern/sleeveLength/fit/visibleTexture`, soft `formality` and `warmthBand`, optional `brand`.
  - Statuses split by meaning: `availabilityStatus` (available/laundry/packed/unavailable — a laundry tee is still owned), `lifecycleStatus` (owned/archived/sold/deleted), `processingStatus` (pending/ready/partial/failed).
  - Sync metadata: `createdAt`, `updatedAt`, `revision` (bumps on edit so stale AI/recommendation output can be detected), optional `aiAttributes[]` carrying per-field provenance (`AiAttribute` with source, modelVersion, reviewStatus).
- `Outfit` keeps `itemIds` (rendering path) and adds optional `items: OutfitItemRef[]` (role + layerOrder), `source: "manual" | "recommended" | "imported" | "demo"`, `isDemo`, `currentRevisionId`, timestamps, and keeps `metadata`/`tags`/`previewUri`.
- `WearEvent` (confirmed wear), `Plan` (outfit scheduled for a day), `FeedbackEvent` (save/reject/swap/impression) are declared now; they become tables in PR2/PR6.

## Taxonomy (`types/taxonomy.ts`)
- `categoryLabels`, `roleLabels`, `availabilityLabels`, `lifecycleLabels`, `processingLabels`, `warmthLabels`.
- `subcategoryOptions` per category and `defaultRoleForCategory(category)` — the conservative role scan/confirm assign when only the category is known.

## Data (`data/mock.ts`)
- Keeps export names (`clothingItems`, `mockOutfitAlbums`, `aesthetics`, `categoryLabels`) so imports survive; `clothingItems` and `mockOutfitAlbums` re-typed.
- Same 18 item ids and 7 demo album ids; image asset paths unchanged (`@/assets/item-1..4.png`).
- Mock albums set `source: "demo"`, `metadata.demo: true`, `currentRevisionId`, and an example `items[]` composition anchored to the old item ids.

## Behavior contracts kept identical for seeded data
- Closet/home/outfits/plan/style/item-detail/look-detail render exactly as before.
- Item detail "Vibes" reads `styleTags`, color reads `primaryColor`, price shows `—` when unknown.
- Scan and manual add construct full `Item`s:
  - `originalAssetUri` = camera/library photo, `displayAssetUri` = staged version (or original when staging was skipped).
  - Blank price ⇒ `priceMinor: null` (unknown, shown as `—`); a valid amount is stored in cents.
  - `role` = `defaultRoleForCategory(category)`.
- Analytics total/avg/donut exclude items with unknown price; a caption notes how many are unknown.

## Deleted (confirmed dead)
- `services/outfit-avatar.ts`, `services/background-removal.ts`, `components/garment-art.tsx`.

## Deferred, not dropped
- expo-sqlite repository + `wear_events`/`plans`/`feedback` tables → PR2.
- Server-side Cloudflare processing (assets to R2, Workers AI attributes) → PR3.
- Rules-first composition engine → PR4 (engine still the deterministic placeholder).
- Wear-event capture wiring → PR6.