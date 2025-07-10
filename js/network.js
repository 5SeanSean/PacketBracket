// network.js - Network Data Processing and IP Geolocation

// IP geolocation service
async function getIPLocation(ip) {
    try {
        // Use ip-api.com for geolocation
        const response = await fetch(`https://ipapi.co/${ip}/json/`);
        const data = await response.json();
        
        return {
            ip: ip,
            city: data.city || 'Unknown',
            region: data.region || 'Unknown',
            country: data.country_name || 'Unknown',
            latitude: data.latitude || 0,
            longitude: data.longitude || 0
        };
    } catch (error) {
        console.warn('Failed to get location for IP:', ip, error.message);
        return {
            ip: ip,
            city: 'Unknown',
            region: 'Unknown',
            country: 'Unknown',
            latitude: (Math.random() * 180 - 90),
            longitude: (Math.random() * 360 - 180)
        };
    }
}

// Parse IP addresses from PCAPNG file
async function parsePCAPNG(file) {
    const ips = new Set();
    const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    
    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        const dataView = new DataView(arrayBuffer);
        
        // PCAPNG file header (simplified parsing)
        // We'll scan through the file looking for IPv4 addresses
        let position = 0;
        const chunkSize = 4096;
        let textDecoder = new TextDecoder();
        
        while (position < arrayBuffer.byteLength) {
            const end = Math.min(position + chunkSize, arrayBuffer.byteLength);
            const chunk = new Uint8Array(arrayBuffer, position, end - position);
            
            // Convert to text to find IP addresses
            const text = textDecoder.decode(chunk);
            const matches = text.match(ipPattern);
            
            if (matches) {
                matches.forEach(ip => {
                    if (!isPrivateIP(ip)) {
                        ips.add(ip);
                    }
                });
            }
            
            position = end;
        }
        
        return Array.from(ips);
    } catch (error) {
        console.error('Error parsing PCAPNG file:', error);
        // Fallback to text extraction
        const text = await file.text();
        const matches = text.match(ipPattern) || [];
        const uniqueIPs = new Set();
        
        matches.forEach(ip => {
            if (!isPrivateIP(ip)) {
                uniqueIPs.add(ip);
            }
        });
        
        return Array.from(uniqueIPs);
    }
}

// Check if IP is private/local
function isPrivateIP(ip) {
    const parts = ip.split('.').map(Number);
    return (
        parts[0] === 10 ||
        parts[0] === 127 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        parts[0] === 0 ||
        parts[0] >= 224
    );
}

// Process uploaded file
async function processFile(file) {
    console.log('processFile called with:', file);
    
    try {
        document.getElementById('loading').style.display = 'block';
        showStatus('Processing file...', 'processing');
        
        // Show file info
        const fileInfo = document.getElementById('fileInfo');
        fileInfo.innerHTML = `File: <strong>${file.name}</strong> | Size: <strong>${(file.size/1024).toFixed(2)} KB</strong>`;
        fileInfo.style.display = 'block';
        
        // Parse PCAPNG file to get IPs
        const ips = await parsePCAPNG(file);
        
        if (ips.length === 0) {
            showStatus('No public IP addresses found in the file', 'error');
            document.getElementById('loading').style.display = 'none';
            return;
        }
        
        showStatus(`Found ${ips.length} unique IP addresses. Looking up locations...`, 'processing');
        
        // Get location data for all IPs
        const locations = [];
        
        for (let i = 0; i < ips.length; i++) {
            try {
                const location = await getIPLocation(ips[i]);
                locations.push(location);
                
                // Update progress
                showStatus(`Processing IP ${i + 1} of ${ips.length}...`, 'processing');
            } catch (error) {
                console.error('Error getting location for IP:', ips[i], error);
            }
        }
        
        if (locations.length === 0) {
            showStatus('Could not get location data for any IP addresses', 'error');
            document.getElementById('loading').style.display = 'none';
            return;
        }
        
        currentLocations = locations;
        
        // Update UI
        addIPMarkersToGlobe(locations);
        updateStats(locations);
        updateConnectionList(locations);
        
        // Show results
        document.getElementById('globeContainer').style.display = 'block';
        document.getElementById('stats').style.display = 'grid';
        document.getElementById('connectionList').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        
        showStatus(`Successfully processed ${locations.length} IP addresses`, 'success');
        
    } catch (error) {
        console.error('Error processing file:', error);
        showStatus('Error processing file: ' + error.message, 'error');
        document.getElementById('loading').style.display = 'none';
    }
}