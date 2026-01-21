// Settings UI logic for RoChat

class SettingsManager {
  constructor() {
    this.settings = {
      theme: 'auto',
      autoStartDetection: false,
      draggableHeader: true,
      alwaysOnTop: true,
      opacity: 100
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
    const themeSelect = document.getElementById('theme-select');
    const autoStartDetection = document.getElementById('auto-start-detection');
    const draggableHeader = document.getElementById('draggable-header');
    const alwaysOnTop = document.getElementById('always-on-top');
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityValue = document.getElementById('opacity-value');

    if (themeSelect) themeSelect.value = this.settings.theme;
    if (autoStartDetection) autoStartDetection.checked = this.settings.autoStartDetection;
    if (draggableHeader) draggableHeader.checked = this.settings.draggableHeader;
    if (alwaysOnTop) alwaysOnTop.checked = this.settings.alwaysOnTop;
    if (opacitySlider) {
      opacitySlider.value = this.settings.opacity;
      if (opacityValue) opacityValue.textContent = this.settings.opacity + '%';
    }

    // Apply draggable setting
    localStorage.setItem('draggable', this.settings.draggableHeader ? 'true' : 'false');
    if (window.app) {
      window.app.updateDraggable();
    }

    // Apply always on top setting
    if (window.electronAPI?.window?.setAlwaysOnTop) {
      window.electronAPI.window.setAlwaysOnTop(this.settings.alwaysOnTop);
    }

    // Apply opacity setting
    if (window.electronAPI?.window?.setOpacity) {
      window.electronAPI.window.setOpacity(this.settings.opacity / 100);
    }
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
    // Close settings window button
    const closeBtn = document.getElementById('close-settings-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.close();
      });
    }

    // Theme select
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        this.settings.theme = e.target.value;
        this.applyTheme(this.settings.theme);
        this.saveSettings();

        // Send theme change to main window
        if (window.electronAPI?.settings?.applyTheme) {
          window.electronAPI.settings.applyTheme(this.settings.theme);
        }
      });
    }

    // Auto-start detection checkbox
    const autoStartDetection = document.getElementById('auto-start-detection');
    if (autoStartDetection) {
      autoStartDetection.addEventListener('change', (e) => {
        this.settings.autoStartDetection = e.target.checked;
        this.saveSettings();
      });
    }

    // Draggable header checkbox
    const draggableHeader = document.getElementById('draggable-header');
    if (draggableHeader) {
      draggableHeader.addEventListener('change', (e) => {
        this.settings.draggableHeader = e.target.checked;
        this.saveSettings();
        localStorage.setItem('draggable', e.target.checked ? 'true' : 'false');
        if (window.app) {
          window.app.updateDraggable();
        }
      });
    }

    // Always on top checkbox
    const alwaysOnTop = document.getElementById('always-on-top');
    if (alwaysOnTop) {
      alwaysOnTop.addEventListener('change', (e) => {
        this.settings.alwaysOnTop = e.target.checked;
        this.saveSettings();
        if (window.electronAPI?.window?.setAlwaysOnTop) {
          window.electronAPI.window.setAlwaysOnTop(e.target.checked);
        }
      });
    }

    // Opacity slider
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityValue = document.getElementById('opacity-value');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        this.settings.opacity = value;
        if (opacityValue) opacityValue.textContent = value + '%';
        if (window.electronAPI?.window?.setOpacity) {
          window.electronAPI.window.setOpacity(value / 100);
        }
      });

      opacitySlider.addEventListener('change', (e) => {
        this.saveSettings();
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.handleLogout();
      });
    }
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
