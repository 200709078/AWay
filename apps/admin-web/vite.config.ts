import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const apiTarget = environment.AWAY_API_PROXY_TARGET ?? 'http://localhost:3000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/auth': apiTarget,
        '/users': apiTarget,
        '/schools': apiTarget,
        '/health': apiTarget,
      },
    },
  }
})
