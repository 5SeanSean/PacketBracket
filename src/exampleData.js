// exampleData.js - Sample dataset for PCAP-NG Analyzer testing with real user location

const THREAT_LEVELS = {
  SAFE: { level: 0, color: "#00ff41", name: "Safe" },
  LOW: { level: 1, color: "#7fff00", name: "Low Risk" },
  MEDIUM: { level: 2, color: "#ffff00", name: "Medium Risk" },
  HIGH: { level: 3, color: "#ff8c00", name: "High Risk" },
  CRITICAL: { level: 4, color: "#ff0000", name: "Critical" },
};

// Abstract API config — read from the shared window.PB_CONFIG (set by config.js)
// instead of hardcoding the key. NOTE: this file is currently orphaned (not
// loaded by index.html); kept in sync so no stray key copy lives here.
const _pbcfg = (typeof window !== "undefined" && window.PB_CONFIG) || {};
const abstractApiKey = _pbcfg.abstractApiKey || "";
const abstractApiEndpoint = _pbcfg.abstractApiEndpoint || "https://ip-intelligence.abstractapi.com/v1/";

// Main data structure
let exampleIPData = {
  userLocation: null, // Will be populated with real user location
  ipLocations: [],
  ipPackets: {}
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

// Get user's real IP and location
async function getUserRealLocation() {
  // Try to get cached user location first
  const cachedLocation = localStorage.getItem('userLocationCache');
  if (cachedLocation) {
    try {
      const parsed = JSON.parse(cachedLocation);
      // Check if cache is less than 1 day old
      if (parsed.timestamp && (Date.now() - parsed.timestamp) < 24 * 60 * 60 * 1000) {
        console.log("Using cached user location");
        return parsed.data;
      }
    } catch (e) {
      console.log("Failed to parse cached location");
    }
  }

  try {
    // First get the user's IP
    console.log("Fetching user IP...");
    const ipResponse = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipResponse.json();
    const userIP = ipData.ip;
    console.log("User IP:", userIP);
    
    // Then get location info using your existing API
    const url = `${abstractApiEndpoint}?api_key=${abstractApiKey}&ip_address=${userIP}`;
    console.log("Fetching user location from Abstract API...");
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      console.log("User location data:", data);
      
      const userLocation = {
        ip: userIP,
        latitude: Number.parseFloat(data.location?.latitude) || 0,
        longitude: Number.parseFloat(data.location?.longitude) || 0,
        city: data.location?.city || "Unknown",
        region: data.location?.region || "Unknown",
        country: data.location?.country || "Unknown",
        countryCode: data.location?.country_code || "??",
        isp: data.company?.name || "Unknown ISP",
        asn: data.asn?.name || "Unknown",
        asnNumber: data.asn?.asn || "",
        threatLevel: THREAT_LEVELS.SAFE, // Default safe for user
        security: {
          is_vpn: data.security?.is_vpn || false,
          is_proxy: data.security?.is_proxy || false,
          is_tor: data.security?.is_tor || false,
          is_hosting: data.security?.is_hosting || false,
          is_relay: data.security?.is_relay || false,
          is_mobile: data.security?.is_mobile || false,
          is_abuse: data.security?.is_abuse || false
        },
        timezone: data.timezone?.name || "Unknown",
        flag: data.flag?.emoji || "🏳️"
      };

      // Cache the location
      localStorage.setItem('userLocationCache', JSON.stringify({
        timestamp: Date.now(),
        data: userLocation
      }));

      return userLocation;
    } else {
      console.error("API response not OK:", response.status);
    }
  } catch (error) {
    console.error("Failed to get user location:", error);
  }
  
  // Fallback to Dubai if API fails
  console.log("Using fallback Dubai location");
  return {
    ip: "0.0.0.0",
    city: "Dubai",
    region: "Dubai",
    country: "United Arab Emirates",
    countryCode: "AE",
    latitude: 25.2048,
    longitude: 55.2708,
    isp: "Unknown ISP",
    asn: "Unknown",
    asnNumber: "",
    threatLevel: THREAT_LEVELS.SAFE,
    security: {
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      is_hosting: false,
      is_relay: false,
      is_mobile: false,
      is_abuse: false
    },
    timezone: "Asia/Dubai",
    flag: "🇦🇪"
  };
}

