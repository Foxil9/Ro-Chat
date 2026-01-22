// External link handler for RoChat
// Shows warning before opening external links

class ExternalLinkHandler {
  constructor() {
    this.coffeeLink = null; // Will be set by user later
  }

  /**
   * Set the coffee link URL
   */
  setCoffeeLink(url) {
    this.coffeeLink = url;
  }

  /**
   * Show warning dialog before opening external link
   */
  showWarning(url, callback) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'external-link-modal';

    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    // Modal content
    dialog.innerHTML = `
      <h2 class="modal-title">⚠️ External Website</h2>
      <div class="modal-content">
        <p>You are about to open an external website:</p>
        <p style="font-weight: 600; color: var(--accent-purple); word-break: break-all; margin-top: 12px;">${this.escapeHtml(url)}</p>
        <p style="margin-top: 12px;">RoChat is not responsible for external content. Do you want to continue?</p>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-secondary" id="modal-cancel">Cancel</button>
        <button class="modal-btn modal-btn-primary" id="modal-continue">Open Link</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Handle cancel
    const cancelBtn = dialog.querySelector('#modal-cancel');
    cancelBtn.addEventListener('click', () => {
      this.closeModal();
    });

    // Handle continue
    const continueBtn = dialog.querySelector('#modal-continue');
    continueBtn.addEventListener('click', () => {
      this.closeModal();
      if (callback) callback(url);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeModal();
      }
    });

    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Close modal
   */
  closeModal() {
    const modal = document.getElementById('external-link-modal');
    if (modal) {
      modal.remove();
    }
  }

  /**
   * Open external link using Electron shell
   */
  openExternal(url) {
    if (window.electron && window.electron.openExternal) {
      window.electron.openExternal(url);
    } else if (window.electronAPI?.shell?.openExternal) {
      window.electronAPI.shell.openExternal(url);
    } else {
      console.warn('Cannot open external link - Electron API not available');
    }
  }

  /**
   * Handle coffee link click
   */
  handleCoffeeLinkClick(e) {
    e.preventDefault();

    if (!this.coffeeLink) {
      console.error('Coffee link URL not set');
      return;
    }

    this.showWarning(this.coffeeLink, (url) => {
      this.openExternal(url);
    });
  }

  /**
   * Initialize coffee link handlers
   */
  initCoffeeLinks() {
    // Chat view coffee link
    const coffeeLink = document.getElementById('coffee-link');
    if (coffeeLink) {
      coffeeLink.addEventListener('click', (e) => this.handleCoffeeLinkClick(e));
    }

    // Settings coffee link
    const coffeeLinkSettings = document.getElementById('coffee-link-settings');
    if (coffeeLinkSettings) {
      coffeeLinkSettings.addEventListener('click', (e) => this.handleCoffeeLinkClick(e));
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
}

// Export singleton instance
window.externalLinkHandler = new ExternalLinkHandler();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.externalLinkHandler.initCoffeeLinks();
  });
} else {
  window.externalLinkHandler.initCoffeeLinks();
}
