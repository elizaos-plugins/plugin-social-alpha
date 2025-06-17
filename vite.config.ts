import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    emptyOutDir: false,
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@elizaos/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    alias: {
      '@elizaos/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
});
