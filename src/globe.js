// globe.js - Complete 3D Globe Visualization for PCAP-NG Analyzer

let scene, camera, renderer, globe, controls;
let ipMarkers = [];
let animationId;
let userLocation = null;
let userMarker = null;
let connectionArcs = [];
let currentLocations = [];
let textureLoader;
let globeGroup;
let selectedMarker = null;
let selectedIP = null;
const markerScaleSpeed = 0.1;
const SELECTED_COLOR = 0x64ffda; // Light hacker teal
const DEFAULT_COLOR = 0x00ff41;  // Dark hacker green
const CONNECTION_WIDTH = 0.5;    // Base width
const SELECTED_CONNECTION_WIDTH = 1.5; // Selected width


function createConnectionMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(DEFAULT_COLOR) },
            width: { value: CONNECTION_WIDTH }
        },
        vertexShader: `
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float width;
            
            void main() {
                gl_FragColor = vec4(color, 0.6);
            }
        `,
        transparent: true
    });
}
// Initialize the 3D globe with IP data
function initGlobe(ipData) {
      function createConnectionMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(DEFAULT_COLOR) },
            width: { value: CONNECTION_WIDTH }
        },
        vertexShader: `
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float width;
            
            void main() {
                gl_FragColor = vec4(color, 0.6);
            }
        `,
        transparent: true
    });
}
    console.log('Initializing 3D globe with IP data:', ipData);
    
    const validIPs = ipData.filter(ip => {
        const valid = !isNaN(ip.latitude) && !isNaN(ip.longitude);
        if (!valid) {
            console.warn(`Invalid coordinates for IP ${ip.ip}:`, ip.latitude, ip.longitude);
        }
        return valid;
    });

    if (validIPs.length === 0) {
        showStatus('No valid geolocation data available', 'error');
        return;
    }
    ipData = validIPs;
    if (typeof THREE === 'undefined') {
        console.error('Three.js library not loaded!');
        showStatus('3D library failed to load. Please refresh the page.', 'error');
        return false;
    }

    try {
        const container = document.getElementById('globe');
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Show texture loading status
        document.getElementById('textureStatus').style.display = 'block';
        updateTextureStatus('Loading textures...');

        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);

        // Create camera
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 0, 3);

        // Create renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // Create a group for the globe and its children
        globeGroup = new THREE.Group();
        scene.add(globeGroup);

        // Create Earth geometry
        const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
        
        // Load Earth textures
        textureLoader = new THREE.TextureLoader();
        
        const earthTexture = textureLoader.load(
            'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
            () => updateTextureStatus('Earth texture loaded'),
            () => updateTextureStatus('Error loading Earth texture', true)
        );
        
        const earthBump = textureLoader.load(
            'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
            () => updateTextureStatus('Bump map loaded'),
            () => updateTextureStatus('Error loading bump map', true)
        );
        
        const earthSpecular = textureLoader.load(
            'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
            () => updateTextureStatus('Specular map loaded'),
            () => updateTextureStatus('Error loading specular map', true)
        );
        
        // Create Earth material with realistic textures
        const earthMaterial = new THREE.MeshPhongMaterial({
            map: earthTexture,
            bumpMap: earthBump,
            bumpScale: 0.05,
            specularMap: earthSpecular,
            specular: new THREE.Color('grey'),
            shininess: 5
        });

        // Create Earth mesh
        globe = new THREE.Mesh(earthGeometry, earthMaterial);
        globe.castShadow = true;
        globe.receiveShadow = true;
        globeGroup.add(globe);

        // Add clouds layer
        const cloudsGeometry = new THREE.SphereGeometry(1.01, 64, 64);
        const cloudsTexture = textureLoader.load(
            'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_clouds_2048.png',
            () => updateTextureStatus('Clouds texture loaded'),
            () => updateTextureStatus('Error loading clouds texture', true)
        );
        
        const cloudsMaterial = new THREE.MeshPhongMaterial({
            map: cloudsTexture,
            transparent: true,
            opacity: 0.8
        });
        const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
        globeGroup.add(clouds);

        // Add atmosphere glow
        const atmosphereGeometry = new THREE.SphereGeometry(1.05, 64, 64);
        const atmosphereMaterial = new THREE.MeshPhongMaterial({
            color: 0x64ffda,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        globeGroup.add(atmosphere);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 3, 5);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0x64ffda, 0.5, 100);
        pointLight.position.set(0, 0, 5);
        scene.add(pointLight);

        // Add stars background
        addStars();

        // Add mouse controls
        addMouseControls();

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Calculate center point based on IP locations
        const centerLat = ipData.reduce((sum, ip) => sum + ip.latitude, 0) / ipData.length;
        const centerLon = ipData.reduce((sum, ip) => sum + ip.longitude, 0) / ipData.length;
        userLocation = { latitude: centerLat, longitude: centerLon };

        // Create markers and connections for each IP
      ipData.forEach(ip => {
    const position = latLonToVector3(ip.latitude, ip.longitude, 1.01);
    const marker = createIPMarker(position, ip.ip);
    globeGroup.add(marker);
    
    const userPosition = latLonToVector3(userLocation.latitude, userLocation.longitude, 1.01);
    const connection = createConnectionArc(userPosition, position, ip.ip); // Pass ip.ip here
    globeGroup.add(connection);
    connectionArcs.push(connection);
});

        // Add user marker at center
        userMarker = createUserMarker(latLonToVector3(userLocation.latitude, userLocation.longitude, 1.01));
        globeGroup.add(userMarker);

        // Start animation loop
        animate();

        console.log('3D globe initialized successfully with IP data');
        return true;

    } catch (error) {
        console.error('Error initializing 3D globe:', error);
        showStatus('Failed to initialize 3D globe: ' + error.message, 'error');
        return false;
    }
}

