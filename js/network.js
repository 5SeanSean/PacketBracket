const geolocationCache = new Map();

async function getIPLocation(ip) {
    // Check cache first
    if (geolocationCache.has(ip)) {
        return geolocationCache.get(ip);
    }

    try {
        // Try ipapi.co first
        const response = await fetch(`https://ipapi.co/${ip}/json/`);
        if (!response.ok) throw new Error('ipapi.co failed');
        
        const data = await response.json();
        const result = {
            ip: ip,
            city: data.city || 'Unknown',
            region: data.region || 'Unknown',
            country: data.country_name || 'Unknown',
            latitude: data.latitude || 0,
            longitude: data.longitude || 0
        };
        
        // Cache result
        geolocationCache.set(ip, result);
        return result;
        
    } catch (error) {
        console.warn(`Primary geolocation failed for ${ip}, trying fallback...`, error);
        return getFallbackIPLocation(ip);
    }
}

async function getFallbackIPLocation(ip) {
    // Skip geolocation for invalid IPs
    if (!isValidIP(ip)) {
        return {
            ip: ip,
            city: 'Invalid IP',
            region: 'N/A',
            country: 'N/A',
            latitude: 0,
            longitude: 0
        };
    }

    try {
        // Try ip-api.com as fallback
        const response = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await response.json();
        
        const result = {
            ip: ip,
            city: data.city || 'Unknown',
            region: data.regionName || 'Unknown',
            country: data.country || 'Unknown',
            latitude: data.lat || 0,
            longitude: data.lon || 0
        };
        
        // Cache result
        geolocationCache.set(ip, result);
        return result;
        
    } catch (error) {
        console.warn('All geolocation failed for IP:', ip, error.message);
        return {
            ip: ip,
            city: 'Unknown',
            region: 'Unknown',
            country: 'Unknown',
            latitude: (Math.random() * 180 - 90),
            longitude: (Math.random() * 360 - 180)
        };
    }
}

function isValidIP(ip) {
    // Validate IPv4
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // Validate IPv6
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}