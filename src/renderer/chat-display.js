/**
 * Creates a message element with optional action button
 * @param {string} content - Message text
 * @param {Object} options - Optional configuration
 * @param {Function} options.onAction - Click handler for action button
 * @returns {HTMLElement} Message element
 */
export function createMessageElement(content, options = {}) {
  const messageEl = document.createElement("div");
  messageEl.className = "message";

  // Use textContent for security (prevents XSS)
  const textEl = document.createElement("span");
  textEl.textContent = content;
  messageEl.appendChild(textEl);

  // Add action button if handler provided
  if (options.onAction) {
    const buttonEl = document.createElement("button");
    buttonEl.textContent = "Action";
    buttonEl.onclick = options.onAction;
    messageEl.appendChild(buttonEl);
  }

  return messageEl;
}
