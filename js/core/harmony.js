/**
 * harmony.js
 * 經典和諧配色模式引擎
 * 實作：類比色 / 互補色 / 分裂互補色 / 三角色 / 單色調
 * 依賴：color-convert.js, color-math.js
 */

'use strict';

const HarmonyEngine = (() => {

  // ─────────────────────────────────────────────
  // 色相輪算術
  // ─────────────────────────────────────────────

  /** 讓色相值維持在 0-360 範圍 */
  function wrapHue(h) {
    return ((h % 360) + 360) % 360;
  }

  /**
   * 以基準色相生成指定偏移角度的色彩，保留飽和度/明度
   * @param {string} baseHex  基準色 HEX
   * @param {number} offset   色相偏移角度
   * @param {object} [override] 可覆蓋 { s, l }
   * @returns {string} HEX
   */
  function shiftHue(baseHex, offset, override = {}) {
    const { h, s, l } = ColorConvert.hexToHsl(baseHex);
    return ColorConvert.hslToHex(
      wrapHue(h + offset),
      override.s ?? s,
      override.l ?? l
    );
  }

  /**
   * 在飽和度/明度上加入小幅隨機抖動，讓同一基準色每次重生成仍有變化，
   * 同時保留色相與整體和諧關係不變
   * @param {number} s 原飽和度 (0-100)
   * @param {number} l 原明度 (0-100)
   * @param {number} [amount] 抖動幅度（S/L 各自的 ± 範圍，預設 8）
   * @returns {{ s:number, l:number }}
   */
  function jitterSL(s, l, amount = 8) {
    const jitter = () => (Math.random() - 0.5) * 2 * amount;
    return {
      s: Math.max(10, Math.min(95, s + jitter())),
      l: Math.max(15, Math.min(92, l + jitter())),
    };
  }

  // ─────────────────────────────────────────────
  // 四種和諧模式生成器
  // ─────────────────────────────────────────────

  /**
   * 類比色 Analogous
   * 以基準色為中心，所有色相限制於 ±30°
   * @param {string} baseHex
   * @param {number} count
   * @returns {string[]}
   */
  function analogous(baseHex, count = 5) {
    const offsets = Array.from({ length: count }, (_, i) =>
      count === 1 ? 0 : -30 + 60 * i / (count - 1));
    const { s, l } = ColorConvert.hexToHsl(baseHex);
    return offsets.map(offset => shiftHue(baseHex, offset, jitterSL(s, l)));
  }

  /**
   * 互補色 Complementary
   * 基準色 + 對面 180° + 各自明度/飽和度變體
   * @param {string} baseHex
   * @param {number} count
   * @returns {string[]}
   */
  function complementary(baseHex, count = 5) {
    return hueFamily(baseHex, [0, 180], count);
  }

  /**
   * 分裂互補色 Split-Complementary
   * 基準色 + 互補色兩側 ±30°
   * @param {string} baseHex
   * @param {number} count
   * @returns {string[]}
   */
  function splitComplementary(baseHex, count = 5) {
    return hueFamily(baseHex, [0, 150, 210], count);
  }

  // 循環同一組調和色相，以明暗變體補滿，避免多色模式混入無關隨機色。
  function hueFamily(baseHex, offsets, count) {
    const { s, l } = ColorConvert.hexToHsl(baseHex);
    return Array.from({ length: count }, (_, i) => {
      const level = Math.floor(i / offsets.length);
      const delta = level === 0 ? 0 : (level % 2 ? -1 : 1) * Math.ceil(level / 2) * 12;
      return shiftHue(baseHex, offsets[i % offsets.length], jitterSL(s, l + delta));
    });
  }

  /** 固定色相與飽和度，依明度階梯等距展開。 */
  function monochromatic(baseHex, count = 5) {
    const { h, s, l } = ColorConvert.hexToHsl(baseHex);
    return Array.from({ length: count }, (_, i) =>
      ColorConvert.hslToHex(h, s, count === 1 ? l : 15 + 75 * i / (count - 1)));
  }

  /**
   * 三角色 Triadic
   * 色相輪三等分（0°, +120°, +240°）
   * @param {string} baseHex
   * @param {number} count
   * @returns {string[]}
   */
  function triadic(baseHex, count = 5) {
    const base = ColorConvert.hexToHsl(baseHex);
    const hues = [0, 120, 240].map(o => wrapHue(base.h + o));
    const result = [];
    const lMap = [-10, 0, 10, -15, 15];
    // 循環生成 count 個
    for (let i = 0; i < count; i++) {
      const h = hues[i % 3];
      const l = base.l + (lMap[i] ?? 0);
      const j = jitterSL(base.s, l);
      result.push(ColorConvert.hslToHex(h, j.s, j.l));
    }
    return result;
  }

  // ─────────────────────────────────────────────
  // 統一入口
  // ─────────────────────────────────────────────

  /**
   * 根據和諧模式生成色票
   * @param {string} baseHex   基準色（或從 App 狀態取得的第一個非鎖定色）
   * @param {string} mode      'analogous'|'complementary'|'split-complementary'|'triadic'
   * @param {number} count     色票數量
   * @returns {string[]}
   */
  function generate(baseHex, mode, count = 5) {
    // 若 baseHex 未提供，生成隨機安全色
    if (!baseHex) baseHex = ColorMath.randomSafeHex();

    switch (mode) {
      case 'analogous':            return analogous(baseHex, count);
      case 'complementary':        return complementary(baseHex, count);
      case 'split-complementary':  return splitComplementary(baseHex, count);
      case 'triadic':              return triadic(baseHex, count);
      case 'monochromatic':        return monochromatic(baseHex, count);
      default:
        console.warn(`[HarmonyEngine] 未知模式 "${mode}"，回退至 analogous`);
        return analogous(baseHex, count);
    }
  }

  /**
   * 重新生成「未鎖定」的色票，保留已鎖定色票
   * @param {string[]} currentHexList 當前色票 HEX 陣列
   * @param {boolean[]} lockedFlags   對應索引是否鎖定
   * @param {string} mode
   * @returns {string[]}
   */
  function regenerateUnlocked(currentHexList, lockedFlags, mode) {
    // 找到第一個未鎖定的色票作為基準色
    const firstUnlocked = currentHexList.find((_, i) => !lockedFlags[i]);
    const base = firstUnlocked ?? ColorMath.randomSafeHex();
    const freshPalette = generate(base, mode, currentHexList.length);

    return currentHexList.map((hex, i) =>
      lockedFlags[i] ? hex : freshPalette[i]
    );
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    generate,
    regenerateUnlocked,
    analogous,
    complementary,
    splitComplementary,
    triadic,
    monochromatic,
  };

})();

window.HarmonyEngine = HarmonyEngine;
