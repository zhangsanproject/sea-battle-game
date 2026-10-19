import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Relative production assets work on Cloudflare Pages and in subdirectories.
  base: command === 'build' ? './' : '/',
  build: {
    target: 'es2020',
  },
}));
