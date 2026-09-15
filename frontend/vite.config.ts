import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Le proxy redirige /api/* vers le backend FastAPI en développement.
// En production, un reverse proxy (nginx/Caddy) fait la même chose.
// Cela évite les problèmes CORS en dev (les deux origines deviennent une seule).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Les cookies httpOnly sont transmis via le proxy sans modification.
      },
    },
  },
})
