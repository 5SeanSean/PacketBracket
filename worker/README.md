# PacketBracket geo-intelligence proxy

A tiny Cloudflare Worker that fronts **ipapi.is**. It calls the upstream
server-side and normalizes the response into the AbstractAPI shape the app
already expects, so no front-end changes are needed. It also locks CORS to your
site and edge-caches identical IP lookups for a day (to protect the free quota).

**Backend:** ipapi.is — free tier is **keyless**, 1,000 lookups/day. Adding a
key raises the limit but is optional.

## Deploy (free tier: 100k Worker requests/day)

```bash
npm install -g wrangler        # already installed if you followed along
cd worker
wrangler login                 # opens browser, authorize Cloudflare

# OPTIONAL — only if you have an ipapi.is key for higher limits:
wrangler secret put IPAPI_KEY

wrangler deploy
```

Deploy prints a URL like `https://packetbracket-geo-proxy.<subdomain>.workers.dev`.

## Point the app at it

In [`../src/config.js`](../src/config.js), set the endpoint to your Worker URL
and leave the key blank (the app appends `?api_key=&ip_address=...`; the Worker
only reads `ip_address`):

```js
export const abstractApiEndpoint =
  runtime.abstractApiEndpoint ?? "https://packetbracket-geo-proxy.<subdomain>.workers.dev/"
export const abstractApiKey = runtime.abstractApiKey ?? ""
```

## Lock down who can call it (recommended)

Uncomment `ALLOWED_ORIGINS` in `wrangler.toml` with your Pages origin(s), e.g.
`https://5seansean.github.io`, then `wrangler deploy`.

## Test locally

```bash
cd worker
wrangler dev        # http://localhost:8787
curl "http://localhost:8787/?ip_address=8.8.8.8"
```

You should get normalized JSON: `{ location, company, asn, timezone, flag, security }`.
