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

### Seeding / clean start
- The app starts **empty**: a fresh install has no demo wardrobe. `loadWardrobeSnapshot()` runs a
  one-time `mock_cleanup_v1` migration that deletes legacy mock rows (`item-*` items,
  `mock-*`/`isDemo` outfits), strips their ids from saved looks/favorites, and clears cached
  daily looks. Scanned items persist as `scan-*` and are never touched. `data/mock.ts` remains
  only as a typed fixture source for tests; nothing seeds or renders it at runtime.

### State
- `ClosetProvider` hydrates from `loadWardrobeSnapshot()` and exposes `isHydrated`. Writes
  (`addItem`, `addMyLook`, `removeMyLook`, `toggleSavedLook`, `toggleFavorite`,
  `setStylePreferences`) apply optimistically and persist write-through. `myLooks` excludes
  demo albums (`isDemo`). The outfit library renders only saved + custom looks; demo albums are
  no longer shown.

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
  `MAX_AGENT_TURNS = 20` (headroom against a runaway loop). Each turn gets the server's full
  **2000-token** budget: qwen3 emits hidden reasoning before the answer, and a smaller budget
  truncates the multi-look JSON. One repair turn follows any unparseable/empty final answer,
  with `/no_think` forced into the system so reasoning cannot eat the budget again.
- **Tool evidence is enforced**: the loop records every item id a tool actually returned and
  rejects/nudges any answer that names ids never shown (the digest is counts-only, so a
  no-tool answer would be guessing). Complete looks are also salvaged from malformed JSON
  (e.g. a missing `}` on the last look) instead of discarding the whole reply.
