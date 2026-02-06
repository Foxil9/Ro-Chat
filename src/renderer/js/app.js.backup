// Main app logic for RoChat renderer

class RoChatApp {
  constructor() {
    this.currentUser = null;
    this.currentView = null;
    this.isInitialized = false;
    this.autoHideHeaderEnabled = false;
    this.headerHideTimer = null;
    this.windowBlurred = false;
    this.autoHideListeners = null;
    this.autoHideFooterEnabled = false;
    this.socketConnected = false;
    this.connectionCheckInterval = null;
  }

  /**
   * Initialize application
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Load and apply saved theme
      const savedTheme = this.loadSavedTheme();
      this.applyTheme(savedTheme);

      // Load and apply auto-hide settings
      const savedSettings = this.loadSavedSettings();
      if (savedSettings) {
        this.autoHideHeaderEnabled = savedSettings.autoHideHeader || false;
        this.autoHideFooterEnabled = savedSettings.autoHideFooter || false;
      }

      // Register saved keybind
      this.registerSavedKeybind();

      // Check authentication status
      const status = await window.electronAPI.auth.getStatus();

      if (status.success && status.authenticated) {
        this.currentUser = status.user;
        this.showView('chat');
        await this.startDetection();
        // Start connection monitoring
        this.startConnectionMonitoring();
      } else {
        this.showView('login');
      }

      // Setup event listeners
      this.setupEventListeners();

      this.isInitialized = true;
      console.log('RoChat initialized');
    } catch (error) {
      console.error('Failed to initialize:', error);
      this.showView('login');
    }
  }

  /**
   * Start monitoring socket connection status
   */
  startConnectionMonitoring() {
    // Check connection every 5 seconds
    this.connectionCheckInterval = setInterval(() => {
      this.checkSocketConnection();
    }, 5000);

    // Initial check
    this.checkSocketConnection();
  }

  /**
   * Stop connection monitoring
   */
  stopConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  /**
   * Check if socket is actually connected
   */
  checkSocketConnection() {
    try {
      // Get socket status from chat manager if available
      if (window.chatManager && window.chatManager.socket) {
        this.socketConnected = window.chatManager.socket.connected;
      } else {
        this.socketConnected = false;
      }
    } catch (error) {
      console.error('Failed to check socket connection:', error);
      this.socketConnected = false;
    }
  }

