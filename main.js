// Global variables
let userLocation = null;
let currentLocations = [];

// DOM loaded event
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    
    // File input event
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    });
    
    // Location button event
    const locationButton = document.getElementById('locationButton');
    locationButton.addEventListener('click', function() {
        getUserLocation();
        locationButton.textContent = '🌍 Locating...';
        locationButton.disabled = true;
    });
    
    // Tab switching
    document.getElementById('globeTab').addEventListener('click', function() {
        document.getElementById('globeContainer').style.display = 'block';
        document.getElementById('connectionList').style.display = 'none';
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        this.classList.add('active');
    });
    
    document.getElementById('connectionsTab').addEventListener('click', function() {
        document.getElementById('globeContainer').style.display = 'none';
        document.getElementById('connectionList').style.display = 'block';
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        this.classList.add('active');
    });
});