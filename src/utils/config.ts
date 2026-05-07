import * as vscode from 'vscode';

export interface ExtensionConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  githubToken: string;
  contextLines: number;
  autoContext: boolean;
}

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('openweb');
  return {
    apiUrl: cfg.get<string>('apiUrl', 'http://localhost:3000'),
    apiKey: cfg.get<string>('apiKey', ''),
    model: cfg.get<string>('model', 'gpt-4o'),
    githubToken: cfg.get<string>('githubToken', ''),
    contextLines: cfg.get<number>('contextLines', 50),
    autoContext: cfg.get<boolean>('autoContext', true)
  };
}

export function onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('openweb')) {
      callback();
    }
  });
}
