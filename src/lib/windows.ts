import * as vscode from 'vscode';
import exceljs from 'exceljs';
import fs from 'fs';
import { Webview } from './webview';
import { getConfig, getEditorFilePath, getLineContent, getOpenCmd, getRelativePath, goToLine, highlightText, mkdirs, openFolder, replaceText } from './utils';
import { spawn } from 'child_process';
import { ITranslates, translateTexts } from './api';
import path from 'path';
import langMap from './langs';

export interface IMessage {
  command: string;
  data: any;
}

export class IMatchPos {
  line: number;
  index: number;
  constructor({ line, index }: { line?: number; index?: number } = {}) {
    this.line = line ?? 0;
    this.index = index ?? 0;
  }
}

export class IMatchRange {
  start: IMatchPos;
  end: IMatchPos;
  type: string; // 弃用
  decoration?: vscode.TextEditorDecorationType;

  constructor({
    start,
    end,
    type,
    decoration,
  }: {
    start?: IMatchPos;
    end?: IMatchPos;
    type?: string;
    decoration?: vscode.TextEditorDecorationType;
  } = {}) {
    this.start = start ?? new IMatchPos();
    this.end = end ?? new IMatchPos();
    this.type = type ?? '';
    this.decoration = decoration;
  }

  get toJson () {
    return {
      start: this.start,
      end: this.end,
      type: this.type,
    };
  }
}

export class ILangData {
  id: number;
  key: string;
  value: string;
  pos: IMatchRange[];
  i18n: any = {
  };

  constructor({
    key,
    value,
    pos,
  }: {
    id?: number;
    key?: string;
    value?: string;
    pos?: IMatchRange[];
  } = {}) {
    this.id = new Date().getTime();
    this.key = key ?? '';
    this.value = value ?? '';
    this.pos = pos ?? [];
  }

  get toJson () {
    return {
      id: this.id,
      key: this.key,
      value: this.value,
      pos: this.pos.map(p => p.toJson),
    };
  }
}

export class i18nWindow {
  editor: vscode.TextEditor;
  langTexts: ILangData[] = [];
  webView?: Webview;
  templateIndex: number[] = [];
  $t: string = '$t';

  constructor(editor: vscode.TextEditor) {
    this.editor = editor;
  }

  updateEditor (editor: vscode.TextEditor) {
    if (!this.webView?.panel) {return;}
    this.editor = editor;
    this.langTexts.forEach((lang) => {
      lang.pos.forEach((pos) => {
        pos.decoration = highlightText(this.editor, new vscode.Range(pos.start.line, pos.start.index, pos.end.line, pos.end.index));
      });
    });
    this.webView?.panel?.reveal();
  }

  // 过滤注释与属性中的<字符，以便解析标签结构
  filterText (text: string) {
    const filterRegs = [
      [/<!--[\s\S]+?-->/g, /\S/g],
      [/(v-:|@|\s)[\w:\-.]+="[^"]*?"/g, />|</g],
    ];
    filterRegs.forEach((reg, i) => {
      // 将正则匹配到的内容每个字符替换为点号
      text = text.replace(reg[0], match => match.replace(reg[1], ' '));
    });
    return text;
  }

  filterComment(text: string) {
    const filterRegs = [
      [/<!--[\s\S]+?-->/g, /\S/g],
      [/\/\*[\S\s]*?(\*\/|$)/g, /\S/g],
      [/\/\/.*?(\n|$)/g, /\S/g],
    ];
    filterRegs.forEach((reg, i) => {
      // 将正则匹配到的内容每个字符替换为点号
      text = text.replace(reg[0], match => match.replace(reg[1], ' '));
    });
    return text;
  }

