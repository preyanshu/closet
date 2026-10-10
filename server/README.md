# Wardrobe API (Cloudflare Worker)

Server-side proxy for wardrobe AI. Holds the Cloudflare account/token so the
mobile app never bundles provider credentials.

## Endpoints

| Method | Path        | Body                          | Returns            |
| ------ | ----------- | ----------------------------- | ------------------ |
| GET    | `/health`   | –                             | `{ ok: true }`     |
| POST   | `/v1/detect`| multipart `image`, `prompt?`  | `{ text }`         |
| POST   | `/v1/stage` | multipart `image`, `prompt?`  | `{ image }` (b64)  |

Both AI endpoints run models through the Workers AI binding (`env.AI`) — no
account id or API token is read from the request.

## Setup

```bash
cd server
npm install
npm run dev        # local dev server at http://localhost:8787
npm run deploy     # deploy to https://wardrobe-api.<subdomain>.workers.dev
```

Then point the app at the deployed Worker by adding to the repo-root `.env`:

```
EXPO_PUBLIC_WARDROBE_API_URL=https://wardrobe-api.<subdomain>.workers.dev
```

## Security

The previous client used `EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID` /
`EXPO_PUBLIC_CLOUDFLARE_API_TOKEN`, which Expo inlines into the JS bundle. Those
values must be treated as compromised: **rotate the Cloudflare API token** and
remove both variables from the app's `.env` once this Worker is deployed.

## Notes

- `input_image_0` for FLUX.2 Klein is passed as a byte array via the AI binding.
  If Cloudflare changes the binding input shape, `npm run dev` will surface it.
- Auth/rate-limiting and D1/R2 bindings land in a later PR.
