// Chat UI logic for RoChat - Updated for new UI design

class ChatManager {
  constructor() {
    this.messages = [];
    this.messageInput = null;
    this.sendButton = null;
    this.messagesContainer = null;
    this.jobIdDisplay = null;
    this.gameNameDisplay = null;
    this.currentJobId = null;
    this.isInitialized = false;
  }

  /**
   * Initialize chat manager
   */
  init() {
    if (this.isInitialized) return;

    // Get DOM elements (updated IDs to match new design)
    this.messageInput = document.getElementById('chatInput');
    this.sendButton = document.getElementById('btnSend');
    this.messagesContainer = document.getElementById('messageContainer');
    this.jobIdDisplay = document.getElementById('jobIdDisplay');
    this.gameNameDisplay = document.getElementById('gameName');

    // Setup event listeners
    this.setupEventListeners();

    // Listen for server detection changes
    this.setupServerListener();

    this.isInitialized = true;
    console.log('Chat manager initialized');
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
      this.updateJobIdDisplay('Detecting...');
      this.clearMessages();
      this.addSystemMessage('Waiting for Roblox game...');
      return;
    }

    // Server detected
    const { placeId, jobId } = serverInfo;
    this.currentJobId = jobId;
    
    // Update UI
    this.updateJobIdDisplay(jobId);
    this.clearMessages();
    this.addSystemMessage(`Connected to game server!`);
    
    // Load chat history for this JobId
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

    if (!this.currentJobId) {
      this.addSystemMessage('No game server connected. Please join a Roblox game.');
      return;
    }

    // Add message to UI immediately (optimistic update)
    const currentUser = await this.getCurrentUser();
    this.addMessage({
      userId: currentUser?.userId || 'local',
      username: currentUser?.username || 'You',
      message: message,
      timestamp: Date.now(),
      isLocal: true
    });

    // Clear input
    this.messageInput.value = '';

    // Send to backend via IPC
    try {
      if (window.electron && window.electron.sendMessage) {
        const result = await window.electron.sendMessage({
          jobId: this.currentJobId,
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
    const message = {
      userId: messageData.userId,
      username: messageData.username,
      message: messageData.message,
      timestamp: messageData.timestamp || Date.now(),
      isLocal: messageData.isLocal || false
    };

    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  /**
   * Add system message
   */
  addSystemMessage(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'system-msg';
    messageEl.textContent = text;
    this.messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
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

    // Create message structure matching new design
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
    this.messages = [];
    this.messagesContainer.innerHTML = '';
  }

  /**
   * Load chat history from backend
   */
  async loadHistory() {
    if (!this.currentJobId) return;

    try {
      // Clear current messages
      this.clearMessages();
      this.addSystemMessage('Loading chat history...');

      if (window.electron && window.electron.loadHistory) {
        const result = await window.electron.loadHistory(this.currentJobId);
        
        if (result.success && result.messages) {
          // Clear loading message
          this.clearMessages();
          
          // Render all messages
          result.messages.forEach(msg => {
            this.addMessage({
              userId: msg.userId,
              username: msg.username,
              message: msg.message,
              timestamp: new Date(msg.timestamp).getTime(),
              isLocal: false
            });
          });

          if (result.messages.length === 0) {
            this.addSystemMessage('No previous messages.');
          }
        }
      } else {
        // Mock history load
        console.log('Mock history load for JobId:', this.currentJobId);
        this.clearMessages();
        this.addSystemMessage('Chat history loaded.');
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      this.clearMessages();
      this.addSystemMessage('Failed to load chat history.');
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