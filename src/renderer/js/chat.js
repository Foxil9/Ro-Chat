// Chat UI logic for RoChat - Updated with Server/Global tabs

class ChatManager {
  constructor() {
    this.messages = { server: [], global: [] };
    this.messageInput = null;
    this.sendButton = null;
    this.messagesContainer = null;
    this.jobIdDisplay = null;
    this.gameNameDisplay = null;
    this.currentJobId = null;
    this.currentPlaceId = null;
    this.activeTab = 'server'; // 'server' or 'global'
    this.isInitialized = false;
    this.MAX_MESSAGES = 50;
  }

  /**
   * Initialize chat manager
   */
  init() {
    if (this.isInitialized) return;

    // Get DOM elements (using correct IDs from index.html)
    this.messageInput = document.getElementById('message-input');
    this.sendButton = document.getElementById('send-btn');
    this.messagesContainer = document.getElementById('chat-messages');
    this.jobIdDisplay = document.getElementById('server-text'); // Use server-text for now
    this.gameNameDisplay = document.getElementById('user-name');

    // Create tab UI if it doesn't exist
    this.createTabUI();

    // Setup event listeners
    this.setupEventListeners();

    // Listen for server detection changes
    this.setupServerListener();

    this.isInitialized = true;
    console.log('Chat manager initialized');
  }

  /**
   * Create tab UI
   */
  createTabUI() {
    // Tab HTML is already in index.html, just setup click handlers
    const serverTab = document.getElementById('tab-server');
    const globalTab = document.getElementById('tab-global');

    if (serverTab) {
      serverTab.onclick = () => this.switchTab('server');
    }

    if (globalTab) {
      globalTab.onclick = () => this.switchTab('global');
    }
  }

  /**
   * Switch between Server and Global tabs
   */
  switchTab(tab) {
    if (this.activeTab === tab) return;

    this.activeTab = tab;

    // Update tab buttons
    document.getElementById('tab-server').className = tab === 'server' ? 'chat-tab active' : 'chat-tab';
    document.getElementById('tab-global').className = tab === 'global' ? 'chat-tab active' : 'chat-tab';

    // Render messages for active tab
    this.renderAllMessages();

    console.log('Switched to tab:', tab);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Send button click
    if (this.sendButton) {
      this.sendButton.addEventListener('click', () => this.sendMessage());
    }

    // Enter key to send
    if (this.messageInput) {
      this.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Logout button
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => this.handleLogout());
    }

