;(() => {
  let map = null
  let ipLayerGroup = null
  let userMarker = null
  let selectedMarker = null
  let mapDiv = null
  let userLocationEstimated = false
  let userLatLng = null

  // Ray length metric, shared with the 3D view via window.PB_HEIGHT_METRIC.
  function pbMetricCount(packets) {
    if (!packets) return 0
    const m = window.PB_HEIGHT_METRIC || "total"
    const inc = packets.incoming.length
    const out = packets.outgoing.length
    return m === "incoming" ? inc : m === "outgoing" ? out : inc + out
  }

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
      zoomControl: false,
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
      const c = pbMetricCount(ipPackets.get(ip.ip))
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
      const count = pbMetricCount(packets)
      const color = ip.threatLevel?.color || "#3fb950"

      // One projected line: dashed from the origin to the IP, then solid from
      // that exact point onward. Sharing the projected direction keeps both
      // portions perfectly collinear on the Mercator map.
      drawTrafficLine(origin, ip.latitude, ip.longitude, count, minCount, maxCount, color)

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
        <div style="background:#141815;color:#d6dad7;padding:9px 11px;border:1px solid #333c36;border-radius:0;box-shadow:inset 2px 2px 0 rgba(255,255,255,0.07),inset -2px -2px 0 rgba(0,0,0,0.55);font-family:'SF Mono','JetBrains Mono',Menlo,Consolas,monospace;font-size:12px;min-width:170px;">
          <div style="color:#d6dad7;font-weight:600;margin-bottom:5px;">${ip.ip}</div>
          <div style="color:#8b948d;">${ip.city || "Unknown"}, ${ip.country || "Unknown"}</div>
          <div style="color:#8b948d;margin-top:3px;">Packets: ${count}</div>
          ${ip.isp ? `<div style="color:#8b948d;">ISP: ${ip.isp}</div>` : ""}
          <div style="margin-top:6px;">
            <span style="background:${color};color:#000;padding:1px 6px;border-radius:0;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">
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

    })

    // Re-add user marker on top
    if (userMarker) {
      userMarker.remove()
      userMarker.addTo(map)
    }
  }

  // Draw one visual connection whose style switches at the IP marker. Geometry
  // is calculated in Web Mercator pixels, not latitude/longitude degrees.
  function drawTrafficLine(origin, lat, lon, count, minCount, maxCount, color) {
    const PROJECTION_ZOOM = 0
    const MIN_TAIL_LENGTH = 2.2
    const MAX_TAIL_LENGTH = 15.6
    const originLatLng = L.latLng(origin[0], origin[1])
    const targetLatLng = L.latLng(lat, lon)
    const originPoint = map.project(originLatLng, PROJECTION_ZOOM)
    const targetPoint = map.project(targetLatLng, PROJECTION_ZOOM)

    let direction = targetPoint.subtract(originPoint)
    const magnitude = Math.hypot(direction.x, direction.y)
    if (magnitude < 1e-6) direction = L.point(0, -1)
    else direction = direction.divideBy(magnitude)

    const range = maxCount - minCount
    const normalized = range > 0 ? (count - minCount) / range : 0
    const tailLength = MIN_TAIL_LENGTH + (MAX_TAIL_LENGTH - MIN_TAIL_LENGTH) * normalized
    const endPoint = targetPoint.add(direction.multiplyBy(tailLength))
    const endLatLng = map.unproject(endPoint, PROJECTION_ZOOM)

    const connection = L.polyline([originLatLng, targetLatLng], {
      color,
      weight: 1,
      opacity: 0.4,
      dashArray: "4 4",
      lineCap: "butt",
      interactive: false,
    })
    const tail = L.polyline([targetLatLng, endLatLng], {
      color,
      weight: 2,
      opacity: 0.8,
      lineCap: "round",
      interactive: false,
    })

    ipLayerGroup.addLayer(connection)
    ipLayerGroup.addLayer(tail)
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

  function set2DUserLocation(lat, lon, source = "gps") {
    if (!map) return
    userLocationEstimated = source !== "gps"
    userLatLng = [lat, lon]

    // Publish so the side panel renders its always-present "Your Location" item.
    window.PB_USER_LOCATION = { lat, lon, estimated: userLocationEstimated }
    if (window.renderUserLocationCard) window.renderUserLocationCard()

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

    const label = userLocationEstimated ? "Your Estimated Location" : "Your Location"
    userMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
      .bindTooltip('<div style="background:#141815;color:#d6dad7;padding:7px 11px;border:1px solid #333c36;border-radius:0;box-shadow:inset 2px 2px 0 rgba(255,255,255,0.07),inset -2px -2px 0 rgba(0,0,0,0.55);font-family:\'SF Mono\',\'JetBrains Mono\',Menlo,Consolas,monospace;font-size:12px;">' + label + '</div>', {
        permanent: false,
        opacity: 1,
        className: "leaflet-packetbracket-tooltip",
      })
      .addTo(map)
    userMarker.on("click", () => {
      if (window.highlightUserLocationInSidePanel) window.highlightUserLocationInSidePanel()
    })

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

  function panTo2D(lat, lon) {
    if (!map || lat == null || lon == null || isNaN(lat) || isNaN(lon)) return
    map.setView([lat, lon], Math.max(map.getZoom(), 4), { animate: true })
  }

  window.panTo2D = panTo2D
  window.initEmpty2DGlobe = initEmpty2DGlobe
  window.populate2DGlobe = populate2DGlobe
  window.clear2DGlobeData = clear2DGlobeData
  window.show2DGlobe = show2DGlobe
  window.hide2DGlobe = hide2DGlobe
  window.cleanup2DGlobe = cleanup2DGlobe
  window.set2DUserLocation = set2DUserLocation
  window.selectIPOn2DGlobe = selectIPOn2DGlobe
  window.selectUserOn2DGlobe = () => {
    if (!userLatLng) return
    panTo2D(userLatLng[0], userLatLng[1])
    if (userMarker) userMarker.openTooltip()
  }
})()
