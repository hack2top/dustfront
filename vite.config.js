import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Важно для деплоя на GitHub Pages / статику
  server: {
    port: 3000,
    open: true
  }
});