- `STYLIST_SYSTEM` is a **creative stylist brief, not a rulebook** — persona-led ("styling,
  not a checklist"), occasion/weather reads left to the model's judgment, no hardcoded
  definitions ("casual = X"). It asks for the model's **best 3–5 looks, fewer if only a few
  are good** — never padding to a target. Interface rules only: real ids, one `one_piece` OR
  `base_top`+`bottom`, exactly one footwear, **one item per slot**, 3–6 pieces, availability,
  and labels/reasons that name only the pieces actually listed.
- **Temperature** configurable, default **0.8** for creativity (0.5 on the review pass);
  `runStyleTurn(messages, tools, maxTokens, temperature)`, server clamps 0–1.5.
- **Wearer presentation**: read from profile metadata (`profile_metadata_v1`, `UserProfileMetadata`)
  and injected as `wearer_presentation` into both the stylist and reviewer prompts. Defaults to
  `male` for testing; Profile → "Styled for" (Female / Male / Any) writes the preference, and
  it is part of the daily cache key so changing it loads/generates that wearer's batch.
- **Weather**: `services/weather.ts` (pure) fetches Open-Meteo current conditions +
  precipitation chance; `state/use-weather.ts` resolves device location (expo-location, fails
  soft) and caches 30 min. `describeWeather()` is injected as a `<weather>` line; season band
  derives from feels-like temp. Weather shapes the once-a-day run but is not a cache-key
  component, so a mid-day weather change does not regenerate today's looks.
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
  - `show_outfits(looks[])` — **chat-only render tool**: structured looks
    (`items/label/reason`) built from real ids. The client renders image cards and returns a
    tool summary; ids never enter the chat text. Invalid ids get one recovery nudge. The
    compose lane does not see this tool.
- Tool-call quirk: array args often arrive JSON-stringified (`colors:"[\"black\"]"`); values
  are revived before execution (server normalize + client `runTool`).
- **Usage/cost logging**: the worker logs `in`/`out` tokens and estimated neurons per AI call
  (`NEURON_RATES`), visible in `wrangler dev` output.
- Compose/daily lane replies with JSON: `{"reply","outfits":[{"items","label","reason"}]}`
  (the daily lane ignores `reply`).
- **Chat lane is plain text + a `show_outfits` tool** (JSON quoting was unreliable on the
  streaming model): the reply is normal prose, and the model renders cards by calling
  `show_outfits({ looks: [{ items, label, reason }] })`. Item ids never appear in the chat
  text. The parser still accepts the legacy `<<<OUTFITS>>>` pipe block and JSON envelope.
- `createReplyStream` streams only user-facing text — everything before the legacy marker (or
  the legacy `reply` field) — so tool/scaffolding content never flashes in the bubble.
- `CHAT_SYSTEM` is conversational and standalone (not derived from the compose brief). It
  writes the reply first, then calls `show_outfits`; retries with explicit outfit intent use
  the same contract.

### Server (`server/src/index.ts`)
- `POST /v1/style/turn` — thin proxy `{ messages, tools, max_tokens?, temperature? }` →
  `{ tool_calls }` (`normalizeToolCalls`, handles function-wrapped/flat shapes) or `{ text }`.
- `POST /v1/style/stream` — SSE variant over the OpenAI-compatible
  `/ai/v1/chat/completions` endpoint (`stream: true`). Accumulates fragmented `tool_calls`
  arguments by index, forwards `event: delta` text (string or content-array chunks),
  `event: tool_calls`, `event: done`, `event: error`; logs usage as `style.stream`. Requires a
  non-empty `tools` array.
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
`triageWardrobeDiff` (restyle noul + impact choice), `decideRetryDirection`,
`checkCoherence` (palette score + cohesion), `salvageCandidates`. `parseStylingPrompt` and
`shouldAskToNarrowDown` were removed — chat no longer gates or injects canned wording.
Provider stays swappable (clef-flash ↔ Jev) = server model-id change only.

### Composition (`services/outfit-engine.ts`)
- `scopeItems`/`SCOPE_CAPS`/`toStyleContext`/`toStyleCatalog`/`composeOutfitsWithLLM`
  deleted. New `composeOutfitsAI(context, items, options)` runs the agent and validates with
  `verifyAndRepairOutfits` (rules), which also drops duplicate roles (never two pairs of
  shoes) and caps at 6 pieces. It **never pads** — if the stylist returns one good look,
  we surface one. Returns `{ outfits, reply, turnsUsed, suggestions }`. When the wardrobe
  can't cover a top (or one-piece) + bottom + shoes, it returns **no looks plus role-based
  add suggestions** (`canComposeOutfit` / `suggestWardrobeAdditions`) and skips the model
  call entirely.
- `chatWithAlta(context, items, options)` is the conversational lane: it runs
  `runChatAgent` (same loop plus the chat-only `show_outfits` tool). Prose is a complete
  answer; structured looks come from `show_outfits` (legacy marker/JSON text still parses).
  It only verifies/critiques looks the model chose to include. No wardrobe gate and no outfit
  requirement — a question can answer with zero looks.
- `composeOutfits` / `generateOutfitsForToday` remain for the manual **builder** lane only
  (instant rules). They are never used to fill or rescue agent output.

### Daily looks + cache (`state/use-daily-looks.ts`)
- **One agent session per local day**, per aesthetic/count/presentation. The cache key is
  `daily_looks_v1:{aestheticId}:{count}:{presentation}` and the stored record is
  `{ dateKey, looks, suggestions, generatedAt }` — the day is a field, not part of the key, so
  the same record survives midnight.
- **Open → instant render**: read the stored batch and show it immediately (0 LLM calls, no
  loading state). Same `dateKey` → stop. Older `dateKey` → keep the old looks on screen and
  revalidate silently in the background, then swap in the new batch.
- **Stale pieces are never rendered**: a look needs ≥2 pieces still in the wardrobe. Cached
  looks that reference deleted items are filtered out (and an all-stale batch is regenerated
  instead of showing an empty card).
- **Wardrobe changes do not regenerate today's looks.** Scans/edits/additions are picked up by
  the next day's background run; the old hash + triage path is gone. Weather changes are also
  ignored mid-day.
- First-ever run (no stored batch) waits for weather to settle and shows the one-time loading
  card; afterwards the cache always has something to render.
- Explicit ↻ (`refresh()`) forces a restyle; old looks stay visible and the small button spins.
  AI failure with cached looks is silent for automatic runs and reported for manual ones; with
  no looks it surfaces an error. We never substitute rules-engine output.
- **Home cards are minimal**: a compact two-column collage of the look's real pieces, its
  label/description, and a single **Add to outfits** pill (tap again to remove). No like/share/
  "I wore this" row, and no custom "My looks" section — Home only shows that day's AI looks.
  Tapping a card opens the look-detail modal; the not-yet-saved daily look is passed through the
  route params so it renders even though it isn't in the outfit library.
- **Too few pieces** is a normal cached result: `ready` with zero looks + `suggestions`
  (stored too, so it isn't recomputed all day); Home shows "Not quite enough to style yet" with
  add-to-closet hints, and chat folds the hints into its reply.

### Chat lane (`app/chat.tsx`)
- **Conversational assistant, not an outfit vending machine**: every message goes through
  `chatWithAlta` with the tool-using agent. It answers wardrobe questions (what goes with
  these boots, is this right for a wedding, what's missing, packing) by calling
  `get_wardrobe_overview` / `search_items` / `get_items` / `get_saved_looks` as needed, and
  only attaches outfit cards when the user asks for looks or a concrete look genuinely helps.
  There is no trivial-chat gate, no starter assistant bubble, and no canned reply; plain prose
  is a valid answer and an empty conversation shows a static prompt instead of a fake message.
- Outfit cards appear only when `outfits.length > 0`; Save (♡ persists the full outfit) /
  Not this (accumulates rejects) / message-level ↻ Try again → `decideRetryDirection` seeds a
  visibly-different retry. Retry is outfit-specific and forces `show_outfits`.
  Failures keep any streamed prose and add a bare Retry control, never a fabricated stylist line.
- **Streaming + activity**: chat uses `runStyleTurnStream` (SSE `/v1/style/stream`) and renders
  the reply token-by-token (40ms throttle). While a turn runs, a **single live status line**
  shows "Thinking…" or the one tool currently running ("Searching your pieces · black…"); tools
  execute with a short 240ms dwell so each is perceptible, and the line advances instead of
  stacking every call at once. `show_outfits` renders real image cards; ids stay out of the
  bubble. An empty/failed turn shows no fake text, just Retry (any partial prose is preserved).
- One request runs at a time; history includes prior outfit-bearing turns. Typing indicator
  + haptics throughout.
- Typed `ChatMessage` (user/alta text + `outfits?` + error kinds); per-message agent sessions
  seeded with conversation history (ephemeral; saving persists via `savedLooks`).
- **No "wore this" in chat** — chat offers, it never commits.

### B signals (option B: real signals)
- `logWear(outfitId, itemIds, localDate?)` on context → `recordWearEvent` + item
  wearCount/lastWorn bump (persisted). Callers: **Home Today deck** and **Plan past days**
  (placement rule: *propose anywhere, commit where the day lives* — never in chat).
- Availability quick-actions on item detail (`available/laundry/packed/unavailable` →
  `updateItem`); unavailable pieces are already excluded by `isEligible`. `removeItem` added.

### Saved-look unification
- **Orphan looks are pruned**: a saved/custom look whose pieces have all been deleted is removed
  from the library on hydration and on item deletion (its `saved_look_ids` entry and DB row are
  cleaned up). The Outfits screen also filters defensively, so a 0-piece look can never render.
- `savedLooks: Outfit[]` on context (hydrated from outfits with `source: "recommended"`);
  `toggleSavedLook(outfitId, outfit?)` persists the full outfit on save (so surviving new
  daily batches). outfits/calendar/saved-looks/look-detail/plan read context `savedLooks` —
  no more regenerating outfits to find "saved" ones.

## PR7 — Detect rework (Clef-flash bounded extraction)

- `services/garment-detect.ts`: the free-form vision-JSON prompt
  (`llama-3.2-11b-vision-instruct` + `JSON.parse`) is replaced by **10 typed questions** on
  `runDecision(..., images=[dataUri])` → `/v1/decide` (Clef-flash multimodal): `category`,
  `subcategory`, `primary_color`, `secondary_color`, `fit`, `sleeve_length`, `pattern`,
  `texture` (choices from bounded sets), `formality`, `warmth` (score questions on the ordered
  scale `["1".."5"]`, banded to casual/smart-casual/formal and light/medium/heavy).
- **Presence gate (cost saver)**: `detectItemPresence()` asks one cheap image question first.
  If no clothing/accessory is visible it skips Flux staging + extraction and keeps the photo as
  a manual draft whose review card says **"No item detected"** — the user can still fill in
  details and save it (a wrong "no" never traps them). It fails open, so a flaky gate never
  blocks a real scan.
- The subcategory drives `category`, `role` (dresses/jumpsuits → `one_piece`, bags → `bag`, …)
  and the name, so extraction stays coherent across garment types.
- **Detection → staging (sequential)**: extraction runs first, then its
  name/subcategory/color/material are injected into `buildStagingPrompt()`. The prompt names the
  exact subject and treats everything else (bedsheets, bedding, tables, background fabric) as
  removable background, and zooms in when the item is small in frame. This fixes staging that
  previously kept the bedsheet along with a small item.
- **Staging is best-effort**: if image cleanup fails, the detected attributes/name are kept, the
  original photo is used, and the review sheet shows a quiet "image cleanup couldn't run" note
  instead of an error. The piece stays fully savable.
- Every answer carries `confidence` + `probabilities`. `AUTO_CONFIRM_THRESHOLD = 0.85` →
  `AiAttribute.reviewStatus: "confirmed"`; below → `"suggested"`. The scan ReviewSheet surfaces
  these in a structured **Detected details** card near the top: one row per attribute (Type,
  Fit, Sleeve, Pattern, Fabric, Occasion, Warmth) with a confirmed checkmark or a qualitative
  "Check" marker (no raw percentages). Tapping a row expands inline choices to correct the
  value; picking one (or "Looks right") confirms it. Category/color keep their dedicated
  editors. User edits flip the row to `source: "user"`.
- **Deterministic name template** (`Black leather sneaker`, `Cream knit polo`) — the model
  never writes names.
- `Item.aiAttributes` now actually populated (`toAiAttributes`, modelVersion `clef-flash`);
  `AiAttribute` gained optional `confidence`. Scan persists the full-fat fields it used to
  drop: `pattern/fit/sleeveLength/visibleTexture/formality/warmthBand`.
- `/v1/detect` (llama vision) stays as an endpoint but the client no longer calls it.
