/**
 * app.js
 * Image Palette Studio — 主應用程式進入點 v2
 *
 * 生成流程（§4）：
 *  ┌─ 圖片提取 ─── K-means++ → [風格投影 optional]
 *  │
 *  └─ 憑空生成 ─── 錨點色 → Chaos / Harmony → Style Projection
 *                              │
 *                         Locked Merge → Gamut Clamp → Final Palette
 *                              │
 *                ┌────────────┼─────────────┐
 *              Canvas       Gradient      Export
 */

'use strict';

// ─────────────────────────────────────────────
// Toast 全域工具
// ─────────────────────────────────────────────

window.AppToast = (() => {
  const container = document.getElementById('toast-container');
  function show(message, type = 'success', duration = 3000) {
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    const icons = { success: '✓', warning: '⚠', error: '✕' };
    toast.innerHTML = `<span class="toast-icon" style="font-weight:700;margin-right:4px">${icons[type] ?? '●'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  }
  return { show };
})();

// ─────────────────────────────────────────────
// 全域狀態
// ─────────────────────────────────────────────

const AppState = {
  image: null,          // HTMLImageElement
  palette: [],          // string[] — 最終 HEX 色票
  locked: [],           // boolean[] — 對應鎖定狀態

  /** 錨點色（憑空生成時的種子色） */
  anchors: [],          // string[] HEX

  /** 手動取色暫存數（供狀態列顯示） */
  sampledCount: 0,

  options: {
    // 頂層模式
    genSource:     'image',    // 'image' | 'scratch'
    imgPostprocess:'raw',      // 'raw' | 'remap'
    genAlgo:       'chaos',    // 'chaos' | 'harmony'
    harmonyType:   'analogous',

    // 畫布
    aspectRatio:  'original',
    fitMode:      'crop',
    swatchCount:  5,

    /** 裁切模式下圖片的拖曳位移，範圍 -1~1（0 = 置中） */
    cropOffset:   { x: 0, y: 0 },

    // 風格
    stylePreset:  'none',

    // 渲染
    gap:          4,
    radius:       0,
    hexLabel:     'none',
  },
};

// ─────────────────────────────────────────────
// 生成模式描述文字
// ─────────────────────────────────────────────

const MODE_DESCRIPTIONS = {
  'image-raw':    'K-means++ 從圖片提取代表色，保留原始色調',
  'image-remap':  'K-means++ 從圖片提取色彩，再強制投影至所選風格（Image Remap）',
  'chaos':        '全色彩空間隨機取樣，附安全亮度邊界保護；鎖定色票後重生成可保留主色',
  'chaos-anchor': '在錨點色附近進行 Chaos 隨機展開，未鎖定的空位以差異色補齊',
  'harmony':      '以錨點色（或隨機基準色）展開和諧配色——類比/互補/分裂互補/三角色',
};

// ─────────────────────────────────────────────
// DOM 引用
// ─────────────────────────────────────────────

const $canvas       = document.getElementById('main-canvas');
const $placeholder  = document.getElementById('canvas-placeholder');
const $canvasWrap   = document.getElementById('canvas-wrapper');
const $uploadZone   = document.getElementById('upload-section');   // 左側上傳區
const $btnRegen     = document.getElementById('btn-regenerate');
const $gapInput     = document.getElementById('swatch-gap');
const $gapVal       = document.getElementById('swatch-gap-value');
const $radiusInput  = document.getElementById('swatch-radius');
const $radiusVal    = document.getElementById('swatch-radius-value');
const $genModeDesc  = document.getElementById('gen-mode-desc-text');
const $genImageOpts = document.getElementById('gen-image-opts');
const $genScratchOpts = document.getElementById('gen-scratch-opts');
const $harmonyAlgoOpts = document.getElementById('harmony-algo-opts');
const $anchorList   = document.getElementById('anchor-list');
const $anchorEmpty  = document.getElementById('anchor-empty');
const $anchorBadge  = document.getElementById('anchor-count-badge');
const $btnAddAnchor = document.getElementById('btn-add-anchor');
const $btnEyedropper  = document.getElementById('btn-eyedropper');
const $samplerStatus  = document.getElementById('sampler-status');
const $samplerCount   = document.getElementById('sampler-count-text');
const $btnSamplerDone = document.getElementById('btn-sampler-done');

// ─────────────────────────────────────────────
// 初始化
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initComponents();
  initGenSourceControls();
  initScratchAlgoControls();
  initAnchorManager();
  initCanvasControls();
  initCropDrag();
  initColorSampler();
  initKeyboardShortcuts();
  updateModeDescription();
  console.info('🎨 Image Palette Studio v2 已載入');
});

// ─────────────────────────────────────────────
// 元件初始化
// ─────────────────────────────────────────────

function initComponents() {
  UploadComponent.init();
  SwatchListComponent.init();
  ColorblindSim.init();
  GradientGen.init();
  ExportUI.init(
    () => $canvas,
    () => AppState.palette,
    () => AppState.palette.map(h => ColorMath.approximateName(h)),
    () => ({
      gap:     AppState.options.gap,
      radius:  AppState.options.radius,
      showHex: AppState.options.hexLabel !== 'none',
    })
  );

  // 「立即生成」快捷按鈕（scratch hint box）
  document.getElementById('btn-scratch-regen')?.addEventListener('click', () => {
    generatePalette();
  });

  UploadComponent.onImageLoaded((img, file) => {
    AppState.image = img;
    AppState.options.cropOffset = { x: 0, y: 0 };
    showImageCanvas();
    generatePalette();
    AppToast.show(`已載入：${file.name}`, 'success');
  });

  UploadComponent.onImageRemoved(() => {
    AppState.image   = null;
    AppState.palette = [];
    AppState.locked  = [];
    // 只有在圖片模式才切回佔位
    if (AppState.options.genSource === 'image') hideCanvas();
    SwatchListComponent.render([]);
    GradientGen.update([]);
  });

  SwatchListComponent.onLockChange((index, locked) => {
    AppState.locked[index] = locked;
  });

  SwatchListComponent.onColorChange((index, newHex) => {
    AppState.palette[index] = newHex;
    redraw();
    GradientGen.update(AppState.palette);
  });
}

// ─────────────────────────────────────────────
// 頂層：圖片提取 vs 憑空生成
// ─────────────────────────────────────────────

function initGenSourceControls() {
  // 頂層模式切換
  document.querySelectorAll('input[name="gen-source"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.genSource = e.target.value;

      // 更新 tab active class
      document.querySelectorAll('.gen-source-tab').forEach(tab => {
        tab.classList.toggle('active', tab.contains(e.target));
      });

      const isImage = e.target.value === 'image';

      // 顯示/隱藏子面板
      if ($genImageOpts)   $genImageOpts.hidden   = !isImage;
      if ($genScratchOpts) $genScratchOpts.hidden  =  isImage;

      // 左側上傳區：圖片模式才顯示；scratch 顯示提示框
      const uploadSection  = document.getElementById('section-upload');
      const scratchHint    = document.getElementById('section-scratch-hint');
      if (uploadSection) uploadSection.hidden  = !isImage;
      if (scratchHint)   scratchHint.hidden    =  isImage;

      if (isImage) {
        // 切回圖片模式
        if (!AppState.image) {
          hideCanvas();
          AppToast.show('請上傳圖片以使用圖片提取模式', 'warning');
        } else {
          generatePalette();
        }
      } else {
        // 切到憑空生成模式 → 直接生成並顯示純色票畫布
        generatePalette();
      }

      updateModeDescription();
    });
  });

  // 圖片提取後處理
  document.querySelectorAll('input[name="img-postprocess"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.imgPostprocess = e.target.value;
      updateChipActiveInGroup(e.target, 'img-postprocess');
      updateModeDescription();
      if (AppState.palette.length) applyStyleAndRedraw();
    });
  });

  // 畫布比例
  document.querySelectorAll('input[name="aspect-ratio"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.aspectRatio = e.target.value;
      AppState.options.cropOffset = { x: 0, y: 0 };
      updateChipActiveInGroup(e.target, 'aspect-ratio');
      redraw();
    });
  });

  // 裝裱模式
  document.querySelectorAll('input[name="fit-mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.fitMode = e.target.value;
      updateChipActiveInGroup(e.target, 'fit-mode');
      redraw();
    });
  });

  // 色票數量
  document.querySelectorAll('input[name="swatch-count"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.swatchCount = parseInt(e.target.value);
      updateChipActiveInGroup(e.target, 'swatch-count');
      updateAnchorAddButtonState();
      generatePalette();
    });
  });

  // 風格色彩
  document.querySelectorAll('input[name="style-preset"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.stylePreset = e.target.value;
      document.querySelectorAll('.style-chip').forEach(chip => {
        chip.classList.toggle('active', chip.contains(e.target));
      });
      if (AppState.palette.length) applyStyleAndRedraw();
      else generatePalette();
    });
  });
}

// ─────────────────────────────────────────────
// 憑空生成：演算法控制
// ─────────────────────────────────────────────

function initScratchAlgoControls() {
  document.querySelectorAll('input[name="gen-algo"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.genAlgo = e.target.value;
      updateChipActiveInGroup(e.target, 'gen-algo');

      // 顯示/隱藏和諧子模式
      if ($harmonyAlgoOpts) $harmonyAlgoOpts.hidden = (e.target.value !== 'harmony');

      updateModeDescription();
      generatePalette();
    });
  });

  document.getElementById('harmony-type')?.addEventListener('change', e => {
    AppState.options.harmonyType = e.target.value;
    if (AppState.options.genSource === 'scratch' && AppState.options.genAlgo === 'harmony') {
      generatePalette();
    }
  });
}

// ─────────────────────────────────────────────
// 錨點色管理器
// ─────────────────────────────────────────────

function initAnchorManager() {
  $btnAddAnchor?.addEventListener('click', () => addAnchor());
}

/**
 * 新增一個錨點色（預設隨機安全色）
 * @param {string} [hex] 可指定初始 HEX
 */
function addAnchor(hex) {
  const maxAnchors = AppState.options.swatchCount - 1;
  if (AppState.anchors.length >= maxAnchors) {
    AppToast.show(`最多可設定 ${maxAnchors} 個錨點色（色票數-1）`, 'warning');
    return;
  }

  const color = hex ?? ColorMath.randomSafeHex();
  AppState.anchors.push(color);
  renderAnchorList();
  generatePalette();
}

/**
 * 移除指定索引的錨點色
 */
function removeAnchor(index) {
  AppState.anchors.splice(index, 1);
  renderAnchorList();
  generatePalette();
}

/**
 * 更新指定索引的錨點色
 */
function updateAnchor(index, newHex) {
  AppState.anchors[index] = newHex;
  generatePalette();
}

/**
 * 渲染錨點色列表 UI
 */
function renderAnchorList() {
  if (!$anchorList) return;

  // 清空（保留 empty 提示）
  $anchorList.querySelectorAll('.anchor-item').forEach(el => el.remove());

  const hasAnchors = AppState.anchors.length > 0;
  if ($anchorEmpty) $anchorEmpty.hidden = hasAnchors;
  if ($anchorBadge) {
    $anchorBadge.hidden = !hasAnchors;
    $anchorBadge.textContent = AppState.anchors.length;
  }

  AppState.anchors.forEach((hex, i) => {
    const li = buildAnchorItem(hex, i);
    $anchorList.appendChild(li);
  });

  updateAnchorAddButtonState();
}

/**
 * 建立錨點色 <li> 元素
 */
function buildAnchorItem(hex, index) {
  const li = document.createElement('li');
  li.className = 'anchor-item';
  li.setAttribute('role', 'listitem');
  li.dataset.index = index;

  li.innerHTML = `
    <div class="anchor-color-swatch" style="background:${hex}"
         title="點擊選色" role="button" tabindex="0" aria-label="錨點色 ${index+1}: ${hex}"></div>
    <input type="color" class="anchor-color-picker" value="${hex}" hidden aria-hidden="true" />
    <input type="text" class="anchor-hex-input"
           value="${hex.toUpperCase()}"
           maxlength="7"
           placeholder="#RRGGBB"
           aria-label="錨點色 ${index+1} HEX 色碼" />
    <button class="anchor-random-btn" title="隨機換色" aria-label="隨機更換此錨點色">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    </button>
    <button class="anchor-remove-btn" title="移除此錨點色" aria-label="移除錨點色 ${index+1}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  const swatch  = li.querySelector('.anchor-color-swatch');
  const picker  = li.querySelector('.anchor-color-picker');
  const hexInp  = li.querySelector('.anchor-hex-input');
  const randBtn = li.querySelector('.anchor-random-btn');
  const remBtn  = li.querySelector('.anchor-remove-btn');

  // 點色塊開啟 color picker
  swatch.addEventListener('click', () => picker.click());
  swatch.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') picker.click();
  });

  // Color picker 變化
  picker.addEventListener('input', e => {
    const h = e.target.value;
    swatch.style.background = h;
    hexInp.value = h.toUpperCase();
    updateAnchor(index, h);
  });

  // HEX 輸入框
  hexInp.addEventListener('change', e => {
    let val = e.target.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      swatch.style.background = val;
      picker.value = val;
      updateAnchor(index, val);
    } else {
      hexInp.value = AppState.anchors[index]?.toUpperCase() ?? '#888888';
    }
  });

  // 隨機換色
  randBtn.addEventListener('click', () => {
    const newHex = ColorMath.randomSafeHex();
    swatch.style.background = newHex;
    hexInp.value = newHex.toUpperCase();
    picker.value = newHex;
    updateAnchor(index, newHex);
  });

  // 移除
  remBtn.addEventListener('click', () => removeAnchor(index));

  return li;
}

