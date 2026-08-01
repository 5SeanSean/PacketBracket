// PacketBracket geo-intelligence proxy (Cloudflare Worker) — ipapi.is backend
//
// The app calls:  GET https://<worker>/?ip_address=1.2.3.4
// The Worker calls ipapi.is server-side and NORMALIZES the response into the
// AbstractAPI shape the app already expects, so pcapng-parser.js needs no
// changes. Benefits even though ipapi.is free tier is keyless:
//   - hides the key IF you add one (higher limits)
//   - locks CORS to your site
//   - edge-caches identical IP lookups (saves your 1,000/day quota)
//   - upgrades ipapi.is to your app's schema
//
// Vars / secrets (wrangler):
//   IPAPI_KEY        (optional) wrangler secret put IPAPI_KEY   -> higher limits
//   ALLOWED_ORIGINS  (optional) comma-separated origin allowlist

const UPSTREAM = "https://api.ipapi.is"

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const allow = allowedOrigin(origin, env.ALLOWED_ORIGINS)

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(allow) })
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, allow)
    }

    const ip = new URL(request.url).searchParams.get("ip_address")
    if (!ip) return json({ error: "Missing ip_address" }, 400, allow)

    const upstream = new URL(UPSTREAM)
    upstream.searchParams.set("q", ip)
    if (env.IPAPI_KEY) upstream.searchParams.set("key", env.IPAPI_KEY)

    let raw
    try {
      const resp = await fetch(upstream.toString(), {
        cf: { cacheTtl: 86400, cacheEverything: true },
      })
      if (!resp.ok) {
        return json({ error: `Upstream ${resp.status}` }, resp.status, allow)
      }
      raw = await resp.json()
    } catch (e) {
      return json({ error: "Upstream fetch failed" }, 502, allow)
    }

    return new Response(JSON.stringify(normalize(raw)), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        ...cors(allow),
      },
    })
  },
}

// Map ipapi.is -> AbstractAPI shape expected by pcapng-parser.js
function normalize(d) {
  const loc = d.location || {}
  const asn = d.asn || {}
  const company = d.company || {}
  return {
    location: {
      country: loc.country ?? "Unknown",
      city: loc.city ?? "Unknown",
      region: loc.state ?? "Unknown",
      latitude: loc.latitude ?? 0,
      longitude: loc.longitude ?? 0,
    },
    company: { name: company.name ?? asn.org ?? "Unknown" },
    asn: { name: asn.org ?? asn.descr ?? "Unknown", asn: asn.asn },
    timezone: { name: loc.timezone ?? "Unknown" },
    flag: { emoji: flagEmoji(loc.country_code) },
    security: {
      is_vpn: !!d.is_vpn,
      is_proxy: !!d.is_proxy,
      is_tor: !!d.is_tor,
      is_hosting: !!d.is_datacenter, // ipapi.is calls it datacenter
      is_relay: false, // ipapi.is has no relay signal
      is_mobile: !!d.is_mobile,
      is_abuse: !!d.is_abuser,
    },
  }
}

// ISO country code -> flag emoji (regional indicator letters)
function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "🏳️"
  const A = 0x1f1e6
  const up = cc.toUpperCase()
  return String.fromCodePoint(A + (up.charCodeAt(0) - 65), A + (up.charCodeAt(1) - 65))
}

function allowedOrigin(origin, allowlist) {
  if (!allowlist) return "*"
  const list = allowlist.split(",").map((s) => s.trim()).filter(Boolean)
  return list.includes(origin) ? origin : list[0] || "*"
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  }
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  })
}
