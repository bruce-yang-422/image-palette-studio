'use strict';
const AccessibilityPanel=(()=>{
  let palette=[];
  let mode='auto'; // 'auto' | 'manual'
  let fgIndex=0,bgIndex=1;
  let fgBtn,bgBtn,fgMenu,bgMenu;
  let lockLevel='none'; // 'none' | 'AA' | 'AAA'
  let onLockChange=null;

  function init() {
    fgBtn=document.getElementById('contrast-foreground');
    bgBtn=document.getElementById('contrast-background');
    fgMenu=document.getElementById('contrast-foreground-menu');
    bgMenu=document.getElementById('contrast-background-menu');

    fgBtn?.addEventListener('click',e=>{e.stopPropagation();toggleMenu(fgMenu,fgBtn);});
    bgBtn?.addEventListener('click',e=>{e.stopPropagation();toggleMenu(bgMenu,bgBtn);});
    document.addEventListener('click',closeAllMenus);

    document.querySelectorAll('input[name="contrast-mode"]').forEach(radio=>{
      radio.addEventListener('change',e=>{
        if(!e.target.checked) return;
        mode=e.target.value;
        document.querySelectorAll('input[name="contrast-mode"]').forEach(r=>{
          r.closest('.chip')?.classList.toggle('active',r===e.target);
        });
        updateControlsState();
        if(mode==='auto') autoPick();
        render();
      });
    });

    document.querySelectorAll('input[name="contrast-lock"]').forEach(radio=>{
      radio.addEventListener('change',e=>{
        if(!e.target.checked) return;
        lockLevel=e.target.value;
        document.querySelectorAll('input[name="contrast-lock"]').forEach(r=>{
          r.closest('.chip')?.classList.toggle('active',r===e.target);
        });
        onLockChange?.(lockLevel);
      });
    });
  }

  /** 註冊「鎖定等級變更」回呼，讓 app.js 在使用者切換鎖定時重新生成／套用色票。 */
  function setLockChangeHandler(fn) { onLockChange=fn; }

  function getLockLevel() { return lockLevel; }

  /**
   * 依目前色票挑出「自動配對規則」會選中的兩個槽位索引（色差最大的兩色，較深者為前景）。
   * 供 app.js 在鎖定對比等級時，判斷／調整這兩槽以達到門檻，維持跟面板實際顯示一致的配對規則。
   */
  function pickAutoPairIndexes(colors) {
    if(!colors || colors.length<2) return null;
    let best=-1,fg=0,bg=1;
    for(let i=0;i<colors.length;i++) {
      for(let j=i+1;j<colors.length;j++) {
        const d=ColorMath.deltaE76(colors[i],colors[j]);
        if(d>best) { best=d; fg=i; bg=j; }
      }
    }
    if(ColorConvert.hexToHsl(colors[fg]).l>ColorConvert.hexToHsl(colors[bg]).l) [fg,bg]=[bg,fg];
    return {fgIndex:fg,bgIndex:bg};
  }

  function toggleMenu(menu,btn) {
    if(btn?.disabled) return;
    const isOpen=!menu.hidden;
    closeAllMenus();
    if(!isOpen) { menu.hidden=false; btn.setAttribute('aria-expanded','true'); }
  }
  function closeAllMenus() {
    [[fgMenu,fgBtn],[bgMenu,bgBtn]].forEach(([menu,btn])=>{
      if(menu) menu.hidden=true;
      btn?.setAttribute('aria-expanded','false');
    });
  }

  function updateControlsState() {
    const disabled=mode==='auto';
    [fgBtn,bgBtn].forEach(btn=>{ if(btn) btn.disabled=disabled; });
  }

  function buildMenu(menu,activeIndex,onPick) {
    if(!menu) return;
    menu.replaceChildren();
    palette.forEach((hex,i)=>{
      const item=document.createElement('button');
      item.type='button';
      item.className='dropdown-item swatch-select-item'+(i===activeIndex?' active':'');
      item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(i===activeIndex));
      const dot=document.createElement('span');
      dot.className='swatch-select-dot';
      dot.style.background=hex;
      const label=document.createElement('span');
      label.textContent=`${i+1} · ${hex.toUpperCase()}`;
      item.append(dot,label);
      item.addEventListener('click',()=>{ onPick(i); closeAllMenus(); });
      menu.append(item);
    });
  }

  function updateButtonPreview(btn,index) {
    if(!btn) return;
    const hex=palette[index];
    const dot=btn.querySelector('.swatch-select-dot'),label=btn.querySelector('.swatch-select-label');
    if(dot) dot.style.background=hex||'transparent';
    if(label) label.textContent=hex?`${index+1} · ${hex.toUpperCase()}`:'—';
  }

  /** 自動挑選色票中 CIE76 ΔE 最大的兩色，較深的一色當前景（文字）。 */
  function autoPick() {
    if(!palette.length) return;
    if(palette.length<2) { fgIndex=0;bgIndex=0; return; }
    let best=-1;
    for(let i=0;i<palette.length;i++) {
      for(let j=i+1;j<palette.length;j++) {
        const d=ColorMath.deltaE76(palette[i],palette[j]);
        if(d>best) { best=d; fgIndex=i; bgIndex=j; }
      }
    }
    if(ColorConvert.hexToHsl(palette[fgIndex]).l>ColorConvert.hexToHsl(palette[bgIndex]).l) {
      [fgIndex,bgIndex]=[bgIndex,fgIndex];
    }
  }

  function update(colors) {
    palette=[...colors];
    if(!palette.length) { render(); return; }
    fgIndex=Math.min(fgIndex,palette.length-1);
    bgIndex=Math.min(bgIndex,palette.length-1);
    if(mode==='auto') autoPick();
    buildMenu(fgMenu,fgIndex,i=>{ fgIndex=i; updateButtonPreview(fgBtn,fgIndex); render(); });
    buildMenu(bgMenu,bgIndex,i=>{ bgIndex=i; updateButtonPreview(bgBtn,bgIndex); render(); });
    updateButtonPreview(fgBtn,fgIndex);
    updateButtonPreview(bgBtn,bgIndex);
    updateControlsState();
    render();
  }

  function render() {
    const preview=document.getElementById('contrast-preview'),output=document.getElementById('contrast-result');
    if(!palette.length) { preview.style.color='';preview.style.background='';output.textContent='生成色票後顯示對比值';return; }
    const fg=palette[fgIndex],bg=palette[bgIndex];
    const report=ColorConvert.contrastReport(bg,fg);
    preview.style.color=fg;preview.style.background=bg;
    const lockNote=mode==='auto' && lockLevel!=='none' ? ` · 已鎖定 ${lockLevel}` : '';
    output.textContent=`${report.ratio.toFixed(2)}:1 · ${report.grade}（一般文字）${lockNote}`;
  }
  return {init,update,setLockChangeHandler,getLockLevel,pickAutoPairIndexes};
})();
window.AccessibilityPanel=AccessibilityPanel;