/**
 * 更新「新增主色」按鈕的禁用狀態
 */
function updateAnchorAddButtonState() {
  if (!$btnAddAnchor) return;
  const max = AppState.options.swatchCount - 1;
  $btnAddAnchor.disabled = AppState.anchors.length >= max;
  $btnAddAnchor.title = AppState.anchors.length >= max
    ? `已達上限（最多 ${max} 個錨點色）`
    : '新增主色錨點';
}

// ─────────────────────────────────────────────
// Canvas 工具列事件
// ─────────────────────────────────────────────

function initCanvasControls() {
  $gapInput?.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    AppState.options.gap = v;
    if ($gapVal) $gapVal.textContent = `${v}px`;
    e.target.setAttribute('aria-valuenow', v);
    redraw();
  });

  $radiusInput?.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    AppState.options.radius = v;
    if ($radiusVal) $radiusVal.textContent = `${v}px`;
    e.target.setAttribute('aria-valuenow', v);
    redraw();
  });

  document.querySelectorAll('input[name="hex-label"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return;
      AppState.options.hexLabel = e.target.value;
      updateToggleChipActive(e.target);
      redraw();
    });
  });

  $btnRegen?.addEventListener('click', () => {
    generatePalette(true); // preserveLocked = true
  });
}

// ─────────────────────────────────────────────
// 裁切拖曳（fitMode === 'crop' 時，拖曳圖片調整取景位置）
// ─────────────────────────────────────────────

