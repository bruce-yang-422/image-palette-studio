const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const worker = readFileSync(path.join(root, 'sw.js'), 'utf8');

test('all HTML assets and install icons are local, present and precached', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.webmanifest')));
  const urls = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  urls.push(...manifest.icons.map(icon => icon.src));
  for (const url of urls) {
    assert.ok(!url.startsWith('/') && !url.includes('://'), `Non-local asset: ${url}`);
    assert.ok(existsSync(path.join(root, url)), `Missing file: ${url}`);
    assert.ok(worker.includes(`'${url}'`), `Missing precache entry: ${url}`);
  }
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './');
  for (const size of [192, 512]) {
    const png = readFileSync(path.join(root, `icons/icon-${size}.png`));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('service worker cleans only this deployment cache and ignores unrelated requests', async () => {
  const listeners = {};
  const deleted = [];
  const fetched = [];
  const scope = vm.createContext({ URL, Request,
    self: { location: { href: 'https://example.com/image-palette-studio/sw.js' },
      addEventListener: (type, fn) => { listeners[type] = fn; }, clients: { claim: async () => {} } },
    caches: { keys: async () => ['unrelated', 'image-palette-studio:/:old', 'image-palette-studio:/image-palette-studio/:old'],
      delete: async key => { deleted.push(key); },
      open: async () => ({ match: async url => ({ cached: url }) }) },
    fetch: async request => { fetched.push(request.url); },
  });
  vm.runInContext(worker, scope);
  let activation;
  listeners.activate({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['image-palette-studio:/image-palette-studio/:old']);
  for (const url of ['https://another.example/app.js', 'https://example.com/other/app.js',
    'https://example.com/image-palette-studio/private-photo.png']) {
    listeners.fetch({ request: new Request(url), respondWith() { assert.fail(`Intercepted ${url}`); } });
  }
  let response;
  listeners.fetch({ request: new Request('https://example.com/image-palette-studio/js/app.js?v=1'),
    respondWith(promise) { response = promise; } });
  assert.equal((await response).cached, 'https://example.com/image-palette-studio/js/app.js');
  assert.deepEqual(fetched, []);
});
