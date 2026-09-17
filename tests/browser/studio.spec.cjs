const { test, expect } = require('@playwright/test');

async function choose(page, name, value) {
  await page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
}

async function imageFile(page) {
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ['#aa3322', '#339966', '#335599', '#bb9933', '#995599'].forEach((c, i) => {
      ctx.fillStyle = c; ctx.fillRect(i * 20, 0, 20, 100);
    });
    return Array.from(Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), c => c.charCodeAt(0)));
  });
  return { name: 'test-palette.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

test('all generation entry points retain locked colors; anchors accept RGB and HSL', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await choose(page, 'gen-source', 'scratch');
  await choose(page, 'swatch-count', '8');
  // Pin the locked slot to a color compatible with every style exercised below —
  // styles now disable themselves against a locked/anchor color they clash with.
  const locked = '#a8a29b';
  await page.evaluate((hex) => { AppState.palette[7] = hex; AppState.basePalette[7] = hex; updateAllUI(); }, locked);
  await page.locator('.swatch-btn-lock').nth(7).click();
  for (const action of [
    () => page.locator('#btn-scratch-regen').click(),
    () => page.locator('#btn-regenerate').click(),
    () => choose(page, 'gen-algo', 'harmony'),
    () => page.locator('#harmony-type').selectOption('complementary'),
    () => page.locator('#harmony-type').selectOption('split-complementary'),
    () => choose(page, 'style-preset', 'morandi'),
  ]) {
    await action();
    expect(await page.evaluate(() => AppState.palette.length)).toBe(8);
    expect(await page.evaluate(() => AppState.palette[7])).toBe(locked);
    expect(await page.evaluate(() => AppState.locked[7])).toBe(true);
  }
  await page.locator('#btn-add-anchor').click();
  const input = page.locator('.anchor-hex-input').first();
  await input.fill('rgb(255, 0, 0)');
  await input.press('Tab');
  expect(await page.evaluate(() => AppState.palette[0])).toBe('#ff0000');
  await input.fill('hsl(120, 100%, 50%)');
  await input.press('Tab');
  expect(await page.evaluate(() => AppState.palette[0])).toBe('#00ff00');
  await page.locator('#harmony-type').selectOption('monochromatic');
  expect(await page.evaluate(() => AppState.palette[7])).toBe(locked);
  // Browser shortcuts must not cause another generation.
  const before = await page.evaluate(() => [...AppState.palette]);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  expect(await page.evaluate(() => AppState.palette)).toEqual(before);
  expect(errors).toEqual([]);
});

test('upload, paste, drop, source restoration and PNG export work in a repository subpath', async ({ page }) => {
  await page.goto('./');
  const file = await imageFile(page);
  await page.locator('#upload-input').setInputFiles(file);
  await expect(page.locator('.swatch-btn-lock')).toHaveCount(5);
  const raw = await page.evaluate(() => [...AppState.palette]);
  // Image mode never applies a style preset — the panel stays hidden and colors stay photo-derived.
  await expect(page.locator('#section-style')).toBeHidden();
  expect(await page.evaluate(() => AppState.palette)).toEqual(raw);
  const download = page.waitForEvent('download');
  await page.locator('#btn-export-png').click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);

  await choose(page, 'gen-source', 'scratch');
  await page.evaluate(({ bytes }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'pasted.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { bytes: [...file.buffer] });
  await expect(page.locator('#upload-thumbnail')).toBeVisible();
  expect(await page.evaluate(() => AppState.options.genSource)).toBe('image');
  await page.locator('#btn-remove-image').click();
  const loadedBefore = await page.locator('.toast').filter({ hasText: '已載入：dropped.png' }).count();
  await page.evaluate(({ bytes }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' }));
    document.getElementById('upload-dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { bytes: [...file.buffer] });
  await expect(page.locator('#upload-thumbnail')).toBeVisible();
  await expect(page.locator('.toast').filter({ hasText: '已載入：dropped.png' })).toHaveCount(loadedBefore + 1);
});

test('PWA caches every app asset and runs generation, upload and export offline', async ({ page, context }) => {
  const failures = [];
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect(page.locator('#offline-status')).toHaveText('可離線使用');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe('http://127.0.0.1:4173/image-palette-studio/');
  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  expect(manifest.start_url).toBe('./');
  expect(failures).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#offline-status')).toHaveText('離線模式');
  await choose(page, 'gen-source', 'scratch');
  await expect(page.locator('.swatch-btn-lock')).toHaveCount(5);
  await page.locator('#upload-input').setInputFiles(await imageFile(page));
  await expect(page.locator('#upload-thumbnail')).toBeVisible();
  for (const format of ['png', 'svg', 'ase', 'aco', 'json', 'css']) {
    const download = page.waitForEvent('download');
    await page.locator(`#btn-export-${format}`).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  }
  await context.setOffline(false);
});

test('root hosting and mobile generation remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await choose(page, 'gen-source', 'scratch');
  await expect(page.locator('#main-canvas')).toBeVisible();
  await page.locator('#btn-scratch-regen').click();
  expect(await page.evaluate(() => AppState.palette.length)).toBe(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
