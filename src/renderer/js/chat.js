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
    this.serverWakeupWarningShown = false;
    this.SLOW_REQUEST_THRESHOLD = 3000; // 3 seconds
    this.cooldownTimer = null;
    this.cooldownEndTime = null;
    this.typingTimeout = null;
    this.currentlyTyping = false;
    this.typingUsers = new Set();
    this.userId = null;
  }

  /**
   * Initialize chat manager
   */
  async init() {
    if (this.isInitialized) return;

    // Get DOM elements (using correct IDs from index.html)
    this.messageInput = document.getElementById('message-input');
    this.sendButton = document.getElementById('send-btn');
    this.messagesContainer = document.getElementById('chat-messages');
    this.jobIdDisplay = document.getElementById('server-text');
    this.gameNameDisplay = document.getElementById('user-name');

    // Get current user ID
    await this.loadCurrentUserId();

    // Create tab UI if it doesn't exist
    this.createTabUI();

    // Setup event listeners
    this.setupEventListeners();

    // Listen for server detection changes
    this.setupServerListener();

    // Setup typing indicator listeners
    this.setupTypingListener();

    // Setup message update listeners
    this.setupMessageUpdateListeners();

    // Apply message opacity from settings
    this.applyMessageOpacity();

    // Register saved keybind
    this.registerSavedKeybind();

    // Set Buy Me a Coffee link 
    if (window.externalLinkHandler) {
      window.externalLinkHandler.setCoffeeLink('https://ko-fi.com/foxil9');
    }

    this.isInitialized = true;
    console.log('Chat manager initialized');
  }

 /**
   * Load current user ID
   */
  async loadCurrentUserId() {
    try {
      const user = await this.getCurrentUser();
      if (user) {
        // CRITICAL: Convert to number to match server messages
        this.userId = parseInt(user.userId);
        console.log('✅ User ID loaded:', this.userId, '(type:', typeof this.userId, ')');
      }
    } catch (error) {
      console.error('Failed to load user ID:', error);
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
          console.log('Chat: Registered saved keybind:', settings.chatKeybind);
        }
      }
    } catch (error) {
      console.error('Chat: Failed to register saved keybind:', error);
    }
  }

  /**
   * Apply message opacity from settings
   */
  applyMessageOpacity() {
    const opacity = localStorage.getItem('message-opacity') || 100;
    const style = document.createElement('style');
    style.id = 'message-opacity-style';
    style.textContent = `.chat-msg { opacity: ${opacity / 100} !important; }`;
    document.head.appendChild(style);

    // Listen for opacity changes
    window.addEventListener('storage', (e) => {
      if (e.key === 'message-opacity') {
        const style = document.getElementById('message-opacity-style');
        if (style) {
          style.textContent = `.chat-msg { opacity: ${e.newValue / 100} !important; }`;
        }
      }
    });
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

    // Clear typing indicators when switching tabs
    this.typingUsers.clear();
    this.updateTypingIndicator();

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

      // Typing indicator with 2-second debounce
      this.messageInput.addEventListener('input', () => {
        this.handleTyping();
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

    // History feature removed - users only see messages sent after they join
    // const btnHistory = document.getElementById('btnHistory');
    // if (btnHistory) {
    //   btnHistory.addEventListener('click', () => this.loadHistory());
    // }

    // Connect button
    const btnConnect = document.getElementById('connect-btn');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => this.handleConnect());
    }

    // REMOVED GAME BROWSER FEATURE
    // Browse button event listener removed - violates RoChat's overlay-only design
  }

  /**
   * Handle connect button click
   */
  async handleConnect() {
    try {
      if (window.electron && window.electron.startDetection) {
        const result = await window.electron.startDetection();
        if (result.success) {
          this.addSystemMessage('Starting detection...', 'server');
        } else {
          this.addSystemMessage('Failed to start detection', 'server');
        }
      }
    } catch (error) {
      console.error('Failed to start detection:', error);
      this.addSystemMessage('Error starting detection', 'server');
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
   * Setup typing indicator listener
   */
  setupTypingListener() {
    if (window.electron && window.electron.onTypingIndicator) {
      window.electron.onTypingIndicator((data) => {
        this.handleTypingIndicator(data);
      });
    }
  }

  /**
   * Setup message update listeners (edit/delete)
   */
 /**
 * Setup message update listeners (edit/delete)
 */
setupMessageUpdateListeners() {
  if (window.electron && window.electron.onMessage) {
    window.electron.onMessage((data) => {
      this.handleIncomingMessage(data);
    });
  }
}
 
handleIncomingMessage(data) {
  const chatType = data.chatType || this.activeTab;

  if (data.userId === this.userId) {
    const messages = this.messages[chatType];
    const lastMessage = messages[messages.length - 1];

    if (lastMessage && !lastMessage.messageId && lastMessage.userId === this.userId && lastMessage.message === data.message) {
      console.log('📝 Updating optimistic message with server data');
      
      lastMessage.messageId = data.messageId;
      lastMessage.timestamp = new Date(data.timestamp).getTime();

      if (chatType === this.activeTab) {
        console.log('🔄 Re-rendering messages');
        this.renderAllMessages();
      }

      return;
    }
  }

  this.addMessage({
    messageId: data.messageId,
    userId: data.userId,
    username: data.username,
    displayName: data.displayName,
    picture: data.picture,
    message: data.message,
    timestamp: new Date(data.timestamp).getTime(),
    isLocal: false,
    chatType: chatType
  });
}

  /**
   * Handle typing indicator from server
   */
  handleTypingIndicator(data) {
    const { typingUsers } = data;

    if (!Array.isArray(typingUsers)) return;

    // Update typing users set with server's list
    this.typingUsers.clear();

    // Filter out current user from typing list
    const currentUser = this.userId;
    typingUsers.forEach(username => {
      if (username !== currentUser) {
        this.typingUsers.add(username);
      }
    });

    this.updateTypingIndicator();
  }

  /**
   * Handle user typing in input field
   */
  handleTyping() {
    if (!this.currentJobId && !this.currentPlaceId) return;

    if (!this.currentlyTyping) {
      this.currentlyTyping = true;
      this.emitTypingStatus(true);
    }

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.typingTimeout = setTimeout(() => {
      this.currentlyTyping = false;
      this.emitTypingStatus(false);
    }, 2000);
  }

  /**
   * Emit typing status to server
   */
  async emitTypingStatus(isTyping) {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) return;

      // Only emit typing for server tab (global tab not supported by server)
      if (this.activeTab !== 'server' || !this.currentJobId) return;

      if (window.electron && window.electron.emitTyping) {
        await window.electron.emitTyping({
          jobId: this.currentJobId,
          username: currentUser.username,
          isTyping
        });
      }
    } catch (error) {
      console.error('Failed to emit typing status:', error);
    }
  }

  /**
   * Update typing indicator display
   */
  updateTypingIndicator() {
    let typingIndicator = document.getElementById('typing-indicator');

    if (this.typingUsers.size === 0) {
      if (typingIndicator) {
        typingIndicator.remove();
      }
      return;
    }

    if (!typingIndicator) {
      typingIndicator = document.createElement('div');
      typingIndicator.id = 'typing-indicator';
      typingIndicator.className = 'typing-indicator';

      const chatContainer = document.querySelector('.chat-container');
      const messagesContainer = document.getElementById('chat-messages');
      if (chatContainer && messagesContainer) {
        chatContainer.insertBefore(typingIndicator, messagesContainer.nextSibling);
      }
    }

    const userArray = Array.from(this.typingUsers);
    let text = '';

    if (userArray.length === 1) {
      text = `${userArray[0]} is typing...`;
    } else if (userArray.length === 2) {
      text = `${userArray[0]} and ${userArray[1]} are typing...`;
    } else {
      text = `${userArray[0]} and ${userArray.length - 1} others are typing...`;
    }

    typingIndicator.textContent = text;
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
    const isServerChange = this.currentJobId && this.currentJobId !== jobId;

    this.currentJobId = jobId;
    this.currentPlaceId = placeId;

    // Clear typing indicators on server change
    this.typingUsers.clear();
    this.updateTypingIndicator();

    // Update UI
    this.updateJobIdDisplay(jobId);
    this.clearMessages();

    // Show server spinoff warning if switching servers
    if (isServerChange) {
      this.addSystemMessage(`⚠️ Server changed. Loading messages may take a moment...`, 'server');
    } else {
      this.addSystemMessage(`Connected to server!`, 'server');
    }

    this.addSystemMessage(`Connected to game!`, 'global');

    // No history loading - users only see messages sent after they join

    console.log('Server changed:', { placeId, jobId, isServerChange });
  }

  /**
   * Update status display
   */
  updateJobIdDisplay(jobId) {
    if (this.jobIdDisplay) {
      const statusDot = document.getElementById('status-dot');

      if (jobId === 'Detecting...') {
        this.jobIdDisplay.textContent = 'Not connected';
        if (statusDot) statusDot.className = 'status-dot';
      } else {
        this.jobIdDisplay.textContent = 'Connected';
        if (statusDot) statusDot.className = 'status-dot connected';
      }
    }
  }

  /**
   * Send a message
   */
  async sendMessage() {
    const message = this.messageInput.value.trim();

    if (!message) return;

    // Validate message
    if (window.messageValidator) {
      const validation = window.messageValidator.validate(message);
      if (!validation.valid) {
        this.showValidationError(validation.error, validation.highlightWord);
        return;
      }
    }

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
      userId: currentUser?.userId ? parseInt(currentUser.userId) : 'local',
      username: currentUser?.username || 'You',
      displayName: currentUser?.displayName,
      picture: currentUser?.picture,
      message: message,
      timestamp: Date.now(),
      isLocal: true,
      chatType: this.activeTab
    });

    // Clear input
    this.messageInput.value = '';

    // Stop typing indicator
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    if (this.currentlyTyping) {
      this.currentlyTyping = false;
      this.emitTypingStatus(false);
    }

    // Send to backend via IPC
    try {
      if (window.electron && window.electron.sendMessage) {
        const startTime = Date.now();
        let warningTimeout = null;

        // Show server wakeup warning if request takes too long
        if (!this.serverWakeupWarningShown) {
          warningTimeout = setTimeout(() => {
            this.showServerWakeupWarning();
          }, this.SLOW_REQUEST_THRESHOLD);
        }

        const result = await window.electron.sendMessage({
          jobId: this.activeTab === 'server' ? this.currentJobId : undefined,
          placeId: this.currentPlaceId,
          chatType: this.activeTab,
          message: message
        });

        // Clear warning timeout
        if (warningTimeout) {
          clearTimeout(warningTimeout);
        }

        const elapsed = Date.now() - startTime;

        // If request was slow (server cold start), mark warning as shown
        if (elapsed > this.SLOW_REQUEST_THRESHOLD) {
          this.serverWakeupWarningShown = true;
          this.hideServerWakeupWarning();
        }

        if (!result.success) {
          // Server rejected message (rate limit, profanity, etc.)
          // Remove optimistically added message
          const messages = this.messages[this.activeTab];
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.isLocal && lastMessage.message === message) {
            messages.pop();
            this.renderAllMessages();
          }

          console.log('Server returned error:', result);

          // Check if it's a rate limit error (429 status or specific error messages)
          if (result.status === 429 || 
              (result.error && (
                result.error.includes('Wait') && result.error.includes('seconds') ||
                result.error.includes('seconds') && (result.error.includes('slow') || result.error.includes('spam') || result.error.includes('fast')) ||
                result.error.includes('CHILL OUT')
              ))) {
            // Extract wait time from error message - look for any number followed by 'seconds'
            const match = result.error.match(/(\d+)\s*seconds?/i);
            const waitSeconds = match ? parseInt(match[1]) : 30; // Default 30s if can't parse
            
            console.log('Cooldown triggered, waiting', waitSeconds, 'seconds');
            this.startCooldown(waitSeconds);
          }

          // No error message shown - only cooldown banner
        }
      } else {
        console.log('Mock send:', message);
      }
    } catch (error) {
      console.error('Failed to send message:', error);

      // Remove optimistically added message on error
      const messages = this.messages[this.activeTab];
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.isLocal && lastMessage.message === message) {
        messages.pop();
        this.renderAllMessages();
      }

      // For non-rate-limit errors, just log them but don't show error message
      console.log('Message error:', error.message);
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
    messageId: messageData.messageId || null,
    userId: messageData.userId,
    username: messageData.username,
    displayName: messageData.displayName || messageData.username,
    picture: messageData.picture || null,
    message: messageData.message,
    timestamp: messageData.timestamp || Date.now(),
    isLocal: messageData.isLocal || false,
    chatType
  };

  this.messages[chatType].push(message);

  if (this.messages[chatType].length > this.MAX_MESSAGES) {
    this.messages[chatType].shift();
  }

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
   * Remote messages appear on the right, local messages on the left
   */
