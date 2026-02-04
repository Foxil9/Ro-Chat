const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth methods
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:getStatus')
  },

  // Detection methods
  detection: {
    getServer: () => ipcRenderer.invoke('detection:getServer'),
    start: () => ipcRenderer.invoke('detection:start'),
    stop: () => ipcRenderer.invoke('detection:stop'),
    onServerChanged: (callback) => {
      const listener = (event, serverInfo) => callback(serverInfo);
      ipcRenderer.on('detection:serverChanged', listener);
      return () => ipcRenderer.removeListener('detection:serverChanged', listener);
    }
  },

  // Chat methods
 chat: {
  sendMessage: (data) => ipcRenderer.invoke('chat:send', data),
  loadHistory: (data) => ipcRenderer.invoke('chat:history', data),
  emitTyping: (data) => ipcRenderer.invoke('chat:emitTyping', data)
},

  // Event listeners
  onServerChanged: (callback) => {
    const listener = (event, serverInfo) => callback(serverInfo);
    ipcRenderer.on('detection:serverChanged', listener);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('detection:serverChanged', listener);
    };
  },

  onThemeChanged: (callback) => {
    const listener = (event, theme) => callback(theme);
    ipcRenderer.on('theme:changed', listener);
    return () => ipcRenderer.removeListener('theme:changed', listener);
  },

  onAutoHideHeaderChanged: (callback) => {
    const listener = (event, enabled) => callback(enabled);
    ipcRenderer.on('settings:autoHideHeaderChanged', listener);
    return () => ipcRenderer.removeListener('settings:autoHideHeaderChanged', listener);
  },

  onAutoHideFooterChanged: (callback) => {
    const listener = (event, enabled) => callback(enabled);
    ipcRenderer.on('settings:autoHideFooterChanged', listener);
    return () => ipcRenderer.removeListener('settings:autoHideFooterChanged', listener);
  },

  onFocusChat: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('keybind:focus-chat', listener);
    return () => ipcRenderer.removeListener('keybind:focus-chat', listener);
  },

  onLogout: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('auth:logout', listener);
    return () => ipcRenderer.removeListener('auth:logout', listener);
  },

  onTypingIndicator: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:typingIndicator', listener);
    return () => ipcRenderer.removeListener('socket:typingIndicator', listener);
  },

  onMessage: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:message', listener);
    return () => ipcRenderer.removeListener('socket:message', listener);
  },


  onMessageEditError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:messageEditError', listener);
    return () => ipcRenderer.removeListener('socket:messageEditError', listener);
  },

  onMessageDeleteError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:messageDeleteError', listener);
    return () => ipcRenderer.removeListener('socket:messageDeleteError', listener);
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
    setOpacity: (opacity) => ipcRenderer.invoke('window:setOpacity', opacity),
    openSettings: () => ipcRenderer.invoke('window:openSettings')
  },

  // Settings
  settings: {
    applyTheme: (theme) => ipcRenderer.invoke('settings:applyTheme', theme),
    resetPosition: () => ipcRenderer.invoke('settings:resetPosition'),
    registerKeybind: (keybind) => ipcRenderer.invoke('settings:registerKeybind', keybind),
    setMessageOpacity: (opacity) => ipcRenderer.send('settings:setMessageOpacity', opacity),
    setAutoHideHeader: (enabled) => ipcRenderer.invoke('settings:setAutoHideHeader', enabled),
    setAutoHideFooter: (enabled) => ipcRenderer.invoke('settings:setAutoHideFooter', enabled)  // CSS FIX: IPC for footer visibility
  },

  // Shell methods
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  }
});

// Expose unified electron API for chat.js compatibility
contextBridge.exposeInMainWorld('electron', {
  // Auth methods
  logout: () => ipcRenderer.invoke('auth:logout'),
  getAuthStatus: () => ipcRenderer.invoke('auth:getStatus'),

  // Chat methods
  sendMessage: (data) => ipcRenderer.invoke('chat:send', data),
  loadHistory: (data) => ipcRenderer.invoke('chat:history', data),
  emitTyping: (data) => ipcRenderer.invoke('chat:emitTyping', data),

  // Event listeners
  onServerChanged: (callback) => {
    const listener = (event, serverInfo) => callback(serverInfo);
    ipcRenderer.on('detection:serverChanged', listener);

    return () => {
      ipcRenderer.removeListener('detection:serverChanged', listener);
    };
  },

  onTypingIndicator: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:typingIndicator', listener);
    return () => ipcRenderer.removeListener('socket:typingIndicator', listener);
  },

  onMessage: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:message', listener);
    return () => ipcRenderer.removeListener('socket:message', listener);
  },
   editMessage: (data) => ipcRenderer.invoke('chat:editMessage', data),
  deleteMessage: (data) => ipcRenderer.invoke('chat:deleteMessage', data),
  
  onMessageEdited: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:messageEdited', listener);
    return () => ipcRenderer.removeListener('socket:messageEdited', listener);
  },
  
  onMessageDeleted: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('socket:messageDeleted', listener);
    return () => ipcRenderer.removeListener('socket:messageDeleted', listener);
  },
  

  startDetection: () => ipcRenderer.invoke('detection:start'),
  stopDetection: () => ipcRenderer.invoke('detection:stop'),

  // Shell methods
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
