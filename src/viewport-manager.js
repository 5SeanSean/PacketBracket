// viewport-manager.js - Handles switching between 2D and 3D globe views

class ViewportManager {
    constructor() {
        this.currentView = null;
        this.currentIPData = null;
        
        this.initUI();
        this.setupEventListeners();
    }
    
    initUI() {
        const container = document.getElementById('globe');
        
        // Create control buttons
        this.controls = document.createElement('div');
        this.controls.className = 'viewport-controls';
        this.controls.innerHTML = `
            <button id="globe3D" class="globe-btn active">3D Globe</button>
            <button id="globe2D" class="globe-btn">2D Map</button>
        `;
        
        container.appendChild(this.controls);
    }
    
    setupEventListeners() {
        document.getElementById('globe3D').addEventListener('click', () => this.switchView('3d'));
        document.getElementById('globe2D').addEventListener('click', () => this.switchView('2d'));
    }
    
    switchView(viewType) {
    if (this.currentView === viewType) return;
    
    console.log(`Switching to ${viewType} view`); // Debug logging
    
    // Clean up current view more thoroughly
    this.cleanView(false);
    
    // Update UI buttons
    document.getElementById('globe3D').classList.toggle('active', viewType === '3d');
    document.getElementById('globe2D').classList.toggle('active', viewType === '2d');
    
    // Initialize new view
    this.currentView = viewType;
    
    if (this.currentIPData && this.currentIPData.length > 0) {
        // Small delay to ensure cleanup is complete
        setTimeout(() => {
            try {
                if (viewType === '3d' && window.initGlobe) {
                    console.log('Initializing 3D globe');
                    window.initGlobe(this.currentIPData);
                } else if (viewType === '2d' && window.init2DGlobe) {
                    console.log('Initializing 2D map');
                    window.init2DGlobe(this.currentIPData);
                }
            } catch (error) {
                console.error('Error initializing view:', error);
            }
        }, 50);
    }
}

cleanView(fullClean = true) {
    console.log('Cleaning current view'); // Debug logging
    
    // Clean up current view
    if (this.currentView === '3d' && window.cleanupGlobe) {
        window.cleanupGlobe();
    } else if (this.currentView === '2d' && window.cleanup2DGlobe) {
        window.cleanup2DGlobe();
    }
    
    // More thorough container cleanup
    const container = document.getElementById('globe');
    if (container) {
        // Remove all children except the controls
        Array.from(container.children).forEach(child => {
            if (!child.classList.contains('viewport-controls')) {
                container.removeChild(child);
            }
        });
        
        // Force garbage collection by reducing size
        container.style.width = '0';
        container.style.height = '0';
        setTimeout(() => {
            container.style.width = '100%';
            container.style.height = '100%';
        }, 10);
    }
    
    if (fullClean) {
        this.currentIPData = null;
    }
}
    
    setIPData(ipData) {
        this.currentIPData = ipData;
        
        if (this.currentView === '3d' && window.initGlobe) {
            window.initGlobe(ipData);
        } else if (this.currentView === '2d' && window.init2DGlobe) {
            window.init2DGlobe(ipData);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.viewportManager = new ViewportManager();
    
    // Default to 3D view
    window.viewportManager.switchView('3d');
});