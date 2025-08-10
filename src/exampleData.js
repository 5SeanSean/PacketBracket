// exampleData.js - Sample dataset for PCAP-NG Analyzer testing

const THREAT_LEVELS = {
  SAFE: { level: 0, color: "#00ff41", name: "Safe" },
  LOW: { level: 1, color: "#7fff00", name: "Low Risk" },
  MEDIUM: { level: 2, color: "#ffff00", name: "Medium Risk" },
  HIGH: { level: 3, color: "#ff8c00", name: "High Risk" },
  CRITICAL: { level: 4, color: "#ff0000", name: "Critical" },
};

const exampleIPData = {
  // Main dataset with IP information
  ipLocations: [
    {
      ip: "1.1.1.1",
      city: "Sydney",
      country: "Australia",
      countryCode: "AU",
      latitude: -33.8688,
      longitude: 151.2093,
      isp: "Cloudflare",
      threatLevel: getRandomThreatLevel(),
      asn: "AS13335"
    },
    {
      ip: "8.8.8.8",
      city: "Mountain View",
      country: "United States",
      countryCode: "US",
      latitude: 37.3861,
      longitude: -122.0839,
      isp: "Google",
      threatLevel: getRandomThreatLevel(),
      asn: "AS15169"
    },
    {
      ip: "185.161.200.1",
      city: "Moscow",
      country: "Russia",
      countryCode: "RU",
      latitude: 55.7558,
      longitude: 37.6173,
      isp: "Rostelecom",
      threatLevel: getRandomThreatLevel(),
      asn: "AS12389"
    },
    {
      ip: "203.178.135.23",
      city: "Tokyo",
      country: "Japan",
      countryCode: "JP",
      latitude: 35.6762,
      longitude: 139.6503,
      isp: "NTT Communications",
      threatLevel: getRandomThreatLevel(),
      asn: "AS4713"
    },
    {
      ip: "93.184.216.34",
      city: "London",
      country: "United Kingdom",
      countryCode: "GB",
      latitude: 51.5074,
      longitude: -0.1278,
      isp: "Fastly",
      threatLevel: getRandomThreatLevel(),
      asn: "AS54113"
    },
    {
      ip: "104.16.118.65",
      city: "São Paulo",
      country: "Brazil",
      countryCode: "BR",
      latitude: -23.5505,
      longitude: -46.6333,
      isp: "Cloudflare",
      threatLevel: getRandomThreatLevel(),
      asn: "AS13335"
    },
    {
      ip: "196.11.240.215",
      city: "Cape Town",
      country: "South Africa",
      countryCode: "ZA",
      latitude: -33.9249,
      longitude: 18.4241,
      isp: "Internet Solutions",
      threatLevel: getRandomThreatLevel(),
      asn: "AS3741"
    },
    {
      ip: "45.67.230.101",
      city: "Dubai",
      country: "United Arab Emirates",
      countryCode: "AE",
      latitude: 25.2048,
      longitude: 55.2708,
      isp: "Etisalat",
      threatLevel: getRandomThreatLevel(),
      asn: "AS5384"
    },
    {
      ip: "103.86.99.100",
      city: "New Delhi",
      country: "India",
      countryCode: "IN",
      latitude: 28.6139,
      longitude: 77.2090,
      isp: "Airtel",
      threatLevel: getRandomThreatLevel(),
      asn: "AS24560"
    },
    {
      ip: "45.79.201.203",
      city: "Toronto",
      country: "Canada",
      countryCode: "CA",
      latitude: 43.6532,
      longitude: -79.3832,
      isp: "OVH",
      threatLevel: getRandomThreatLevel(),
      asn: "AS16276"
    }
  ],

  // Packet data for each IP
  ipPackets: {
    "1.1.1.1": {
      incoming: generateRandomPackets(15),
      outgoing: generateRandomPackets(8)
    },
    "8.8.8.8": {
      incoming: generateRandomPackets(42),
      outgoing: generateRandomPackets(35)
    },
    "185.161.200.1": {
      incoming: generateRandomPackets(128),
      outgoing: generateRandomPackets(97)
    },
    "203.178.135.23": {
      incoming: generateRandomPackets(28),
      outgoing: generateRandomPackets(19)
    },
    "93.184.216.34": {
      incoming: generateRandomPackets(63),
      outgoing: generateRandomPackets(45)
    },
    "104.16.118.65": {
      incoming: generateRandomPackets(22),
      outgoing: generateRandomPackets(14)
    },
    "196.11.240.215": {
      incoming: generateRandomPackets(37),
      outgoing: generateRandomPackets(29)
    },
    "45.67.230.101": {
      incoming: generateRandomPackets(184),
      outgoing: generateRandomPackets(156)
    },
    "103.86.99.100": {
      incoming: generateRandomPackets(31),
      outgoing: generateRandomPackets(23)
    },
    "45.79.201.203": {
      incoming: generateRandomPackets(19),
      outgoing: generateRandomPackets(12)
    }
  },

  // Current user location (centered between all points)
  userLocation: {
    latitude: 15.0,
    longitude: 0.0
  }
};

