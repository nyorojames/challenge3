import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// The offline "basic mode" runs the SERVER's rules parser in the browser.
// One copy of the code, used in both places (see src/lib/offlineParse.js).
const serverAi = fileURLToPath(new URL('../server/src/providers/ai', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// The browser only ever calls /api/...; Vite forwards it to Express.
// Same origin = no CORS, and the client never hard-codes the server URL.
const apiProxy = { '/api': 'http://localhost:4000' };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Makes the app installable and caches the app shell. Offline data
    // (the outbox) is added in Phase 5.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Duka Ledger',
        short_name: 'Duka',
        description: 'AI bookkeeper for Kenyan dukas',
        theme_color: '#047857',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/], // API calls must never get index.html
      },
    }),
  ],
  resolve: { alias: { '@server-ai': serverAi } },
  server: { port: 5173, proxy: apiProxy, fs: { allow: [repoRoot] } }, // allow importing ../server files
  preview: { port: 4173, proxy: apiProxy },
});
