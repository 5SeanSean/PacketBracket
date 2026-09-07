const { app, BrowserWindow, ipcMain, protocol, shell } = require('electron')
const path = require('path')
const fs = require('fs')

// Keep installed apps in sync with new releases without runtime-loading the
// website: electron-updater checks GitHub Releases (configured under `build.publish`
// in package.json), downloads a new version in the background, and installs it on
// the next launch. Loaded lazily and guarded so a dev run (no update feed) or a
// missing dependency never blocks startup.
function checkForUpdates() {
  if (!app.isPackaged) return // dev runs have no published feed
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.on('error', (err) => console.warn('[updater]', err && err.message))
    autoUpdater.checkForUpdatesAndNotify().catch((e) => console.warn('[updater]', e && e.message))
  } catch (e) {
    console.warn('[updater] unavailable:', e && e.message)
  }
}

// `cap` is a native module that depends on Npcap's wpcap.dll at runtime. If
// Npcap isn't installed, require('cap') throws "specified module could not be
// found". Load it lazily (only when capture starts) and guard it, so the app
// still launches without Npcap and can offer to install it.
let Cap = null
let decoders = null
function loadCap() {
  if (Cap) return true
  try {
    ;({ Cap, decoders } = require('cap'))
    return true
  } catch (e) {
    return false
  }
}

// Path to the Npcap installer bundled via extraResources (present only if
// electron/npcap-installer.exe existed at build time). Falls back to a repo-local
// copy during `npm start` development runs.
function npcapInstallerPath() {
  const bundled = path.join(process.resourcesPath, 'npcap-installer.exe')
  if (fs.existsSync(bundled)) return bundled
  const dev = path.join(__dirname, 'npcap-installer.exe')
  if (fs.existsSync(dev)) return dev
  return null
}

// Register app:// scheme before app is ready (required for module loading)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

let mainWindow = null
let capture = null
let capturing = false

// Safe send: the window may be destroyed (not just null) during shutdown, so
// guard both the window and its webContents before sending.
function sendToRenderer(channel, payload) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send(channel, payload)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    title: 'PacketBracket',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Always load the bundled copy (app://). The app is self-contained: it runs
  // offline, its code can't be swapped at runtime (the preload exposes native
  // capture IPC, so remote code would be a security risk), and each release is
  // versioned. Staying current with the website is handled by auto-update
  // (checkForUpdates below) — both the site and the app build from the same src/.
  mainWindow.loadURL('app://./index.html')
  mainWindow.setMenu(null)

  mainWindow.on('closed', () => {
    stopCapture()
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Serve local files under app:// so ES modules work (file:// blocks cross-origin module imports)
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.replace('app://./', '')
    const filePath = path.join(__dirname, '..', decodeURIComponent(url))
    callback({ path: filePath })
  })

  createWindow()
  checkForUpdates()
})

// Always release the capture handle before quitting (Cmd+Q, taskbar close, etc.)
app.on('before-quit', () => stopCapture())

