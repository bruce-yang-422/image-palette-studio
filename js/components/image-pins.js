'use strict';

const ImagePins = (() => {
  let state, onPick, onSelect, source, stage, layer, loupe, ctx, image;
  let dragging = null;
  let sampleSize = 3;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function init(callbacks) {
    ({ getState: state, onPick, onSelect } = callbacks);
    source = document.getElementById('source-canvas');
    stage = document.getElementById('pin-stage');
    layer = document.getElementById('sample-pins');
    loupe = document.getElementById('sample-loupe');
    ctx = source.getContext('2d', { willReadFrequently: true });
    source.addEventListener('click', event => {
      if (event.button !== 0) return;
      move(state().selectedSlot, pointAt(event));
    });
    document.getElementById('sample-size').addEventListener('change', event => {
      sampleSize = Number(event.target.value);
      const pin = state().pins[state().selectedSlot];
      if (pin) move(state().selectedSlot, pin);
    });
    new ResizeObserver(fit).observe(document.getElementById('image-picker'));
    const screenButton = document.getElementById('btn-screen-picker');
    screenButton.disabled = !('EyeDropper' in window);
    document.getElementById('screen-picker-hint').textContent = screenButton.disabled
      ? '此瀏覽器不支援螢幕滴管；可直接點擊原圖或拖曳錨點取色。'
      : '螢幕滴管套用至選取槽位；外部色會保留至下次移動該錨點。';
    screenButton.addEventListener('click', async () => {
      const s = state(), index = s.selectedSlot, originalImage = s.image;
      if (!s.pins[index] || s.locked[index]) return window.AppToast.show('請先選取並解鎖色槽', 'warning');
      try {
        const result = await new window.EyeDropper().open();
        if (state().genSource !== 'image' || state().image !== originalImage || !state().pins[index] || state().locked[index]) return;
        onPick(index, { ...state().pins[index], hex: result.sRGBHex.toLowerCase(), external: true });
      } catch (error) {
        if (error.name !== 'AbortError') window.AppToast.show('螢幕滴管無法啟用，請使用圖片錨點', 'warning');
      }
    });
  }

  function setImage(img) {
    if (!source || img === image) return;
    image = img;
    dragging = null;
    loupe.hidden = true;
    source.width = img?.naturalWidth || 1;
    source.height = img?.naturalHeight || 1;
    if (img) ctx.drawImage(img, 0, 0);
    fit();
  }

  function fit() {
    if (!stage || !image) return;
    const available = stage.parentElement.clientWidth - 32;
    stage.style.width = `${Math.max(1, Math.min(available, 340 * source.width / source.height))}px`;
  }

  function sample(point) {
    if (!image) return null;
    const x = clamp(Math.floor(point.x * source.width), 0, source.width - 1);
    const y = clamp(Math.floor(point.y * source.height), 0, source.height - 1);
    const half = Math.floor(sampleSize / 2);
    const left = Math.max(0, x-half), top = Math.max(0, y-half);
    const width = Math.min(source.width-1, x+half)-left+1;
    const height = Math.min(source.height-1, y+half)-top+1;
    const pixels = ctx.getImageData(left, top, width, height).data;
    let r=0, g=0, b=0, weight=0;
    for (let i=0; i<pixels.length; i+=4) {
      const a = pixels[i+3]/255;
      r+=pixels[i]*a; g+=pixels[i+1]*a; b+=pixels[i+2]*a; weight+=a;
    }
    return weight ? ColorConvert.rgbToHex(r/weight, g/weight, b/weight) : null;
  }

  function pointAt(event) {
    const rect = source.getBoundingClientRect();
    return { x: clamp((event.clientX-rect.left)/rect.width, 0, 1), y: clamp((event.clientY-rect.top)/rect.height, 0, 1) };
  }

  function move(index, point) {
    const s = state();
    if (s.genSource !== 'image' || !s.pins[index] || s.locked[index]) return;
    const hex = sample(point);
    if (!hex) return;
    onPick(index, { ...s.pins[index], x: point.x, y: point.y, hex, external: false });
    return hex;
  }

  function showLoupe(point, hex) {
    const canvas = loupe.querySelector('canvas'), context = canvas.getContext('2d');
    const x = clamp(Math.floor(point.x * source.width), 0, source.width-1);
    const y = clamp(Math.floor(point.y * source.height), 0, source.height-1);
    context.clearRect(0, 0, 100, 100);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, x-5, y-5, 11, 11, 0, 0, 100, 100);
    context.strokeStyle = '#fff'; context.lineWidth = 3; context.strokeRect(45,45,10,10);
    context.strokeStyle = '#000'; context.lineWidth = 1; context.strokeRect(45,45,10,10);
    loupe.querySelector('output').textContent = hex?.toUpperCase() || '透明像素';
    loupe.style.left = `${clamp(point.x * stage.clientWidth - 54, 0, Math.max(0,stage.clientWidth-110))}px`;
    const below = point.y * stage.clientHeight + 48;
    loupe.style.top = `${below + 130 <= stage.clientHeight ? below : Math.max(0,point.y * stage.clientHeight - 150)}px`;
    loupe.hidden = false;
  }

  function createPin(index) {
    const button = document.createElement('button');
    button.className = 'sample-pin';
    button.dataset.index = index;
    button.textContent = index+1;
    button.addEventListener('click', () => onSelect(index));
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      onSelect(index);
      if (state().locked[index]) return;
      dragging = { index, id: event.pointerId };
      button.setPointerCapture(event.pointerId);
      showLoupe(state().pins[index], state().pins[index].hex);
    });
    button.addEventListener('pointermove', event => {
      if (dragging?.index !== index || dragging.id !== event.pointerId) return;
      const point = pointAt(event);
      const hex = move(index, point);
      showLoupe(point, hex);
    });
    const end = () => { dragging = null; loupe.hidden = true; };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
    button.addEventListener('keydown', event => {
      const directions = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
      if (!directions[event.key]) return;
      event.preventDefault();
      const pin = state().pins[index], [dx,dy] = directions[event.key];
      const step = event.shiftKey ? 10 : 1;
      onSelect(index);
      move(index, { x:clamp(pin.x+dx*step/source.width,0,1), y:clamp(pin.y+dy*step/source.height,0,1) });
    });
    return button;
  }

  function sync() {
    if (!source) return;
    const s = state();
    const visible = s.genSource === 'image' && !!s.image;
    document.getElementById('image-picker').hidden = !visible;
    if (!visible) { dragging = null; loupe.hidden = true; return; }
    setImage(s.image);
    while (layer.children.length > s.pins.length) layer.lastChild.remove();
    while (layer.children.length < s.pins.length) layer.appendChild(createPin(layer.children.length));
    [...layer.children].forEach((button, i) => {
      const pin = s.pins[i];
      // Show the actual output color (after any style projection), not the raw
      // sampled pixel, so the pin matches what the swatch panel displays.
      const displayHex = s.palette?.[i] || pin.hex;
      button.style.left = `${pin.x*100}%`; button.style.top = `${pin.y*100}%`;
      button.style.background = displayHex;
      button.style.color = ColorConvert.contrastColor(displayHex);
      button.dataset.hex = displayHex.toUpperCase();
      button.setAttribute('aria-label', `取色錨點 ${i+1} ${displayHex}${s.locked[i] ? ' 已鎖定' : ''}`);
      button.setAttribute('aria-pressed', String(s.selectedSlot === i));
      button.title = `${pin.external ? '外部取色' : '原圖取色'} ${i+1}: ${displayHex}；方向鍵微調，Shift 加速`;
    });
    document.getElementById('pin-selection').textContent = `選取色槽 ${s.selectedSlot+1}${s.locked[s.selectedSlot] ? '（已鎖定）' : ''}`;
    fit();
  }
  return { init, setImage, sample, sync };
})();
window.ImagePins = ImagePins;
