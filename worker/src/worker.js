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

    // If no ip_address is given, look up the CALLER's own public IP (self mode).
    // CF-Connecting-IP is the real client IP as seen by Cloudflare — works for
    // both the website and the desktop app's main-process requests.
    const explicitIp = new URL(request.url).searchParams.get("ip_address")
    let ip = explicitIp
    if (!ip) ip = request.headers.get("CF-Connecting-IP")
    if (!ip) return json({ error: "Missing ip_address" }, 400, allow)

    // Only cache the explicit-IP path. Self mode (no ip_address) has an
    // identical URL for every caller but a caller-specific response, so it must
    // never be edge-cached, or users would get each other's location.
    const cacheable = !!explicitIp

    const upstream = new URL(UPSTREAM)
    upstream.searchParams.set("q", ip)
    if (env.IPAPI_KEY) upstream.searchParams.set("key", env.IPAPI_KEY)

    let raw
    try {
      const resp = await fetch(upstream.toString(), {
        cf: cacheable ? { cacheTtl: 86400, cacheEverything: true } : { cacheTtl: 0 },
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
        // Don't let the browser cache the normalized response: the edge cache
        // above already protects the upstream quota, and a short-lived bug (e.g.
        // a shape change) shouldn't get pinned in every visitor's browser for a
        // day. Edge caching stays; browser always gets a fresh normalize().
        "Cache-Control": "no-store",
        ...cors(allow),
      },
    })
  },
}

// Map ipapi.is -> AbstractAPI shape expected by pcapng-parser.js.
// Handles BOTH response shapes:
//   - free/keyless tier: flat fields (d.city, d.lat, d.asn is a string, ...)
//   - paid/keyed tier:   nested objects (d.location.latitude, d.asn.org, ...)
function normalize(d) {
  const locObj = d.location || {}
  const asnObj = typeof d.asn === "object" && d.asn ? d.asn : {}
  const companyObj = typeof d.company === "object" && d.company ? d.company : {}

  // asn may be a string like "AS20940 Akamai International B.V." (free tier)
  const asnStr = typeof d.asn === "string" ? d.asn : ""
  const asnNumberFromStr = asnStr.match(/AS(\d+)/i)
  const companyStr = typeof d.company === "string" ? d.company : ""

  return {
    location: {
      country: locObj.country ?? d.country ?? "Unknown",
      city: locObj.city ?? d.city ?? "Unknown",
      region: locObj.state ?? d.region ?? "Unknown",
      latitude: locObj.latitude ?? d.lat ?? 0,
      longitude: locObj.longitude ?? d.lon ?? 0,
    },
    company: {
      name: companyObj.name ?? asnObj.org ?? companyStr ?? asnStr ?? "Unknown",
    },
    asn: {
      name: asnObj.org ?? asnObj.descr ?? asnStr ?? "Unknown",
      asn: asnObj.asn ?? (asnNumberFromStr ? Number(asnNumberFromStr[1]) : undefined),
    },
    timezone: { name: locObj.timezone ?? d.timezone ?? "Unknown" },
    flag: { emoji: flagEmoji(locObj.country_code ?? d.country_code) },
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
  // Always allow local dev origins (any port on localhost / 127.0.0.1 / [::1]).
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    return origin
  }
  const list = allowlist.split(",").map((s) => s.trim()).filter(Boolean)
  // Echo the origin only if it's explicitly allowed; otherwise deny cleanly
  // (returning "null" makes the browser block instead of echoing a wrong host).
  return list.includes(origin) ? origin : "null"
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
