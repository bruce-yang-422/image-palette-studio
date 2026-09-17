const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4173/image-palette-studio/', browserName: 'chromium' },
  webServer: { command: 'node scripts/serve.mjs dist', url: 'http://127.0.0.1:4173/image-palette-studio/', reuseExistingServer: false },
});
