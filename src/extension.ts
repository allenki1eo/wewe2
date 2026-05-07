import * as vscode from 'vscode';
import { ChatPanel } from './panels/ChatPanel';
import { GitHubProvider } from './providers/GitHubProvider';
import { ProjectProvider } from './providers/ProjectProvider';
import { registerCodeCommands } from './commands/codeCommands';
import { registerGitCommands } from './commands/gitCommands';
import { onConfigChange } from './utils/config';

export function activate(context: vscode.ExtensionContext): void {
  const extensionUri = context.extensionUri;

  // --- Providers ---
  const githubProvider = new GitHubProvider();
  const projectProvider = new ProjectProvider(context.globalStorageUri);

  vscode.window.registerTreeDataProvider('openweb.github', githubProvider);
  vscode.window.registerTreeDataProvider('openweb.project', projectProvider);

  // --- Chat panel commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('openweb.openChat', () => {
      ChatPanel.createOrShow(extensionUri);
    }),

    vscode.commands.registerCommand('openweb.configure', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'openweb');
    }),

    vscode.commands.registerCommand('openweb.addTask', () => projectProvider.addTask()),

    vscode.commands.registerCommand('openweb.toggleTask', (taskId: string) => {
      projectProvider.toggleTask(taskId);
    }),

    vscode.commands.registerCommand('openweb.showFileTree', () => {
      vscode.commands.executeCommand('workbench.view.extension.openweb');
    }),

    vscode.commands.registerCommand('openweb.refreshGitHub', () => {
      githubProvider.refresh();
    })
  );

  // --- Code commands ---
  registerCodeCommands(context, extensionUri);

  // --- Git/GitHub commands ---
  registerGitCommands(context, githubProvider);

  // --- Config change listener ---
  context.subscriptions.push(
    onConfigChange(() => {
      githubProvider.refresh();
    })
  );

  // --- Status bar item ---
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'openweb.openChat';
  statusBar.text = '$(hubot) OpenWeb AI';
  statusBar.tooltip = 'Open OpenWeb AI Chat (Ctrl+Shift+A)';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // --- Auto-open chat on first install ---
  const hasOpened = context.globalState.get<boolean>('openweb.hasOpened');
  if (!hasOpened) {
    context.globalState.update('openweb.hasOpened', true);
    vscode.window.showInformationMessage(
      'OpenWeb AI Assistant is ready! Open the sidebar or press Ctrl+Shift+A to start.',
      'Open Chat'
    ).then(selection => {
      if (selection === 'Open Chat') {
        ChatPanel.createOrShow(extensionUri);
      }
    });
  }
}

export function deactivate(): void {
  // No persistent resources to clean up
}
