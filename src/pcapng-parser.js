// src/pcapng-parser.js

// IP-intelligence config comes from the single source of truth in config.js.
import { geoApiKey, geoApiEndpoint, THREAT_LEVELS } from "./config.js"

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

    // Geo API config (single source: config.js)
    this.geoApiKey = geoApiKey
    this.geoApiEndpoint = geoApiEndpoint

    this.requestDelay = 100 // 100ms delay between requests
  }

  async parse(arrayBuffer) {
    const dataView = new DataView(arrayBuffer)
    const totalSize = dataView.byteLength

    window.PB_DEBUG && console.log("Starting parse of", totalSize, "bytes")

    if (totalSize < 4) {
      throw new Error("File too small to be a valid capture file")
    }

    // Detect capture format from the file's magic number and dispatch.
    const magicBE = dataView.getUint32(0, false)
    if (magicBE === 0x0a0d0d0a) {
      // PCAP-NG (Section Header Block)
      return await this.parsePcapng(dataView)
    }
    if (
      magicBE === 0xa1b2c3d4 || // classic pcap, microsecond, big-endian
      magicBE === 0xd4c3b2a1 || // classic pcap, microsecond, little-endian
      magicBE === 0xa1b23c4d || // classic pcap, nanosecond, big-endian
      magicBE === 0x4d3cb2a1    // classic pcap, nanosecond, little-endian
    ) {
      return await this.parseClassicPcap(dataView, magicBE)
    }

    throw new Error("Unrecognized capture format - not a PCAP-NG or classic PCAP file")
  }

  async parsePcapng(dataView) {
    let offset = 0
    const totalSize = dataView.byteLength

    try {
      if (totalSize < 12) {
        throw new Error("File too small to be a valid PCAP-NG file")
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

      window.PB_DEBUG && console.log("Parsed", blockCount, "blocks")
      window.PB_DEBUG && console.log("Found", this.uniqueIPs.size, "unique IP addresses")

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

  // Classic libpcap format (.pcap/.cap/.dmp): 24-byte global header followed
  // by 16-byte-prefixed packet records. Endianness comes from the magic number.
  async parseClassicPcap(view, magicBE) {
    const totalSize = view.byteLength
    const little = magicBE === 0xd4c3b2a1 || magicBE === 0x4d3cb2a1
    const nano = magicBE === 0xa1b23c4d || magicBE === 0x4d3cb2a1

    try {
      if (totalSize < 24) {
        throw new Error("File too small to be a valid PCAP file")
      }

      const majorVersion = view.getUint16(4, little)
      const minorVersion = view.getUint16(6, little)
      const linkType = view.getUint32(20, little)

      // Synthesize a section header + interface block so summaries/UI line up
      // with the PCAP-NG code path.
      this.blocks.push({
        offset: 0,
        totalLength: 24,
        type: "Section Header Block",
        byteOrder: little ? "Little Endian" : "Big Endian",
        majorVersion,
        minorVersion,
      })
      const iface = {
        offset: 0,
        totalLength: 24,
        type: "Interface Description Block",
        linkType,
        linkTypeName: this.getLinkTypeName(linkType),
      }
      this.blocks.push(iface)
      this.interfaces.push(iface)

      let offset = 24
      let blockCount = 0
      while (offset + 16 <= totalSize) {
        if (this.onProgress) {
          this.onProgress(offset, totalSize, blockCount)
        }

        const tsSec = view.getUint32(offset, little)
        const tsSub = view.getUint32(offset + 4, little)
        const inclLen = view.getUint32(offset + 8, little)

        if (inclLen > 1000000 || offset + 16 + inclLen > totalSize) {
          // Truncated or corrupt record - stop gracefully.
          break
        }

        const ms = tsSec * 1000 + (nano ? tsSub / 1e6 : tsSub / 1e3)
        const block = {
          offset,
          totalLength: 16 + inclLen,
          type: "Enhanced Packet Block",
          capturedLength: inclLen,
          timestamp: new Date(ms),
        }

        const dataOffset = offset + 16
        // Only Ethernet link-layer (linkType 1) is decoded for IPs.
        if (linkType === 1 && inclLen >= 14) {
          block.ethernet = this.parseEthernet(view, dataOffset)
          if (block.ethernet && block.ethernet.etherType === 0x0800) {
            block.ipv4 = this.parseIPv4(view, dataOffset + 14)
          }
        }

        this.blocks.push(block)
        this.packets.push(block)
        if (block.ipv4 && !block.ipv4.error) {
          this.trackIPAddresses(block)
        }

        offset += 16 + inclLen
        blockCount++

        if (blockCount % 50 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      }

      window.PB_DEBUG && console.log("Parsed", blockCount, "classic pcap records")
      window.PB_DEBUG && console.log("Found", this.uniqueIPs.size, "unique IP addresses")

      await this.fetchIntelligenceForIPs()
    } catch (error) {
      console.error("Parsing error:", error)
      throw new Error(`Parse error: ${error.message}`)
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
        const intelligenceData = await this.fetchGeoIntelligence(ip)
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

  async fetchGeoIntelligence(ip) {
    try {
      let data
      if (typeof window !== "undefined" && window.electronAPI && window.electronAPI.geoLookup) {
        // Desktop app: fetch via the main process so the app:// origin isn't
        // CORS-blocked by the Worker.
        data = await window.electronAPI.geoLookup(ip)
      } else {
        const url = `${this.geoApiEndpoint}?api_key=${this.geoApiKey}&ip_address=${ip}`
        const response = await fetch(url, { cache: "no-store" })
        data = response.ok
          ? await response.json()
          : { error: `API Error: ${response.status}` }
      }

      if (!data || data.error) {
        return {
          error: (data && data.error) || "API Error",
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

      // Calculate threat level based on security flags
      const threatLevel = this.calculateThreatLevel(data.security)

      window.PB_DEBUG && console.log(`[geo] ${ip}: ${data.location?.city}, ${data.location?.country} (${data.company?.name})`)

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
        flag: "",

        mapUrl:
          data.location?.latitude && data.location?.longitude
            ? `https://www.google.com/maps?q=${data.location.latitude},${data.location.longitude}`
            : null,
      }
    } catch (error) {
      return {
        error: "Geo lookup failed",
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
window.PcapngParser = PcapngParser
