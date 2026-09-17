/**
 * export-engine.js
 * 專業格式匯出引擎
 * 支援：PNG / SVG / ASE / ACO / JSON (Design Tokens) / CSS 變數
 * 依賴：color-convert.js
 */

'use strict';

const ExportEngine = (() => {

  // ─────────────────────────────────────────────
  // 工具：觸發瀏覽器下載
  // ─────────────────────────────────────────────

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  function downloadText(text, filename, mimeType = 'text/plain') {
    downloadBlob(new Blob([text], { type: mimeType }), filename);
  }

  function timestamp() {
    return new Date().toISOString().slice(0, 10);
  }

  // ─────────────────────────────────────────────
  // PNG 匯出
  // ─────────────────────────────────────────────

  /**
   * 將 Canvas 匯出為 PNG
   * @param {HTMLCanvasElement} canvas
   * @param {string} [filename]
   */
  function canvasBlob(canvas, type = 'image/png', quality = .95) {
    return new Promise((resolve,reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('圖片編碼失敗，請降低匯出倍率')),type,quality);
    });
  }
  async function exportPng(canvas, filename = `palette-${timestamp()}.png`) {
    downloadBlob(await canvasBlob(canvas),filename);
  }
  const xml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const number = value => Number(value.toFixed(4));
  function buildSvg(palette, opts = {}) {
    const scene = CanvasRenderer.buildScene(opts.image || null,palette,opts);
    let photo = '';
    if(scene.photo) {
      const p=scene.photo,c=scene.crop,d=scene.imageRect,img=scene.image;
      let href=img.src;
      if(!/^data:image\/(png|jpeg|webp);/i.test(href || '')) {
        const snapshot=document.createElement('canvas');
        snapshot.width=img.naturalWidth||img.width;snapshot.height=img.naturalHeight||img.height;
        snapshot.getContext('2d').drawImage(img,0,0);
        href=snapshot.toDataURL('image/png');
      }
      const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
      photo=`<defs><clipPath id="photo-clip"><rect x="${number(p.x)}" y="${number(p.y)}" width="${number(p.w)}" height="${number(p.h)}"/></clipPath></defs>
        <image clip-path="url(#photo-clip)" href="${xml(href)}" x="${number(d.x-c.sx/c.sw*d.w)}" y="${number(d.y-c.sy/c.sh*d.h)}" width="${number(iw/c.sw*d.w)}" height="${number(ih/c.sh*d.h)}" preserveAspectRatio="none"/>`;
    }
    const content=scene.elements.map(el=> {
      if(el.type==='rect') return `<rect x="${number(el.x)}" y="${number(el.y)}" width="${number(el.w)}" height="${number(el.h)}" rx="${number(Math.min(el.radius,el.w/2,el.h/2))}" fill="${xml(el.fill)}"/>`;
      if(el.type==='circle') return `<circle cx="${number(el.x)}" cy="${number(el.y)}" r="${number(el.r)}" fill="${xml(el.fill)}"/>`;
      if(el.type==='line') return `<line x1="${number(el.x1)}" y1="${number(el.y1)}" x2="${number(el.x2)}" y2="${number(el.y2)}" stroke="${el.stroke}" stroke-width="2"${el.dash?' stroke-dasharray="6 5"':''}/>`;
      return `<text x="${number(el.x)}" y="${number(el.y)}" font-family="${xml(el.font)}" font-size="${number(el.size)}" font-weight="500" fill="${xml(el.fill)}" text-anchor="${el.align==='left'?'start':'middle'}" dominant-baseline="central">${xml(el.value)}</text>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">
<title>Image Palette Studio</title><desc>Photo and editable palette composition</desc>
<rect width="100%" height="100%" fill="${scene.background}"/>
${photo}\n${content}\n</svg>`;
  }
  function exportSvg(palette,opts={},filename=`palette-${timestamp()}.svg`) {
    downloadText(buildSvg(palette,opts),filename,'image/svg+xml');
  }

  function buildAseBuffer(palette, names = []) {
    const colors = palette.map((hex, i) => {
      const { r, g, b } = ColorConvert.hexToRgb(hex);
      return {
        name: names[i] || hex.toUpperCase(),
        r: r / 255, g: g / 255, b: b / 255,
      };
    });

    // 計算 buffer 大小
    let size = 12; // header
    const colorBlocks = colors.map(c => {
      const nameUtf16Len = (c.name.length + 1) * 2; // +1 for null terminator
      return { ...c, nameUtf16Len, blockLen: 2 + nameUtf16Len + 4 + 12 + 2 };
    });
    colorBlocks.forEach(b => { size += 2 + 4 + b.blockLen; });

    const buf = new ArrayBuffer(size);
    const view = new DataView(buf);
    let offset = 0;

    const writeUint8  = v => { view.setUint8(offset++, v); };
    const writeUint16 = v => { view.setUint16(offset, v, false); offset += 2; };
    const writeUint32 = v => { view.setUint32(offset, v, false); offset += 4; };
    const writeFloat  = v => { view.setFloat32(offset, v, false); offset += 4; };
    const writeChar   = c => writeUint8(c.charCodeAt(0));

    // Header
    'ASEF'.split('').forEach(writeChar);
    writeUint16(1); writeUint16(0);   // version 1.0
    writeUint32(colors.length);       // block count

    // Color blocks
    colorBlocks.forEach(c => {
      writeUint16(0x0001);            // block type: color
      writeUint32(c.blockLen);        // block length

      // Color name (UTF-16 BE with null terminator)
      writeUint16(c.name.length + 1);
      for (let i = 0; i < c.name.length; i++) {
        writeUint16(c.name.charCodeAt(i));
      }
      writeUint16(0x0000);            // null terminator

      // Color model: "RGB "
      'RGB '.split('').forEach(writeChar);

      // RGB float values
      writeFloat(c.r);
      writeFloat(c.g);
      writeFloat(c.b);

      // Color type: 0 = Global
      writeUint16(0);
    });

    return buf;
  }

  function exportAse(palette, names = [], filename = `palette-${timestamp()}.ase`) {
    const buf = buildAseBuffer(palette, names);
    downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), filename);
  }

  // ─────────────────────────────────────────────
  // ACO (Adobe Photoshop Color) 匯出
  // ─────────────────────────────────────────────

  /**
   * 生成 .aco buffer（Version 1 + Version 2）
   * Version 1: colorSpace(2) + 4x uint16 + padding(2)
   * Version 2: same + name length(4) + name UTF-16
   */
  function buildAcoBuffer(palette, names = []) {
    const colors = palette.map((hex, i) => {
      const { r, g, b } = ColorConvert.hexToRgb(hex);
      return { r, g, b, name: names[i] || hex.toUpperCase() };
    });

    const count = colors.length;
    // V1: 4 + count * 10
    // V2: 4 + count * (10 + 4 + (name.length+1)*2)
    let v2Extra = colors.reduce((s, c) => s + 4 + (c.name.length + 1) * 2, 0);
    const buf = new ArrayBuffer(4 + count * 10 + 4 + count * 10 + v2Extra);
    const view = new DataView(buf);
    let offset = 0;

    const w16 = v => { view.setUint16(offset, v, false); offset += 2; };
    const w32 = v => { view.setUint32(offset, v, false); offset += 4; };

    // === Version 1 ===
    w16(1);       // version
    w16(count);   // count
    colors.forEach(c => {
      w16(0);                           // colorSpace: 0 = RGB
      w16(Math.round(c.r / 255 * 65535));
      w16(Math.round(c.g / 255 * 65535));
      w16(Math.round(c.b / 255 * 65535));
      w16(0);                           // padding
    });

    // === Version 2 ===
    w16(2);       // version
    w16(count);   // count
    colors.forEach(c => {
      w16(0);
      w16(Math.round(c.r / 255 * 65535));
      w16(Math.round(c.g / 255 * 65535));
      w16(Math.round(c.b / 255 * 65535));
      w16(0);
      // Name
      w32(c.name.length + 1);
      for (let i = 0; i < c.name.length; i++) w16(c.name.charCodeAt(i));
      w16(0); // null terminator
    });

    return buf;
  }

  function exportAco(palette, names = [], filename = `palette-${timestamp()}.aco`) {
    const buf = buildAcoBuffer(palette, names);
    downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), filename);
  }

  // ─────────────────────────────────────────────
  // JSON Design Tokens 匯出 (W3C Format)
  // ─────────────────────────────────────────────

  function buildDesignTokens(palette,names=[]) {
    const tokens={};
    palette.forEach((hex,i)=>{
      const {r,g,b}=ColorConvert.hexToRgb(hex);
      tokens[`color-${i+1}`]={
        $type:'color',
        $value:{colorSpace:'srgb',components:[r/255,g/255,b/255],alpha:1,hex:hex.toLowerCase()},
        $description:names[i] || `Palette color ${i+1}`,
      };
    });
    return {'image-palette-studio':tokens};
  }

  function exportJson(palette, names = [], filename = `palette-tokens-${timestamp()}.json`) {
    const tokens = buildDesignTokens(palette, names);
    downloadText(JSON.stringify(tokens, null, 2), filename, 'application/json');
  }

  // ─────────────────────────────────────────────
  // CSS 變數匯出
  // ─────────────────────────────────────────────

  function buildCssVariables(palette) {
    return ':root {\n'+palette.map((hex,i)=>`  --color-${i+1}: ${hex.toUpperCase()};`).join('\n')+'\n}';
  }
  function buildTailwind(palette,version='v3') {
    if(version==='v4') return '@theme {\n'+palette.map((hex,i)=>`  --color-palette-${i+1}: ${hex.toUpperCase()};`).join('\n')+'\n}';
    const colors=Object.fromEntries(palette.map((hex,i)=>[`palette-${i+1}`,hex.toUpperCase()]));
    return 'module.exports = '+JSON.stringify({theme:{extend:{colors}}},null,2)+';';
  }
  function buildCode(format,palette,names=[],version='v3') {
    if(format==='css') return buildCssVariables(palette);
    if(format==='json') return JSON.stringify(buildDesignTokens(palette,names),null,2);
    if(format==='tailwind') return buildTailwind(palette,version);
    throw new Error('不支援的程式碼格式');
  }
  async function copyText(text) {
    try {
      if(!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
    } catch {
      const previous=document.activeElement,field=document.createElement('textarea');
      field.value=text;field.style.cssText='position:fixed;left:-9999px';document.body.appendChild(field);field.select();
      let copied=false;
      try { copied=document.execCommand('copy'); } finally { field.remove();previous?.focus({preventScroll:true}); }
      if(!copied) throw new Error('無法存取剪貼簿，請從程式碼預覽手動複製');
    }
  }

  function exportCss(palette, names = [], filename = `palette-${timestamp()}.css`) {
    downloadText(buildCssVariables(palette, names), filename, 'text/css');
  }

  // ─────────────────────────────────────────────
  // 統一匯出入口
  // ─────────────────────────────────────────────

  /**
   * @param {string} format 'png'|'svg'|'ase'|'aco'|'json'|'css'
   * @param {HTMLCanvasElement|null} canvas
   * @param {string[]} palette
   * @param {string[]} names
   * @param {object} opts
   */
  async function exportAs(format,canvas,palette,names=[],opts={}) {
    if(!palette.length) throw new Error('請先生成色票');
    if(format==='png'||format==='jpg') {
      const output=CanvasRenderer.renderExport(opts.image||null,palette,opts);
      try {
        const blob=await canvasBlob(output,format==='jpg'?'image/jpeg':'image/png',.95);
        downloadBlob(blob,`palette-${timestamp()}.${format}`);
      } finally { output.width=1;output.height=1; }
      return;
    }
    switch(format) {
      case 'svg': return exportSvg(palette,opts);
      case 'ase': return exportAse(palette,names);
      case 'aco': return exportAco(palette,names);
      case 'json': return exportJson(palette,names);
      case 'css': return exportCss(palette,names);
      case 'tailwind': return downloadText(buildTailwind(palette,opts.tailwindVersion),`palette-tailwind-${timestamp()}.${opts.tailwindVersion==='v4'?'css':'cjs'}`,'text/plain');
      default: throw new Error('不支援的匯出格式');
    }
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    exportAs,
    exportPng,
    exportSvg,
    exportAse,
    exportAco,
    exportJson,
    exportCss,
    buildSvg,
    buildTailwind,
    buildCode,
    copyText,
    canvasBlob,
    buildDesignTokens,
    buildCssVariables,
    buildAseBuffer,
    buildAcoBuffer,
  };

})();

window.ExportEngine = ExportEngine;