function initCropDrag() {
  if (!$canvas) return;

  let dragging = false;
  let startClient = null;
  let startOffset = null;

  function isDragEnabled() {
    return AppState.options.genSource === 'image'
      && AppState.options.fitMode === 'crop'
      && !!AppState.image
      && !ColorSampler.isActive();
  }

  function beginDrag(clientX, clientY) {
    if (!isDragEnabled()) return false;
    dragging = true;
    startClient = { x: clientX, y: clientY };
    startOffset = { ...AppState.options.cropOffset };
    $canvas.classList.add('is-crop-dragging');
    return true;
  }

  function updateDrag(clientX, clientY) {
    if (!dragging) return;
    const rect = $canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // 位移換算：以顯示尺寸為基準，拖曳整個可視寬高即代表跑完全部可移動範圍
    const dx = (clientX - startClient.x) / rect.width;
    const dy = (clientY - startClient.y) / rect.height;

    // 往右拖 = 看見圖片左側 → sx 減少 → offset 減少；故取負號
    AppState.options.cropOffset = {
      x: Math.max(-1, Math.min(1, startOffset.x - dx * 2)),
      y: Math.max(-1, Math.min(1, startOffset.y - dy * 2)),
    };
    redraw();
  }

  function endDrag() {
    dragging = false;
    $canvas.classList.remove('is-crop-dragging');
  }

  $canvas.addEventListener('mousedown', e => {
    if (beginDrag(e.clientX, e.clientY)) e.preventDefault();
  });
  window.addEventListener('mousemove', e => updateDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', endDrag);

  $canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (beginDrag(t.clientX, t.clientY)) e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    if (!dragging) return;
    const t = e.touches[0];
    updateDrag(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', endDrag);

  // 游標樣式提示：裁切模式下可拖曳
  function refreshCursor() {
    $canvas.classList.toggle('is-crop-draggable', isDragEnabled());
  }
  document.querySelectorAll('input[name="fit-mode"]').forEach(r => r.addEventListener('change', refreshCursor));
  document.querySelectorAll('input[name="gen-source"]').forEach(r => r.addEventListener('change', refreshCursor));
  ColorSampler.onModeChange(() => refreshCursor());
  refreshCursor();
}

// ─────────────────────────────────────────────
// 手動取色工具（滴管 / 框選）
// ─────────────────────────────────────────────

function initColorSampler() {
  if (!$canvas || !$canvasWrap) return;
  ColorSampler.init($canvas, $canvasWrap);

  ColorSampler.onColorPicked(hex => {
    AppState.sampledCount++;
    if ($samplerCount) $samplerCount.textContent = `已選 ${AppState.sampledCount} 色`;

    // 覆寫到第一個未鎖定的色票槽位；若都鎖定則附加不進去，僅提示
    const idx = AppState.palette.findIndex((_, i) => !AppState.locked[i]);
    if (idx >= 0) {
      AppState.palette[idx] = hex;
      SwatchListComponent.render(AppState.palette, AppState.locked);
      GradientGen.update(AppState.palette);
      redraw();
    } else {
      AppToast.show('所有色票皆已鎖定，請先解鎖欲替換的色票', 'warning');
    }
  });

  ColorSampler.onModeChange(active => {
    $btnEyedropper?.classList.toggle('sampler-on', active);
    $btnEyedropper?.setAttribute('aria-pressed', String(active));
    if ($samplerStatus) $samplerStatus.hidden = !active;
    if (active) {
      AppState.sampledCount = 0;
      if ($samplerCount) $samplerCount.textContent = '已選 0 色';
    }
  });

  $btnEyedropper?.addEventListener('click', () => {
    if (!AppState.image) {
      AppToast.show('請先上傳圖片', 'warning');
      return;
    }
    ColorSampler.toggle();
  });

  $btnSamplerDone?.addEventListener('click', () => {
    ColorSampler.deactivate();
  });
}

// ─────────────────────────────────────────────
// 鍵盤快捷鍵
// ─────────────────────────────────────────────

function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const active = document.activeElement.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(active)) return;

    if (e.code === 'Space' || e.code === 'KeyR') {
      e.preventDefault();
      generatePalette(true);
    }
    if (e.code === 'KeyA' && !e.metaKey && !e.ctrlKey &&
        AppState.options.genSource === 'scratch') {
      e.preventDefault();
      addAnchor();
    }
  });
}

