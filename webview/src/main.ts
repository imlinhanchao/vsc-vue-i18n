import 'element-plus/dist/index.css';
import 'virtual:windi.css';
import './assets/main.less';

import * as ElIcons from '@element-plus/icons-vue';
import ElementPlus from 'element-plus';
import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

window.vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : window.parent;

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(ElementPlus);
for (const icon in ElIcons) {
  app.component(`ElIcon${icon}`, ElIcons[icon]);
}
app.mount('#app');

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.command) {
    case 'style': {
      // 接受 iframe 父窗体转发的 VSCode html 注入的 style
      document.querySelector('html')!.setAttribute('style', message.data);
      break;
    }
  }
});