// Generate example IPs distributed around the world relative to user's location
function generateExampleIPsRelativeToUser(userLocation) {
  // Example IPs with their locations
  const exampleIPs = [
    // User's actual location (added first)
    {
      ip: userLocation.ip,
      city: userLocation.city,
      region: userLocation.region,
      country: userLocation.country,
      countryCode: userLocation.countryCode,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      isp: userLocation.isp,
      asn: userLocation.asn,
      asnNumber: userLocation.asnNumber,
      threatLevel: userLocation.threatLevel,
      security: userLocation.security,
      timezone: userLocation.timezone,
      flag: userLocation.flag
    },
    // Popular global IPs
    {
      ip: "1.1.1.1",
      city: "Sydney",
      region: "New South Wales",
      country: "Australia",
      countryCode: "AU",
      latitude: -33.8688,
      longitude: 151.2093,
      isp: "Cloudflare",
      asn: "AS13335 Cloudflare",
      asnNumber: "13335",
      threatLevel: THREAT_LEVELS.SAFE,
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: true,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "Australia/Sydney",
      flag: "🇦🇺"
    },
    {
      ip: "8.8.8.8",
      city: "Mountain View",
      region: "California",
      country: "United States",
      countryCode: "US",
      latitude: 37.3861,
      longitude: -122.0839,
      isp: "Google",
      asn: "AS15169 Google",
      asnNumber: "15169",
      threatLevel: THREAT_LEVELS.SAFE,
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: true,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "America/Los_Angeles",
      flag: "🇺🇸"
    },
    {
      ip: "185.161.200.1",
      city: "Moscow",
      region: "Moscow",
      country: "Russia",
      countryCode: "RU",
      latitude: 55.7558,
      longitude: 37.6173,
      isp: "Rostelecom",
      asn: "AS12389 Rostelecom",
      asnNumber: "12389",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: false,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "Europe/Moscow",
      flag: "🇷🇺"
    },
    {
      ip: "203.178.135.23",
      city: "Tokyo",
      region: "Tokyo",
      country: "Japan",
      countryCode: "JP",
      latitude: 35.6762,
      longitude: 139.6503,
      isp: "NTT Communications",
      asn: "AS4713 NTT",
      asnNumber: "4713",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: true,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "Asia/Tokyo",
      flag: "🇯🇵"
    },
    {
      ip: "93.184.216.34",
      city: "London",
      region: "England",
      country: "United Kingdom",
      countryCode: "GB",
      latitude: 51.5074,
      longitude: -0.1278,
      isp: "Fastly",
      asn: "AS54113 Fastly",
      asnNumber: "54113",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: true,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "Europe/London",
      flag: "🇬🇧"
    },
    {
      ip: "104.16.118.65",
      city: "São Paulo",
      region: "São Paulo",
      country: "Brazil",
      countryCode: "BR",
      latitude: -23.5505,
      longitude: -46.6333,
      isp: "Cloudflare",
      asn: "AS13335 Cloudflare",
      asnNumber: "13335",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: true,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "America/Sao_Paulo",
      flag: "🇧🇷"
    },
    {
      ip: "196.11.240.215",
      city: "Cape Town",
      region: "Western Cape",
      country: "South Africa",
      countryCode: "ZA",
      latitude: -33.9249,
      longitude: 18.4241,
      isp: "Internet Solutions",
      asn: "AS3741 Internet Solutions",
      asnNumber: "3741",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: false,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "Africa/Johannesburg",
      flag: "🇿🇦"
    },
    {
      ip: "45.67.230.101",
      city: "Dubai",
      region: "Dubai",
      country: "United Arab Emirates",
      countryCode: "AE",
      latitude: 25.2048,
      longitude: 55.2708,
      isp: "Etisalat",
      asn: "AS5384 Etisalat",
      asnNumber: "5384",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: false,
        is_relay: false,
        is_mobile: true,
        is_abuse: false
      },
      timezone: "Asia/Dubai",
      flag: "🇦🇪"
    },
    {
      ip: "103.86.99.100",
      city: "New Delhi",
      region: "Delhi",
      country: "India",
      countryCode: "IN",
      latitude: 28.6139,
      longitude: 77.2090,
      isp: "Airtel",
      asn: "AS24560 Bharti Airtel",
      asnNumber: "24560",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: false,
        is_relay: false,
        is_mobile: true,
        is_abuse: false
      },
      timezone: "Asia/Kolkata",
      flag: "🇮🇳"
    },
    {
      ip: "45.79.201.203",
      city: "Toronto",
      region: "Ontario",
      country: "Canada",
      countryCode: "CA",
      latitude: 43.6532,
      longitude: -79.3832,
      isp: "OVH",
      asn: "AS16276 OVH",
      asnNumber: "16276",
      threatLevel: getRandomThreatLevel(),
      security: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_hosting: true,
        is_relay: false,
        is_mobile: false,
        is_abuse: false
      },
      timezone: "America/Toronto",
      flag: "🇨🇦"
    }
  ];

  return exampleIPs;
}

