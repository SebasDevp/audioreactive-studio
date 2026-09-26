import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  optimizeDeps: {
    include: ['three']
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        control: resolve(__dirname, 'control.html'),
        output: resolve(__dirname, 'output.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three-vendor';
        }
      }
    }
  }
});
