// Chat UI logic for RoChat

class ChatManager {
  constructor() {
    this.messages = [];
    this.messageInput = null;
    this.sendButton = null;
    this.messagesContainer = null;
    this.isInitialized = false;
  }

  /**
   * Initialize chat manager
   */
  init() {
    if (this.isInitialized) return;

    // Get DOM elements
    this.messageInput = document.getElementById('message-input');
    this.sendButton = document.getElementById('send-btn');
    this.messagesContainer = document.getElementById('chat-messages');

    // Setup event listeners
    this.setupEventListeners();

    this.isInitialized = true;
    console.log('Chat manager initialized');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Send button click
    this.sendButton.addEventListener('click', () => this.sendMessage());

    // Enter key to send
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
  }

  /**
   * Send a message
   */
  async sendMessage() {
    const message = this.messageInput.value.trim();
    
    if (!message) return;

    // Add message to UI immediately (optimistic update)
    this.addMessage({
      userId: window.app.currentUser?.userId,
      username: window.app.currentUser?.username || 'You',
      message: message,
      timestamp: Date.now(),
      isLocal: true
    });

    // Clear input
    this.messageInput.value = '';

    // TODO: Send message to backend server
    // This will be implemented when backend is ready
    try {
      // await window.electronAPI.chat.send(message);
      console.log('Message sent:', message);
    } catch (error) {
      console.error('Failed to send message:', error);
      this.showMessageError(message);
    }
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
   * Render a single message
   */
  renderMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${message.isLocal ? 'local' : 'remote'}`;

    const timestamp = new Date(message.timestamp).toLocaleTimeString();

    messageEl.innerHTML = `
      <div class="message-header">
        <span class="username">${this.escapeHtml(message.username)}</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-content">${this.escapeHtml(message.message)}</div>
    `;

    this.messagesContainer.appendChild(messageEl);
  }

  /**
   * Show message error
   */
  showMessageError(originalMessage) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message error';

    messageEl.innerHTML = `
      <div class="message-header">
        <span class="username">Error</span>
      </div>
      <div class="message-content">Failed to send: ${this.escapeHtml(originalMessage)}</div>
    `;

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
   * Scroll chat to bottom
   */
  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
