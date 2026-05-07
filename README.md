# OpenWeb AI Assistant — VS Code Extension

A VS Code extension integrating AI chat, GitHub management, code generation, and project tracking.

## Features

### Phase 1 — AI Chat Interface
- Dedicated sidebar panel with streaming chat
- Context-aware conversations (current file, selection, cursor position)
- Keyboard shortcut: `Ctrl+Shift+A` / `Cmd+Shift+A`

### Phase 2 — GitHub Integration
- Tree view of open issues and pull requests
- AI-assisted commit message generation
- One-click push to remote
- Issue and PR creation from inside VS Code

### Phase 3 — Code Generation & Editing
- **Explain** selected code (right-click menu)
- **Refactor** with AI instructions
- **Generate documentation** (JSDoc / docstrings)
- **Generate unit tests** for selected code
- **Generate code** from natural-language prompt (`Ctrl+Shift+G`)

### Project Management
- In-editor task list with priorities (high / medium / low)
- File structure tree (ignores node_modules, dist, etc.)
- Tasks persist across sessions via VS Code global storage

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `openweb.apiUrl` | `http://localhost:3000` | OpenWeb UI backend URL |
| `openweb.apiKey` | `""` | API key |
| `openweb.model` | `gpt-4o` | Default AI model |
| `openweb.githubToken` | `""` | GitHub personal access token |
| `openweb.contextLines` | `50` | Lines of context around cursor |
| `openweb.autoContext` | `true` | Auto-inject file context into chat |

## Setup

```bash
npm install
npm run build   # production build
npm run dev     # watch mode
```

Press `F5` in VS Code to launch the Extension Development Host.

## Architecture

```
src/
  extension.ts          # Activation, wires all components
  panels/
    ChatPanel.ts        # Webview chat panel (streaming SSE)
  providers/
    GitHubProvider.ts   # TreeDataProvider — issues & PRs
    ProjectProvider.ts  # TreeDataProvider — tasks & file tree
  commands/
    codeCommands.ts     # Explain, generate, refactor, docs, tests
    gitCommands.ts      # Commit, push, create issue/PR
  utils/
    apiClient.ts        # OpenWeb UI HTTP + streaming client
    config.ts           # Config helpers
    context.ts          # Editor context extraction
media/
  chat/
    chat.css            # Webview stylesheet
    chat.js             # Webview script (markdown, streaming)
  icons/                # Activity bar SVG icons
```
