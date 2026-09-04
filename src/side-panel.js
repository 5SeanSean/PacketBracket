// side-panel.js - Handles the side panel display of IP details

let _selectedIP = null
let _packetInspectorReturnFocus = null

// Initialize the side panel
function initSidePanel() {
  const sidePanel = document.createElement("div")
  sidePanel.className = "side-panel"
  sidePanel.innerHTML = `
    <div class="upload-area-container">
        <div class="upload-area" id="uploadArea">
            <p class="upload-copy">Drop PCAP-NG or PCAP files here or click to select</p>
            <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
                Choose Files
            </button>
        </div>
        <div id="fileQueue" class="file-queue" hidden></div>
        <div id="fileSummary"></div>
        <div id="liveCaptureBtn" class="live-capture-control"></div>
    </div>
    <div class="ip-list-container">
        <h2>IP Address Details</h2>
        <div id="ipDetails"></div>
    </div>
`

  // Insert the side panel into the container
  const container = document.querySelector(".side-panel-container")
  if (container) {
    container.appendChild(sidePanel)
  }
}

// Highlight a card in the side panel (called by globe/map clicks)
window.highlightIPInSidePanel = (ip) => {
  _selectedIP = ip
  document.querySelectorAll(".ip-card").forEach((card) => {
    card.classList.remove("selected")
    const ipHeader = card.querySelector("h3")
    if (ipHeader && ipHeader.textContent.includes(ip)) {
      card.classList.add("selected")
      card.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  })
}

// Your location is a permanent list item, built like the IP cards and pinned to
// the top of the list. window.PB_USER_LOCATION = { lat, lon, estimated } is set
// by the globes whenever a user location is known.
window.renderUserLocationCard = () => {
  const ipDetails = document.getElementById("ipDetails")
  const loc = window.PB_USER_LOCATION
  if (!ipDetails || !loc) return

  let card = document.getElementById("userLocationCard")
  if (!card) {
    card = document.createElement("div")
    card.id = "userLocationCard"
    card.className = "ip-card user-location-card"
    card.addEventListener("click", () => window.selectUserLocation())
    ipDetails.prepend(card)
  } else if (card !== ipDetails.firstElementChild) {
    ipDetails.prepend(card) // keep it pinned to the top after a re-render
  }

  const title = loc.estimated ? "Your Estimated Location" : "Your Location"
  const note = loc.estimated
    ? "Approximated from your public IP address."
    : "From your device's geolocation."
  const coords = Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
    ? `<div><strong>Coordinates:</strong> ${loc.lat.toFixed(4)}°, ${loc.lon.toFixed(4)}°</div>`
    : ""
  card.innerHTML = `
    <h3><span class="ip-heading-main"><span>${title}</span></span></h3>
    <div class="location-info">
      ${coords}
      <div>${note}</div>
    </div>`
}

// Highlight the (always-present) user card — analog of highlightIPInSidePanel.
window.highlightUserLocationInSidePanel = () => {
  _selectedIP = null
  window.renderUserLocationCard()
  const card = document.getElementById("userLocationCard")
  if (!card) return
  document.querySelectorAll(".ip-card").forEach((c) => c.classList.remove("selected"))
  card.classList.add("selected")
  card.scrollIntoView({ behavior: "smooth", block: "nearest" })
}

// Select the user location across all views (card click parity with selectIP).
window.selectUserLocation = () => {
  window.highlightUserLocationInSidePanel()
  if (window.selectUserOnGlobe) window.selectUserOnGlobe()
  if (window.selectUserOn2DGlobe) window.selectUserOn2DGlobe()
}

// Central coordinator — call this from anywhere to select an IP across all views
window.selectIP = (ip) => {
  _selectedIP = ip
  window.highlightIPInSidePanel(ip)
  if (window.selectIPOnGlobe) window.selectIPOnGlobe(ip)
  if (window.selectIPOn2DGlobe) window.selectIPOn2DGlobe(ip)
}

window.displayIPDetails = (ipData, ipPackets, file, summary, allPackets = []) => {
  const ipDetails = document.getElementById("ipDetails")
  if (!ipDetails) return

  closePacketInspector()
  ipDetails.innerHTML = ""

  // Sort IPs by threat level first, then by packet count
  const sortedIPs = [...ipData].sort((a, b) => {
    // First sort by threat level (higher threat first)
    const aThreat = a.threatLevel?.level || 0
    const bThreat = b.threatLevel?.level || 0
    if (aThreat !== bThreat) {
      return bThreat - aThreat
    }

    // Then by packet count
    const aPackets = ipPackets.get(a.ip)
    const bPackets = ipPackets.get(b.ip)
    const aTotal = aPackets.incoming.length + aPackets.outgoing.length
    const bTotal = bPackets.incoming.length + bPackets.outgoing.length
    return bTotal - aTotal
  })

  sortedIPs.forEach((ipInfo) => {
    const packets = ipPackets.get(ipInfo.ip)
    const incoming = packets.incoming.length
    const outgoing = packets.outgoing.length
    const total = incoming + outgoing
    const connectionPackets = allPackets
      .map((packet, index) => ({ packet, number: index + 1 }))
      .filter(({ packet }) => packet.ipv4 &&
        (packet.ipv4.sourceIP === ipInfo.ip || packet.ipv4.destinationIP === ipInfo.ip))

    const threatLevel = ipInfo.threatLevel || { level: 0, color: "#3fb950", name: "Safe" }
    const security = ipInfo.security || {}

    // Create security flags display
    const securityFlags = []
    if (security.is_vpn) securityFlags.push("VPN")
    if (security.is_proxy) securityFlags.push("Proxy")
    if (security.is_tor) securityFlags.push("Tor")
    if (security.is_hosting) securityFlags.push("Hosting")
    if (security.is_relay) securityFlags.push("Relay")
    if (security.is_mobile) securityFlags.push("Mobile")
    if (security.is_abuse) securityFlags.push("Abuse")

    const ipCard = document.createElement("div");
    ipCard.className = "ip-card";
    ipCard.style.borderLeftColor = threatLevel.color;

    ipCard.innerHTML = `
            <h3>
                <span class="ip-heading-main">
                    <span>${ipInfo.ip}</span>
                    <span class="threat-badge" style="--badge-color: ${threatLevel.color};">${threatLevel.name}</span>
                </span>
            </h3>
            <div class="ip-card-top">
                <div class="location-info">
                    <div><strong>Coordinates:</strong> ${ipInfo.latitude.toFixed(4)}°, ${ipInfo.longitude.toFixed(4)}°</div>
                    <div><strong>Location:</strong> ${ipInfo.city || "Unknown"}, ${ipInfo.region || "Unknown"}, ${ipInfo.country || "Unknown"}</div>
                    <div><strong>ISP:</strong> ${ipInfo.isp || "Unknown"}</div>
                    <div><strong>ASN:</strong> (${ipInfo.asn || "Unknown"})</div>
                </div>
                <div class="ip-card-actions">
                    <button type="button" class="card-square-btn view-packets-btn" title="View all ${connectionPackets.length} packets">
                        <span class="csb-num">${connectionPackets.length}</span>
                        <span class="csb-label">packets</span>
                    </button>
                    ${ipInfo.mapUrl ? `<a href="${ipInfo.mapUrl}" target="_blank" class="card-square-btn map-link" title="View on map">
                        <span class="csb-num">🗺</span>
                        <span class="csb-label">map</span>
                    </a>` : ""}
                </div>
            </div>
            ${securityFlags.length > 0 ? `
                <div class="security-flags">
                    <strong>Security Flags:</strong> ${securityFlags.join(", ")}
                </div>
            ` : ""}
            <div class="info-grid">
                <div class="info-item"><strong>Total Packets:</strong> ${total}</div>
                <div class="info-item"><strong>Incoming:</strong> ${incoming}</div>
                <div class="info-item"><strong>Outgoing:</strong> ${outgoing}</div>
                <div class="info-item"><strong>Estimated Data:</strong> ${((total * 1500) / 1024).toFixed(1)} KB</div>
            </div>
            <div class="protocols">
                <strong>Protocols:</strong> ${getProtocolsSummary(packets)}
            </div>
        `;
    const viewPacketsButton = ipCard.querySelector(".view-packets-btn")

    viewPacketsButton.addEventListener("click", (event) => {
      event.stopPropagation()
      openPacketInspector(ipInfo, connectionPackets, viewPacketsButton)
    })

    // Add click handler
    ipCard.addEventListener("click", () => {
      window.selectIP(ipInfo.ip)
    })

    ipDetails.appendChild(ipCard)
  })

  // Your location is always the first item in the list.
  window.renderUserLocationCard()

  // Reapply sticky selection after re-render
  if (_selectedIP) {
    document.querySelectorAll(".ip-card").forEach((card) => {
      const h = card.querySelector("h3")
      if (h && h.textContent.includes(_selectedIP)) card.classList.add("selected")
    })
  }

  // Click outside any card to deselect
  ipDetails.addEventListener("click", (e) => {
    if (!e.target.closest(".ip-card")) {
      _selectedIP = null
      document.querySelectorAll(".ip-card").forEach((c) => c.classList.remove("selected"))
    }
  }, { capture: false })
}

function getProtocolsSummary(packets) {
  const protocolCounts = {}

  // Combine incoming and outgoing packets
  const allPackets = [...packets.incoming, ...packets.outgoing]

  allPackets.forEach((packet) => {
    protocolCounts[packet.protocol] = (protocolCounts[packet.protocol] || 0) + 1
  })

  return Object.entries(protocolCounts)
    .map(([protocol, count]) => `${protocol} (${count})`)
    .join(", ")
}

function openPacketInspector(ipInfo, indexedPackets, trigger) {
  const inspector = document.getElementById("packetInspector")
  if (!inspector) return

  _packetInspectorReturnFocus = trigger
  inspector.innerHTML = `
    <div class="packet-inspector-header">
      <button type="button" class="packet-inspector-back" aria-label="Return to globe">← Back to globe</button>
      <div class="packet-inspector-title">
        <span>Connection details</span>
        <h2>${escapePacketHTML(ipInfo.ip)}</h2>
        <p>${escapePacketHTML([ipInfo.city, ipInfo.region, ipInfo.country].filter(Boolean).join(", ") || "Unknown location")}</p>
      </div>
      <div class="packet-inspector-meta">
        <div><span>Packets</span><strong>${indexedPackets.length}</strong></div>
        <div><span>Protocol</span><strong>${escapePacketHTML(packetProtocolSummary(indexedPackets))}</strong></div>
        <div><span>ISP</span><strong>${escapePacketHTML(ipInfo.isp || "Unknown")}</strong></div>
      </div>
    </div>
    <div class="packet-inspector-controls">
      <label for="globePacketSort">Sort packets</label>
      <select id="globePacketSort" class="packet-sort">
        <option value="capture-asc">Capture order</option>
        <option value="time-asc">Oldest first</option>
        <option value="time-desc">Newest first</option>
        <option value="size-desc">Largest first</option>
        <option value="protocol-asc">Protocol A–Z</option>
      </select>
      <span>Click a packet to inspect its headers and raw bytes.</span>
    </div>
    <div class="packet-inspector-table"></div>
  `

  const sort = inspector.querySelector(".packet-sort")
  const table = inspector.querySelector(".packet-inspector-table")
  const back = inspector.querySelector(".packet-inspector-back")
  const render = () => renderConnectionPackets(table, indexedPackets, sort.value)
  sort.addEventListener("change", render)
  back.addEventListener("click", closePacketInspector)
  inspector.hidden = false
  inspector.scrollTop = 0
  render()
  back.focus()
}

function closePacketInspector() {
  const inspector = document.getElementById("packetInspector")
  if (!inspector || inspector.hidden) return
  inspector.hidden = true
  inspector.innerHTML = ""
  _packetInspectorReturnFocus?.focus()
  _packetInspectorReturnFocus = null
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePacketInspector()
})