app.on('window-all-closed', () => {
  stopCapture()
  // Hard-exit on Windows/Linux: the native cap (pcap) thread can hold the
  // event loop open and leave the process running after a graceful quit.
  if (process.platform !== 'darwin') app.exit(0)
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ---- Packet capture ----

function isPrivateIP(ip) {
  return (
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^127\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    ip === '0.0.0.0'
  )
}

function getProtocolName(proto) {
  const map = { 1: 'ICMP', 6: 'TCP', 17: 'UDP' }
  return map[proto] || 'OTHER'
}

// ---- TLS SNI extraction ----
// Pull the server_name from a TLS ClientHello sitting in a TCP payload. This
// names the actual service (e.g. discord.media) rather than the IP's hosting
// org. Returns null for anything that isn't a ClientHello. Fully bounds-checked:
// malformed/truncated packets just yield null instead of throwing.
function extractSNI(buf, start, end) {
  try {
    let p = start
    if (end - p < 5) return null
    if (buf[p] !== 0x16) return null // not a TLS handshake record
    p += 5 // skip record header (type, version[2], length[2])
    if (end - p < 4) return null
    if (buf[p] !== 0x01) return null // not a ClientHello
    p += 4 // handshake type + length[3]
    p += 2 // client version
    p += 32 // random
    if (p >= end) return null
    const sidLen = buf[p]; p += 1 + sidLen // session id
    if (p + 2 > end) return null
    const csLen = buf.readUInt16BE(p); p += 2 + csLen // cipher suites
    if (p + 1 > end) return null
    const compLen = buf[p]; p += 1 + compLen // compression methods
    if (p + 2 > end) return null
    let extEnd = p + 2 + buf.readUInt16BE(p); p += 2 // extensions block
    if (extEnd > end) extEnd = end
    while (p + 4 <= extEnd) {
      const type = buf.readUInt16BE(p)
      const len = buf.readUInt16BE(p + 2)
      p += 4
      if (type === 0x0000) { // server_name extension
        // server_name_list: list_len[2], name_type[1], name_len[2], name
        if (p + 5 > extEnd) return null
        const nameLen = buf.readUInt16BE(p + 3)
        const nameStart = p + 5
        if (nameStart + nameLen > extEnd) return null
        return buf.toString('ascii', nameStart, nameStart + nameLen) || null
      }
      p += len
    }
    return null
  } catch (_) {
    return null
  }
}

// ---- Reverse DNS ----
const dns = require('dns').promises
const rdnsCache = new Map() // ip -> hostname|null (null = looked up, none found)

async function reverseDns(ip) {
  if (rdnsCache.has(ip)) return rdnsCache.get(ip)
  rdnsCache.set(ip, null) // mark in-flight so we don't spam the resolver
  try {
    const names = await dns.reverse(ip)
    const host = (names && names[0]) || null
    rdnsCache.set(ip, host)
    return host
  } catch (_) {
    rdnsCache.set(ip, null)
    return null
  }
}

// ---- Process attribution ----
// Map a local port to the owning process by polling the OS connection table
// while capturing. netstat/lsof are already present on their platforms, so this
// needs no extra dependency.
const { execFile } = require('child_process')
let portProcess = new Map() // localPort -> { pid, name }
let procTimer = null

function execTextFile(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout))
    })
  })
}

async function refreshProcessTableWin() {
  const [netstat, tasklist] = await Promise.all([
    execTextFile('netstat', ['-ano', '-p', 'tcp']).then((tcp) =>
      Promise.all([Promise.resolve(tcp), execTextFile('netstat', ['-ano', '-p', 'udp'])]).then(([a, b]) => a + b)),
    execTextFile('tasklist', ['/fo', 'csv', '/nh']),
  ])

  // pid -> image name from tasklist CSV ("name","pid",...)
  const pidName = new Map()
  tasklist.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^"([^"]+)","(\d+)"/)
    if (m) pidName.set(m[2], m[1].replace(/\.exe$/i, ''))
  })

  const map = new Map()
  netstat.split(/\r?\n/).forEach((line) => {
    // e.g.  TCP    192.168.1.5:54321   1.2.3.4:443   ESTABLISHED   1234
    const m = line.match(/^\s*(TCP|UDP)\s+\S+:(\d+)\s+\S+\s+(?:\S+\s+)?(\d+)\s*$/)
    if (!m) return
    const port = Number(m[2])
    const pid = m[3]
    map.set(port, { pid: Number(pid), name: pidName.get(pid) || `PID ${pid}` })
  })
  portProcess = map
}

async function refreshProcessTableUnix() {
  // lsof: -n no DNS, -P no port names, -i IP sockets. Columns: COMMAND PID ... NAME
  const out = await execTextFile('lsof', ['-nP', '-i'])
  const map = new Map()
  out.split(/\r?\n/).forEach((line) => {
    const cols = line.split(/\s+/)
    if (cols.length < 9 || cols[0] === 'COMMAND') return
    const name = cols[0]
    const pid = Number(cols[1])
    // NAME like 192.168.1.5:54321->1.2.3.4:443 or *:5353
    const local = (cols[8] || '').split('->')[0]
    const port = Number(local.split(':').pop())
    if (port) map.set(port, { pid, name })
  })
  portProcess = map
}

