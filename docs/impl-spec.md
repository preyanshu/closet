# Implementation Specification — Wardrobe Migration

Decisions locked across the wardrobe architecture migration
(report: [`wardrobe-architecture-report.md`](./wardrobe-architecture-report.md)).
Sections are appended per PR.

## PR1 — Domain model & taxonomy

Decisions locked for PR1 of the wardrobe architecture migration.

## Scope
Introduce the durable domain model the backend repository and recommendation engine will
later write/read. Every PR ships its **consumer UI** alongside the data/logic change — no
PR lands a model or service change without the screens that present it (see UI parity rule).

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

## Behavior contracts
- Closet/home/outfits/plan/style/look-detail render as before.
- **Item detail** surfaces the new model: Piece details (price, category · subcategory, color + accents, brand), Fabric & fit (role, fit, sleeve, pattern, texture, warmth, formality), Status (availability, lifecycle, processing), and Wear history. Rows with no value (e.g. sleeve length on shoes) are omitted; Status renders only when noteworthy (non-default availability/lifecycle/processing); unknown price shows `—`.
- Scan and manual add construct full `Item`s:
  - `originalAssetUri` = camera/library photo, `displayAssetUri` = staged version (or original when staging was skipped).
  - Blank price ⇒ `priceMinor: null` (unknown, shown as `—`); a valid amount is stored in cents.
  - `role` = `defaultRoleForCategory(category)`.
- Analytics total/avg/donut exclude items with unknown price; a caption notes how many are unknown.

## UI parity rule (applies to every PR)
Every change to the domain model, storage, or services must ship the corresponding UI in the
same PR — including empty/partial states for values not yet populated by the pipeline. No
"model now, UI later." Seed/mock data must keep its new fields populated so screens never
render blank rows for the demo wardrobe.

## Deleted (confirmed dead)
- `services/outfit-avatar.ts`, `services/background-removal.ts`, `components/garment-art.tsx`.

## PR2 — Local-first persistence (`expo-sqlite`)

### Storage layer
- `services/storage/database.ts` opens `wardrobe.db`, enables WAL + foreign keys, and runs
  ordered `PRAGMA user_version` migrations. `getDatabase()` returns `null` on web or on any
  open failure so the app degrades to in-memory state instead of crashing.
- `services/storage/wardrobe-repository.ts` maps domain `Item`/`Outfit` to/from rows (nested
  arrays/objects such as `secondaryColors`, `styleTags`, `aiAttributes`, `itemIds`, `items`,
  `tags`, `metadata` stored as JSON text) and exposes `loadWardrobeSnapshot()` plus write
  helpers.
- Tables: `items`, `outfits`, `wear_events`, `plans`, `feedback_events`, `preferences`
  (JSON key/value for `saved_look_ids`, `favorite_item_ids`, `style_preferences`).
  `wear_events`/`plans`/`feedback_events` are created and have repositories now; their UI
  capture wires up in PR6.

### Seeding
- On first run (empty `items`/`outfits`) the DB is seeded from `data/mock.ts`: the 18 wardrobe
  items and the 7 demo albums (`source: "demo"`, `isDemo: true`), plus the default saved looks,
  favorites, and style preferences. Native first-run output is identical to the old in-memory
  state; later launches read the DB as source of truth.

### State
- `ClosetProvider` hydrates from `loadWardrobeSnapshot()` and exposes `isHydrated`. Writes
  (`addItem`, `addMyLook`, `removeMyLook`, `toggleSavedLook`, `toggleFavorite`,
  `setStylePreferences`) apply optimistically and persist write-through. `myLooks` excludes
  demo albums (`isDemo`). Outfit-library demo cards still render from `mockOutfitAlbums`; moving
  that to context is a later refactor.

### UI parity
- `app/_layout.tsx` gates the navigator until `isHydrated`, showing an "Opening your closet…"
  spinner over the themed canvas. Existing empty states (e.g. outfit library) cover the
  no-data case.

## PR3 — Server-side AI (`server/` Worker + API client)

### Worker (`server/`)
- Hono app run **locally** with `wrangler dev` (no deploy, no `env.AI` binding). It proxies to
  the Cloudflare AI REST API using `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` supplied
  through gitignored `server/.dev.vars` (same values as the client previously used).
- `GET /health` → `{ ok, credentials }`.
- `POST /v1/detect` — multipart `image` + optional `prompt`; calls
  `@cf/meta/llama-3.2-11b-vision-instruct` and returns `{ text }` (raw model text, parsed
  client-side by the existing normalizer).
- `POST /v1/stage` — multipart `image` + optional `prompt`; calls
  `@cf/black-forest-labs/flux-2-klein-4b` and returns `{ image }` (base64). The incoming file
  is forwarded as `input_image_0`.
- Permissive CORS for web/dev. Own `package.json`, `tsconfig.json`, `wrangler.toml`,
  `README.md`; excluded from the app's root `tsconfig` so app typecheck ignores it.

