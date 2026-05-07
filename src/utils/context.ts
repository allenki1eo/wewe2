import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig } from './config';

export interface EditorContext {
  fileName: string;
  language: string;
  content: string;
  selection: string | null;
  selectionRange: { start: number; end: number } | null;
  cursorLine: number;
  workspaceRoot: string | null;
  relativePath: string;
}

export function getEditorContext(): EditorContext | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const doc = editor.document;
  const cfg = getConfig();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  const relativePath = workspaceRoot
    ? path.relative(workspaceRoot, doc.uri.fsPath)
    : doc.uri.fsPath;

  let selection: string | null = null;
  let selectionRange: { start: number; end: number } | null = null;

  if (!editor.selection.isEmpty) {
    selection = doc.getText(editor.selection);
    selectionRange = {
      start: editor.selection.start.line + 1,
      end: editor.selection.end.line + 1
    };
  }

  const cursorLine = editor.selection.active.line;
  const halfContext = Math.floor(cfg.contextLines / 2);
  const startLine = Math.max(0, cursorLine - halfContext);
  const endLine = Math.min(doc.lineCount - 1, cursorLine + halfContext);
  const contextRange = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
  const content = doc.getText(contextRange);

  return {
    fileName: path.basename(doc.uri.fsPath),
    language: doc.languageId,
    content,
    selection,
    selectionRange,
    cursorLine: cursorLine + 1,
    workspaceRoot,
    relativePath
  };
}

export function buildSystemPrompt(ctx: EditorContext | null): string {
  if (!ctx) {
    return 'You are an expert software engineer assistant integrated into VS Code. Help the user with coding questions, explanations, and code generation.';
  }

  return [
    'You are an expert software engineer assistant integrated into VS Code.',
    `Current file: ${ctx.relativePath} (${ctx.language})`,
    ctx.selectionRange
      ? `Selected lines ${ctx.selectionRange.start}-${ctx.selectionRange.end}:`
      : `Context around line ${ctx.cursorLine}:`,
    '```' + ctx.language,
    ctx.selection ?? ctx.content,
    '```',
    '',
    'Provide concise, accurate answers. When generating code, match the existing style and language.'
  ].join('\n');
}
