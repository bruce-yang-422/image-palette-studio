/**
 * colorblind-sim.js
 * 色盲友善模擬器元件
 * 透過 SVG FeColorMatrix 濾鏡即時套用至整個 #app-workspace
 */

'use strict';

const ColorblindSim = (() => {

  let currentFilter = 'none';
  let toggleBtn, menu;

  function init() {
    toggleBtn = document.getElementById('btn-colorblind-toggle');
    menu      = document.getElementById('colorblind-menu');

    // 開/關選單
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !menu.hidden;
      menu.hidden = isOpen;
      toggleBtn.setAttribute('aria-expanded', !isOpen);
    });

    // 點選選單選項
    menu?.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        applyFilter(item.dataset.filter);
        menu.hidden = true;
        toggleBtn.setAttribute('aria-expanded', 'false');
      });
    });

    // 點擊外部關閉
    document.addEventListener('click', (e) => {
      if (!toggleBtn?.contains(e.target) && !menu?.contains(e.target)) {
        menu && (menu.hidden = true);
        toggleBtn?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /**
   * 套用色盲濾鏡至整個畫面
   * 使用 CSS filter:url() 讓 SVG FeColorMatrix 作用於整個 workspace
   * @param {string} filterKey 'none'|'protanopia'|'deuteranopia'|'tritanopia'|'achromatopsia'
   */
  function applyFilter(filterKey) {
    currentFilter = filterKey;

    const workspace = document.getElementById('app-workspace');
    if (!workspace) return;
    document.documentElement.style.setProperty('--vision-filter',filterKey==='none'?'none':`url(#filter-${filterKey})`);

    // 更新選單 active 狀態
    menu?.querySelectorAll('.dropdown-item').forEach(item => {
      item.classList.toggle('active', item.dataset.filter === filterKey);
    });

    // 更新按鈕樣式
    if (toggleBtn) {
      toggleBtn.classList.toggle('filter-active', filterKey !== 'none');
    }

    // 注入活躍濾鏡指示樣式
    updateFilterBadge(filterKey);
  }

  /**
   * 在 header 按鈕上顯示當前濾鏡名稱徽章
   */
  function updateFilterBadge(filterKey) {
    let badge = toggleBtn?.querySelector('.filter-badge');
    if (filterKey === 'none') {
      badge?.remove();
      return;
    }
    const labels = {
      protanopia:   '紅色盲',
      deuteranopia: '綠色盲',
      tritanopia:   '藍黃色盲',
      achromatopsia:'全色盲',
    };
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'filter-badge';
      toggleBtn?.appendChild(badge);
    }
    badge.textContent = labels[filterKey] ?? filterKey;
  }

  /**
   * 返回當前套用的濾鏡 key（供匯出時的 Canvas 後處理使用）
   */
  function getCurrentFilter() {
    return currentFilter;
  }

  // 注入樣式
  function injectStyles() {
    if (document.getElementById('colorblind-sim-styles')) return;
    const style = document.createElement('style');
    style.id = 'colorblind-sim-styles';
    style.textContent = `
      .header-btn.filter-active {
        color: var(--clr-warning) !important;
        border-color: rgba(247,183,49,0.35) !important;
        background: rgba(247,183,49,0.08) !important;
      }
      .filter-badge {
        display: inline-flex;
        align-items: center;
        margin-left: 4px;
        padding: 1px 6px;
        border-radius: var(--radius-full);
        font-size: 0.65rem;
        font-weight: 700;
        background: var(--clr-warning);
        color: #000;
        letter-spacing: 0.03em;
      }
    `;
    document.head.appendChild(style);
  }

  return {
    init: () => { injectStyles(); init(); },
    applyFilter,
    getCurrentFilter,
  };

})();

window.ColorblindSim = ColorblindSim;
