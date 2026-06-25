"use client"

import { useRef } from "react"

const LIVE_BUTTON_STYLES = {
  base: {
    width: "100%",
    marginTop: "10px",
    padding: "10px 16px",
    borderRadius: "4px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
    border: "none",
    transition: "background 0.2s",
  },
  unsupported: {
    background: "#1a1a1a",
    color: "#555",
    cursor: "not-allowed",
    border: "1px solid #333",
  },
  idle: {
    background: "#003300",
    color: "#00ff41",
    border: "1px solid #00ff41",
  },
  connecting: {
    background: "#003300",
    color: "#ffff00",
    border: "1px solid #ffff00",
    cursor: "wait",
  },
  live: {
    background: "#003300",
    color: "#ff4444",
    border: "1px solid #ff4444",
  },
  error: {
    background: "#1a0000",
    color: "#ff4444",
    border: "1px solid #ff4444",
  },
}

function LiveCaptureButton({ status, onStart, onStop }) {
  if (status === "unsupported") {
    return (
      <button
        style={{ ...LIVE_BUTTON_STYLES.base, ...LIVE_BUTTON_STYLES.unsupported }}
        disabled
        title="Run the app locally to use live capture"
      >
        Download App to Use Live Capture
      </button>
    )
  }

  if (status === "live") {
    return (
      <button
        style={{ ...LIVE_BUTTON_STYLES.base, ...LIVE_BUTTON_STYLES.live }}
        onClick={onStop}
      >
        Stop Live Capture
      </button>
    )
  }

  if (status === "connecting") {
    return (
      <button style={{ ...LIVE_BUTTON_STYLES.base, ...LIVE_BUTTON_STYLES.connecting }} disabled>
        Connecting to daemon...
      </button>
    )
  }

  if (status === "no_capture") {
    return (
      <div>
        <button style={{ ...LIVE_BUTTON_STYLES.base, ...LIVE_BUTTON_STYLES.live }} onClick={onStop}>
          Stop Live Capture
        </button>
        <p style={{ color: "#ffff00", fontSize: "11px", marginTop: "4px", textAlign: "center" }}>
          Connected but no capture driver.{" "}
          <a href="https://npcap.com/#download" target="_blank" rel="noopener noreferrer" style={{ color: "#ffff00" }}>
            Install Npcap
          </a>{" "}
          then restart the daemon.
        </p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div>
        <button
          style={{ ...LIVE_BUTTON_STYLES.base, ...LIVE_BUTTON_STYLES.error }}
          onClick={onStart}
          title="Make sure capture_daemon.py is running: python capture_daemon.py"
        >
          Retry Live Capture
        </button>
        <p style={{ color: "#ff4444", fontSize: "11px", marginTop: "4px", textAlign: "center" }}>
          Daemon not found. Run: <code>python capture_daemon.py</code>
        </p>
      </div>
    )
  }

  // idle
  return (
    <button
      style={{ ...LIVE_BUTTON_STYLES.base, ...LIVE_BUTTON_STYLES.idle }}
      onClick={onStart}
    >
      Start Live Capture
    </button>
  )
}

