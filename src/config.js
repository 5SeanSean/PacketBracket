// Single source of truth for IP-intelligence configuration.
//
// SECURITY: everything in this file ships to the browser in web mode and is
// therefore PUBLIC. The key below is exposed to anyone who views the site or
// the repo and MUST be rotated. The real fix is to point `abstractApiEndpoint`
// at a server-side proxy (Cloudflare Worker / serverless fn / Electron main)
// that injects the key, so the browser never sees it — then `abstractApiKey`
// can be left blank here. See the security notes in the README.
//
// A runtime override (e.g. window.PB_CONFIG injected by the desktop app or a
// build step) takes precedence over the bundled defaults below.
const runtime = (typeof window !== "undefined" && window.PB_CONFIG) || {}

// Endpoint is our Cloudflare Worker proxy (backed by ipapi.is). The key is
// blank because the proxy handles auth server-side — the browser never sees it.
export const abstractApiKey = runtime.abstractApiKey ?? ""
export const abstractApiEndpoint =
  runtime.abstractApiEndpoint ??
  "https://packetbracket-geo-proxy.packetbracket.workers.dev/"

// Also expose on window so non-module (classic) scripts can read the same
// values instead of hardcoding their own copy.
if (typeof window !== "undefined") {
  window.PB_CONFIG = { ...runtime, abstractApiKey, abstractApiEndpoint }
}

// Security threat levels and colors
export const THREAT_LEVELS = {
  SAFE: { level: 0, color: "#00ff41", name: "Safe" },
  LOW: { level: 1, color: "#7fff00", name: "Low Risk" },
  MEDIUM: { level: 2, color: "#ffff00", name: "Medium Risk" },
  HIGH: { level: 3, color: "#ff8c00", name: "High Risk" },
  CRITICAL: { level: 4, color: "#ff0000", name: "Critical" },
}
