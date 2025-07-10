// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
}

// Update statistics
function updateStats(locations) {
    const uniqueCountries = new Set();
    const uniqueCities = new Set();
    
    locations.forEach(loc => {
        if (loc.country !== 'Unknown') uniqueCountries.add(loc.country);
        if (loc.city !== 'Unknown') uniqueCities.add(`${loc.city}, ${loc.country}`);
    });
    
    document.getElementById('totalConnections').textContent = locations.length;
    document.getElementById('uniqueIPs').textContent = locations.length;
    document.getElementById('countries').textContent = uniqueCountries.size;
    document.getElementById('cities').textContent = uniqueCities.size;
}

// Update connection list
function updateConnectionList(locations) {
    const connectionsDiv = document.getElementById('connections');
    connectionsDiv.innerHTML = '';
    
    locations.forEach(location => {
        const item = document.createElement('div');
        item.className = 'connection-item';
        item.innerHTML = `
            <div>
                <div class="connection-ip">${location.ip}</div>
                <div class="connection-location">${location.city}, ${location.region}, ${location.country}</div>
            </div>
            <div class="connection-distance">${userLocation ? 
                Math.round(calculateDistance(
                    userLocation.latitude, 
                    userLocation.longitude,
                    location.latitude,
                    location.longitude
                )) + ' km' : ''}</div>
        `;
        connectionsDiv.appendChild(item);
    });
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}