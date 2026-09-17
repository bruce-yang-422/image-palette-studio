/**
 * color-sampler.js
 * 圖片取色器元件
 * 支援兩種模式：
 *   1. 點擊取色（Eyedropper）—— 點擊圖片任意位置取得該像素色彩
 *   2. 框選取色（Region）   —— 拖曳矩形框選，自動提取框內主色
 *
 * 依賴：color-convert.js, color-math.js
 * 注意：讀取像素直接從 Canvas 上的已繪製內容取得，無 CORS 疑慮
 */

'use strict';

const ColorSampler = (() => {

  let _canvas     = null;   // 目標 Canvas（已繪製圖片）
  let _wrapper    = null;   // canvas 的外層 wrapper div
  let _overlay    = null;   // 透明互動 overlay div
  let _tooltip    = null;   // 浮動取色 tooltip
  let _isActive   = false;  // 取色模式是否開啟
  let _photoH     = 0;      // 圖片區高度（px，相對於 canvas 原始尺寸）

  const _onColorPickedListeners = [];  // callback(hex)[]
  const _onModeChangeListeners  = [];  // callback(active)[]

  // 拖曳狀態
  let _dragging = false;
  let _dragStart = null;
  let _selectionBox = null;

  // ─────────────────────────────────────────────
  // 初始化
  // ─────────────────────────────────────────────

  function init(canvas, wrapper) {
    _canvas  = canvas;
    _wrapper = wrapper;

    // 建立透明 overlay
    _overlay = document.createElement('div');
    _overlay.id = 'sampler-overlay';
    _overlay.className = 'sampler-overlay';
    _overlay.hidden = true;
    _wrapper.appendChild(_overlay);

    // 建立取色 tooltip
    _tooltip = document.createElement('div');
    _tooltip.id = 'sampler-tooltip';
    _tooltip.className = 'sampler-tooltip';
    _tooltip.innerHTML = `
      <div class="st-swatch" id="st-swatch-color"></div>
      <span class="st-hex"  id="st-hex-text">#000000</span>
    `;
    _tooltip.hidden = true;
    document.body.appendChild(_tooltip);

    // 建立選框元素
    _selectionBox = document.createElement('div');
    _selectionBox.className = 'sampler-selection-box';
    _selectionBox.hidden = true;
    _overlay.appendChild(_selectionBox);

    // 事件
    _overlay.addEventListener('mousemove',  onMouseMove);
    _overlay.addEventListener('mousedown',  onMouseDown);
    _overlay.addEventListener('mouseup',    onMouseUp);
    _overlay.addEventListener('mouseleave', onMouseLeave);
    _overlay.addEventListener('click',      onClick);

    // 觸控支援（手機）
    _overlay.addEventListener('touchstart', onTouchStart, { passive: false });
    _overlay.addEventListener('touchmove',  onTouchMove,  { passive: false });
    _overlay.addEventListener('touchend',   onTouchEnd);

    injectStyles();
  }

  // ─────────────────────────────────────────────
  // 開啟 / 關閉取色模式
  // ─────────────────────────────────────────────

  function toggle() {
    _isActive ? deactivate() : activate();
  }

  function activate() {
    _isActive = true;
    _overlay.hidden = false;
    _overlay.classList.add('active');
    _onModeChangeListeners.forEach(cb => cb(true));
  }

  function deactivate() {
    _isActive = false;
    _overlay.hidden = true;
    _overlay.classList.remove('active');
    _tooltip.hidden = true;
    _selectionBox.hidden = true;
    _dragging = false;
    _onModeChangeListeners.forEach(cb => cb(false));
  }

  // ─────────────────────────────────────────────
  // 座標轉換：overlay display → canvas 原始像素
  // ─────────────────────────────────────────────

  function toCanvasCoords(clientX, clientY) {
    const rect   = _overlay.getBoundingClientRect();
    const scaleX = _canvas.width  / _overlay.clientWidth;
    const scaleY = _canvas.height / _overlay.clientHeight;
    return {
      x: (clientX - rect.left)  * scaleX,
      y: (clientY - rect.top)   * scaleY,
    };
  }

  // ─────────────────────────────────────────────
  // 像素取樣
  // ─────────────────────────────────────────────

  /** 從 canvas 取得指定座標的 HEX */
  function samplePixel(cx, cy) {
    const ctx  = _canvas.getContext('2d');
    const data = ctx.getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
    if (data[3] < 10) return null;  // 透明像素不取
    return ColorConvert.rgbToHex(data[0], data[1], data[2]);
  }

  /** 從矩形區域提取主色（K-means k=1） */
  function sampleRegion(cx1, cy1, cx2, cy2) {
    const x  = Math.round(Math.min(cx1, cx2));
    const y  = Math.round(Math.min(cy1, cy2));
    const w  = Math.round(Math.abs(cx2 - cx1));
    const h  = Math.round(Math.abs(cy2 - cy1));
    if (w < 4 || h < 4) return samplePixel((cx1+cx2)/2, (cy1+cy2)/2);

    const ctx  = _canvas.getContext('2d');
    const data = ctx.getImageData(x, y, w, h);
    const pixels = [];

    for (let i = 0; i < data.data.length; i += 4 * 3) {
      const r = data.data[i], g = data.data[i+1], b = data.data[i+2], a = data.data[i+3];
      if (a > 50) pixels.push({ r, g, b });
    }
    if (!pixels.length) return samplePixel((cx1+cx2)/2, (cy1+cy2)/2);

    // K-means k=1 → 找均值色
    const avg = pixels.reduce((s, p) => ({ r: s.r+p.r, g: s.g+p.g, b: s.b+p.b }), {r:0,g:0,b:0});
    const n   = pixels.length;
    return ColorConvert.rgbToHex(Math.round(avg.r/n), Math.round(avg.g/n), Math.round(avg.b/n));
  }

  // ─────────────────────────────────────────────
  // Tooltip 顯示
  // ─────────────────────────────────────────────

  function showTooltip(clientX, clientY, hex) {
    if (!hex) { _tooltip.hidden = true; return; }
    document.getElementById('st-swatch-color').style.background = hex;
    document.getElementById('st-hex-text').textContent = hex.toUpperCase();
    _tooltip.hidden = false;
    // 偏移避免遮住游標
    const tx = Math.min(clientX + 16, window.innerWidth  - 100);
    const ty = Math.max(clientY - 50, 8);
    _tooltip.style.transform = `translate(${tx}px, ${ty}px)`;
  }

  function hideTooltip() {
    _tooltip.hidden = true;
  }

  // ─────────────────────────────────────────────
  // 選框顯示
  // ─────────────────────────────────────────────

  function showSelection(x1, y1, x2, y2) {
    const overlayRect = _overlay.getBoundingClientRect();
    const sx = Math.min(x1, x2) - overlayRect.left;
    const sy = Math.min(y1, y2) - overlayRect.top;
    const sw = Math.abs(x2 - x1);
    const sh = Math.abs(y2 - y1);
    _selectionBox.style.cssText = `left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px`;
    _selectionBox.hidden = false;
  }

  // ─────────────────────────────────────────────
  // 滑鼠事件
  // ─────────────────────────────────────────────

  function onMouseMove(e) {
    if (_dragging && _dragStart) {
      showSelection(_dragStart.clientX, _dragStart.clientY, e.clientX, e.clientY);
      // 預覽框選區域的主色
      const c1 = toCanvasCoords(_dragStart.clientX, _dragStart.clientY);
      const c2 = toCanvasCoords(e.clientX, e.clientY);
      const hex = sampleRegion(c1.x, c1.y, c2.x, c2.y);
      if (hex) showTooltip(e.clientX, e.clientY, hex);
      return;
    }
    // hover 預覽像素色
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const hex = samplePixel(x, y);
    if (hex) showTooltip(e.clientX, e.clientY, hex);
    else     hideTooltip();
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    _dragging  = true;
    _dragStart = { clientX: e.clientX, clientY: e.clientY };
    _selectionBox.hidden = false;
  }

  function onMouseUp(e) {
    if (!_dragging) return;
    _dragging = false;

    const moved = Math.abs(e.clientX - _dragStart.clientX) > 8 ||
                  Math.abs(e.clientY - _dragStart.clientY) > 8;

    if (moved) {
      // 框選取色
      const c1 = toCanvasCoords(_dragStart.clientX, _dragStart.clientY);
      const c2 = toCanvasCoords(e.clientX, e.clientY);
      const hex = sampleRegion(c1.x, c1.y, c2.x, c2.y);
      if (hex) { _onColorPickedListeners.forEach(cb => cb(hex)); flashPickConfirm(hex); }
    }
    // 點擊交給 onClick 處理

    _selectionBox.hidden = true;
    _dragStart = null;
  }

  function onClick(e) {
    if (_dragging) return;
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const hex = samplePixel(x, y);
    if (hex) { _onColorPickedListeners.forEach(cb => cb(hex)); flashPickConfirm(hex); }
  }

  function onMouseLeave() {
    hideTooltip();
    if (_dragging) { _dragging = false; _selectionBox.hidden = true; }
  }

  // ─────────────────────────────────────────────
  // 觸控事件
  // ─────────────────────────────────────────────

  let _touchStart = null;

  function onTouchStart(e) {
    e.preventDefault();
    _touchStart = e.touches[0];
    _dragging   = true;
    _dragStart  = { clientX: _touchStart.clientX, clientY: _touchStart.clientY };
  }

  function onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    showSelection(_dragStart.clientX, _dragStart.clientY, t.clientX, t.clientY);
    const c1 = toCanvasCoords(_dragStart.clientX, _dragStart.clientY);
    const c2 = toCanvasCoords(t.clientX, t.clientY);
    const hex = sampleRegion(c1.x, c1.y, c2.x, c2.y);
    if (hex) showTooltip(t.clientX, t.clientY, hex);
  }

  function onTouchEnd(e) {
    e.preventDefault();
    _dragging = false;
    _selectionBox.hidden = true;
    const t = e.changedTouches[0];
    const moved = Math.abs(t.clientX - _dragStart.clientX) > 8 ||
                  Math.abs(t.clientY - _dragStart.clientY) > 8;

    const c1 = toCanvasCoords(_dragStart.clientX, _dragStart.clientY);
    const c2 = toCanvasCoords(t.clientX, t.clientY);
    const hex = moved ? sampleRegion(c1.x, c1.y, c2.x, c2.y)
                      : samplePixel(c1.x, c1.y);
    if (hex) { _onColorPickedListeners.forEach(cb => cb(hex)); flashPickConfirm(hex); }
    hideTooltip();
  }

  // ─────────────────────────────────────────────
  // 視覺反饋：取色成功閃爍
  // ─────────────────────────────────────────────

  function flashPickConfirm(hex) {
    const flash = document.createElement('div');
    flash.className = 'sampler-flash';
    flash.style.background = hex;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  // ─────────────────────────────────────────────
  // 更新 overlay 尺寸（canvas resize 後呼叫）
  // ─────────────────────────────────────────────

  function syncOverlay() {
    if (!_canvas || !_overlay) return;
    const s = _canvas.style;
    _overlay.style.width  = s.width;
    _overlay.style.height = s.height;
    _overlay.style.left   = _canvas.offsetLeft + 'px';
    _overlay.style.top    = _canvas.offsetTop  + 'px';
  }

  // ─────────────────────────────────────────────
  // 注入樣式
  // ─────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('sampler-styles')) return;
    const s = document.createElement('style');
    s.id = 'sampler-styles';
    s.textContent = `
      .sampler-overlay {
        position: absolute;
        inset: 0;
        z-index: 10;
        cursor: crosshair;
        border-radius: inherit;
      }
      .sampler-overlay.active {
        outline: 2px dashed rgba(101,119,212,0.7);
      }
      .sampler-tooltip {
        position: fixed;
        top: 0; left: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 5px 10px;
        border-radius: 8px;
        background: rgba(16,16,24,0.95);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        backdrop-filter: blur(8px);
        pointer-events: none;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.78rem;
        color: #eee;
        will-change: transform;
        transition: transform 0.05s;
      }
      .st-swatch {
        width: 18px; height: 18px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.18);
        flex-shrink: 0;
      }
      .sampler-selection-box {
        position: absolute;
        border: 2px solid rgba(101,119,212,0.8);
        background: rgba(101,119,212,0.12);
        backdrop-filter: blur(2px);
        pointer-events: none;
        border-radius: 3px;
      }
      .sampler-flash {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 9998;
        opacity: 0.18;
        pointer-events: none;
        animation: samplerFlash 0.5s ease-out forwards;
      }
      @keyframes samplerFlash {
        0%   { opacity: 0.25; }
        100% { opacity: 0; }
      }
      /* 取色工具按鈕啟動狀態 */
      #btn-eyedropper.sampler-on {
        background: rgba(101,119,212,0.2) !important;
        border-color: var(--clr-accent-mid) !important;
        color: var(--clr-accent-mid) !important;
      }
    `;
    document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    init,
    toggle,
    activate,
    deactivate,
    syncOverlay,
    isActive: () => _isActive,
    onColorPicked: (cb) => { if (typeof cb === 'function') _onColorPickedListeners.push(cb); },
    onModeChange:  (cb) => { if (typeof cb === 'function') _onModeChangeListeners.push(cb); },
  };

})();

window.ColorSampler = ColorSampler;
