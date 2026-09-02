// live-capture.js — Electron IPC live capture (desktop app only).
// In the browser (web mode) this app is a viewer; live capture requires the
// desktop app, so the button becomes a download CTA.

;(function () {
  const DOWNLOAD_URL = "https://github.com/5SeanSean/PacketBracket/releases/latest/download/PacketBracket-Setup.exe"

  const IS_ELECTRON = typeof window.electronAPI !== "undefined"

  let status = "idle" // idle | connecting | live | no_driver | error
  let canInstallNpcap = false // set from capture-error payload
  let warningMsg = "" // non-fatal note shown during live capture (e.g. admin)
  let errorMsg = "" // last error message, shown in the error state

  // ---- Button rendering ----

  const FONT = "'SF Mono','JetBrains Mono',Menlo,Consolas,monospace"
  const BTN_BASE =
    "width:100%;padding:10px 16px;border-radius:4px;font-size:13px;font-weight:600;letter-spacing:0.3px;cursor:pointer;font-family:" + FONT + ";transition:background 0.15s,border-color 0.15s,color 0.15s;"

  function renderBtn() {
    const el = document.getElementById("liveCaptureBtn")
    if (!el) return

    // Web mode: this is a viewer. Live capture needs the desktop app.
    if (!IS_ELECTRON) {
      el.innerHTML = `
        <a href="${DOWNLOAD_URL}" style="${BTN_BASE}display:block;box-sizing:border-box;text-align:center;background:#141815;color:#3fb950;border:1px solid #2ea043;text-decoration:none;" title="Download the desktop app for built-in live capture">Get Desktop App for Live Capture</a>`
      return
    }

    if (status === "connecting") {
      el.innerHTML = `<button disabled style="${BTN_BASE}background:#141815;color:#d29922;border:1px solid #4a3d18;cursor:wait;">Connecting...</button>`
      return
    }

    if (status === "live") {
      const warn = warningMsg
        ? `<p style="color:#d29922;font-size:11px;margin-top:8px;text-align:center;font-family:${FONT};">${warningMsg}</p>`
        : ""
      el.innerHTML = `<button id="liveCaptureStop" style="${BTN_BASE}background:#141815;color:#f85149;border:1px solid #5a2a28;">Stop Live Capture</button>${warn}`
      document.getElementById("liveCaptureStop").onclick = stopCapture
      return
    }

    if (status === "no_driver") {
      const installBtn = canInstallNpcap
        ? `<button id="npcapInstall" style="${BTN_BASE}margin-top:8px;background:#141815;color:#d29922;border:1px solid #4a3d18;">Install Npcap</button>`
        : `<a href="https://npcap.com/#download" target="_blank" style="display:block;margin-top:8px;text-align:center;color:#d29922;font-size:11px;font-family:${FONT};">Install Npcap from npcap.com</a>`
      el.innerHTML = `
        <button id="liveCaptureStart" style="${BTN_BASE}background:#141815;color:#d29922;border:1px solid #4a3d18;">Retry Live Capture</button>
        <p style="color:#8b948d;font-size:11px;margin-top:8px;text-align:center;font-family:${FONT};">Npcap driver required for live capture.</p>
        ${installBtn}`
      document.getElementById("liveCaptureStart").onclick = startCapture
      const ib = document.getElementById("npcapInstall")
      if (ib) ib.onclick = installNpcap
      return
    }

    if (status === "error") {
      const msg = errorMsg
        ? `<p style="color:#f85149;font-size:11px;margin-top:8px;text-align:center;font-family:${FONT};">${errorMsg}</p>`
        : ""
      el.innerHTML = `<button id="liveCaptureStart" style="${BTN_BASE}background:#141815;color:#f85149;border:1px solid #5a2a28;">Retry Live Capture</button>${msg}`
      document.getElementById("liveCaptureStart").onclick = startCapture
      return
    }

    // idle
    el.innerHTML = `<button id="liveCaptureStart" style="${BTN_BASE}background:#141815;color:#3fb950;border:1px solid #2ea043;">Start Live Capture</button>`
    document.getElementById("liveCaptureStart").onclick = startCapture
  }

  function installNpcap() {
    if (!IS_ELECTRON) return
    window.electronAPI.installNpcap()
  }

  // ---- Electron IPC capture ----

  function startCapture() {
    if (!IS_ELECTRON) return // web mode is download-only

    status = "connecting"
    warningMsg = ""
    errorMsg = ""
    renderBtn()

    window.electronAPI.removeAllListeners()

    window.electronAPI.onCaptureStatus(function (s) {
      status = s
      renderBtn()
    })

    window.electronAPI.onCaptureError(function (err) {
      // err is { message, driverMissing?, canInstall? }
      const info = typeof err === "string" ? { message: err } : (err || {})
      canInstallNpcap = !!info.canInstall
      errorMsg = info.message || ""
      status = info.driverMissing ? "no_driver" : "error"
      renderBtn()
      console.error("[capture]", info.message)
    })

    window.electronAPI.onCaptureWarning(function (msg) {
      warningMsg = msg || ""
      renderBtn()
    })

    window.electronAPI.onPacket(function (evt) {
      handlePacket(evt)
    })

    window.electronAPI.startCapture()
  }

  function stopCapture() {
    if (!IS_ELECTRON) return
    window.electronAPI.stopCapture()
    window.electronAPI.removeAllListeners()
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

    parser.fetchGeoIntelligence(ip).then(function (geo) {
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
