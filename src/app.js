import PcapngParser from "./pcapng-parser.js"

// File handling with progress
const results = document.getElementById("results")
const progressContainer = document.getElementById("progressContainer")
const progressFill = document.getElementById("progressFill")
const progressText = document.getElementById("progressText")
const captureFiles = []
let nextCaptureId = 1
// Once analyzed, a file is locked (can't be re-analyzed). New files stay
// unanalyzed and can either be added onto this result or analyzed alone.
let analyzedResult = null
let analyzedFiles = []

// Create globe container
let globeContainer

// Note: side-panel.js is loaded once via index.html; do not inject it again
// here or its top-level declarations (e.g. _selectedIP) collide.

document.addEventListener("DOMContentLoaded", () => {
  const globeContainer = document.getElementById("globe")

  globeContainer.style.height = "100vh" // Full viewport height
  globeContainer.style.width = "auto" // Make it square
  globeContainer.style.position = "relative"
  globeContainer.style.overflow = "visible" // Hide overflow
  // Move progress container to be centered in globe
  const progressContainer = document.getElementById("progressContainer")
  if (progressContainer) {
    progressContainer.style.position = "absolute"
    progressContainer.style.top = "50%"
    progressContainer.style.left = "50%"
    progressContainer.style.transform = "translate(-50%, -50%)"
    progressContainer.style.zIndex = "100"
  }

  const uploadArea = document.getElementById("uploadArea")
  const fileInput = document.getElementById("fileInput")

  // Add event listeners for file upload only if elements exist
  if (uploadArea) {
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault()
      uploadArea.classList.add("dragover")
    })

    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("dragover")
    })

    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault()
      uploadArea.classList.remove("dragover")
      addCaptureFiles(e.dataTransfer.files)
    })
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      addCaptureFiles(e.target.files)
      e.target.value = ""
    })
  }
})

const threeScript = document.createElement("script")
threeScript.src = "https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js"
document.head.appendChild(threeScript)

// Load both globe scripts after Three.js is loaded
threeScript.onload = () => {
  // Load 3D globe first
  const globeScript = document.createElement("script")
  globeScript.src = "src/globe.js"
  globeScript.type = "module" // Add module type
  document.head.appendChild(globeScript)

  // Then load 2D globe
  const globe2DScript = document.createElement("script")
  globe2DScript.src = "src/2d-globe.js"
  document.head.appendChild(globe2DScript)
}

const allowedCaptureExtensions = /\.(pcapng|pcap|cap|dmp)$/i

function addCaptureFiles(fileList) {
  const incoming = Array.from(fileList || [])
  const rejected = incoming.filter((file) => !allowedCaptureExtensions.test(file.name))

  incoming.filter((file) => allowedCaptureExtensions.test(file.name)).forEach((file) => {
    captureFiles.push({ id: nextCaptureId++, file, selected: true, analyzed: false })
  })

  renderFileQueue()
  if (rejected.length && results) {
    const names = rejected.map((file) => escapeHTML(file.name)).join(", ")
    results.innerHTML = `<div class="error">Skipped unsupported file${rejected.length === 1 ? "" : "s"}: ${names}</div>`
  }
}

