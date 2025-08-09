// src/pcapng-parser.js

// Define threat levels locally to avoid import issues
const THREAT_LEVELS = {
  SAFE: { level: 0, color: "#00ff41", name: "Safe" },
  LOW: { level: 1, color: "#7fff00", name: "Low Risk" },
  MEDIUM: { level: 2, color: "#ffff00", name: "Medium Risk" },
  HIGH: { level: 3, color: "#ff8c00", name: "High Risk" },
  CRITICAL: { level: 4, color: "#ff0000", name: "Critical" },
}

// Abstract API Configuration
const abstractApiKey = "982c9b2770424f8280607bdd18fbd1cc"
const abstractApiEndpoint = "https://ip-intelligence.abstractapi.com/v1/"

class PcapngParser {
  constructor() {
    this.blocks = []
    this.interfaces = []
    this.packets = []
    this.onProgress = null
    this.ipCache = JSON.parse(localStorage.getItem("ipGeolocationCache")) || {}
    this.uniqueIPs = new Set()
    this.ipPackets = new Map()
    this.maxIPsToProcess = Number.POSITIVE_INFINITY

    // Abstract API Configuration
    this.abstractApiKey = abstractApiKey
    this.abstractApiEndpoint = abstractApiEndpoint

    this.requestDelay = 100 // 100ms delay between requests
  }

