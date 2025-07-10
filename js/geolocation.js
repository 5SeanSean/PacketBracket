// IP geolocation service
async function getIPLocation(ip) {
    try {
        // Use ipapi.co for geolocation
        const response = await fetch(`https://ipapi.co/${ip}/json/`);
        const data = await response.json();
        
        return {
            ip: ip,
            city: data.city || 'Unknown',
            region: data.region || 'Unknown',
            country: data.country_name || 'Unknown',
            latitude: data.latitude || 0,
            longitude: data.longitude || 0
        };
    } catch (error) {
        console.warn('Failed to get location for IP:', ip, error.message);
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

// Get user's location
function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = {
                    ip: 'Your Location',
                    city: 'Your City',
                    region: 'Your Region',
                    country: 'Your Country',
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                
                document.getElementById('locationStatus').style.display = 'block';
                document.getElementById('locationStatus').textContent = 'Location enabled! Your position will appear on the globe';
                
                if (document.getElementById('globeContainer').style.display === 'block') {
                    updateConnectionList(currentLocations);
                }
            },
            error => {
                console.error('Geolocation error:', error);
                document.getElementById('locationStatus').style.display = 'block';
                document.getElementById('locationStatus').textContent = 'Location access denied. Using default location.';
                document.getElementById('locationStatus').style.color = '#ff5252';
                
                // Fallback to default location (New York)
                userLocation = {
                    ip: 'Default Location',
                    city: 'New York',
                    region: 'New York',
                    country: 'United States',
                    latitude: 40.7128,
                    longitude: -74.0060
                };
                
                if (document.getElementById('globeContainer').style.display === 'block') {
                    updateConnectionList(currentLocations);
                }
            }
        );
    } else {
        console.log('Geolocation is not supported by this browser.');
        document.getElementById('locationStatus').style.display = 'block';
        document.getElementById('locationStatus').textContent = 'Geolocation not supported by your browser.';
        document.getElementById('locationStatus').style.color = '#ff5252';
    }
}