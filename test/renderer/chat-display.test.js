import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMessageElement } from '../../src/renderer/chat-display.js';

describe('createMessageElement', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should create a message element with text', () => {
    const message = createMessageElement('Hello world');
    container.appendChild(message);
    
    expect(message.textContent).toBe('Hello world');
    expect(message.className).toBe('message');
  });

  it('should create a message with action button', () => {
    let clicked = false;
    const message = createMessageElement('Test', { 
      onAction: () => { clicked = true; }
    });
    
    const button = message.querySelector('button');
    expect(button).toBeTruthy();
    
    button.click();
    expect(clicked).toBe(true);
  });
});