renderMessage(message) {
  const messageEl = document.createElement('div');
  messageEl.className = `chat-msg ${message.isLocal ? 'local' : 'remote'}`;
  if (message.messageId) {
    messageEl.setAttribute('data-message-id', message.messageId);
  }

  const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  const displayName = message.displayName && message.displayName.trim()
    ? message.displayName
    : message.username;
  const username = message.username;
  const picture = message.picture;

  const profilePicEl = document.createElement('div');
  profilePicEl.className = 'msg-profile-pic';

  if (picture && picture.trim()) {
    const imgEl = document.createElement('img');
    imgEl.src = picture;
    imgEl.alt = displayName;
    imgEl.onerror = () => {
      profilePicEl.innerHTML = '';
      profilePicEl.textContent = this.escapeHtml(displayName.charAt(0).toUpperCase());
    };
    profilePicEl.appendChild(imgEl);
  } else {
    profilePicEl.textContent = this.escapeHtml(displayName.charAt(0).toUpperCase());
  }

  const contentColumnEl = document.createElement('div');
  contentColumnEl.className = 'msg-content-column';

  const headerEl = document.createElement('div');
  headerEl.className = 'msg-header';

  const displayNameEl = document.createElement('span');
  displayNameEl.className = 'msg-display-name';
  displayNameEl.textContent = this.escapeHtml(displayName);

  const usernameEl = document.createElement('span');
  usernameEl.className = 'msg-username';
  usernameEl.textContent = `(${this.escapeHtml(username)})`;

  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = timestamp;

  headerEl.appendChild(displayNameEl);
  headerEl.appendChild(usernameEl);
  headerEl.appendChild(timeEl);

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'msg-bubble';
  bubbleEl.textContent = this.escapeHtml(message.message);

  contentColumnEl.appendChild(headerEl);
  contentColumnEl.appendChild(bubbleEl);

  messageEl.appendChild(profilePicEl);
  messageEl.appendChild(contentColumnEl);

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
              messageId: msg.messageId,
              userId: msg.userId,
              username: msg.username,
              displayName: msg.displayName || msg.username,
              picture: msg.picture || null,
              message: msg.message,
              timestamp: new Date(msg.timestamp).getTime(),
              isLocal: false,
              chatType,
              editedAt: msg.editedAt,
              deletedAt: msg.deletedAt
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
   * Show validation error
   */
  showValidationError(error, highlightWord) {
    // Show error message
    const errorEl = document.createElement('div');
    errorEl.className = 'validation-error';
    errorEl.textContent = error;
    errorEl.style.cssText = `
      position: absolute;
      bottom: 70px;
      left: 20px;
      right: 20px;
      background: rgba(254, 107, 139, 0.2);
      border: 2px solid rgba(254, 107, 139, 0.4);
      border-radius: 8px;
      padding: 12px;
      color: #fe6b8b;
      font-size: 14px;
      font-weight: 600;
      z-index: 1000;
      animation: slideUp 0.3s ease;
    `;

    // Add to chat area
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
      chatArea.appendChild(errorEl);

      // Highlight problematic word in input if applicable
      if (highlightWord) {
        this.messageInput.style.borderColor = '#fe6b8b';
        this.messageInput.style.boxShadow = '0 0 0 2px rgba(254, 107, 139, 0.2)';
      }

      // Remove error after 4 seconds
      setTimeout(() => {
        errorEl.remove();
        this.messageInput.style.borderColor = '';
        this.messageInput.style.boxShadow = '';
      }, 4000);
    }
  }
  /**
 * Show error message to user
 */
