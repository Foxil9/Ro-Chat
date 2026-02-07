// Settings UI logic for RoChat

class SettingsManager {
  constructor() {
    this.settings = {
      theme: 'auto',
      autoStartDetection: false,
      draggableHeader: true,
      alwaysOnTop: true,
      opacity: 100,
      messageOpacity: 100,
      chatKeybind: null,
      autoHideHeader: false,
      autoHideFooter: false
    };
    this.isInitialized = false;
    this.capturingKeybind = false;
  }

  /**
   * Initialize settings manager
   */
  init() {
    if (this.isInitialized) return;

    // Load settings from localStorage
    this.loadSettings();

    // Ensure theme class is on body (html already has it from inline script)
    const htmlTheme = document.documentElement.className;
    if (htmlTheme && !document.body.className.includes('theme-')) {
      document.body.className = htmlTheme;
    }

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
   * Save settings to localStorage and file
   */
  saveSettings() {
    try {
      localStorage.setItem('rochat-settings', JSON.stringify(this.settings));
      console.log('Settings saved:', this.settings);

      // Also save theme to file via IPC for main process to read on startup
      if (window.electronAPI?.settings?.applyTheme) {
        window.electronAPI.settings.applyTheme(this.settings.theme);
      }
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
    const messageOpacitySlider = document.getElementById('message-opacity-slider');
    const messageOpacityValue = document.getElementById('message-opacity-value');
    const keybindBtn = document.getElementById('keybind-btn');

    if (themeSelect) themeSelect.value = this.settings.theme;
    if (autoStartDetection) autoStartDetection.checked = this.settings.autoStartDetection;
    if (draggableHeader) draggableHeader.checked = this.settings.draggableHeader;
    if (alwaysOnTop) alwaysOnTop.checked = this.settings.alwaysOnTop;
    if (opacitySlider) {
      opacitySlider.value = this.settings.opacity;
      if (opacityValue) opacityValue.textContent = this.settings.opacity + '%';
    }
    if (messageOpacitySlider) {
      messageOpacitySlider.value = this.settings.messageOpacity;
      if (messageOpacityValue) messageOpacityValue.textContent = this.settings.messageOpacity + '%';
    }
    if (keybindBtn && this.settings.chatKeybind) {
      keybindBtn.textContent = this.settings.chatKeybind;
    }

    // Sync auto-hide checkbox states
    const autoHideHeader = document.getElementById('auto-hide-header');
    const autoHideFooter = document.getElementById('auto-hide-footer');
    if (autoHideHeader) autoHideHeader.checked = this.settings.autoHideHeader;
    if (autoHideFooter) autoHideFooter.checked = this.settings.autoHideFooter;

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

    // Apply auto-hide header setting
    this.applyAutoHideHeader(this.settings.autoHideHeader);

    // Apply auto-hide footer setting
    this.applyAutoHideFooter(this.settings.autoHideFooter);
  }

  /**
   * Apply auto-hide header setting
   */
  applyAutoHideHeader(enabled) {
    // Use IPC to communicate with main window
    if (window.electronAPI?.settings?.setAutoHideHeader) {
      window.electronAPI.settings.setAutoHideHeader(enabled);
    }
  }

  /**
   * Apply auto-hide footer setting
   */
  applyAutoHideFooter(enabled) {
    // Use IPC to communicate with main window
    if (window.electronAPI?.settings?.setAutoHideFooter) {
      window.electronAPI.settings.setAutoHideFooter(enabled);
    }
  }

  /**
   * Apply theme to the application
   */
  applyTheme(theme) {
    const body = document.body;
    const html = document.documentElement;

    // Remove theme classes from both body and html
    body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
    html.classList.remove('theme-light', 'theme-dark', 'theme-auto');

    if (theme === 'auto') {
      // Check system preference
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const themeClass = isDark ? 'theme-dark' : 'theme-light';
      body.classList.add(themeClass);
      html.classList.add(themeClass);
    } else {
      const themeClass = `theme-${theme}`;
      body.classList.add(themeClass);
      html.classList.add(themeClass);
    }

    // Listen for system theme changes if in auto mode
    if (theme === 'auto' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        body.classList.remove('theme-light', 'theme-dark');
        html.classList.remove('theme-light', 'theme-dark');
        const themeClass = e.matches ? 'theme-dark' : 'theme-light';
        body.classList.add(themeClass);
        html.classList.add(themeClass);
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

    // Message opacity slider
    const messageOpacitySlider = document.getElementById('message-opacity-slider');
    const messageOpacityValue = document.getElementById('message-opacity-value');
    if (messageOpacitySlider) {
      messageOpacitySlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        this.settings.messageOpacity = value;
        if (messageOpacityValue) messageOpacityValue.textContent = value + '%';

        // Apply message opacity to main window
        localStorage.setItem('message-opacity', value);
        if (window.electronAPI?.settings?.setMessageOpacity) {
          window.electronAPI.settings.setMessageOpacity(value);
        }
      });

      messageOpacitySlider.addEventListener('change', (e) => {
        this.saveSettings();
      });
    }

    // Auto-hide header checkbox
    const autoHideHeader = document.getElementById('auto-hide-header');
    if (autoHideHeader) {
      autoHideHeader.addEventListener('change', (e) => {
        this.settings.autoHideHeader = e.target.checked;
        this.saveSettings();
        this.applyAutoHideHeader(e.target.checked);
      });
    }

    // Auto-hide footer checkbox
    const autoHideFooter = document.getElementById('auto-hide-footer');
    if (autoHideFooter) {
      autoHideFooter.addEventListener('change', (e) => {
        this.settings.autoHideFooter = e.target.checked;
        this.saveSettings();
        this.applyAutoHideFooter(e.target.checked);
      });
    }

    // Keybind capture
    const keybindBtn = document.getElementById('keybind-btn');
    if (keybindBtn) {
      keybindBtn.addEventListener('click', () => {
        this.captureKeybind(keybindBtn);
      });
    }

    // Reset position button
    const resetPosBtn = document.getElementById('reset-position-btn');
    if (resetPosBtn) {
      resetPosBtn.addEventListener('click', async () => {
        if (window.electronAPI?.settings?.resetPosition) {
          await window.electronAPI.settings.resetPosition();
        }
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
   * Capture keybind
   */
  captureKeybind(button) {
    if (this.capturingKeybind) return;

    this.capturingKeybind = true;
    button.textContent = 'Press keys...';
    button.style.borderColor = 'var(--primary)'; // Changed from --accent-purple to use theme's primary color

    const handleKeyDown = (e) => {
      e.preventDefault();

      // Ignore if only modifier keys pressed
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      keys.push(e.key.toUpperCase());

      const keybind = keys.join('+');
      this.settings.chatKeybind = keybind;
      button.textContent = keybind;
      this.saveSettings();

      if (window.electronAPI?.settings?.registerKeybind) {
        window.electronAPI.settings.registerKeybind(keybind);
      }

      button.style.borderColor = 'var(--border-color)'; // Changed from hardcoded purple to theme border color
      this.capturingKeybind = false;
      document.removeEventListener('keydown', handleKeyDown);
    };

    document.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;

    try {
      const result = await window.electronAPI.auth.logout();

      if (result.success) {
        // Close settings window after logout
        window.close();
      } else {
        alert('Failed to logout');
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
