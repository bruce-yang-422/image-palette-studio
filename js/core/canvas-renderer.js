/**
 * canvas-renderer.js  v2
 * 劇照色票卡渲染引擎
 *
 * 尺寸系統重構：
 *   • 「卡片比例」= 整張輸出卡（照片 + 色票）的外觀比例
 *   • 「版型」     = 色票佔卡片高度的比例（thin/standard/half/color）
 *   • 原始比例（original）= 照片自然比例為卡片基礎，色票高度 = photoH × swatchRatio
 *
 * 版型比例對照：
 *   thin     12%  ── 細條，照片主導
 *   standard 25%  ── 標準
 *   half     50%  ── 均分（照片:色票 = 1:1）
 *   color    70%  ── 色彩主導
 *
 * 依賴：color-convert.js
 */

'use strict';

const CanvasRenderer = (() => {

  // ─────────────────────────────────────────────
  // 常數
  // ─────────────────────────────────────────────

  /** 卡片總比例（寬:高） */
  const CARD_RATIOS = {
    'original': null,   // 由圖片決定
    '1:1':  1,
    '4:3':  4 / 3,
    '3:2':  3 / 2,
    '16:9': 16 / 9,
    '2:1':  2 / 1,
    '9:16': 9 / 16,
  };

  /** 色票佔卡片高度的比例 */
  const SWATCH_RATIOS = {
    thin:     0.12,   // 細條 12%
    standard: 0.25,   // 標準 25%
    half:     0.50,   // 均分 50%
    color:    0.70,   // 色彩主導 70%
  };

  const BASE_OUTPUT_WIDTH = 1200;

  // ─────────────────────────────────────────────
  // 尺寸計算
  // ─────────────────────────────────────────────

  /**
   * 計算輸出畫布的各區域尺寸
   *
   * @param {HTMLImageElement|null} img
   * @param {string} cardRatioKey  'original'|'1:1'|'4:3'|...
   * @param {string} swatchLayout  'thin'|'standard'|'half'|'color'
   * @returns {{ canvasW, canvasH, photoH, swatchH }}
   */
  function computeSize(img, cardRatioKey, swatchLayout) {
    const W           = BASE_OUTPUT_WIDTH;
    const swatchRatio = SWATCH_RATIOS[swatchLayout] ?? SWATCH_RATIOS.standard;
    const cardRatio   = CARD_RATIOS[cardRatioKey];

    let canvasH, photoH, swatchH;

    if (!cardRatio) {
      // === 原始比例：照片自然比例，色票外加 ===
      const imgH = img
        ? Math.round(W * img.naturalHeight / img.naturalWidth)
        : Math.round(W / (16/9)); // fallback
      // 色票高度 = 照片高度 × (swatchRatio / (1-swatchRatio)) 保持比例一致
      swatchH  = Math.round(imgH * (swatchRatio / (1 - swatchRatio)));
      photoH   = imgH;
      canvasH  = photoH + swatchH;
    } else {
      // === 固定卡片比例：總高度固定，色票在內分割 ===
      canvasH  = Math.round(W / cardRatio);
      swatchH  = Math.round(canvasH * swatchRatio);
      photoH   = canvasH - swatchH;
    }

    return { canvasW: W, canvasH, photoH, swatchH };
  }

  // ─────────────────────────────────────────────
  // Center-Crop 計算
  // ─────────────────────────────────────────────

  /**
   * @param {HTMLImageElement} img
   * @param {number} targetW
   * @param {number} targetH
   * @param {{x:number,y:number}} [offset] 裁切位移，範圍 -1~1（0 = 置中），
   *   x/y = 1 代表推到裁切窗可移動的最大邊界
   */
  function centerCropRect(img, targetW, targetH, offset = { x: 0, y: 0 }) {
    const srcRatio = img.naturalWidth / img.naturalHeight;
    const dstRatio = targetW / targetH;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (srcRatio > dstRatio) {
      sw = Math.round(img.naturalHeight * dstRatio);
      const maxSx = img.naturalWidth - sw;
      sx = Math.round((maxSx / 2) * (1 + clampOffset(offset.x)));
    } else {
      sh = Math.round(img.naturalWidth / dstRatio);
      const maxSy = img.naturalHeight - sh;
      sy = Math.round((maxSy / 2) * (1 + clampOffset(offset.y)));
    }
    return { sx, sy, sw, sh };
  }

  function clampOffset(v) {
    return Math.max(-1, Math.min(1, v || 0));
  }

  // ─────────────────────────────────────────────
  // 圓角路徑
  // ─────────────────────────────────────────────

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
  }

  // ─────────────────────────────────────────────
  // 色票繪製（共用）
  // ─────────────────────────────────────────────

  function drawSwatches(ctx, palette, areaX, areaY, areaW, areaH, opts = {}) {
    const { gap = 4, radius = 0, hexLabel = 'none', names = [] } = opts;
    const n = palette.length;
    if (!n) return;

    const totalGap = gap * (n - 1);
    const swatchW  = (areaW - totalGap) / n;

    // 標籤下方時，色塊高度略縮
    const labelH  = hexLabel === 'below' ? Math.min(Math.round(areaH * 0.16), 22) : 0;
    const blockH  = areaH - labelH;

    palette.forEach((hex, i) => {
      const x = areaX + i * (swatchW + gap);

      // 色塊
      ctx.fillStyle = hex;
      if (radius > 0) {
        roundRect(ctx, x, areaY, swatchW, blockH, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, areaY, swatchW, blockH);
      }

      // HEX 標籤
      if (hexLabel === 'inside' && blockH > 40) {
        const fs = Math.max(11, Math.round(swatchW * 0.10));
        ctx.fillStyle    = ColorConvert.contrastColor(hex);
        ctx.font         = `600 ${fs}px "JetBrains Mono", monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        // 如有色名，HEX 往下移
        if (names[i] && blockH > fs * 4) {
          ctx.fillText(hex.toUpperCase(), x + swatchW / 2, areaY + blockH / 2 + fs * 0.7);
          ctx.font         = `500 ${Math.round(fs * 0.68)}px "Inter", sans-serif`;
          ctx.fillText(names[i],          x + swatchW / 2, areaY + blockH / 2 - fs * 0.6);
        } else {
          ctx.fillText(hex.toUpperCase(), x + swatchW / 2, areaY + blockH / 2);
        }

      } else if (hexLabel === 'below' && labelH > 0) {
        // 標籤背景
        ctx.fillStyle = '#0e0e11';
        ctx.fillRect(x, areaY + blockH, swatchW, labelH);
        // HEX 文字
        ctx.fillStyle    = '#999';
        ctx.font         = `500 ${Math.max(9, Math.round(swatchW * 0.075))}px "JetBrains Mono", monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hex.toUpperCase(), x + swatchW / 2, areaY + blockH + labelH / 2);
      }
    });
  }

  // ─────────────────────────────────────────────
  // 模式 A：圖片 + 色票
  // ─────────────────────────────────────────────

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLImageElement}  img
   * @param {string[]}         palette
   * @param {object}           opts
   *   aspectRatio  - 卡片總比例 key
   *   swatchLayout - 版型 key
   *   fitMode      - 'crop'|'letterbox'
   *   gap, radius, hexLabel
   */
  function render(canvas, img, palette, opts = {}) {
    const {
      aspectRatio  = 'original',
      swatchLayout = 'standard',
      fitMode      = 'crop',
      gap          = 4,
      radius       = 0,
      hexLabel     = 'none',
      cropOffset   = { x: 0, y: 0 },
    } = opts;

    const { canvasW, canvasH, photoH, swatchH } = computeSize(img, aspectRatio, swatchLayout);
    canvas.width  = canvasW;
    canvas.height = canvasH;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    // 色票區背景
    ctx.fillStyle = '#0e0e11';
    ctx.fillRect(0, photoH, canvasW, swatchH);

    // ── 圖片層 ─────────────────────────────────
    if (fitMode === 'letterbox') {
      ctx.fillStyle = palette[0] ?? '#111';
      ctx.fillRect(0, 0, canvasW, photoH);
      const ir = img.naturalWidth / img.naturalHeight;
      const ar = canvasW / photoH;
      let dW, dH, dX = 0, dY = 0;
      if (ir > ar) { dW = canvasW; dH = Math.round(canvasW / ir); dY = Math.round((photoH - dH) / 2); }
      else         { dH = photoH;  dW = Math.round(photoH * ir);  dX = Math.round((canvasW - dW) / 2); }
      ctx.drawImage(img, dX, dY, dW, dH);
    } else {
      // Center-crop（可依 cropOffset 位移取景窗）
      const crop = centerCropRect(img, canvasW, photoH, cropOffset);
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvasW, photoH);
    }

    // ── 色票層 ─────────────────────────────────
    const names = palette.map(h => {
      try { return window.ColorMath?.approximateName(h) ?? ''; } catch { return ''; }
    });
    drawSwatches(ctx, palette, 0, photoH, canvasW, swatchH, { gap, radius, hexLabel, names });
  }

  // ─────────────────────────────────────────────
  // 模式 B：純色票卡（憑空生成）
  // ─────────────────────────────────────────────

  function renderSwatchOnly(canvas, palette, opts = {}) {
    const { gap = 4, radius = 8, hexLabel = 'inside' } = opts;
    const n = palette.length;
    if (!n) return;

    const W = BASE_OUTPUT_WIDTH;
    const H = Math.round(W * 0.5);   // 2:1 橫向卡

    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0e0e11';
    ctx.fillRect(0, 0, W, H);

    const PAD = Math.round(W * 0.025);
    const names = palette.map(h => {
      try { return window.ColorMath?.approximateName(h) ?? ''; } catch { return ''; }
    });
    drawSwatches(ctx, palette, PAD, PAD, W - PAD * 2, H - PAD * 2,
      { gap: Math.max(gap, 6), radius: Math.max(radius, 6), hexLabel, names });
  }

  // ─────────────────────────────────────────────
  // 色盲後處理
  // ─────────────────────────────────────────────

  const CB_MATRICES = {
    protanopia:    [0.567,0.433,0,   0.558,0.442,0,   0,0.242,0.758],
    deuteranopia:  [0.625,0.375,0,   0.700,0.300,0,   0,0.300,0.700],
    tritanopia:    [0.950,0.050,0,   0,0.433,0.567,   0,0.475,0.525],
    achromatopsia: [0.299,0.587,0.114,0.299,0.587,0.114,0.299,0.587,0.114],
  };

  function applyColorblindFilter(canvas, filterType) {
    const m = CB_MATRICES[filterType];
    if (!m) return;
    const ctx = canvas.getContext('2d');
    const id  = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d   = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      d[i]   = Math.round(m[0]*r + m[1]*g + m[2]*b);
      d[i+1] = Math.round(m[3]*r + m[4]*g + m[5]*b);
      d[i+2] = Math.round(m[6]*r + m[7]*g + m[8]*b);
    }
    ctx.putImageData(id, 0, 0);
  }

  // ─────────────────────────────────────────────
  // 縮放適配（顯示用）
  // ─────────────────────────────────────────────

  function fitToContainer(canvas, container) {
    const cw = (container.clientWidth  || 600) - 48;
    const ch = (container.clientHeight || 400) - 48;
    const scale = Math.min(1, cw / canvas.width, ch / canvas.height);
    canvas.style.width  = Math.round(canvas.width  * scale) + 'px';
    canvas.style.height = Math.round(canvas.height * scale) + 'px';
  }

  /** 計算給定卡片選項下，圖片區佔顯示 Canvas 的高度比（供取色器使用） */
  function getPhotoRatio(img, cardRatioKey, swatchLayout) {
    const sz = computeSize(img, cardRatioKey, swatchLayout);
    return sz.photoH / sz.canvasH;
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    render,
    renderSwatchOnly,
    applyColorblindFilter,
    fitToContainer,
    computeSize,
    getPhotoRatio,
    centerCropRect,
    CARD_RATIOS,
    SWATCH_RATIOS,
  };

})();

window.CanvasRenderer = CanvasRenderer;
