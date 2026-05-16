import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false, // disable in production — reduces bundle size
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom'],
          'vendor-query':   ['@tanstack/react-query', '@tanstack/react-query-persist-client', '@tanstack/query-async-storage-persister'],
          'vendor-motion':  ['motion'],
          'vendor-charts':  ['recharts'],
          'vendor-pdf':     ['jspdf', 'jspdf-autotable'],
          'vendor-idb':     ['idb-keyval'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
