import { useState, useEffect, useRef, useCallback } from "react"
import PcapngParser from "../utils/pcapng-parser"

const DAEMON_URL = "ws://localhost:8765"

// Reuse the parser's IP enrichment logic without parsing a file
const parser = new PcapngParser()

async function enrichIP(ip) {
  if (parser.isSpecialIP(ip)) return null
  if (parser.ipCache[ip] && !parser.ipCache[ip].error) return parser.ipCache[ip]
  try {
    const data = await parser.fetchWithAbstractAPI(ip)
    parser.ipCache[ip] = data
    parser.saveIpCache()
    return data
  } catch {
    return null
  }
}

export function useLiveCapture({ onIPData }) {
  const [status, setStatus] = useState("idle") // idle | connecting | live | error | unsupported
  const wsRef = useRef(null)
  const ipPacketsRef = useRef(new Map())
  const pendingEnrichRef = useRef(new Set())

  const isStaticPage = () => {
    const host = window.location.hostname
    return host.endsWith("github.io") || host.endsWith("github.com") || (host !== "localhost" && host !== "127.0.0.1" && host !== "")
  }

  const processPacket = useCallback(async (event) => {
    const { src, dst, protocol, size, timestamp, src_private, dst_private } = event

    const publicIPs = []
    if (!src_private) publicIPs.push({ ip: src, direction: "src" })
    if (!dst_private) publicIPs.push({ ip: dst, direction: "dst" })

    for (const { ip, direction } of publicIPs) {
      // Update packet tracking
      if (!ipPacketsRef.current.has(ip)) {
        ipPacketsRef.current.set(ip, { incoming: [], outgoing: [] })
      }
      const entry = ipPacketsRef.current.get(ip)
      const pkt = { timestamp, protocol, size }
      if (direction === "src") {
        entry.outgoing.push({ ...pkt, destination: dst })
      } else {
        entry.incoming.push({ ...pkt, source: src })
      }

      // Enrich IP if not already done / in-flight
      if (!pendingEnrichRef.current.has(ip) && (!parser.ipCache[ip] || parser.ipCache[ip].error)) {
        pendingEnrichRef.current.add(ip)
        enrichIP(ip).then((geo) => {
          pendingEnrichRef.current.delete(ip)
          if (!geo || geo.error || geo.isPrivate || geo.isSpecial || geo.isMulticast) return
          const ipData = [{
            ip,
            city: geo.city,
            region: geo.region,
            country: geo.country,
            latitude: geo.latitude,
            longitude: geo.longitude,
            packets: ipPacketsRef.current.get(ip),
            threatLevel: geo.threatLevel,
            security: geo.security,
            flag: geo.flag,
            isp: geo.isp,
            asn: geo.asn,
            asnNumber: geo.asnNumber,
            mapUrl: geo.mapUrl,
          }]
          onIPData(ipData, new Map([[ip, ipPacketsRef.current.get(ip)]]))
        })
      } else if (parser.ipCache[ip] && !parser.ipCache[ip].error && !parser.ipCache[ip].isPrivate) {
        // Already enriched — just push updated packet counts
        const geo = parser.ipCache[ip]
        const ipData = [{
          ip,
          city: geo.city,
          region: geo.region,
          country: geo.country,
          latitude: geo.latitude,
          longitude: geo.longitude,
          packets: ipPacketsRef.current.get(ip),
          threatLevel: geo.threatLevel,
          security: geo.security,
          flag: geo.flag,
          isp: geo.isp,
          asn: geo.asn,
          asnNumber: geo.asnNumber,
          mapUrl: geo.mapUrl,
        }]
        onIPData(ipData, new Map([[ip, ipPacketsRef.current.get(ip)]]))
      }
    }
  }, [onIPData])

  const connect = useCallback(() => {
    if (isStaticPage()) {
      setStatus("unsupported")
      return
    }

    setStatus("connecting")
    const ws = new WebSocket(DAEMON_URL)
    wsRef.current = ws

    ws.onopen = () => setStatus("live")
    ws.onclose = (e) => {
      // 1000 = normal closure (we called disconnect()), anything else is unexpected
      if (e.code !== 1000) setStatus("error")
      wsRef.current = null
    }
    ws.onerror = () => {
      setStatus("error")
      wsRef.current = null
    }
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data)
        if (event.type === "packet") processPacket(event)
        else if (event.type === "no_capture") setStatus("no_capture")
      } catch {}
    }
  }, [processPacket])

  const disconnect = useCallback(() => {
    wsRef.current?.close(1000, "user stopped")
    wsRef.current = null
    ipPacketsRef.current = new Map()
    setStatus("idle")
  }, [])

  // Auto-detect static page on mount
  useEffect(() => {
    if (isStaticPage()) setStatus("unsupported")
  }, [])

  return { status, connect, disconnect }
}
