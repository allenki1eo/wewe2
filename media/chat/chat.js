// @ts-check
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  const messagesEl = document.getElementById('messages');
  const inputEl = /** @type {HTMLTextAreaElement} */ (document.getElementById('input'));
  const sendBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-send'));
  const clearBtn = document.getElementById('btn-clear');
  const contextBtn = document.getElementById('btn-context');
  const contextBadge = document.getElementById('context-badge');
  const typingIndicator = document.getElementById('typing-indicator');

  let currentAssistantBubble = null;
  let isStreaming = false;

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  // Send on Ctrl/Cmd+Enter
  inputEl.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  clearBtn?.addEventListener('click', clearHistory);
  contextBtn?.addEventListener('click', () => vscode.postMessage({ type: 'getContext' }));

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) { return; }
    vscode.postMessage({ type: 'sendMessage', text });
    inputEl.value = '';
    inputEl.style.height = 'auto';
  }

  function clearHistory() {
    vscode.postMessage({ type: 'clearHistory' });
    if (messagesEl) { messagesEl.innerHTML = ''; }
    renderWelcome();
  }

  function renderWelcome() {
    if (!messagesEl) { return; }
    const welcome = document.createElement('div');
    welcome.className = 'welcome';
    welcome.innerHTML = `
      <div class="welcome-icon">🤖</div>
      <h3>OpenWeb AI Assistant</h3>
      <p>Ask questions about your code, generate documentation, refactor,<br>
      or use the editor context menu for code actions.</p>
      <p style="font-size:11px;margin-top:4px">Ctrl+Enter to send</p>
    `;
    messagesEl.appendChild(welcome);
  }

  function appendUserMessage(text) {
    removeWelcome();
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `
      <div class="message-label">You</div>
      <div class="message-bubble">${escapeHtml(text)}</div>
    `;
    messagesEl?.appendChild(div);
    scrollToBottom();
  }

  function startAssistantMessage() {
    removeWelcome();
    isStreaming = true;
    sendBtn && (sendBtn.disabled = true);
    typingIndicator?.classList.remove('hidden');

    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `
      <div class="message-label">OpenWeb AI</div>
      <div class="message-bubble"></div>
    `;
    messagesEl?.appendChild(div);
    currentAssistantBubble = div.querySelector('.message-bubble');
    scrollToBottom();
  }

  function appendAssistantChunk(delta) {
    if (!currentAssistantBubble) { return; }
    typingIndicator?.classList.add('hidden');
    currentAssistantBubble.innerHTML = renderMarkdown(
      currentAssistantBubble.textContent + delta
    );
    scrollToBottom();
  }

  function endAssistantMessage() {
    isStreaming = false;
    sendBtn && (sendBtn.disabled = false);
    typingIndicator?.classList.add('hidden');
    currentAssistantBubble = null;
    inputEl.focus();
  }

  function showError(msg) {
    isStreaming = false;
    sendBtn && (sendBtn.disabled = false);
    typingIndicator?.classList.add('hidden');
    const div = document.createElement('div');
    div.className = 'error-msg';
    div.textContent = '⚠ ' + msg;
    messagesEl?.appendChild(div);
    scrollToBottom();
  }

  function removeWelcome() {
    messagesEl?.querySelector('.welcome')?.remove();
  }

  function scrollToBottom() {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMarkdown(text) {
    // Code blocks
    let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`;
    });
    // Inline code
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Line breaks
    result = result.replace(/\n/g, '<br>');
    return result;
  }

  // Handle messages from extension
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'userMessage':
        appendUserMessage(msg.text);
        break;
      case 'assistantStart':
        startAssistantMessage();
        break;
      case 'assistantChunk':
        appendAssistantChunk(msg.delta);
        break;
      case 'assistantEnd':
        endAssistantMessage();
        break;
      case 'error':
        showError(msg.message);
        break;
      case 'prefill':
        inputEl.value = msg.text;
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        inputEl.focus();
        break;
      case 'context':
        if (msg.data && contextBadge) {
          contextBadge.textContent = `${msg.data.fileName} (${msg.data.language})`;
          contextBadge.classList.remove('hidden');
        } else if (contextBadge) {
          contextBadge.classList.add('hidden');
        }
        break;
    }
  });

  // Init: request context and render welcome
  renderWelcome();
  vscode.postMessage({ type: 'getContext' });
})();
