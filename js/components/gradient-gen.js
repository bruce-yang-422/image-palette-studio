/**
 * gradient-gen.js
 * 漸層生成器元件
 * 從色票生成 Linear / Radial CSS 漸層並即時預覽
 * 依賴：color-convert.js
 */

'use strict';

const GradientGen = (() => {

  let _palette = [];
  let _type = 'linear'; // 'linear' | 'radial'

  let gradientBar, gradientCode, copyBtn;

  function init() {
    gradientBar  = document.getElementById('gradient-bar');
    gradientCode = document.getElementById('gradient-code');
    copyBtn      = document.getElementById('btn-copy-gradient');

    // 漸層類型切換
    document.querySelectorAll('input[name="gradient-type"]').forEach(radio => {
      radio.addEventListener('change', e => {
        if (e.target.checked) {
          _type = e.target.value;
          update(_palette);
        }
      });
    });

    // 複製 CSS 程式碼
    copyBtn?.addEventListener('click', () => {
      const code = gradientCode?.textContent?.trim();
      if (!code || code.startsWith('/*')) return;
      navigator.clipboard.writeText(code).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = '✓ 已複製';
        copyBtn.style.color = 'var(--clr-success)';
        setTimeout(() => {
          copyBtn.textContent = original;
          copyBtn.style.color = '';
        }, 1500);
      });
    });
  }

  /**
   * 以新色票更新漸層預覽
   * @param {string[]} palette HEX 陣列
   */
  function update(palette) {
    _palette = [...palette];
    if (!palette.length) return;

    const css = buildGradientCss(palette, _type);

    if (gradientBar) gradientBar.style.background = css;
    if (gradientCode) gradientCode.textContent = buildCssBlock(palette, _type);
  }

  // ─────────────────────────────────────────────
  // CSS 生成
  // ─────────────────────────────────────────────

  /**
   * 生成 CSS 漸層值（不含屬性名）
   * @param {string[]} palette
   * @param {'linear'|'radial'} type
   * @returns {string}
   */
  function buildGradientCss(palette, type) {
    const stops = palette.map((hex, i) => {
      const pct = Math.round((i / (palette.length - 1)) * 100);
      return `${hex} ${pct}%`;
    }).join(', ');

    if (type === 'radial') {
      return `radial-gradient(circle at center, ${stops})`;
    }
    return `linear-gradient(90deg, ${stops})`;
  }

  /**
   * 生成完整的 CSS 程式碼區塊（含多行 fallback）
   */
  function buildCssBlock(palette, type) {
    const stops = palette.map((hex, i) => {
      const pct = Math.round((i / (palette.length - 1)) * 100);
      return `  ${hex} ${pct}%`;
    }).join(',\n');

    if (type === 'radial') {
      return `background: radial-gradient(\n  circle at center,\n${stops}\n);`;
    }
    return `background: linear-gradient(\n  90deg,\n${stops}\n);`;
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    init,
    update,
    buildGradientCss,
    buildCssBlock,
    getType: () => _type,
  };

})();

window.GradientGen = GradientGen;
