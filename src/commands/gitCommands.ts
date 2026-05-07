import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import { apiClient, ChatMessage } from '../utils/apiClient';
import { GitHubProvider } from '../providers/GitHubProvider';

const exec = util.promisify(cp.exec);

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runGit(args: string, cwd: string): Promise<string> {
  const { stdout, stderr } = await exec(`git ${args}`, { cwd });
  return stdout + stderr;
}

export function registerGitCommands(
  context: vscode.ExtensionContext,
  githubProvider: GitHubProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('openweb.gitCommit', async () => {
      const root = getWorkspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'OpenWeb: Preparing commit...', cancellable: false },
        async progress => {
          try {
            const diff = await runGit('diff --staged', root);
            if (!diff.trim()) {
              vscode.window.showWarningMessage('No staged changes. Stage files first.');
              return;
            }

            progress.report({ message: 'Generating commit message...' });

            const messages: ChatMessage[] = [
              {
                role: 'system',
                content: 'You are a helpful assistant that writes concise, conventional commit messages. Follow the Conventional Commits specification (feat:, fix:, docs:, refactor:, test:, chore:). Return only the commit message, nothing else.'
              },
              {
                role: 'user',
                content: `Write a commit message for this diff:\n\n${diff.slice(0, 4000)}`
              }
            ];

            const suggested = await apiClient.chat(messages);
            const finalMessage = await vscode.window.showInputBox({
              prompt: 'Commit message (AI-suggested)',
              value: suggested.trim(),
              placeHolder: 'feat: add new feature'
            });

            if (!finalMessage) { return; }

            await runGit(`commit -m "${finalMessage.replace(/"/g, '\\"')}"`, root);
            vscode.window.showInformationMessage(`Committed: ${finalMessage}`);
          } catch (err) {
            vscode.window.showErrorMessage(`Commit failed: ${err}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('openweb.gitPush', async () => {
      const root = getWorkspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'OpenWeb: Pushing...', cancellable: false },
        async () => {
          try {
            const branchOutput = await runGit('rev-parse --abbrev-ref HEAD', root);
            const branch = branchOutput.trim();
            await runGit(`push origin ${branch}`, root);
            vscode.window.showInformationMessage(`Pushed branch: ${branch}`);
            githubProvider.refresh();
          } catch (err) {
            vscode.window.showErrorMessage(`Push failed: ${err}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('openweb.createIssue', () => githubProvider.createIssue()),

    vscode.commands.registerCommand('openweb.createPR', async () => {
      const root = getWorkspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: 'Pull request title',
        placeHolder: 'feat: ...'
      });
      if (!title) { return; }

      const base = await vscode.window.showInputBox({
        prompt: 'Base branch',
        value: 'main'
      });
      if (!base) { return; }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Creating PR...', cancellable: false },
        async progress => {
          try {
            const log = await runGit(`log origin/${base}..HEAD --oneline`, root);
            progress.report({ message: 'Generating PR description...' });

            const messages: ChatMessage[] = [
              {
                role: 'system',
                content: 'Generate a concise pull request description in Markdown. Include a summary and key changes.'
              },
              {
                role: 'user',
                content: `Generate a PR description for these commits:\n${log}`
              }
            ];

            const body = await apiClient.chat(messages);

            const gitExt = vscode.extensions.getExtension('vscode.git')?.exports;
            if (!gitExt) {
              vscode.window.showInformationMessage(`PR ready:\nTitle: ${title}\n\n${body}`);
              return;
            }

            vscode.window.showInformationMessage(`PR description generated. Open GitHub to create: ${title}`);
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to create PR: ${err}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('openweb.browseRepo', () => {
      const gitExt = vscode.extensions.getExtension('vscode.git')?.exports;
      if (!gitExt) {
        vscode.window.showErrorMessage('Git extension not available.');
        return;
      }
      const api = gitExt.getAPI(1);
      const remoteUrl = api.repositories[0]?.state?.remotes?.[0]?.fetchUrl ?? '';
      const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
      if (match) {
        vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${match[1]}`));
      } else {
        vscode.window.showWarningMessage('No GitHub remote found.');
      }
    })
  );
}
