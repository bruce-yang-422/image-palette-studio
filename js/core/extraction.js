'use strict';

const ExtractionEngine = (() => {
  function samplePixels({ data, width, height }, step = 3) {
    const pixels = [];
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue;
        pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2], x: (x + .5) / width, y: (y + .5) / height });
      }
    }
    return pixels;
  }

  // Role candidates are drawn from the photo, including its lightest/darkest pixels.
  function chooseSamples(pixels, count, minDelta = 12) {
    if (!pixels.length) throw new Error('圖片沒有可取樣的不透明像素');
    const centers = ColorMath.kMeans(pixels, Math.min(count * 4, 32, pixels.length));
    const candidates = centers.map(center => {
      return { ...center, weight: 0, sumX: 0, sumY: 0 };
    });
    pixels.forEach(pixel => {
      let best = 0;
      for (let i = 1; i < centers.length; i++) {
        if (ColorMath.rgbDistanceSq(pixel, centers[i]) < ColorMath.rgbDistanceSq(pixel, centers[best])) best = i;
      }
      candidates[best].weight++;
      candidates[best].sumX += pixel.x;
      candidates[best].sumY += pixel.y;
    });
    const decorate = p => {
      const hex = ColorConvert.rgbToHex(p.r, p.g, p.b);
      const { s, l } = ColorConvert.hexToHsl(hex);
      return { ...p, hex, s, l };
    };
    const pool = candidates.filter(c => c.weight).map(center => {
      const score = p => ColorMath.rgbDistanceSq(p, center) +
        .001 * ((p.x-center.sumX/center.weight)**2 + (p.y-center.sumY/center.weight)**2);
      const nearest = pixels.reduce((best,p) => score(p)<score(best) ? p : best);
      return decorate({...nearest, weight:center.weight});
    }).sort((a, b) => b.weight - a.weight);
    // Add extremes even when a small highlight/shadow was merged into a cluster.
    const extremes = pixels.reduce((acc, p) => {
      const value = ColorConvert.relativeLuminance(p.r, p.g, p.b);
      if (value < acc.min) { acc.min = value; acc.shadow = p; }
      if (value > acc.max) { acc.max = value; acc.highlight = p; }
      return acc;
    }, { min: Infinity, max: -Infinity });
    for (const extreme of [extremes.shadow, extremes.highlight]) {
      const hex = ColorConvert.rgbToHex(extreme.r,extreme.g,extreme.b);
      if (!pool.some(p=>p.hex===hex)) pool.push(decorate({...extreme,weight:1}));
    }
    const selected = [];
    const add = (p, role) => {
      if (selected.length < count && !selected.some(c => ColorMath.deltaE76(c.hex, p.hex) < minDelta)) {
        selected.push({ ...p, role });
      }
    };
    add(pool.reduce((a, b) => a.l < b.l ? a : b), 'shadow');
    add(pool.reduce((a, b) => a.l > b.l ? a : b), 'highlight');
    add(pool.reduce((a, b) => a.s > b.s ? a : b), 'vibrant');
    const midtones = pool.filter(p => p.l >= 20 && p.l <= 85);
    if (midtones.length) add(midtones.reduce((a, b) => a.s < b.s ? a : b), 'neutral');
    for (const p of pool) add(p, 'representative');
    // Relax the threshold for low-diversity photos, never invent unrelated colors.
    for (const p of pool) {
      if (selected.length >= count) break;
      if (!selected.some(c => c.hex === p.hex)) selected.push({ ...p, role: 'representative' });
    }
    let index = 0;
    while (selected.length < count) {
      const p = pool[index++ % pool.length];
      const same = pixels.filter(pixel => ColorConvert.rgbToHex(pixel.r, pixel.g, pixel.b) === p.hex);
      const separation = pixel => Math.min(...selected.map(c=>(c.x-pixel.x)**2+(c.y-pixel.y)**2));
      const alternate = same.reduce((best,pixel)=>!best || separation(pixel)>separation(best) ? pixel : best, null);
      selected.push({ ...p, ...(alternate || {}), role: 'repeated' });
    }
    return selected;
  }

  async function extractSamples(source, count = 5) {
    const canvas = document.createElement('canvas');
    const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
    const scale = Math.min(1, 300 / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    let pixels = samplePixels(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!pixels.length) pixels = samplePixels(ctx.getImageData(0, 0, canvas.width, canvas.height), 1);
    return chooseSamples(pixels, count);
  }

  async function extractFromElement(source, count = 5) {
    return (await extractSamples(source, count)).map(p => p.hex);
  }
  function extractFromFile(file, count = 5) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { extractFromElement(img, count).then(resolve, reject).finally(() => URL.revokeObjectURL(url)); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片讀取失敗')); };
      img.src = url;
    });
  }
  async function extractWithProgress(file, count, onProgress) {
    onProgress?.(10);
    const result = await extractFromFile(file, count);
    onProgress?.(100);
    return result;
  }
  return { samplePixels, chooseSamples, extractSamples, extractFromElement, extractFromFile, extractWithProgress };
})();
window.ExtractionEngine = ExtractionEngine;
