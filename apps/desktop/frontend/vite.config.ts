import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    sourcemap: 'hidden',
  },
  resolve: {
    alias: {
      react: path.resolve(__dirname, '../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    react({
      babel: {
        plugins: [],
      },
    }),
    tsconfigPaths()
  ],
})