function renderFileQueue() {
  const queue = document.getElementById("fileQueue")
  if (!queue) return

  queue.hidden = captureFiles.length === 0
  if (!captureFiles.length) {
    queue.innerHTML = ""
    return
  }

  const pendingCount = captureFiles.filter((entry) => entry.selected && !entry.analyzed).length
  queue.innerHTML = `
    <div class="file-queue-header">
      <strong>Capture files</strong>
      <button type="button" class="file-action" data-action="clear">Clear</button>
    </div>
    <div class="file-queue-list">
      ${captureFiles.map((entry) => `
        <div class="file-queue-item${entry.analyzed ? " is-analyzed" : ""}">
          <label title="${escapeHTML(entry.file.name)}">
            <input type="checkbox" data-file-id="${entry.id}" ${entry.selected ? "checked" : ""} ${entry.analyzed ? "disabled" : ""}>
            <span class="file-name">${escapeHTML(entry.file.name)}</span>
            ${entry.analyzed ? '<span class="file-tag">analyzed</span>' : ""}
            <span class="file-size">${formatBytes(entry.file.size)}</span>
          </label>
          <button type="button" class="file-remove" data-remove-id="${entry.id}" aria-label="Remove ${escapeHTML(entry.file.name)}">&times;</button>
        </div>
      `).join("")}
    </div>
    ${renderAnalyzeControls(pendingCount)}
    <p class="privacy-note">Processed locally in this browser. Files are not uploaded or saved.</p>
  `

  queue.querySelectorAll("input[data-file-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const entry = captureFiles.find((item) => item.id === Number(checkbox.dataset.fileId))
      if (entry) entry.selected = checkbox.checked
      renderFileQueue()
    })
  })
  queue.querySelectorAll("button[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = captureFiles.findIndex((item) => item.id === Number(button.dataset.removeId))
      if (index !== -1) captureFiles.splice(index, 1)
      renderFileQueue()
    })
  })
  queue.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
    captureFiles.length = 0
    analyzedResult = null
    analyzedFiles = []
    renderFileQueue()
  })
  queue.querySelector('[data-action="analyze"]')?.addEventListener("click", () => analyzeSelected("fresh"))
  queue.querySelector('[data-action="add"]')?.addEventListener("click", () => analyzeSelected("add"))
}

// One button before any analysis; a split button (Add / Analyze alone) once a
// result exists and new, unanalyzed files are selected.
function renderAnalyzeControls(pendingCount) {
  if (!pendingCount) {
    return `<button type="button" class="merge-btn" disabled>Analyze 0 selected</button>`
  }
  if (analyzedResult) {
    return `
      <div class="merge-btn-split">
        <button type="button" class="merge-btn" data-action="add">+ Add to current</button>
        <button type="button" class="merge-btn merge-btn-alt" data-action="analyze">Analyze alone</button>
      </div>`
  }
  return `<button type="button" class="merge-btn" data-action="analyze">Analyze ${pendingCount} selected</button>`
}

// Analyze the selected, not-yet-analyzed files. mode "add" merges them onto the
// existing result; "fresh" replaces it. Analyzed files then lock.
async function analyzeSelected(mode) {
  const entries = captureFiles.filter((entry) => entry.selected && !entry.analyzed)
  const files = entries.map((entry) => entry.file)
  if (!files.length) return

  const parsed = await parseFiles(files)
  if (!parsed) return

  if (mode === "add" && analyzedResult) {
    analyzedResult = mergeResults([analyzedResult, parsed])
    analyzedFiles = analyzedFiles.concat(files)
  } else {
    analyzedResult = parsed
    analyzedFiles = files
  }
  entries.forEach((entry) => { entry.analyzed = true; entry.selected = false })
  displayResults(analyzedResult, analyzedFiles)
  renderFileQueue()
}

// Parse files into a single merged result; shows progress. Returns null on error.
async function parseFiles(files) {
  const existingTimeline = document.getElementById("captureTimeline")
  if (existingTimeline?.stopPlayback) existingTimeline.stopPlayback()
  if (existingTimeline) existingTimeline.hidden = true
  if (results) results.innerHTML = ""
  if (progressContainer) progressContainer.style.display = "block"
  if (progressFill) progressFill.style.width = "0%"

  try {
    const parsedResults = []
    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      if (progressText) progressText.textContent = `Reading ${index + 1} of ${files.length}: ${file.name}`
      const buffer = await file.arrayBuffer()
      const parser = new PcapngParser()

      parser.onProgress = (offset, total, blockCount) => {
        const percent = ((index + (total ? offset / total : 0)) / files.length) * 100
        if (progressFill) progressFill.style.width = percent + "%"
        if (progressText) progressText.textContent = `Parsing ${index + 1} of ${files.length}... ${Math.round(percent)}% (${blockCount} blocks)`
      }

      const parsed = await parser.parse(buffer)
      parsed.packets.forEach((packet) => {
        packet.sourceFile = file.name
      })
      parsedResults.push(parsed)
    }
    if (progressFill) progressFill.style.width = "100%"
    if (progressContainer) progressContainer.style.display = "none"
    return mergeResults(parsedResults)
  } catch (error) {
    if (progressContainer) progressContainer.style.display = "none"
    console.error("Parse error:", error)
    if (results) results.innerHTML = `<div class="error">Error parsing capture: ${escapeHTML(error.message)}</div>`
    return null
  }
}