  async parse(arrayBuffer) {
    const dataView = new DataView(arrayBuffer)
    let offset = 0
    const totalSize = dataView.byteLength

    console.log("Starting parse of", totalSize, "bytes")

    try {
      if (totalSize < 12) {
        throw new Error("File too small to be a valid PCAP-NG file")
      }

      const magic = dataView.getUint32(0, true)
      if (magic !== 0x0a0d0d0a) {
        throw new Error("Invalid PCAP-NG file - missing magic number")
      }

      let blockCount = 0
      while (offset < totalSize) {
        if (this.onProgress) {
          this.onProgress(offset, totalSize, blockCount)
        }

        const block = this.parseBlock(dataView, offset)
        if (!block) break

        this.blocks.push(block)
        offset += block.totalLength
        blockCount++

        if (block.type === "Interface Description Block") {
          this.interfaces.push(block)
        } else if (block.type === "Enhanced Packet Block" || block.type === "Simple Packet Block") {
          this.packets.push(block)

          if (block.ipv4 && !block.ipv4.error) {
            this.trackIPAddresses(block)
          }
        }

        if (blockCount % 50 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      }

      console.log("Parsed", blockCount, "blocks")
      console.log("Found", this.uniqueIPs.size, "unique IP addresses")

      await this.fetchIntelligenceForIPs()
    } catch (error) {
      console.error("Parsing error:", error)
      throw new Error(`Parse error at offset ${offset}: ${error.message}`)
    }

    return {
      blocks: this.blocks,
      interfaces: this.interfaces,
      packets: this.packets,
      ipCache: this.ipCache,
      ipPackets: this.ipPackets,
      summary: this.generateSummary(),
    }
  }

  trackIPAddresses(packet) {
    const srcIP = packet.ipv4.sourceIP
    const dstIP = packet.ipv4.destinationIP

    // Initialize storage for new IPs
    if (!this.ipPackets.has(srcIP)) {
      this.ipPackets.set(srcIP, { incoming: [], outgoing: [] })
      this.uniqueIPs.add(srcIP)
    }

    if (!this.ipPackets.has(dstIP)) {
      this.ipPackets.set(dstIP, { incoming: [], outgoing: [] })
      this.uniqueIPs.add(dstIP)
    }

    // Add packet to source IP's outgoing
    this.ipPackets.get(srcIP).outgoing.push({
      timestamp: packet.timestamp,
      protocol: packet.ipv4.protocolName,
      destination: dstIP,
    })

    // Add packet to destination IP's incoming
    this.ipPackets.get(dstIP).incoming.push({
      timestamp: packet.timestamp,
      protocol: packet.ipv4.protocolName,
      source: srcIP,
    })
  }

  async fetchIntelligenceForIPs() {
    const uniqueIPsArray = Array.from(this.uniqueIPs)

    for (let i = 0; i < uniqueIPsArray.length; i++) {
      const ip = uniqueIPsArray[i]

      if (this.isSpecialIP(ip)) {
        if (this.isPrivateIP(ip)) {
          this.ipCache[ip] = {
            isPrivate: true,
            threatLevel: THREAT_LEVELS.SAFE,
            security: {
              is_vpn: false,
              is_proxy: false,
              is_tor: false,
              is_hosting: false,
              is_relay: false,
              is_mobile: false,
              is_abuse: false,
            },
          }
        } else if (this.isMulticastIP(ip)) {
          this.ipCache[ip] = {
            isMulticast: true,
            threatLevel: THREAT_LEVELS.SAFE,
            security: {
              is_vpn: false,
              is_proxy: false,
              is_tor: false,
              is_hosting: false,
              is_relay: false,
              is_mobile: false,
              is_abuse: false,
            },
          }
        } else {
          this.ipCache[ip] = {
            isSpecial: true,
            threatLevel: THREAT_LEVELS.SAFE,
            security: {
              is_vpn: false,
              is_proxy: false,
              is_tor: false,
              is_hosting: false,
              is_relay: false,
              is_mobile: false,
              is_abuse: false,
            },
          }
        }
        continue
      }

      // Skip if we already have valid data for this IP
      if (this.ipCache[ip] && !this.ipCache[ip].error) {
        continue
      }

      try {
        const intelligenceData = await this.fetchWithAbstractAPI(ip)
        this.ipCache[ip] = intelligenceData

        // Save cache periodically
        if (i % 10 === 0) {
          this.saveIpCache()
        }
      } catch (error) {
        console.error(`Error fetching intelligence for ${ip}:`, error)
        this.ipCache[ip] = {
          error: "Failed to fetch intelligence",
          threatLevel: THREAT_LEVELS.SAFE,
          security: {
            is_vpn: false,
            is_proxy: false,
            is_tor: false,
            is_hosting: false,
            is_relay: false,
            is_mobile: false,
            is_abuse: false,
          },
        }
      }

      await new Promise((resolve) => setTimeout(resolve, this.requestDelay))
    }

    // Final cache save
    this.saveIpCache()
  }

  async fetchWithAbstractAPI(ip) {
    try {
      const url = `${this.abstractApiEndpoint}?api_key=${this.abstractApiKey}&ip_address=${ip}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          error: errorData.message || `API Error: ${response.status}`,
          threatLevel: THREAT_LEVELS.SAFE,
          security: {
            is_vpn: false,
            is_proxy: false,
            is_tor: false,
            is_hosting: false,
            is_relay: false,
            is_mobile: false,
            is_abuse: false,
          },
        }
      }

      const data = await response.json()

      // Calculate threat level based on security flags
      const threatLevel = this.calculateThreatLevel(data.security)

      return {
        // Location data
        country: data.location?.country || "Unknown",
        city: data.location?.city || "Unknown",
        region: data.location?.region || "Unknown",
        latitude: Number.parseFloat(data.location?.latitude) || 0,
        longitude: Number.parseFloat(data.location?.longitude) || 0,

        // Network data
        isp: data.company?.name || "Unknown",
        asn: data.asn?.name  ,
        asnNumber: data.asn?.asn,

        // Security data
        security: data.security || {},
        threatLevel: threatLevel,

        // Additional data
        timezone: data.timezone?.name || "Unknown",
        flag: data.flag?.emoji || "🏳️",

        mapUrl:
          data.location?.latitude && data.location?.longitude
            ? `https://www.google.com/maps?q=${data.location.latitude},${data.location.longitude}`
            : null,
      }
    } catch (error) {
      return {
        error: "Abstract API failed",
        threatLevel: THREAT_LEVELS.SAFE,
        security: {
          is_vpn: false,
          is_proxy: false,
          is_tor: false,
          is_hosting: false,
          is_relay: false,
          is_mobile: false,
          is_abuse: false,
        },
      }
    }
  }