function packetProtocolSummary(indexedPackets) {
  const protocols = new Set(indexedPackets.map(({ packet }) => packetProtocol(packet)))
  return Array.from(protocols).join(", ") || "Unknown"
}

function renderConnectionPackets(tableContainer, indexedPackets, sortMode) {
  const sorted = [...indexedPackets].sort((a, b) => {
    if (sortMode === "time-asc") {
      return packetTimestamp(a.packet) - packetTimestamp(b.packet) || a.number - b.number
    }
    if (sortMode === "time-desc") {
      return packetTimestamp(b.packet) - packetTimestamp(a.packet) || a.number - b.number
    }
    if (sortMode === "size-desc") {
      return packetLength(b.packet) - packetLength(a.packet) || a.number - b.number
    }
    if (sortMode === "protocol-asc") {
      return packetProtocol(a.packet).localeCompare(packetProtocol(b.packet)) || a.number - b.number
    }
    return a.number - b.number
  })
  const visible = sorted.slice(0, 500)

  tableContainer.innerHTML = `
    <div class="packet-table-wrap">
      <table class="packet-table">
        <thead>
          <tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Length</th><th>Info</th></tr>
        </thead>
        <tbody>
          ${visible.map(({ packet, number }) => packetRows(packet, number)).join("")}
        </tbody>
      </table>
    </div>
    ${sorted.length > 500 ? '<p class="packet-limit">Showing the first 500 packets.</p>' : ""}
  `
  bindPacketRows(tableContainer)
}

