"use client"

import { useEffect, useRef } from "react"

const Globe3DComponent = ({ ipData, ipPackets, selectedIP, onIPSelect }) => {
  const globeRef = useRef(null)
  const globeInitialized = useRef(false)

  useEffect(() => {
    // Initialize empty globe when component mounts
    if (!globeInitialized.current && globeRef.current) {
      // Load Three.js and initialize globe
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js"
      script.onload = () => {
        // Import and initialize the globe module
        import("./Globe3D.js")
          .then(() => {
            if (window.initEmptyGlobe) {
              const success = window.initEmptyGlobe()
              if (success) {
                globeInitialized.current = true
              }
            }
          })
          .catch(console.error)
      }
      document.head.appendChild(script)
    }

    return () => {
      // Cleanup on unmount
      if (window.cleanupGlobe) {
        window.cleanupGlobe()
      }
    }
  }, [])

  useEffect(() => {
    // Populate globe with data when ipData changes
    if (globeInitialized.current && ipData.length > 0 && window.populateGlobe) {
      window.populateGlobe(ipData, ipPackets)
    }
  }, [ipData, ipPackets])

  useEffect(() => {
    // Handle IP selection
    if (selectedIP && window.selectIPOnGlobe) {
      window.selectIPOnGlobe(selectedIP)
    }
  }, [selectedIP])

  useEffect(() => {
    // Set up the selection callback
    window.highlightIPInSidePanel = (ip) => {
      if (onIPSelect) {
        onIPSelect(ip)
      }
    }
  }, [onIPSelect])

  return (
    <div
      ref={globeRef}
      id="globe"
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "visible",
      }}
    >
      <div id="progressContainer" style={{ display: "none" }}>
        <div className="progress-bar">
          <div className="progress-fill" id="progressFill"></div>
        </div>
        <div id="progressText" className="loading">
          Starting...
        </div>
      </div>
      <div id="coordinateDisplay"></div>
      <div id="textureStatus" style={{ display: "none" }}></div>
    </div>
  )
}

export default Globe3DComponent
