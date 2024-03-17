import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import WindiCSS from 'vite-plugin-windicss';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import PurgeIcons from 'vite-plugin-purge-icons';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    vueJsx(),
    WindiCSS(),
    PurgeIcons({
      /* PurgeIcons Options */
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: '../out/webview',
    emptyOutDir: true
  },
  css: {
    preprocessorOptions: {
      less: {
        math: 'always',
        relativeUrls: true,
        javascriptEnabled: true
      }
    }
  }
});
//# sourceMappingURL=vite.config.js.map
