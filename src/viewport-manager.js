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
            <button id="globe3D" class="globe-btn active">3D Globe</button>
            <button id="globe2D" class="globe-btn">2D Map</button>
        `

    container.appendChild(this.controls)
  }

  setupEventListeners() {
    document.getElementById("globe3D").addEventListener("click", () => this.switchView("3d"))
    document.getElementById("globe2D").addEventListener("click", () => this.switchView("2d"))
  }

  // Initialize both globes on site load
  async initializeGlobes() {
    if (this.globesInitialized) return

    console.log("Initializing globes on site load...")

    try {
      // Wait for required libraries to load
      await this.waitForLibraries()

      // Initialize both globe systems without data
      if (window.initEmptyGlobe) {
        await window.initEmptyGlobe()
        console.log("3D globe initialized")
      }

      if (window.initEmpty2DGlobe) {
        await window.initEmpty2DGlobe()
        console.log("2D globe initialized")
      }

      this.globesInitialized = true

      // Set default view to 3D
      this.currentView = "3d"
      this.showCurrentView()
    } catch (error) {
      console.error("Error initializing globes:", error)
    }
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

    console.log(`Switching to ${viewType} view`)

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

    console.log(`Populating ${this.currentView} view with data`)

    if (this.currentView === "3d" && window.populateGlobe) {
      window.populateGlobe(this.currentIPData, this.currentIPPackets)
    } else if (this.currentView === "2d" && window.populate2DGlobe) {
      window.populate2DGlobe(this.currentIPData, this.currentIPPackets)
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
