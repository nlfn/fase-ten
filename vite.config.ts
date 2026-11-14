import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { SAVE_VERSION } from './src/lib/saveVersion.ts'

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
    {
      // version.json tells a running app whether the newest version can still read its saved game
      // (see src/lib/saveVersion.ts). It is left out of the service worker's files on purpose, so it
      // always comes from the server.
      name: 'save-version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ save: SAVE_VERSION }) + '\n' })
      },
    },
    VitePWA({
      // A new version waits until the player taps Update on the welcome screen, so a game in
      // progress is never reloaded underneath them. The app registers itself in src/lib/updates.svelte.ts.
      registerType: 'prompt',
      injectRegister: false,
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
    // Some tests search thousands of hands. They take a few seconds here and longer on the build server.
    testTimeout: 60_000,
  },
})