// ─────────────────────────────────────────────
// 核心：色票生成主流程
// ─────────────────────────────────────────────

/**
 * 依據 AppState.options 生成色票並更新所有 UI
 * @param {boolean} preserveLocked 是否保留鎖定色票
 */
async function generatePalette(preserveLocked = false) {
  const { genSource, imgPostprocess, genAlgo, harmonyType, stylePreset, swatchCount } = AppState.options;

  // 備份鎖定色
  const lockedSlots = preserveLocked
    ? AppState.palette.map((hex, i) => AppState.locked[i] ? hex : null)
    : new Array(swatchCount).fill(null);

  let basePalette = [];

  try {
    // ── 模式 1：圖片提取 ──────────────────────
    if (genSource === 'image') {
      if (!AppState.image) {
        AppToast.show('請先上傳圖片', 'warning');
        return;
      }
      setLoading(true);
      basePalette = await ExtractionEngine.extractFromElement(AppState.image, swatchCount);
      setLoading(false);

    // ── 模式 2：憑空生成 ──────────────────────
    } else {

      // ── 2a. 純亂數 Chaos ─────────────────
      if (genAlgo === 'chaos') {
        if (AppState.anchors.length > 0) {
          // 有錨點：保留錨點色，其餘隨機展開
          basePalette = fillAroundAnchors(AppState.anchors, swatchCount, 'chaos');
        } else {
          basePalette = ColorMath.randomPalette(swatchCount);
        }

      // ── 2b. 和諧 Harmony ─────────────────
      } else if (genAlgo === 'harmony') {
        // 以第一個錨點（或鎖定色 or 隨機）為基準色
        const baseHex = AppState.anchors[0]
          ?? lockedSlots.find(h => h !== null)
          ?? ColorMath.randomSafeHex();

        basePalette = HarmonyEngine.generate(baseHex, harmonyType, swatchCount);

        // 若有多個錨點，替換對應位置
        AppState.anchors.forEach((hex, i) => {
          if (i < basePalette.length) basePalette[i] = hex;
        });
      }
    }

  } catch (err) {
    setLoading(false);
    AppToast.show(`生成失敗：${err.message}`, 'error');
    basePalette = ColorMath.randomPalette(swatchCount);
  }

  // ── Style Projection ─────────────────────────
  // 圖片提取：只有 imgPostprocess === 'remap' 才投影
  const shouldProject = (genSource === 'scratch') || (imgPostprocess === 'remap');
  let projected = shouldProject
    ? StyleEngine.projectPalette(basePalette, stylePreset, lockedSlots.map(h => h !== null))
    : basePalette;

  // ── Locked Color Merge ────────────────────────
  AppState.palette = projected.map((hex, i) => lockedSlots[i] ?? hex);

  // 確保長度對齊
  while (AppState.palette.length < swatchCount) AppState.palette.push(ColorMath.randomSafeHex());
  AppState.palette = AppState.palette.slice(0, swatchCount);
  AppState.locked  = AppState.palette.map((_, i) =>
    preserveLocked ? (AppState.locked[i] ?? false) : false
  );

  // ── Final Output ──────────────────────────────
  updateAllUI();
}

