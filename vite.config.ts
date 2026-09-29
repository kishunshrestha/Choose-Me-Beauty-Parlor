import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve('frontend'),
  plugins: [react()],
  build: { outDir: resolve('dist'), emptyOutDir: true },
});
