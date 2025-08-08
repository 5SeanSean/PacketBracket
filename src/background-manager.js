// background-manager.js - React-based background manager with proper error handling
const { createRoot } = ReactDOM;

class BackgroundManager {
  constructor() {
    this.root = null;
    this.container = null;
  }

  init() {
    console.log('Initializing BackgroundManager...');
    
    this.container = document.getElementById('globe-background');
    if (!this.container) {
      console.error('Background container not found');
      return;
    }

    // Check if required libraries are available
    if (!window.React || !window.ReactDOM || !window.OGL || !window.FaultyTerminal) {
      console.error('Required libraries not available:', {
        React: !!window.React,
        ReactDOM: !!window.ReactDOM,
        OGL: !!window.OGL,
        FaultyTerminal: !!window.FaultyTerminal
      });
      return;
    }

    console.log('All libraries available, creating React root...');
    this.createTerminal();
  }

  createTerminal() {
    if (this.root) {
      this.root.unmount();
    }

    console.log('Creating React root and rendering FaultyTerminal...');
    
    try {
      this.root = createRoot(this.container);
      
      this.root.render(
        React.createElement('div', {
          style: { width: '100%', height: '100%', position: 'relative' }
        }, 
          React.createElement(window.FaultyTerminal, {
            scale: 1.5,
            gridMul: [2, 1],
            digitSize: 1.2,
            timeScale: 1,
            pause: false,
            scanlineIntensity: 1,
            glitchAmount: 1,
            flickerAmount: 1,
            noiseAmp: 1,
            chromaticAberration: 0,
            dither: 0,
            curvature: 0,
            tint: "#00ff41",
            mouseReact: true,
            mouseStrength: 0.5,
            pageLoadAnimation: false,
            brightness: 0.3
          })
        )
      );
      
      console.log('FaultyTerminal rendered successfully');
    } catch (error) {
      console.error('Error creating FaultyTerminal:', error);
    }
  }

  destroy() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

// Export for global use
window.BackgroundManager = BackgroundManager;
console.log('BackgroundManager defined');