/**
 * 以錨點色為種子，填滿剩餘的色票
 * @param {string[]} anchors 錨點 HEX 陣列
 * @param {number}   total   目標色票數
 * @param {'chaos'|'harmony'} algo
 * @returns {string[]}
 */
function fillAroundAnchors(anchors, total, algo) {
  const result = [...anchors];
  const needed = total - result.length;
  if (needed <= 0) return result.slice(0, total);

  let attempts = 0;
  let filled = 0;
  while (filled < needed && attempts < 1500) {
    attempts++;
    let candidate;
    if (algo === 'chaos') {
      candidate = ColorMath.randomSafeHex();
    } else {
      // 在每個錨點附近生成
      const anchor = anchors[filled % anchors.length];
      const hsl = ColorConvert.hexToHsl(anchor);
      candidate = ColorConvert.hslToHex(
        (hsl.h + (Math.random() - 0.5) * 80 + 360) % 360,
        Math.max(15, Math.min(90, hsl.s + (Math.random() - 0.5) * 30)),
        Math.max(20, Math.min(85, hsl.l + (Math.random() - 0.5) * 20))
      );
    }
    const tooClose = result.some(c => ColorMath.deltaE76(c, candidate) < 28);
    if (!tooClose) { result.push(candidate); filled++; }
  }
  // 補足
  while (result.length < total) result.push(ColorMath.randomSafeHex());
  return result;
}