  calculateThreatLevel(security) {
    if (!security) return THREAT_LEVELS.SAFE

    let score = 0

    // Critical threats
    if (security.is_abuse) score += 4
    if (security.is_tor) score += 3

    // High threats
    if (security.is_proxy) score += 2
    if (security.is_vpn) score += 1

    // Medium threats
    if (security.is_hosting) score += 1
    if (security.is_relay) score += 1

    // Determine threat level
    if (score >= 4) return THREAT_LEVELS.CRITICAL
    if (score >= 3) return THREAT_LEVELS.HIGH
    if (score >= 2) return THREAT_LEVELS.MEDIUM
    if (score >= 1) return THREAT_LEVELS.LOW

    return THREAT_LEVELS.SAFE
  }

  saveIpCache() {
    try {
      localStorage.setItem("ipGeolocationCache", JSON.stringify(this.ipCache))
    } catch (e) {
      console.warn("Failed to save IP cache to localStorage", e)
    }
  }

  isPrivateIP(ip) {
    const parts = ip.split(".").map(Number)
    return (
      parts[0] === 10 || // 10.0.0.0/8
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
      (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16
      parts[0] === 127 || // 127.0.0.0/8 (localhost)
      parts[0] === 0 || // 0.0.0.0
      (parts[0] === 169 && parts[1] === 254) // 169.254.0.0/16 (link-local)
    )
  }

  isSpecialIP(ip) {
    const parts = ip.split(".").map(Number)
    return (
      this.isPrivateIP(ip) ||
      this.isMulticastIP(ip) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10 (Carrier-grade NAT)
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) || // 192.0.0.0/24 (IANA)
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) || // 192.0.2.0/24 (TEST-NET-1)
      (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) || // 198.51.100.0/24 (TEST-NET-2)
      (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || // 203.0.113.0/24 (TEST-NET-3)
      (parts[0] === 192 && parts[1] === 88 && parts[2] === 99) || // 192.88.99.0/24 (6to4 relay anycast)
      (parts[0] === 198 && parts[1] === 18) || // 198.18.0.0/15 (benchmarking)
      parts[0] === 224 ||
      parts[0] >= 240 // Multicast/reserved
    )
  }

  isPublicIP(ip) {
    return !this.isSpecialIP(ip)
  }

  isMulticastIP(ip) {
    const parts = ip.split(".").map(Number)
    return parts[0] >= 224 && parts[0] <= 239
  }

  parseBlock(view, offset) {
    if (offset + 12 > view.byteLength) return null

    const blockType = view.getUint32(offset, true)
    const blockLength = view.getUint32(offset + 4, true)

    if (blockLength < 12 || blockLength > 1000000) {
      throw new Error(`Invalid block length: ${blockLength}`)
    }

    if (offset + blockLength > view.byteLength) {
      throw new Error(`Block extends beyond file boundary`)
    }

    const block = {
      offset: offset,
      typeCode: blockType,
      totalLength: blockLength,
      type: this.getBlockTypeName(blockType),
    }

    try {
      switch (blockType) {
        case 0x0a0d0d0a:
          this.parseSectionHeader(view, offset, block)
          break
        case 0x00000001:
          this.parseInterfaceDescription(view, offset, block)
          break
        case 0x00000006:
          this.parseEnhancedPacket(view, offset, block)
          break
        case 0x00000003:
          this.parseSimplePacket(view, offset, block)
          break
        default:
          block.rawData = this.extractRawData(view, offset + 8, Math.min(blockLength - 12, 100))
          break
      }
    } catch (error) {
      console.warn("Error parsing block:", error)
      block.parseError = error.message
    }

    return block
  }

  getBlockTypeName(type) {
    const types = {
      168627466: "Section Header Block",
      1: "Interface Description Block",
      6: "Enhanced Packet Block",
      3: "Simple Packet Block",
      5: "Interface Statistics Block",
      4: "Name Resolution Block",
    }
    return types[type] || `Unknown Block (0x${type.toString(16).padStart(8, "0")})`
  }

  parseSectionHeader(view, offset, block) {
    const magic = view.getUint32(offset + 8, true)
    block.byteOrder = magic === 0x1a2b3c4d ? "Little Endian" : "Big Endian"
    block.majorVersion = view.getUint16(offset + 12, true)
    block.minorVersion = view.getUint16(offset + 14, true)
    block.sectionLength = view.getUint32(offset + 16, true)
  }

  parseInterfaceDescription(view, offset, block) {
    block.linkType = view.getUint16(offset + 8, true)
    block.linkTypeName = this.getLinkTypeName(block.linkType)
    block.snapLen = view.getUint32(offset + 12, true)
  }

