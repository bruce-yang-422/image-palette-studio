const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');

async function upload(page) {
  const url=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=160;c.height=100;
    const ctx=c.getContext('2d');
    ['#111111','#eeeeee','#cc4422','#4488cc'].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i*40,0,40,100);});
    return c.toDataURL();
  });
  await page.locator('#upload-input').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(url.split(',')[1],'base64')});
  await expect(page.locator('.sample-pin')).toHaveCount(5);
}

test('seven languages preserve palette and inputs, persist, and translate dynamic content',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await page.locator('#btn-add-anchor').click();
  await page.locator('.anchor-hex-input').fill('#123456');
  await page.locator('.anchor-hex-input').dispatchEvent('change');
  const before=await page.evaluate(()=>[...AppState.palette]);
  const labels={en:'Generate now',ja:'今すぐ生成',ko:'지금 생성',th:'สร้างตอนนี้',vi:'Tạo ngay',es:'Generar ahora','zh-TW':'立即生成'};
  for(const [lang,label] of Object.entries(labels)) {
    await page.selectOption('#language-select',lang);
    await expect(page.locator('html')).toHaveAttribute('lang',lang);
    await expect(page.locator('#btn-scratch-regen')).toContainText(label);
    await expect(page.locator('.anchor-hex-input')).toHaveValue('#123456');
    expect(await page.evaluate(()=>AppState.palette)).toEqual(before);
  }
  await page.selectOption('#language-select','en');
  expect(await page.evaluate(()=>I18n.t('已載入：自訂$&照片.png'))).toBe('Loaded: 自訂$&照片.png');
  await page.locator('#btn-scratch-regen').click();
  await expect(page.locator('.swatch-btn-lock').last()).toHaveAttribute('aria-label','Lock this swatch');
  const leftovers=await page.evaluate(()=>{
    const result=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode()) if(!n.parentElement.closest('script,style,code,pre,[translate="no"]') && /[\u4e00-\u9fff]/.test(n.textContent)) result.push(n.textContent.trim());
    return result;
  });
  expect(leftovers).toEqual([]);
  await page.reload();await expect(page.locator('#language-select')).toHaveValue('en');
  expect(errors).toEqual([]);
});

test('language selection works with blocked storage and synchronizes across tabs',async({page,context})=>{
  await page.goto('./');
  const other=await context.newPage();await other.goto('./');
  await page.selectOption('#language-select','es');
  await expect(other.locator('#language-select')).toHaveValue('es');
  await other.close();
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('blocked');};});
  await page.selectOption('#language-select','vi');
  await expect(page.locator('#btn-scratch-regen')).toContainText('Tạo ngay');
});

test('60-30-10 layout keeps fixed colors and returns to the original base when disabled',async({page})=>{
  await page.goto('./');
  await page.locator('.swatch-btn-lock').first().click();
  const original=await page.evaluate(()=>[...AppState.palette]);
  await page.locator('#role-distribution').check();
  const state=await page.evaluate(()=>({palette:AppState.palette,scene:document.getElementById('main-canvas').paletteScene}));
  expect(state.palette[0]).toBe(original[0]);
  const swatches=state.scene.elements.filter(e=>e.swatch!==undefined);
  const total=swatches.reduce((sum,e)=>sum+e.w,0);
  expect(swatches[0].w/total).toBeCloseTo(.6,8);expect(swatches.at(-1).w/total).toBeCloseTo(.1,8);
  await page.locator('#role-distribution').uncheck();
  expect(await page.evaluate(()=>AppState.palette)).toEqual(original);
});

test('edge snapping finds nearby edges, ignores flat regions, and keeps keyboard precision',async({page})=>{
  await page.goto('./');await upload(page);
  await page.locator('#snap-edges').check();
  const points=await page.evaluate(()=>({edge:ImagePins.snapPoint({x:37/160,y:.5}),flat:ImagePins.snapPoint({x:15/160,y:.5})}));
  expect(points.edge.x*160).toBeGreaterThanOrEqual(39);expect(points.edge.x*160).toBeLessThanOrEqual(41);
  expect(points.flat).toEqual({x:15/160,y:.5});
  await page.locator('.sample-pin').first().focus();
  await page.keyboard.press('ArrowRight');
  const first=await page.evaluate(()=>AppState.pins[0].x);
  await page.keyboard.press('ArrowLeft');
  expect(first-(await page.evaluate(()=>AppState.pins[0].x))).toBeCloseTo(1/160,5);
  await page.locator('#snap-edges').uncheck();
  expect(await page.evaluate(()=>ImagePins.snapPoint({x:37/160,y:.5}))).toEqual({x:37/160,y:.5});
});

