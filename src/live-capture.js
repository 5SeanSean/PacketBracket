// live-capture.js — Electron IPC live capture (desktop app only).
// In the browser (web mode) this app is a viewer; live capture requires the
// desktop app, so the button becomes a download CTA.

;(function () {
  const DOWNLOAD_URL = "https://github.com/5SeanSean/PacketBracket/releases/latest/download/PacketBracket-Setup.exe"

  const IS_ELECTRON = typeof window.electronAPI !== "undefined"

  // A geo result only maps to a real pin if it has finite, in-range coords that
  // aren't the 0,0 null-island (African coast). Null/undefined/NaN or 0,0 means
  // the lookup had no real location — never pin or pan to it.
  function hasRealCoords(geo) {
    if (!geo) return false
    const lat = Number(geo.latitude)
    const lon = Number(geo.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false
    if (lat === 0 && lon === 0) return false
    return true
  }

  let status = "idle" // idle | connecting | live | no_driver | error
  let canInstallNpcap = false // set from capture-error payload
  let warningMsg = "" // non-fatal note shown during live capture (e.g. admin)
  let errorMsg = "" // last error message, shown in the error state

  // ---- Button rendering ----

  function renderBtn() {
    const el = document.getElementById("liveCaptureBtn")
    if (!el) return

    // Web mode: this is a viewer. Live capture needs the desktop app.
    if (!IS_ELECTRON) {
      el.innerHTML = `
        <a href="${DOWNLOAD_URL}" class="live-control live-control-primary" title="Download the desktop app for built-in live capture">Get Desktop App for Live Capture</a>`
      return
    }

    if (status === "connecting") {
      el.innerHTML = '<button disabled class="live-control live-control-warning is-busy">Connecting...</button>'
      return
    }

    if (status === "live") {
      const warn = warningMsg
        ? `<p class="control-message control-message-warning">${warningMsg}</p>`
        : ""
      el.innerHTML = `<button id="liveCaptureStop" class="live-control live-control-danger">Stop Live Capture</button>${warn}`
      document.getElementById("liveCaptureStop").onclick = stopCapture
      return
    }

    if (status === "no_driver") {
      const installBtn = canInstallNpcap
        ? '<button id="npcapInstall" class="live-control live-control-warning control-spaced">Install Npcap</button>'
        : '<a href="https://npcap.com/#download" target="_blank" class="control-link control-spaced">Install Npcap from npcap.com</a>'
      el.innerHTML = `
        <button id="liveCaptureStart" class="live-control live-control-warning">Retry Live Capture</button>
        <p class="control-message">Npcap driver required for live capture.</p>
        ${installBtn}`
      document.getElementById("liveCaptureStart").onclick = startCapture
      const ib = document.getElementById("npcapInstall")
      if (ib) ib.onclick = installNpcap
      return
    }

    if (status === "error") {
      const msg = errorMsg
        ? `<p class="control-message control-message-danger">${errorMsg}</p>`
        : ""
      el.innerHTML = `<button id="liveCaptureStart" class="live-control live-control-danger">Retry Live Capture</button>${msg}`
      document.getElementById("liveCaptureStart").onclick = startCapture
      return
    }

    // idle
    el.innerHTML = '<button id="liveCaptureStart" class="live-control live-control-primary">Start Live Capture</button>'
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
  // Every live packet in the same shape the pcap parser emits, so the side panel
  // and packet inspector (which filter this list by IP) work identically to a
  // loaded capture instead of getting an empty array.
  const livePackets = []
  // Per-public-IP metadata gathered from the capture: TLS SNI, reverse DNS, and
  // the local process talking to it. Keyed by the public peer IP.
  const ipMeta = new Map()
  const rdnsPending = new Set()
  const enrichPending = new Set()

  function recordMeta(evt) {
    const publicIP = evt.src_private ? evt.dst : evt.src
    if (!publicIP) return
    let meta = ipMeta.get(publicIP)
    if (!meta) { meta = { sni: null, rdns: null, process: null, pid: null, ports: new Set() }; ipMeta.set(publicIP, meta) }
    if (evt.sni) meta.sni = evt.sni // first/last seen SNI names the service
    if (evt.rdns) meta.rdns = evt.rdns
    if (evt.process) { meta.process = evt.process; meta.pid = evt.pid }
    const port = evt.src_private ? evt.dstPort : evt.srcPort
    if (port) meta.ports.add(port)

    // rDNS resolves async in main; if we don't have it yet, ask once.
    if (!meta.rdns && !rdnsPending.has(publicIP) && window.electronAPI.reverseDns) {
      rdnsPending.add(publicIP)
      window.electronAPI.reverseDns(publicIP).then((host) => {
        if (host) meta.rdns = host
      }).catch(() => {}).finally(() => rdnsPending.delete(publicIP))
    }
  }

  function metaFields(ip) {
    const m = ipMeta.get(ip)
    if (!m) return {}
    return { sni: m.sni, rdns: m.rdns, process: m.process, pid: m.pid }
  }
  let _displayTimer = null

  const PROTO_NUM = { ICMP: 1, TCP: 6, UDP: 17 }

  // Build a minimal parser-compatible packet from a live capture event. The
  // inspector's IPv4 detail section reads numeric fields eagerly (.toString), so
  // unknown ones default to 0 rather than being left undefined.
  function toParserPacket(evt) {
    const { src, dst, protocol, size, timestamp, srcPort, dstPort, sni, process: proc, pid } = evt
    const transport = { sourcePort: srcPort, destinationPort: dstPort }
    const ipv4 = {
      sourceIP: src,
      destinationIP: dst,
      protocolName: protocol,
      protocol: PROTO_NUM[protocol] ?? 0,
      headerLength: 0,
      totalLength: size,
      ttl: 0,
      identification: 0,
      headerChecksum: 0,
    }
    // Attach ports under the matching transport key so the inspector renders
    // endpoints as ip:port and its TCP/UDP detail section populates.
    if (protocol === "TCP") {
      ipv4.tcp = { ...transport, error: false, flags: [], sequenceNumber: 0, acknowledgmentNumber: 0, headerLength: 0, windowSize: 0, checksum: 0 }
    } else if (protocol === "UDP") {
      ipv4.udp = { ...transport, error: false, length: size, checksum: 0 }
    }
    return {
      type: "Live packet",
      sourceFile: "Live capture",
      timestamp: new Date(timestamp),
      capturedLength: size,
      originalLength: size,
      sni: sni || null,
      process: proc || null,
      pid: pid || null,
      ipv4,
    }
  }

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
        }, livePackets)
      }
    }, 800)
  }

  function handlePacket(evt) {
    const { src, dst, protocol, size, timestamp, src_private, dst_private } = evt

    // Record the packet for the inspector list (bounded so a long capture can't
    // grow memory without limit).
    livePackets.push(toParserPacket(evt))
    if (livePackets.length > 50000) livePackets.shift()

    // Capture SNI / rDNS / process metadata for the public peer.
    recordMeta(evt)

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
      if (hasRealCoords(cache[ip])) pushToGlobe(ip, cache[ip])
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
      if (!hasRealCoords(geo)) return
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
      ...metaFields(ip),
    }]

    scheduleDisplay()

    // Follow-cam: this IP belongs to the packet that just arrived.
    if (window.viewportManager) window.viewportManager.panToLatest(geo.latitude, geo.longitude)
  }

  function getEnrichedIPData() {
    const cache = window._liveCaptureParser ? window._liveCaptureParser.ipCache : {}
    const result = []
    ipPackets.forEach(function (_, ip) {
      const geo = cache[ip]
      if (!geo || geo.error || geo.isPrivate || geo.isSpecial || geo.isMulticast) return
      if (!hasRealCoords(geo)) return
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
        ...metaFields(ip),
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
