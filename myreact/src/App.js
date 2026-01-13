"use client"

import { useState, useEffect } from "react"
import Globe3DComponent from "./components/Globe3DComponent"
import SidePanelComponent from "./components/SidePanelComponent"
import "./styles/globals.css"

function App() {
  const [ipData, setIpData] = useState([])
  const [ipPackets, setIpPackets] = useState(new Map())
  const [fileInfo, setFileInfo] = useState(null)
  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIP, setSelectedIP] = useState(null)

  // Load example data on mount
  useEffect(() => {
    // Import example data if available
    import("./data/exampleData.js")
      .then((exampleModule) => {
        if (exampleModule.default && exampleModule.default.getIPDataForGlobe) {
          const exampleIpData = exampleModule.default.getIPDataForGlobe()
          const exampleIpPackets = exampleModule.default.getIPPacketsForGlobe()

          setIpData(exampleIpData)
          setIpPackets(new Map(Object.entries(exampleIpPackets)))
          setFileInfo({ name: "Example Data" })
          setSummary({
            totalPackets: Object.values(exampleIpPackets).reduce(
              (sum, p) => sum + p.incoming.length + p.outgoing.length,
              0,
            ),
            ipv4Packets: Object.values(exampleIpPackets).reduce(
              (sum, p) => sum + p.incoming.length + p.outgoing.length,
              0,
            ),
            uniqueIPs: exampleIpData.length,
          })
        }
      })
      .catch(console.error)
  }, [])

  const handleFileUpload = async (file) => {
    setIsLoading(true)
    try {
      // Import the parser dynamically
      const { default: PcapngParser } = await import("./utils/pcapng-parser.js")

      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const parser = new PcapngParser()

          parser.onProgress = (offset, total, blockCount) => {
            const percent = (offset / total) * 100
            console.log(`Parsing... ${Math.round(percent)}% (${blockCount} blocks)`)
          }

          const result = await parser.parse(e.target.result)

          // Process results
          const processedIpData = []
          const uniqueIPs = Array.from(result.ipPackets.keys())

          uniqueIPs.forEach((ip) => {
            const location = result.ipCache[ip] || { error: "Location not available" }
            if (!location.error && !location.isPrivate && !location.isMulticast && !location.isSpecial) {
              processedIpData.push({
                ip: ip,
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

          setIpData(processedIpData)
          setIpPackets(result.ipPackets)
          setFileInfo(file)
          setSummary({
            totalPackets: result.summary.totalPackets,
            ipv4Packets: result.packets.filter((p) => p.ipv4 && !p.ipv4.error).length,
            uniqueIPs: result.summary.uniqueIPs,
          })
        } catch (error) {
          console.error("Parse error:", error)
        } finally {
          setIsLoading(false)
        }
      }

      reader.readAsArrayBuffer(file)
    } catch (error) {
      console.error("Error loading parser:", error)
      setIsLoading(false)
    }
  }

  const handleIPSelection = (ip) => {
    setSelectedIP(ip)
  }

  return (
    <div className="main-container">
      <div className="globe-container">
        <Globe3DComponent
          ipData={ipData}
          ipPackets={ipPackets}
          selectedIP={selectedIP}
          onIPSelect={handleIPSelection}
        />
      </div>
      <div className="side-panel-container">
        <SidePanelComponent
          ipData={ipData}
          ipPackets={ipPackets}
          fileInfo={fileInfo}
          summary={summary}
          isLoading={isLoading}
          selectedIP={selectedIP}
          onFileUpload={handleFileUpload}
          onIPSelect={handleIPSelection}
        />
      </div>
    </div>
  )
}

export default App