function bindPacketRows(tableContainer) {
  tableContainer.querySelectorAll(".packet-row").forEach((row) => {
    const toggle = () => {
      const details = tableContainer.querySelector(`[data-details-number="${row.dataset.packetNumber}"]`)
      if (!details) return
      const willOpen = details.hidden
      tableContainer.querySelectorAll(".packet-details-row").forEach((item) => { item.hidden = true })
      tableContainer.querySelectorAll(".packet-row").forEach((item) => item.classList.remove("expanded"))
      details.hidden = !willOpen
      row.classList.toggle("expanded", willOpen)
    }
    row.addEventListener("click", toggle)
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        toggle()
      }
    })
  })
}

function packetTimestamp(packet) {
  return packet.timestamp instanceof Date && !Number.isNaN(packet.timestamp.valueOf())
    ? packet.timestamp.valueOf()
    : 0
}

function packetLength(packet) {
  return packet.capturedLength ?? packet.originalLength ?? 0
}

function packetProtocol(packet) {
  return packet.ipv4?.protocolName || packet.ethernet?.etherTypeName || "Unknown"
}

function packetRows(packet, number) {
  const ipv4 = packet.ipv4 && !packet.ipv4.error ? packet.ipv4 : null
  const transport = ipv4?.tcp || ipv4?.udp
  const source = ipv4 ? formatEndpoint(ipv4.sourceIP, transport?.sourcePort) : "—"
  const destination = ipv4 ? formatEndpoint(ipv4.destinationIP, transport?.destinationPort) : "—"
  const protocol = ipv4?.protocolName || packet.ethernet?.etherTypeName || "Unknown"
  const flags = ipv4?.tcp?.flags?.join(", ") || ""
  const info = flags || transportInfo(ipv4) || packet.type
  const time = packet.timestamp instanceof Date && !Number.isNaN(packet.timestamp.valueOf())
    ? packet.timestamp.toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 })
    : "—"

  return `
    <tr class="packet-row" data-packet-number="${number}" tabindex="0">
      <td>${number}</td>
      <td>${escapePacketHTML(time)}</td>
      <td>${escapePacketHTML(source)}</td>
      <td>${escapePacketHTML(destination)}</td>
      <td><span class="protocol-pill protocol-${escapePacketHTML(protocol.toLowerCase())}">${escapePacketHTML(protocol)}</span></td>
      <td>${packet.capturedLength ?? packet.originalLength ?? "—"}</td>
      <td>${escapePacketHTML(info)}</td>
    </tr>
    <tr class="packet-details-row" data-details-number="${number}" hidden>
      <td colspan="7">${packetDetails(packet, number)}</td>
    </tr>
  `
}

