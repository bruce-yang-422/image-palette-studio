/**
 * styles.js
 * 風格色彩引擎 — HSL / Oklch 約束區間定義
 * 概念文件 §3 實作：零外部依賴、純前端毫秒級計算
 * 依賴：color-convert.js, color-math.js
 */

'use strict';

const StyleEngine = (() => {

  // ─────────────────────────────────────────────
  // §3.1 風格色彩空間參數定義表
  // ─────────────────────────────────────────────

  /**
   * 每種風格的 HSL 約束範圍
   * hMin/hMax: 色相範圍 (0-360)
   * sMin/sMax: 飽和度範圍 (0-100)
   * lMin/lMax: 明度範圍 (0-100)
   * hLock: 是否強制鎖定色相（true = 嚴格鎖定）
   * multiLayer: 是否支援多層明度（美拉德）
   */
  const STYLE_PRESETS = {

    /** 無風格 — 保留原始色彩 */
    none: {
      label:   '原始',
      hMin: 0, hMax: 360,
      sMin: 0, sMax: 100,
      lMin: 0, lMax: 100,
    },

    /** 莫蘭迪色 (Morandi) — 低飽和、中高明度、灰度調和 */
    morandi: {
      label:   '莫蘭迪',
      hMin: 0, hMax: 360,    // 全色相
      sMin: 8, sMax: 28,     // 極低飽和
      lMin: 45, lMax: 75,    // 中高明度
      description: '溫潤不刺眼，帶灰度遮罩的義大利畫家色系',
    },

    /** 馬卡龍色 (Macaron) — 粉嫩高明度 */
    macaron: {
      label:   '馬卡龍',
      hMin: 0, hMax: 360,
      sMin: 38, sMax: 65,
      lMin: 78, lMax: 95,    // 極高明度
      description: '明亮、粉嫩、輕盈的高調色盤',
    },

    /** 大地色系 (Earth Tone) — 棕赭卡其 */
    earth: {
      label:   '大地色',
      hMin: 18, hMax: 58,    // 棕→赭→卡其
      sMin: 22, sMax: 58,
      lMin: 28, lMax: 65,
      description: '泥土、枯草與溫暖岩石質感',
    },

    /** 美拉德色 (Maillard) — 焦糖深褐，高對比明暗 */
    maillard: {
      label:   '美拉德',
      hMin: 13, hMax: 42,    // 焦糖→深褐→烤色
      sMin: 38, sMax: 78,
      lMin: 14, lMax: 78,    // 分層：焦黑 ~ 烤黃
      multiLayer: true,
      layerStops: [15, 32, 52, 75],  // 明度分佈錨點
      description: '高對比明暗階梯，模擬烘烤焦糖化層次',
    },

    /** 多巴胺色 (Dopamine) — 極高飽和、高視覺衝擊 */
    dopamine: {
      label:   '多巴胺',
      hMin: 0, hMax: 360,
      sMin: 78, sMax: 100,   // 極高飽和
      lMin: 52, lMax: 80,
      description: '鮮豔刺眼、高視覺衝擊、快樂感',
    },

    /** 薄荷曼波 (Mint Mambo) — 薄荷綠核心配跳色 */
    'mint-mambo': {
      label:   '薄荷曼波',
      hMin: 138, hMax: 178,  // 薄荷綠主色域
      sMin: 38, sMax: 70,
      lMin: 62, lMax: 90,
      accentHue: [45, 15],   // 輔色：鵝黃 & 裸粉的 [hue, ratio]
      description: '清透薄荷綠為核心，搭配低彩度跳色',
    },

    /** 波普色 (Pop Art / Warhol) — 三原色補色、扁平高撞色 */
    'pop-art': {
      label:   '波普',
      hMin: 0, hMax: 360,
      sMin: 88, sMax: 100,   // 純飽和
      lMin: 42, lMax: 62,
      huePool: [0, 60, 120, 180, 240, 300],  // 嚴格從六色環取
      description: '扁平、高撞色、邊界銳利無過渡',
    },

    // ── §3.2 自然與意境風格系 ──────────────────

    /** 森林自然系 (Forestcore / Moss & Sage) */
    forest: {
      label:   '森林系',
      hMin: 72, hMax: 158,   // 鼠尾草→苔蘚→深林墨綠
      sMin: 20, sMax: 65,
      lMin: 22, lMax: 68,
      secondaryHue: { hMin: 25, hMax: 38, sMin: 25, sMax: 45 }, // 樹皮棕輔色
      description: '鼠尾草綠、苔蘚綠、深林墨綠，輔以樹皮棕與清晨霧灰',
    },

    /** 海洋系 (Coastal Grandma / Nautical) */
    ocean: {
      label:   '海洋系',
      hMin: 178, hMax: 232,  // 海水藍→深海靛
      sMin: 28, sMax: 75,
      lMin: 25, lMax: 82,
      secondaryHue: { hMin: 35, hMax: 55, sMin: 15, sMax: 35 }, // 亞麻裸色輔色
      description: '海水藍、深海靛、浪花白，輔以亞麻裸色與海軍藍',
    },

    /** 礦石地質系 (Mineral / Terracotta & Slate) */
    mineral: {
      label:   '礦石系',
      hMin: 13, hMax: 28,    // 赤陶土 Terracotta
      sMin: 38, sMax: 68,
      lMin: 35, lMax: 62,
      secondaryHue: { hMin: 198, hMax: 222, sMin: 5, sMax: 15 }, // 板岩冷灰
      description: '赤陶土色、板岩冷灰、未加工玄武岩層次',
    },
  };

  // ─────────────────────────────────────────────
  // 風格投影函式
  // ─────────────────────────────────────────────

  /**
   * 將單一 HEX 投影至指定風格
   * @param {string} hex 原始 HEX
   * @param {string} styleKey 風格鍵值
   * @param {number} index   色票索引（用於 maillard 多層分佈）
   * @param {number} total   色票總數
   * @param {string|null} accentHex 若有鎖定色，隨機跳色／輔色改以此色相呼應，而非隨機生成
   * @returns {string} 投影後 HEX
   */
  function projectColor(hex, styleKey, index = 0, total = 5, accentHex = null) {
    if (styleKey === 'none') return hex;

    const preset = STYLE_PRESETS[styleKey];
    if (!preset) return hex;

    let hsl = ColorConvert.hexToHsl(hex);
    const accentHue = accentHex ? ColorConvert.hexToHsl(accentHex).h : null;

    // 波普色特殊處理：從六色環鎖定色相
    if (styleKey === 'pop-art' && preset.huePool) {
      const closest = preset.huePool.reduce((a, b) =>
        Math.abs(b - hsl.h) < Math.abs(a - hsl.h) ? b : a
      );
      hsl.h = closest;
    }

    // 薄荷曼波：偶數索引用輔色（鵝黃/裸粉）；有鎖定色時改呼應其色相
    if (styleKey === 'mint-mambo' && index % 3 === 2) {
      hsl.h = accentHue != null ? accentHue : (index % 2 === 0 ? 45 : 18);
      hsl.s = 30 + Math.random() * 15;
      hsl.l = 75 + Math.random() * 10;
      return ColorConvert.hslToHex(hsl.h, hsl.s, hsl.l);
    }

    // 美拉德多層明度分佈
    if (styleKey === 'maillard' && preset.layerStops) {
      const stops = preset.layerStops;
      hsl.l = stops[index % stops.length];
      hsl.h = ColorMath.clampHsl(hsl, preset).h;
      hsl.s = Math.max(preset.sMin, Math.min(preset.sMax, hsl.s));
      return ColorConvert.hslToHex(hsl.h, hsl.s, hsl.l);
    }

    // 森林/海洋/礦石：末尾色票用輔色色相；有鎖定色時改呼應其色相（飽和度/明度仍依風格整體範圍）
    if (preset.secondaryHue && index === total - 1) {
      const sec = preset.secondaryHue;
      if (accentHue != null) {
        hsl.h = accentHue;
        hsl.s = Math.max(preset.sMin, Math.min(preset.sMax, hsl.s));
        hsl.l = Math.max(preset.lMin, Math.min(preset.lMax, hsl.l));
      } else {
        hsl.h = sec.hMin + Math.random() * (sec.hMax - sec.hMin);
        hsl.s = sec.sMin + Math.random() * (sec.sMax - sec.sMin);
        hsl.l = Math.max(preset.lMin, Math.min(preset.lMax, hsl.l));
      }
      return ColorConvert.hslToHex(hsl.h, hsl.s, hsl.l);
    }

    // 通用 Clamp 投影
    const clamped = ColorMath.clampHsl(hsl, preset);
    return ColorConvert.hslToHex(clamped.h, clamped.s, clamped.l);
  }

  /**
   * 將整個色票陣列投影至風格
   * @param {string[]} hexList
   * @param {string} styleKey
   * @param {(string|null)[]} lockedList 對應索引若為 HEX 表示該色票已鎖定（不投影，並作為隨機跳色/輔色的呼應來源）
   * @returns {string[]}
   */
  function projectPalette(hexList, styleKey, lockedList = []) {
    const accentHex = lockedList.find(Boolean) ?? null;
    return hexList.map((hex, i) => {
      if (lockedList[i]) return hex;  // 鎖定的色票不被投影
      return projectColor(hex, styleKey, i, hexList.length, accentHex);
    });
  }

  /**
   * 在指定風格的約束內直接生成隨機色彩
   * @param {string} styleKey
   * @returns {string} HEX
   */
  function randomInStyle(styleKey) {
    const preset = STYLE_PRESETS[styleKey] || STYLE_PRESETS.none;
    let h, s, l;

    if (styleKey === 'pop-art' && preset.huePool) {
      h = preset.huePool[Math.floor(Math.random() * preset.huePool.length)];
    } else {
      h = preset.hMin + Math.random() * (preset.hMax - preset.hMin);
    }

    s = preset.sMin + Math.random() * (preset.sMax - preset.sMin);
    l = preset.lMin + Math.random() * (preset.lMax - preset.lMin);

    return ColorConvert.hslToHex(h, s, l);
  }

  /**
   * 在風格約束內生成 n 色色票（含差異保護）
   * @param {string} styleKey
   * @param {number} count
   * @returns {string[]}
   */
  function generateStylePalette(styleKey, count) {
    if (styleKey === 'none') return ColorMath.randomPalette(count);
    const palette = [];
    let attempts = 0;
    while (palette.length < count && attempts < 1500) {
      attempts++;
      const candidate = randomInStyle(styleKey);
      const tooClose = palette.some(c => ColorMath.deltaE76(c, candidate) < 22);
      if (!tooClose) palette.push(candidate);
    }
    while (palette.length < count) palette.push(randomInStyle(styleKey));
    return palette;
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    STYLE_PRESETS,
    projectColor,
    projectPalette,
    randomInStyle,
    generateStylePalette,

    /** 取得所有風格鍵值列表 */
    getStyleKeys: () => Object.keys(STYLE_PRESETS),

    /** 取得指定風格的顯示名稱 */
    getLabel: (key) => STYLE_PRESETS[key]?.label ?? key,

    /** 取得指定風格的描述 */
    getDescription: (key) => STYLE_PRESETS[key]?.description ?? '',
  };

})();

window.StyleEngine = StyleEngine;
