// globe.js - Complete 3D Globe Visualization for PCAP-NG Analyzer

let scene, camera, renderer, globe, controls
let ipMarkers = []
let animationId
let userLocation = null
let userMarker = null
let connectionArcs = []
const currentLocations = []
let textureLoader
let globeGroup
let selectedMarker = null
let selectedIP = null
let isGlobeVisible = true
let THREE // Declare THREE variable
let targetRotationY = 0 // Declare targetRotationY variable
let targetRotationX = 0 // Declare targetRotationX variable

let isMouseDown = false
let mouseX = 0
let mouseY = 0
let rotationX = 0
let rotationY = 0
let autoRotate = true

const markerScaleSpeed = 0.1
const SELECTED_COLOR = 0x64ffda // Light hacker teal
const DEFAULT_COLOR = 0x00ff41 // Dark hacker green
const CONNECTION_WIDTH = 0.5 // Base width
const SELECTED_CONNECTION_WIDTH = 1.5 // Selected width

// Initialize empty globe on site load
function initEmptyGlobe() {
  console.log("Initializing empty 3D globe...")

  // Make sure THREE.js is available
  if (typeof window.THREE === "undefined") {
    console.log("THREE.js not loaded yet, waiting...")
    setTimeout(() => initEmptyGlobe(), 100)
    return false
  }

  // Set the THREE reference
  THREE = window.THREE

  try {
    const container = document.getElementById("globe")
    const width = container.clientWidth
    const height = container.clientHeight

    // Show texture loading status
    const statusEl = document.getElementById("textureStatus")
    if (statusEl) {
      statusEl.style.display = "block"
      updateTextureStatus("Loading textures...")
    }

    // Create scene
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    // Create camera
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.set(0, 0, 3)

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    // Create a group for the globe and its children
    globeGroup = new THREE.Group()
    scene.add(globeGroup)

    // Create Earth geometry
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64)

    // Load Earth textures
    textureLoader = new THREE.TextureLoader()

    const earthTexture = textureLoader.load(
      "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
      () => updateTextureStatus("Earth texture loaded"),
      () => updateTextureStatus("Error loading Earth texture", true),
    )

    const earthBump = textureLoader.load(
      "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
      () => updateTextureStatus("Bump map loaded"),
      () => updateTextureStatus("Error loading bump map", true),
    )

    const earthSpecular = textureLoader.load(
      "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg",
      () => updateTextureStatus("Specular map loaded"),
      () => updateTextureStatus("Error loading specular map", true),
    )

    // Create Earth material with realistic textures
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      bumpMap: earthBump,
      bumpScale: 0.05,
      specularMap: earthSpecular,
      specular: new THREE.Color("grey"),
      shininess: 5,
    })

    // Create Earth mesh
    globe = new THREE.Mesh(earthGeometry, earthMaterial)
    globe.castShadow = true
    globe.receiveShadow = true
    globeGroup.add(globe)

    // Add clouds layer
    const cloudsGeometry = new THREE.SphereGeometry(1.01, 64, 64)
    const cloudsTexture = textureLoader.load(
      "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_clouds_2048.png",
      () => updateTextureStatus("Clouds texture loaded"),
      () => updateTextureStatus("Error loading clouds texture", true),
    )

    const cloudsMaterial = new THREE.MeshPhongMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.8,
    })
    const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial)
    globeGroup.add(clouds)

    // Add atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(1.05, 64, 64)
    const atmosphereMaterial = new THREE.MeshPhongMaterial({
      color: 0x64ffda,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    })
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    globeGroup.add(atmosphere)

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 3, 5)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    const pointLight = new THREE.PointLight(0x64ffda, 0.5, 100)
    pointLight.position.set(0, 0, 5)
    scene.add(pointLight)

    // Add mouse controls
    addMouseControls()

    // Handle window resize
    window.addEventListener("resize", onWindowResize)

    // Start animation loop
    animate()

    console.log("Empty 3D globe initialized successfully")
    return true
  } catch (error) {
    console.error("Error initializing empty 3D globe:", error)
    showStatus("Failed to initialize 3D globe: " + error.message, "error")
    return false
  }
}

