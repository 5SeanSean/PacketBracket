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