### Client (`services/api/wardrobe-api.ts`)
- Reads `EXPO_PUBLIC_WARDROBE_API_URL` (defaults to `http://localhost:8787` for local dev).
  `isWardrobeApiConfigured()` gates the flows. `requestDetection` / `requestStaging` POST
  multipart via `expo/fetch` and surface `WardrobeApiError`.
- `garment-detect.ts` and `garment-staging.ts` now downscale locally, upload the resized
  `File`, and call the Worker. **No `EXPO_PUBLIC_CLOUDFLARE_*` usage remains in the app.**

### Security / ops
- The token now lives server-side (`server/.dev.vars`) instead of the client bundle. Because
  the client previously inlined it, it should still be rotated before shipping a real build;
  rotation + deploy + auth are deferred while running locally.

## PR4 — Rules-first composition engine

### Engine (`services/outfit-engine.ts`)
- Replaces the old category / array-offset placeholder with a deterministic, rules-first
  composer. No randomness, so rendered outfit ids are stable across renders and persistable
  via `savedLookIds`.
- `composeOutfits(context, items)` → `Outfit[]`. `context` carries optional `occasion`
  (everyday/work/casual/dinner/evening/formal/travel), `season` (warm/cool/cold),
  `styleTags`, `anchorItemId`, and `count` (default 2).
- Eligibility (`isEligible`): `lifecycleStatus === "owned"`, `availabilityStatus ===
  "available"`, `processingStatus !== "failed"` — "in laundry" is not "not owned".
- Templates: separates (`base_top` + `bottom`) or `one_piece`, bounded candidate set (≤60).
- Roles drive placement (`ROLE_ORDER`): base → mid → outer → footwear → accessories; layers
  selected by season/occasion (cold ⇒ outer, cool ⇒ mid, work/evening ⇒ blazer-style outer).
- Scoring: style-tag match, `formality` vs occasion, `warmthBand` vs season distance, neutral
  color, wearCount (reliability), anchor bonus; color-harmony bonus on the set. Anchor
  guarantee: `ensureAnchor` swaps/adds the anchor item and heavily penalizes compositions
  that drop it.
- Diversification: greedy pick that penalizes reusing the same bottom/one-piece and top, so a
  2-outfit batch shows different silhouettes.
- Explainer: personae (`familiar`/`dressy`/`comfort`/`underused`/`fresh`) and descriptions
  are generated from facts only (hero piece, occasion), matching report §7/§13.
- Tags: 2–4, mapping to the outfit-library filter chips (Office / Casual / Summer / Evening /
  Travel) plus the batch's dominant style tags.
- `generateOutfitsForToday(aestheticId, items)` still returns 2 uniforms for the home/plan/
  calendar/outfits/look screens; `aestheticId` is treated as a style-tag preference with a
  fallback to the full pool when too few items match.

### UI parity
- `app/look/[id].tsx` now orders items by `items[].layerOrder` (`resolveOutfitItems`) so
  layers render top → mid → outer, shows each piece's `roleLabels` chip, and renders a layer
  badge (L1, L2…) on layered pieces. Demo/custom looks without `items[]` fall back to flat
  `itemIds` order.

## PR5 — Builder integration (Pick → Generate → batch → Save)

### Engine additions (`services/outfit-engine.ts`)
- `OutfitContext.includeItemIds: string[]` — multi-anchor. `ensureIncluded` now guarantees
  every wanted id appears (replacing a same-role piece or appending), and `outfitScore`
  excludes candidates missing any wanted id (hard penalty). A conflict rule keeps a
  `one_piece` silhouette from gaining a `base_top`/`bottom` (and vice versa).
- Candidate de-duplication (same ordered item-set = one candidate).
- `generateVariants` + `fillWithAlternates`: when diversification can't reach the requested
  `count` (e.g. the user pinned top+bottom+shoes, leaving little variety), the batch is
  topped up with real alternatives — accessory swaps (bag ↔ belt ↔ jewelry), drop the bag,
  drop/adjust the outer layer, add a mid layer — never silent clones.

### Builder (`app/builder.tsx`)
- Generate no longer fakes a 1.4s "avatar" and hardcoded `demoDetails`. It calls
  `composeOutfits({ occasion: "everyday", styleTags: taste.ids, anchorItemId: selected[0],
  includeItemIds: rest, count: 3 }, items)` after a brief 900ms composition animation.
- Preview shows the real batch: three selectable "Option N" cards (layer-ordered piece
  thumbnails, grounded description, 2–3 tags). Picking one sets `pickedId`; Save persists the
  actual outfit (real label/description/tags/metadata/items, new `my-look-*` id) into closet
  state. "Edit pieces" returns to select.
- Avatar copy removed ("See it on an avatar" → "See outfit ideas", "Creating your outfit
  avatar" → "Composing outfit ideas").

### Deferred, not dropped (updated)
- D1/R2 bindings + worker auth → later.
- AI reranker over the rule engine + occasion/season/weather chips in the builder → later.
- Wear-event capture wiring → PR6.
- Avatar rendering → deferred (composition-first).
