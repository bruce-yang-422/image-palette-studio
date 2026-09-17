/**
 * export-ui.js
 * 匯出 UI 元件
 * 連結 HTML 匯出按鈕 → ExportEngine
 * 依賴：export-engine.js
 */

'use strict';

const ExportUI = (() => {

  let _getCanvas  = null;  // () => HTMLCanvasElement
  let _getPalette = null;  // () => string[]
  let _getNames   = null;  // () => string[]
  let _getOpts    = null;  // () => object

  function init(getCanvas, getPalette, getNames, getOpts) {
    _getCanvas  = getCanvas;
    _getPalette = getPalette;
    _getNames   = getNames;
    _getOpts    = getOpts;

    bindButton('btn-export-png',  'png');
    bindButton('btn-export-svg',  'svg');
    bindButton('btn-export-ase',  'ase');
    bindButton('btn-export-aco',  'aco');
    bindButton('btn-export-json', 'json');
    bindButton('btn-export-css',  'css');

    // Header 主匯出按鈕（預設 PNG）
    document.getElementById('btn-export-main')?.addEventListener('click', () => {
      triggerExport('png');
    });
  }

  function bindButton(id, format) {
    document.getElementById(id)?.addEventListener('click', () => {
      triggerExport(format);
    });
  }

  function triggerExport(format) {
    const palette = _getPalette?.() ?? [];
    if (!palette.length) {
      window.AppToast?.show('請先生成色票後再匯出', 'warning');
      return;
    }

    const canvas  = _getCanvas?.();
    const names   = _getNames?.() ?? [];
    const opts    = _getOpts?.() ?? {};

    // 視覺反饋：按鈕旋轉動畫
    showExportFeedback(format);

    try {
      ExportEngine.exportAs(format, canvas, palette, names, opts);
      window.AppToast?.show(`${format.toUpperCase()} 匯出成功 ✓`, 'success');
    } catch (err) {
      console.error('[ExportUI]', err);
      window.AppToast?.show(`匯出失敗：${err.message}`, 'error');
    }
  }

  function showExportFeedback(format) {
    const btn = document.getElementById(`btn-export-${format}`);
    if (!btn) return;
    btn.classList.add('exporting');
    setTimeout(() => btn.classList.remove('exporting'), 1200);
  }

  // 注入按鈕動畫樣式
  function injectStyles() {
    if (document.getElementById('export-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'export-ui-styles';
    style.textContent = `
      .export-btn.exporting {
        animation: exportPulse 0.6s var(--ease-spring);
      }
      @keyframes exportPulse {
        0%   { transform: scale(1); }
        40%  { transform: scale(0.92); }
        70%  { transform: scale(1.06); }
        100% { transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  return {
    init: (getCanvas, getPalette, getNames, getOpts) => {
      injectStyles();
      init(getCanvas, getPalette, getNames, getOpts);
    },
  };

})();

window.ExportUI = ExportUI;