// Generate packets for all IPs
function generatePacketsForIPs(ipLocations) {
  const ipPackets = {};
  
  ipLocations.forEach((ip, index) => {
    // User's IP gets moderate traffic
    if (index === 0) {
      ipPackets[ip.ip] = {
        incoming: generateRandomPackets(25),
        outgoing: generateRandomPackets(20)
      };
    } else {
      // Other IPs get random amounts of traffic
      const incomingCount = 10 + Math.floor(Math.random() * 100);
      const outgoingCount = 5 + Math.floor(Math.random() * 80);
      
      ipPackets[ip.ip] = {
        incoming: generateRandomPackets(incomingCount),
        outgoing: generateRandomPackets(outgoingCount)
      };
    }
  });
  
  return ipPackets;
}

// Helper function to get flag emoji from country code
function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🏳️";
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

// Format data for the globe visualization
function getIPDataForGlobe() {
  return exampleIPData.ipLocations.map(ip => ({
    ip: ip.ip,
    latitude: ip.latitude,
    longitude: ip.longitude,
    city: ip.city,
    region: ip.region,
    country: ip.country,
    countryCode: ip.countryCode,
    threatLevel: ip.threatLevel,
    isp: ip.isp,
    asn: ip.asn,
    asnNumber: ip.asnNumber,
    security: ip.security,
    flag: ip.flag || getFlagEmoji(ip.countryCode),
    timezone: ip.timezone,
    mapUrl: `https://www.google.com/maps?q=${ip.latitude},${ip.longitude}`
  }));
}

function getIPPacketsForGlobe() {
  return new Map(Object.entries(exampleIPData.ipPackets));
}

function getUserLocation() {
  return exampleIPData.userLocation;
}

// Initialize the example data
async function initializeExampleData() {
  console.log("Initializing example data with user location...");
  
  // Show loading status
  if (window.showStatus) {
    window.showStatus("Detecting your location for example data...", "info");
  }
  
  // Get real user location
  exampleIPData.userLocation = await getUserRealLocation();
  
  // Generate example IPs relative to user's location
  exampleIPData.ipLocations = generateExampleIPsRelativeToUser(exampleIPData.userLocation);
  exampleIPData.ipPackets = generatePacketsForIPs(exampleIPData.ipLocations);
  
  console.log("Example data initialized:", {
    userLocation: exampleIPData.userLocation,
    ipCount: exampleIPData.ipLocations.length,
    userIP: exampleIPData.userLocation.ip
  });
  
  return true;
}

// Export functions
window.exampleData = {
  getIPDataForGlobe,
  getIPPacketsForGlobe,
  getUserLocation,
  initializeExampleData,
  rawData: exampleIPData
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, initializing example data...");
  
  // Initialize the data first
  await window.exampleData.initializeExampleData();
  
  // Then load it into the visualization
  const loadExampleData = () => {
    if (window.viewportManager && window.viewportManager.globesInitialized) {
      const ipData = window.exampleData.getIPDataForGlobe();
      const ipPackets = window.exampleData.getIPPacketsForGlobe();
      window.viewportManager.setIPData(ipData, ipPackets);
      
      // Also trigger side panel update if available
      if (window.displayIPDetails) {
        window.displayIPDetails(ipData, ipPackets, { name: "Example Data" }, {
          totalPackets: Object.values(ipPackets).reduce((sum, p) => sum + p.incoming.length + p.outgoing.length, 0),
          ipv4Packets: Object.values(ipPackets).reduce((sum, p) => sum + p.incoming.length + p.outgoing.length, 0),
          uniqueIPs: ipData.length
        });
      }
    } else {
      setTimeout(loadExampleData, 100);
    }
  };
  
  // Start trying to load the data
  loadExampleData();
});