/**
 * extraction.js
 * 圖片色彩提取引擎
 * 使用 K-means++ 量化演算法從像素資料提取代表色
 * 依賴：color-convert.js, color-math.js
 */

'use strict';

const ExtractionEngine = (() => {

  // ─────────────────────────────────────────────
  // 像素採樣
  // ─────────────────────────────────────────────

  /**
   * 從 ImageData 中以步進方式採樣像素（跳過透明/接近白/接近黑）
   * @param {ImageData} imageData
   * @param {number} step 採樣步進（像素間隔，越大越快但精度低）
   * @returns {{ r:number, g:number, b:number }[]}
   */
  function samplePixels(imageData, step = 5) {
    const { data, width, height } = imageData;
    const pixels = [];

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // 跳過透明像素
        if (a < 128) continue;

        // 跳過過度飽和（非常接近純黑/純白）的像素
        const brightness = (r + g + b) / 3;
        if (brightness < 20 || brightness > 235) continue;

        pixels.push({ r, g, b });
      }
    }
    return pixels;
  }

  // ─────────────────────────────────────────────
  // 主提取函式
  // ─────────────────────────────────────────────

  /**
   * 從 <img> 或 <canvas> 元素提取 k 個代表色
   * @param {HTMLImageElement|HTMLCanvasElement} source
   * @param {number} k 色票數量
   * @param {object} opts
   * @param {number} opts.step 採樣步進（預設 5）
   * @param {number} opts.kmeanIter K-means 迭代次數（預設 12）
   * @param {number} opts.minDelta 最小色差閾值（預設 22）
   * @returns {Promise<string[]>} HEX 陣列
   */
  async function extractFromElement(source, k = 5, opts = {}) {
    const { step = 5, kmeanIter = 12 } = opts;

    // 在離屏 Canvas 上繪製圖片以讀取像素
    const offscreen = document.createElement('canvas');
    const maxDim = 300; // 降解析度加速
    let { naturalWidth: w, naturalHeight: h } = source.tagName === 'IMG'
      ? source
      : { naturalWidth: source.width, naturalHeight: source.height };

    // 若來源是 canvas
    if (source.tagName === 'CANVAS') {
      w = source.width;
      h = source.height;
    }

    const scale = Math.min(1, maxDim / Math.max(w, h));
    offscreen.width  = Math.round(w * scale);
    offscreen.height = Math.round(h * scale);
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(source, 0, 0, offscreen.width, offscreen.height);

    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    } catch (e) {
      console.error('[ExtractionEngine] CORS 限制，無法讀取像素:', e);
      return fallbackPalette(k);
    }

    const pixels = samplePixels(imageData, step);
    if (pixels.length < k) return fallbackPalette(k);

    // K-means++ 聚類
    const centers = ColorMath.kMeans(pixels, k, kmeanIter);

    // 轉換為 HEX，去重並補足
    const hexList = deduplicateAndFill(centers.map(c =>
      ColorConvert.rgbToHex(c.r, c.g, c.b)
    ), k);

    return hexList;
  }

  /**
   * 從 File 物件提取色彩
   * @param {File} file
   * @param {number} k
   * @returns {Promise<string[]>}
   */
  function extractFromFile(file, k = 5) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          extractFromElement(img, k)
            .then(resolve)
            .catch(reject);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ─────────────────────────────────────────────
  // 後處理：去重 & 補足
  // ─────────────────────────────────────────────

  /**
   * 去除過於相似的顏色，並補足至 k 個
   * @param {string[]} hexList
   * @param {number} k
   * @param {number} minDelta 最小 ΔE
   * @returns {string[]}
   */
  function deduplicateAndFill(hexList, k, minDelta = 18) {
    const result = [hexList[0]];
    for (let i = 1; i < hexList.length; i++) {
      const tooClose = result.some(c => ColorMath.deltaE76(c, hexList[i]) < minDelta);
      if (!tooClose) result.push(hexList[i]);
      if (result.length >= k) break;
    }
    // 補足
    while (result.length < k) {
      result.push(ColorMath.randomSafeHex());
    }
    return result.slice(0, k);
  }

  // ─────────────────────────────────────────────
  // 後備色票（CORS 或無像素時）
  // ─────────────────────────────────────────────

  function fallbackPalette(k) {
    console.warn('[ExtractionEngine] 使用後備隨機色票');
    return ColorMath.randomPalette(k);
  }

  // ─────────────────────────────────────────────
  // 量化進度回呼包裝（Web Worker 未來擴充點）
  // ─────────────────────────────────────────────

  /**
   * 提取色彩並回報進度（目前為同步模擬）
   * @param {File} file
   * @param {number} k
   * @param {function} onProgress (0-100)
   * @returns {Promise<string[]>}
   */
  async function extractWithProgress(file, k, onProgress) {
    onProgress?.(10);
    const result = await extractFromFile(file, k);
    onProgress?.(100);
    return result;
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    extractFromElement,
    extractFromFile,
    extractWithProgress,
    samplePixels,
    deduplicateAndFill,
  };

})();

window.ExtractionEngine = ExtractionEngine;
