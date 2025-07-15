// side-panel.js - Handles the side panel display of IP details

// Initialize the side panel
function initSidePanel() {
    const sidePanel = document.createElement('div');
    sidePanel.className = 'side-panel';
    sidePanel.id = 'sidePanel';
    sidePanel.innerHTML = `
        <h2>IP Address Details</h2>
        <div id="ipDetails"></div>
    `;
    
    // Insert the side panel into the container
    const container = document.querySelector('.container');
    if (container) {
        container.appendChild(sidePanel);
    }
}

// Display IP details in the side panel
function displayIPDetails(ipData, ipPackets) {
    const ipDetails = document.getElementById('ipDetails');
    if (!ipDetails) return;
    
    ipDetails.innerHTML = '';
    
    // Sort IPs by packet count (descending)
    const sortedIPs = [...ipData].sort((a, b) => {
        const aCount = ipPackets.get(a.ip).length;
        const bCount = ipPackets.get(b.ip).length;
        return bCount - aCount;
    });
    
    sortedIPs.forEach(ipInfo => {
        const packets = ipPackets.get(ipInfo.ip);
        const incoming = packets.filter(p => p.destination === ipInfo.ip).length;
        const outgoing = packets.filter(p => p.source === ipInfo.ip).length;
        
        // Calculate total data size (approximate)
        const totalSize = packets.length * 1500; // Average packet size estimate
        
        const ipCard = document.createElement('div');
        ipCard.className = 'ip-card';
        ipCard.innerHTML = `
            <h3>${ipInfo.ip}</h3>
            <div class="location-info">
                <div><strong>Location:</strong> ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}</div>
                ${ipInfo.mapUrl ? `<a href="${ipInfo.mapUrl}" target="_blank" class="map-link">📍 View on Map</a>` : ''}
            </div>
            <div class="info-grid">
                <div class="info-item"><strong>Total Packets:</strong> ${packets.length}</div>
                <div class="info-item"><strong>Incoming:</strong> ${incoming}</div>
                <div class="info-item"><strong>Outgoing:</strong> ${outgoing}</div>
                <div class="info-item"><strong>Estimated Data:</strong> ${(totalSize / 1024).toFixed(1)} KB</div>
            </div>
            <div class="protocols">
                <strong>Protocols:</strong> ${getProtocolsSummary(packets)}
            </div>
        `;
        
        ipDetails.appendChild(ipCard);
    });
}

// Helper function to summarize protocols
function getProtocolsSummary(packets) {
    const protocolCounts = {};
    packets.forEach(packet => {
        protocolCounts[packet.protocol] = (protocolCounts[packet.protocol] || 0) + 1;
    });
    
    return Object.entries(protocolCounts)
        .map(([protocol, count]) => `${protocol} (${count})`)
        .join(', ');
}

// Initialize the side panel when DOM is loaded
document.addEventListener('DOMContentLoaded', initSidePanel);