// Populate globe with IP data
function populateGlobe(ipData, ipPackets) {
  console.log("Populating 3D globe with IP data:", ipData)

  // Clear existing data first
  clearGlobeData()

  const validIPs = ipData.filter((ip) => {
    const valid = !isNaN(ip.latitude) && !isNaN(ip.longitude)
    if (!valid) {
      console.warn(`Invalid coordinates for IP ${ip.ip}:`, ip.latitude, ip.longitude)
    }
    return valid
  })

  if (validIPs.length === 0) {
    showStatus("No valid geolocation data available", "error")
    return
  }

  // Calculate min and max traffic values
  let minContacts = Number.POSITIVE_INFINITY
  let maxContacts = Number.NEGATIVE_INFINITY

  validIPs.forEach((ip) => {
    const packets = ipPackets.get(ip.ip)
    if (!packets) return

    const incoming = packets.incoming.length
    const outgoing = packets.outgoing.length
    const total = incoming + outgoing

    if (total < minContacts) minContacts = total
    if (total > maxContacts) maxContacts = total
  })

  // If all values are equal, adjust to avoid division by zero
  if (minContacts === maxContacts) {
    maxContacts = minContacts + 1
  }

  // Calculate center point based on IP locations
  const centerLat = validIPs.reduce((sum, ip) => sum + ip.latitude, 0) / validIPs.length
  const centerLon = validIPs.reduce((sum, ip) => sum + ip.longitude, 0) / validIPs.length
  userLocation = { latitude: centerLat, longitude: centerLon }

  // Add IP markers and connections
  validIPs.forEach((ip) => {
    const packets = ipPackets.get(ip.ip)
    if (!packets) return

    const incoming = packets.incoming.length
    const outgoing = packets.outgoing.length
    const total = incoming + outgoing

    const position = latLonToVector3(ip.latitude, ip.longitude, 1.01)
    const marker = createIPMarker(position, ip.ip, total, minContacts, maxContacts)
    globeGroup.add(marker)

    const userPosition = latLonToVector3(userLocation.latitude, userLocation.longitude, 1.01)
    const connection = createConnectionArc(userPosition, position, ip.ip)
    globeGroup.add(connection)
    connectionArcs.push(connection)
  })

  // Add user marker at center
  userMarker = createUserMarker(latLonToVector3(userLocation.latitude, userLocation.longitude, 1.01))
  globeGroup.add(userMarker)

  console.log("3D globe populated with data successfully")
}

// Clear all IP data from globe
function clearGlobeData() {
  // Remove IP markers
  ipMarkers.forEach((marker) => {
    if (marker.parent) {
      marker.parent.remove(marker)
    }
    if (marker.geometry) marker.geometry.dispose()
    if (marker.material) marker.material.dispose()
  })
  ipMarkers = []

  // Remove connection arcs
  connectionArcs.forEach((arc) => {
    if (arc.parent) {
      arc.parent.remove(arc)
    }
    if (arc.geometry) arc.geometry.dispose()
    if (arc.material) arc.material.dispose()
  })
  connectionArcs = []

  // Remove user marker
  if (userMarker && userMarker.parent) {
    userMarker.parent.remove(userMarker)
    if (userMarker.geometry) userMarker.geometry.dispose()
    if (userMarker.material) userMarker.material.dispose()
  }
  userMarker = null

  // Reset selection
  selectedMarker = null
  selectedIP = null
  userLocation = null
}

// Show/hide globe
function showGlobe() {
  if (renderer && renderer.domElement) {
    renderer.domElement.style.display = "block"
    isGlobeVisible = true
  }
}

