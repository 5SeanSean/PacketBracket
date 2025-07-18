import PcapngParser from './pcapng-parser.js';
// File handling with progress

const results = document.getElementById('results');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Create globe container - moved to DOMContentLoaded event
let globeContainer;

const sidePanelScript = document.createElement('script');
sidePanelScript.src = 'side-panel.js';
document.head.appendChild(sidePanelScript);



document.addEventListener('DOMContentLoaded', function() {
    
    //nothing for now, i might use this later
});



// Wait for DOM to be fully loaded before creating elements
// Remove these lines from app.js (they're now in side-panel.js)
// const uploadArea = document.getElementById('uploadArea');
// const fileInput = document.getElementById('fileInput');

// Update the event listeners to use the side panel elements
document.addEventListener('DOMContentLoaded', function() {
    const globeContainer = document.getElementById('globe');
    
    globeContainer.style.height = '100vh'; // Full viewport height
    globeContainer.style.width = globeContainer.style.height; // Make it square
    globeContainer.style.position = 'relative';
    globeContainer.style.overflow = 'hidden'; // Hide overflow
    
    
    // Move progress container to be centered in globe
    const progressContainer = document.getElementById('progressContainer');
    progressContainer.style.position = 'absolute';
    progressContainer.style.top = '50%';
    progressContainer.style.left = '50%';
    progressContainer.style.transform = 'translate(-50%, -50%)';
    progressContainer.style.zIndex = '100';

    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    // Add event listeners for file upload
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
});


const threeScript = document.createElement('script');
threeScript.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js';
document.head.appendChild(threeScript);

// Load both globe scripts after Three.js is loaded
threeScript.onload = () => {
    // Load 3D globe first
    const globeScript = document.createElement('script');
    globeScript.src = 'globe.js';
    document.head.appendChild(globeScript);
    
    // Then load 2D globe
    const globe2DScript = document.createElement('script');
    globe2DScript.src = '2d-globe.js';
    document.head.appendChild(globe2DScript);
};




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
    const fileSummary = document.getElementById('fileSummary');
    
    let html = `
        <div class="summary">
            <h2>File Summary</h2>
            <div class="info-grid">
                <div><strong>File:</strong> ${file.name}</div>
                <div><strong>Size:</strong> ${(file.size / 1024).toFixed(1)} KB</div>
                <div><strong>Total Packets:</strong> ${summary.totalPackets}</div>
                <div><strong>IPv4 Packets:</strong> ${result.packets.filter(p => p.ipv4 && !p.ipv4.error).length}</div>
                <div><strong>Unique IPs Found:</strong> ${summary.uniqueIPs}</div>
            </div>
        </div>
    `;

    if (summary.uniqueIPs === 0) {
        html += `<div class="error">No IPv4 packets found in this capture</div>`;
    }

    fileSummary.innerHTML = html;
    
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
        window.displayIPDetails(ipData, result.ipPackets, file, {
            totalPackets: summary.totalPackets,
            ipv4Packets: result.packets.filter(p => p.ipv4 && !p.ipv4.error).length,
            uniqueIPs: summary.uniqueIPs
        });
    }
    
    // Set IP data in viewport manager
    if (window.viewportManager) {
        window.viewportManager.setIPData(ipData);
    }
    
    if (ipData.length === 0) {
        results.innerHTML += `<div class="error">No public IP addresses with geolocation data found</div>`;
    }
}
