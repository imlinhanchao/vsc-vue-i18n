import fetch from 'node-fetch';
import { getConfig } from './utils';
import * as crypto from 'crypto';

function md5 (buffer: Buffer | string): string {
  let sha256 = crypto.createHash('md5');
  let hash = sha256.update(buffer).digest('hex');
  return hash;
}

export class ITranslates {
  /**
   * 来源语言
   */
  from?: string;
  /**
   * 目标语言
   */
  to: string;
  /**
   * 内容数组
   */
  texts: string[];

  constructor(texts: string[], to: string = 'en', from: string = 'zh') {
    this.from = from;
    this.to = to;
    this.texts = texts;
  }

  toJson() {
    const { appId, appKey } = getConfig();
    if (appId === '' || appKey === '') {
      throw new Error('请先配置百度翻译的 APP ID 和 APP Key');
    }
    const salt = new Date().getTime();
    return {
      from: this.from,
      to: this.to,
      q: this.texts.join('\n'),
      salt,
      appid: appId,
      sign: md5(appId + this.texts.join('\n') + salt + appKey)
    };
  }

  toQuery() {
    const data: any = this.toJson();
    return Object.keys(data).map((key) => {
      return `${key}=${encodeURIComponent(data[key])}`;
    }).join('&');
  }
}
export interface ITranslateResult {
  /**
   * 来源语言
   */
  from?: string;
  /**
   * 目标语言
   */
  to: string;
  /**
   * 内容数组
   */
  items: {
    /**
     * 字段内容，即待翻译的内容
     */
    src: string;
    /**
     * 字段内容，即待翻译的内容
     */
    dst: string;
  }[];
}
export function translateTexts(data: ITranslates): Promise<ITranslateResult> {
  return fetch(`http://api.fanyi.baidu.com/api/trans/vip/translate?${data.toQuery()}`, { 
    method: 'get'
  })
  .then((response) => {
    return response.json();
  }).then((value) => {
    return {
      from: value.from,
      to: value.to,
      items: value.trans_result ?? []
    };
  });
}