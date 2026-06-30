const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const path = require('path')
const { Cap, decoders } = require('cap')

// Register app:// scheme before app is ready (required for module loading)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

let mainWindow = null
let capture = null
let capturing = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    title: 'PacketBracket',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

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
})

app.on('window-all-closed', () => {
  stopCapture()
  if (process.platform !== 'darwin') app.quit()
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

function startCapture(iface) {
  if (capturing) return

  let device
  try {
    device = iface || Cap.findDevice()
  } catch (e) {
    mainWindow?.webContents.send('capture-error', 'Could not find a network interface. Install Npcap from https://npcap.com')
    return
  }

  const buffer = Buffer.alloc(65535)
  capture = new Cap()

  try {
    const linkType = capture.open(device, '', 10 * 1024 * 1024, buffer)
    capture.setMinBytes && capture.setMinBytes(0)
    capturing = true

    mainWindow?.webContents.send('capture-status', 'live')

    capture.on('packet', (nbytes) => {
      try {
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

        mainWindow?.webContents.send('packet', {
          type: 'packet',
          src,
          dst,
          protocol: getProtocolName(ip.info.protocol),
          size: nbytes,
          timestamp: new Date().toISOString(),
          src_private: srcPrivate,
          dst_private: dstPrivate,
        })
      } catch (_) {}
    })

    capture.on('error', (err) => {
      mainWindow?.webContents.send('capture-error', err.message)
      stopCapture()
    })
  } catch (err) {
    const msg = err.message.includes('Npcap') || err.message.includes('WinPcap') || err.message.includes('pcap')
      ? 'Install Npcap from https://npcap.com to enable live capture'
      : err.message
    mainWindow?.webContents.send('capture-error', msg)
    capture = null
  }
}

function stopCapture() {
  if (capture) {
    try { capture.close() } catch (_) {}
    capture = null
  }
  capturing = false
  mainWindow?.webContents.send('capture-status', 'idle')
}

ipcMain.on('start-capture', (_, iface) => startCapture(iface))
ipcMain.on('stop-capture', () => stopCapture())
ipcMain.handle('list-interfaces', () => {
  try {
    return Cap.deviceList()
  } catch {
    return []
  }
})
