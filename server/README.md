# Wardrobe API (local Cloudflare Worker)

Server-side proxy for wardrobe AI, run **locally** with `wrangler dev`. It calls
the Cloudflare AI REST API using the same account id + token the client used to
hold, so the token stays out of the app bundle without needing a deploy or a
Workers AI binding.

## Endpoints

| Method | Path        | Body                          | Returns           |
| ------ | ----------- | ----------------------------- | ----------------- |
| GET    | `/health`   | –                             | `{ ok, credentials }` |
| POST   | `/v1/detect`| multipart `image`, `prompt?`  | `{ text }`        |
| POST   | `/v1/stage` | multipart `image`, `prompt?`  | `{ image }` (b64) |

## Run locally

```bash
cd server
npm install
npm run dev        # http://localhost:8787
```

Credentials are read from `server/.dev.vars` (gitignored):

```
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
```

These already match the app's old `EXPO_PUBLIC_CLOUDFLARE_*` values. Reuse the
same token while developing locally.

## Point the app at it

The repo-root `.env` sets:

```
EXPO_PUBLIC_WARDROBE_API_URL=http://localhost:8787
```

Notes:
- iOS simulator + web reach `localhost` directly.
- Android emulator: use `http://10.0.2.2:8787`.
- Physical device: use your machine's LAN IP, e.g. `http://192.168.1.20:8787`.

## Later

When you're ready to leave local dev, deploy this Worker and rotate the token
(see `docs/impl-spec.md`, PR3). Auth/rate-limiting and D1/R2 bindings come then.
