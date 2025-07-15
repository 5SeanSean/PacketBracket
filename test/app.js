import PcapngParser from './pcapng-parser.js';
// File handling with progress
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const results = document.getElementById('results');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Create globe container - moved to DOMContentLoaded event
let globeContainer;

const sidePanelScript = document.createElement('script');
sidePanelScript.src = 'side-panel.js';
document.head.appendChild(sidePanelScript);

// Wait for DOM to be fully loaded before creating elements
document.addEventListener('DOMContentLoaded', function() {
    globeContainer = document.createElement('div');
    globeContainer.id = 'globe';
    globeContainer.style.width = '100%';
    globeContainer.style.height = '500px';
    globeContainer.style.margin = '20px 0';
    globeContainer.style.borderRadius = '10px';
    globeContainer.style.overflow = 'hidden';
    
    // Insert the globe container after the progress container
    progressContainer.parentNode.insertBefore(globeContainer, progressContainer.nextSibling);
});

// Load Three.js dynamically
const threeScript = document.createElement('script');
threeScript.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js';
document.head.appendChild(threeScript);

// Load globe.js after Three.js is loaded
threeScript.onload = () => {
    const globeScript = document.createElement('script');
    globeScript.src = 'globe.js';
    document.head.appendChild(globeScript);
};

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

async function handleFile(file) {
    if (!file) return;
    
    console.log('Handling file:', file.name, file.size, 'bytes');
    
    results.innerHTML = '';
    progressContainer.style.display = 'block';
    progressText.textContent = 'Reading file...';
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const parser = new PcapngParser();
            
            parser.onProgress = (offset, total, blockCount) => {
                const percent = (offset / total) * 100;
                progressFill.style.width = percent + '%';
                progressText.textContent = `Parsing... ${Math.round(percent)}% (${blockCount} blocks)`;
            };
            
            const result = await parser.parse(e.target.result);
            progressContainer.style.display = 'none';
            displayResults(result, file);
        } catch (error) {
            progressContainer.style.display = 'none';
            console.error('Parse error:', error);
            results.innerHTML = `<div class="error">❌ Error parsing file: ${error.message}</div>`;
        }
    };
    
    reader.onerror = function() {
        progressContainer.style.display = 'none';
        results.innerHTML = `<div class="error">❌ Error reading file</div>`;
    };
    
    reader.readAsArrayBuffer(file);
}

function displayResults(result, file) {
    const summary = result.summary;
    const ipCache = result.ipCache;
    const ipPackets = result.ipPackets;
    
    let html = `
        <div class="summary">
            <h2>📊 File Summary</h2>
            <div class="info-grid">
                <div><strong>File:</strong> ${file.name}</div>
                <div><strong>Size:</strong> ${(file.size / 1024).toFixed(1)} KB</div>
                <div><strong>Total Packets:</strong> ${summary.totalPackets}</div>
                <div><strong>IPv4 Packets:</strong> ${result.packets.filter(p => p.ipv4 && !p.ipv4.error).length}</div>
                <div><strong>Unique IPs Found:</strong> ${summary.uniqueIPs}</div>
            </div>
        </div>

        <div class="api-notice">
            <strong>API Notice:</strong> Using IPGeolocation.io API for geolocation data.
        </div>

        <div class="visualization-section">
            <h2>🌍 Network Traffic Visualization</h2>
            <p>Showing all public IP addresses found in the capture file</p>
        </div>
    `;

    if (summary.uniqueIPs === 0) {
        html += `<div class="error">No IPv4 packets found in this capture</div>`;
    }

    results.innerHTML = html;
    
    // Prepare data for globe visualization
    const ipData = [];
    const uniqueIPs = Array.from(result.ipPackets.keys());
    
    uniqueIPs.forEach(ip => {
        const location = result.ipCache[ip] || { error: 'Location not available' };
        if (!location.error && !location.isPrivate && !location.isMulticast && !location.isSpecial) {
            ipData.push({
                ip: ip,
                city: location.city,
                region: location.region,
                country: location.country,
                latitude: location.latitude,
                longitude: location.longitude,
                packets: result.ipPackets.get(ip)
            });
        }
    });
    
    // Display IP details in side panel

if (window.displayIPDetails) {
    window.displayIPDetails(ipData, ipPackets, file, {
        totalPackets: summary.totalPackets,
        ipv4Packets: result.packets.filter(p => p.ipv4 && !p.ipv4.error).length,
        uniqueIPs: summary.uniqueIPs
    });
}
    
    // Initialize globe with the IP data
    if (window.initGlobe && ipData.length > 0) {
        initGlobe(ipData);
    } else if (ipData.length === 0) {
        results.innerHTML += `<div class="error">No public IP addresses with geolocation data found</div>`;
    }
}

function formatLocationInfo(location, ip) {
    if (location.isPrivate) {
        return `<div class="private-ip">Private/Internal IP Address (${ip}) - No geolocation available</div>`;
    }
    if (location.isMulticast) {
        return `<div class="multicast-ip">Multicast IP Address (${ip}) - No geolocation available</div>`;
    }
    if (location.isSpecial) {
        return `<div class="private-ip">Special/Reserved IP Address (${ip}) - No geolocation available</div>`;
    }
    if (location.error) {
        return `<div class="error">${location.error}</div>`;
    }
    
    return `
        <div class="location-info">
            <div><strong>Location:</strong> ${location.city}, ${location.region}, ${location.country}</div>
            <div><strong>ISP/ASN:</strong> ${location.isp} (${location.asn})</div>
            ${location.mapUrl ? `<a href="${location.mapUrl}" target="_blank" class="map-link">📍 View on Map</a>` : ''}
        </div>
    `;
}

function formatPacketInfo(packet, currentIP) {
    const otherIP = packet.source || packet.destination;
    return `
        <div class="packet-item">
            <span class="protocol-tag">${packet.protocol}</span>
            ${packet.timestamp.toLocaleTimeString()} → 
            ${otherIP === currentIP ? 'Local' : otherIP}
        </div>
    `;
}