test('all layouts support every count and editable SVG keeps photo, crop, labels and escaping',async({page})=>{
  await page.goto('./');await upload(page);
  const results=await page.evaluate(()=>{
    const results=[];
    for(const count of [3,4,5,6,8]) for(const layout of Object.keys(CanvasRenderer.LAYOUTS)) {
      const colors=Array.from({length:count},(_,i)=>AppState.palette[i%5]);
      for(const ratio of ['original','1:1','9:16']) {
        const scene=CanvasRenderer.buildScene(AppState.image,colors,{...AppState.options,swatchLayout:layout,aspectRatio:ratio});
        results.push({count,actual:scene.elements.filter(e=>e.swatch!==undefined).length,finite:scene.elements.every(e=>Object.values(e).every(v=>typeof v!=='number'||Number.isFinite(v))),ratio:ratio==='1:1'?scene.width/scene.height:null});
      }
    }
    return results;
  });
  for(const result of results){expect(result.actual).toBe(result.count);expect(result.finite).toBe(true);if(result.ratio!==null)expect(result.ratio).toBe(1);}
  await page.locator('.layout-chip').filter({has:page.locator('input[value="callout"]')}).click();
  await page.locator('#callout-labels input').first().fill('Keep <this> & "that"');
  const svg=await page.evaluate(()=>ExportEngine.buildSvg(AppState.palette,{...AppState.options,image:AppState.image,
    aspectRatio:'9:16',cropOffset:{x:1,y:0},pins:AppState.pins.map((p,i)=>({...p,x:0,external:i===1}))}));
  expect(svg).toContain('Keep &lt;this&gt; &amp; &quot;that&quot;');
  expect(svg).toContain('data:image/png');expect(svg).toContain('<clipPath');expect(svg).toContain('stroke-dasharray');expect(svg).toContain('外部色');
  expect(await page.evaluate(svg=>new DOMParser().parseFromString(svg,'image/svg+xml').querySelectorAll('parsererror').length,svg)).toBe(0);
  await page.selectOption('#language-select','es');
  await expect(page.locator('#callout-labels input').first()).toHaveValue('Keep <this> & "that"');
  await page.selectOption('#language-select','en');
  expect(await page.evaluate(()=>{
    const result=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode()) if(!n.parentElement.closest('script,style,pre,code,[translate="no"],.toast')&&/[\u4e00-\u9fff]/.test(n.textContent))result.push(n.textContent.trim());
    return result;
  })).toEqual([]);
});

test('raster scales and all eight downloads have valid contents, including Tailwind versions',async({page})=>{
  await page.goto('./');await upload(page);
  const sizes=await page.evaluate(async()=>{
    const result=[];
    for(const scale of [1,2,4]) {
      const canvas=CanvasRenderer.renderExport(AppState.image,AppState.palette,{...AppState.options,aspectRatio:'1:1',exportScale:scale});
      const blob=await ExportEngine.canvasBlob(canvas,'image/jpeg');
      const image=await createImageBitmap(blob);result.push({w:image.width,h:image.height,type:blob.type});image.close();canvas.width=1;canvas.height=1;
    }
    return result;
  });
  expect(sizes).toEqual([1,2,4].map(scale=>({w:1200*scale,h:1200*scale,type:'image/jpeg'})));
  expect(await page.evaluate(()=>{
    try{CanvasRenderer.renderExport({width:1,height:100},AppState.palette,{exportScale:4});return false;}catch{return true;}
  })).toBe(true);
  await page.selectOption('#export-scale','1');
  for(const format of ['png','jpg','svg','ase','aco','json','css','tailwind']) {
    const pending=page.waitForEvent('download');await page.locator(`#btn-export-${format}`).click();
    const download=await pending,bytes=await fs.readFile(await download.path());
    expect(bytes.length).toBeGreaterThan(20);
    if(format==='png') expect(bytes.subarray(1,4).toString()).toBe('PNG');
    if(format==='jpg') expect([...bytes.subarray(0,3)]).toEqual([255,216,255]);
    if(format==='svg') expect(bytes.toString()).toContain('<image');
    if(format==='ase') {expect(bytes.subarray(0,4).toString()).toBe('ASEF');expect(bytes.readUInt32BE(8)).toBe(5);}
    if(format==='aco') {expect(bytes.readUInt16BE(0)).toBe(1);expect(bytes.readUInt16BE(2)).toBe(5);}
    if(format==='json') expect(Object.keys(JSON.parse(bytes.toString())['image-palette-studio'])).toHaveLength(5);
    if(format==='css') expect(bytes.toString()).toContain('--color-5');
    if(format==='tailwind') expect(bytes.toString()).toContain('module.exports');
  }
  await page.selectOption('#tailwind-version','v4');
  const pending=page.waitForEvent('download');await page.locator('#btn-export-tailwind').click();
  expect((await fs.readFile(await (await pending).path())).toString()).toContain('@theme');
});

test('phone viewport supports long translations and generation',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('./');
  for(const locale of ['en','ja','ko','th','vi','es']) {
    await page.selectOption('#language-select',locale);
    await page.locator('#btn-mobile-regenerate').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('#language-select').evaluate(element=>{
      const r=element.getBoundingClientRect(),header=document.getElementById('app-header').getBoundingClientRect();
      return r.top>=header.top && r.bottom<=header.bottom;
    })).toBe(true);
  }
});

test('offline language resources and phone viewport work',async({page,context,browserName})=>{
  test.skip(browserName==='webkit' && process.platform==='win32',
    'Windows WebKit returns an internal navigation error on offline reload even after SW controller activation; requires Safari/device verification.');
  await page.setViewportSize({width:390,height:844});await page.goto('./');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect(page.locator('#offline-status')).toHaveText('可離線使用');
  await page.evaluate(async()=>{
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  await page.selectOption('#language-select','th');
  await context.setOffline(true);await page.reload();
  await expect(page.locator('#language-select')).toHaveValue('th');
  await page.selectOption('#language-select','es');
  await page.locator('#btn-mobile-regenerate').click();
  expect(await page.evaluate(()=>AppState.palette.length)).toBe(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await context.setOffline(false);
});
