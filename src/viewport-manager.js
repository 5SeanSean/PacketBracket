// viewport-manager.js - Handles switching between 2D and 3D globe views

class ViewportManager {
  constructor() {
    this.currentView = null
    this.currentIPData = null
    this.globesInitialized = false

    this.initUI()
    this.setupEventListeners()
  }

  initUI() {
    const container = document.getElementById("globe")

    // Create control buttons
    this.controls = document.createElement("div")
    this.controls.className = "viewport-controls"
    this.controls.innerHTML = `
            <label class="follow-toggle" title="Keep the camera on the most recent packet">
                <input type="checkbox" id="followLatest"> Follow
            </label>
            <details class="height-menu" id="heightMenu">
                <summary class="globe-btn" title="What the marker height / ray length represents">Height ▾</summary>
                <div class="height-menu-panel">
                    <label><input type="checkbox" class="height-metric" value="total" checked> Total</label>
                    <label><input type="checkbox" class="height-metric" value="incoming"> Incoming</label>
                    <label><input type="checkbox" class="height-metric" value="outgoing"> Outgoing</label>
                </div>
            </details>
            <button id="globe3D" class="globe-btn active">3D Globe</button>
            <button id="globe2D" class="globe-btn">2D Map</button>
        `

    container.appendChild(this.controls)
  }

  setupEventListeners() {
    document.getElementById("globe3D").addEventListener("click", () => this.switchView("3d"))
    document.getElementById("globe2D").addEventListener("click", () => this.switchView("2d"))

    // Height metric: checkboxes behave as single-select (exactly one always on).
    window.PB_HEIGHT_METRIC = window.PB_HEIGHT_METRIC || "total"
    const boxes = [...document.querySelectorAll(".height-metric")]
    boxes.forEach((box) => {
      box.addEventListener("change", () => {
        if (!box.checked) { box.checked = true; return } // can't clear the active metric
        boxes.forEach((b) => { if (b !== box) b.checked = false })
        window.PB_HEIGHT_METRIC = box.value
        this.populateCurrentView()
      })
    })
  }

  // Initialize both globes on site load
  async initializeGlobes() {
    if (this.globesInitialized) return

    window.PB_DEBUG && console.log("Initializing globes on site load...")

    try {
      // Wait for required libraries to load
      await this.waitForLibraries()

      // Initialize both globe systems without data
      if (window.initEmptyGlobe) {
        await window.initEmptyGlobe()
        window.PB_DEBUG && console.log("3D globe initialized")
      }

      if (window.initEmpty2DGlobe) {
        await window.initEmpty2DGlobe()
        window.PB_DEBUG && console.log("2D globe initialized")
      }

      this.globesInitialized = true

      // Set default view to 3D
      this.currentView = "3d"
      this.showCurrentView()

      this.locateUser()
    } catch (error) {
      console.error("Error initializing globes:", error)
    }
  }

  locateUser() {
    // Desktop app: navigator.geolocation has no provider in Electron, so detect
    // location from the machine's public IP via the main-process geo proxy.
    if (window.electronAPI && window.electronAPI.geoSelf) {
      window.electronAPI
        .geoSelf()
        .then((geo) => {
          const lat = Number.parseFloat(geo && geo.location && geo.location.latitude)
          const lon = Number.parseFloat(geo && geo.location && geo.location.longitude)
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            if (window.setUserLocation) window.setUserLocation(lat, lon, "ip")
            if (window.set2DUserLocation) window.set2DUserLocation(lat, lon, "ip")
          }
        })
        .catch(() => {})
      return
    }

