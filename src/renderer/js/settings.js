// Settings UI logic for RoChat

class SettingsManager {
  constructor() {
    this.settings = {
      theme: 'auto',
      autoStartDetection: false
    };
    this.isInitialized = false;
  }

  /**
   * Initialize settings manager
   */
  init() {
    if (this.isInitialized) return;

    // Load settings from localStorage
    this.loadSettings();

    // Apply settings
    this.applySettings();

    // Setup event listeners
    this.setupEventListeners();

    this.isInitialized = true;
    console.log('Settings manager initialized');
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem('rochat-settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
        console.log('Settings loaded:', this.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem('rochat-settings', JSON.stringify(this.settings));
      console.log('Settings saved:', this.settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  /**
   * Apply settings to the application
   */
  applySettings() {
    // Apply theme
    this.applyTheme(this.settings.theme);

    // Update UI elements
    document.getElementById('theme-select').value = this.settings.theme;
    document.getElementById('auto-start-detection').checked = this.settings.autoStartDetection;
  }

  /**
   * Apply theme to the application
   */
  applyTheme(theme) {
    const body = document.body;
    body.classList.remove('theme-light', 'theme-dark', 'theme-auto');

    if (theme === 'auto') {
      // Check system preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        body.classList.add('theme-dark');
      } else {
        body.classList.add('theme-light');
      }
    } else {
      body.classList.add(`theme-${theme}`);
    }

    // Listen for system theme changes if in auto mode
    if (theme === 'auto' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        body.classList.remove('theme-light', 'theme-dark');
        body.classList.add(e.matches ? 'theme-dark' : 'theme-light');
      });
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Theme select
    document.getElementById('theme-select').addEventListener('change', (e) => {
      this.settings.theme = e.target.value;
      this.applyTheme(this.settings.theme);
      this.saveSettings();
    });

    // Auto-start detection checkbox
    document.getElementById('auto-start-detection').addEventListener('change', (e) => {
      this.settings.autoStartDetection = e.target.checked;
      this.saveSettings();
    });

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.handleLogout();
    });
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;

    try {
      if (window.app) {
        await window.app.handleLogout();
      }
    } catch (error) {
      console.error('Logout error:', error);
      alert('Failed to logout');
    }
  }

  /**
   * Get a setting value
   */
  getSetting(key) {
    return this.settings[key];
  }

  /**
   * Set a setting value
   */
  setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    this.applySettings();
  }
}

// Initialize settings manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.settingsManager = new SettingsManager();
  
  // Wait for app to initialize
  setTimeout(() => {
    window.settingsManager.init();
  }, 100);
});
