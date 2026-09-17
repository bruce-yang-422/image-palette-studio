// Rasterize our vector app icon; only needed when changing icons/icon.svg.
const { chromium } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch();
  try {
    const svg = await readFile(path.join(__dirname, '../icons/icon.svg'), 'utf8');
    const page = await browser.newPage();
    for (const size of [192, 512]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
      await page.screenshot({ path: path.join(__dirname, `../icons/icon-${size}.png`) });
    }
  } finally {
    await browser.close();
  }
})();
