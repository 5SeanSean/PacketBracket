;(() => {
  let map = null
  let ipLayerGroup = null
  let userMarker = null
  let selectedMarker = null
  let mapDiv = null

  // Esri Dark Gray Canvas — free, no API key, no watermark, dark theme
  const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
  const TILE_ATTR = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'

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
      maxZoom: 16,
      zoomControl: true,
      attributionControl: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
    })

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 16,
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

    // Traffic range across all IPs, so ray length is proportional the same way
    // the 3D globe scales its vertical bars.
    let minCount = Number.POSITIVE_INFINITY
    let maxCount = 0
    validIPs.forEach(ip => {
      const p = ipPackets.get(ip.ip)
      const c = p ? p.incoming.length + p.outgoing.length : 0
      if (c < minCount) minCount = c
      if (c > maxCount) maxCount = c
    })
    if (!isFinite(minCount)) minCount = 0

    // Rays extend away from the user's location. Without one, fall back to the
    // centroid of the plotted IPs so rays radiate outward from the data's own
    // center of mass instead of an arbitrary fixed point.
    let origin
    if (userMarker) {
      origin = [userMarker.getLatLng().lat, userMarker.getLatLng().lng]
    } else {
      const sum = validIPs.reduce(
        (acc, ip) => [acc[0] + ip.latitude, acc[1] + ip.longitude],
        [0, 0]
      )
      origin = [sum[0] / validIPs.length, sum[1] / validIPs.length]
    }

    validIPs.forEach(ip => {
      const packets = ipPackets.get(ip.ip)
      const count = packets ? packets.incoming.length + packets.outgoing.length : 0
      const color = ip.threatLevel?.color || "#3fb950"

      // Traffic "ray" extending outward along the origin->IP direction, length
      // proportional to total packets — the 2D analog of the 3D height bars.
      drawTrafficRay(origin, ip.latitude, ip.longitude, count, minCount, maxCount, color)

      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:10px;height:10px;border-radius:50%;
          background:${color};
          border:1.5px solid #0a0c0b;
          cursor:pointer;
        "></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      })

      const marker = L.marker([ip.latitude, ip.longitude], { icon })

      const tooltipHtml = `
        <div style="background:#141815;color:#d6dad7;padding:9px 11px;border:1px solid #333c36;border-radius:4px;font-family:'SF Mono','JetBrains Mono',Menlo,Consolas,monospace;font-size:12px;min-width:170px;">
          <div style="color:#d6dad7;font-weight:600;margin-bottom:5px;">${ip.ip}</div>
          <div style="color:#8b948d;">${ip.city || "Unknown"}, ${ip.country || "Unknown"}</div>
          <div style="color:#8b948d;margin-top:3px;">Packets: ${count}</div>
          ${ip.isp ? `<div style="color:#8b948d;">ISP: ${ip.isp}</div>` : ""}
          <div style="margin-top:6px;">
            <span style="background:${color};color:#000;padding:1px 6px;border-radius:2px;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">
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

  // Draw a traffic "ray" from an IP location, pointing away from `origin`
  // (the user's location). Length scales with total packet count between the
  // global min/max, mirroring the proportional height of the 3D globe's bars.
  function drawTrafficRay(origin, lat, lon, count, minCount, maxCount, color) {
    const MIN_LEN = 3   // degrees at lowest traffic
    const MAX_LEN = 22  // degrees at highest traffic

    const range = maxCount - minCount
    const normalized = range > 0 ? (count - minCount) / range : 0
    const len = MIN_LEN + (MAX_LEN - MIN_LEN) * normalized

    // Unit direction origin -> IP (fall back to pointing north if coincident).
    let dLat = lat - origin[0]
    let dLon = lon - origin[1]
    const mag = Math.hypot(dLat, dLon)
    if (mag < 1e-6) {
      dLat = 1
      dLon = 0
    } else {
      dLat /= mag
      dLon /= mag
    }

    let endLat = lat + dLat * len
    let endLon = lon + dLon * len
    // Clamp latitude to the map's bounds; keep longitude sane.
    endLat = Math.max(-84, Math.min(84, endLat))
    endLon = Math.max(-179, Math.min(179, endLon))

    const core = L.polyline([[lat, lon], [endLat, endLon]], {
      color: color,
      weight: 2,
      opacity: 0.8,
      lineCap: "round",
      interactive: false,
    })
    ipLayerGroup.addLayer(core)
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
      const prevColor = prev.threatLevel?.color || "#3fb950"
      selectedMarker.setIcon(makeIcon(prevColor, false))
    }
    selectedMarker = marker
    const color = marker._ipData?.threatLevel?.color || "#3fb950"
    marker.setIcon(makeIcon(color, true))
  }

  function makeIcon(color, selected) {
    const size = selected ? 14 : 10
    return L.divIcon({
      className: "",
      html: `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};
        border:${selected ? "2px solid #fff" : "1.5px solid #0a0c0b"};
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
        width:13px;height:13px;border-radius:50%;
        background:#58a6ff;
        border:2px solid #0a0c0b;
      "></div>`,
      iconSize: [13, 13],
      iconAnchor: [6.5, 6.5],
    })

    userMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
      .bindTooltip('<div style="background:#141815;color:#d6dad7;padding:7px 11px;border:1px solid #333c36;border-radius:4px;font-family:\'SF Mono\',\'JetBrains Mono\',Menlo,Consolas,monospace;font-size:12px;">Your Location</div>', {
        permanent: false,
        opacity: 1,
        className: "leaflet-packetbracket-tooltip",
      })
      .addTo(map)

    map.setView([lat, lon], 4, { animate: true })

    // If IPs are already plotted, re-render so rays/arcs re-aim from the new
    // user location instead of the centroid fallback used before it arrived.
    const data = window.currentIPData
    const packets = window.currentIPPackets
    if (data && packets) {
      populate2DGlobe(data, packets)
    }
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
      if (prev) selectedMarker.setIcon(makeIcon(prev.threatLevel?.color || "#3fb950", false))
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
