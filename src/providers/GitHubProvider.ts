import * as vscode from 'vscode';
import { getConfig } from '../utils/config';

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string;
}

interface GitHubPR {
  number: number;
  title: string;
  state: string;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
}

interface RepoInfo {
  owner: string;
  repo: string;
}

export class GitHubProvider implements vscode.TreeDataProvider<GitHubItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitHubItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _repoInfo: RepoInfo | null = null;
  private _issues: GitHubIssue[] = [];
  private _prs: GitHubPR[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GitHubItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitHubItem): Promise<GitHubItem[]> {
    const cfg = getConfig();
    if (!cfg.githubToken) {
      return [new GitHubItem('Configure GitHub token in settings', vscode.TreeItemCollapsibleState.None, 'warning')];
    }

    if (!element) {
      await this._detectRepo();
      return [
        new GitHubItem('Issues', vscode.TreeItemCollapsibleState.Collapsed, 'section-issues'),
        new GitHubItem('Pull Requests', vscode.TreeItemCollapsibleState.Collapsed, 'section-prs'),
        new GitHubItem('Repository', vscode.TreeItemCollapsibleState.Collapsed, 'section-repo')
      ];
    }

    if (element.contextValue === 'section-issues') {
      return this._getIssueItems();
    }

    if (element.contextValue === 'section-prs') {
      return this._getPRItems();
    }

    if (element.contextValue === 'section-repo') {
      return this._getRepoItems();
    }

    return [];
  }

  private async _detectRepo(): Promise<void> {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (!gitExtension) { return; }
    const api = gitExtension.getAPI(1);
    const repo = api.repositories[0];
    if (!repo) { return; }

    const remoteUrl = repo.state.remotes[0]?.fetchUrl ?? '';
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      this._repoInfo = { owner: match[1], repo: match[2] };
    }
  }

  private async _getIssueItems(): Promise<GitHubItem[]> {
    if (!this._repoInfo) {
      return [new GitHubItem('No GitHub repo detected', vscode.TreeItemCollapsibleState.None, 'info')];
    }

    try {
      const issues = await this._fetchIssues();
      this._issues = issues;
      if (issues.length === 0) {
        return [new GitHubItem('No open issues', vscode.TreeItemCollapsibleState.None, 'info')];
      }
      return issues.map(issue => {
        const item = new GitHubItem(
          `#${issue.number} ${issue.title}`,
          vscode.TreeItemCollapsibleState.None,
          'issue'
        );
        item.tooltip = issue.body?.slice(0, 200);
        item.command = {
          command: 'vscode.open',
          title: 'Open Issue',
          arguments: [vscode.Uri.parse(issue.html_url)]
        };
        return item;
      });
    } catch {
      return [new GitHubItem('Failed to load issues', vscode.TreeItemCollapsibleState.None, 'error')];
    }
  }

  private async _getPRItems(): Promise<GitHubItem[]> {
    if (!this._repoInfo) {
      return [new GitHubItem('No GitHub repo detected', vscode.TreeItemCollapsibleState.None, 'info')];
    }

    try {
      const prs = await this._fetchPRs();
      this._prs = prs;
      if (prs.length === 0) {
        return [new GitHubItem('No open pull requests', vscode.TreeItemCollapsibleState.None, 'info')];
      }
      return prs.map(pr => {
        const item = new GitHubItem(
          `#${pr.number} ${pr.title}`,
          vscode.TreeItemCollapsibleState.None,
          'pr'
        );
        item.tooltip = `${pr.head.ref} → ${pr.base.ref}`;
        item.command = {
          command: 'vscode.open',
          title: 'Open PR',
          arguments: [vscode.Uri.parse(pr.html_url)]
        };
        return item;
      });
    } catch {
      return [new GitHubItem('Failed to load PRs', vscode.TreeItemCollapsibleState.None, 'error')];
    }
  }

  private _getRepoItems(): GitHubItem[] {
    if (!this._repoInfo) {
      return [new GitHubItem('No repository detected', vscode.TreeItemCollapsibleState.None, 'info')];
    }
    return [
      new GitHubItem(`${this._repoInfo.owner}/${this._repoInfo.repo}`, vscode.TreeItemCollapsibleState.None, 'repo-name'),
      new GitHubItem('Browse on GitHub', vscode.TreeItemCollapsibleState.None, 'browse', {
        command: 'vscode.open',
        title: 'Browse',
        arguments: [vscode.Uri.parse(`https://github.com/${this._repoInfo.owner}/${this._repoInfo.repo}`)]
      })
    ];
  }

  private async _fetchIssues(): Promise<GitHubIssue[]> {
    if (!this._repoInfo) { return []; }
    const { owner, repo } = this._repoInfo;
    const cfg = getConfig();
    const res = await this._ghRequest(`/repos/${owner}/${repo}/issues?state=open&per_page=20`, cfg.githubToken);
    return JSON.parse(res);
  }

  private async _fetchPRs(): Promise<GitHubPR[]> {
    if (!this._repoInfo) { return []; }
    const { owner, repo } = this._repoInfo;
    const cfg = getConfig();
    const res = await this._ghRequest(`/repos/${owner}/${repo}/pulls?state=open&per_page=20`, cfg.githubToken);
    return JSON.parse(res);
  }

  private _ghRequest(path: string, token: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const options = {
        hostname: 'api.github.com',
        path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'openweb-vscode-integration',
          'Accept': 'application/vnd.github.v3+json'
        }
      };
      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API error ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  async createIssue(): Promise<void> {
    if (!this._repoInfo) {
      vscode.window.showErrorMessage('No GitHub repository detected in workspace.');
      return;
    }

    const title = await vscode.window.showInputBox({ prompt: 'Issue title', placeHolder: 'Bug: ...' });
    if (!title) { return; }

    const body = await vscode.window.showInputBox({
      prompt: 'Issue body (optional)',
      placeHolder: 'Describe the issue...'
    });

    try {
      const cfg = getConfig();
      const { owner, repo } = this._repoInfo;
      const payload = JSON.stringify({ title, body: body ?? '' });
      await this._ghPost(`/repos/${owner}/${repo}/issues`, payload, cfg.githubToken);
      vscode.window.showInformationMessage(`Issue "${title}" created successfully.`);
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create issue: ${err}`);
    }
  }

  private _ghPost(path: string, body: string, token: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const options = {
        hostname: 'api.github.com',
        path,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'openweb-vscode-integration',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API error ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

class GitHubItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.command = command;

    const iconMap: Record<string, vscode.ThemeIcon> = {
      'section-issues': new vscode.ThemeIcon('issues'),
      'section-prs': new vscode.ThemeIcon('git-pull-request'),
      'section-repo': new vscode.ThemeIcon('repo'),
      'issue': new vscode.ThemeIcon('issue-opened'),
      'pr': new vscode.ThemeIcon('git-pull-request'),
      'repo-name': new vscode.ThemeIcon('repo'),
      'browse': new vscode.ThemeIcon('link-external'),
      'warning': new vscode.ThemeIcon('warning'),
      'error': new vscode.ThemeIcon('error'),
      'info': new vscode.ThemeIcon('info')
    };
    this.iconPath = iconMap[contextValue] ?? new vscode.ThemeIcon('circle-outline');
  }
}