function packetDetails(packet, number) {
  const ipv4 = packet.ipv4 && !packet.ipv4.error ? packet.ipv4 : null
  const sections = [
    detailSection("Frame", [
      ["Number", number],
      ["Capture", packet.sourceFile || "Live capture"],
      ["Block type", packet.type],
      ["Captured length", byteLabel(packet.capturedLength)],
      ["Original length", byteLabel(packet.originalLength)],
      ["Timestamp", packet.timestamp instanceof Date ? packet.timestamp.toISOString() : "Unavailable"],
    ]),
  ]

  if (packet.ethernet && !packet.ethernet.error) {
    sections.push(detailSection("Ethernet", [
      ["Source MAC", packet.ethernet.sourceMAC],
      ["Destination MAC", packet.ethernet.destinationMAC],
      ["EtherType", `${packet.ethernet.etherTypeName} (0x${packet.ethernet.etherType.toString(16).padStart(4, "0")})`],
    ]))
  }

  if (ipv4) {
    sections.push(detailSection("IPv4", [
      ["Source", ipv4.sourceIP],
      ["Destination", ipv4.destinationIP],
      ["Header length", byteLabel(ipv4.headerLength)],
      ["Total length", byteLabel(ipv4.totalLength)],
      ["TTL", ipv4.ttl],
      ["Protocol", `${ipv4.protocolName} (${ipv4.protocol})`],
      ["Identification", `0x${ipv4.identification.toString(16).padStart(4, "0")}`],
      ["Header checksum", `0x${ipv4.headerChecksum.toString(16).padStart(4, "0")}`],
    ]))
  }

  if (ipv4?.tcp && !ipv4.tcp.error) {
    sections.push(detailSection("TCP", [
      ["Source port", ipv4.tcp.sourcePort],
      ["Destination port", ipv4.tcp.destinationPort],
      ["Sequence number", ipv4.tcp.sequenceNumber],
      ["Acknowledgment number", ipv4.tcp.acknowledgmentNumber],
      ["Header length", byteLabel(ipv4.tcp.headerLength)],
      ["Flags", ipv4.tcp.flags.join(", ") || "None"],
      ["Window size", ipv4.tcp.windowSize],
      ["Checksum", `0x${ipv4.tcp.checksum.toString(16).padStart(4, "0")}`],
    ]))
  } else if (ipv4?.udp && !ipv4.udp.error) {
    sections.push(detailSection("UDP", [
      ["Source port", ipv4.udp.sourcePort],
      ["Destination port", ipv4.udp.destinationPort],
      ["Length", byteLabel(ipv4.udp.length)],
      ["Checksum", `0x${ipv4.udp.checksum.toString(16).padStart(4, "0")}`],
    ]))
  } else if (ipv4?.icmp && !ipv4.icmp.error) {
    sections.push(detailSection("ICMP", [
      ["Type", ipv4.icmp.type],
      ["Code", ipv4.icmp.code],
      ["Checksum", `0x${ipv4.icmp.checksum.toString(16).padStart(4, "0")}`],
    ]))
  }

  if (packet.rawData?.length) {
    sections.push(`<section class="packet-detail-section packet-bytes"><h3>Raw bytes</h3>${hexDump(packet.rawData)}</section>`)
  }
  return `<div class="packet-details">${sections.join("")}</div>`
}

