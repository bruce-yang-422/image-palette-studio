'use strict';
const ExportUI=(()=>{
  let getCanvas,getPalette,getNames,getOptions,busy=false;
  const formats=['png','jpg','svg','ase','aco','json','css','tailwind'];
  function options() {
    return {...getOptions(),exportScale:Number(document.getElementById('export-scale').value),tailwindVersion:document.getElementById('tailwind-version').value};
  }
  function init(canvas,palette,names,opts) {
    getCanvas=canvas;getPalette=palette;getNames=names;getOptions=opts;
    for(const format of formats) document.getElementById(`btn-export-${format}`).addEventListener('click',()=>trigger(format));
    document.getElementById('btn-export-main').addEventListener('click',()=>trigger('png'));
    for(const id of ['export-scale','code-format','tailwind-version']) document.getElementById(id).addEventListener('change',update);
    document.getElementById('btn-copy-export-code').addEventListener('click',async()=>{
      if(!getPalette().length) return;
      try {
        await ExportEngine.copyText(document.getElementById('export-code').textContent);
        window.AppToast.show('程式碼已複製');
      } catch(error) { window.AppToast.show(error.message,'error'); }
    });
    update();
  }
  async function trigger(format) {
    if(busy||!getPalette().length) return;
    busy=true;update();
    try {
      await ExportEngine.exportAs(format,getCanvas(),[...getPalette()],[...getNames()],options());
      window.AppToast.show(`${format.toUpperCase()} 匯出成功`);
    } catch(error) { window.AppToast.show(`匯出失敗：${error.message}`,'error'); }
    finally { busy=false;update(); }
  }
  function update() {
    if(!getPalette) return;
    const palette=getPalette(),opts=options();
    const code=document.getElementById('export-code'),format=document.getElementById('code-format').value;
    code.textContent=palette.length ? ExportEngine.buildCode(format,palette,getNames(),opts.tailwindVersion) : '生成色票後顯示程式碼';
    for(const id of [...formats.map(f=>`btn-export-${f}`),'btn-export-main','btn-copy-export-code']) document.getElementById(id).disabled=busy||!palette.length;
    const scene=CanvasRenderer.buildScene(opts.image,palette,opts),scale=opts.exportScale;
    document.getElementById('export-dimensions').textContent=palette.length?`${Math.round(scene.width*scale)} × ${Math.round(scene.height*scale)} px`:'';
  }
  return {init,update};
})();
window.ExportUI=ExportUI;
