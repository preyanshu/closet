# Accounts, paywall and cloud storage: setup

Flow: **onboarding → Sign in with Apple → hard paywall → app.** Each stage unlocks the next
(`state/app-flow.tsx`, wired with `Stack.Protected` in `app/_layout.tsx`). A development build
with no keys set skips the sign-in and paywall gates so the app stays usable (see "Dev builds"
below); a production build always enforces them.

## Storage: the cloud is the only store

There is no on-device database. Everything lives in Supabase:

- **`records` table** (`supabase/migrations/0001_init.sql`): pieces, looks, wear events and preferences
  as JSON, protected by row-level security so a user only ever sees their own rows.
- **`closet-images` bucket** (private): piece photos, under the user's own id folder. The app shows
  them through signed links (refreshed on every load; the image cache is keyed on the stable part of the link).
- After sign-in the app loads everything once (`loadWardrobeSnapshot`). Reads then come from memory.
- Every change goes into a write queue (`services/cloud/cloud-store.ts`): it batches, keeps only the
  latest version of each record, uploads photos first.
  If a save can't reach the server it is dropped and a banner says "Can't connect to the server. Your last
  change wasn't saved." with a Reload button; nothing is retried silently.
- The app reloads quietly from the cloud when it returns to the foreground (at most every 2 minutes,
  and only when nothing is waiting to save) so changes from another device appear.
- Signing out, or signing in as someone else, clears everything held in memory.

The one thing held only in memory: answers given in onboarding before the account exists (they are saved to
the account on sign-in; the account's own answers win if it already has some).

## What you need to set up

1. **Supabase project**
   - Run `supabase/migrations/0001_init.sql` in the SQL editor.
   - Auth → Providers → Apple: enable it. For a native app add your bundle id
     (`com.preyanshu.wardrobe` in `app.json`, change it to yours) to "Authorized Client IDs".
   - Copy the project URL and anon key into `.env` (see `.env.example`).
2. **Apple Developer**: the app id needs the *Sign in with Apple* capability.
3. **RevenueCat**: an app, an entitlement (default `pro`), products, and an offering marked *current*
   with annual and monthly packages. Put the public iOS key in `.env`. The app identifies the customer
   with the Supabase user id.
4. **Rebuild the dev client**: native modules were added (`expo-apple-authentication`, `expo-secure-store`,
   `react-native-purchases`, `expo-dev-client`) and `expo-sqlite` was removed.
5. **Worker** (`server/`): set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `REVENUECAT_SECRET_KEY` (and
   `REVENUECAT_ENTITLEMENT` if not `pro`). The AI endpoints then answer only signed-in users with an
   active entitlement (401 / 402 otherwise).

## Dev builds

With no Supabase keys there is no account, so nothing can be saved: the closet lives in memory and is
gone when the app reloads. Set the keys to develop against real data. With no RevenueCat key the
paywall is skipped; with no worker keys the AI endpoints are open.

## Known gaps

- Offline: opening the app with no connection shows a "Can't load your closet" retry screen, and a change
  made while offline is reported as not saved. There is no offline cache or queue by design.
- Two devices editing the same piece at once: the last save wins.
- The previous on-device (SQLite) closet is not migrated; it is simply no longer read.
- Nothing has been run against a real Supabase or RevenueCat project yet.
