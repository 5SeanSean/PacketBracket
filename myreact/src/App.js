import { useState, useCallback } from "react"
import PcapngParser from "./utils/pcapng-parser"
import SidePanelComponent from "./components/SidePanelComponent"
import Globe3DComponent from "./components/Globe3DComponent"
import { useLiveCapture } from "./hooks/useLiveCapture"
import "./App.css"

export default function App() {
  const [ipData, setIpData] = useState([])
  const [ipPackets, setIpPackets] = useState(new Map())
  const [fileInfo, setFileInfo] = useState(null)
  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIP, setSelectedIP] = useState(null)

  // Merge incoming ipData entries into existing state (used by live capture)
  const mergeIPData = useCallback((newEntries, newPackets) => {
    setIpData((prev) => {
      const map = new Map(prev.map((d) => [d.ip, d]))
      newEntries.forEach((entry) => map.set(entry.ip, entry))
      return Array.from(map.values())
    })
    setIpPackets((prev) => {
      const next = new Map(prev)
      newPackets.forEach((v, k) => next.set(k, v))
      return next
    })
  }, [])

  const { status: liveStatus, connect: startCapture, disconnect: stopCapture } = useLiveCapture({
    onIPData: mergeIPData,
  })

  const handleFileUpload = async (file) => {
    setIsLoading(true)
    setFileInfo(file)
    setIpData([])
    setIpPackets(new Map())
    setSummary(null)

    try {
      const buffer = await file.arrayBuffer()
      const parser = new PcapngParser()
      const result = await parser.parse(buffer)

      const enriched = []
      Array.from(result.ipPackets.keys()).forEach((ip) => {
        const location = result.ipCache[ip]
        if (!location?.error && !location?.isPrivate && !location?.isMulticast && !location?.isSpecial) {
          enriched.push({
            ip,
            city: location.city,
            region: location.region,
            country: location.country,
            latitude: location.latitude,
            longitude: location.longitude,
            packets: result.ipPackets.get(ip),
            threatLevel: location.threatLevel,
            security: location.security,
            flag: location.flag,
            isp: location.isp,
            asn: location.asn,
            asnNumber: location.asnNumber,
            mapUrl: location.mapUrl,
          })
        }
      })

      setIpData(enriched)
      setIpPackets(result.ipPackets)
      setSummary({
        totalPackets: result.summary.totalPackets,
        ipv4Packets: result.packets.filter((p) => p.ipv4 && !p.ipv4.error).length,
        uniqueIPs: result.summary.uniqueIPs,
      })
    } catch (err) {
      console.error("Parse error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const effectiveFileInfo = liveStatus === "live"
    ? { name: "Live Capture", size: null }
    : fileInfo

  const effectiveSummary = liveStatus === "live"
    ? { totalPackets: ipPackets.size > 0 ? Array.from(ipPackets.values()).reduce((s, p) => s + p.incoming.length + p.outgoing.length, 0) : 0, ipv4Packets: ipData.length, uniqueIPs: ipData.length }
    : summary

  return (
    <div className="main-container">
      <div className="globe-container">
        <Globe3DComponent
          ipData={ipData}
          ipPackets={ipPackets}
          selectedIP={selectedIP}
          onIPSelect={setSelectedIP}
        />
      </div>
      <div className="side-panel-container">
        <SidePanelComponent
          ipData={ipData}
          ipPackets={ipPackets}
          fileInfo={effectiveFileInfo}
          summary={effectiveSummary}
          isLoading={isLoading}
          selectedIP={selectedIP}
          onFileUpload={handleFileUpload}
          onIPSelect={setSelectedIP}
          liveStatus={liveStatus}
          onStartCapture={startCapture}
          onStopCapture={stopCapture}
        />
      </div>
    </div>
  )
}
