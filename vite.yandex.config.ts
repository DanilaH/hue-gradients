import { defineConfig } from 'vite';

// Independent upload root: no Capacitor bridge/configuration enters this build.
export default defineConfig({
  root: 'web',
  base: './',
  resolve: { dedupe: ['phaser'] },
  build: { outDir: '../dist-yandex', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
