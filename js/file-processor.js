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
        
        AppState.currentLocations = locations;
        
        // Update UI
        updateStats(locations);
        updateConnectionList(locations);
        
        // Show results
        document.getElementById('stats').style.display = 'grid';
        document.getElementById('connectionList').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        
        showStatus(`Successfully processed ${locations.length} IP addresses`, 'success');
        
    } catch (error) {
        console.error('Error processing file:', error);
        showStatus('Error processing file: ' + error.message, 'error');
        document.getElementById('loading').style.display = 'none';
    }
    
    // In file-processor.js, modify processFile():
const ips = await parsePCAPNG(file);
console.log("Raw IPs found:", ips); // Debug log

if (ips.length === 0) {
    // Before showing error, try to inspect the file
    const filePreview = await file.text();
    console.log("File preview:", filePreview.substring(0, 1000));
}
}