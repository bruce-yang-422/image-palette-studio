'use strict';

const LayoutGallery = (() => {
  let getState,onChange,grid,ratio,output,count,labels;
  const placeholder=document.createElement('canvas');
  placeholder.width=400;placeholder.height=300;
  const ctx=placeholder.getContext('2d');ctx.fillStyle='#a0a7b5';ctx.fillRect(0,0,400,300);
  ctx.fillStyle='#c3c9d3';ctx.beginPath();ctx.moveTo(0,260);ctx.lineTo(130,80);ctx.lineTo(260,260);ctx.fill();
  function init(callbacks) {
    ({getState,onChange}=callbacks);
    grid=document.getElementById('layout-preset-group');ratio=document.getElementById('swatch-ratio');
    output=document.getElementById('swatch-ratio-value');count=document.getElementById('layout-count');labels=document.getElementById('callout-labels');
    for(const [key,layout] of Object.entries(CanvasRenderer.LAYOUTS)) {
      const label=document.createElement('label');label.className='layout-chip';
      const input=document.createElement('input');input.type='radio';input.name='swatch-layout';input.value=key;input.setAttribute('aria-label',layout.name);
      const thumb=document.createElement('canvas');thumb.className='layout-thumbnail';thumb.setAttribute('aria-hidden','true');
      const title=document.createElement('span');title.className='lp-label';title.textContent=layout.name;
      label.append(input,thumb,title);grid.appendChild(label);
      input.addEventListener('change',()=>{if(input.checked) onChange({swatchLayout:key,swatchRatio:layout.ratio});});
    }
    ratio.addEventListener('input',()=>onChange({swatchRatio:Number(ratio.value)}));
    count.addEventListener('change',()=>{
      const radio=document.querySelector(`input[name="swatch-count"][value="${count.value}"]`);
      radio.checked=true;radio.dispatchEvent(new Event('change'));
    });
  }
  function sync() {
    if(!grid) return;
    const {options,palette}=getState(),layout=CanvasRenderer.getLayout(options),n=options.swatchCount;
    count.value=n;ratio.min=layout.min;ratio.max=layout.max;ratio.value=layout.ratio;
    ratio.setAttribute('aria-valuetext',`${layout.ratio}% ${layout.axis}`);
    output.textContent=`${layout.ratio}%（${layout.axis}）`;
    document.getElementById('layout-count-summary').textContent=`${n} 色 · ${Object.keys(CanvasRenderer.LAYOUTS).length} 款版型`;
    const colors=Array.from({length:n},(_,i)=>palette[i]||['#d37064','#e7c780','#9aa780','#749caa','#887b9e'][i%5]);
    grid.querySelectorAll('.layout-chip').forEach(label=>{
      const radio=label.querySelector('input'),selected=radio.value===layout.key;
      radio.checked=selected;label.classList.toggle('active',selected);
      const definition=CanvasRenderer.LAYOUTS[radio.value];
      label.title=`${definition.name} · ${n} 色 · 色票${definition.axis} ${selected?layout.ratio:definition.ratio}%（${definition.min}–${definition.max}%）`;
      const scene=CanvasRenderer.buildScene(placeholder,colors,{swatchLayout:radio.value,swatchRatio:selected?layout.ratio:definition.ratio,aspectRatio:'4:3',gap:0,hexLabel:'none'});
      CanvasRenderer.paint(label.querySelector('canvas'),scene,40/1200);
    });
    labels.hidden=layout.key!=='callout';
    if(labels.children.length!==n) {
      labels.replaceChildren();
      for(let i=0;i<n;i++) {
        const label=document.createElement('label');label.textContent=`${i+1} `;
        const input=document.createElement('input');input.type='text';input.maxLength=40;input.setAttribute('aria-label',`引線標籤 ${i+1}`);
        input.addEventListener('input',()=>{
          const next=[...(getState().options.calloutLabels||[])];next[i]=input.value;
          onChange({calloutLabels:next});
        });
        label.append(input);labels.append(label);
      }
    }
    labels.querySelectorAll('input').forEach((input,i)=>{
      input.placeholder=ColorMath.approximateName(colors[i]);
      if(document.activeElement!==input) input.value=options.calloutLabels?.[i]||'';
    });
  }
  return {init,sync};
})();
window.LayoutGallery=LayoutGallery;
