import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // A concrete plugins array keeps Cloudflare's config auto-detector happy.
  plugins: [],
  // Relative production assets work on Cloudflare Pages and in subdirectories.
  base: command === 'build' ? './' : '/',
  build: {
    target: 'es2020',
  },
}));
