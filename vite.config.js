import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/client/index.js'),
      output: {
        entryFileNames: 'bundle.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) {
            return 'bundle.css'
          }
          return '[name][extname]'
        }
      },
      // Suppress noisy warnings from third-party dependencies (e.g. ox)
      // about misplaced /*#__PURE__*/ annotations. These warnings are
      // harmless and clutter the console during local development & CI.
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION') return
        warn(warning)
      }
    }
  },
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'jsx',
    jsxFragment: 'Fragment'
  }
})