import { geoApiKey, geoApiEndpoint, fallback } from './config.js';


class PcapngParser {
    constructor() {
        this.blocks = [];
        this.interfaces = [];
        this.packets = [];
        this.onProgress = null;
        this.ipCache = JSON.parse(localStorage.getItem('ipGeolocationCache')) || {};
        this.uniqueIPs = new Set();
        this.ipPackets = new Map();
        this.maxIPsToProcess = Infinity;
        
        // Primary API Configuration (IPGeolocation.io)
        this.geoApiKey = geoApiKey;
        this.geoApiEndpoint = geoApiEndpoint;
        
       
        this.requestDelay = 100; // 100ms delay between requests
    }

    async parse(buffer) {
        const view = new DataView(buffer);
        let offset = 0;
        const totalSize = buffer.byteLength;

        console.log('Starting parse of', totalSize, 'bytes');

        try {
            if (totalSize < 12) {
                throw new Error('File too small to be a valid PCAP-NG file');
            }

            const magic = view.getUint32(0, true);
            if (magic !== 0x0A0D0D0A) {
                throw new Error('Invalid PCAP-NG file - missing magic number');
            }

            let blockCount = 0;
            while (offset < totalSize) {
                if (this.onProgress) {
                    this.onProgress(offset, totalSize, blockCount);
                }

                const block = this.parseBlock(view, offset);
                if (!block) break;
                
                this.blocks.push(block);
                offset += block.totalLength;
                blockCount++;

                if (block.type === 'Interface Description Block') {
                    this.interfaces.push(block);
                }
                else if (block.type === 'Enhanced Packet Block' || block.type === 'Simple Packet Block') {
                    this.packets.push(block);
                    
                    if (block.ipv4 && !block.ipv4.error) {
                        this.trackIPAddresses(block);
                    }
                }

                if (blockCount % 50 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            console.log('Parsed', blockCount, 'blocks');
            console.log('Found', this.uniqueIPs.size, 'unique IP addresses');
            
            await this.fetchLocationsForFirstIPs();
            
        } catch (error) {
            console.error('Parsing error:', error);
            throw new Error(`Parse error at offset ${offset}: ${error.message}`);
        }

        return {
            blocks: this.blocks,
            interfaces: this.interfaces,
            packets: this.packets,
            ipCache: this.ipCache,
            ipPackets: this.ipPackets,
            summary: this.generateSummary()
        };
    }

    trackIPAddresses(packet) {
        const srcIP = packet.ipv4.sourceIP;
        const dstIP = packet.ipv4.destinationIP;
        
        // Initialize storage for new IPs
        if (!this.ipPackets.has(srcIP)) {
            this.ipPackets.set(srcIP, { incoming: [], outgoing: [] });
            this.uniqueIPs.add(srcIP);
        }
        
        if (!this.ipPackets.has(dstIP)) {
            this.ipPackets.set(dstIP, { incoming: [], outgoing: [] });
            this.uniqueIPs.add(dstIP);
        }

        // Add packet to source IP's outgoing
        this.ipPackets.get(srcIP).outgoing.push({
            timestamp: packet.timestamp,
            protocol: packet.ipv4.protocolName,
            destination: dstIP
        });

        // Add packet to destination IP's incoming
        this.ipPackets.get(dstIP).incoming.push({
            timestamp: packet.timestamp,
            protocol: packet.ipv4.protocolName,
            source: srcIP
        });
    }

    async fetchLocationsForFirstIPs() {
        const uniqueIPsArray = Array.from(this.uniqueIPs);
        
        for (let i = 0; i < uniqueIPsArray.length; i++) {
            const ip = uniqueIPsArray[i];
            
            if (this.isSpecialIP(ip)) {
                if (this.isPrivateIP(ip)) {
                    this.ipCache[ip] = { isPrivate: true };
                } else if (this.isMulticastIP(ip)) {
                    this.ipCache[ip] = { isMulticast: true };
                } else {
                    this.ipCache[ip] = { isSpecial: true };
                }
                continue;
            }

            // Skip if we already have valid data for this IP
            if (this.ipCache[ip] && !this.ipCache[ip].error) {
                continue;
            }

            try {
                // Try primary API first
                let locationData = await this.fetchWithPrimaryApi(ip);
                
                // If primary API fails, try fallback
                if (locationData.error) {
                    console.warn(`Primary API failed for ${ip}, trying fallback`);
                    locationData = await this.fetchWithFallback(ip);
                }

                this.ipCache[ip] = locationData;
                
                // Save cache periodically
                if (i % 10 === 0) {
                    this.saveIpCache();
                }
            } catch (error) {
                console.error(`Error fetching location for ${ip}:`, error);
                this.ipCache[ip] = { error: 'Failed to fetch location' };
            }
            
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }
        
        // Final cache save
        this.saveIpCache();
    }

    async fetchWithPrimaryApi(ip) {
        try {
            const url = `${this.geoApiEndpoint}?apiKey=${this.geoApiKey}&ip=${ip}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return { error: errorData.message || `API Error: ${response.status}` };
            }
            
            const data = await response.json();
            return {
                country: data.country_name || 'Unknown',
                city: data.city || 'Unknown',
                region: data.state_prov || 'Unknown',
                isp: data.isp || 'Unknown',
                asn: data.asn || 'Unknown',
                latitude: parseFloat(data.latitude) || 0,
                longitude: parseFloat(data.longitude) || 0,
                mapUrl: data.latitude && data.longitude ? 
                    `https://www.google.com/maps?q=${data.latitude},${data.longitude}` : null
            };
        } catch (error) {
            return { error: 'Primary API failed' };
        }
    }

async fetchWithFallback(ip) {
    try {
        const response = await fetch(`${fallback}${ip}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { error: errorData.message || `Fallback API Error: ${response.status}` };
        }
        
        const data = await response.json();
        
        // Map fallback API response to our expected format
        return {
            country: data.country || 'Unknown',
            city: data.city || 'Unknown',
            region: data.region || 'Unknown',
            isp: data.connection?.isp || 'Unknown',
            asn: data.connection?.autonomous_system_organization || 'Unknown',
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
            mapUrl: data.latitude && data.longitude ? 
                `https://www.google.com/maps?q=${data.latitude},${data.longitude}` : null
        };
    } catch (error) {
        return { error: 'Fallback API failed' };
    }
}

    saveIpCache() {
        try {
            localStorage.setItem('ipGeolocationCache', JSON.stringify(this.ipCache));
        } catch (e) {
            console.warn('Failed to save IP cache to localStorage', e);
        }
    }

    isPrivateIP(ip) {
        const parts = ip.split('.').map(Number);
        return (
            parts[0] === 10 ||                              // 10.0.0.0/8
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||  // 172.16.0.0/12
            (parts[0] === 192 && parts[1] === 168) ||       // 192.168.0.0/16
            parts[0] === 127 ||                             // 127.0.0.0/8 (localhost)
            parts[0] === 0 ||                               // 0.0.0.0
            (parts[0] === 169 && parts[1] === 254)          // 169.254.0.0/16 (link-local)
        );
    }

    isSpecialIP(ip) {
        const parts = ip.split('.').map(Number);
        return (
            this.isPrivateIP(ip) ||
            this.isMulticastIP(ip) ||
            parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127 ||  // 100.64.0.0/10 (Carrier-grade NAT)
            parts[0] === 192 && parts[1] === 0 && parts[2] === 0 ||   // 192.0.0.0/24 (IANA)
            parts[0] === 192 && parts[1] === 0 && parts[2] === 2 ||   // 192.0.2.0/24 (TEST-NET-1)
            parts[0] === 198 && parts[1] === 51 && parts[2] === 100 || // 198.51.100.0/24 (TEST-NET-2)
            parts[0] === 203 && parts[1] === 0 && parts[2] === 113 || // 203.0.113.0/24 (TEST-NET-3)
            parts[0] === 192 && parts[1] === 88 && parts[2] === 99 ||  // 192.88.99.0/24 (6to4 relay anycast)
            parts[0] === 198 && parts[1] === 18 ||                     // 198.18.0.0/15 (benchmarking)
            parts[0] === 224 || parts[0] >= 240                        // Multicast/reserved
        );
    }

    isPublicIP(ip) {
        return !this.isSpecialIP(ip);
    }

    isMulticastIP(ip) {
        const parts = ip.split('.').map(Number);
        return parts[0] >= 224 && parts[0] <= 239;
    }

    parseBlock(view, offset) {
        if (offset + 12 > view.byteLength) return null;

        const blockType = view.getUint32(offset, true);
        const blockLength = view.getUint32(offset + 4, true);

        if (blockLength < 12 || blockLength > 1000000) {
            throw new Error(`Invalid block length: ${blockLength}`);
        }

        if (offset + blockLength > view.byteLength) {
            throw new Error(`Block extends beyond file boundary`);
        }

        const block = {
            offset: offset,
            typeCode: blockType,
            totalLength: blockLength,
            type: this.getBlockTypeName(blockType)
        };

        try {
            switch (blockType) {
                case 0x0A0D0D0A:
                    this.parseSectionHeader(view, offset, block);
                    break;
                case 0x00000001:
                    this.parseInterfaceDescription(view, offset, block);
                    break;
                case 0x00000006:
                    this.parseEnhancedPacket(view, offset, block);
                    break;
                case 0x00000003:
                    this.parseSimplePacket(view, offset, block);
                    break;
                default:
                    block.rawData = this.extractRawData(view, offset + 8, Math.min(blockLength - 12, 100));
                    break;
            }
        } catch (error) {
            console.warn('Error parsing block:', error);
            block.parseError = error.message;
        }

        return block;
    }

    getBlockTypeName(type) {
        const types = {
            0x0A0D0D0A: 'Section Header Block',
            0x00000001: 'Interface Description Block',
            0x00000006: 'Enhanced Packet Block',
            0x00000003: 'Simple Packet Block',
            0x00000005: 'Interface Statistics Block',
            0x00000004: 'Name Resolution Block'
        };
        return types[type] || `Unknown Block (0x${type.toString(16).padStart(8, '0')})`;
    }

    parseSectionHeader(view, offset, block) {
        const magic = view.getUint32(offset + 8, true);
        block.byteOrder = magic === 0x1A2B3C4D ? 'Little Endian' : 'Big Endian';
        block.majorVersion = view.getUint16(offset + 12, true);
        block.minorVersion = view.getUint16(offset + 14, true);
        block.sectionLength = view.getUint32(offset + 16, true);
    }

    parseInterfaceDescription(view, offset, block) {
        block.linkType = view.getUint16(offset + 8, true);
        block.linkTypeName = this.getLinkTypeName(block.linkType);
        block.snapLen = view.getUint32(offset + 12, true);
    }

    parseEnhancedPacket(view, offset, block) {
        block.interfaceId = view.getUint32(offset + 8, true);
        block.timestampHigh = view.getUint32(offset + 12, true);
        block.timestampLow = view.getUint32(offset + 16, true);
        block.capturedLength = view.getUint32(offset + 20, true);
        block.originalLength = view.getUint32(offset + 24, true);
        
        const timestamp = (BigInt(block.timestampHigh) << 32n) | BigInt(block.timestampLow);
        block.timestamp = new Date(Number(timestamp / 1000n));
        
        if (block.capturedLength >= 14) {
            block.ethernet = this.parseEthernet(view, offset + 28);
            
            if (block.ethernet && block.ethernet.etherType === 0x0800) {
                block.ipv4 = this.parseIPv4(view, offset + 28 + 14);
            }
        }
    }

    parseSimplePacket(view, offset, block) {
        block.originalLength = view.getUint32(offset + 8, true);
        
        if (block.originalLength >= 14) {
            block.ethernet = this.parseEthernet(view, offset + 12);
            
            if (block.ethernet && block.ethernet.etherType === 0x0800) {
                block.ipv4 = this.parseIPv4(view, offset + 12 + 14);
            }
        }
    }

    parseEthernet(view, offset) {
        try {
            const etherType = view.getUint16(offset + 12, false);
            return {
                etherType: etherType,
                etherTypeName: this.getEtherTypeName(etherType)
            };
        } catch (error) {
            return { error: 'Failed to parse Ethernet header' };
        }
    }

    parseIPv4(view, offset) {
        try {
            if (offset + 20 > view.byteLength) {
                return { error: 'Not enough data for IPv4 header' };
            }

            const versionAndIHL = view.getUint8(offset);
            const version = (versionAndIHL >> 4) & 0xF;
            
            if (version !== 4) {
                return { error: `Invalid IP version: ${version}` };
            }

            const protocol = view.getUint8(offset + 9);
            
            const srcIP = [
                view.getUint8(offset + 12),
                view.getUint8(offset + 13),
                view.getUint8(offset + 14),
                view.getUint8(offset + 15)
            ].join('.');
            
            const dstIP = [
                view.getUint8(offset + 16),
                view.getUint8(offset + 17),
                view.getUint8(offset + 18),
                view.getUint8(offset + 19)
            ].join('.');

            return {
                version: version,
                protocol: protocol,
                protocolName: this.getProtocolName(protocol),
                sourceIP: srcIP,
                destinationIP: dstIP
            };
        } catch (error) {
            return { error: 'Failed to parse IPv4 header: ' + error.message };
        }
    }

    getProtocolName(protocol) {
        const protocols = {
            1: 'ICMP',
            6: 'TCP',
            17: 'UDP',
            2: 'IGMP',
            4: 'IP-in-IP',
            41: 'IPv6',
            47: 'GRE',
            50: 'ESP',
            51: 'AH',
            89: 'OSPF'
        };
        return protocols[protocol] || `Unknown (${protocol})`;
    }

    extractRawData(view, offset, length) {
        return new Uint8Array(view.buffer, offset, length);
    }

    getLinkTypeName(type) {
        const types = {
            1: 'Ethernet',
            6: 'IEEE 802.5 Token Ring',
            105: 'IEEE 802.11 Wireless',
            127: 'IEEE 802.11 Radiotap'
        };
        return types[type] || `Unknown (${type})`;
    }

    getEtherTypeName(type) {
        const types = {
            0x0800: 'IPv4',
            0x0806: 'ARP',
            0x86DD: 'IPv6',
            0x8100: '802.1Q VLAN'
        };
        return types[type] || `Unknown (0x${type.toString(16)})`;
    }

    generateSummary() {
        const blockCounts = {};
        this.blocks.forEach(block => {
            blockCounts[block.type] = (blockCounts[block.type] || 0) + 1;
        });

        return {
            totalBlocks: this.blocks.length,
            totalPackets: this.packets.length,
            totalInterfaces: this.interfaces.length,
            uniqueIPs: this.uniqueIPs.size,
            blockCounts: blockCounts,
            fileSize: this.blocks.reduce((sum, block) => sum + block.totalLength, 0)
        };
    }
}

export default PcapngParser;