  // 嗅探标签内包含的字符，并加入到语言列表中
  matchTag (mat: RegExpMatchArray, text: string, lastLine: number) {
    let matText = mat[3];
    let startIndex = (mat.index ?? 0) + mat[1].length + mat[2].length + 1;

    // 去除标签前的空白字符与数字
    const trimMat = matText.match(/^(\s|\d)+/);
    if (trimMat) {
      startIndex = startIndex + trimMat[0].length;
    }
    matText = matText.replace(/^(\s|\d)+|(\s|\d)+$/g, '');

    if (matText.search(/[\u4e00-\u9fa5\u3000-\u303F]/) === -1) { return false; }

    // 计算其所在编辑器的起始位置
    let lines = text.slice(0, startIndex).split('\n');
    const preText = lines.slice(0, -1).map(l => l + '\n').join('');
    const startPos = new IMatchPos({
      line: lastLine + lines.length - 1,
      index: startIndex - preText.length,
    });

    // 计算结束位置
    lines = text.slice(0, startIndex + matText.length).split('\n');
    const nextText = lines[lines.length - 1];
    const endPos = new IMatchPos({
      line: lastLine + lines.length - 1,
      index: nextText.length,
    });

    // 高亮文本
    const decoration = highlightText(this.editor, new vscode.Range(startPos.line, startPos.index, endPos.line, endPos.index));

    const pos = new IMatchRange({
      start: startPos,
      end: endPos,
      type: 'tag',
      decoration,
    });

    // 如果文本已经在语言列表中，则将位置加入到其位置列表中，否则加入到语言列表中
    const lang = this.langTexts.find(l => l.value === matText);
    if (lang) { lang.pos.push(pos); }
    else {
      this.langTexts.push(new ILangData({
        key: '',
        value: matText,
        pos: [pos],
      }));
    }
    return true;
  }

