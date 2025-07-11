// globe.js - 3D Globe Visualization and Controls

let scene, camera, renderer, globe, controls;
let ipMarkers = [];
let animationId;
let userLocation = null;
let userMarker = null;
let connectionArcs = [];
let currentLocations = [];
let textureLoader;
let globeGroup;

// Initialize the 3D globe
function initGlobe() {
    console.log('Initializing 3D globe, THREE object:', typeof THREE);
    
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
        
        // Use reliable textures
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
        // In globe.js, replace the cloud texture URL with:
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

        // Add point light for dramatic effect
        const pointLight = new THREE.PointLight(0x64ffda, 0.5, 100);
        pointLight.position.set(0, 0, 5);
        scene.add(pointLight);

        // Add stars
        addStars();

        // Add mouse controls
        addMouseControls();

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Start animation loop
        animate();

        console.log('3D globe initialized successfully');
        return true;

    } catch (error) {
        console.error('Error initializing 3D globe:', error);
        showStatus('Failed to initialize 3D globe: ' + error.message, 'error');
        return false;
    }
}

// Update texture loading status
function updateTextureStatus(message, isError = false) {
    const statusEl = document.getElementById('textureStatus');
    statusEl.textContent = message;
    
    if (isError) {
        statusEl.style.color = '#ff5252';
    } else {
        statusEl.style.color = '#64ffda';
    }
    
    // Hide status after a delay
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
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
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));

    return new THREE.Vector3(x, y, z);
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

    // Auto-rotation when not interacting
    let autoRotate = true;
    container.addEventListener('mousedown', () => { autoRotate = false; });
    setTimeout(() => { autoRotate = true; }, 5000);

    // Store the update function for use in animation loop
    window.updateRotation = updateRotation;
    window.autoRotate = () => autoRotate;
}

// Create a curved connection line between two points
function createConnectionArc(start, end) {
    // Create points for a curved line that follows the great circle
    const points = [];
    const numPoints = 50;
    
    // Create vectors for the start and end points
    const v1 = start.clone().normalize();
    const v2 = end.clone().normalize();
    
    // Calculate the angle between the vectors
    const angle = v1.angleTo(v2);
    
    // Create points along the great circle
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const f = t * angle;
        
        // Rotate from v1 to v2
        const q = new THREE.Quaternion().setFromUnitVectors(v1, v2);
        const vec = v1.clone().applyQuaternion(q.clone().slerp(new THREE.Quaternion(), 1 - t));
        
        // Position at the desired radius (slightly above the globe surface)
        const point = vec.multiplyScalar(1.02);
        points.push(point);
    }
    
    // Create the geometry and line
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0xff7b54,
        transparent: true,
        opacity: 0.6,
        linewidth: 1
    });
    
    return new THREE.Line(geometry, material);
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
    
    if (window.updateRotation) {
        window.updateRotation();
    }
    
    // Auto-rotate when not interacting
    if (window.autoRotate && window.autoRotate() && globeGroup) {
        globeGroup.rotation.y += 0.001;
    }
    
    // Animate IP markers
    ipMarkers.forEach((marker, index) => {
        if (marker.material.opacity) {
            marker.material.opacity = 0.5 + 0.3 * Math.sin(Date.now() * 0.001 + index);
        }
    });
    
    // Animate connection lines
    connectionArcs.forEach((arc, index) => {
        if (arc.material) {
            arc.material.opacity = 0.4 + 0.2 * Math.sin(Date.now() * 0.001 + index * 0.5);
        }
    });
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}