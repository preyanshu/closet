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
- Avatar rendering → deferred (composition-first).

## PR6 — LLM-native styling: client-side agent + decision layer

The old one-shot `POST /v1/style` (Scope → Compose → Verify with a scoped catalog) was
**deleted**. Styling is now two primitives: a **client-side tool-using agent** (the phone is
the tool host — the closet is never bulk-uploaded) and a **Clef-flash decision layer** for
cheap typed judgments.

### Agent core (`services/stylist-agent.ts`)
- Model: `@cf/qwen/qwen3-30b-a3b-fp8` by default (MoE, 3B active; 32k ctx), env-overridable
  via `STYLE_MODEL`. Rolled back from `llama-3.3-70b-instruct-fp8-fast`, whose output rate
  (204,805 neurons/M) exhausted the 10k/day free tier in a few sessions; qwen3-30b-a3b is
  ~6.5× cheaper (4,625 in / 30,475 out) and the judgment is delegated to clef-flash anyway.
  `MAX_AGENT_TURNS = 20` (measured max **8 turns**; headroom against a runaway loop).
- `STYLIST_SYSTEM` is a **creative stylist brief, not a rulebook** — persona-led ("styling,
  not a checklist"), occasion/weather reads left to the model's judgment, no hardcoded
  definitions ("casual = X"). It asks for the model's **best 3–5 looks, fewer if only a few
  are good** — never padding to a target. Interface rules only: real ids, one `one_piece` OR
  `base_top`+`bottom`, footwear mandatory, 3–6 pieces, availability.
- **Temperature** configurable, default **0.8** for creativity (0.5 on the review pass);
  `runStyleTurn(messages, tools, maxTokens, temperature)`, server clamps 0–1.5.
- **Weather**: `services/weather.ts` (pure) fetches Open-Meteo current conditions +
  precipitation chance; `state/use-weather.ts` resolves device location (expo-location, fails
  soft) and caches 30 min. `describeWeather()` is injected as a `<weather>` line; season band
  derives from feels-like temp; weather buckets the daily cache key.
- **Jev-gated self-critique**: after composing, one clef-flash call judges each complete
  ensemble for the occasion/weather; only a flagged look triggers a re-styling session (with
  Jev's critique as feedback). Default OFF in dev, ON in prod (`EXPO_PUBLIC_STYLIST_SELF_CRITIQUE`).
- **5 tools, executed locally** (deterministic sort: role order → wear_count desc → id):
  - `get_wardrobe_overview` — counts by role, palette/tag histograms, favorites, most-worn,
    never-worn, availability summary (orient-first).
  - `search_items` — paginated filter (role/category/colors/style_tags/formality/warmth/
    query/favorites_only/include_unavailable; page_size ≤ 40); over-filtered searches
    **self-relax** (drops warmth→colors→style_tags→formality→category→role).
  - `get_items(ids[])` — full-fat lines, max 25 (fit, texture, brand, price, cost/wear,
    last worn, availability, favorite).
  - `get_saved_looks(limit≤5)` — taste memory; "do not re-propose these exactly".
  - `get_item(id)` — single full-fat line.
- Tool-call quirk: array args often arrive JSON-stringified (`colors:"[\"black\"]"`); values
  are revived before execution (server normalize + client `runTool`).
- **Usage/cost logging**: the worker logs `in`/`out` tokens and estimated neurons per AI call
  (`NEURON_RATES`), visible in `wrangler dev` output.
- Final reply is **only** JSON: `{"reply","outfits":[{"items","label","reason"}]}` — one
  contract for both lanes (daily lane ignores `reply`, chat renders it as a bubble).
- `CHAT_SYSTEM` extends the brief: conversational `reply` (<2 sentences), visibly-different
  retries after rejects.

### Server (`server/src/index.ts`)
- `POST /v1/style/turn` — thin proxy `{ messages, tools, max_tokens?, temperature? }` →
  `{ tool_calls }` (`normalizeToolCalls`, handles function-wrapped/flat shapes) or `{ text }`.
  Model env-overridable via `STYLE_MODEL` (default `qwen3-30b-a3b-fp8`). Final-turn text
  unwraps `choices[0].message.content` / structured `response`. Messages cap 400.
- `POST /v1/decide` — thin proxy `{ state, questions, images? }` → `{ answers }` to
  `DECIDE_MODEL = "@cf/cloudflare/clef-flash"` (Jev/System One compatible; ~$0.038/M input,
  no output billing, ~38ms median). Questions are typed: `noul | choice | score`.
  `score` requires `criteria` as an **ordered list** (e.g. `["1","2","3","4","5"]`); `levels`
  is rejected. Returned `score` is a **0-based index mean** — `score1To5()` bands it to 1–5.
  Confidence is derived from `max(probabilities)` (Clef's own `confidence` is a weak signal).
- `STYLE_SYSTEM`/`buildStylePrompt`/`StyleItem`/`parseJsonPayload` removed.

### Decision layer (`services/decision.ts`)
Typed Clef helpers (each one small `/v1/decide` call; caller handles fallback):
`triageWardrobeDiff` (restyle noul + impact choice), `parseStylingPrompt`
(occasion/formality/warmth/style_vibe/is_styling), `decideRetryDirection`,
`shouldAskToNarrowDown`, `checkCoherence` (palette score + cohesion), `salvageCandidates`.
Provider stays swappable (clef-flash ↔ Jev) = server model-id change only.

### Composition (`services/outfit-engine.ts`)
- `scopeItems`/`SCOPE_CAPS`/`toStyleContext`/`toStyleCatalog`/`composeOutfitsWithLLM`
  deleted. New `composeOutfitsAI(context, items, options)` runs the agent, validates with
  `verifyAndRepairOutfits` (rules), and tops up with the deterministic engine when the agent
  returns fewer than `count`. Returns `{ outfits, reply, turnsUsed }`.
- `composeOutfits` / `generateOutfitsForToday` stay: builder lane + failure fallback (two
  lanes: builder = instant rules, agent = "don't make me think").

### Daily looks + triggers (`state/use-daily-looks.ts`)
- Cache key `daily_looks_v1:{date}:{aestheticId}:{count}` + djb2 wardrobe hash (id:revision);
  all tabs read one batch; cache hit = 0 LLM calls.
- **Wardrobe-change triage**: hash change → 45s debounce (batch rapid scans) → hard rules
  (deleted/edited styling-relevant field while referenced by cached looks, or ≥3 additions →
  regenerate) → else Clef `triageWardrobeDiff` (≥0.7 regenerate; KEEP extends the cache to
  the new hash). Explicit ↻ (`refresh()`) always busts.
- Fallback: AI failure → keep cached looks, else `generateOutfitsForToday` + retry banner.
- Styling-relevant fields: role/category/subcategory/colors/pattern/fit/sleeve/texture/
  formality/warmth/styleTags/statuses — name/brand/price/photo edits are cosmetic.

### Chat lane (`app/chat.tsx`)
- Typed `ChatMessage` (user/alta text + `outfits?` + error/narrow kinds); per-message agent
  sessions seeded with conversation history (ephemeral; saving persists via `savedLooks`).
- **Trivial-chat gate**: `parseStylingPrompt` → `is_styling` noul ≥ 0.5 (live-calibrated:
  clear styling asks score ~0.63–0.95 in the combined call, chit-chat ~0.01); chit-chat gets a canned
  reply (0 styling sessions). Gate failure → treat as styling.
- Offer → react → refine: cards show Save (♡ persists full outfit) / Not this (accumulates
  rejects) / message-level ↻ Try again → `decideRetryDirection` seeds a visibly-different
  retry; `shouldAskToNarrowDown` after repeated retries → ask instead of burning sessions;
  failure → "Styling hiccup" + inline Retry. Typing indicator + haptics throughout.
- **No "wore this" in chat** — chat offers, it never commits.

### B signals (option B: real signals)
- `logWear(outfitId, itemIds, localDate?)` on context → `recordWearEvent` + item
  wearCount/lastWorn bump (persisted). Callers: **Home Today deck** and **Plan past days**
  (placement rule: *propose anywhere, commit where the day lives* — never in chat).
- Availability quick-actions on item detail (`available/laundry/packed/unavailable` →
  `updateItem`); unavailable pieces are already excluded by `isEligible`. `removeItem` added
  (feeds triage).

### Saved-look unification
- `savedLooks: Outfit[]` on context (hydrated from outfits with `source: "recommended"`);
  `toggleSavedLook(outfitId, outfit?)` persists the full outfit on save (so surviving new
  daily batches). outfits/calendar/saved-looks/look-detail/plan read context `savedLooks` —
  no more regenerating outfits to find "saved" ones.

## PR7 — Detect rework (Clef-flash bounded extraction)

- `services/garment-detect.ts`: the free-form vision-JSON prompt
  (`llama-3.2-11b-vision-instruct` + `JSON.parse`) is replaced by **8 typed questions** on
  `runDecision(..., images=[dataUri])` → `/v1/decide` (Clef-flash multimodal): `category`,
  `primary_color`, `fit`, `sleeve_length`, `pattern`, `texture` (choices from bounded sets),
  `formality`, `warmth` (score questions on the ordered scale `["1".."5"]`, banded to
  casual/smart-casual/formal and light/medium/heavy).
- Every answer carries `confidence` + `probabilities`. `AUTO_CONFIRM_THRESHOLD = 0.85` →
  `AiAttribute.reviewStatus: "confirmed"`; below → `"suggested"` (tap-to-confirm chips in the
  scan ReviewSheet with confidence %). User edits flip the row to `source: "user"`.
- **Deterministic name template** (`Black relaxed jacket`) — the model never writes names.
- `Item.aiAttributes` now actually populated (`toAiAttributes`, modelVersion `clef-flash`);
  `AiAttribute` gained optional `confidence`. Scan persists the full-fat fields it used to
  drop: `pattern/fit/sleeveLength/visibleTexture/formality/warmthBand`.
- `/v1/detect` (llama vision) stays as an endpoint but the client no longer calls it.