  // 嗅探属性中包含的中文字符，并加入到语言列表中
  matchAttr (text: string, lastLine: number) {
    // let valueReg = /(?<=\=")([^"\u4e00-\u9fa5\u3000-\u303F]*)([\u4e00-\u9fa5\u3000-\u303F]+[^"'`]*)([^"\u4e00-\u9fa5\u3000-\u303F]*)(?=")/g;
    let valueReg = /(?<=\=*("|'|`)[^"\u4e00-\u9fa5\u3000-\u303F]*?)([\u4e00-\u9fa5\u3000-\u303F]+?[^"'`]*?)([^"\u4e00-\u9fa5\u3000-\u303F]*?)\1/g;
    const matchs = text.matchAll(valueReg);
    // 匹配属性中的中文字符，若没有则返回
    if (!matchs) { return false; }

    for (const m of matchs) {
      let value = m[2];
      let startIndex = (m.index ?? 0);
      value = value.replace(/[^"\u4e00-\u9fa5\u3000-\u303F]+$/, '');

      // 计算其所在编辑器的起始位置
      let lines = text.slice(0, startIndex).split('\n');
      const preText = lines.slice(0, -1).map(l => l + '\n').join('');
      const startPos = new IMatchPos({
        line: lastLine + lines.length - 1,
        index: startIndex - preText.length,
      });

      // 计算结束位置
      lines = text.slice(0, startIndex + value.length).split('\n');
      const nextText = lines[lines.length - 1];
      const endPos = new IMatchPos({
        line: lastLine + lines.length - 1,
        index: nextText.length,
      });

      // 高亮文本
      const decoration = highlightText(this.editor, new vscode.Range(startPos.line, startPos.index, endPos.line, endPos.index));

      const pos = new IMatchRange({
        start: startPos,
        end: endPos,
        type: 'attr',
        decoration,
      });

      // 如果文本已经在语言列表中，则将位置加入到其位置列表中，否则加入到语言列表中
      const lang = this.langTexts.find(l => l.value === value);
      if (lang) { lang.pos.push(pos); }
      else {
        this.langTexts.push(new ILangData({
          key: '',
          value,
          pos: [pos],
        }));
      }
    }
  }

  matchScript (mat: RegExpMatchArray, text: string, lastLine: number) {
    let valueReg = /((?=[\u4e00-\u9fa5·！？、—，。；：‘”’“《》【】（）…￥])([\u4e00-\u9fa5\u3000-\u303F]|[^${}`"':])*(?<=:*[\u4e00-\u9fa5·！？、—，。；：‘”’“《》【】（）…￥]))/g;
    const matchs = text.matchAll(valueReg);
    // 匹配属性中的中文字符，若没有则返回
    if (!matchs) { return false; }

    let isMatch = false;
    for (const m of matchs) {
      isMatch = true;
      let value = m[0];
      let startIndex = (m.index ?? 0);

      // 计算其所在编辑器的起始位置
      let lines = text.slice(0, startIndex).split('\n');
      const preText = lines.slice(0, -1).map(l => l + '\n').join('');
      const startPos = new IMatchPos({
        line: lastLine + lines.length - 1,
        index: startIndex - preText.length,
      });

      // 计算结束位置
      lines = text.slice(0, startIndex + value.length).split('\n');
      const nextText = lines[lines.length - 1];
      const endPos = new IMatchPos({
        line: lastLine + lines.length - 1,
        index: nextText.length,
      });

      // 高亮文本
      const decoration = highlightText(this.editor, new vscode.Range(startPos.line, startPos.index, endPos.line, endPos.index));

      const pos = new IMatchRange({
        start: startPos,
        end: endPos,
        type: 'script',
        decoration,
      });

      // 如果文本已经在语言列表中，则将位置加入到其位置列表中，否则加入到语言列表中
      const lang = this.langTexts.find(l => l.value === value);
      if (lang && !lang.pos.some(p => 
        p.start.index === pos.start.index && p.start.line === pos.start.line && p.end.index === pos.end.index && p.end.line === pos.end.line
      )) { lang.pos.push(pos); }
      else if (!lang) {
        this.langTexts.push(new ILangData({
          key: '',
          value,
          pos: [pos],
        }));
      }
    }
    return isMatch;
  }

  // 解析文件
  parse (context: vscode.ExtensionContext) {
    const lineLength = this.editor.document.lineCount;
    let lineText = '';
    let lastLine = 0;
    let isTemplate = false; // 标记是否已经获取到 template 开标签
    let isScript = this.editor.document.fileName.endsWith('.ts'); // 标记是否已经获取到 Scrpt 开标签或者是 ts 文件
    for (let i = 0; i < lineLength; i++) {
      const line = this.editor.document.lineAt(i);
      const text = lineText + line.text;
      if (!isTemplate && text.includes('<template>')) {
        lastLine = i + 1;
        lineText = '';
        isTemplate = true;
        continue;
      }
      
      if (text.includes('<script')) {
        // 如果还有剩余内容，匹配属性中的中文字符
        if (lineText) {
          this.matchAttr(this.filterComment(lineText), lastLine);
        }

        lastLine = i + 1;
        lineText = '';
        isScript = true;
        isTemplate = false;
        continue;
      }

      if (text.includes('</script>')) {
        isScript = false;
      }

      if (!isTemplate && !isScript) { 
        lastLine = i + 1;
        lineText = '';
        continue; 
      }

      if (isScript) {
        const mats = this.filterComment(text).matchAll(/([`'"])([^\1]|\\1)+\1/g);
        let isMatch = false;
        for (const m of mats) {
          // 先检查是否是包含有效内容
          if (!this.matchScript(m, this.filterComment(text), lastLine)) { continue; }
          isMatch = true;
        }
  
        if (!isMatch) {
          // 如果没有匹配到，就将现在的文本加入到下一轮的匹配中去
          lineText = text + '\n';
        } else {
          lineText = '';
          lastLine = i + 1;
        }
        continue;
      }

      // 从文本中匹配出所有标签
      const mats = this.filterText(text).matchAll(/(<\/?\w+)([^>]*?)>([^<{}]+)(?=<)/g);
      let isMatch = false;

      for (const m of mats) {
        // 先检查是否是包含有效内容标签
        if (!this.matchTag(m, this.filterText(text), lastLine)) { continue; }
        isMatch = true;
        // 如果是，则匹配所有属性中的中文字符
        this.matchAttr(this.filterComment(text), lastLine);
      }

      if (!isMatch) {
        // 如果没有匹配到，就将现在的文本加入到下一轮的匹配中去
        lineText = text + '\n';
      } else {
        lineText = '';
        lastLine = i + 1;
      }
    }

    // 如果还有剩余内容，匹配属性中的中文字符
    if (lineText) {
      this.matchAttr(this.filterComment(lineText), lastLine);
    }

    // 初步匹配完成，启动webview界面用于编辑
    this.webView = new Webview(context, {
      name: getRelativePath(this.editor),
      path: '/',
      onMessage: (message) => this.onMessage(message),
      onDidDispose: () => {
        this.langTexts.forEach((lang) => {
          lang.pos.forEach((p) => {
            p.decoration?.dispose();
          });
        });
      }
    });
  }

  // 添加文本到语言列表
  addText (text: string, start: IMatchPos, end: IMatchPos) {
    const lang = this.langTexts.find(l => l.value === text);
    const decoration = highlightText(this.editor, new vscode.Range(start.line, start.index, end.line, end.index));
    if (lang) {
      lang.pos.push(new IMatchRange({ start, end, decoration, type: 'custom' }));
      return;
    }
    const data = new ILangData({
      key: '',
      value: text,
      pos: [new IMatchRange({ start, end, decoration, type: 'custom' })],
    });
    this.langTexts.push(data);
    this.webView!.panel!.webview.postMessage({ command: 'push', data });
  }

  // 导出国际化文件
  async exportFile () {
    const folder = await openFolder();
    if (!folder) { return; }
    let file = path.basename(getEditorFilePath(this.editor), '.vue');
    if (file === 'index') {
      file = path.basename(path.dirname(getEditorFilePath(this.editor)));
    } else {
      file = path.basename(path.dirname(getEditorFilePath(this.editor))) + '_' + file;
    }
    mkdirs(path.join(folder, 'i18n', 'zh'));
    const { i18nFunctionName, autoTranslateResult, exportLanguageExcel, languages, appId, appKey } = getConfig();
    this.$t = i18nFunctionName || '$t';
    await this.updateEditorText();
    let i18nText = 'export default {\n' + this.langTexts.map(l => `  ${l.key.match(/^\d/) ? `'${l.key}'` : l.key}: '${l.value.replace(/'/g, '\\$&')}',`).join('\n') + '\n};\n';

    fs.writeFileSync(path.join(folder, 'i18n', 'zh', file + '.ts'), i18nText);

    if (autoTranslateResult) {
      if (appId === '' || appKey === '') {
        vscode.window.showWarningMessage('请先配置百度翻译的 APP ID 和 APP Key');
      } else {
        await Promise.all(languages.map(async (lang: string) => {
          try {
            await translateTexts(new ITranslates(this.langTexts
                .filter((l) => l.key)
                .map((l) => l.value),
                lang
            )).then(rsp => {
              this.langTexts.forEach((item) => {
                if (!item.key) { return; }
                item.i18n[lang] = rsp.items
                  .find((i) => i.src === item.value)
                  ?.dst.trim() || '';
              });
            });
      
            i18nText = 'export default {\n' + this.langTexts.map(l => `  ${l.key.match(/^\d/) ? `'${l.key}'` : l.key}: '${l.i18n[lang].replace(/'/g, '\\$&')}',`).join('\n') + '\n};\n';
            mkdirs(path.join(folder, 'i18n', lang));
            fs.writeFileSync(path.join(folder, 'i18n', lang, file + '.ts'), i18nText);
          } catch (error: any) {
            console.debug(`翻译${langMap[lang]}失败：`, error.message);
          }
        }));
      }
    }

    const workbook = new exceljs.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.columns = [
      { header: 'key', key: 'key', width: 0 },
      { header: '简体中文', key: 'value', width: 32 },
      ...languages.map((lang :string) => ({ header: langMap[lang], key: lang, width: 32 }))
    ];
    sheet.addRows(this.langTexts.map(lang => ({ key: lang.key, value: lang.value, ...lang.i18n })));
    await workbook.xlsx.writeFile(path.join(folder, 'i18n', 'i18n.xlsx'));
    spawn(getOpenCmd() + ' ' + folder);
  }

  saftRegexp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 根据文本检查替换模式
  checkContentType (content: string, value: string, key: string) {
    // 不同类型的标签内容需要有不同插入t函数的模式，这里分别匹配
    const repValue = this.saftRegexp(value);
    let regs: Record<string, RegExp> = {
      tag: new RegExp(`(?<=<\\/?\\w+[^>]*?>)[^<{}]*${repValue}(?=<)`),
      key: new RegExp(`(?<=['"]*)([^"'\\s]*?)${repValue}([^"'\\s]*?)(?=([\\s'"]*):\\s)`),
      keyRaw: new RegExp(`(?<=\`)([^\`]*?)${repValue}([^\`]*?)(\`*)(?=\\]:\\s)`),
      command: new RegExp(`(v-[\\w:\\-.]+)="([^"]*?)${repValue}([^"]*?)"`),
      event: new RegExp(`(@[\\w:\\-.]+)="([^"]*?)${repValue}([^"]*?)"`),
      attr: new RegExp(`(:?[\\w:\\-.]+)="([^"]*?)${repValue}([^"]*?)"`),
      value: new RegExp(`'([^']*?)${repValue}([^']*?)'`),
      raw: new RegExp(`\`[^\`]*?${repValue}[^\`]*?(\`|$)`),
      text: new RegExp(`^\\s*[^<{}]*${repValue}`),
    };
    const reg = Object.keys(regs).find((k) => content.match(regs[k]));
    if (reg === 'attr') {
      // 如果上下文是属性内容，则需要判断是否以 : 起始
      const mat = regs.attr.exec(content);
      if (mat) {
        let newText = content.slice(mat.index, mat.index + mat[0].length);
        if (!mat[1].startsWith(':')) {
          // 如果没有，就重设定插入替换内容
          newText = `${mat[2]}${value}${mat[3]}`;
          newText = newText !== value ? ('`' + newText + '`').replace(value, `\${${this.$t}('${key}')}`) : `${this.$t}('${key}')`;
          newText = `:${mat[1]}="${newText}"`;
        }
        // 重新计算替换位置
        const start = mat[1].length + mat[2].length + 2;
        const end = mat[3].length + 1;
        return {
          type: reg,
          offset: {
            start,
            end,
          },
          newText,
        };
      }
    }
    if (reg === 'key') {
      const mat = regs.key.exec(content);
      if (mat) {
        let newText = content.slice(mat.index, mat.index + mat[0].length);
        newText = newText !== value ? ('`' + newText + '`').replace(value, `\${${this.$t}('${key}')}`) : `${this.$t}('${key}')`;
        newText = '[' + newText + ']';
        return {
          type: reg,
          newText,
          offset: {
            start: mat[1].length,
            end: mat[2].length,
          },
        };
      }
    }
    // 匹配 'xxxx中文xxx' 的情况，转为 `xxx${t('key')}xxx`
    if (reg === 'value' || reg === 'event' || reg === 'command') {
      const mat = regs.value.exec(content);
      if (mat) {
        let newText = content.slice(mat.index + 1, mat.index + mat[0].length - 1);
        newText = newText !== value ? ('`' + newText + '`').replace(value, `\${${this.$t}('${key}')}`) : `${this.$t}('${key}')`;
        return {
          type: reg,
          newText,
          offset: {
            start: mat[1].length + 1,
            end: mat[2].length + 1,
          },
        };
      }
    }
    return {
      type: reg ?? 'unknown'
    };
  }

  // 根据值与国际化key替换文本
  async replaceText (value: string, key: string, range: vscode.Range) {
    console.debug('replace text', value, key);
    let lineContent = '';
    for (let i = range.start.line; i <= range.end.line; i++) {
      lineContent += getLineContent(i, this.editor);
    }
    const checkResult = this.checkContentType(lineContent, value, key);

    // 不同模式的替换文本
    const newTexts: Record<string, string> = {
      text: `{{${this.$t}('${key}')}}`,
      tag: `{{${this.$t}('${key}')}}`,
      keyRaw: `\${${this.$t}('${key}')}`,
      attr: `\${${this.$t}('${key}')}`,
      event: `\${${this.$t}('${key}')}`,
      value: `\${${this.$t}('${key}')}`,
      raw: `\${${this.$t}('${key}')}`,
    };
    let newText = checkResult.newText ?? newTexts[checkResult.type] ?? `${this.$t}('${key}')`;

    // 如果有偏移量，则需要重新计算替换位置
    if (checkResult.offset) {
      const start = new vscode.Position(range.start.line, range.start.character - checkResult.offset.start);
      const end = new vscode.Position(range.end.line, range.end.character + checkResult.offset.end);
      range = new vscode.Range(start, end);
    }
    return await replaceText(range, newText, this.editor);
  }

  getLineOffset(offsets: Record<number, number> | undefined, index: number) {
    if (!offsets) { return 0; }
    let offset = 0;
    Object.keys(offsets).forEach(k => {
      if (Number(k) > index) { return; }
      offset += offsets[Number(k)];
    });
    return offset;
  }

  // 更新编辑器内筛选出的国际化文本
  async updateEditorText () {
    const offsets: any = {};
    let lineOffset = 0;
    for (let i = 0; i < this.langTexts.length; i++) {
      const lang = this.langTexts[i];
      if (!lang.key) { continue; }
      for (let j = 0; j < lang.pos.length; j++) {
        const p = lang.pos[j];
        const range = new vscode.Range(
          p.start.line + lineOffset,
          p.start.index + this.getLineOffset(offsets[p.start.line + lineOffset], p.start.index),
          p.end.line + lineOffset,
          p.end.index + this.getLineOffset(offsets[p.end.line + lineOffset], p.end.index)
        );
        highlightText(this.editor, null, p.decoration);
        let offset = await this.replaceText(lang.value, lang.key, range);
        if (offset && offset.lineOffset) {
          lineOffset += offset.lineOffset;
        }
        if (offset) { 
          offsets[p.end.line + lineOffset] = offsets[p.end.line + lineOffset] ?? {};
          offsets[p.end.line + lineOffset][p.end.index] = (offsets[p.end.line + lineOffset][p.end.index] ?? 0) + offset.characterOffset; 
        }
      };
    };
  }

  hasPostion (pos: vscode.Position): boolean {
    return this.langTexts.some(l => l.pos.some(
      p => new vscode.Range(p.start.line, p.start.index, p.end.line, p.end.index).contains(pos)
    ));
  }

  removePos(pos: vscode.Position) {
    const langIndex = this.langTexts.findIndex(l => l.pos.some(p => 
      new vscode.Range(p.start.line, p.start.index, p.end.line, p.end.index).contains(pos)
    ));
    if (langIndex < 0) { return; }
    const lang = this.langTexts[langIndex];
    const posIndex = lang.pos.findIndex(p => new vscode.Range(p.start.line, p.start.index, p.end.line, p.end.index).contains(pos));
    highlightText(this.editor, null, lang.pos[posIndex].decoration);
    lang.pos.splice(posIndex, 1);
    if (lang.pos.length === 0) {
      this.langTexts.splice(langIndex, 1);
    }
    this.webView!.panel!.webview.postMessage({ command: 'data', data: this.langTexts });
  }

  // 处理来自 Webview 的命令
  onMessage (message: any) {
    console.debug(message);
    switch (message.command) {
      // 从 Webview 获取数据
      case 'data':
        this.webView!.panel!.webview.postMessage({ command: 'data', data: this.langTexts });
        break;
      // 更新语言列表
      case 'update':
        this.langTexts = message.data;
        break;
      // 更新某个语言项目
      case 'update:item': {
        const lang = this.langTexts.find(l => l.id === message.data.id);
        if (!lang) { return; }
        lang.key = message.data.key;
        lang.value = message.data.value;
        break;
      }
      // 移除某个语言项目
      case 'remove:item': {
        const langIndex = this.langTexts.findIndex(l => l.id === message.data.id);
        if (langIndex < 0) { return; }
        const lang = this.langTexts.splice(langIndex, 1);
        lang[0].pos.forEach(p => highlightText(this.editor, null, p.decoration));
        break;
      }
      // 导出国际化文件
      case 'export': {
        this.exportFile().then(() => this.webView?.responseMessage(message.key, true));
        break;
      }
      // 跳转编辑器到指定行
      case 'jumpto': {
        goToLine(message.data, this.editor);
        break;
      }
    }
  }
}