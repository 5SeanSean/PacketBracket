// 2d-globe.js - Complete version with initialization separation
;(() => {
  let canvas, ctx
  let ipMarkers = []
  let selectedMarker = null
  const markerColor = "#00ff41"
  const selectedColor = "#64ffda"
  let hoveredMarker = null
  const backgroundImage = new Image()
  let isBackgroundLoaded = false
  let isCanvasVisible = true

  // Constants for the SVG dimensions
  const SVG_WIDTH = 6400
  const SVG_HEIGHT = 3042
  const SVG_ASPECT = SVG_WIDTH / SVG_HEIGHT

  // Scrolling state
  let scrollOffset = 0
  const SCROLL_SPEED = 100
  let isScrolling = false

  // Dragging state
  let isDragging = false
  let lastDragX = 0
  let dragStartX = 0

  // Zoom state
  let zoomLevel = 1
  const MIN_ZOOM = 1
  const MAX_ZOOM = 4
  const ZOOM_SENSITIVITY = 0.001

  // Initialize empty 2D globe on site load
  function initEmpty2DGlobe() {
    console.log("Initializing empty 2D globe...")

    const container = document.getElementById("globe")

    // Create canvas
    canvas = document.createElement("canvas")
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    canvas.style.position = "absolute"
    canvas.style.top = "0"
    canvas.style.left = "0"
    canvas.style.display = "none" // Hidden by default
    container.appendChild(canvas)

    // Set canvas dimensions based on container
    resizeCanvas()

    ctx = canvas.getContext("2d")

    // Load background image
    loadBackgroundImage()

    // Add event listeners
    setupEventListeners()

    // Initial draw (empty)
    draw()

    // Start animation loop
    requestAnimationFrame(animate)

    console.log("Empty 2D globe initialized successfully")
  }

  // Populate 2D globe with IP data
  function populate2DGlobe(ipData, ipPackets) {
    console.log("Populating 2D globe with IP data:", ipData)

    // Clear existing data
    clear2DGlobeData()

    // Filter out invalid coordinates
    const validIPs = ipData.filter((ip) => {
      return !isNaN(ip.latitude) && !isNaN(ip.longitude)
    })

    if (validIPs.length === 0) {
      showStatus("No valid geolocation data available", "error")
      return
    }

    // Initialize markers
    initMarkers(validIPs)

    // Draw with new data
    draw()

    console.log("2D globe populated with data successfully")
  }

  // Clear all IP data from 2D globe
  function clear2DGlobeData() {
    ipMarkers = []
    selectedMarker = null
    hoveredMarker = null

    // Redraw empty globe
    if (ctx) {
      draw()
    }
  }

  // Show/hide 2D globe
  function show2DGlobe() {
    if (canvas) {
      canvas.style.display = "block"
      isCanvasVisible = true
    }
  }

  function hide2DGlobe() {
    if (canvas) {
      canvas.style.display = "none"
      isCanvasVisible = false
    }
  }

  function animate() {
    if (isCanvasVisible && (isScrolling || isDragging)) {
      draw()
    }
    requestAnimationFrame(animate)
  }

  function resizeCanvas() {
    const container = document.getElementById("globe")
    canvas.width = container.offsetWidth
    canvas.height = container.offsetHeight
  }

  function loadBackgroundImage() {
    backgroundImage.onload = () => {
      isBackgroundLoaded = true
      console.log("Background image loaded")
      draw()
    }
    backgroundImage.onerror = () => {
      console.error("Failed to load background image")
      isBackgroundLoaded = false
      draw()
    }

    backgroundImage.src = "src/mercator.svg"
  }

  function initMarkers(ipData) {
    ipMarkers = ipData.map((ip) => {
      return {
        ip: ip.ip,
        lat: ip.latitude,
        lon: ip.longitude,
        city: ip.city,
        country: ip.country,
        count: ip.packets.length,
        x: 0, // Will be calculated in draw
        y: 0, // Will be calculated in draw
      }
    })
  }

  function setupEventListeners() {
    // Marker hover detection
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Check if hovering over a marker
      let newHoveredMarker = null
      for (const marker of ipMarkers) {
        const dist = Math.sqrt((mouseX - marker.x) ** 2 + (mouseY - marker.y) ** 2)
        if (dist <= 8 * zoomLevel) {
          // Scale hit area with zoom
          newHoveredMarker = marker
          break
        }
      }

      if (hoveredMarker !== newHoveredMarker) {
        hoveredMarker = newHoveredMarker
        canvas.style.cursor = hoveredMarker ? "pointer" : isDragging ? "grabbing" : "grab"
        draw()
      }

      // Handle dragging
      if (isDragging) {
        const dx = e.clientX - lastDragX
        scrollOffset -= dx / zoomLevel
        lastDragX = e.clientX
      }
    })

    // Marker selection
    canvas.addEventListener("click", (e) => {
      if (Math.abs(e.clientX - dragStartX) > 5) {
        return // Ignore click if it was part of a drag
      }

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Find clicked marker
      for (const marker of ipMarkers) {
        const dist = Math.sqrt((mouseX - marker.x) ** 2 + (mouseY - marker.y) ** 2)
        if (dist <= 8 * zoomLevel) {
          selectMarker(marker)
          return
        }
      }

      // Deselect if clicking elsewhere
      if (selectedMarker) {
        deselectMarker()
      }
    })

    // Drag start
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        // Left mouse button
        isDragging = true
        lastDragX = e.clientX
        dragStartX = e.clientX
        canvas.style.cursor = "grabbing"
      }
    })

    // Drag end
    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false
        canvas.style.cursor = hoveredMarker ? "pointer" : "grab"
      }
    })

    // Handle window resize
    window.addEventListener("resize", () => {
      resizeCanvas()
      draw()
    })

    // Keyboard controls for scrolling
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        scrollOffset -= SCROLL_SPEED / zoomLevel
        isScrolling = true
        e.preventDefault()
      } else if (e.key === "ArrowRight") {
        scrollOffset += SCROLL_SPEED / zoomLevel
        isScrolling = true
        e.preventDefault()
      }
    })

    window.addEventListener("keyup", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        isScrolling = false
      }
    })

    // Mouse wheel zoom
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault()

      // Get mouse position relative to canvas
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left

      // Calculate mouse position in world coordinates before zoom
      const worldX = (mouseX + scrollOffset) / zoomLevel

      // Update zoom level
      const zoomFactor = 1 - e.deltaY * ZOOM_SENSITIVITY

      zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel * zoomFactor))

      // Calculate new scroll offset to zoom at mouse position
      const newWorldX = mouseX + scrollOffset
      scrollOffset = newWorldX - worldX * zoomLevel

      draw()
    })
  }

  function draw() {
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.fillStyle = "#0d0208"
    ctx.fillRect(0, 0, width, height)

    // Calculate dimensions to maintain aspect ratio (fit height)
    const drawWidth = height * SVG_ASPECT * zoomLevel
    const drawHeight = height * zoomLevel

    // Handle world wrapping (looping)
    const worldWidth = drawWidth
    scrollOffset = scrollOffset % worldWidth
    if (scrollOffset < 0) scrollOffset += worldWidth

    // Save context before applying transformations
    ctx.save()

    // Apply zoom by scaling the context
    ctx.scale(zoomLevel, zoomLevel)

    // Draw background image if loaded
    if (isBackgroundLoaded) {
      // Draw two copies of the map for seamless looping
      const firstX = (-scrollOffset / zoomLevel) % worldWidth
      const secondX = firstX + worldWidth

      // First copy
      ctx.drawImage(backgroundImage, firstX, 0, drawWidth, drawHeight)

      // Second copy for looping effect
      if (firstX + drawWidth > width / zoomLevel) {
        ctx.drawImage(backgroundImage, firstX - worldWidth, 0, drawWidth, drawHeight)
      }

      // Third copy if needed
      if (secondX < width / zoomLevel) {
        ctx.drawImage(backgroundImage, secondX, 0, drawWidth, drawHeight)
      }
    } else {
      // Fallback: Draw grid
      drawGrid(width, height)
    }

    // Draw markers
    drawMarkers(width, height, -scrollOffset / zoomLevel, 0, drawWidth, drawHeight)

    // Restore context before drawing effects
    ctx.restore()

    // Draw hover/selection effects (in screen space)
    drawEffects()
  }

  function drawGrid(width, height) {
    ctx.strokeStyle = "rgba(0, 255, 65, 0.1)"
    ctx.lineWidth = 1

    // Draw latitude lines
    for (let lat = -80; lat <= 80; lat += 20) {
      const y = latToY(lat, height)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Draw longitude lines
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = lonToX(lon, width)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
  }

  function drawMarkers(width, height, offsetX, offsetY, drawWidth, drawHeight) {
    const scaleX = drawWidth / SVG_WIDTH
    const scaleY = drawHeight / SVG_HEIGHT
    const worldWidth = drawWidth

    ipMarkers.forEach((marker) => {
      // Calculate position on the SVG
      const svgX = lonToX(marker.lon, SVG_WIDTH)
      const svgY = latToY(marker.lat, SVG_HEIGHT)

      // Convert to canvas coordinates with proper scaling and offset
      const markerX = offsetX + svgX * scaleX
      const markerY = offsetY + svgY * scaleY

      // Get threat level color
      const ipInfo = window.currentIPData?.find((data) => data.ip === marker.ip)
      const threatLevel = ipInfo?.threatLevel || { color: "#00ff41" }
      const markerColor = threatLevel.color
      const selectedColor = "#64ffda"

      // Handle world wrapping for markers
      for (let i = -1; i <= 1; i++) {
        marker.x = (markerX + i * worldWidth) * zoomLevel
        marker.y = markerY * zoomLevel

        // Only draw markers that are visible
        if (marker.x >= -20 && marker.x <= width + 20 && marker.y >= -20 && marker.y <= height + 20) {
          const isSelected = selectedMarker && selectedMarker.ip === marker.ip
          const isHovered = hoveredMarker && hoveredMarker.ip === marker.ip
          const size = (isSelected ? 8 : isHovered ? 6 : 4) * zoomLevel
          const color = isSelected ? selectedColor : markerColor

          // Draw marker
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(marker.x / zoomLevel, marker.y / zoomLevel, size / zoomLevel, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })
  }

  function drawEffects() {
    // Draw tooltip for hovered marker
    if (hoveredMarker && !selectedMarker) {
      drawTooltip(hoveredMarker)
    }

    // Draw connection line for selected marker
    if (selectedMarker) {
      drawConnectionLine(selectedMarker)
      drawTooltip(selectedMarker)
    }
  }

  function drawTooltip(marker) {
    const width = canvas.width
    const height = canvas.height
    const padding = 10
    const lineHeight = 18

    const text = [
      `${marker.city || "Unknown"}, ${marker.country || "Unknown"}`,
      `IP: ${marker.ip}`,
      `Packets: ${marker.count}`,
    ]

    // Calculate text width
    ctx.font = "12px Courier New, monospace"
    const textWidth = Math.max(...text.map((line) => ctx.measureText(line).width)) + padding * 2

    // Position tooltip (avoid going off screen)
    let x = marker.x + 15
    let y = marker.y - 30

    if (x + textWidth > width) x = marker.x - textWidth - 5
    if (y < 0) y = 5
    if (y + text.length * lineHeight > height) y = height - text.length * lineHeight - 5

    // Draw tooltip background
    ctx.fillStyle = "rgba(13, 2, 8, 0.9)"
    ctx.strokeStyle = markerColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x, y, textWidth, text.length * lineHeight + padding, 5)
    ctx.fill()
    ctx.stroke()

    // Draw text
    ctx.fillStyle = markerColor
    ctx.textBaseline = "top"
    text.forEach((line, i) => {
      ctx.fillText(line, x + padding, y + padding + i * lineHeight)
    })
  }

  function drawConnectionLine(marker) {
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    ctx.strokeStyle = selectedColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.lineTo(marker.x, marker.y)
    ctx.stroke()
  }

  function lonToX(lon, width) {
    return ((lon + 180) / 360) * width
  }

  function latToY(lat, height) {
    // Mercator projection
    const latRad = (lat * Math.PI) / 180
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
    return height / 2 - (height * mercN) / (2 * Math.PI)
  }

  function selectMarker(marker) {
    deselectMarker()
    selectedMarker = marker

    // Highlight in side panel
    if (window.highlightIPInSidePanel) {
      window.highlightIPInSidePanel(marker.ip)
    }
    draw()
  }

  function deselectMarker() {
    if (selectedMarker) {
      selectedMarker = null

      // Deselect in side panel
      if (window.highlightIPInSidePanel) {
        window.highlightIPInSidePanel(null)
      }
      draw()
    }
  }

  function cleanup2DGlobe() {
    const container = document.getElementById("globe")
    if (container && canvas) {
      // Remove event listeners first
      canvas.replaceWith(canvas.cloneNode(true))

      // Only remove if canvas is still a child of container
      if (container.contains(canvas)) {
        container.removeChild(canvas)
      }
    }

    canvas = null
    ctx = null
    ipMarkers = []
    selectedMarker = null
    hoveredMarker = null
  }

  function showStatus(message, type = "info") {
    const statusEl = document.createElement("div")
    statusEl.style.position = "fixed"
    statusEl.style.bottom = "20px"
    statusEl.style.right = "20px"
    statusEl.style.padding = "10px 20px"
    statusEl.style.borderRadius = "5px"
    statusEl.style.color = "white"
    statusEl.style.zIndex = "1000"

    if (type === "error") {
      statusEl.style.backgroundColor = "rgba(255, 82, 82, 0.9)"
    } else {
      statusEl.style.backgroundColor = "rgba(100, 255, 218, 0.9)"
    }

    statusEl.textContent = message
    document.body.appendChild(statusEl)

    setTimeout(() => {
      statusEl.style.opacity = "0"
      setTimeout(() => {
        document.body.removeChild(statusEl)
      }, 500)
    }, 3000)
  }

  // Export functions
  window.initEmpty2DGlobe = initEmpty2DGlobe
  window.populate2DGlobe = populate2DGlobe
  window.clear2DGlobeData = clear2DGlobeData
  window.show2DGlobe = show2DGlobe
  window.hide2DGlobe = hide2DGlobe
  window.cleanup2DGlobe = cleanup2DGlobe
})()
