async function parsePCAPNG(file) {
    try {
        const buffer = await file.arrayBuffer();
        const pcap = pcapParse(buffer);
        const ips = new Set();

        // Process each packet
        pcap.packets.forEach(packet => {
            // Extract source and destination IPs (IPv4)
            if (packet.payload && packet.payload.ethertype === 0x0800) { // IPv4
                const srcIp = packet.payload.saddr;
                const dstIp = packet.payload.daddr;
                
                if (!isPrivateIP(srcIp)) ips.add(srcIp);
                if (!isPrivateIP(dstIp)) ips.add(dstIp);
            }
        });

        return Array.from(ips);
    } catch (error) {
        console.error('PCAP parse error:', error);
        // Fallback to text parsing if needed
        return await fallbackTextParse(file);
    }
}

async function fallbackTextParse(file) {
    // Keep your original text parsing as fallback
    const ips = new Set();
    const text = await file.text();
    const ipPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
    const matches = text.match(ipPattern) || [];
    
    matches.forEach(ip => {
        if (!isPrivateIP(ip)) ips.add(ip);
    });
    
    return Array.from(ips);
}

function isPrivateIP(ip) {
    const parts = ip.split('.').map(Number);
    return (
        parts[0] === 10 || // 10.0.0.0/8
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
        (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16
        parts[0] === 127 || // Loopback
        parts[0] === 0 || // Invalid
        parts[0] >= 224 // Multicast
    );
}