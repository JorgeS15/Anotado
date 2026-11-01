import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Anotado',
        short_name: 'Anotado',
        description: 'Notas simples, com cor.',
        lang: 'pt-PT',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f3ea',
        theme_color: '#f2c94c',
        // Lets Android's share menu send text and links to Anotado as a new note.
        share_target: {
          action: '/share',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        shortcuts: [
          { name: 'Nova nota', short_name: 'Nota', url: '/?new=text', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          {
            name: 'Nova checklist',
            short_name: 'Checklist',
            url: '/?new=checklist',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }],
          },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4008', changeOrigin: true },
    },
  },
});
