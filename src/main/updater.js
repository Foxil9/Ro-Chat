const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');
const logger = require('./logging/logger');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater(mainWindow) {
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available. Download now?`,
      buttons: ['Yes', 'No']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart now to install?',
      buttons: ['Restart', 'Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // Check for updates on startup
  autoUpdater.checkForUpdates();
}

module.exports = { setupAutoUpdater };
