const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  startCapture: (iface) => ipcRenderer.send('start-capture', iface),
  stopCapture: () => ipcRenderer.send('stop-capture'),
  listInterfaces: () => ipcRenderer.invoke('list-interfaces'),
  installNpcap: () => ipcRenderer.invoke('install-npcap'),
  geoLookup: (ip) => ipcRenderer.invoke('geo-lookup', ip),
  geoSelf: () => ipcRenderer.invoke('geo-self'),
  onPacket: (cb) => ipcRenderer.on('packet', (_, data) => cb(data)),
  onCaptureStatus: (cb) => ipcRenderer.on('capture-status', (_, status) => cb(status)),
  onCaptureError: (cb) => ipcRenderer.on('capture-error', (_, msg) => cb(msg)),
  onCaptureWarning: (cb) => ipcRenderer.on('capture-warning', (_, msg) => cb(msg)),
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('packet')
    ipcRenderer.removeAllListeners('capture-status')
    ipcRenderer.removeAllListeners('capture-error')
    ipcRenderer.removeAllListeners('capture-warning')
  },
})
