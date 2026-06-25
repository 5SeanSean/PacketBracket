// live-capture.js — WebSocket client for the PacketBracket capture daemon

;(function () {
  const DAEMON_URL = "ws://localhost:8765"

  let ws = null
  let status = "idle" // idle | connecting | live | no_capture | error

  // ---- Button rendering ----

  function renderBtn() {
    const el = document.getElementById("liveCaptureBtn")
    if (!el) return

    const s = {
      base: "width:100%;padding:10px 16px;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer;font-family:'Courier New',monospace;transition:background 0.2s;",
    }

    if (status === "connecting") {
      el.innerHTML = `<button disabled style="${s.base}background:#003300;color:#ffff00;border:1px solid #ffff00;cursor:wait;">Connecting to daemon...</button>`
      return
    }

    if (status === "live") {
      el.innerHTML = `<button id="liveCaptureStop" style="${s.base}background:#003300;color:#ff4444;border:1px solid #ff4444;">Stop Live Capture</button>`
      document.getElementById("liveCaptureStop").onclick = stopCapture
      return
    }

    if (status === "no_capture") {
      el.innerHTML = `
        <button id="liveCaptureStop" style="${s.base}background:#003300;color:#ff4444;border:1px solid #ff4444;">Stop Live Capture</button>
        <p style="color:#ffff00;font-size:11px;margin-top:4px;text-align:center;font-family:'Courier New',monospace;">
          Connected but no capture driver. <a href="https://npcap.com/#download" target="_blank" style="color:#ffff00;">Install Npcap</a> then restart the daemon.
        </p>`
      document.getElementById("liveCaptureStop").onclick = stopCapture
      return
    }

    if (status === "error") {
      el.innerHTML = `
        <button id="liveCaptureStart" style="${s.base}background:#1a0000;color:#ff4444;border:1px solid #ff4444;">Retry Live Capture</button>
        <p style="color:#ff4444;font-size:11px;margin-top:4px;text-align:center;font-family:'Courier New',monospace;">Daemon not found. Run: <code>python capture_daemon.py</code></p>`
      document.getElementById("liveCaptureStart").onclick = startCapture
      return
    }

    // idle
    el.innerHTML = `<button id="liveCaptureStart" style="${s.base}background:#003300;color:#00ff41;border:1px solid #00ff41;">Start Live Capture</button>`
    document.getElementById("liveCaptureStart").onclick = startCapture
  }

  // ---- WebSocket logic ----

  function startCapture() {
    status = "connecting"
    renderBtn()

    ws = new WebSocket(DAEMON_URL)

    ws.onopen = function () {
      status = "live"
      renderBtn()
    }

    ws.onclose = function (e) {
      if (e.code !== 1000) {
        status = "error"
        renderBtn()
      }
      ws = null
    }

    ws.onerror = function () {
      status = "error"
      renderBtn()
      ws = null
    }

    ws.onmessage = function (msg) {
      try {
        const event = JSON.parse(msg.data)
        if (event.type === "packet") handlePacket(event)
        else if (event.type === "no_capture") {
          status = "no_capture"
          renderBtn()
        }
      } catch (_) {}
    }
  }

  function stopCapture() {
    if (ws) ws.close(1000, "user stopped")
    ws = null
    status = "idle"
    renderBtn()
  }

  // ---- Packet handling ----
  const ipPackets = new Map()
  const enrichPending = new Set()
  let _displayTimer = null

  function scheduleDisplay() {
    if (_displayTimer) return
    _displayTimer = setTimeout(() => {
      _displayTimer = null
      const data = Array.from(getEnrichedIPData())
      if (window.viewportManager) window.viewportManager.setIPData(data, ipPackets)
      if (window.displayIPDetails) {
        window.displayIPDetails(data, ipPackets, { name: "Live Capture" }, {
          totalPackets: countTotalPackets(),
          ipv4Packets: data.length,
          uniqueIPs: data.length,
        })
      }
    }, 800)
  }

  function handlePacket(evt) {
    const { src, dst, protocol, size, timestamp, src_private, dst_private } = evt

    const publicIPs = []
    if (!src_private) publicIPs.push({ ip: src, dir: "src" })
    if (!dst_private) publicIPs.push({ ip: dst, dir: "dst" })

    publicIPs.forEach(({ ip, dir }) => {
      if (!ipPackets.has(ip)) ipPackets.set(ip, { incoming: [], outgoing: [] })
      const entry = ipPackets.get(ip)
      if (dir === "src") entry.outgoing.push({ timestamp, protocol, size, destination: dst })
      else entry.incoming.push({ timestamp, protocol, size, source: src })

      enrichAndDisplay(ip)
    })
  }

  function enrichAndDisplay(ip) {
    // If already enriched and valid, just refresh the display
    const cache = window._liveCaptureParser && window._liveCaptureParser.ipCache
    if (cache && cache[ip] && !cache[ip].error && !cache[ip].isPrivate) {
      pushToGlobe(ip, cache[ip])
      return
    }

    // Skip if already in-flight
    if (enrichPending.has(ip)) return
    enrichPending.add(ip)

    if (!window.PcapngParser) {
      console.warn("PcapngParser not ready yet, dropping packet for", ip)
      enrichPending.delete(ip)
      return
    }
    if (!window._liveCaptureParser) {
      window._liveCaptureParser = new window.PcapngParser()
    }
    const parser = window._liveCaptureParser

    parser.fetchWithAbstractAPI(ip).then(function (geo) {
      enrichPending.delete(ip)
      if (!geo || geo.error || geo.isPrivate || geo.isSpecial || geo.isMulticast) return
      parser.ipCache[ip] = geo
      parser.saveIpCache()
      pushToGlobe(ip, geo)
    }).catch(function () {
      enrichPending.delete(ip)
    })
  }

  function pushToGlobe(ip, geo) {
    const packets = ipPackets.get(ip)
    if (!packets) return

    const ipData = [{
      ip,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      latitude: geo.latitude,
      longitude: geo.longitude,
      packets,
      threatLevel: geo.threatLevel,
      security: geo.security,
      flag: geo.flag,
      isp: geo.isp,
      asn: geo.asn,
      asnNumber: geo.asnNumber,
      mapUrl: geo.mapUrl,
    }]

    scheduleDisplay()
  }

  function getEnrichedIPData() {
    const cache = window._liveCaptureParser ? window._liveCaptureParser.ipCache : {}
    const result = []
    ipPackets.forEach(function (_, ip) {
      const geo = cache[ip]
      if (!geo || geo.error || geo.isPrivate || geo.isSpecial || geo.isMulticast) return
      result.push({
        ip,
        city: geo.city,
        region: geo.region,
        country: geo.country,
        latitude: geo.latitude,
        longitude: geo.longitude,
        packets: ipPackets.get(ip),
        threatLevel: geo.threatLevel,
        security: geo.security,
        flag: geo.flag,
        isp: geo.isp,
        asn: geo.asn,
        asnNumber: geo.asnNumber,
        mapUrl: geo.mapUrl,
      })
    })
    return result
  }

  function countTotalPackets() {
    let n = 0
    ipPackets.forEach(function (p) { n += p.incoming.length + p.outgoing.length })
    return n
  }

  // ---- Init ----

  function init() {
    renderBtn()
  }

  // Wait for side panel to be in the DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    // side-panel.js may not have run yet — give it a tick
    setTimeout(init, 0)
  }
})()
