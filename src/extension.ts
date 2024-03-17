import * as vscode from 'vscode';
import { IMatchPos, i18nWindow } from './lib/windows';
import { getEditorByDoc, getSelectionByPosition, hash, hoverText } from './lib/utils';

export function activate (context: vscode.ExtensionContext) {

  console.debug('Congratulations, your extension "vue-i18n" is now active!');
  const i18nWindows: Record<string, i18nWindow> = {};

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      const key = hash(editor.document.uri.fsPath);
      if (i18nWindows[key]) {
        i18nWindows[key].updateEditor(editor);
      }
    }
});

  context.subscriptions.push(vscode.commands.registerCommand('vue-i18n.autoRecognition', () => {
    const editor = getEditorByDoc(vscode.window.activeTextEditor?.document);
    if (!editor) { return; }

    const key = hash(editor.document.uri.fsPath);
    if (!i18nWindows[key] || !i18nWindows[key].webView?.panel) {
      i18nWindows[key] = new i18nWindow(editor);
      i18nWindows[key].parse(context);
    } else {
      i18nWindows[key].webView?.panel?.reveal();
    }
  }));

  context.subscriptions.push(vscode.languages.registerHoverProvider({scheme: 'file'}, {
    provideHover(document, position, token) {
        const key = hash(document.uri.fsPath);
        if (!i18nWindows[key] || !i18nWindows[key].webView?.panel) {
            return;
        }
        if (i18nWindows[key].hasPostion(position)) { 
          return hoverText(`[$(trash) 移除翻译位置](command:vue-i18n.removePosition?[${JSON.stringify({
            key: key,
            pos: {
              line: position.line,
              character: position.character
            }
          })}])`);
        }
        let selection :vscode.Range | null | undefined = getSelectionByPosition(position);
        if (!selection) { return; }
        const word = document.getText(selection as vscode.Range);
        return hoverText(`[$(add) 添加到多语言](command:vue-i18n.addText?[${JSON.stringify({
            key: key,
            text: encodeURIComponent(word),
            start: {
              line: selection.start.line,
              index: selection.start.character
            },
            end: {
              line: selection.end.line,
              index: selection.end.character
            }
        })}])`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vue-i18n.removePosition', ({pos, key}) => {
    if (!i18nWindows[key] || !i18nWindows[key].webView?.panel) {
      return;
    }
    i18nWindows[key].removePos(new vscode.Position(pos.line, pos.character));
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vue-i18n.addText', ({text, start, end, key}) => {
    if (!i18nWindows[key] || !i18nWindows[key].webView?.panel) {
      return;
    }
    i18nWindows[key].addText(text, new IMatchPos(start), new IMatchPos(end));
  }));

}

export function deactivate () { }