/**
 * 保留 palette，僅重新套用風格（切換風格預設時）
 */
function applyStyleAndRedraw() {
  const { stylePreset, imgPostprocess, genSource } = AppState.options;
  const shouldProject = genSource === 'scratch' || imgPostprocess === 'remap';
  if (shouldProject) {
    AppState.palette = StyleEngine.projectPalette(AppState.palette, stylePreset, AppState.locked);
  }
  updateAllUI();
}

// ─────────────────────────────────────────────
// UI 統一更新
// ─────────────────────────────────────────────

function updateAllUI() {
  SwatchListComponent.render(AppState.palette, AppState.locked);
  GradientGen.update(AppState.palette);
  redraw();
  updateModeDescription();
}

/**
 * 依模式決定渲染方式
 */
function redraw() {
  const { genSource } = AppState.options;

  if (genSource === 'scratch') {
    // 憑空生成：純色票畫布（不需要圖片）
    if (!AppState.palette.length) return;
    showSwatchCanvas();
    CanvasRenderer.renderSwatchOnly($canvas, AppState.palette, AppState.options);
    CanvasRenderer.fitToContainer($canvas, $canvasWrap);

  } else {
    // 圖片提取模式：需要圖片
    if (!AppState.image || !AppState.palette.length) return;
    showImageCanvas();
    CanvasRenderer.render($canvas, AppState.image, AppState.palette, AppState.options);
    CanvasRenderer.fitToContainer($canvas, $canvasWrap);
  }

  ColorSampler.syncOverlay?.();
}

