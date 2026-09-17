const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function context(app = false) {
  const scope = vm.createContext({ console, window: { addEventListener() {} },
    document: { getElementById() { return null; }, addEventListener() {} } });
  for (const file of ['utils/color-convert.js', 'utils/color-math.js', 'core/harmony.js', 'core/styles.js', ...(app ? ['app.js'] : [])]) {
    vm.runInContext(readFileSync(path.join(__dirname, '../js', file), 'utf8'), scope);
  }
  return scope;
}

test('HEX / RGB / HSL parsing accepts supported colors and rejects invalid values', () => {
  const { ColorConvert: c } = context().window;
  for (const [input, expected] of [
    ['#ABC', '#aabbcc'], ['AABBCC', '#aabbcc'], [' rgb(255, 128, 0) ', '#ff8000'],
    ['hsl(480, 100%, 50%)', '#00ff00'], ['hsl(-120deg, 100%, 50%)', '#0000ff'],
  ]) assert.equal(c.parseColor(input), expected);
  for (const input of ['#12345g', 'rgb(256, 0, 0)', 'rgb(-1, 0, 0)', 'hsl(0, 101%, 50%)',
    'hsl(0, 50, 50)', 'rgba(1,2,3,0.5)', '<img src=x>', '']) assert.equal(c.parseColor(input), null);
});

test('every harmony fills 3/4/5/6/8 slots with colors in its hue family', () => {
  const { HarmonyEngine: h, ColorConvert: c } = context().window;
  const distance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const base = '#cc6633';
  const hue = c.hexToHsl(base).h;
  for (const mode of ['analogous', 'complementary', 'split-complementary', 'triadic', 'monochromatic']) {
    for (const count of [3, 4, 5, 6, 8]) {
      const colors = h.generate(base, mode, count);
      assert.equal(colors.length, count);
      for (const hex of colors) {
        assert.match(hex, /^#[\da-f]{6}$/);
        const result = c.hexToHsl(hex);
        if (mode === 'analogous') assert.ok(distance(result.h, hue) <= 31);
        else {
          const offsets = { complementary: [0, 180], 'split-complementary': [0, 150, 210],
            triadic: [0, 120, 240], monochromatic: [0] }[mode];
          assert.ok(offsets.some(offset => distance(result.h, hue + offset) <= 2), `${mode}: ${hex}`);
        }
      }
      if (mode === 'monochromatic') {
        const lightness = colors.map(hex => c.hexToHsl(hex).l);
        assert.ok(lightness.every((l, i) => i === 0 || l > lightness[i - 1]));
      }
    }
  }
});

test('generation preserves locked slots and exact anchors across all algorithms, styles and counts', async () => {
  const scope = context(true);
  vm.runInContext(`updateAllUI = () => {}; AppState.options.genSource = 'scratch';`, scope);
  for (const count of [3, 4, 5, 6, 8]) {
    for (const algorithm of ['chaos', 'harmony']) {
      for (const mode of ['analogous', 'complementary', 'split-complementary', 'triadic', 'monochromatic']) {
        for (const style of scope.window.StyleEngine.getStyleKeys()) {
          await vm.runInContext(`
            AppState.options.swatchCount = ${count};
            AppState.options.genAlgo = '${algorithm}';
            AppState.options.harmonyType = '${mode}';
            AppState.options.stylePreset = '${style}';
            AppState.palette = Array(${count}).fill('#123456');
            AppState.locked = Array(${count}).fill(false);
            AppState.locked[0] = true;
            AppState.locked[${count - 1}] = true;
            AppState.anchors = ['#ff0000'];
            generatePalette();
          `, scope);
          const palette = vm.runInContext('AppState.palette', scope);
          assert.equal(palette.length, count);
          assert.equal(palette[0], '#123456');
          assert.equal(palette[count - 1], '#123456');
          assert.equal(palette[1], '#ff0000');
        }
      }
    }
  }
});

test('style changes restore the original source palette', () => {
  const scope = context(true);
  vm.runInContext(`
    updateAllUI = () => {};
    AppState.basePalette = ['#fe2200', '#2277ff', '#ffbb11'];
    AppState.palette = [...AppState.basePalette];
    AppState.options.genSource = 'image';
    AppState.options.imgPostprocess = 'remap';
    AppState.options.stylePreset = 'morandi';
    applyStyleAndRedraw();
  `, scope);
  assert.notEqual(vm.runInContext('AppState.palette[0]', scope), '#fe2200');
  vm.runInContext(`AppState.options.imgPostprocess = 'raw'; applyStyleAndRedraw();`, scope);
  assert.deepEqual(Array.from(vm.runInContext('AppState.palette', scope)), ['#fe2200', '#2277ff', '#ffbb11']);
});

test('outdated image extraction cannot overwrite a newer scratch palette', async () => {
  const scope = context(true);
  let resolve;
  scope.ExtractionEngine = { extractSamples: () => new Promise(r => { resolve = r; }) };
  vm.runInContext(`updateAllUI = () => {}; AppState.image = {}; AppState.options.genSource = 'image';`, scope);
  const pending = vm.runInContext('generatePalette()', scope);
  await vm.runInContext(`AppState.options.genSource = 'scratch'; generatePalette();`, scope);
  const before = Array.from(vm.runInContext('AppState.palette', scope));
  resolve(['#111111', '#222222', '#333333', '#444444', '#555555']);
  await pending;
  assert.deepEqual(Array.from(vm.runInContext('AppState.palette', scope)), before);
});

test('perceptual distance uses CIELAB; extraction keeps highlights, shadows and source colors', () => {
  const scope = context();
  vm.runInContext(readFileSync(path.join(__dirname, '../js/core/extraction.js'), 'utf8'), scope);
  const { ColorMath: math, ColorConvert: convert, ExtractionEngine: extraction } = scope.window;
  assert.ok(Math.abs(math.deltaE76('#000000','#ffffff') - 100) < .001);
  assert.equal(math.deltaE76('#aabbcc','#aabbcc'), 0);
  const colors = ['#000000','#ffffff','#888888','#cc3322','#2255cc'];
  const pixels = colors.flatMap((hex, i) => Array.from({length:30}, (_, j) => ({...convert.hexToRgb(hex),x:(i+.5)/5,y:(j+.5)/30})));
  const selected = extraction.chooseSamples(pixels,5);
  assert.ok(selected.some(p=>p.hex==='#000000'));
  assert.ok(selected.some(p=>p.hex==='#ffffff'));
  assert.ok(selected.some(p=>p.role==='neutral'));
  assert.ok(selected.every(p=>colors.includes(p.hex)));
  const white = extraction.chooseSamples(pixels.filter(p=>p.r===255),8);
  assert.equal(white.length,8);
  assert.ok(white.every(p=>p.hex==='#ffffff'));
  assert.equal(new Set(white.map(p=>`${p.x},${p.y}`)).size,8);
  assert.throws(()=>extraction.chooseSamples([],5));
  const sampled = extraction.samplePixels({ width:3,height:1,data:new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,0,0,0]) },1);
  assert.equal(sampled.length,2);
});