function hideGlobe() {
  if (renderer && renderer.domElement) {
    renderer.domElement.style.display = "none"
    isGlobeVisible = false
  }
}

// Create an IP location marker
function createIPMarker(position, ip, totalContacts, minContacts, maxContacts) {
  // Calculate proportional height (clamped between min and max)
  const minHeight = 0.05 // Minimum height above surface
  const maxHeight = 0.2 // Maximum height above surface

  // Normalize the totalContacts between min and max
  const normalized = (totalContacts - minContacts) / (maxContacts - minContacts)
  const height = minHeight + (maxHeight - minHeight) * normalized

  // Column geometry (cylinder with small radius)
  const geometry = new THREE.CylinderGeometry(0.005, 0.005, height, 10)

  // Move geometry so bottom is at origin (globe surface)
  geometry.translate(0, height / 2, 0)

  const marker = new THREE.Mesh(
    geometry,
    new THREE.MeshPhongMaterial({
      color: DEFAULT_COLOR,
      emissive: DEFAULT_COLOR,
      emissiveIntensity: 0.2,
      specular: 0xffffff,
      shininess: 50,
    }),
  )

  // Position marker exactly on globe surface
  const surfaceNormal = position.clone().normalize()
  const surfacePosition = surfaceNormal.clone().multiplyScalar(0.99) // Globe radius + tiny offset

  // Position marker with base exactly at surface
  marker.position.copy(surfacePosition)

  // Orient the marker to stand perpendicular to globe surface
  const normal = position.clone().normalize()
  marker.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), // Default cylinder orientation (up)
    normal, // Direction we want it to point (outward from globe)
  )

  // Store marker data
  marker.userData = {
    ip: ip,
    isSelected: false,
    targetScale: new THREE.Vector3(1, 1, 1),
    defaultColor: DEFAULT_COLOR,
    originalHeight: height,
    basePosition: position.clone(), // Store original position
  }

  // Add click handler
  marker.onClick = () => {
    selectMarker(marker, ip)
  }

  ipMarkers.push(marker)
  return marker
}

function selectMarker(marker, ip) {
  // Deselect previous
  if (selectedMarker) {
    selectedMarker.userData.targetScale.set(1, 1, 1)
    selectedMarker.material.color.setHex(selectedMarker.userData.defaultColor)

    if (selectedMarker.userData.glow) {
      selectedMarker.userData.glow.material.color.setHex(selectedMarker.userData.defaultColor)
    }

    // Reset connections
    connectionArcs.forEach((arc) => {
      if (arc.userData.isSelected) {
        arc.material.color.setHex(DEFAULT_COLOR)
        arc.material.opacity = 0.6
        arc.userData.isSelected = false
      }
    })
  }

  // Select new marker
  selectedMarker = marker
  selectedIP = ip

  // Visual changes for selection
  marker.material.color.setHex(SELECTED_COLOR)
  marker.userData.targetScale.set(1.5, 1.5, 1.5) // Scale uniformly

  // Add pulse ring effect
  const pulseGeometry = new THREE.RingGeometry(0.015, 0.025, 32)
  const pulseMaterial = new THREE.MeshBasicMaterial({
    color: SELECTED_COLOR,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  })
  const pulseEffect = new THREE.Mesh(pulseGeometry, pulseMaterial)
  pulseEffect.rotateX(-Math.PI / 2)
  marker.add(pulseEffect)
  marker.pulseEffect = pulseEffect

  // Animate pulse
  function animatePulse() {
    if (!marker.userData.isSelected) return
    const time = Date.now() * 0.002
    const scale = 1 + 0.5 * Math.sin(time)
    pulseEffect.scale.set(scale, scale, scale)
    pulseEffect.material.opacity = 0.4 + 0.3 * Math.sin(time * 0.5)
    requestAnimationFrame(animatePulse)
  }
  animatePulse()

  // Highlight connections
  connectionArcs.forEach((arc) => {
    if (arc.userData.connectedIP === ip) {
      arc.material.color.setHex(SELECTED_COLOR)
      arc.material.opacity = 0.8
      arc.userData.isSelected = true
    }
  })

  // Scroll to and highlight in side panel
  if (window.highlightIPInSidePanel) {
    window.highlightIPInSidePanel(ip)
  }

  // Smoothly rotate globe to show selected marker
  const targetRotation = calculateTargetRotation(marker.position)
  targetRotationY = targetRotation.y
  targetRotationX = targetRotation.x
}

