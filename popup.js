// Popup functionality with improved error handling
document.addEventListener('DOMContentLoaded', function() {
    const scanBtn = document.getElementById('scan-btn');
    const settingsBtn = document.getElementById('settings-btn');

    // Check if we're on an Outlook page
    function isOutlookPage(url) {
        return url && (
            url.includes('outlook.live.com') || 
            url.includes('outlook.office.com') || 
            url.includes('outlook.office365.com')
        );
    }

    // Send message with proper error handling
    function sendMessageToContentScript(tabId, message, callback) {
        try {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError.message);
                    callback({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    callback(response || { success: false, error: 'No response received' });
                }
            });
        } catch (error) {
            console.error('Error sending message:', error);
            callback({ success: false, error: error.message });
        }
    }

    // Reset scan button state
    function resetScanButton() {
        scanBtn.textContent = 'Scan Now';
        scanBtn.disabled = false;
    }

    // Show user-friendly error messages
    function showError(message) {
        console.error(message);
        // You could replace this with a better UI notification
        alert(message);
    }

    // Scan button event listener
    scanBtn.addEventListener('click', () => {
        scanBtn.textContent = 'Scanning...';
        scanBtn.disabled = true;
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) {
                showError('No active tab found');
                resetScanButton();
                return;
            }

            const tab = tabs[0];
            
            // Check if we're on an Outlook page
            if (!isOutlookPage(tab.url)) {
                showError('Please navigate to Outlook to use this extension.\n\nSupported sites:\n• outlook.live.com\n• outlook.office.com\n• outlook.office365.com');
                resetScanButton();
                return;
            }

            // Send scan message
            sendMessageToContentScript(tab.id, {action: 'scan'}, (response) => {
                if (response.success) {
                    console.log('Scan completed successfully');
                    // Update stats after scan with a slight delay
                    setTimeout(updateStats, 1500);
                } else {
                    const errorMsg = response.error || 'Unknown error occurred';
                    if (errorMsg.includes('Could not establish connection')) {
                        showError('Extension not loaded on this page.\n\nPlease:\n1. Refresh the Outlook page\n2. Wait for it to fully load\n3. Try scanning again');
                    } else {
                        showError(`Scan failed: ${errorMsg}\n\nTry refreshing the page and scanning again.`);
                    }
                }
                resetScanButton();
            });
        });
    });

    // Settings button event listener
    settingsBtn.addEventListener('click', () => {
        const settingsMsg = `UnHooked - Outlook Phishing Scanner Settings

How it works:
• Extension automatically scans emails when you load Outlook
• Click "Scan Now" to force a rescan of current emails
• Risk scores appear next to email senders/subjects

Risk Levels:
• High (70-100%) - Likely phishing, avoid clicking
• Medium (40-69%) - Suspicious, be cautious
• Low (20-39%) - Some suspicious indicators
• Safe (0-19%) - No significant red flags

Tips:
• Click any score badge for detailed analysis
• Extension works best on fully loaded Outlook pages
• Refresh page if scanner seems unresponsive

Supported Outlook versions:
• outlook.live.com
• outlook.office.com
• outlook.office365.com`;

        alert(settingsMsg);
    });

    // Update stats from content script
    function updateStats() {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) {
                console.log('No active tab for stats update');
                return;
            }

            const tab = tabs[0];
            
            if (!isOutlookPage(tab.url)) {
                // Reset stats if not on Outlook
                setDefaultStats();
                return;
            }

            sendMessageToContentScript(tab.id, {action: 'getStats'}, (response) => {
                if (response.success && response.stats) {
                    const stats = response.stats;
                    updateStatsDisplay(stats);
                } else {
                    console.log('Could not get stats:', response.error || 'Unknown error');
                    // Don't show error to user for stats, just log it
                }
            });
        });
    }

    // Update the stats display
    function updateStatsDisplay(stats) {
        try {
            document.getElementById('scanned-count').textContent = stats.scanned || 0;
            document.getElementById('high-risk').textContent = stats.high || 0;
            document.getElementById('medium-risk').textContent = stats.medium || 0;
            document.getElementById('low-risk').textContent = stats.low || 0;
            document.getElementById('safe-count').textContent = stats.safe || 0;
        } catch (error) {
            console.error('Error updating stats display:', error);
        }
    }

    // Set default stats
    function setDefaultStats() {
        const defaultStats = {
            scanned: 0,
            high: 0,
            medium: 0,
            low: 0,
            safe: 0
        };
        updateStatsDisplay(defaultStats);
    }

    // Initialize stats on popup open
    updateStats();
    
    // Update stats periodically (every 5 seconds)
    setInterval(updateStats, 5000);

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(() => {
        setTimeout(updateStats, 500);
    });

    // Listen for tab URL changes
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
            setTimeout(updateStats, 1000);
        }
    });
});