function detailSection(title, entries) {
  const rows = entries
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value]) => `<div><span>${escapePacketHTML(label)}</span><strong>${escapePacketHTML(value)}</strong></div>`)
    .join("")
  return `<section class="packet-detail-section"><h3>${escapePacketHTML(title)}</h3>${rows}</section>`
}

function hexDump(bytes) {
  const limited = bytes.subarray(0, 256)
  const lines = []
  for (let offset = 0; offset < limited.length; offset += 16) {
    const chunk = limited.subarray(offset, offset + 16)
    const hex = Array.from(chunk, (byte) => byte.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ")
    const ascii = Array.from(chunk, (byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".").join("")
    lines.push(`${offset.toString(16).padStart(4, "0")}  ${hex}  ${ascii}`)
  }
  const suffix = bytes.length > limited.length ? `\n… ${bytes.length - limited.length} more bytes` : ""
  return `<pre>${escapePacketHTML(lines.join("\n") + suffix)}</pre>`
}

function transportInfo(ipv4) {
  if (ipv4?.udp) return `${ipv4.udp.sourcePort} → ${ipv4.udp.destinationPort}`
  if (ipv4?.icmp) return `Type ${ipv4.icmp.type}, code ${ipv4.icmp.code}`
  return ""
}

function formatEndpoint(ip, port) {
  return port === undefined ? ip : `${ip}:${port}`
}

function byteLabel(value) {
  return value === undefined ? "Unavailable" : `${value} bytes`
}

function escapePacketHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character])
}

// Initialize the side panel when DOM is loaded
document.addEventListener("DOMContentLoaded", initSidePanel)
