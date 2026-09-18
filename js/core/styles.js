'use strict';

// Oklch style projection with hue-preserving sRGB gamut mapping.
const StyleEngine = (() => {
  const STYLE_PRESETS = {
  "none": {
    "label": "原始",
    "description": ""
  },
  "morandi": {
    "label": "莫蘭迪",
    "description": "溫潤不刺眼，帶灰度遮罩的義大利畫家色系"
  },
  "macaron": {
    "label": "馬卡龍",
    "description": "明亮、粉嫩、輕盈的高調色盤"
  },
  "earth": {
    "label": "大地色",
    "description": "泥土、枯草與溫暖岩石質感"
  },
  "maillard": {
    "label": "美拉德",
    "description": "高對比明暗階梯，模擬烘烤焦糖化層次"
  },
  "dopamine": {
    "label": "多巴胺",
    "description": "鮮豔刺眼、高視覺衝擊、快樂感"
  },
  "mint-mambo": {
    "label": "薄荷曼波",
    "description": "清透薄荷綠為核心，搭配低彩度跳色"
  },
  "pop-art": {
    "label": "波普",
    "description": "扁平、高撞色、邊界銳利無過渡"
  },
  "forest": {
    "label": "森林系",
    "description": "鼠尾草綠、苔蘚綠、深林墨綠，輔以樹皮棕與清晨霧灰"
  },
  "ocean": {
    "label": "海洋系",
    "description": "海水藍、深海靛、浪花白，輔以亞麻裸色與海軍藍"
  },
  "mineral": {
    "label": "礦石系",
    "description": "赤陶土色、板岩冷灰、未加工玄武岩層次"
  }
};

  // Perceptual profiles use Oklch L and C, not percentages of HSL saturation.
  const OKLCH_PROFILES = {
    morandi: {L:[.55,.8], C:[.02,.07]}, macaron: {L:[.85,.96], C:[.04,.1]},
    earth: {L:[.4,.72], C:[.04,.13], H:[40,85]},
    maillard: {L:[.28,.82], C:[.05,.16], H:[35,75]},
    dopamine: {L:[.65,.85], C:[.18,.3]},
    'mint-mambo': {L:[.76,.92], C:[.06,.14], H:[150,175]},
    'pop-art': {L:[.55,.8], C:[.2,.32]},
    forest: {L:[.35,.73], C:[.035,.13], H:[110,160]},
    ocean: {L:[.4,.85], C:[.05,.16], H:[210,265]},
    mineral: {L:[.45,.73], C:[.04,.12], H:[30,60]},
  };
  const bounded = (v, range) => Math.max(range[0],Math.min(range[1],v));
  function projectColor(hex, styleKey, index = 0, total = 5, accentHex = null) {
    const profile = OKLCH_PROFILES[styleKey];
    if (!profile) return hex;
    let {L,C,h} = ColorConvert.hexToAllFormats(hex).oklch;
    L = bounded(L,profile.L); C = bounded(C,profile.C);
    if (profile.H) h = bounded(h,profile.H);
    if (styleKey === 'pop-art') {
      const distance = a => Math.abs(((a-h+540)%360)-180);
      h = [25,90,145,195,265,325].reduce((a,b)=>distance(a)<distance(b)?a:b);
    }
    if (styleKey === 'maillard') L = [.28,.45,.63,.82][index%4];
    const accent = accentHex ? ColorConvert.hexToAllFormats(accentHex).oklch.h : null;
    if (styleKey === 'mint-mambo' && index%3 === 2) {
      h = accent ?? (index%2 ? 25 : 90); L = .86; C = .07;
    }
    if (['forest','ocean','mineral'].includes(styleKey) && index === total-1) {
      h = accent ?? {forest:65,ocean:85,mineral:245}[styleKey];
      C = styleKey === 'mineral' ? .025 : .055;
    }
    return ColorConvert.oklchToHex(L,C,h);
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

  function roles(count) {
    return Array.from({length:count}, (_,i) => ({
      name:i===0?'主底色':i===count-1?'點睛色':i===1?'次要色':'中性色',
      weight:i===0?.6:i===count-1?.1:.3/(count-2),
    }));
  }
  function assignRoles(palette, styleKey = 'none') {
    const profile = OKLCH_PROFILES[styleKey];
    return palette.map((hex,i) => {
      let {L,C,h} = ColorConvert.hexToAllFormats(hex).oklch;
      if (i===0) { L=.92; C=Math.min(C,.035); }
      else if (i===palette.length-1) { L=.62; C=Math.max(C,.18); }
      else if (i===1) { L=.55; C=Math.min(C,.12); }
      else { L=.65+.15*(i-2)/Math.max(1,palette.length-3); C=Math.min(C,.045); }
      if (profile) { L=bounded(L,profile.L); C=bounded(C,profile.C); }
      return ColorConvert.oklchToHex(L,C,h);
    });
  }

  /**
   * 在指定風格的約束內直接生成隨機色彩
   * @param {string} styleKey
   * @returns {string} HEX
   */
  function randomInStyle(styleKey) {
    const profile = OKLCH_PROFILES[styleKey];
    if (!profile) return ColorMath.randomSafeHex();
    const between = range => range[0]+Math.random()*(range[1]-range[0]);
    return ColorConvert.oklchToHex(between(profile.L),between(profile.C),between(profile.H || [0,360]));
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

  /** 單一顏色是否已經接近這個風格會把它變成的樣子（幾乎不用改） */
  const STYLE_MATCH_TOLERANCE = 20; // Product compatibility threshold, not a just-noticeable-difference claim

  function matchesStyle(hex, styleKey) {
    if (styleKey === 'none') return true;
    const preset = STYLE_PRESETS[styleKey];
    if (!preset) return true;
    const projected = projectColor(hex, styleKey);
    return ColorMath.deltaE76(hex, projected) <= STYLE_MATCH_TOLERANCE;
  }

  /**
   * 風格是否跟目前的固定色（錨點色／鎖定色，這些顏色不會被風格投影）相容。
   * 只要有一個固定色跟這個風格差太多，套用後就會顯得格格不入，因此要求全部通過。
   * @param {string} styleKey
   * @param {string[]} fixedHexes 目前不受投影影響的顏色（錨點色、鎖定色）
   */
  function isCompatibleWithFixedColors(styleKey, fixedHexes = []) {
    return fixedHexes.every(hex => matchesStyle(hex, styleKey));
  }

  const CONTRAST_MIN = { AA: 4.5, AAA: 7 };

  /**
   * 在風格的 Oklch 明度邊界內（不動色相／彩度），二分搜尋調整 hex 的明度，
   * 使其與 against 的 WCAG 對比達到 targetRatio。找不到就回傳邊界內能達到的最佳結果。
   * @returns {{hex:string, ratio:number}}
   */
  function adjustLightnessForContrast(hex, against, targetRatio, styleKey = 'none') {
    const profile = OKLCH_PROFILES[styleKey];
    const [lo, hi] = profile ? profile.L : [0, 1];
    const { C, h } = ColorConvert.hexToAllFormats(hex).oklch;
    const ratioAt = L => ColorConvert.contrastRatio(ColorConvert.oklchToHex(L, C, h), against);
    const darker = ratioAt(lo), lighter = ratioAt(hi);
    const goLighter = lighter >= darker;
    let target = goLighter ? hi : lo;
    if (ratioAt(target) < targetRatio) {
      // 邊界內無法達標，取較好的一端
      const bestL = goLighter ? hi : lo;
      const bestHex = ColorConvert.oklchToHex(bestL, C, h);
      return { hex: bestHex, ratio: ratioAt(bestL) };
    }
    let a = goLighter ? lo : hi, b = target;
    for (let i = 0; i < 24; i++) {
      const mid = (a + b) / 2;
      if (ratioAt(mid) >= targetRatio) b = mid; else a = mid;
    }
    const resultHex = ColorConvert.oklchToHex(b, C, h);
    return { hex: resultHex, ratio: ratioAt(b) };
  }

  /**
   * 風格是否可能讓兩個固定色相（不可調整的鎖定/錨點槽）達到鎖定的對比等級。
   * 若其中一槽仍可調整（非固定），一律視為可達標（由 adjustLightnessForContrast 負責調整），
   * 只有「兩槽都固定」時才需要事先判斷是否無解。
   * @param {string} level 'AA' | 'AAA'
   */
  function canReachContrastLock(styleKey, hexA, hexB, level, aFixed, bFixed) {
    const target = CONTRAST_MIN[level];
    if (!target) return true;
    if (aFixed && bFixed) return ColorConvert.contrastRatio(hexA, hexB) >= target;
    const profile = OKLCH_PROFILES[styleKey];
    const [lo, hi] = profile ? profile.L : [0, 1];
    if (aFixed) {
      const { C, h } = ColorConvert.hexToAllFormats(hexB).oklch;
      const best = Math.max(
        ColorConvert.contrastRatio(ColorConvert.oklchToHex(lo, C, h), hexA),
        ColorConvert.contrastRatio(ColorConvert.oklchToHex(hi, C, h), hexA)
      );
      return best >= target;
    }
    if (bFixed) {
      const { C, h } = ColorConvert.hexToAllFormats(hexA).oklch;
      const best = Math.max(
        ColorConvert.contrastRatio(ColorConvert.oklchToHex(lo, C, h), hexB),
        ColorConvert.contrastRatio(ColorConvert.oklchToHex(hi, C, h), hexB)
      );
      return best >= target;
    }
    // 兩槽都可調整：把其中一槽推到亮端、另一槽推到暗端（各自維持自己的 C/h），取理論最大對比
    const oklchA = ColorConvert.hexToAllFormats(hexA).oklch;
    const oklchB = ColorConvert.hexToAllFormats(hexB).oklch;
    const lightHex = ColorConvert.oklchToHex(hi, oklchA.C, oklchA.h);
    const darkHex = ColorConvert.oklchToHex(lo, oklchB.C, oklchB.h);
    return ColorConvert.contrastRatio(lightHex, darkHex) >= target;
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    STYLE_PRESETS,
    OKLCH_PROFILES,
    roles,
    assignRoles,
    projectColor,
    projectPalette,
    randomInStyle,
    generateStylePalette,
    matchesStyle,
    isCompatibleWithFixedColors,
    adjustLightnessForContrast,
    canReachContrastLock,

    /** 取得所有風格鍵值列表 */
    getStyleKeys: () => Object.keys(STYLE_PRESETS),

    /** 取得指定風格的顯示名稱 */
    getLabel: (key) => STYLE_PRESETS[key]?.label ?? key,

    /** 取得指定風格的描述 */
    getDescription: (key) => STYLE_PRESETS[key]?.description ?? '',
  };

})();

window.StyleEngine = StyleEngine;
