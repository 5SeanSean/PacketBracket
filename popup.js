// Popup functionality
document.addEventListener('DOMContentLoaded', function() {
    const scanBtn = document.getElementById('scan-btn');
    const settingsBtn = document.getElementById('settings-btn');

    scanBtn.addEventListener('click', () => {
        scanBtn.textContent = 'Scanning...';
        scanBtn.disabled = true;
        
        // Trigger scan in content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const tab = tabs[0];
            
            // Check if we're on an Outlook page
            if (!tab.url.includes('outlook')) {
                alert('Please navigate to Outlook to use this extension.');
                resetScanButton();
                return;
            }

            chrome.tabs.sendMessage(tab.id, {action: 'scan'}, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    alert('Error communicating with Outlook. Please refresh the page and try again.');
                } else if (response && response.success) {
                    console.log('Scan completed successfully');
                    // Update stats after scan
                    setTimeout(updateStats, 1000);
                } else {
                    console.error('Scan failed:', response ? response.message : 'Unknown error');
                    alert('Scan failed. Please refresh the Outlook page and try again.');
                }
                resetScanButton();
            });
        });
    });

    settingsBtn.addEventListener('click', () => {
        alert('Settings:\n\n• Extension scans automatically when you load Outlook\n• Click "Scan Now" to force a rescan\n• Risk levels: High (70-100%), Medium (40-69%), Low (20-39%), Safe (0-19%)\n• Click any score badge for detailed analysis\n\nFor advanced settings, modify the extension files.');
    });

    function resetScanButton() {
        scanBtn.textContent = 'Scan Now';
        scanBtn.disabled = false;
    }

    // Update stats from content script
    function updateStats() {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const tab = tabs[0];
            
            if (!tab.url.includes('outlook')) {
                // Set default values if not on Outlook
                return;
            }

            chrome.tabs.sendMessage(tab.id, {action: 'getStats'}, (response) => {
                if (response && response.success) {
                    const stats = response.stats;
                    document.getElementById('scanned-count').textContent = stats.scanned;
                    document.getElementById('high-risk').textContent = stats.high;
                    document.getElementById('medium-risk').textContent = stats.medium;
                    document.getElementById('low-risk').textContent = stats.low;
                    document.getElementById('safe-count').textContent = stats.safe;
                } else {
                    console.log('Could not get stats:', response ? response.message : 'Unknown error');
                }
            });
        });
    }

    // Initialize stats
    updateStats();
    
    // Update stats every few seconds
    setInterval(updateStats, 3000);
});