function mergeResults(resultsToMerge) {
  const merged = { blocks: [], interfaces: [], packets: [], ipCache: {}, ipPackets: new Map() }
  resultsToMerge.forEach((result) => {
    merged.blocks.push(...result.blocks)
    merged.interfaces.push(...result.interfaces)
    merged.packets.push(...result.packets)
    Object.assign(merged.ipCache, result.ipCache)
    result.ipPackets.forEach((packets, ip) => {
      const current = merged.ipPackets.get(ip) || { incoming: [], outgoing: [] }
      current.incoming.push(...packets.incoming)
      current.outgoing.push(...packets.outgoing)
      merged.ipPackets.set(ip, current)
    })
  })
  merged.summary = { totalPackets: merged.packets.length, uniqueIPs: merged.ipPackets.size }
  return merged
}

function displayResults(result, files) {
  renderCaptureSnapshot(result, files, result.packets, "Full capture")
  initializeCaptureTimeline(result, files)
}

function renderCaptureSnapshot(result, files, visiblePackets, timelineLabel) {
  const ipPackets = buildIPPacketMap(visiblePackets)
  const summary = { totalPackets: visiblePackets.length, uniqueIPs: ipPackets.size }
  const fileSummary = document.getElementById("fileSummary")
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const fileLabel = files.length === 1 ? escapeHTML(files[0].name) : `${files.length} captures merged`
  if (results) results.innerHTML = ""

  let html = `
        <div class="summary">
            <h2>File Summary</h2>
            <div class="info-grid">
                <div><strong>Source:</strong> ${fileLabel}</div>
                <div><strong>Total Size:</strong> ${formatBytes(totalSize)}</div>
                <div><strong>Packets Shown:</strong> ${summary.totalPackets} of ${result.packets.length}</div>
                <div><strong>IPv4 Packets:</strong> ${visiblePackets.filter((p) => p.ipv4 && !p.ipv4.error).length}</div>
                <div><strong>Unique IPs Found:</strong> ${summary.uniqueIPs}</div>
                <div><strong>Timeline:</strong> ${escapeHTML(timelineLabel)}</div>
            </div>
        </div>
    `

  if (summary.uniqueIPs === 0) {
    html += `<div class="error">No IPv4 packets found in this capture</div>`
  }

  if (fileSummary) fileSummary.innerHTML = html

  // Prepare data for globe visualization
  const ipData = []
  const uniqueIPs = Array.from(ipPackets.keys())

  uniqueIPs.forEach((ip) => {
    const location = result.ipCache[ip] || { error: "Location not available" }
    if (!location.error && !location.isPrivate && !location.isMulticast && !location.isSpecial) {
      ipData.push({
        ip: ip,
        city: location.city,
        region: location.region,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        packets: ipPackets.get(ip),
        // Add security data
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

  // Display IP details in side panel
  if (window.displayIPDetails) {
    window.displayIPDetails(ipData, ipPackets, files, {
      totalPackets: summary.totalPackets,
      ipv4Packets: visiblePackets.filter((p) => p.ipv4 && !p.ipv4.error).length,
      uniqueIPs: summary.uniqueIPs,
    }, visiblePackets)
  }

  // Set IP data in viewport manager (this will populate the current view)
  if (window.viewportManager) {
    window.viewportManager.setIPData(ipData, ipPackets)
    const latest = latestPacketLocation(visiblePackets, result.ipCache)
    if (latest) window.viewportManager.panToLatest(latest.lat, latest.lon)
  }

  if (visiblePackets.length > 0 && ipData.length === 0) {
    if (results) results.innerHTML += `<div class="error">No public IP addresses with geolocation data found</div>`
  }

}

// Location of the newest packet that has a geolocatable public IP (prefer the
// remote/destination end). Drives the follow-cam in replay + upload mode.
function locatableCoords(loc) {
  if (!loc || loc.error || loc.isPrivate || loc.isMulticast || loc.isSpecial) return null
  if (loc.latitude == null || loc.longitude == null) return null
  return { lat: loc.latitude, lon: loc.longitude }
}

function latestPacketLocation(packets, ipCache) {
  let best = null
  let bestTime = Number.NEGATIVE_INFINITY
  packets.forEach((packet) => {
    const ipv4 = packet.ipv4
    if (!ipv4 || ipv4.error) return
    const time = packet.timestamp instanceof Date ? packet.timestamp.valueOf() : Number.NEGATIVE_INFINITY
    if (time <= bestTime) return
    const loc = locatableCoords(ipCache[ipv4.destinationIP]) || locatableCoords(ipCache[ipv4.sourceIP])
    if (loc) { best = loc; bestTime = time }
  })
  return best
}

function buildIPPacketMap(packets) {
  const ipPackets = new Map()
  packets.forEach((packet) => {
    const ipv4 = packet.ipv4
    if (!ipv4 || ipv4.error) return
    if (!ipPackets.has(ipv4.sourceIP)) ipPackets.set(ipv4.sourceIP, { incoming: [], outgoing: [] })
    if (!ipPackets.has(ipv4.destinationIP)) ipPackets.set(ipv4.destinationIP, { incoming: [], outgoing: [] })
    ipPackets.get(ipv4.sourceIP).outgoing.push({
      timestamp: packet.timestamp,
      protocol: ipv4.protocolName,
      destination: ipv4.destinationIP,
    })
    ipPackets.get(ipv4.destinationIP).incoming.push({
      timestamp: packet.timestamp,
      protocol: ipv4.protocolName,
      source: ipv4.sourceIP,
    })
  })
  return ipPackets
}

function initializeCaptureTimeline(result, files) {
  const timeline = document.getElementById("captureTimeline")
  if (!timeline) return
  if (timeline.stopPlayback) timeline.stopPlayback()

  const timestamped = result.packets
    .filter((packet) => packet.timestamp instanceof Date && !Number.isNaN(packet.timestamp.valueOf()))
  if (!timestamped.length) {
    timeline.hidden = true
    timeline.innerHTML = ""
    return
  }

  let firstTime = Number.POSITIVE_INFINITY
  let lastTime = Number.NEGATIVE_INFINITY
  timestamped.forEach((packet) => {
    const time = packet.timestamp.valueOf()
    if (time < firstTime) firstTime = time
    if (time > lastTime) lastTime = time
  })
  const rawDuration = lastTime - firstTime
  const duration = Math.max(1, rawDuration)
  const bucketCount = rawDuration === 0 ? 1 : Math.min(64, Math.max(16, Math.ceil(Math.sqrt(timestamped.length) * 2)))
  const bucketDuration = duration / bucketCount
  const counts = Array(bucketCount).fill(0)
  timestamped.forEach((packet) => {
    const index = Math.min(bucketCount - 1, Math.floor((packet.timestamp.valueOf() - firstTime) / bucketDuration))
    counts[index]++
  })
  const maxCount = Math.max(...counts, 1)

  timeline.innerHTML = `
    <div class="timeline-toolbar">
      <button type="button" class="timeline-play">▶ Replay</button>
      <label class="timeline-speed-label">
        Speed
        <select class="timeline-speed" aria-label="Replay speed">
          <option value="1">1×</option>
          <option value="10" selected>10×</option>
          <option value="100">100×</option>
          <option value="1000">1000×</option>
        </select>
      </label>
      <strong class="timeline-current">Full capture</strong>
      <span class="timeline-packet-count">${result.packets.length} packets</span>
    </div>
    <div class="timeline-bars" role="group" aria-label="Packet activity intervals">
      ${counts.map((count, index) => {
        const intervalStart = firstTime + index * bucketDuration
        const intervalEnd = index === bucketCount - 1 ? lastTime : firstTime + (index + 1) * bucketDuration
        const height = count === 0 ? 3 : Math.max(8, Math.round((count / maxCount) * 46))
        return `<button type="button" class="timeline-interval is-seen" data-index="${index}" style="--bar-height:${height}px" aria-label="${count} packets from ${escapeHTML(formatTimelineTime(intervalStart))} to ${escapeHTML(formatTimelineTime(intervalEnd))}" title="${count} packets · ${escapeHTML(formatTimelineTime(intervalStart))}–${escapeHTML(formatTimelineTime(intervalEnd))}"><span></span></button>`
      }).join("")}
    </div>
    <div class="timeline-axis">
      <time>${escapeHTML(formatTimelineTime(firstTime))}</time>
      <span>${escapeHTML(formatDuration(duration))}</span>
      <time>${escapeHTML(formatTimelineTime(lastTime))}</time>
    </div>
  `

  const playButton = timeline.querySelector(".timeline-play")
  const speedSelect = timeline.querySelector(".timeline-speed")
  const currentLabel = timeline.querySelector(".timeline-current")
  const packetCount = timeline.querySelector(".timeline-packet-count")
  const intervals = Array.from(timeline.querySelectorAll(".timeline-interval"))
  let selectedIndex = bucketCount - 1
  let animationFrame = null
  let playbackStartWall = 0
  let playbackStartCapture = firstTime

  const stopPlayback = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    animationFrame = null
    playButton.textContent = "▶ Replay"
    playButton.classList.remove("is-playing")
  }
  timeline.stopPlayback = stopPlayback

  const showInterval = (index) => {
    selectedIndex = Math.max(-1, Math.min(bucketCount - 1, index))
    const cutoff = selectedIndex < 0
      ? firstTime - 1
      : selectedIndex === bucketCount - 1
        ? lastTime
        : firstTime + (selectedIndex + 1) * bucketDuration
    const visiblePackets = selectedIndex === bucketCount - 1
      ? result.packets
      : result.packets.filter((packet) =>
          packet.timestamp instanceof Date &&
          !Number.isNaN(packet.timestamp.valueOf()) &&
          packet.timestamp.valueOf() <= cutoff)

    intervals.forEach((interval, intervalIndex) => {
      interval.classList.toggle("is-seen", intervalIndex <= selectedIndex)
      interval.classList.toggle("is-current", intervalIndex === selectedIndex)
      interval.setAttribute("aria-pressed", String(intervalIndex === selectedIndex))
    })
    const label = selectedIndex === bucketCount - 1
      ? "Full capture"
      : selectedIndex < 0
        ? "Replay starting"
        : `Through ${formatTimelineTime(cutoff)}`
    currentLabel.textContent = label
    packetCount.textContent = `${visiblePackets.length} of ${result.packets.length} packets`
    renderCaptureSnapshot(result, files, visiblePackets, label)
  }

  const replayFrame = (now) => {
    const speed = Number(speedSelect.value)
    const captureTime = playbackStartCapture + (now - playbackStartWall) * speed
    const index = Math.min(bucketCount - 1, Math.floor((captureTime - firstTime) / bucketDuration))
    if (index !== selectedIndex) showInterval(index)
    if (captureTime >= lastTime) {
      showInterval(bucketCount - 1)
      stopPlayback()
      return
    }
    animationFrame = requestAnimationFrame(replayFrame)
  }

  playButton.addEventListener("click", () => {
    if (animationFrame !== null) {
      stopPlayback()
      return
    }
    if (selectedIndex >= bucketCount - 1) showInterval(-1)
    playbackStartCapture = selectedIndex < 0 ? firstTime : firstTime + (selectedIndex + 1) * bucketDuration
    playbackStartWall = performance.now()
    playButton.textContent = "Ⅱ Pause"
    playButton.classList.add("is-playing")
    animationFrame = requestAnimationFrame(replayFrame)
  })

  // Click anywhere in the strip (not just on a bar) — map x to a bucket so a
  // click above a short bar still lands on that column.
  const barsEl = timeline.querySelector(".timeline-bars")
  barsEl.addEventListener("click", (event) => {
    // Keyboard activation lands on the focused bar; a real click maps x → bucket.
    const bar = event.detail ? null : event.target.closest(".timeline-interval")
    let index
    if (bar) {
      index = Number(bar.dataset.index)
    } else {
      const rect = barsEl.getBoundingClientRect()
      const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0
      index = Math.max(0, Math.min(bucketCount - 1, Math.floor(ratio * bucketCount)))
    }
    stopPlayback()
    showInterval(index)
  })

  timeline.hidden = false
  intervals.at(-1)?.classList.add("is-current")
}

function formatTimelineTime(milliseconds) {
  return new Date(milliseconds).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  })
}

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  const totalSeconds = Math.round(milliseconds / 1000)
  if (totalSeconds < 60) return `${totalSeconds} sec`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character])
}
