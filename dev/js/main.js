// 获取 iframe 的 Vite 本地服务页面的 window 对象
let main = document.getElementById('main').contentWindow;
const vscode = acquireVsCodeApi();

document.getElementById('main').onload = () => {
  // 待页面加载完成后，将 vscode 的默认样式转发给 iframe 内页面
  main.postMessage({ command: 'style', data: document.querySelector('html').getAttribute('style')}, '*');
};

// 消息通信转发
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
  case 'forward':
    {
      // 转发 iframe 的消息给扩展后端
      message.command = message.real;
      vscode.postMessage(message);
      break;
    }
  default:
    {
      // 转发扩展后端的消息给 iframe
      main.postMessage(message, '*');
      break;
    }
  }
});