function refreshProcessTable() {
  const fn = process.platform === 'win32' ? refreshProcessTableWin : refreshProcessTableUnix
  fn().catch((e) => console.warn('[proc]', e && e.message))
}

function startProcessPolling() {
  refreshProcessTable()
  if (procTimer) clearInterval(procTimer)
  procTimer = setInterval(refreshProcessTable, 3000)
}

function stopProcessPolling() {
  if (procTimer) { clearInterval(procTimer); procTimer = null }
  portProcess = new Map()
}

// Npcap restricts capture to Administrators by default, so a non-elevated
// process opens the adapter but receives no packets. Detect elevation so we can
// warn the user instead of failing silently. `net session` needs admin.
function isElevated() {
  if (process.platform !== 'win32') return true
  try {
    require('child_process').execSync('net session', { stdio: 'ignore' })
    return true
  } catch (_) {
    return false
  }
}

// Best-effort primary outbound IPv4 (the interface used to reach the internet),
// so we capture on the active adapter instead of a random virtual one.
function getPrimaryIPv4() {
  return new Promise((resolve) => {
    try {
      const socket = require('dgram').createSocket('udp4')
      socket.once('error', () => { try { socket.close() } catch (_) {} ; resolve(null) })
      socket.connect(53, '8.8.8.8', () => {
        let addr = null
        try { addr = socket.address().address } catch (_) {}
        try { socket.close() } catch (_) {}
        resolve(addr && addr !== '0.0.0.0' ? addr : null)
      })
    } catch (_) {
      resolve(null)
    }
  })
}

async function startCapture(iface) {
  if (capturing) return

  if (!loadCap()) {
    sendToRenderer('capture-error', {
      message: 'Npcap is required for live capture',
      driverMissing: true,
      canInstall: !!npcapInstallerPath(),
    })
    return
  }

  let device
  try {
    if (iface) {
      device = iface
    } else {
      // Prefer the adapter that owns our primary outbound IP.
      const primaryIP = await getPrimaryIPv4()
      device = (primaryIP && Cap.findDevice(primaryIP)) || Cap.findDevice()
      console.log('[capture] primaryIP=%s -> device=%s', primaryIP, device)
    }
  } catch (e) {
    sendToRenderer('capture-error', {
      message: 'Could not find a network interface. Npcap is required.',
      driverMissing: true,
      canInstall: !!npcapInstallerPath(),
    })
    return
  }

  const buffer = Buffer.alloc(65535)
  capture = new Cap()

  try {
    const linkType = capture.open(device, '', 10 * 1024 * 1024, buffer)
    capture.setMinBytes && capture.setMinBytes(0)
    capturing = true
    startProcessPolling()
    console.log('[capture] opened device=%s linkType=%s', device, linkType)

    let seen = 0
    let forwarded = 0

    sendToRenderer('capture-status', 'live')

    // Non-fatal heads-up: without admin, Npcap typically delivers no packets.
    if (!isElevated()) {
      sendToRenderer(
        'capture-warning',
        'Not running as Administrator — capture may receive no packets. Close and run PacketBracket as administrator.'
      )
    }

    capture.on('packet', (nbytes) => {
      try {
        seen++
        if (seen === 1 || seen % 250 === 0) {
          console.log('[capture] packets seen=%d forwarded=%d linkType=%s', seen, forwarded, linkType)
        }
        if (linkType !== 'ETHERNET') return

        const eth = decoders.Ethernet(buffer)
        if (eth.info.type !== decoders.PROTOCOL.ETHERNET.IPV4) return

        const ip = decoders.IPV4(buffer, eth.offset)
        const src = ip.info.srcaddr
        const dst = ip.info.dstaddr
        const srcPrivate = isPrivateIP(src)
        const dstPrivate = isPrivateIP(dst)

        // Skip traffic where both sides are private
        if (srcPrivate && dstPrivate) return

        // Transport ports + TLS SNI from the payload (TCP only for SNI).
        let srcPort, dstPort, sni = null
        const proto = ip.info.protocol
        if (proto === 6) { // TCP
          const tcp = decoders.TCP(buffer, ip.offset)
          srcPort = tcp.info.srcport
          dstPort = tcp.info.dstport
          sni = extractSNI(buffer, tcp.offset, eth.offset + ip.info.totallen)
        } else if (proto === 17) { // UDP
          const udp = decoders.UDP(buffer, ip.offset)
          srcPort = udp.info.srcport
          dstPort = udp.info.dstport
        }

        // The local (private) side owns the local port used for process lookup.
        const localPort = srcPrivate ? srcPort : dstPort
        const proc = (localPort && portProcess.get(localPort)) || null

        // Best-effort reverse DNS for the public peer (async, cached).
        const publicIP = srcPrivate ? dst : src
        if (!rdnsCache.has(publicIP)) reverseDns(publicIP)

        forwarded++
        sendToRenderer('packet', {
          type: 'packet',
          src,
          dst,
          protocol: getProtocolName(proto),
          size: nbytes,
          timestamp: new Date().toISOString(),
          src_private: srcPrivate,
          dst_private: dstPrivate,
          srcPort,
          dstPort,
          sni,
          rdns: rdnsCache.get(publicIP) || null,
          process: proc ? proc.name : null,
          pid: proc ? proc.pid : null,
        })
      } catch (_) {}
    })

    capture.on('error', (err) => {
      sendToRenderer('capture-error', { message: err.message })
      stopCapture()
    })
  } catch (err) {
    const driverMissing = err.message.includes('Npcap') || err.message.includes('WinPcap') || err.message.includes('pcap')
    if (driverMissing) {
      // Renderer decides whether to offer the one-click bundled installer.
      sendToRenderer('capture-error', {
        message: 'Npcap is required for live capture',
        driverMissing: true,
        canInstall: !!npcapInstallerPath(),
      })
    } else {
      sendToRenderer('capture-error', { message: err.message })
    }
    capture = null
  }
}

