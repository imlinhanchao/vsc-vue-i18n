import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// @ts-ignore
import * as pkg from '../../package.json';

function showProgress (message: string) {
  let show = true;
  function stopProgress () {
    show = false;
  }

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Window,
    title: message,
    cancellable: false
  }, (progress, token) => {
    return new Promise(resolve => {
      let timer = setInterval(() => {
        if (show) { return; }
        clearInterval(timer);
        resolve(show);
      }, 100);
    });
  });

  return stopProgress;
}

function editorEdit (selection: vscode.Selection | vscode.Position | undefined | null, text: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    vscode.window.activeTextEditor?.edit(editBuilder => {
      if (selection) {
        editBuilder.replace(selection, text);
      }
    }).then(resolve);
  });
}

function insertToEnd (text: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let linenumber = vscode.window.activeTextEditor?.document.lineCount || 1;
    let pos = vscode.window.activeTextEditor?.document.lineAt(linenumber - 1).range.end || new vscode.Position(0, 0);
    vscode.window.activeTextEditor?.edit(editBuilder => {
      editBuilder.insert(pos, text);
    }).then(resolve);
  });
}

async function openFolder() {
  const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false
  });

  if (uris && uris.length > 0) {
    return uris[0].fsPath;
  } else {
    return;
  }
}

function getSelections (): readonly vscode.Selection[] | null {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null; // No open text editor
  }

  let selections = editor.selections;
  return selections;
}

function getSelectionByPosition (position: vscode.Position): vscode.Selection | null {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null; // No open text editor
  }

  let selections = editor.selections;
  for (let i = 0; i < selections.length; i++) {
    let selection = selections[i];

    let line = { 
        begin: Math.min(selection.anchor.line, selection.active.line),
        end: Math.max(selection.anchor.line, selection.active.line)
    }, character = {
        begin: Math.min(selection.anchor.character, selection.active.character),
        end: Math.max(selection.anchor.character, selection.active.character)
    };

    if (line.begin > position.line || character.begin > position.character) {continue;}
    if (line.end < position.line || character.end < position.character) {continue;}
    return selection;
  }
  return null;
}

function highlightText(editor: vscode.TextEditor, range: vscode.Range | null, decoration?: vscode.TextEditorDecorationType) {
  if (decoration) {
    editor.setDecorations(decoration, []);
    return;
  }
  const decorationType = vscode.window.createTextEditorDecorationType({
    outline: '2px solid',
    borderRadius: '5px',
    outlineColor: new vscode.ThemeColor('button.background'),
  });
  editor.setDecorations(decorationType, [range!]);
  return decorationType;
}

function mkdirs (dirname: string) {
  if (fs.existsSync(dirname)) {
    return true;
  } else {
    if (mkdirs(path.dirname(dirname))) {
      fs.mkdirSync(dirname);
      return true;
    }
  }
}

function getEditorRoot (editor = vscode.window.activeTextEditor): string {
  if (!editor || !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) { return ''; }
  const resource = editor.document.uri;
  if (resource.scheme === 'vscode-notebook-cell') {
    let filePath = resource.fsPath;
    let root = vscode.workspace.workspaceFolders.find(f => filePath.indexOf(f.uri.fsPath) >= 0);
    if (root) { return root.uri.fsPath; }
    else { return ''; };
  }
  if (resource.scheme !== 'file' && resource.scheme !== 'vscode-remote') { return ''; }
  const folder = vscode.workspace.getWorkspaceFolder(resource);
  if (!folder) { return ''; }
  return folder.uri.fsPath;
}

function getEditorFilePath (editor = vscode.window.activeTextEditor): string {
  if (!editor || !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) { return ''; }
  return editor.document.uri.fsPath;
}

// 获取编辑器相对路径
function getRelativePath (editor = vscode.window.activeTextEditor) {
  if (!editor || !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) { return ''; }
  return path.relative(getEditorRoot(editor), getEditorFilePath(editor));
}
  
function sleep (time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function confirm (message: string, options: string[]): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    return vscode.window.showInformationMessage(message, ...options).then(resolve);
  });
}

function prompt (message: string, defaultVal: string = ''): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    return vscode.window.showInputBox({
      value: defaultVal,
      prompt: message
    }).then(resolve);
  });
}

function hash (buffer: Buffer | string): string {
  let sha256 = crypto.createHash('sha256');
  let hash = sha256.update(buffer).digest('hex');
  return hash;
}

function getOpenCmd (): string {
  let cmd = 'start';
  if (process.platform === 'win32') {
    cmd = 'start';
  } else if (process.platform === 'linux') {
    cmd = 'xdg-open';
  } else if (process.platform === 'darwin') {
    cmd = 'open';
  }
  return cmd;
}

function getLineContent(lineNumber: number, editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor) {
  if (editor) {
      const line = editor.document.lineAt(lineNumber);
      return line.text;
  }
  return null;
}

async function replaceText(range: vscode.Range, newText: string, editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor) {
  if (editor) {
      const oldEnd = range.end;
      const oldText = editor.document.getText(range);
      await editor.edit(editBuilder => {
          editBuilder.replace(range, newText);
      });
      const newLines = newText.split('\n');
      const oldLines = oldText.split('\n');
      const lineOffset = newLines.length - oldLines.length;
      const characterOffset = newLines[newLines.length - 1].length - oldLines[oldLines.length - 1].length;
      return {
        lineOffset,
        characterOffset
      };
  }
}

function goToLine(lineNumber: number, editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor) {
  if (editor) {
    const range = editor.document.lineAt(lineNumber).range;
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }
}

function hoverText(text: string) {
  const hoverMessage = new vscode.MarkdownString(text, true);
  hoverMessage.isTrusted = true;
  return new vscode.Hover(hoverMessage);
}

function getEditorByDoc(document?: vscode.TextDocument): vscode.TextEditor | undefined {
  for (let editor of vscode.window.visibleTextEditors) {
      if (editor.document === document) {
          return editor;
      }
  }
  return undefined;
}

function getConfig () {
  let keys: string[] = Object.keys(pkg.contributes.configuration.properties);
  let values: Config = {};
  function toVal(str: string, val: string|undefined, cfg: Config) : string | Config {
      let keys = str.split('.');
      if (keys.length === 1) {
          cfg[keys[0]] = val;
      } else {
          cfg[keys[0]] = toVal(keys.slice(1).join('.'), val, cfg[keys[0]] || {});
      }
      return cfg;
  }
  keys.forEach(k => toVal(k.split('.').slice(1).join('.'), vscode.workspace.getConfiguration().get(k), values));
  return values;
}


export {
  showProgress,
  editorEdit,
  insertToEnd,
  mkdirs,
  openFolder,
  highlightText,
  getSelections,
  getSelectionByPosition,
  getEditorRoot,
  getEditorFilePath,
  getRelativePath,
  getEditorByDoc,
  sleep,
  confirm,
  prompt,
  hash,
  getOpenCmd,
  getLineContent,
  replaceText,
  goToLine,
  hoverText,
  getConfig
};
