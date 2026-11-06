import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Stamped into the app so the welcome screen can show which build you are running.
// GitHub Actions provides the run number and commit; local builds just say "local".
const commit = process.env.GITHUB_SHA?.slice(0, 7)
const runNumber = process.env.GITHUB_RUN_NUMBER
const buildLabel = runNumber ? `Build ${runNumber}${commit ? ` (${commit})` : ''}` : 'Local build'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // Relative base so the built app works from any folder or sub-path host.
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Fase Ten',
        short_name: 'Fase Ten',
        description: 'A ten-phase rummy card game to play against the computer.',
        theme_color: '#14532d',
        background_color: '#14532d',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