    if (!navigator.geolocation) {
      this.selfLocateViaIP()
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        if (window.setUserLocation) window.setUserLocation(lat, lon, "gps")
        if (window.set2DUserLocation) window.set2DUserLocation(lat, lon, "gps")
      },
      (err) => {
        // Denied, timed out, or otherwise unavailable — fall back to
        // approximate location from the user's public IP via the geo proxy.
        console.info("Geolocation not available:", err.message, "- trying IP lookup")
        this.selfLocateViaIP()
      },
      { timeout: 10000 }
    )
  }

  // Browser self-location fallback: ask the Worker to geolocate the caller's
  // own public IP (self mode = request with no ip_address).
  selfLocateViaIP() {
    const endpoint = window.PB_CONFIG && window.PB_CONFIG.geoApiEndpoint
    if (!endpoint) return

    console.info("[location] Falling back to approximate location from your public IP")
    fetch(endpoint, { cache: "no-store" })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((geo) => {
        const lat = Number.parseFloat(geo && geo.location && geo.location.latitude)
        const lon = Number.parseFloat(geo && geo.location && geo.location.longitude)
        if (!Number.isNaN(lat) && !Number.isNaN(lon) && !(lat === 0 && lon === 0)) {
          console.info(`[location] IP-based location: ${geo.location.city || "?"}, ${geo.location.country || "?"} (${lat}, ${lon})`)
          if (window.setUserLocation) window.setUserLocation(lat, lon, "ip")
          if (window.set2DUserLocation) window.set2DUserLocation(lat, lon, "ip")
        } else {
          console.info("[location] IP lookup returned no usable location; using data centroid")
        }
      })
      .catch(() => {
        console.info("[location] IP lookup failed; using data centroid")
      })
  }

  waitForLibraries() {
    return new Promise((resolve) => {
      const checkLibraries = () => {
        if (window.THREE && window.initEmptyGlobe && window.initEmpty2DGlobe) {
          resolve()
        } else {
          setTimeout(checkLibraries, 100)
        }
      }
      checkLibraries()
    })
  }

  switchView(viewType) {
    if (this.currentView === viewType) return

    window.PB_DEBUG && console.log(`Switching to ${viewType} view`)

    // Update UI buttons
    document.getElementById("globe3D").classList.toggle("active", viewType === "3d")
    document.getElementById("globe2D").classList.toggle("active", viewType === "2d")

    // Update current view
    this.currentView = viewType

    // Show the appropriate view
    this.showCurrentView()

    // If we have data, populate the current view
    if (this.currentIPData && this.currentIPData.length > 0) {
      this.populateCurrentView()
    }
  }

  showCurrentView() {
    if (!this.globesInitialized) return

    // Hide both views first
    if (window.hideGlobe) window.hideGlobe()
    if (window.hide2DGlobe) window.hide2DGlobe()

    // Show current view
    if (this.currentView === "3d" && window.showGlobe) {
      window.showGlobe()
    } else if (this.currentView === "2d" && window.show2DGlobe) {
      window.show2DGlobe()
    }
  }

  populateCurrentView() {
    if (!this.globesInitialized || !this.currentIPData) return

    window.PB_DEBUG && console.log(`Populating ${this.currentView} view with data`)

    if (this.currentView === "3d" && window.populateGlobe) {
      window.populateGlobe(this.currentIPData, this.currentIPPackets)
    } else if (this.currentView === "2d" && window.populate2DGlobe) {
      window.populate2DGlobe(this.currentIPData, this.currentIPPackets)
    }
  }

  // Pan the active view to lat/lon when "Follow" is checked.
  panToLatest(lat, lon) {
    const cb = document.getElementById("followLatest")
    if (!cb || !cb.checked) return
    if (this.currentView === "2d") {
      if (window.panTo2D) window.panTo2D(lat, lon)
    } else if (window.panToLatLon3D) {
      window.panToLatLon3D(lat, lon)
    }
  }

  setIPData(ipData, ipPackets) {
    this.currentIPData = ipData
    this.currentIPPackets = ipPackets

    // Populate the current view with new data
    this.populateCurrentView()
  }

  clearData() {
    this.currentIPData = null
    this.currentIPPackets = null

    // Clear data from both views
    if (window.clearGlobeData) window.clearGlobeData()
    if (window.clear2DGlobeData) window.clear2DGlobeData()
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.viewportManager = new ViewportManager()

  // Initialize globes on site load
  window.viewportManager.initializeGlobes()
})
