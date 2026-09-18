/**
 * color-convert.js
 * 色彩空間轉換工具函式庫
 * HEX ⟷ RGB ⟷ HSL ⟷ Oklch
 */

'use strict';

const ColorConvert = (() => {

  // ─────────────────────────────────────────────
  // HEX ↔ RGB
  // ─────────────────────────────────────────────

  /**
   * HEX 字串轉 RGB 物件
   * @param {string} hex - '#RRGGBB' 或 '#RGB'
   * @returns {{ r:number, g:number, b:number }}
   */
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const n = parseInt(hex, 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8)  & 255,
      b:  n        & 255
    };
  }

  /**
   * RGB 物件轉 HEX 字串
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {string} '#RRGGBB'
   */
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b]
      .map(v => Math.round(Math.max(0, Math.min(255, v)))
        .toString(16).padStart(2, '0'))
      .join('');
  }

  // ─────────────────────────────────────────────
  // RGB ↔ HSL
  // ─────────────────────────────────────────────

  /**
   * RGB → HSL
   * @param {number} r 0-255
   * @param {number} g 0-255
   * @param {number} b 0-255
   * @returns {{ h:number, s:number, l:number }}  h:0-360, s:0-100, l:0-100
   */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / delta) % 6; break;
        case g: h = (b - r) / delta + 2;   break;
        case b: h = (r - g) / delta + 4;   break;
      }
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    return { h, s: +(s * 100).toFixed(2), l: +(l * 100).toFixed(2) };
  }

  /**
   * HSL → RGB
   * @param {number} h 0-360
   * @param {number} s 0-100
   * @param {number} l 0-100
   * @returns {{ r:number, g:number, b:number }} 0-255
   */
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h < 60)  { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  // ─────────────────────────────────────────────
  // HEX ↔ HSL 快捷
  // ─────────────────────────────────────────────

  function hexToHsl(hex) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHsl(r, g, b);
  }

  function hslToHex(h, s, l) {
    const { r, g, b } = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
  }

  /** Parse opaque HEX, rgb() or hsl(); reject malformed / out-of-range input. */
  function parseColor(value) {
    const input = value.trim();
    if (/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(input)) {
      const { r, g, b } = hexToRgb(input);
      return rgbToHex(r, g, b);
    }
    const number = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
    const rgb = input.match(new RegExp(`^rgb\\(\\s*${number}\\s*,\\s*${number}\\s*,\\s*${number}\\s*\\)$`, 'i'));
    if (rgb) {
      const channels = rgb.slice(1).map(Number);
      return channels.every(v => Number.isFinite(v) && v >= 0 && v <= 255)
        ? rgbToHex(...channels) : null;
    }
    const hsl = input.match(new RegExp(`^hsl\\(\\s*${number}(?:deg)?\\s*,\\s*${number}%\\s*,\\s*${number}%\\s*\\)$`, 'i'));
    if (hsl) {
      const [h, s, l] = hsl.slice(1).map(Number);
      if ([h, s, l].every(Number.isFinite) && s >= 0 && s <= 100 && l >= 0 && l <= 100) {
        return hslToHex(((h % 360) + 360) % 360, s, l);
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // RGB ↔ Oklch (近似實作，純前端零依賴)
  // ─────────────────────────────────────────────

  /** sRGB → Linear RGB */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /** Linear RGB → sRGB */
  function linearToSrgb(c) {
    c = Math.max(0, Math.min(1, c));
    return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  }

  /** Linear RGB → OKLab */
  function linearRgbToOklab(r, g, b) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return {
      L:  0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
      a:  1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      b_: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
  }

  /** OKLab → Linear RGB */
  function oklabToLinearRgb(L, a, b_) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b_;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b_;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b_;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    return {
      r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    };
  }

  /**
   * RGB → Oklch
   * @returns {{ L:number, C:number, h:number }}
   *   L: 0-1, C: 0~0.4, h: 0-360
   */
  function rgbToOklch(r, g, b) {
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    const { L, a, b_ } = linearRgbToOklab(lr, lg, lb);
    const C = Math.sqrt(a * a + b_ * b_);
    let h = Math.atan2(b_, a) * (180 / Math.PI);
    if (h < 0) h += 360;
    return { L: +L.toFixed(4), C: +C.toFixed(4), h: +h.toFixed(2) };
  }

  /**
   * Oklch → HEX
   * @param {number} L 0-1
   * @param {number} C 0-0.4
   * @param {number} h 0-360
   * @returns {string} HEX
   */
  function oklchToHex(L, C, h) {
    const { r, g, b } = gamutMapOklch(L, C, h).rgb;
    return rgbToHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b));
  }

  // Reduce chroma at fixed perceptual lightness and hue instead of clipping RGB channels.
  function gamutMapOklch(L, C, h) {
    if (![L, C, h].every(Number.isFinite)) throw new Error('Invalid Oklch color');
    L = Math.max(0, Math.min(1, L)); C = Math.max(0, C); h = ((h % 360) + 360) % 360;
    const rgbAt = chroma => oklabToLinearRgb(L, chroma * Math.cos(h * Math.PI / 180), chroma * Math.sin(h * Math.PI / 180));
    const inside = rgb => Object.values(rgb).every(v => v >= -1e-7 && v <= 1 + 1e-7);
    let rgb = rgbAt(C);
    if (!inside(rgb)) {
      let low = 0, high = C;
      for (let i = 0; i < 28; i++) {
        const mid = (low + high) / 2;
        if (inside(rgbAt(mid))) low = mid; else high = mid;
      }
      C = low; rgb = rgbAt(C);
    }
    return { L, C, h, rgb };
  }

  // ─────────────────────────────────────────────
  // 格式化輸出
  // ─────────────────────────────────────────────

  /**
   * RGB 物件 → CSS rgb() 字串
   */
  function rgbToCss(r, g, b) {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  /**
   * HSL 物件 → CSS hsl() 字串
   */
  function hslToCss(h, s, l) {
    return `hsl(${Math.round(h)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
  }

  /**
   * HEX → 所有格式物件
   */
  function hexToAllFormats(hex) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
    return {
      hex: hex.toUpperCase(),
      rgb,
      hsl,
      oklch,
      cssRgb:   rgbToCss(rgb.r, rgb.g, rgb.b),
      cssHsl:   hslToCss(hsl.h, hsl.s, hsl.l),
      cssOklch: `oklch(${oklch.L.toFixed(3)} ${oklch.C.toFixed(3)} ${oklch.h.toFixed(1)})`,
    };
  }

  // ─────────────────────────────────────────────
  // 相對亮度 (WCAG 2.1)
  // ─────────────────────────────────────────────

  /**
   * 計算相對亮度，用於決定文字顏色黑/白
   * @param {number} r 0-255
   * @param {number} g 0-255
   * @param {number} b 0-255
   * @returns {number} 0-1
   */
  function relativeLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  /**
   * 根據背景色決定前景文字顏色（黑或白）
   * @param {string} hex
   * @returns {'#000000'|'#ffffff'}
   */
  function contrastColor(hex) {
    return contrastRatio(hex,'#000000') >= contrastRatio(hex,'#ffffff') ? '#000000' : '#ffffff';
  }

  function contrastRatio(first,second) {
    const luminance=hex=>{const {r,g,b}=hexToRgb(hex);return relativeLuminance(r,g,b);};
    const a=luminance(first),b=luminance(second);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }
  function contrastReport(background,foreground=contrastColor(background)) {
    const ratio=contrastRatio(background,foreground);
    return {foreground,ratio,grade:ratio>=7?'AAA':ratio>=4.5?'AA':'未達 AA'};
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    hexToRgb,
    rgbToHex,
    rgbToHsl,
    hslToRgb,
    hexToHsl,
    hslToHex,
    parseColor,
    rgbToOklch,
    oklchToHex,
    gamutMapOklch,
    hexToAllFormats,
    relativeLuminance,
    contrastColor,
    contrastRatio,
    contrastReport,
    rgbToCss,
    hslToCss,
  };

})();

window.ColorConvert = ColorConvert;
