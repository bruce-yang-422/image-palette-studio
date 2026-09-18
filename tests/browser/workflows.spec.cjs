const { test, expect } = require('@playwright/test');

const choose = (page, name, value) => page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
async function upload(page) {
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width=200; c.height=120;
    const ctx = c.getContext('2d');
    ['#000000','#ffffff','#888888','#cc3322','#2255cc'].forEach((color,i) => { ctx.fillStyle=color; ctx.fillRect(i*40,0,40,120); });
    return c.toDataURL().split(',')[1];
  });
  await page.locator('#upload-input').setInputFiles({ name:'roles.png', mimeType:'image/png', buffer:Buffer.from(png,'base64') });
  await expect(page.locator('.sample-pin')).toHaveCount(await page.evaluate(()=>AppState.options.swatchCount));
}

test('light/dark/system themes persist and react to OS changes without changing the palette', async ({ page }) => {
  await page.emulateMedia({ colorScheme:'dark' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(245, 246, 251)');
  const palette = await page.evaluate(()=>AppState.palette);
  await choose(page, 'theme-pref', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(36, 41, 53)');
  expect(await page.evaluate(()=>AppState.palette)).toEqual(palette);
  await page.reload();
  await expect(page.locator('input[name="theme-pref"][value="dark"]')).toBeChecked();
  await page.emulateMedia({ colorScheme:'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await choose(page, 'theme-pref', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.emulateMedia({ colorScheme:'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();
  await expect(page.locator('input[name="theme-pref"][value="system"]')).toBeChecked();
  await page.emulateMedia({ colorScheme:'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('theme still works when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(()=>{ Storage.prototype.getItem=()=>{throw new Error('blocked');}; Storage.prototype.setItem=()=>{throw new Error('blocked');}; });
  await page.goto('./');
  await choose(page, 'theme-pref', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('.swatch-item')).toHaveCount(5);
});

test('both modes retain their work; startup and Space generate; count and ratio work', async ({ page }) => {
  await page.goto('./');
  expect(await page.evaluate(()=>AppState.options.genSource)).toBe('scratch');
  expect(await page.evaluate(()=>AppState.options.genAlgo)).toBe('harmony');
  await expect(page.locator('.swatch-item')).toHaveCount(5);
  await page.locator('.swatch-btn-lock').first().click();
  const locked = await page.evaluate(()=>AppState.palette[0]);
  const before = await page.evaluate(()=>AppState.palette);
  await page.locator('#main-canvas').click();
  await page.keyboard.press('Space');
  expect(await page.evaluate(()=>AppState.palette[0])).toBe(locked);
  expect(await page.evaluate(()=>AppState.palette)).not.toEqual(before);
  await choose(page,'swatch-count','8');
  await choose(page,'aspect-ratio','1:1');
  expect(await page.evaluate(()=>[document.getElementById('main-canvas').width,document.getElementById('main-canvas').height])).toEqual([1200,1200]);
  const scratch = await page.evaluate(()=>({palette:AppState.palette,locked:AppState.locked}));
  await choose(page,'gen-source','image');
  await expect(page.locator('.swatch-btn-lock')).toHaveCount(0);
  await upload(page); // inherits 8 slots when first entering the image workflow
  const photo = await page.evaluate(()=>({palette:AppState.palette,pins:AppState.pins}));
  await choose(page,'gen-source','scratch');
  expect(await page.evaluate(()=>({palette:AppState.palette,locked:AppState.locked}))).toEqual(scratch);
  await choose(page,'gen-source','image');
  expect(await page.evaluate(()=>({palette:AppState.palette,pins:AppState.pins}))).toEqual(photo);
});

test('pins update a matching slot live, preserve coordinates on resizing, and respect locks', async ({ page }) => {
  await page.goto('./');
  await upload(page);
  await page.locator('#source-canvas').scrollIntoViewIfNeeded();
  const rect = await page.locator('#source-canvas').boundingBox();
  const pin = await page.locator('.sample-pin').first().boundingBox();
  await page.mouse.move(pin.x+pin.width/2,pin.y+pin.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.75,{steps:4});
  await expect(page.locator('#sample-loupe')).toBeVisible();
  expect(await page.evaluate(()=>AppState.palette[0])).toBe('#cc3322');
  await expect(page.locator('.swatch-hex').first()).toHaveText('#CC3322');
  await page.mouse.up();
  await expect(page.locator('#sample-loupe')).toBeHidden();
  const points = await page.evaluate(()=>AppState.pins);
  await choose(page,'swatch-count','8');
  await expect(page.locator('.sample-pin')).toHaveCount(8);
  expect(await page.evaluate(()=>AppState.pins.slice(0,5))).toEqual(points);
  await choose(page,'swatch-count','3');
  await expect(page.locator('.sample-pin')).toHaveCount(3);
  expect(await page.evaluate(()=>AppState.pins)).toEqual(points.slice(0,3));
  await page.locator('.swatch-btn-lock').first().click();
  const first = await page.evaluate(()=>AppState.pins[0]);
  await page.locator('.sample-pin').first().focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(()=>AppState.pins[0])).toEqual(first);
  await page.locator('.swatch-btn-lock').first().click();
  await page.locator('.sample-pin').first().focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(()=>AppState.pins[0].x)).toBeCloseTo(first.x+1/200);
  await page.locator('#sample-size').selectOption('5');
  expect(await page.evaluate(()=>AppState.palette[0])).toBe('#cc3322');
  await page.locator('#panel-center').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:'test-results/desktop-light.png',animations:'disabled'});
  await choose(page, 'theme-pref', 'dark');
  await page.screenshot({path:'test-results/desktop-dark.png',animations:'disabled'});
});

test('screen picker targets the selected slot and a missing API provides an image fallback', async ({ page }) => {
  await page.addInitScript(()=>{ window.EyeDropper=class { async open(){return {sRGBHex:'#12ab34'};} }; });
  await page.goto('./'); await upload(page);
  await page.locator('.swatch-select').nth(2).click();
  const first = await page.evaluate(()=>AppState.palette[0]);
  await page.locator('#btn-screen-picker').click();
  expect(await page.evaluate(()=>AppState.palette[2])).toBe('#12ab34');
  expect(await page.evaluate(()=>AppState.palette[0])).toBe(first);
  expect(await page.evaluate(()=>AppState.pins[2].external)).toBe(true);
  expect(await page.evaluate(()=>[ImagePins.sample({x:0,y:0}),ImagePins.sample({x:1,y:1}),ImagePins.sample({x:.2025,y:.5})])).toEqual(['#000000','#2255cc','#aaaaaa']);
  await page.evaluate(()=>{ window.EyeDropper=class { async open(){throw new DOMException('cancel','AbortError');} }; });
  await page.locator('#btn-screen-picker').click();
  expect(await page.evaluate(()=>AppState.palette[2])).toBe('#12ab34');
  await page.locator('#source-canvas').click({position:{x:10,y:10}});
  expect(await page.evaluate(()=>AppState.palette[2])).toBe('#000000');
  expect(await page.evaluate(()=>AppState.pins[2].external)).toBe(false);
  await page.addInitScript(()=>{ delete window.EyeDropper; });
  await page.reload(); await upload(page);
  await expect(page.locator('#btn-screen-picker')).toBeDisabled();
  await expect(page.locator('#screen-picker-hint')).toContainText('可直接點擊原圖');
});

test('mobile floating generation and touch pin dragging work', async ({ page, context }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await expect(page.locator('#btn-mobile-regenerate')).toBeVisible();
  await page.locator('.swatch-btn-lock').first().click();
  const color = await page.evaluate(()=>AppState.palette[0]);
  await page.locator('#btn-mobile-regenerate').click();
  expect(await page.evaluate(()=>AppState.palette[0])).toBe(color);
  await upload(page);
  await expect(page.locator('#btn-mobile-regenerate')).toBeHidden();
  await page.locator('#source-canvas').scrollIntoViewIfNeeded();
  await page.locator('.sample-pin').first().hover();
  const pin = await page.locator('.sample-pin').first().boundingBox();
  const rect = await page.locator('#source-canvas').boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pin.x+16,y:pin.y+16}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*.9,y:rect.y+rect.height*.65}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.screenshot({path:'test-results/mobile-light.png',fullPage:true});
  expect(await page.evaluate(()=>AppState.palette[0])).toBe('#2255cc');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
