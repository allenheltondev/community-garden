import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Force a single React copy across the workspace. Without this, npm's
  // hoisting can leave a nested apps/grn/node_modules/react alongside the
  // root copy that react-dom resolves; the two Reacts don't share the
  // hooks dispatcher and useState reads as null on first render.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2015',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'aws-vendor': ['aws-amplify', '@aws-amplify/ui-react'],
          'query-vendor': ['@tanstack/react-query']
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  },
  preview: {
    port: 4173,
    host: true
  }
})
