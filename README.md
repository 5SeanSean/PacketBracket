# PacketBracket

**PacketBracket** is a network traffic visualizer. It maps the public IP addresses
your machine talks to onto interactive 3D and 2D globes, enriched with
geolocation and threat intelligence (VPN / proxy / Tor / hosting / abuse flags).

It runs in two modes:

- **Web (viewer):** drag in a `.pcapng` / `.pcap` capture file and explore it in
  your browser. Hosted on GitHub Pages.
- **Desktop app (live capture):** an Electron app that sniffs your live network
  traffic in real time and plots it as it happens.

---

## Features

- Interactive 3D globe (Three.js) and 2D map (Leaflet) views
- Client-side PCAP-NG / PCAP parser so files never leave your machine
- Live packet capture in the desktop app (via Npcap)
- Per-IP threat intelligence: VPN, proxy, Tor, hosting, mobile, abuse
- Geolocation, ASN / ISP, and your own location on the globe

---

## Technologies

### Front-end (web + desktop renderer)
- **Vanilla JavaScript** (ES modules + classic scripts) — no framework
- **[Three.js](https://threejs.org/)** `0.132` — 3D globe rendering (via CDN)
- **[Leaflet](https://leafletjs.com/)** `1.9` — 2D map view (via CDN)
- **HTML5 / CSS3** — UI and styling
- Custom **PCAP-NG / PCAP parser** (`src/pcapng-parser.js`)

### Desktop app
- **[Electron](https://www.electronjs.org/)** `28` — cross-platform desktop shell
- **[cap](https://github.com/mscdex/cap)** — native packet-capture binding (libpcap / Npcap)
- **[Npcap](https://npcap.com/)** — Windows packet-capture driver (runtime dependency)
- **[electron-builder](https://www.electron.build/)** — packaging (NSIS installer + portable exe)
- **electron-rebuild** — compiles the native `cap` module against Electron's ABI

### Backend / infrastructure
- **[Cloudflare Workers](https://workers.dev/)** — serverless geo-intelligence proxy (`worker/`)
- **[ipapi.is](https://ipapi.is/)** — IP geolocation & threat-intelligence API
- **Wrangler** — Worker deployment CLI

### Tooling / CI
- **GitHub Actions** — builds the Windows app and publishes releases on push/tag
- **GitHub Pages** — hosts the web viewer
- **Node.js / npm** — dependency management and scripts

---

## Getting started

### Web viewer
Just open the hosted site and drag in a `.pcapng` file. To run locally, serve the
repo root with any static server (e.g. `python -m http.server`) and open it.

### Desktop app (development)
```bash
npm install        # installs Electron; native cap build is skipped if no C++ toolchain
npm start          # launch the app
```
> Live capture needs the native `cap` module compiled (Visual Studio Build Tools
> + Python) **and** [Npcap](https://npcap.com/) installed. Capture also requires
> running the app **as Administrator**.

### Build the Windows app
```bash
npm run rebuild    # compile cap for Electron
npm run build:win  # outputs installer + portable exe to dist-electron/
```

### Deploy the Worker
```bash
cd worker
wrangler deploy
```

---

## Releases

Download the installer from the [Releases page](https://github.com/5SeanSean/PacketBracket/releases).

> **Note:** the installer is currently **unsigned**, so Windows SmartScreen may
> warn on first run (More info → Run anyway). Live capture requires **Npcap** and
> **Administrator** privileges.

---

## License

[MIT](LICENSE) © 2026 5SeanSean
