/**
 * swatch-list.js
 * 色票槽位列表 UI 元件
 * 動態渲染色票卡、鎖定/解鎖、複製 HEX
 * 依賴：color-convert.js, color-math.js
 */

'use strict';

const SwatchListComponent = (() => {

  let _palette = [];        // string[] HEX
  let _locked  = [];        // boolean[]
  let _onLockChange = null; // callback(index, locked)
  let _onColorChange = null;// callback(index, newHex)

  let listEl;

  function init() {
    listEl = document.getElementById('swatch-list');
  }

  // ─────────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────────

  /**
   * 以新色票陣列重新渲染列表
   * @param {string[]} palette HEX 陣列
   * @param {boolean[]} [locked] 鎖定狀態（可選）
   */
  function render(palette, locked = []) {
    _palette = [...palette];
    _locked  = palette.map((_, i) => locked[i] ?? false);

    listEl.innerHTML = '';

    if (!palette.length) {
      listEl.innerHTML = '<li class="swatch-item swatch-placeholder" role="listitem"><span>色票將在此顯示</span></li>';
      return;
    }

    palette.forEach((hex, i) => {
      const li = buildSwatchItem(hex, i, _locked[i]);
      listEl.appendChild(li);
      // Stagger animation delay
      li.style.animationDelay = `${i * 40}ms`;
    });
  }

  /**
   * 建立單一色票 <li> 元素
   */
  function buildSwatchItem(hex, index, isLocked) {
    const name = ColorMath.approximateName(hex);
    const formats = ColorConvert.hexToAllFormats(hex);

    const li = document.createElement('li');
    li.className = 'swatch-item';
    li.setAttribute('role', 'listitem');
    li.dataset.index = index;
    if (isLocked) li.classList.add('is-locked');

    li.innerHTML = `
      <div class="swatch-color" style="background:${hex}"
           aria-label="色票顏色 ${hex.toUpperCase()}"
           title="點擊選色器調整"></div>
      <div class="swatch-info">
        <span class="swatch-hex">${hex.toUpperCase()}</span>
        <span class="swatch-name">${name}</span>
      </div>
      <div class="swatch-actions">
        <button class="swatch-btn-lock"
                aria-label="${isLocked ? '解鎖此色票' : '鎖定此色票'}"
                aria-pressed="${isLocked}"
                title="${isLocked ? '解鎖' : '鎖定'}">
          ${isLocked ? lockIcon() : unlockIcon()}
        </button>
        <button class="swatch-btn-copy"
                aria-label="複製 HEX 色碼 ${hex.toUpperCase()}"
                title="複製 HEX">
          ${copyIcon()}
        </button>
      </div>
      <!-- 隱藏的原生 color picker -->
      <input type="color" class="swatch-color-input"
             value="${hex}" aria-label="調整色票 ${index+1} 的顏色" hidden />
    `;

    // 色塊點擊 → 開啟 color picker
    const colorDiv   = li.querySelector('.swatch-color');
    const colorInput = li.querySelector('.swatch-color-input');
    colorDiv.addEventListener('click', () => colorInput.click());
    colorInput.addEventListener('input', e => {
      const newHex = e.target.value;
      colorDiv.style.background = newHex;
      li.querySelector('.swatch-hex').textContent = newHex.toUpperCase();
      li.querySelector('.swatch-name').textContent = ColorMath.approximateName(newHex);
      _palette[index] = newHex;
      _onColorChange?.(index, newHex);
    });

    // 鎖定 / 解鎖
    const lockBtn = li.querySelector('.swatch-btn-lock');
    lockBtn.addEventListener('click', () => toggleLock(index, li, lockBtn));

    // 複製 HEX
    const copyBtn = li.querySelector('.swatch-btn-copy');
    copyBtn.addEventListener('click', () => copyHex(hex, copyBtn));

    // Tooltip — 懸停顯示所有格式
    colorDiv.title = [
      hex.toUpperCase(),
      formats.cssRgb,
      formats.cssHsl,
    ].join('\n');

    return li;
  }

  // ─────────────────────────────────────────────
  // 鎖定 / 解鎖
  // ─────────────────────────────────────────────

  function toggleLock(index, li, btn) {
    _locked[index] = !_locked[index];
    const locked = _locked[index];
    li.classList.toggle('is-locked', locked);
    btn.setAttribute('aria-pressed', locked);
    btn.setAttribute('aria-label', locked ? '解鎖此色票' : '鎖定此色票');
    btn.title = locked ? '解鎖' : '鎖定';
    btn.innerHTML = locked ? lockIcon() : unlockIcon();
    _onLockChange?.(index, locked);
  }

  // ─────────────────────────────────────────────
  // 複製 HEX
  // ─────────────────────────────────────────────

  function copyHex(hex, btn) {
    navigator.clipboard.writeText(hex.toUpperCase()).then(() => {
      const original = btn.innerHTML;
      btn.innerHTML = '✓';
      btn.style.color = 'var(--clr-success)';
      window.AppToast?.show(`已複製 ${hex.toUpperCase()}`, 'success');
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.color = '';
      }, 1500);
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = hex.toUpperCase();
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window.AppToast?.show(`已複製 ${hex.toUpperCase()}`, 'success');
    });
  }

  // ─────────────────────────────────────────────
  // 更新單一色票
  // ─────────────────────────────────────────────

  function updateSwatch(index, newHex) {
    _palette[index] = newHex;
    const li = listEl.querySelector(`[data-index="${index}"]`);
    if (!li) return;
    li.querySelector('.swatch-color').style.background = newHex;
    li.querySelector('.swatch-hex').textContent = newHex.toUpperCase();
    li.querySelector('.swatch-name').textContent = ColorMath.approximateName(newHex);
    li.querySelector('.swatch-color-input').value = newHex;
  }

  // ─────────────────────────────────────────────
  // SVG Icons
  // ─────────────────────────────────────────────

  function lockIcon() {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }
  function unlockIcon() {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
  }
  function copyIcon() {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  }

  // ─────────────────────────────────────────────
  // CSS 補充：鎖定狀態樣式（注入 style tag）
  // ─────────────────────────────────────────────

  function injectLockStyles() {
    if (document.getElementById('swatch-lock-styles')) return;
    const style = document.createElement('style');
    style.id = 'swatch-lock-styles';
    style.textContent = `
      .swatch-item.is-locked {
        border-color: var(--clr-warning) !important;
        background: rgba(247,183,49,0.06) !important;
      }
      .swatch-item.is-locked .swatch-btn-lock {
        color: var(--clr-warning);
      }
      .swatch-color-input {
        width: 0; height: 0; opacity: 0;
        position: absolute; pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    init: () => { init(); injectLockStyles(); },
    render,
    updateSwatch,
    getPalette:  () => [..._palette],
    getLocked:   () => [..._locked],
    onLockChange:  (cb) => { _onLockChange  = cb; },
    onColorChange: (cb) => { _onColorChange = cb; },
  };

})();

window.SwatchListComponent = SwatchListComponent;
