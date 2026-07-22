import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'EnvAIro | Tu Rockola Social Inteligente',
        short_name: 'EnvAIro',
        description: 'Convientete en anfitrión, comparte tu código QR y permite que tus invitados elijan la música de la fiesta en tiempo real.',
        theme_color: '#9D4EDD',
        background_color: '#0F0F13',
        display: 'standalone',
        icons: [
          {
            src: 'envairo-logo.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'envairo-logo.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'envairo-logo.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
