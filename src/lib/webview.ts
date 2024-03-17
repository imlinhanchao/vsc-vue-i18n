import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { ITranslates, translateTexts } from './api';

export interface WebviewOptions {
  name: string;
  path: string;
  onMessage?: (message: any) => void;
  onDidDispose?: () => void;
}

export class Webview {
  panel?: vscode.WebviewPanel;
  root: string = '';
  constructor(context: vscode.ExtensionContext, options: WebviewOptions) {
    this.root = context.extensionPath;
    this.panel = vscode.window.createWebviewPanel(
      `${options.name}WebView`,
      options.name,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath))]
      }
    );
    this.panel.webview.html = this.getHtml(options);
    if (options.onMessage) {
      this.panel.webview.onDidReceiveMessage((message) => {
        switch(message.command) {
          case 'ready':
            this.responseMessage('path', options.path || '/');
            break;
          case 'translate':
            const { texts, from, to } = message.data;
            translateTexts(new ITranslates(texts, to, from)).then((data) => {
              this.responseMessage(message.key, data);
            }).catch((err) => {
              vscode.window.showWarningMessage(err.message);
            });
            break;
          default:
            options.onMessage!(message);
            break;
        }
      });
    }
    this.panel.onDidDispose(() => {
      if (options.onDidDispose) {
        options.onDidDispose();
      }
      this.panel = undefined;
    });
  }

  responseMessage(key: string, data: any) {
    this.panel!.webview.postMessage({ command: key, data });
  }

  getHtml(options: WebviewOptions) {
    // 通过 dev 文件夹是否存在来判断现在是打包模式还是开发模式
    let exists = fs.existsSync(path.resolve(__dirname, '..', '..', 'dev'));
		
    // 获取 index.html 文件路径
    let mainHtml = exists ? 
			path.resolve(__dirname, '..', '..', 'dev', 'index.html') : 
			path.resolve(__dirname, '..', 'webview', 'index.html');

    // 获取 base 路径的 VSCode uri，这样才能载入本地资源
		let baseUrl = vscode.Uri.file(exists ?
			path.join(this.root, 'dev', '/') :
			path.join(this.root, 'out', 'webview', '/')
    );

    // 读取到的文件做一些处理，替换 base 路径，添加 CSP （才能正常执行外部的 js）等。
		return fs.readFileSync(mainHtml).toString().replace(/<base href="[^"]*">/, 
			 `<base href="${this.panel!.webview.asWebviewUri(baseUrl)}">`)
			.replace(/<(script|link) /g, '<$1 nonce="vuescript" ')
			.replace(/<head>/, `<head>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; 
				img-src *; font-src http://* https://*; style-src http://* https://* 'unsafe-inline'; frame-src *;script-src 'nonce-vuescript';">`);
  }
}