// Add function to calculate target rotation
function calculateTargetRotation(position) {
  const vector = position.clone().normalize()
  const y = Math.atan2(vector.x, vector.z)
  const x = Math.atan2(vector.y, Math.sqrt(vector.x * vector.x + vector.z * vector.z))
  return { x: -x, y: y }
}

// Create user marker (center point)
function createUserMarker(position) {
  // Smaller user marker (reduced from 0.03 to 0.02)
  const geometry = new THREE.SphereGeometry(0.02, 16, 16)
  const material = new THREE.MeshPhongMaterial({
    color: 0x64ffda,
    emissive: 0x1a5a4c,
    emissiveIntensity: 0.5,
    specular: 0x111111,
    shininess: 30,
  })
  const marker = new THREE.Mesh(geometry, material)
  marker.position.copy(position)

  // Add pulse effect (smaller than before)
  const pulseGeometry = new THREE.SphereGeometry(0.03, 16, 16)
  const pulseMaterial = new THREE.MeshBasicMaterial({
    color: 0x64ffda,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide,
  })
  const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial)
  marker.add(pulse)

  // Animation for pulse effect
  function animatePulse() {
    pulse.scale.x = 1 + 0.5 * Math.sin(Date.now() * 0.002)
    pulse.scale.y = 1 + 0.5 * Math.sin(Date.now() * 0.002)
    pulse.scale.z = 1 + 0.5 * Math.sin(Date.now() * 0.002)
    requestAnimationFrame(animatePulse)
  }
  animatePulse()

  return marker
}

// Create a curved connection line between two points
function createConnectionArc(start, end, ip) {
  if ([start.x, start.y, start.z, end.x, end.y, end.z].some(isNaN)) {
    console.error("Invalid positions for connection arc:", start, end)
    return null
  }
  const points = []
  const numPoints = 50
  const v1 = start.clone().normalize()
  const v2 = end.clone().normalize()
  const angle = v1.angleTo(v2)

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    const f = t * angle
    const q = new THREE.Quaternion().setFromUnitVectors(v1, v2)
    const vec = v1.clone().applyQuaternion(q.clone().slerp(new THREE.Quaternion(), 1 - t))
    const point = vec.multiplyScalar(1.02)
    points.push(point)
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color: DEFAULT_COLOR,
    transparent: true,
    opacity: 0.6,
  })

  const line = new THREE.Line(geometry, material)
  line.userData = {
    isSelected: false,
    connectedIP: ip,
  }

  return line
}

// Convert latitude/longitude to 3D vector
function latLonToVector3(lat, lon, radius) {
  // Validate inputs
  if (isNaN(lat)) lat = 0
  if (isNaN(lon)) lon = 0
  if (isNaN(radius)) radius = 1.01

  // Convert valid coordinates
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)

  return new THREE.Vector3(isNaN(x) ? 0 : x, isNaN(y) ? 0 : y, isNaN(z) ? 0 : z)
}

