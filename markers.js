// markers.js - IP Markers and User Location Management

// Add IP markers to globe
function addIPMarkersToGlobe(locations) {
    if (!scene || !globe) {
        console.error('Globe not initialized');
        return;
    }

    // Clear existing markers
    ipMarkers.forEach(marker => {
        globeGroup.remove(marker);
    });
    ipMarkers = [];

    // Clear existing connection arcs
    connectionArcs.forEach(arc => globeGroup.remove(arc));
    connectionArcs = [];

    locations.forEach((location, index) => {
        if (location.latitude && location.longitude) {
            const pos = latLonToVector3(location.latitude, location.longitude, 1.02);
            
            // Create glowing marker
            const markerGeometry = new THREE.SphereGeometry(0.01, 16, 16);
            const markerMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x64ffda,
                transparent: true,
                opacity: 0.8
            });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(pos);
            
            // Add glow effect
            const glowGeometry = new THREE.SphereGeometry(0.02, 16, 16);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0x64ffda,
                transparent: true,
                opacity: 0.3
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.position.copy(pos);
            
            // Store location data for click handling
            marker.userData = location;
            glow.userData = location;
            
            globeGroup.add(marker);
            globeGroup.add(glow);
            ipMarkers.push(marker);
            ipMarkers.push(glow);
            
            // Create connection lines to user location
            if (userLocation) {
                const userPos = latLonToVector3(userLocation.latitude, userLocation.longitude, 1.02);
                const arc = createConnectionArc(userPos, pos);
                globeGroup.add(arc);
                connectionArcs.push(arc);
            }
            
            // Animate marker appearance
            marker.scale.set(0, 0, 0);
            glow.scale.set(0, 0, 0);
            
            setTimeout(() => {
                animateMarkerAppearance(marker, glow);
            }, index * 100);
        }
    });
    
    // Add user marker if available
    if (userLocation) {
        addUserMarkerToGlobe();
    }
}

// Add user marker to the globe
function addUserMarkerToGlobe() {
    if (!scene || !globe || !userLocation) return;
    
    // Remove existing user marker
    if (userMarker) {
        globeGroup.remove(userMarker);
    }
    
    const pos = latLonToVector3(userLocation.latitude, userLocation.longitude, 1.02);
    
    // Create user marker (larger and red)
    const markerGeometry = new THREE.SphereGeometry(0.015, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff5252,
        transparent: true,
        opacity: 0.9
    });
    userMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    userMarker.position.copy(pos);
    
    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff5252,
        transparent: true,
        opacity: 0.4
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.copy(pos);
    
    // Store location data for click handling
    userMarker.userData = userLocation;
    glow.userData = userLocation;
    
    globeGroup.add(userMarker);
    globeGroup.add(glow);
    ipMarkers.push(userMarker);
    ipMarkers.push(glow);
    
    // Create connection lines to all IPs
    currentLocations.forEach(location => {
        if (location.latitude && location.longitude) {
            const ipPos = latLonToVector3(location.latitude, location.longitude, 1.02);
            const arc = createConnectionArc(pos, ipPos);
            globeGroup.add(arc);
            connectionArcs.push(arc);
        }
    });
    
    // Animate marker appearance
    userMarker.scale.set(0, 0, 0);
    glow.scale.set(0, 0, 0);
    
    setTimeout(() => {
        animateMarkerAppearance(userMarker, glow);
    }, 0);
}

// Animate marker appearance
function animateMarkerAppearance(marker, glow) {
    const animate = () => {
        marker.scale.x += 0.05;
        marker.scale.y += 0.05;
        marker.scale.z += 0.05;
        
        glow.scale.x += 0.05;
        glow.scale.y += 0.05;
        glow.scale.z += 0.05;
        
        if (marker.scale.x < 1) {
            requestAnimationFrame(animate);
        }
    };
    animate();
}

// Handle raycasting for click detection
function setupClickDetection() {
    if (!camera || !renderer || !scene) return;
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const container = document.getElementById('globe');
    
    container.addEventListener('click', (event) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(ipMarkers);
        
        if (intersects.length > 0) {
            const clickedMarker = intersects[0].object;
            const location = clickedMarker.userData;
            
            if (location) {
                // Show popup with location details
                showLocationPopup(location, event.clientX, event.clientY);
            }
        }
    });
}

// Show location popup
function showLocationPopup(location, x, y) {
    // Remove existing popup
    const existingPopup = document.getElementById('locationPopup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // Create new popup
    const popup = document.createElement('div');
    popup.id = 'locationPopup';
    popup.style.cssText = `
        position: fixed;
        left: ${x + 10}px;
        top: ${y - 10}px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #64ffda;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        max-width: 250px;
    `;
    
    let distanceInfo = '';
    if (userLocation) {
        const distance = Math.round(calculateDistance(
            userLocation.latitude, 
            userLocation.longitude,
            location.latitude,
            location.longitude
        ));
        distanceInfo = `<div>📏 Distance: ${distance} km</div>`;
    }
    
    popup.innerHTML = `
        <div style="color: #64ffda; font-weight: bold; margin-bottom: 8px;">${location.ip}</div>
        <div>📍 ${location.city}, ${location.region}</div>
        <div>🌍 ${location.country}</div>
        ${distanceInfo}
        <div style="margin-top: 8px; font-size: 12px; color: #aaa;">
            Lat: ${location.latitude.toFixed(2)}, Lon: ${location.longitude.toFixed(2)}
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Remove popup after 3 seconds or on next click
    setTimeout(() => {
        if (popup.parentNode) {
            popup.remove();
        }
    }, 3000);
    
    document.addEventListener('click', () => {
        if (popup.parentNode) {
            popup.remove();
        }
    }, { once: true });
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
                    addUserMarkerToGlobe();
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
                    addUserMarkerToGlobe();
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