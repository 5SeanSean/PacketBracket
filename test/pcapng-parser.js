class PcapngParser {
    constructor() {
        this.blocks = [];
        this.interfaces = [];
        this.packets = [];
        this.onProgress = null;
        this.ipCache = {};
        this.uniqueIPs = new Set();
        this.ipPackets = new Map();
        this.maxIPsToProcess = 20;
        
        // IPGeolocation.io API Configuration
        this.geoApiKey = "4426928c7b9c425ea7e026d04c969e43";
        this.geoApiEndpoint = "https://api.ipgeolocation.io/ipgeo";
        this.requestDelay = 1000; // 1 second delay between requests
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
            while (offset < totalSize && this.uniqueIPs.size < this.maxIPsToProcess) {
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
        if (this.uniqueIPs.size >= this.maxIPsToProcess) return;

        const srcIP = packet.ipv4.sourceIP;
        const dstIP = packet.ipv4.destinationIP;
        
        let addedNewIP = false;
        if (!this.uniqueIPs.has(srcIP) && this.uniqueIPs.size < this.maxIPsToProcess) {
            this.uniqueIPs.add(srcIP);
            this.ipPackets.set(srcIP, []);
            addedNewIP = true;
        }
        
        if (!this.uniqueIPs.has(dstIP) && this.uniqueIPs.size < this.maxIPsToProcess) {
            this.uniqueIPs.add(dstIP);
            this.ipPackets.set(dstIP, []);
            addedNewIP = true;
        }

        if (addedNewIP && this.uniqueIPs.size >= this.maxIPsToProcess) {
            return;
        }

        if (this.ipPackets.has(srcIP)) {
            this.ipPackets.get(srcIP).push({
                timestamp: packet.timestamp,
                protocol: packet.ipv4.protocolName,
                destination: dstIP
            });
        }

        if (this.ipPackets.has(dstIP)) {
            this.ipPackets.get(dstIP).push({
                timestamp: packet.timestamp,
                protocol: packet.ipv4.protocolName,
                source: srcIP
            });
        }
    }

    async fetchLocationsForFirstIPs() {
        const uniqueIPsArray = Array.from(this.uniqueIPs).slice(0, this.maxIPsToProcess);
        
        for (let i = 0; i < uniqueIPsArray.length; i++) {
            const ip = uniqueIPsArray[i];
            
            if (this.isPrivateIP(ip)) {
                this.ipCache[ip] = { isPrivate: true };
                continue;
            }
            
            if (this.isMulticastIP(ip)) {
                this.ipCache[ip] = { isMulticast: true };
                continue;
            }

            try {
                progressText.textContent = `Fetching location for IP ${i+1} of ${uniqueIPsArray.length}: ${ip}`;
                
                const response = await fetch(`${this.geoApiEndpoint}?apiKey=${this.geoApiKey}&ip=${ip}`);
                
                if (response.ok) {
                    const data = await response.json();
                    this.ipCache[ip] = {
                        country: data.country_name || 'Unknown',
                        city: data.city || 'Unknown',
                        region: data.state_prov || 'Unknown',
                        isp: data.isp || 'Unknown',
                        asn: data.asn || 'Unknown',
                        mapUrl: data.latitude && data.longitude ? 
                            `https://www.google.com/maps?q=${data.latitude},${data.longitude}` : null
                    };
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('API Error:', errorData);
                    this.ipCache[ip] = { 
                        error: errorData.message || `API Error: ${response.status} ${response.statusText}`
                    };
                }
            } catch (error) {
                console.error(`Error fetching location for IP ${ip}:`, error);
                this.ipCache[ip] = { error: 'Failed to fetch location' };
            }
            
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }
    }

    isPrivateIP(ip) {
        const parts = ip.split('.').map(Number);
        return (
            parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            parts[0] === 127 ||
            parts[0] === 0
        );
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