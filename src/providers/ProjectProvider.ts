import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface Task {
  id: string;
  label: string;
  done: boolean;
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
}

export class ProjectProvider implements vscode.TreeDataProvider<ProjectItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _tasks: Task[] = [];
  private _storageUri: vscode.Uri;

  constructor(storageUri: vscode.Uri) {
    this._storageUri = storageUri;
    this._loadTasks();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectItem): Promise<ProjectItem[]> {
    if (!element) {
      const items: ProjectItem[] = [
        new ProjectItem('Tasks', vscode.TreeItemCollapsibleState.Expanded, 'section-tasks'),
        new ProjectItem('File Structure', vscode.TreeItemCollapsibleState.Collapsed, 'section-files')
      ];
      return items;
    }

    if (element.contextValue === 'section-tasks') {
      return this._getTaskItems();
    }

    if (element.contextValue === 'section-files') {
      return this._getFileItems();
    }

    if (element.contextValue === 'file-dir' && element.resourceUri) {
      return this._getFileChildren(element.resourceUri.fsPath);
    }

    return [];
  }

  private _getTaskItems(): ProjectItem[] {
    if (this._tasks.length === 0) {
      return [new ProjectItem('No tasks. Add one with "OpenWeb: Add Task"', vscode.TreeItemCollapsibleState.None, 'empty')];
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return this._tasks
      .slice()
      .sort((a, b) => {
        if (a.done !== b.done) { return a.done ? 1 : -1; }
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .map(task => {
        const item = new ProjectItem(
          (task.done ? '✓ ' : '') + task.label,
          vscode.TreeItemCollapsibleState.None,
          task.done ? 'task-done' : `task-${task.priority}`
        );
        item.id = task.id;
        item.tooltip = `Priority: ${task.priority} | ${task.done ? 'Done' : 'Pending'}`;
        item.command = {
          command: 'openweb.toggleTask',
          title: 'Toggle Task',
          arguments: [task.id]
        };
        return item;
      });
  }

  private _getFileItems(): ProjectItem[] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return [new ProjectItem('No workspace open', vscode.TreeItemCollapsibleState.None, 'empty')];
    }
    return this._getFileChildren(root);
  }

  private _getFileChildren(dirPath: string): ProjectItem[] {
    try {
      const ignoreList = ['node_modules', '.git', 'dist', 'out', '.vscode', '__pycache__', '.next'];
      return fs.readdirSync(dirPath)
        .filter(name => !ignoreList.includes(name) && !name.startsWith('.'))
        .map(name => {
          const fullPath = path.join(dirPath, name);
          const isDir = fs.statSync(fullPath).isDirectory();
          const item = new ProjectItem(
            name,
            isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            isDir ? 'file-dir' : 'file'
          );
          item.resourceUri = vscode.Uri.file(fullPath);
          if (!isDir) {
            item.command = {
              command: 'vscode.open',
              title: 'Open File',
              arguments: [vscode.Uri.file(fullPath)]
            };
          }
          return item;
        });
    } catch {
      return [];
    }
  }

  async addTask(): Promise<void> {
    const label = await vscode.window.showInputBox({
      prompt: 'Task description',
      placeHolder: 'Implement feature X...'
    });
    if (!label) { return; }

    const priority = await vscode.window.showQuickPick(
      [
        { label: '🔴 High', value: 'high' as const },
        { label: '🟡 Medium', value: 'medium' as const },
        { label: '🟢 Low', value: 'low' as const }
      ],
      { placeHolder: 'Select priority' }
    );
    if (!priority) { return; }

    const task: Task = {
      id: Date.now().toString(),
      label,
      done: false,
      priority: priority.value,
      createdAt: Date.now()
    };

    this._tasks.push(task);
    this._saveTasks();
    this.refresh();
  }

  toggleTask(taskId: string): void {
    const task = this._tasks.find(t => t.id === taskId);
    if (task) {
      task.done = !task.done;
      this._saveTasks();
      this.refresh();
    }
  }

  private _loadTasks(): void {
    try {
      const storePath = vscode.Uri.joinPath(this._storageUri, 'tasks.json').fsPath;
      if (fs.existsSync(storePath)) {
        this._tasks = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      }
    } catch { /* start fresh */ }
  }

  private _saveTasks(): void {
    try {
      const storeDir = this._storageUri.fsPath;
      if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir, { recursive: true });
      }
      fs.writeFileSync(
        vscode.Uri.joinPath(this._storageUri, 'tasks.json').fsPath,
        JSON.stringify(this._tasks, null, 2)
      );
    } catch { /* non-critical */ }
  }
}

class ProjectItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string
  ) {
    super(label, collapsibleState);

    const iconMap: Record<string, vscode.ThemeIcon> = {
      'section-tasks': new vscode.ThemeIcon('tasklist'),
      'section-files': new vscode.ThemeIcon('folder-opened'),
      'task-high': new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red')),
      'task-medium': new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow')),
      'task-low': new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green')),
      'task-done': new vscode.ThemeIcon('pass-filled'),
      'file-dir': vscode.ThemeIcon.Folder,
      'file': vscode.ThemeIcon.File,
      'empty': new vscode.ThemeIcon('info')
    };
    this.iconPath = iconMap[contextValue] ?? new vscode.ThemeIcon('circle-outline');
  }
}
