import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [
    react() as any,
    VitePWA({
      registerType: 'prompt', // prompt user before updating SW, not auto
      injectRegister: 'auto',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon-180x180.png',
        'pwa-64x64.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
      ],
      manifest: {
        name: '5-a-Side Admin',
        short_name: '5-a-Side',
        description: 'Attendance & payment management for your 5-a-side football league.',
        theme_color: '#0f4c3a',
        background_color: '#f9f9f8',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['sports', 'finance', 'productivity'],
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [],
        shortcuts: [
          {
            name: 'Reconciliation Queue',
            short_name: 'Recon',
            description: 'Review unmatched transactions',
            url: '/#/reconciliation',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Players',
            short_name: 'Players',
            description: 'View and manage players',
            url: '/#/players',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // Cache static assets with cache-first strategy
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}'],
        // Clean up old caches on activation
        cleanupOutdatedCaches: true,
        // Skip waiting so updates activate immediately after user acknowledges
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          // Auth endpoints — never cache (always network)
          {
            urlPattern: /\/api\/auth\//,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'auth-cache',
            },
          },
          // Read-heavy dashboard/summary data — stale-while-revalidate (fast + fresh)
          {
            urlPattern: /\/api\/dashboard\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dashboard-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
            },
          },
          // Player + game data — network-first with cache fallback for offline
          {
            urlPattern: /\/api\/(players|games|payment-matrix|settings)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-data-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours fallback
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Reconciliation queue — network-first, shorter TTL (needs to be fresh)
          {
            urlPattern: /\/api\/reconciliation-queue/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'recon-cache',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 10, // 10 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Bank transactions — network-first
          {
            urlPattern: /\/api\/bank-transactions/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'transactions-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 6, // 6 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Google Fonts (if loaded) — cache-first
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        // Don't cache POST/PATCH/DELETE — mutations must always go to network
      },
      devOptions: {
        // Enable PWA in dev for testing (uses a mock SW)
        enabled: false,
        type: 'module',
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  resolve: {
    alias: {
      // Resolve workspace packages from source so Vite doesn't need a pre-built dist/
      '@fiveaside/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@fiveaside/recon': resolve(__dirname, '../../packages/recon/src/index.ts'),
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5170',
        changeOrigin: true
      }
    }
  }
})
