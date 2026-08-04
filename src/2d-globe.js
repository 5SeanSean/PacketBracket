;(() => {
  let map = null
  let ipLayerGroup = null
  let userMarker = null
  let selectedMarker = null
  let mapDiv = null

  const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

  function initEmpty2DGlobe() {
    const container = document.getElementById("globe")

    mapDiv = document.createElement("div")
    mapDiv.id = "leaflet-map"
    mapDiv.style.cssText = "width:100%;height:100%;position:absolute;top:0;left:0;display:none;"
    container.appendChild(mapDiv)

    map = L.map("leaflet-map", {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
    })

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map)

    ipLayerGroup = L.layerGroup().addTo(map)

    // Override leaflet attribution box style to match theme
    const attrEl = document.querySelector(".leaflet-control-attribution")
    if (attrEl) {
      attrEl.style.cssText = "background:rgba(13,2,8,0.8);color:#555;font-size:10px;border-top:1px solid #008f11;"
    }

    window.PB_DEBUG && console.log("Leaflet 2D map initialized")
  }

  function populate2DGlobe(ipData, ipPackets) {
    if (!map) return

    window.currentIPData = ipData
    window.currentIPPackets = ipPackets

    clear2DGlobeData()

    const validIPs = ipData.filter(ip =>
      ip.latitude != null && ip.longitude != null &&
      !isNaN(ip.latitude) && !isNaN(ip.longitude) &&
      !(ip.latitude === 0 && ip.longitude === 0)
    )
    if (validIPs.length === 0) return

    validIPs.forEach(ip => {
      const packets = ipPackets.get(ip.ip)
      const count = packets ? packets.incoming.length + packets.outgoing.length : 0
      const color = ip.threatLevel?.color || "#00ff41"

      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:10px;height:10px;border-radius:50%;
          background:${color};
          border:2px solid #0d0208;
          box-shadow:0 0 6px ${color};
          cursor:pointer;
        "></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      })

      const marker = L.marker([ip.latitude, ip.longitude], { icon })

      const tooltipHtml = `
        <div style="background:#0d0208;color:#00ff41;padding:8px;border:1px solid #00ff41;font-family:'Courier New',monospace;font-size:12px;min-width:160px;">
          <div style="color:${color};font-weight:bold;margin-bottom:4px;">${ip.flag || ""} ${ip.ip}</div>
          <div>${ip.city || "Unknown"}, ${ip.country || "Unknown"}</div>
          <div style="color:#888;margin-top:4px;">Packets: ${count}</div>
          ${ip.isp ? `<div style="color:#888;">ISP: ${ip.isp}</div>` : ""}
          <div style="margin-top:4px;">
            <span style="background:${color};color:#000;padding:1px 5px;border-radius:2px;font-size:11px;">
              ${ip.threatLevel?.name || "Safe"}
            </span>
          </div>
        </div>`

      marker.bindTooltip(tooltipHtml, {
        sticky: false,
        opacity: 1,
        className: "leaflet-packetbracket-tooltip",
      })

      marker.on("click", () => {
        selectMarker(marker, ip.ip)
        if (window.selectIP) window.selectIP(ip.ip)
      })

      marker._ipData = ip
      ipLayerGroup.addLayer(marker)

      // Draw arc from user location to this IP
      if (userMarker) {
        const userLatLng = userMarker.getLatLng()
        drawArc(userLatLng, [ip.latitude, ip.longitude], color)
      }
    })

    // Re-add user marker on top
    if (userMarker) {
      userMarker.remove()
      userMarker.addTo(map)
    }
  }

  // Draw a curved arc between two points using a geodesic approximation
  function drawArc(from, to, color) {
    const lat1 = from.lat !== undefined ? from.lat : from[0]
    const lon1 = from.lng !== undefined ? from.lng : from[1]
    const lat2 = to[0], lon2 = to[1]

    const points = []
    const steps = 40
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Interpolate with a parabolic lift
      const lat = lat1 + (lat2 - lat1) * t
      const lon = lon1 + (lon2 - lon1) * t
      points.push([lat, lon])
    }

    const arc = L.polyline(points, {
      color: color,
      weight: 1,
      opacity: 0.4,
      dashArray: "4 4",
    })
    ipLayerGroup.addLayer(arc)
  }

  function selectMarker(marker, ip) {
    // Reset previous
    if (selectedMarker && selectedMarker._ipData) {
      const prev = selectedMarker._ipData
      const prevColor = prev.threatLevel?.color || "#00ff41"
      selectedMarker.setIcon(makeIcon(prevColor, false))
    }
    selectedMarker = marker
    const color = marker._ipData?.threatLevel?.color || "#00ff41"
    marker.setIcon(makeIcon(color, true))
  }

  function makeIcon(color, selected) {
    const size = selected ? 14 : 10
    return L.divIcon({
      className: "",
      html: `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};
        border:2px solid ${selected ? "#fff" : "#0d0208"};
        box-shadow:0 0 ${selected ? 12 : 6}px ${color};
        cursor:pointer;
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }

  function clear2DGlobeData() {
    if (ipLayerGroup) ipLayerGroup.clearLayers()
    selectedMarker = null
    window.currentIPData = null
    window.currentIPPackets = null
  }

  function show2DGlobe() {
    if (mapDiv) mapDiv.style.display = "block"
    if (map) map.invalidateSize()
  }

  function hide2DGlobe() {
    if (mapDiv) mapDiv.style.display = "none"
  }

  function set2DUserLocation(lat, lon) {
    if (!map) return

    if (userMarker) userMarker.remove()

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width:14px;height:14px;border-radius:50%;
        background:#64ffda;
        border:2px solid #0d0208;
        box-shadow:0 0 12px #64ffda, 0 0 4px #64ffda;
        animation:leaflet-user-pulse 1.5s ease-in-out infinite;
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    })

    userMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
      .bindTooltip('<div style="background:#0d0208;color:#64ffda;padding:6px 10px;border:1px solid #64ffda;font-family:\'Courier New\',monospace;font-size:12px;">📍 Your Location</div>', {
        permanent: false,
        opacity: 1,
        className: "leaflet-packetbracket-tooltip",
      })
      .addTo(map)

    map.setView([lat, lon], 4, { animate: true })
  }

  // Called externally (side panel or 3D globe) to select an IP on the 2D map
  function selectIPOn2DGlobe(ip) {
    if (!map || !ipLayerGroup) return

    let found = null
    ipLayerGroup.eachLayer(layer => {
      if (layer._ipData && layer._ipData.ip === ip) found = layer
    })
    if (!found) return

    // Deselect previous
    if (selectedMarker && selectedMarker !== found) {
      const prev = selectedMarker._ipData
      if (prev) selectedMarker.setIcon(makeIcon(prev.threatLevel?.color || "#00ff41", false))
    }

    selectMarker(found, ip)
    map.setView([found._ipData.latitude, found._ipData.longitude], Math.max(map.getZoom(), 4), { animate: true })
  }

  function cleanup2DGlobe() {
    if (map) {
      map.remove()
      map = null
    }
    if (mapDiv && mapDiv.parentNode) {
      mapDiv.parentNode.removeChild(mapDiv)
      mapDiv = null
    }
    ipLayerGroup = null
    userMarker = null
    selectedMarker = null
  }

  window.initEmpty2DGlobe = initEmpty2DGlobe
  window.populate2DGlobe = populate2DGlobe
  window.clear2DGlobeData = clear2DGlobeData
  window.show2DGlobe = show2DGlobe
  window.hide2DGlobe = hide2DGlobe
  window.cleanup2DGlobe = cleanup2DGlobe
  window.set2DUserLocation = set2DUserLocation
  window.selectIPOn2DGlobe = selectIPOn2DGlobe
})()
