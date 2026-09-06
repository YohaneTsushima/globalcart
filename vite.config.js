// import base44 from "@base44/vite-plugin"
// import react from '@vitejs/plugin-react'
// import { defineConfig } from 'vite'

// // https://vite.dev/config/
// export default defineConfig({
//   logLevel: 'error', // Suppress warnings, only show errors
//   plugins: [
//     base44({
//       // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
//       // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
//       legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
//       hmrNotifier: true,
//       navigationNotifier: true,
//       analyticsTracker: true,
//       visualEditAgent: true
//     }),
//     react(),
//   ]
// });
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

// https://vite.dev/config/

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // 防御：Deploy.bat 的 set 可能泄漏到 process.env，覆盖 .env.local（仅 dev）
  if (mode === 'development' &&
      process.env.VITE_BACKEND_URL &&
      !process.env.VITE_BACKEND_URL.startsWith('http://localhost')) {
    delete process.env.VITE_BACKEND_URL;
  }
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = mode === 'development'
  const backendUrl = isDev
    ? 'http://localhost:8080'
    : (env.VITE_BACKEND_URL || 'https://api.beday.cc')
  const wsBackendUrl = isDev
    ? 'ws://localhost:8080'
    : (env.VITE_BACKEND_URL || 'https://api.beday.cc').replace('http', 'ws')

  return {
  logLevel: 'info',
  // 手动配置@别名，替代原来base44插件自动处理的逻辑
  optimizeDeps: {
    disable: true // 关闭预构建，直接跳过卡住的阶段
  },
  server: {
    proxy: {
      '/func': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/orders': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/globalcart/ws': {
        target: wsBackendUrl,
        secure: false,
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET') return;
            console.warn('[vite ws proxy]', err.code || err.message);
          });
        },
      },
      '/globalcart': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/oauth2': {
        target: backendUrl + '/globalcart',
        changeOrigin: true,
      },
      '/login': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/uploads': {
        target: backendUrl,
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [react()]
  }
})