// Helper function to get random threat level
function getRandomThreatLevel() {
  const levels = Object.values(THREAT_LEVELS);
  // Weight the probability - more safe/low, fewer critical
  const random = Math.random();
  if (random < 0.5) return levels[0]; // SAFE - 50%
  if (random < 0.8) return levels[1]; // LOW - 30%
  if (random < 0.95) return levels[2]; // MEDIUM - 15%
  if (random < 0.99) return levels[3]; // HIGH - 4%
  return levels[4]; // CRITICAL - 1%
}

// Helper function to generate random packet data
function generateRandomPackets(count) {
  const protocols = ["TCP", "UDP", "ICMP", "HTTP", "HTTPS", "DNS"];
  const ports = [80, 443, 22, 53, 3389, 8080, 21, 25];
  const flags = ["SYN", "ACK", "FIN", "RST", "PSH", "URG"];
  
  return Array(count).fill().map(() => ({
    timestamp: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString(),
    protocol: protocols[Math.floor(Math.random() * protocols.length)],
    sourcePort: ports[Math.floor(Math.random() * ports.length)],
    destinationPort: ports[Math.floor(Math.random() * ports.length)],
    size: Math.floor(Math.random() * 1500) + 100,
    flags: Math.random() > 0.8 ? 
      [flags[Math.floor(Math.random() * flags.length)]] : 
      ["NORMAL"]
  }));
}

// Format data for the globe visualization
// In exampleData.js, update the getIPDataForGlobe function:
function getIPDataForGlobe() {
  return exampleIPData.ipLocations.map(ip => ({
    ip: ip.ip,
    latitude: ip.latitude,
    longitude: ip.longitude,
    city: ip.city,
    region: ip.city, // Using city as region since we don't have region data
    country: ip.country,
    threatLevel: ip.threatLevel,
    isp: ip.isp,
    asn: ip.asn,
    asnNumber: ip.asn,
    security: {
      is_vpn: Math.random() < 0.1, // 10% chance
      is_proxy: Math.random() < 0.1,
      is_tor: Math.random() < 0.05,
      is_hosting: Math.random() < 0.2,
      is_relay: Math.random() < 0.1,
      is_mobile: Math.random() < 0.3,
      is_abuse: ip.threatLevel.level >= 3 // High or Critical
    },
    flag: getFlagEmoji(ip.countryCode),
    mapUrl: `https://www.google.com/maps?q=${ip.latitude},${ip.longitude}`
  }));
}


// Helper function to get flag emoji from country code
function getFlagEmoji(countryCode) {
  if (!countryCode) return "🏳️";
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

function getIPPacketsForGlobe() {
  return new Map(Object.entries(exampleIPData.ipPackets));
}

function getUserLocation() {
  return exampleIPData.userLocation;
}

// Export functions
window.exampleData = {
  getIPDataForGlobe,
  getIPPacketsForGlobe,
  getUserLocation,
  rawData: exampleIPData
};

// Auto-load sample data when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const loadExampleData = () => {
    if (window.viewportManager && window.viewportManager.globesInitialized) {
      const ipData = window.exampleData.getIPDataForGlobe();
      const ipPackets = window.exampleData.getIPPacketsForGlobe();
      window.viewportManager.setIPData(ipData, ipPackets);
    } else {
      setTimeout(loadExampleData, 100);
    }
  };
  loadExampleData();
});