function stopCapture() {
  if (capture) {
    try { capture.close() } catch (_) {}
    capture = null
  }
  capturing = false
  stopProcessPolling()
  sendToRenderer('capture-status', 'idle')
}

ipcMain.on('start-capture', (_, iface) => {
  startCapture(iface).catch((err) => console.error('[capture] start error:', err))
})
ipcMain.on('stop-capture', () => stopCapture())
ipcMain.handle('list-interfaces', () => {
  if (!loadCap()) return []
  try {
    return Cap.deviceList()
  } catch {
    return []
  }
})

// Launch the bundled Npcap installer (or fall back to the download page).
ipcMain.handle('install-npcap', async () => {
  const installer = npcapInstallerPath()
  if (installer) {
    try {
      await shell.openPath(installer)
      return { launched: true }
    } catch (e) {
      return { launched: false, error: e.message }
    }
  }
  await shell.openExternal('https://npcap.com/#download')
  return { launched: false, opened: 'https://npcap.com/#download' }
})

// ---- Geo lookups from the main process ----
// The renderer runs under app://, which the Worker's CORS lock rejects. Doing
// the fetch here (Node, no CORS) lets the desktop app enrich IPs and detect its
// own location through the same proxy the website uses.
const GEO_ENDPOINT = 'https://packetbracket-geo-proxy.packetbracket.workers.dev/'

async function geoFetch(ip) {
  // No ip => self mode (Worker uses the caller's public IP).
  const url = ip ? `${GEO_ENDPOINT}?ip_address=${encodeURIComponent(ip)}` : GEO_ENDPOINT
  try {
    const resp = await fetch(url)
    if (!resp.ok) return { error: `geo ${resp.status}` }
    return await resp.json()
  } catch (e) {
    return { error: e.message }
  }
}

ipcMain.handle('geo-lookup', (_, ip) => geoFetch(ip))
ipcMain.handle('geo-self', () => geoFetch(null))
ipcMain.handle('reverse-dns', (_, ip) => reverseDns(ip))
