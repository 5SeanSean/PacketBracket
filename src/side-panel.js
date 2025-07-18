// side-panel.js - Handles the side panel display of IP details

// Initialize the side panel
function initSidePanel() {
    const sidePanel = document.createElement('div');
    sidePanel.className = 'side-panel';
  sidePanel.innerHTML = `
    <div class="upload-area-container">
        <div class="upload-area" id="uploadArea">
            <p style="font-size: 18px; margin-bottom: 20px;">Drop your PCAP-NG file here or click to select</p>
            <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
                Choose File
            </button>
        </div>
        <div id="fileSummary"></div>
    </div>
    <div class="ip-list-container">
        <h2>IP Address Details</h2>
        <div id="ipDetails"></div>
    </div>
`;
    
    // Insert the side panel into the container
    const container = document.querySelector('.side-panel-container');
    if (container) {
        container.appendChild(sidePanel);
    }
}


// Add this function to highlight IP in side panel
window.highlightIPInSidePanel = function(ip) {
    const ipCards = document.querySelectorAll('.ip-card');
    ipCards.forEach(card => {
        card.classList.remove('selected');
        if (card.querySelector('h3').textContent === ip) {
            card.classList.add('selected');
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
};

// Modify displayIPDetails function to add click handlers
window.displayIPDetails = function(ipData, ipPackets, file, summary) {
    const ipDetails = document.getElementById('ipDetails');
    if (!ipDetails) return;
    
    ipDetails.innerHTML = '';
    
    // Sort IPs by total packet count (incoming + outgoing)
    const sortedIPs = [...ipData].sort((a, b) => {
        const aPackets = ipPackets.get(a.ip);
        const bPackets = ipPackets.get(b.ip);
        const aTotal = aPackets.incoming.length + aPackets.outgoing.length;
        const bTotal = bPackets.incoming.length + bPackets.outgoing.length;
        return bTotal - aTotal;
    });
    
    sortedIPs.forEach(ipInfo => {
        const packets = ipPackets.get(ipInfo.ip);
        const incoming = packets.incoming.length;
        const outgoing = packets.outgoing.length;
        const total = incoming + outgoing;
        
        const ipCard = document.createElement('div');
        ipCard.className = 'ip-card';
        ipCard.innerHTML = `
            <h3>${ipInfo.ip}</h3>
            <div class="location-info">
                <div><strong>Location:</strong> ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}</div>
                ${ipInfo.mapUrl ? `<a href="${ipInfo.mapUrl}" target="_blank" class="map-link">📍 View on Map</a>` : ''}
            </div>
            <div class="info-grid">
                <div class="info-item"><strong>Total Packets:</strong> ${total}</div>
                <div class="info-item"><strong>Incoming:</strong> ${incoming}</div>
                <div class="info-item"><strong>Outgoing:</strong> ${outgoing}</div>
                <div class="info-item"><strong>Estimated Data:</strong> ${(total * 1500 / 1024).toFixed(1)} KB</div>
            </div>
            <div class="protocols">
                <strong>Protocols:</strong> ${getProtocolsSummary(packets)}
            </div>
        `;
        
        // Add click handler
        ipCard.addEventListener('click', () => {
            // Highlight in side panel
            ipCards.forEach(c => c.classList.remove('selected'));
            ipCard.classList.add('selected');
            
            // Select on globe
            if (window.selectIPOnGlobe) {
                window.selectIPOnGlobe(ipInfo.ip);
            }
        });
        
        ipDetails.appendChild(ipCard);
    });
    
    // Store reference to all IP cards
    const ipCards = document.querySelectorAll('.ip-card');
};

function getProtocolsSummary(packets) {
    const protocolCounts = {};
    
    // Combine incoming and outgoing packets
    const allPackets = [...packets.incoming, ...packets.outgoing];
    
    allPackets.forEach(packet => {
        protocolCounts[packet.protocol] = (protocolCounts[packet.protocol] || 0) + 1;
    });
    
    return Object.entries(protocolCounts)
        .map(([protocol, count]) => `${protocol} (${count})`)
        .join(', ');
}

// Initialize the side panel when DOM is loaded
document.addEventListener('DOMContentLoaded', initSidePanel);