  /**
   * Register saved keybind from settings
   */
  async registerSavedKeybind() {
    try {
      const saved = localStorage.getItem('rochat-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.chatKeybind && window.electronAPI?.settings?.registerKeybind) {
          await window.electronAPI.settings.registerKeybind(settings.chatKeybind);
          console.log('Registered saved keybind:', settings.chatKeybind);
        }
      }
    } catch (error) {
      console.error('Failed to register saved keybind:', error);
      // Non-critical error, continue initialization
    }
  }

  /**
   * Load saved theme from localStorage
   */
  loadSavedTheme() {
    try {
      const saved = localStorage.getItem('rochat-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        return settings.theme || 'dark';
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
    return 'dark';
  }

  /**
   * Load saved settings from localStorage
   */
  loadSavedSettings() {
    try {
      const saved = localStorage.getItem('rochat-settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return null;
  }

  /**
   * Setup global event listeners
   */
  setupEventListeners() {
    // Window controls (only in chat view)
    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.window.minimize();
        if (result && result.isMinimized !== undefined) {
          this.toggleMinimizedView(result.isMinimized);
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.electronAPI.window.close();
      });
    }

    // Login button
    document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());

    // Settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        window.electronAPI.window.openSettings();
      });
    }

    // F11 fullscreen toggle
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        window.electron.toggleFullscreen();
      }
    });

    // Listen for server changes
    window.electronAPI.detection.onServerChanged((serverInfo) => {
      this.handleServerChanged(serverInfo);
    });

    // Load draggable setting
    this.updateDraggable();

    // Listen for theme changes from settings window
    if (window.electronAPI?.onThemeChanged) {
      window.electronAPI.onThemeChanged((theme) => {
        this.applyTheme(theme);
      });
    }

    // Listen for keybind to focus chat
    if (window.electronAPI?.onFocusChat) {
      window.electronAPI.onFocusChat(() => {
        const input = document.getElementById('message-input');
        if (input) input.focus();
      });
    }

    // Listen for auto-hide header changes from settings window
    if (window.electronAPI?.onAutoHideHeaderChanged) {
      window.electronAPI.onAutoHideHeaderChanged((enabled) => {
        this.setAutoHideHeader(enabled);
      });
    }

    // Listen for auto-hide footer changes from settings window
    if (window.electronAPI?.onAutoHideFooterChanged) {
      window.electronAPI.onAutoHideFooterChanged((enabled) => {
        this.setAutoHideFooter(enabled);
      });
    }

    // Listen for logout event
    if (window.electronAPI?.onLogout) {
      window.electronAPI.onLogout(() => {
        console.log('Logout event received');
        this.currentUser = null;
        this.stopConnectionMonitoring();
        this.showView('login');

        // Reset login button state
        const loginBtn = document.getElementById('login-btn');
        const statusEl = document.getElementById('login-status');
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.textContent = 'Login with Roblox';
        }
        if (statusEl) {
          statusEl.textContent = '';
          statusEl.className = 'status';
        }
      });
    }

    // Setup auto-hide header if enabled
    if (this.autoHideHeaderEnabled) {
      this.setupAutoHideHeader();
    }

    // Apply saved footer visibility
    if (this.autoHideFooterEnabled) {
      this.setAutoHideFooter(true);
    }
  }

  /**
   * Setup auto-hide header event listeners
   */
  setupAutoHideHeader() {
    // Prevent duplicate listener attachment
    if (this.autoHideListeners) return;

    const chatView = document.getElementById('chat-view');
    const chatHeader = document.getElementById('chat-header');

    if (!chatView || !chatHeader) return;

    // Create and store listener references for cleanup
    this.autoHideListeners = {
      blur: () => {
        this.windowBlurred = true;
        if (this.autoHideHeaderEnabled) {
          this.hideHeader();
        }
      },
      focus: () => {
        this.windowBlurred = false;
        if (this.autoHideHeaderEnabled) {
          this.showHeader();
        }
      },
      mouseleave: () => {
        if (this.autoHideHeaderEnabled) {
          this.headerHideTimer = setTimeout(() => {
            this.hideHeader();
          }, 150);
        }
      },
      mouseenter: () => {
        if (this.headerHideTimer) {
          clearTimeout(this.headerHideTimer);
          this.headerHideTimer = null;
        }
        if (this.autoHideHeaderEnabled) {
          this.showHeader();
        }
      }
    };

    // Attach listeners
    window.addEventListener('blur', this.autoHideListeners.blur);
    window.addEventListener('focus', this.autoHideListeners.focus);
    chatView.addEventListener('mouseleave', this.autoHideListeners.mouseleave);
    chatView.addEventListener('mouseenter', this.autoHideListeners.mouseenter);
  }

  /**
   * Remove auto-hide header event listeners
   */
  teardownAutoHideHeader() {
    if (!this.autoHideListeners) return;

    const chatView = document.getElementById('chat-view');

    // Remove all listeners
    window.removeEventListener('blur', this.autoHideListeners.blur);
    window.removeEventListener('focus', this.autoHideListeners.focus);
    if (chatView) {
      chatView.removeEventListener('mouseleave', this.autoHideListeners.mouseleave);
      chatView.removeEventListener('mouseenter', this.autoHideListeners.mouseenter);
    }

    // Clear timer if active
    if (this.headerHideTimer) {
      clearTimeout(this.headerHideTimer);
      this.headerHideTimer = null;
    }

    // Clear listener references
    this.autoHideListeners = null;
  }

  /**
   * Hide header
   */
  hideHeader() {
    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) {
      chatHeader.classList.add('auto-hidden');
    }
  }

  /**
   * Show header
   */
  showHeader() {
    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) {
      chatHeader.classList.remove('auto-hidden');
    }
  }

  /**
   * Enable or disable auto-hide header
   */
  setAutoHideHeader(enabled) {
    this.autoHideHeaderEnabled = enabled;

    if (enabled) {
      // Attach listeners when enabling
      this.setupAutoHideHeader();

      // Apply current state
      if (this.windowBlurred) {
        this.hideHeader();
      }
    } else {
      // Remove listeners when disabling
      this.teardownAutoHideHeader();

      // Always show header when disabled
      this.showHeader();
    }
  }

  /**
   * Enable or disable auto-hide footer
   */
  setAutoHideFooter(enabled) {
    this.autoHideFooterEnabled = enabled;

    const chatFooter = document.querySelector('.chat-footer');
    if (chatFooter) {
      if (enabled) {
        chatFooter.classList.add('auto-hidden');
      } else {
        chatFooter.classList.remove('auto-hidden');
      }
    }
  }

  /**
   * Apply theme
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
  }

  /**
   * Show a specific view
   */
  showView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.add('hidden');
    });

    // Show requested view
    const view = document.getElementById(`${viewName}-view`);
    if (view) {
      view.classList.remove('hidden');
    }

    this.currentView = viewName;
    console.log('View changed to:', viewName);

    // Update user info if showing chat
    if (viewName === 'chat' && this.currentUser) {
      this.updateUserDisplay();
    }
  }

  /**
   * Update user display in header
   */
  updateUserDisplay() {
    if (!this.currentUser) return;

    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');

    if (avatarEl) {
      if (this.currentUser.picture) {
        avatarEl.src = this.currentUser.picture;
        avatarEl.style.display = 'block';
        avatarEl.onerror = () => {
          console.error('Failed to load avatar:', this.currentUser.picture);
          avatarEl.style.display = 'none';
        };
      } else {
        avatarEl.style.display = 'none';
        console.log('No picture URL for user:', this.currentUser);
      }
    }

    if (nameEl) {
      nameEl.textContent = this.currentUser.username || this.currentUser.displayName || 'User';
    }
  }

  /**
   * Update draggable setting
   */
  updateDraggable() {
    const draggable = localStorage.getItem('draggable') !== 'false';
    const header = document.getElementById('chat-header');
    if (header) {
      if (draggable) {
        header.classList.add('draggable');
      } else {
        header.classList.remove('draggable');
      }
    }
  }

  /**
   * Toggle minimized view
   */
  toggleMinimizedView(isMinimized) {
    const chatView = document.getElementById('chat-view');
    const chatContainer = chatView?.querySelector('.chat-container');

    if (chatContainer) {
      if (isMinimized) {
        chatContainer.classList.add('minimized');
        document.body.classList.add('minimized');
      } else {
        chatContainer.classList.remove('minimized');
        document.body.classList.remove('minimized');
      }
    }
  }

  /**
   * Handle login
   */
  async handleLogin() {
    const loginBtn = document.getElementById('login-btn');
    const statusEl = document.getElementById('login-status');

    if (!loginBtn || !statusEl) {
      console.error('Login elements not found');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    statusEl.textContent = '';

    try {
      const result = await window.electronAPI.auth.login();

      if (result.success) {
        this.currentUser = result.user;
        console.log('Login successful');
        statusEl.textContent = 'Login successful!';
        statusEl.className = 'status success';

        setTimeout(() => {
          this.showView('chat');
          this.startDetection();
          this.startConnectionMonitoring();
        }, 500);
      } else {
        console.error('Login failed:', result.error);
        statusEl.textContent = result.error || 'Login failed';
        statusEl.className = 'status error';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login with Roblox';
      }
    } catch (error) {
      console.error('Login error:', error);
      statusEl.textContent = 'An error occurred';
      statusEl.className = 'status error';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login with Roblox';
    }
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;

    try {
      const result = await window.electronAPI.auth.logout();

      if (result.success) {
        this.currentUser = null;
        this.stopConnectionMonitoring();
        this.showView('login');
      }
    } catch (error) {
      console.error('Logout error:', error);
      alert('Failed to logout');
    }
  }

  /**
   * Start detection
   */
  async startDetection() {
    try {
      const result = await window.electronAPI.detection.start();
      console.log('Detection started');
    } catch (error) {
      console.error('Failed to start detection:', error);
      // Non-critical, user can still use chat
    }
  }

  /**
   * Handle server changed event
   */
  handleServerChanged(serverInfo) {
    const statusDot = document.getElementById('status-dot');
    const serverText = document.getElementById('server-text');

    if (!statusDot || !serverText) return;

    try {
      if (serverInfo && serverInfo.placeId && serverInfo.jobId) {
        // Check if actually connected to chat via socket
        this.checkSocketConnection();
        
        if (this.socketConnected) {
          // Actually connected to chat socket
          statusDot.className = 'status-dot connected';
          serverText.textContent = 'Connected!';
          console.log('Connected to server and chat');
        } else {
          // Have game info but not connected to chat socket yet
          statusDot.className = 'status-dot ingame';
          serverText.textContent = 'In-game (connecting...)';
          console.log('In-game but not connected to chat yet');
        }
      } else if (serverInfo && serverInfo.placeId) {
        // In-game but no jobId yet
        statusDot.className = 'status-dot ingame';
        serverText.textContent = 'In-game';
        console.log('In-game');
      } else {
        // Not connected
        statusDot.className = 'status-dot';
        serverText.textContent = 'Not connected';
        console.log('Disconnected from server');
      }
    } catch (error) {
      console.error('Error updating server status:', error);
    }
  }
}

// Global error handler to prevent crashes
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  event.preventDefault(); // Prevent default handling
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent default handling
});

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new RoChatApp();
    window.app.init();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    // Show error state in UI
    document.body.innerHTML = '<div style="color: red; padding: 20px;">Failed to initialize RoChat. Please restart the application.</div>';
  }
});