const SidePanelComponent = ({
  ipData,
  ipPackets,
  fileInfo,
  summary,
  isLoading,
  selectedIP,
  onFileUpload,
  onIPSelect,
  liveStatus,
  onStartCapture,
  onStopCapture,
}) => {
  const fileInputRef = useRef(null)

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (file && onFileUpload) {
      onFileUpload(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add("dragover")
  }

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove("dragover")
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove("dragover")
    const files = e.dataTransfer.files
    if (files.length > 0 && onFileUpload) {
      onFileUpload(files[0])
    }
  }

  const getProtocolsSummary = (packets) => {
    const protocolCounts = {}
    const allPackets = [...packets.incoming, ...packets.outgoing]

    allPackets.forEach((packet) => {
      protocolCounts[packet.protocol] = (protocolCounts[packet.protocol] || 0) + 1
    })

    return Object.entries(protocolCounts)
      .map(([protocol, count]) => `${protocol} (${count})`)
      .join(", ")
  }

  // Sort IPs by threat level first, then by packet count
  const sortedIPs = [...ipData].sort((a, b) => {
    const aThreat = a.threatLevel?.level || 0
    const bThreat = b.threatLevel?.level || 0
    if (aThreat !== bThreat) {
      return bThreat - aThreat
    }

    const aPackets = ipPackets.get(a.ip)
    const bPackets = ipPackets.get(b.ip)
    const aTotal = aPackets.incoming.length + aPackets.outgoing.length
    const bTotal = bPackets.incoming.length + bPackets.outgoing.length
    return bTotal - aTotal
  })

  return (
    <div className="side-panel">
      <input
        type="file"
        ref={fileInputRef}
        accept=".pcapng,.pcap"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <div className="upload-area-container">
        <div
          className="upload-area"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleFileSelect}
        >
          <p style={{ fontSize: "18px", marginBottom: "20px" }}>Drop your PCAP-NG file here or click to select</p>
          <button className="upload-btn">Choose File</button>
        </div>

        <LiveCaptureButton
          status={liveStatus}
          onStart={onStartCapture}
          onStop={onStopCapture}
        />

        {summary && (
          <div className="summary">
            <h2>File Summary</h2>
            <div className="info-grid">
              <div>
                <strong>File:</strong> {fileInfo?.name || "Unknown"}
              </div>
              <div>
                <strong>Size:</strong> {fileInfo?.size ? (fileInfo.size / 1024).toFixed(1) + " KB" : "Unknown"}
              </div>
              <div>
                <strong>Total Packets:</strong> {summary.totalPackets}
              </div>
              <div>
                <strong>IPv4 Packets:</strong> {summary.ipv4Packets}
              </div>
              <div>
                <strong>Unique IPs Found:</strong> {summary.uniqueIPs}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ip-list-container">
        <h2>IP Address Details</h2>
        <div id="ipDetails">
          {isLoading && <div className="loading">Loading and parsing file...</div>}

          {sortedIPs.map((ipInfo) => {
            const packets = ipPackets.get(ipInfo.ip)
            if (!packets) return null

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

            return (
              <div
                key={ipInfo.ip}
                className={`ip-card ${selectedIP === ipInfo.ip ? "selected" : ""}`}
                style={{ borderLeftColor: threatLevel.color }}
                onClick={() => onIPSelect(ipInfo.ip)}
              >
                <h3 style={{ color: threatLevel.color }}>
                  {ipInfo.flag || "🏳️"} {ipInfo.ip}
                  <span
                    className="threat-badge"
                    style={{
                      background: threatLevel.color,
                      color: "#000",
                      padding: "2px 8px",
                      borderRadius: "3px",
                      fontSize: "0.7em",
                      marginLeft: "10px",
                    }}
                  >
                    {threatLevel.name}
                  </span>
                </h3>

                <div className="location-info">
                  <div>
                    <strong>Coordinates:</strong> {ipInfo.latitude.toFixed(4)}°, {ipInfo.longitude.toFixed(4)}°
                  </div>
                  <div>
                    <strong>Location:</strong> {ipInfo.city || "Unknown"}, {ipInfo.region || "Unknown"},{" "}
                    {ipInfo.country || "Unknown"}
                  </div>
                  <div>
                    <strong>ISP:</strong> {ipInfo.isp || "Unknown"}
                  </div>
                  <div>
                    <strong>ASN:</strong> ({ipInfo.asn || "Unknown"})
                  </div>
                  {ipInfo.mapUrl && (
                    <a href={ipInfo.mapUrl} target="_blank" rel="noopener noreferrer" className="map-link">
                      📍 View on Map
                    </a>
                  )}
                </div>

                {securityFlags.length > 0 && (
                  <div
                    className="security-flags"
                    style={{
                      margin: "10px 0",
                      padding: "8px",
                      background: "rgba(255, 0, 0, 0.1)",
                      borderLeft: "3px solid #ff5252",
                    }}
                  >
                    <strong>🚨 Security Flags:</strong> {securityFlags.join(", ")}
                  </div>
                )}

                <div className="info-grid">
                  <div className="info-item">
                    <strong>Total Packets:</strong> {total}
                  </div>
                  <div className="info-item">
                    <strong>Incoming:</strong> {incoming}
                  </div>
                  <div className="info-item">
                    <strong>Outgoing:</strong> {outgoing}
                  </div>
                  <div className="info-item">
                    <strong>Estimated Data:</strong> {((total * 1500) / 1024).toFixed(1)} KB
                  </div>
                </div>

                <div className="protocols">
                  <strong>Protocols:</strong> {getProtocolsSummary(packets)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default SidePanelComponent