// Add mouse controls
function addMouseControls() {
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const container = document.getElementById("globe")

  container.addEventListener("mousedown", (event) => {
    isMouseDown = true
    mouseX = event.clientX
    mouseY = event.clientY
    autoRotate = false
  })

  container.addEventListener("mousemove", (event) => {
    if (!isMouseDown) return

    const deltaX = event.clientX - mouseX
    const deltaY = event.clientY - mouseY

    targetRotationY += deltaX * 0.01
    targetRotationX += deltaY * 0.01

    mouseX = event.clientX
    mouseY = event.clientY
  })

  container.addEventListener("mouseup", () => {
    isMouseDown = false
    setTimeout(() => {
      autoRotate = true
    }, 3000)
  })

  container.addEventListener("wheel", (event) => {
    event.preventDefault()
    const delta = event.deltaY * 0.001
    camera.position.z += delta
    camera.position.z = Math.max(1.5, Math.min(10, camera.position.z))
  })

  container.addEventListener("click", (event) => {
    if (!camera || !raycaster) return

    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / container.clientWidth) * 2 - 1
    mouse.y = -(event.clientY / container.clientHeight) * 2 + 1

    // Update the raycaster
    raycaster.setFromCamera(mouse, camera)

    // Check for intersections with markers
    const intersects = raycaster.intersectObjects(ipMarkers)

    if (intersects.length > 0) {
      const marker = intersects[0].object
      marker.onClick()
    }
  })
}

// Handle window resize
function onWindowResize() {
  if (!camera || !renderer) return

  const container = document.getElementById("globe")
  const width = container.clientWidth
  const height = container.clientHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

// Animation loop
function animate() {
  animationId = requestAnimationFrame(animate)

  // Only render if globe is visible and properly initialized
  if (!isGlobeVisible || !globeGroup || !renderer || !scene || !camera) return

  // Handle marker scaling
  ipMarkers.forEach((marker) => {
    if (marker.userData.targetScale) {
      marker.scale.lerp(marker.userData.targetScale, 0.1)
    }
  })

  // Handle connection line width changes
  connectionArcs.forEach((arc) => {
    if (arc.userData.targetWidth !== undefined) {
      arc.material.linewidth = THREE.MathUtils.lerp(arc.material.linewidth, arc.userData.targetWidth, 0.1)
    }
  })

  // Handle rotation
  if (globeGroup) {
    // Smooth rotation animation
    rotationX += (targetRotationX - rotationX) * 0.1
    rotationY += (targetRotationY - rotationY) * 0.1

    // Auto-rotate when not interacting
    if (autoRotate) {
      rotationY += 0.005
    }

    globeGroup.rotation.x = rotationX
    globeGroup.rotation.y = rotationY
  }

  // Render the scene
  renderer.render(scene, camera)
}

// Update texture loading status
function updateTextureStatus(message, isError = false) {
  const statusEl = document.getElementById("textureStatus")
  if (!statusEl) return

  statusEl.textContent = message

  if (isError) {
    statusEl.style.color = "#ff5252"
  } else {
    statusEl.style.color = "#64ffda"
  }

  setTimeout(() => {
    statusEl.style.display = "none"
  }, 3000)
}

// Show status message
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

function cleanupGlobe() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }

  const container = document.getElementById("globe")
  if (container && renderer && renderer.domElement) {
    container.removeChild(renderer.domElement)
  }

  // Remove event listeners
  window.removeEventListener("resize", onWindowResize)

  // Clean up Three.js objects
  if (scene) {
    scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose()
      }
      if (object.material) {
        if (object.material.map) object.material.map.dispose()
        if (object.material.bumpMap) object.material.bumpMap.dispose()
        if (object.material.specularMap) object.material.specularMap.dispose()
        object.material.dispose()
      }
    })
  }

  scene = null
  camera = null
  renderer = null
  globe = null
  ipMarkers = []
  connectionArcs = []
}

window.selectIPOnGlobe = (ip) => {
  const marker = ipMarkers.find((m) => m.userData.ip === ip)
  if (marker) {
    selectMarker(marker, ip)
  }
}

// Export functions
window.initEmptyGlobe = initEmptyGlobe
window.populateGlobe = populateGlobe
window.clearGlobeData = clearGlobeData
window.showGlobe = showGlobe
window.hideGlobe = hideGlobe
window.cleanupGlobe = cleanupGlobe
