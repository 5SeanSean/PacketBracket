// pcap-parser.js - Complete implementation with Microsoft PCAPNG support

// Supported file signatures
const FILE_SIGNATURES = {
  PCAPNG: {
    STANDARD: [
      0x1A2B3C4D,  // Standard PCAPNG little-endian
      0x4D3C2B1A   // Standard PCAPNG big-endian
    ],
    MICROSOFT: 0x0A0D0D0A  // Microsoft variant
  },
  PCAP: {
    STANDARD: [
      0xA1B2C3D4,  // Standard PCAP little-endian
      0xD4C3B2A1   // Standard PCAP big-endian
    ]
  }
};

// Block types in PCAPNG files
const BLOCK_TYPES = {
  SECTION_HEADER: 0x0A0D0D0A,
  INTERFACE_DESC: 0x00000001,
  ENHANCED_PACKET: 0x00000006
};

/**
 * Main function to parse PCAPNG files
 * @param {File} file - The PCAPNG file to parse
 * @returns {Promise<Array<string>>} - Array of unique IP addresses found
 */
async function parsePCAPNG(file) {
    try {
        console.log('Starting PCAPNG file analysis...');
        const buffer = await file.arrayBuffer();
        const header = new DataView(buffer, 0, 4);
        const magic = header.getUint32(0, false); // Read as big-endian
        
        // Check for supported formats
        if (FILE_SIGNATURES.PCAPNG.STANDARD.includes(magic)) {
            console.log('Detected standard PCAPNG format');
            return parseStandardPcapNg(buffer);
        }
        else if (magic === FILE_SIGNATURES.PCAPNG.MICROSOFT) {
            console.log('Detected Microsoft variant PCAPNG format');
            return parseMicrosoftPcapNg(buffer);
        }
        else if (FILE_SIGNATURES.PCAP.STANDARD.includes(magic)) {
            throw new Error('PCAP format detected. Please convert to PCAPNG using Wireshark.');
        }
        else {
            throw new Error(`Unsupported file format. Magic number: 0x${magic.toString(16).padStart(8, '0')}`);
        }
    } catch (error) {
        console.error('File parsing failed:', error);
        throw error;
    }
}

/**
 * Parse standard PCAPNG files
 * @param {ArrayBuffer} buffer - The file data
 * @returns {Array<string>} - Array of unique IP addresses
 */
function parseStandardPcapNg(buffer) {
    const ips = new Set();
    const dataView = new DataView(buffer);
    let position = 0;

    while (position < buffer.byteLength) {
        const blockType = dataView.getUint32(position, true);
        const blockLength = dataView.getUint32(position + 4, true);

        // Process Enhanced Packet Block
        if (blockType === BLOCK_TYPES.ENHANCED_PACKET) {
            const packetDataOffset = position + 8;
            extractIpsFromPacket(dataView, packetDataOffset, ips);
        }

        // Move to next block
        position += blockLength;
        
        // Verify block total length matches
        const blockEndLength = dataView.getUint32(position - 4, true);
        if (blockLength !== blockEndLength) {
            console.warn(`Block length mismatch at position ${position}`);
        }
    }

    return Array.from(ips);
}

/**
 * Parse Microsoft variant PCAPNG files
 * @param {ArrayBuffer} buffer - The file data
 * @returns {Array<string>} - Array of unique IP addresses
 */
function parseMicrosoftPcapNg(buffer) {
    const ips = new Set();
    const dataView = new DataView(buffer);
    
    // Microsoft PCAPNG has a 24-byte header
    let position = 24;
    
    while (position < buffer.byteLength) {
        const blockType = dataView.getUint32(position, true);
        const blockLength = dataView.getUint32(position + 4, true);
        
        // Process Enhanced Packet Block (0x00000006)
        if (blockType === BLOCK_TYPES.ENHANCED_PACKET) {
            const packetDataOffset = position + 8;
            extractIpsFromPacket(dataView, packetDataOffset, ips);
        }
        
        position += blockLength;
    }
    
    return Array.from(ips);
}

/**
 * Extract IP addresses from a packet block
 * @param {DataView} dataView - The DataView for the file
 * @param {number} offset - Offset to the packet data
 * @param {Set<string>} ips - Set to store found IPs
 */
function extractIpsFromPacket(dataView, offset, ips) {
    try {
        // Skip Ethernet header (14 bytes)
        const etherType = dataView.getUint16(offset + 12, false);
        offset += 14;
        
        // Handle IPv4
        if (etherType === 0x0800) {
            const version = dataView.getUint8(offset) >> 4;
            if (version === 4) {
                const srcIp = extractIPv4(dataView, offset + 12);
                const dstIp = extractIPv4(dataView, offset + 16);
                if (!isPrivateIP(srcIp)) ips.add(srcIp);
                if (!isPrivateIP(dstIp)) ips.add(dstIp);
            }
        }
        // Handle IPv6
        else if (etherType === 0x86DD) {
            const version = dataView.getUint8(offset) >> 4;
            if (version === 6) {
                const srcIp = extractIPv6(dataView, offset + 8);
                const dstIp = extractIPv6(dataView, offset + 24);
                if (!isPrivateIP(srcIp)) ips.add(srcIp);
                if (!isPrivateIP(dstIp)) ips.add(dstIp);
            }
        }
    } catch (e) {
        console.warn('Error extracting IPs from packet:', e);
    }
}

/**
 * Extract IPv4 address from buffer
 * @param {DataView} dataView - The DataView for the file
 * @param {number} offset - Offset to the IPv4 address
 * @returns {string} - The IPv4 address as a string
 */
function extractIPv4(dataView, offset) {
    return [
        dataView.getUint8(offset),
        dataView.getUint8(offset + 1),
        dataView.getUint8(offset + 2),
        dataView.getUint8(offset + 3)
    ].join('.');
}

/**
 * Extract IPv6 address from buffer
 * @param {DataView} dataView - The DataView for the file
 * @param {number} offset - Offset to the IPv6 address
 * @returns {string} - The IPv6 address as a string
 */
function extractIPv6(dataView, offset) {
    const parts = [];
    for (let i = 0; i < 16; i += 2) {
        parts.push(dataView.getUint16(offset + i, false).toString(16).padStart(4, '0'));
    }
    // Compress the address (replace consecutive zeros with ::)
    return parts.join(':')
        .replace(/(^|:)0(:0)+:/, '::')
        .replace(/:{3,}/, '::');
}

/**
 * Check if an IP address is private
 * @param {string} ip - The IP address to check
 * @returns {boolean} - True if the IP is private
 */
function isPrivateIP(ip) {
    if (ip.includes(':')) {
        // IPv6 private ranges
        return ip.startsWith('fc') || ip.startsWith('fd') || ip === '::1';
    } else {
        // IPv4 private ranges
        const parts = ip.split('.').map(Number);
        return (
            parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            parts[0] === 127 ||
            parts[0] === 0
        );
    }
}

export default parsePCAPNG;