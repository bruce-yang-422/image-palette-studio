'use strict';
const AccessibilityPanel=(()=>{
  let palette=[],foreground,background;
  function init() {
    foreground=document.getElementById('contrast-foreground');background=document.getElementById('contrast-background');
    foreground.addEventListener('change',render);background.addEventListener('change',render);
  }
  function update(colors) {
    palette=[...colors];
    [foreground,background].forEach((select,which)=>{
      if(!select) return;
      const selected=select.value||String(which);
      select.replaceChildren();
      palette.forEach((hex,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1} · ${hex.toUpperCase()}`;select.append(option);});
      select.value=String(Math.min(Number(selected),Math.max(0,palette.length-1)));
    });
    render();
  }
  function render() {
    const preview=document.getElementById('contrast-preview'),output=document.getElementById('contrast-result');
    if(!palette.length) { preview.style.color='';preview.style.background='';output.textContent='生成色票後顯示對比值';return; }
    const fg=palette[Number(foreground.value)],bg=palette[Number(background.value)];
    const report=ColorConvert.contrastReport(bg,fg);
    preview.style.color=fg;preview.style.background=bg;
    output.textContent=`${report.ratio.toFixed(2)}:1 · ${report.grade}（一般文字）`;
  }
  return {init,update};
})();
window.AccessibilityPanel=AccessibilityPanel;
