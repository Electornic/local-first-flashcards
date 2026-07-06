import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// M0: 서비스 워커로 앱 셸을 프리캐시해야 오프라인 새로고침/재방문에서 앱이 뜬다.
// manifest(아이콘 + display:standalone)는 iOS "홈 화면에 추가"(ITP 7일 면제)의 전제.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        // 빌드 산출물(JS/CSS/HTML/아이콘)을 전부 프리캐시 = 앱 셸 오프라인.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Local-First Flashcards',
        short_name: 'Flashcards',
        description: '서버·로그인 없이 브라우저가 원천인 간격반복 암기 앱',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
