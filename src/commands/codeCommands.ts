import * as vscode from 'vscode';
import { apiClient, ChatMessage } from '../utils/apiClient';
import { getEditorContext, buildSystemPrompt } from '../utils/context';
import { ChatPanel } from '../panels/ChatPanel';

async function runCodeAction(
  extensionUri: vscode.Uri,
  actionPrompt: string,
  insertResult = false
): Promise<void> {
  const ctx = getEditorContext();
  if (!ctx) {
    vscode.window.showWarningMessage('Open a file to use this command.');
    return;
  }

  const target = ctx.selection ?? ctx.content;
  if (!target.trim()) {
    vscode.window.showWarningMessage('No code selected or editor is empty.');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'OpenWeb AI', cancellable: false },
    async progress => {
      progress.report({ message: 'Processing...' });

      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: `${actionPrompt}\n\n\`\`\`${ctx.language}\n${target}\n\`\`\`` }
      ];

      try {
        const result = await apiClient.chat(messages);

        if (insertResult) {
          const editor = vscode.window.activeTextEditor;
          if (editor && !editor.selection.isEmpty) {
            await editor.edit(eb => {
              eb.replace(editor.selection, result);
            });
          } else {
            await showResultDocument(result, ctx.language);
          }
        } else {
          await showResultDocument(result, 'markdown');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`AI request failed: ${err}`);
      }
    }
  );
}

async function showResultDocument(content: string, language: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language
  });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
}

export function registerCodeCommands(
  context: vscode.ExtensionContext,
  extensionUri: vscode.Uri
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('openweb.explainCode', async () => {
      const ctx = getEditorContext();
      if (!ctx?.selection) {
        vscode.window.showWarningMessage('Select code to explain.');
        return;
      }
      const panel = ChatPanel.createOrShow(extensionUri);
      panel.sendMessageWithContext(
        `Explain the following ${ctx.language} code clearly and concisely:\n\`\`\`${ctx.language}\n${ctx.selection}\n\`\`\``
      );
    }),

    vscode.commands.registerCommand('openweb.generateCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a file to generate code.');
        return;
      }

      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the code to generate',
        placeHolder: 'e.g. function that validates email addresses'
      });
      if (!prompt) { return; }

      const ctx = getEditorContext();
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: `Generate ${ctx?.language ?? 'code'} for: ${prompt}. Return only the code, no explanation.` }
      ];

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Generating code...', cancellable: false },
        async () => {
          try {
            const result = await apiClient.chat(messages);
            const code = extractCodeBlock(result);
            await editor.edit(eb => {
              eb.insert(editor.selection.active, code);
            });
          } catch (err) {
            vscode.window.showErrorMessage(`Code generation failed: ${err}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('openweb.generateDocs', () =>
      runCodeAction(
        extensionUri,
        'Generate comprehensive documentation (JSDoc/docstring) for this code. Return only the documented code.',
        true
      )
    ),

    vscode.commands.registerCommand('openweb.generateTests', () =>
      runCodeAction(
        extensionUri,
        'Generate thorough unit tests for this code using the most appropriate testing framework for the language.',
        false
      )
    ),

    vscode.commands.registerCommand('openweb.refactorCode', async () => {
      const ctx = getEditorContext();
      if (!ctx?.selection) {
        vscode.window.showWarningMessage('Select code to refactor.');
        return;
      }

      const instructions = await vscode.window.showInputBox({
        prompt: 'Refactoring instructions (optional)',
        placeHolder: 'e.g. improve readability, extract functions, add error handling'
      });

      await runCodeAction(
        extensionUri,
        `Refactor this code${instructions ? ': ' + instructions : ' for better readability and maintainability'}. Return only the refactored code.`,
        true
      );
    })
  );
}

function extractCodeBlock(text: string): string {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}
