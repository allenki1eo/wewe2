import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { apiClient, ChatMessage } from '../utils/apiClient';
import { getEditorContext, buildSystemPrompt } from '../utils/context';
import { getConfig } from '../utils/config';

export class ChatPanel {
  static readonly viewType = 'openweb.chatPanel';
  private static _instance: ChatPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _history: ChatMessage[] = [];

  static createOrShow(extensionUri: vscode.Uri): ChatPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (ChatPanel._instance) {
      ChatPanel._instance._panel.reveal(column);
      return ChatPanel._instance;
    }

    const panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      'OpenWeb AI Chat',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    ChatPanel._instance = new ChatPanel(panel, extensionUri);
    return ChatPanel._instance;
  }

  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
    ChatPanel._instance = new ChatPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      msg => this._handleMessage(msg),
      null,
      this._disposables
    );
  }

  sendMessageWithContext(prompt: string): void {
    const ctx = getEditorContext();
    const systemPrompt = buildSystemPrompt(ctx);
    this._history = [{ role: 'system', content: systemPrompt }];
    this._panel.reveal();
    this._panel.webview.postMessage({ type: 'prefill', text: prompt });
  }

  private async _handleMessage(message: { type: string; text?: string; clear?: boolean }): Promise<void> {
    switch (message.type) {
      case 'sendMessage':
        await this._processChat(message.text ?? '');
        break;
      case 'clearHistory':
        this._history = [];
        break;
      case 'getContext': {
        const ctx = getEditorContext();
        this._panel.webview.postMessage({
          type: 'context',
          data: ctx
            ? { fileName: ctx.fileName, language: ctx.language, hasSelection: !!ctx.selection }
            : null
        });
        break;
      }
    }
  }

  private async _processChat(userText: string): Promise<void> {
    if (!userText.trim()) { return; }

    const cfg = getConfig();

    if (this._history.length === 0) {
      const ctx = cfg.autoContext ? getEditorContext() : null;
      this._history.push({ role: 'system', content: buildSystemPrompt(ctx) });
    }

    this._history.push({ role: 'user', content: userText });
    this._panel.webview.postMessage({ type: 'userMessage', text: userText });
    this._panel.webview.postMessage({ type: 'assistantStart' });

    try {
      let fullResponse = '';
      for await (const chunk of apiClient.chatStream(this._history)) {
        if (chunk.done) { break; }
        fullResponse += chunk.delta;
        this._panel.webview.postMessage({ type: 'assistantChunk', delta: chunk.delta });
      }
      this._history.push({ role: 'assistant', content: fullResponse });
      this._panel.webview.postMessage({ type: 'assistantEnd' });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({ type: 'error', message: errMsg });
    }
  }

  private _update(): void {
    this._panel.title = 'OpenWeb AI Chat';
    this._panel.webview.html = this._getHtml();
  }

  private _getHtml(): string {
    const webview = this._panel.webview;
    const mediaPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'chat');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'chat.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'chat.js'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${cssUri}" rel="stylesheet">
  <title>OpenWeb AI Chat</title>
</head>
<body>
  <div id="app">
    <header class="chat-header">
      <div class="header-left">
        <span class="header-title">OpenWeb AI</span>
        <span id="context-badge" class="context-badge hidden"></span>
      </div>
      <div class="header-actions">
        <button id="btn-context" class="icon-btn" title="Refresh context">⟳</button>
        <button id="btn-clear" class="icon-btn" title="Clear history">✕</button>
      </div>
    </header>
    <div id="messages" class="messages"></div>
    <div id="typing-indicator" class="typing-indicator hidden">
      <span></span><span></span><span></span>
    </div>
    <div class="input-area">
      <textarea id="input" placeholder="Ask anything about your code..." rows="3"></textarea>
      <button id="btn-send" class="send-btn">Send</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    ChatPanel._instance = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
