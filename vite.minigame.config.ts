import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Builds the Douyin mini-game bundle into `minigame-dist/game.js`.
 * The web entry (`index.html` + `src/main.ts`) is unaffected.
 */
export default defineConfig({
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    target: 'es2020',
    outDir: 'minigame-dist',
    emptyOutDir: true,
    minify: 'esbuild',
    lib: {
      entry: fileURLToPath(
        new URL('./src/minigame/main.ts', import.meta.url),
      ),
      name: 'SeaBattleMiniGame',
      formats: ['iife'],
      fileName: () => 'game.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
