// Main app logic for RoChat renderer

class RoChatApp {
  constructor() {
    this.currentUser = null;
    this.currentView = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Check authentication status
      const status = await window.electronAPI.auth.getStatus();
      
      if (status.success && status.authenticated) {
        this.currentUser = status.user;
        this.showView('chat');
        await this.startDetection();
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
   * Setup global event listeners
   */
  setupEventListeners() {
    // Login button
    document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
    
    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => this.showView('settings'));
    
    // Close settings button
    document.getElementById('close-settings-btn').addEventListener('click', () => this.showView('chat'));
    
    // Listen for server changes
    window.electronAPI.detection.onServerChanged((serverInfo) => {
      this.handleServerChanged(serverInfo);
    });
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
      document.getElementById('user-info').textContent = this.currentUser.username;
    }
  }

  /**
   * Handle login
   */
  async handleLogin() {
    const loginBtn = document.getElementById('login-btn');
    const statusEl = document.getElementById('login-status');

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    statusEl.textContent = '';

    try {
      const result = await window.electronAPI.auth.login();

      if (result.success) {
        this.currentUser = result.user;
        console.log('Login successful:', this.currentUser);
        statusEl.textContent = 'Login successful!';
        statusEl.className = 'status success';
        
        setTimeout(() => {
          this.showView('chat');
          this.startDetection();
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
      console.log('Detection started:', result);
    } catch (error) {
      console.error('Failed to start detection:', error);
    }
  }

  /**
   * Handle server changed event
   */
  handleServerChanged(serverInfo) {
    const serverInfoEl = document.getElementById('server-info');
    const statusDot = serverInfoEl.querySelector('.status-dot');
    const serverText = serverInfoEl.querySelector('.server-text');

    if (serverInfo && serverInfo.placeId && serverInfo.jobId) {
      statusDot.className = 'status-dot online';
      serverText.textContent = `Connected (Place: ${serverInfo.placeId})`;
      console.log('Server changed:', serverInfo);
    } else {
      statusDot.className = 'status-dot offline';
      serverText.textContent = 'Not connected';
      console.log('Disconnected from server');
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new RoChatApp();
  window.app.init();
});
