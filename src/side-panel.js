// side-panel.js - Handles the side panel display of IP details

// Initialize the side panel
function initSidePanel() {
  const sidePanel = document.createElement("div")
  sidePanel.className = "side-panel"
  sidePanel.innerHTML = `
    <div class="upload-area-container">
        <div class="upload-area" id="uploadArea">
            <p style="font-size: 18px; margin-bottom: 20px;">Drop your PCAP-NG file here or click to select</p>
            <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
                Choose File
            </button>
        </div>
        <div id="fileSummary"></div>
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

// Add this function to highlight IP in side panel
window.highlightIPInSidePanel = (ip) => {
  const ipCards = document.querySelectorAll(".ip-card")
  ipCards.forEach((card) => {
    card.classList.remove("selected")
    const ipHeader = card.querySelector("h3")
    if (ipHeader && ipHeader.textContent.includes(ip)) {
      card.classList.add("selected")
      card.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  })
}

window.displayIPDetails = (ipData, ipPackets, file, summary) => {
  const ipDetails = document.getElementById("ipDetails")
  if (!ipDetails) return

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

    const threatLevel = ipInfo.threatLevel || { level: 0, color: "#00ff41", name: "Safe" }
    const security = ipInfo.security || {}

    // Create security flags display
    const securityFlags = []
    if (security.is_vpn) securityFlags.push("VPN")
    if (security.is_proxy) securityFlags.push("Proxy")
    if (security.is_tor) securityFlags.push("Tor")
    if (security.is_hosting) securityFlags.push("Hosting")
    if (security.is_relay) securityFlags.push("Relay")
    if (security.is_mobile) securityFlags.push("Mobile")
    if (security.is_abuse) securityFlags.push("⚠️ Abuse")

    const ipCard = document.createElement("div")
    ipCard.className = "ip-card"
    ipCard.style.borderLeftColor = threatLevel.color

    ipCard.innerHTML = `
            <h3 style="color: ${threatLevel.color}">
                ${ipInfo.flag || "🏳️"} ${ipInfo.ip}
                <span class="threat-badge" style="background: ${threatLevel.color}; color: #000; padding: 2px 8px; border-radius: 3px; font-size: 0.7em; margin-left: 10px;">
                    ${threatLevel.name}
                </span>
            </h3>
            <div class="location-info">
                <div><strong>Location:</strong> ${ipInfo.city || "Unknown"}, ${ipInfo.region || "Unknown"}, ${ipInfo.country || "Unknown"}</div>
                <div><strong>ISP:</strong> ${ipInfo.isp || "Unknown"}</div>
                <div><strong>ASN:</strong> (${ipInfo.asn || "Unknown"})</div>
                ${ipInfo.mapUrl ? `<a href="${ipInfo.mapUrl}" target="_blank" class="map-link">📍 View on Map</a>` : ""}
            </div>
            ${
              securityFlags.length > 0
                ? `
                <div class="security-flags" style="margin: 10px 0; padding: 8px; background: rgba(255, 0, 0, 0.1); border-left: 3px solid #ff5252;">
                    <strong>🚨 Security Flags:</strong> ${securityFlags.join(", ")}
                </div>
            `
                : ""
            }
            <div class="info-grid">
                <div class="info-item"><strong>Total Packets:</strong> ${total}</div>
                <div class="info-item"><strong>Incoming:</strong> ${incoming}</div>
                <div class="info-item"><strong>Outgoing:</strong> ${outgoing}</div>
                <div class="info-item"><strong>Estimated Data:</strong> ${((total * 1500) / 1024).toFixed(1)} KB</div>
            </div>
            <div class="protocols">
                <strong>Protocols:</strong> ${getProtocolsSummary(packets)}
            </div>
        `

    // Add click handler
    ipCard.addEventListener("click", () => {
      // Highlight in side panel
      document.querySelectorAll(".ip-card").forEach((c) => c.classList.remove("selected"))
      ipCard.classList.add("selected")

      // Select on globe
      if (window.selectIPOnGlobe) {
        window.selectIPOnGlobe(ipInfo.ip)
      }
    })

    ipDetails.appendChild(ipCard)
  })
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

// Initialize the side panel when DOM is loaded
document.addEventListener("DOMContentLoaded", initSidePanel)