function updateModeDescription() {
  if (!$genModeDesc) return;
  const { genSource, imgPostprocess, genAlgo } = AppState.options;
  let key;
  if (genSource === 'image') key = `image-${imgPostprocess}`;
  else if (genAlgo === 'chaos') key = AppState.anchors.length ? 'chaos-anchor' : 'chaos';
  else key = 'harmony';
  $genModeDesc.textContent = MODE_DESCRIPTIONS[key] ?? '';
}

// ─────────────────────────────────────────────
// Canvas 顯示 / 隱藏 helpers
// ─────────────────────────────────────────────

/** 顯示圖片+色票模式的畫布 */
function showImageCanvas() {
  $canvas.hidden = false;
  if ($placeholder) $placeholder.style.display = 'none';
}

/** 顯示純色票畫布（憑空生成）*/
function showSwatchCanvas() {
  $canvas.hidden = false;
  if ($placeholder) $placeholder.style.display = 'none';
}

/** 隱藏畫布，顯示佔位 */
function hideCanvas() {
  $canvas.hidden = true;
  if ($placeholder) $placeholder.style.display = '';
  const ctx = $canvas.getContext('2d');
  ctx.clearRect(0, 0, $canvas.width, $canvas.height);
}

function setLoading(active) {
  $btnRegen?.classList.toggle('is-loading', active);
}

// ─────────────────────────────────────────────
// UI 輔助
// ─────────────────────────────────────────────

function updateChipActiveInGroup(checkedInput, name) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
    r.closest('.chip')?.classList.toggle('active', r === checkedInput);
  });
}

function updateToggleChipActive(checkedInput) {
  document.querySelectorAll('input[name="hex-label"]').forEach(r => {
    r.closest('.toggle-chip')?.classList.toggle('active', r === checkedInput);
  });
}

// ─────────────────────────────────────────────
// 視窗縮放
// ─────────────────────────────────────────────

window.addEventListener('resize', () => {
  if (AppState.image && !$canvas.hidden) {
    CanvasRenderer.fitToContainer($canvas, $canvasWrap);
    ColorSampler.syncOverlay?.();
  }
});
