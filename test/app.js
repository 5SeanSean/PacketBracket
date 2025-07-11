// File handling with progress
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const results = document.getElementById('results');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

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

        <div class="limit-notice">
            <strong>Note:</strong> Displaying information for first 5 unique IP addresses only.
        </div>

        <div class="api-notice">
            <strong>API Notice:</strong> Using IPGeolocation.io API for geolocation data.
        </div>
    `;

    if (summary.uniqueIPs === 0) {
        html += `<div class="error">No IPv4 packets found in this capture</div>`;
    } else {
        const firstFiveIPs = Array.from(ipPackets.entries()).slice(0, 5);
        
        firstFiveIPs.forEach(([ip, packets]) => {
            const location = ipCache[ip] || { error: 'Location not available' };
            
            html += `<div class="ip-card">
                <h3><span class="ip-address">${ip}</span></h3>
                ${formatLocationInfo(location, ip)}
                
                <div class="packets-list">
                    <strong>Packets (${packets.length}):</strong>
                    ${packets.slice(0, 5).map(packet => formatPacketInfo(packet, ip)).join('')}
                    ${packets.length > 5 ? `<div>... and ${packets.length - 5} more packets</div>` : ''}
                </div>
            </div>`;
        });
    }

    results.innerHTML = html;
}

function formatLocationInfo(location, ip) {
    if (location.isPrivate) {
        return `<div class="private-ip">Private/Internal IP Address (${ip}) - No geolocation available</div>`;
    }
    if (location.isMulticast) {
        return `<div class="multicast-ip">Multicast IP Address (${ip}) - No geolocation available</div>`;
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