// Create an IP location marker
function createIPMarker(position, ip) {
    // Smaller main marker (reduced from 0.02 to 0.015)
    const geometry = new THREE.SphereGeometry(0.015, 16, 16);
    const material = new THREE.MeshPhongMaterial({
        color: DEFAULT_COLOR,
        emissive: DEFAULT_COLOR,
        emissiveIntensity: 0.2,
        specular: 0xffffff,
        shininess: 50,
        fog: true
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    marker.userData = {
        ip: ip,
        isSelected: false,
        targetScale: new THREE.Vector3(1, 1, 1),
        defaultColor: DEFAULT_COLOR
    };

    // Futuristic glow effect
    const glowGeometry = new THREE.SphereGeometry(0.02, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { type: "c", value: new THREE.Color(DEFAULT_COLOR) },
            viewVector: { type: "v3", value: camera.position }
        },
        vertexShader: `
            uniform vec3 viewVector;
            varying float intensity;
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                vec3 actual_normal = normalize(normalMatrix * normal);
                intensity = pow(0.7 - dot(actual_normal, normalize(viewVector)), 2.0);
            }
        `,
        fragmentShader: `
            uniform vec3 glowColor;
            varying float intensity;
            void main() {
                vec3 glow = glowColor * intensity;
                gl_FragColor = vec4(glow, 0.3);
            }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.scale.set(1.3, 1.3, 1.3);
    marker.add(glow);
    marker.userData.glow = glow;
    
    // Add click handler
    marker.onClick = () => {
        selectMarker(marker, ip);
    };
    
    scene.add(marker);
    ipMarkers.push(marker);
    
    return marker;
}

function selectMarker(marker, ip) {
    // Deselect previous
    if (selectedMarker) {
        // Smooth scale down
        selectedMarker.userData.targetScale.set(1, 1, 1);
        
        // Reset color and glow
        selectedMarker.material.color.setHex(selectedMarker.userData.defaultColor);
        selectedMarker.material.emissive.setHex(selectedMarker.userData.defaultColor);
        
        if (selectedMarker.userData.glow) {
            selectedMarker.userData.glow.material.uniforms.glowColor.value.setHex(selectedMarker.userData.defaultColor);
        }
        
        // Remove pulse if exists
        if (selectedMarker.pulseEffect) {
            selectedMarker.remove(selectedMarker.pulseEffect);
            scene.remove(selectedMarker.pulseEffect);
            selectedMarker.pulseEffect = null;
        }
        
        // Reset connections
        connectionArcs.forEach(arc => {
            if (arc.userData.isSelected) {
                arc.material.color.setHex(DEFAULT_COLOR);
                arc.material.opacity = 0.6;
                arc.userData.targetWidth = arc.userData.defaultWidth;
                arc.userData.isSelected = false;
            }
        });
    }

    // Select new marker
    selectedMarker = marker;
    selectedIP = ip;
    
    // Visual changes for selection
    marker.material.color.setHex(SELECTED_COLOR);
    marker.material.emissive.setHex(SELECTED_COLOR);
    marker.userData.targetScale.set(2.5, 2.5, 2.5); // Bigger scale when selected
    
    // Update glow color
    if (marker.userData.glow) {
        marker.userData.glow.material.uniforms.glowColor.value.setHex(SELECTED_COLOR);
    }

    // Add advanced pulse effect
    const pulseGeometry = new THREE.SphereGeometry(0.025, 32, 32);
    const pulseMaterial = new THREE.MeshBasicMaterial({
        color: SELECTED_COLOR,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });
    const pulseEffect = new THREE.Mesh(pulseGeometry, pulseMaterial);
    marker.add(pulseEffect);
    marker.pulseEffect = pulseEffect;

    // Animate pulse with easing
    function animatePulse() {
        if (!marker.userData.isSelected) return;
        const time = Date.now() * 0.002;
        const scale = 1 + 0.7 * Math.sin(time) * Math.sin(time * 0.3);
        pulseEffect.scale.set(scale, scale, scale);
        pulseEffect.material.opacity = 0.4 + 0.3 * Math.sin(time * 0.5);
        requestAnimationFrame(animatePulse);
    }
    animatePulse();

    // Highlight connections
    connectionArcs.forEach(arc => {
        if (arc.userData.connectedIP === ip) {
            arc.material.color.setHex(SELECTED_COLOR);
            arc.material.opacity = 0.9;
            arc.userData.targetWidth = SELECTED_CONNECTION_WIDTH;
            arc.userData.isSelected = true;
        }
    });
    
    // Scroll to and highlight in side panel
    if (window.highlightIPInSidePanel) {
        window.highlightIPInSidePanel(ip);
    }
    
    // Smoothly rotate globe to show selected marker
    const targetRotation = calculateTargetRotation(marker.position);
    targetRotationY = targetRotation.y;
    targetRotationX = targetRotation.x;
}


// Add function to calculate target rotation
function calculateTargetRotation(position) {
    const vector = position.clone().normalize();
    const y = Math.atan2(vector.x, vector.z);
    const x = Math.atan2(vector.y, Math.sqrt(vector.x * vector.x + vector.z * vector.z));
    return { x: -x, y: y };
}

// Create user marker (center point)
function createUserMarker(position) {
    // Smaller user marker (reduced from 0.03 to 0.02)
    const geometry = new THREE.SphereGeometry(0.02, 16, 16);
    const material = new THREE.MeshPhongMaterial({
        color: 0x64ffda,
        emissive: 0x1a5a4c,
        emissiveIntensity: 0.5,
        specular: 0x111111,
        shininess: 30
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    
    // Add pulse effect (smaller than before)
    const pulseGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const pulseMaterial = new THREE.MeshBasicMaterial({
        color: 0x64ffda,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
    });
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
    marker.add(pulse);
    
    // Animation for pulse effect
    function animatePulse() {
        pulse.scale.x = 1 + 0.5 * Math.sin(Date.now() * 0.002);
        pulse.scale.y = 1 + 0.5 * Math.sin(Date.now() * 0.002);
        pulse.scale.z = 1 + 0.5 * Math.sin(Date.now() * 0.002);
        requestAnimationFrame(animatePulse);
    }
    animatePulse();
    
    return marker;
}

// Create a curved connection line between two points
function createConnectionArc(start, end, ip) {  // Add ip parameter
    if ([start.x, start.y, start.z, end.x, end.y, end.z].some(isNaN)) {
        console.error('Invalid positions for connection arc:', start, end);
        return null;
    }
    const points = [];
    const numPoints = 50;
    const v1 = start.clone().normalize();
    const v2 = end.clone().normalize();
    const angle = v1.angleTo(v2);
    
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const f = t * angle;
        const q = new THREE.Quaternion().setFromUnitVectors(v1, v2);
        const vec = v1.clone().applyQuaternion(q.clone().slerp(new THREE.Quaternion(), 1 - t));
        const point = vec.multiplyScalar(1.02);
        points.push(point);
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: DEFAULT_COLOR,
        transparent: true,
        opacity: 0.6
    });
    
    const line = new THREE.Line(geometry, material);
    line.userData = {
        isSelected: false,
        connectedIP: ip
    };
    
    return line;
}

// Add stars background
function addStars() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });

    const starsVertices = [];
    for (let i = 0; i < 10000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 2000;
        starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
}

// Convert latitude/longitude to 3D vector
function latLonToVector3(lat, lon, radius) {
    // Validate inputs
    if (isNaN(lat)) lat = 0;
    if (isNaN(lon)) lon = 0;
    if (isNaN(radius)) radius = 1.01;

    // Convert valid coordinates
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));

    return new THREE.Vector3(
        isNaN(x) ? 0 : x,
        isNaN(y) ? 0 : y, 
        isNaN(z) ? 0 : z
    );
}

// Add mouse controls
function addMouseControls() {
    let isMouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;
    let rotationX = 0;
    let rotationY = 0;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const container = document.getElementById('globe');

    container.addEventListener('mousedown', (event) => {
        isMouseDown = true;
        mouseX = event.clientX;
        mouseY = event.clientY;
    });

    container.addEventListener('mousemove', (event) => {
        if (!isMouseDown) return;

        const deltaX = event.clientX - mouseX;
        const deltaY = event.clientY - mouseY;

        targetRotationY += deltaX * 0.01;
        targetRotationX += deltaY * 0.01;

        mouseX = event.clientX;
        mouseY = event.clientY;
    });

    container.addEventListener('mouseup', () => {
        isMouseDown = false;
    });

    container.addEventListener('wheel', (event) => {
        event.preventDefault();
        const delta = event.deltaY * 0.001;
        camera.position.z += delta;
        camera.position.z = Math.max(1.5, Math.min(10, camera.position.z));
    });

    // Smooth rotation animation
    function updateRotation() {
        rotationX += (targetRotationX - rotationX) * 0.1;
        rotationY += (targetRotationY - rotationY) * 0.1;
        
        if (globeGroup) {
            globeGroup.rotation.x = rotationX;
            globeGroup.rotation.y = rotationY;
        }
    }
     container.addEventListener('click', (event) => {

        if (!camera || !raycaster) return;
        
        // Calculate mouse position in normalized device coordinates
        mouse.x = (event.clientX / container.clientWidth) * 2 - 1;
        mouse.y = -(event.clientY / container.clientHeight) * 2 + 1;
        
        // Update the raycaster
        raycaster.setFromCamera(mouse, camera);
        
        // Check for intersections with markers
        const intersects = raycaster.intersectObjects(ipMarkers);
        
        if (intersects.length > 0) {
            const marker = intersects[0].object;
            marker.onClick();
        }
    });

    // Auto-rotation when not interacting
    let autoRotate = true;
    container.addEventListener('mousedown', () => { autoRotate = false; });
    setTimeout(() => { autoRotate = true; }, 5000);

    window.updateRotation = updateRotation;
    window.autoRotate = () => autoRotate;
}

// Handle window resize
function onWindowResize() {
    if (!camera || !renderer) return;
    
    const container = document.getElementById('globe');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Animation loop
function animate() {
    animationId = requestAnimationFrame(animate);
    
    // Handle marker scaling
    ipMarkers.forEach(marker => {
        if (marker.userData.targetScale) {
            marker.scale.lerp(marker.userData.targetScale, 0.1);
        }
    });
    
    // Handle connection line width changes
    connectionArcs.forEach(arc => {
        if (arc.userData.targetWidth !== undefined) {
            arc.material.linewidth = THREE.MathUtils.lerp(
                arc.material.linewidth,
                arc.userData.targetWidth,
                0.1
            );
        }
    });
    // Rotate the entire globe group which contains all elements
    if (globeGroup) {
        // Auto-rotate when not interacting
        if (window.autoRotate && window.autoRotate()) {
            globeGroup.rotation.y += 0.001;
        }
        
        // Apply any user rotation
        if (window.updateRotation) {
            window.updateRotation();
        }
    }
    
    // Render the scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Update texture loading status
function updateTextureStatus(message, isError = false) {
    const statusEl = document.getElementById('textureStatus');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    
    if (isError) {
        statusEl.style.color = '#ff5252';
    } else {
        statusEl.style.color = '#64ffda';
    }
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.createElement('div');
    statusEl.style.position = 'fixed';
    statusEl.style.bottom = '20px';
    statusEl.style.right = '20px';
    statusEl.style.padding = '10px 20px';
    statusEl.style.borderRadius = '5px';
    statusEl.style.color = 'white';
    statusEl.style.zIndex = '1000';
    
    if (type === 'error') {
        statusEl.style.backgroundColor = 'rgba(255, 82, 82, 0.9)';
    } else {
        statusEl.style.backgroundColor = 'rgba(100, 255, 218, 0.9)';
    }
    
    statusEl.textContent = message;
    document.body.appendChild(statusEl);
    
    setTimeout(() => {
        statusEl.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(statusEl);
        }, 500);
    }, 3000);
}


function cleanupGlobe() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    const container = document.getElementById('globe');
    if (container && renderer && renderer.domElement) {
        container.removeChild(renderer.domElement);
    }
    
    // Remove event listeners
    window.removeEventListener('resize', onWindowResize);
    
    // Clean up Three.js objects
    if (scene) {
        scene.traverse(object => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (object.material.map) object.material.map.dispose();
                if (object.material.bumpMap) object.material.bumpMap.dispose();
                if (object.material.specularMap) object.material.specularMap.dispose();
                object.material.dispose();
            }
        });
    }
    
    scene = null;
    camera = null;
    renderer = null;
    globe = null;
    ipMarkers = [];
    connectionArcs = [];
}

// Initialize when Three.js is loaded
if (typeof THREE !== 'undefined') {
    console.log('Three.js loaded, ready to initialize globe');
} else {
    console.log('Waiting for Three.js to load');
}

window.selectIPOnGlobe = function(ip) {
    const marker = ipMarkers.find(m => m.userData.ip === ip);
    if (marker) {
        selectMarker(marker, ip);
    }
};