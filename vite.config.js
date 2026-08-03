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
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8080'

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