  parseEnhancedPacket(view, offset, block) {
    block.interfaceId = view.getUint32(offset + 8, true)
    block.timestampHigh = view.getUint32(offset + 12, true)
    block.timestampLow = view.getUint32(offset + 16, true)
    block.capturedLength = view.getUint32(offset + 20, true)
    block.originalLength = view.getUint32(offset + 24, true)

    const timestamp = (BigInt(block.timestampHigh) << 32n) | BigInt(block.timestampLow)
    block.timestamp = new Date(Number(timestamp / 1000n))

    if (block.capturedLength >= 14) {
      block.ethernet = this.parseEthernet(view, offset + 28)

      if (block.ethernet && block.ethernet.etherType === 0x0800) {
        block.ipv4 = this.parseIPv4(view, offset + 28 + 14)
      }
    }
  }

  parseSimplePacket(view, offset, block) {
    block.originalLength = view.getUint32(offset + 8, true)

    if (block.originalLength >= 14) {
      block.ethernet = this.parseEthernet(view, offset + 12)

      if (block.ethernet && block.ethernet.etherType === 0x0800) {
        block.ipv4 = this.parseIPv4(view, offset + 12 + 14)
      }
    }
  }

  parseEthernet(view, offset) {
    try {
      const etherType = view.getUint16(offset + 12, false)
      return {
        etherType: etherType,
        etherTypeName: this.getEtherTypeName(etherType),
      }
    } catch (error) {
      return { error: "Failed to parse Ethernet header" }
    }
  }

  parseIPv4(view, offset) {
    try {
      if (offset + 20 > view.byteLength) {
        return { error: "Not enough data for IPv4 header" }
      }

      const versionAndIHL = view.getUint8(offset)
      const version = (versionAndIHL >> 4) & 0xf

      if (version !== 4) {
        return { error: `Invalid IP version: ${version}` }
      }

      const protocol = view.getUint8(offset + 9)

      const srcIP = [
        view.getUint8(offset + 12),
        view.getUint8(offset + 13),
        view.getUint8(offset + 14),
        view.getUint8(offset + 15),
      ].join(".")

      const dstIP = [
        view.getUint8(offset + 16),
        view.getUint8(offset + 17),
        view.getUint8(offset + 18),
        view.getUint8(offset + 19),
      ].join(".")

      return {
        version: version,
        protocol: protocol,
        protocolName: this.getProtocolName(protocol),
        sourceIP: srcIP,
        destinationIP: dstIP,
      }
    } catch (error) {
      return { error: "Failed to parse IPv4 header: " + error.message }
    }
  }

  getProtocolName(protocol) {
    const protocols = {
      1: "ICMP",
      6: "TCP",
      17: "UDP",
      2: "IGMP",
      4: "IP-in-IP",
      41: "IPv6",
      47: "GRE",
      50: "ESP",
      51: "AH",
      89: "OSPF",
    }
    return protocols[protocol] || `Unknown (${protocol})`
  }

  extractRawData(view, offset, length) {
    return new Uint8Array(view.buffer, offset, length)
  }

  getLinkTypeName(type) {
    const types = {
      1: "Ethernet",
      6: "IEEE 802.5 Token Ring",
      105: "IEEE 802.11 Wireless",
      127: "IEEE 802.11 Radiotap",
    }
    return types[type] || `Unknown (${type})`
  }

  getEtherTypeName(type) {
    const types = {
      2048: "IPv4",
      2054: "ARP",
      34525: "IPv6",
      33024: "802.1Q VLAN",
    }
    return types[type] || `Unknown (0x${type.toString(16)})`
  }

  generateSummary() {
    const blockCounts = {}
    this.blocks.forEach((block) => {
      blockCounts[block.type] = (blockCounts[block.type] || 0) + 1
    })

    return {
      totalBlocks: this.blocks.length,
      totalPackets: this.packets.length,
      totalInterfaces: this.interfaces.length,
      uniqueIPs: this.uniqueIPs.size,
      blockCounts: blockCounts,
      fileSize: this.blocks.reduce((sum, block) => sum + block.totalLength, 0),
    }
  }
}

export default PcapngParser
