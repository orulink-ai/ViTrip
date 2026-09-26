import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-board-fonts',
      closeBundle() {
        fs.cpSync(
          'node_modules/@excalidraw/excalidraw/dist/prod/fonts',
          'dist/renderer/excalidraw/fonts',
          { recursive: true },
        );
      },
    },
  ],
  define: { 'process.env.IS_PREACT': 'false' },
  resolve: { alias: { '~': path.resolve('src/renderer') } },
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
});
