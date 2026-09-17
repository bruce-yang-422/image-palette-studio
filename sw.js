'use strict';

// The deployment script replaces this version with a hash of all app assets.
const VERSION = '2026-09-18-3';
const SCOPE = new URL('./', self.location.href);
const PREFIX = `image-palette-studio:${SCOPE.pathname}:`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  './', 'index.html', 'css/main.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/utils/color-convert.js', 'js/utils/color-math.js',
  'js/core/styles.js', 'js/core/extraction.js', 'js/core/harmony.js',
  'js/core/canvas-renderer.js', 'js/core/export-engine.js',
  'js/components/upload.js', 'js/components/swatch-list.js',
  'js/components/colorblind-sim.js', 'js/components/gradient-gen.js',
  'js/components/export-ui.js', 'js/components/color-sampler.js',
  'js/app.js', 'js/pwa.js', 'js/theme.js', 'js/components/image-pins.js',
  'js/components/layout-gallery.js', 'js/components/accessibility.js',
].map(path => new URL(path, SCOPE).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
  // Let open sessions finish before activating a new version.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== SCOPE.origin ||
      !url.pathname.startsWith(SCOPE.pathname)) return;

  // Cache only the app shell. Uploaded images and downloads never enter this cache.
  const canonical = new URL(url.pathname, SCOPE.origin).href;
  if (!ASSETS.includes(canonical)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(canonical)) || fetch(event.request);
  })());
});