showErrorMessage(errorText) {
  const errorEl = document.createElement('div');
  errorEl.className = 'error-message';
  errorEl.textContent = errorText;
  errorEl.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(254, 107, 139, 0.95);
    border: 2px solid rgba(254, 107, 139, 0.6);
    border-radius: 12px;
    padding: 16px 20px;
    color: white;
    font-size: 14px;
    font-weight: 600;
    z-index: 10001;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(errorEl);

  setTimeout(() => {
    errorEl.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => errorEl.remove(), 300);
  }, 3000);
}

  /**
   * Show server wakeup warning (Render free tier cold start)
   */
  showServerWakeupWarning() {
    // Remove any existing warning
    const existing = document.getElementById('server-wakeup-warning');
    if (existing) return;

    const warningEl = document.createElement('div');
    warningEl.id = 'server-wakeup-warning';
    warningEl.className = 'server-wakeup-warning';
    warningEl.innerHTML = `
      <div class="spinner"></div>
      <div>
        <div style="font-weight: 700; margin-bottom: 4px;">Server is waking up...</div>
        <div style="font-size: 12px; opacity: 0.8;">This may take 30-60 seconds (free tier cold start)</div>
      </div>
    `;

    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
      chatArea.appendChild(warningEl);
    }
  }

  /**
   * Hide server wakeup warning
   */
  hideServerWakeupWarning() {
    const warningEl = document.getElementById('server-wakeup-warning');
    if (warningEl) {
      // Add success message briefly before removing
      warningEl.innerHTML = `
        <div style="color: #4ade80;">✓</div>
        <div style="font-weight: 700;">Server is ready!</div>
      `;
      warningEl.style.background = 'rgba(74, 222, 128, 0.2)';
      warningEl.style.borderColor = 'rgba(74, 222, 128, 0.4)';

      setTimeout(() => {
        warningEl.remove();
      }, 2000);
    }
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

  /**
   * Start cooldown timer
   */
  startCooldown(seconds) {
    // Clear any existing cooldown
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
    }

    console.log(`Starting ${seconds} second cooldown`);

    // Set cooldown end time
    this.cooldownEndTime = Date.now() + (seconds * 1000);

    // Get cooldown warning elements
    let cooldownWarning = document.getElementById('cooldown-warning');
    let cooldownText = document.getElementById('cooldown-text');

    // Create cooldown warning element dynamically if it doesn't exist
    if (!cooldownWarning) {
      console.warn('Cooldown warning element not found, creating it');
      
      // Find chat container
      const chatContainer = document.querySelector('.chat-container');
      if (!chatContainer) {
        console.error('Chat container not found!');
        return;
      }

      // Create cooldown warning element
      cooldownWarning = document.createElement('div');
      cooldownWarning.id = 'cooldown-warning';
      cooldownWarning.className = 'cooldown-warning hidden';
      cooldownWarning.innerHTML = '⏱️ <span id="cooldown-text">Cooldown: 0s</span>';
      
      // Insert before chat input
      const chatInput = chatContainer.querySelector('.chat-input');
      if (chatInput) {
        chatContainer.insertBefore(cooldownWarning, chatInput);
      } else {
        chatContainer.appendChild(cooldownWarning);
      }

      // Get the text element after creating
      cooldownText = document.getElementById('cooldown-text');
    }

    // Show cooldown warning
    if (cooldownWarning) {
      cooldownWarning.classList.remove('hidden');
      cooldownWarning.classList.add('visible');
      console.log('Cooldown warning shown');
    } else {
      console.error('Failed to show cooldown warning');
    }

    // Disable input and send button
    if (this.messageInput) {
      this.messageInput.disabled = true;
      this.messageInput.placeholder = `Cooldown active...`;
    }
    if (this.sendButton) {
      this.sendButton.disabled = true;
      this.sendButton.style.opacity = '0.5';
      this.sendButton.style.cursor = 'not-allowed';
    }

    // Update countdown every 100ms for smooth animation
    this.cooldownTimer = setInterval(() => {
      const remaining = Math.ceil((this.cooldownEndTime - Date.now()) / 1000);

      if (remaining <= 0) {
        this.endCooldown();
      } else {
        if (cooldownText) {
          cooldownText.textContent = `Cooldown: ${remaining}s - Slow down!`;
        }
      }
    }, 100);
  }

  /**
   * End cooldown timer
   */
  endCooldown() {
    // Clear timer
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }

    this.cooldownEndTime = null;

    // Hide cooldown warning
    const cooldownWarning = document.getElementById('cooldown-warning');
    if (cooldownWarning) {
      cooldownWarning.classList.remove('visible');
      cooldownWarning.classList.add('hidden');
    }

    // Re-enable input and send button
    if (this.messageInput) {
      this.messageInput.disabled = false;
      this.messageInput.placeholder = 'Type a message...';
    }
    if (this.sendButton) {
      this.sendButton.disabled = false;
      this.sendButton.textContent = 'Send';
      this.sendButton.style.opacity = '1';
      this.sendButton.style.cursor = 'pointer';
    }

    console.log('Cooldown ended - you can send messages again');
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