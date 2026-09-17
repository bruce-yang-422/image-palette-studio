/**
 * color-math.js
 * 色彩數學工具：距離、Clamp、安全邊界、色彩命名
 * 依賴：color-convert.js
 */

'use strict';

const ColorMath = (() => {

  // ─────────────────────────────────────────────
  // 色彩距離
  // ─────────────────────────────────────────────

  /** sRGB → CIELAB (D65 reference white), used for perceptual CIE76 distance. */
  function lab(hex) {
    const rgb = ColorConvert.hexToRgb(hex);
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
      const c = v / 255;
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    });
    const f = t => t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
    const x = f((.4124564*r + .3575761*g + .1804375*b) / .95047);
    const y = f(.2126729*r + .7151522*g + .0721750*b);
    const z = f((.0193339*r + .1191920*g + .9503041*b) / 1.08883);
    return [116*y-16, 500*(x-y), 200*(y-z)];
  }

  /** CIE76 ΔE in Lab, not RGB channel distance. */
  function deltaE76(hex1, hex2) {
    const a = lab(hex1), b = lab(hex2);
    return Math.hypot(...a.map((v, i) => v - b[i]));
  }

  /**
   * 歐幾里得 RGB 距離（平方，用於 K-means 效能優化）
   */
  function rgbDistanceSq(a, b) {
    return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  }

  /**
   * 判斷色票陣列中是否有過於相似的顏色
   * @param {string[]} hexList
   * @param {number} threshold ΔE 閾值（預設 30）
   */
  function hasTooSimilar(hexList, threshold = 30) {
    for (let i = 0; i < hexList.length; i++) {
      for (let j = i + 1; j < hexList.length; j++) {
        if (deltaE76(hexList[i], hexList[j]) < threshold) return true;
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────
  // HSL Clamp — 風格投影核心
  // ─────────────────────────────────────────────

  /**
   * 將 HSL 強制 Clamp 至指定區間
   * @param {{ h:number, s:number, l:number }} hsl
   * @param {{ hMin?:number, hMax?:number, sMin?:number, sMax?:number, lMin?:number, lMax?:number }} constraints
   * @returns {{ h:number, s:number, l:number }}
   */
  function clampHsl(hsl, constraints) {
    const {
      hMin = 0,   hMax = 360,
      sMin = 0,   sMax = 100,
      lMin = 0,   lMax = 100,
      hShift = 0  // 色相偏移量（用於跨 0° 邊界的色相環區間）
    } = constraints;

    let { h, s, l } = hsl;

    // 色相 Clamp（支援環繞）
    if (hMin !== 0 || hMax !== 360) {
      // 若有 hShift，先偏移再 clamp
      h = (h + hShift) % 360;
      h = Math.max(hMin, Math.min(hMax, h));
    }

    s = Math.max(sMin, Math.min(sMax, s));
    l = Math.max(lMin, Math.min(lMax, l));

    return { h, s, l };
  }

  /**
   * HEX → 套用風格約束 → 回傳 HEX
   * @param {string} hex
   * @param {object} constraints
   * @returns {string}
   */
  function projectToStyle(hex, constraints) {
    const hsl = ColorConvert.hexToHsl(hex);
    const clamped = clampHsl(hsl, constraints);
    return ColorConvert.hslToHex(clamped.h, clamped.s, clamped.l);
  }

  // ─────────────────────────────────────────────
  // 安全亮度邊界保護
  // ─────────────────────────────────────────────

  /**
   * 確保色彩不要太暗或太亮（避免 Chaos 生成純黑/白）
   * @param {string} hex
   * @param {{ lMin?:number, lMax?:number }} opts
   */
  function safeLightness(hex, { lMin = 15, lMax = 92 } = {}) {
    const hsl = ColorConvert.hexToHsl(hex);
    if (hsl.l >= lMin && hsl.l <= lMax) return hex;
    hsl.l = Math.max(lMin, Math.min(lMax, hsl.l));
    return ColorConvert.hslToHex(hsl.h, hsl.s, hsl.l);
  }

  // ─────────────────────────────────────────────
  // 隨機色彩生成（Chaos Mode）
  // ─────────────────────────────────────────────

  /**
   * 隨機生成符合安全亮度邊界的 HEX
   */
  function randomSafeHex() {
    const h = Math.random() * 360;
    const s = 30 + Math.random() * 60;   // 30~90%
    const l = 25 + Math.random() * 55;   // 25~80%
    return ColorConvert.hslToHex(h, s, l);
  }

  /**
   * 生成 n 個差異足夠大的隨機色彩
   * @param {number} count
   * @param {number} minDelta 最小 ΔE（預設 35）
   * @returns {string[]}
   */
  function randomPalette(count, minDelta = 35) {
    const palette = [];
    let attempts = 0;
    while (palette.length < count && attempts < 2000) {
      attempts++;
      const candidate = randomSafeHex();
      const tooClose = palette.some(c => deltaE76(c, candidate) < minDelta);
      if (!tooClose) palette.push(candidate);
    }
    // 若迭代超過限制，直接填滿
    while (palette.length < count) palette.push(randomSafeHex());
    return palette;
  }

  // ─────────────────────────────────────────────
  // 色彩插值（漸層用）
  // ─────────────────────────────────────────────

  /**
   * 在兩個 HEX 顏色之間線性插值
   * @param {string} hex1
   * @param {string} hex2
   * @param {number} t 0-1
   * @returns {string}
   */
  function lerpHex(hex1, hex2, t) {
    const a = ColorConvert.hexToRgb(hex1);
    const b = ColorConvert.hexToRgb(hex2);
    return ColorConvert.rgbToHex(
      Math.round(a.r + (b.r - a.r) * t),
      Math.round(a.g + (b.g - a.g) * t),
      Math.round(a.b + (b.b - a.b) * t)
    );
  }

  // ─────────────────────────────────────────────
  // 色彩命名（語義近似）
  // ─────────────────────────────────────────────

  const COLOR_NAMES = [
    { name: '暖紅',      h: [340,10],  s: [50,100], l: [35,65] },
    { name: '橙紅',      h: [10,30],   s: [60,100], l: [40,70] },
    { name: '橙黃',      h: [30,55],   s: [60,100], l: [45,75] },
    { name: '金黃',      h: [45,60],   s: [70,100], l: [50,80] },
    { name: '黃綠',      h: [60,90],   s: [40,90],  l: [35,70] },
    { name: '草綠',      h: [90,140],  s: [35,80],  l: [30,65] },
    { name: '翠綠',      h: [140,165], s: [40,85],  l: [30,60] },
    { name: '薄荷綠',    h: [140,175], s: [30,70],  l: [60,90] },
    { name: '青',        h: [165,200], s: [40,85],  l: [35,65] },
    { name: '天藍',      h: [195,225], s: [40,85],  l: [45,75] },
    { name: '深藍',      h: [210,250], s: [40,90],  l: [20,50] },
    { name: '靛紫',      h: [245,280], s: [35,80],  l: [25,55] },
    { name: '紫羅蘭',    h: [270,300], s: [35,80],  l: [35,65] },
    { name: '玫瑰粉',    h: [300,340], s: [30,70],  l: [55,85] },
    { name: '灰棕',      h: [20,50],   s: [5,30],   l: [30,60] },
    { name: '莫蘭迪灰',  h: [0,360],   s: [5,20],   l: [50,75] },
    { name: '深棕',      h: [15,40],   s: [30,65],  l: [15,35] },
    { name: '奶白',      h: [40,70],   s: [10,35],  l: [85,98] },
    { name: '炭黑',      h: [0,360],   s: [0,25],   l: [5,20]  },
  ];

  /**
   * 根據 HSL 值近似匹配語義色彩名稱
   * @param {string} hex
   * @returns {string}
   */
  function approximateName(hex) {
    const { h, s, l } = ColorConvert.hexToHsl(hex);
    for (const entry of COLOR_NAMES) {
      const [hMin, hMax] = entry.h;
      const [sMin, sMax] = entry.s;
      const [lMin, lMax] = entry.l;
      // 色相環繞檢查
      const hMatch = hMin > hMax
        ? (h >= hMin || h <= hMax)
        : (h >= hMin && h <= hMax);
      if (hMatch && s >= sMin && s <= sMax && l >= lMin && l <= lMax) {
        return entry.name;
      }
    }
    if (l < 15) return '近黑';
    if (l > 90) return '近白';
    return `色相 ${Math.round(h)}°`;
  }

  // ─────────────────────────────────────────────
  // K-means 色彩量化（輔助 extraction.js）
  // ─────────────────────────────────────────────

  /**
   * K-means 聚類，回傳 k 個中心 RGB
   * @param {{ r:number, g:number, b:number }[]} pixels
   * @param {number} k
   * @param {number} iterations
   * @returns {{ r:number, g:number, b:number }[]}
   */
  function kMeans(pixels, k, iterations = 12) {
    if (pixels.length === 0) return [];
    // 初始化：KMeans++ 選取種子
    const centers = [pixels[Math.floor(Math.random() * pixels.length)]];
    while (centers.length < k) {
      // 計算每個像素到最近中心的距離
      const dists = pixels.map(p => {
        const minD = Math.min(...centers.map(c => rgbDistanceSq(p, c)));
        return minD;
      });
      const total = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < pixels.length; i++) {
        r -= dists[i];
        if (r <= 0) { centers.push(pixels[i]); break; }
      }
      if (centers.length < k) centers.push(pixels[Math.floor(Math.random() * pixels.length)]);
    }

    let assignments = new Array(pixels.length).fill(0);

    for (let iter = 0; iter < iterations; iter++) {
      // 分配步驟
      let changed = false;
      for (let i = 0; i < pixels.length; i++) {
        let best = 0, bestD = Infinity;
        for (let j = 0; j < centers.length; j++) {
          const d = rgbDistanceSq(pixels[i], centers[j]);
          if (d < bestD) { bestD = d; best = j; }
        }
        if (assignments[i] !== best) { assignments[i] = best; changed = true; }
      }
      if (!changed) break;

      // 更新中心
      for (let j = 0; j < k; j++) {
        const cluster = pixels.filter((_, i) => assignments[i] === j);
        if (cluster.length === 0) continue;
        centers[j] = {
          r: Math.round(cluster.reduce((s, p) => s + p.r, 0) / cluster.length),
          g: Math.round(cluster.reduce((s, p) => s + p.g, 0) / cluster.length),
          b: Math.round(cluster.reduce((s, p) => s + p.b, 0) / cluster.length),
        };
      }
    }

    // 依群集大小排序（代表性高的排前面）
    const clustersWithSize = centers.map((c, j) => ({
      center: c,
      size: assignments.filter(a => a === j).length
    }));
    clustersWithSize.sort((a, b) => b.size - a.size);
    return clustersWithSize.map(c => c.center);
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    deltaE76,
    rgbDistanceSq,
    hasTooSimilar,
    clampHsl,
    projectToStyle,
    safeLightness,
    randomSafeHex,
    randomPalette,
    lerpHex,
    approximateName,
    kMeans,
  };

})();

window.ColorMath = ColorMath;
