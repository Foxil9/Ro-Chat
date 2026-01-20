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
    stop: () => ipcRenderer.invoke('detection:stop')
  },

  // Event listeners
  onServerChanged: (callback) => {
    const listener = (event, serverInfo) => callback(serverInfo);
    ipcRenderer.on('detection:serverChanged', listener);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('detection:serverChanged', listener);
    };
  }
});