    // Settings button
    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => this.showSettings());
    }

    // History button
    const btnHistory = document.getElementById('btnHistory');
    if (btnHistory) {
      btnHistory.addEventListener('click', () => this.loadHistory());
    }
  }

  /**
   * Setup listener for server detection changes
   */
  setupServerListener() {
    if (window.electron && window.electron.onServerChanged) {
      window.electron.onServerChanged((serverInfo) => {
        this.handleServerChanged(serverInfo);
      });
    }
  }

  /**
   * Handle server change event
   */
  handleServerChanged(serverInfo) {
    if (!serverInfo) {
      // No server detected
      this.currentJobId = null;
      this.currentPlaceId = null;
      this.updateJobIdDisplay('Detecting...');
      this.clearMessages();
      this.addSystemMessage('Waiting for Roblox game...', 'server');
      this.addSystemMessage('Waiting for Roblox game...', 'global');
      return;
    }

    // Server detected
    const { placeId, jobId } = serverInfo;
    this.currentJobId = jobId;
    this.currentPlaceId = placeId;

    // Update UI
    this.updateJobIdDisplay(jobId);
    this.clearMessages();
    this.addSystemMessage(`Connected to server!`, 'server');
    this.addSystemMessage(`Connected to game!`, 'global');

    // Load chat history for both tabs
    this.loadHistory();

    console.log('Server changed:', { placeId, jobId });
  }

  /**
   * Update JobId display badge
   */
  updateJobIdDisplay(jobId) {
    if (this.jobIdDisplay) {
      if (jobId === 'Detecting...') {
        this.jobIdDisplay.textContent = 'JobId: Detecting...';
        this.jobIdDisplay.className = 'badge';
      } else {
        // Show shortened JobId
        const shortId = jobId.substring(0, 8) + '...';
        this.jobIdDisplay.textContent = `JobId: ${shortId}`;
        this.jobIdDisplay.className = 'badge online';
        this.jobIdDisplay.title = jobId; // Full ID on hover
      }
    }
  }

  /**
   * Send a message
   */
  async sendMessage() {
    const message = this.messageInput.value.trim();

    if (!message) return;

    // Check if connected
    if (this.activeTab === 'server' && !this.currentJobId) {
      this.addSystemMessage('No game server connected. Please join a Roblox game.', 'server');
      return;
    }

    if (this.activeTab === 'global' && !this.currentPlaceId) {
      this.addSystemMessage('No game connected. Please join a Roblox game.', 'global');
      return;
    }

    // Add message to UI immediately (optimistic update)
    const currentUser = await this.getCurrentUser();
    this.addMessage({
      userId: currentUser?.userId || 'local',
      username: currentUser?.username || 'You',
      message: message,
      timestamp: Date.now(),
      isLocal: true,
      chatType: this.activeTab
    });

    // Clear input
    this.messageInput.value = '';

    // Send to backend via IPC
    try {
      if (window.electron && window.electron.sendMessage) {
        const result = await window.electron.sendMessage({
          jobId: this.currentJobId,
          placeId: this.currentPlaceId,
          chatType: this.activeTab,
          message: message
        });

        if (!result.success) {
          this.showMessageError(message, result.error);
        }
      } else {
        console.log('Mock send:', message);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      this.showMessageError(message, error.message);
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser() {
    try {
      if (window.electron && window.electron.getAuthStatus) {
        const status = await window.electron.getAuthStatus();
        return status.user;
      }
    } catch (error) {
      console.error('Failed to get user:', error);
    }
    return null;
  }

  /**
   * Add a message to the chat
   */
  addMessage(messageData) {
    const chatType = messageData.chatType || this.activeTab;
    const message = {
      userId: messageData.userId,
      username: messageData.username,
      message: messageData.message,
      timestamp: messageData.timestamp || Date.now(),
      isLocal: messageData.isLocal || false,
      chatType
    };

    // Add to appropriate tab
    this.messages[chatType].push(message);

    // Enforce 50 message limit client-side
    if (this.messages[chatType].length > this.MAX_MESSAGES) {
      this.messages[chatType].shift();
    }

    // Only render if this is the active tab
    if (chatType === this.activeTab) {
      this.renderMessage(message);
      this.scrollToBottom();
    }
  }

  /**
   * Add system message
   */
  addSystemMessage(text, chatType) {
    const targetType = chatType || this.activeTab;

    // Only render if this is the active tab
    if (targetType === this.activeTab) {
      const messageEl = document.createElement('div');
      messageEl.className = 'system-msg';
      messageEl.textContent = text;
      this.messagesContainer.appendChild(messageEl);
      this.scrollToBottom();
    }
  }

  /**
   * Render a single message
   */
  renderMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-msg ${message.isLocal ? 'local' : 'remote'}`;

    const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    const authorEl = document.createElement('div');
    authorEl.className = 'msg-author';
    authorEl.textContent = this.escapeHtml(message.username);

    const contentEl = document.createElement('div');
    contentEl.className = 'msg-content';
    contentEl.textContent = this.escapeHtml(message.message);

    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = timestamp;

    messageEl.appendChild(authorEl);
    messageEl.appendChild(contentEl);
    messageEl.appendChild(timeEl);

    this.messagesContainer.appendChild(messageEl);
  }

  /**
   * Render all messages for active tab
   */
  renderAllMessages() {
    this.messagesContainer.innerHTML = '';

    const messagesForTab = this.messages[this.activeTab] || [];
    messagesForTab.forEach(msg => {
      this.renderMessage(msg);
    });

    this.scrollToBottom();
  }

  /**
   * Show message error
   */
  showMessageError(originalMessage, errorText) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-msg error';

    const authorEl = document.createElement('div');
    authorEl.className = 'msg-author';
    authorEl.textContent = 'Error';

    const contentEl = document.createElement('div');
    contentEl.className = 'msg-content';
    contentEl.textContent = `Failed to send: ${this.escapeHtml(originalMessage)}`;
    if (errorText) {
      contentEl.textContent += ` (${errorText})`;
    }

    messageEl.appendChild(authorEl);
    messageEl.appendChild(contentEl);

    this.messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    this.messages = { server: [], global: [] };
    this.messagesContainer.innerHTML = '';
  }

  /**
   * Load chat history from backend
   */
  async loadHistory() {
    try {
      // Load both server and global history
      await Promise.all([
        this.loadHistoryForTab('server'),
        this.loadHistoryForTab('global')
      ]);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }

  /**
   * Load history for specific tab
   */
  async loadHistoryForTab(chatType) {
    const isCurrentTab = chatType === this.activeTab;

    if (chatType === 'server' && !this.currentJobId) {
      if (isCurrentTab) {
        this.addSystemMessage('No server connected.', chatType);
      }
      return;
    }

    if (chatType === 'global' && !this.currentPlaceId) {
      if (isCurrentTab) {
        this.addSystemMessage('No game connected.', chatType);
      }
      return;
    }

    try {
      if (isCurrentTab) {
        this.messagesContainer.innerHTML = '';
        this.addSystemMessage('Loading chat history...', chatType);
      }

      if (window.electron && window.electron.loadHistory) {
        const result = await window.electron.loadHistory({
          jobId: this.currentJobId,
          placeId: this.currentPlaceId,
          chatType
        });

        if (result.success && result.messages) {
          // Clear tab messages
          this.messages[chatType] = [];

          // Add all messages
          result.messages.forEach(msg => {
            this.messages[chatType].push({
              userId: msg.userId,
              username: msg.username,
              message: msg.message,
              timestamp: new Date(msg.timestamp).getTime(),
              isLocal: false,
              chatType
            });
          });

          // Render if active tab
          if (isCurrentTab) {
            this.renderAllMessages();

            if (result.messages.length === 0) {
              this.addSystemMessage('No previous messages.', chatType);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to load ${chatType} history:`, error);
      if (isCurrentTab) {
        this.messagesContainer.innerHTML = '';
        this.addSystemMessage('Failed to load chat history.', chatType);
      }
    }
  }

  /**
   * Scroll chat to bottom
   */
  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;

    try {
      if (window.electron && window.electron.logout) {
        const result = await window.electron.logout();
        if (result.success) {
          window.location.href = 'login.html';
        }
      }
    } catch (error) {
      console.error('Logout error:', error);
      alert('Failed to logout');
    }
  }

  /**
   * Show settings
   */
  showSettings() {
    window.location.href = 'settings.html';
  }
}

// Initialize chat manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.chatManager = new ChatManager();

  // Wait for app to initialize
  setTimeout(() => {
    window.chatManager.init();
  }, 100);
});
