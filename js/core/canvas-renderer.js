'use strict';

// One scene description drives the preview, full-resolution raster and editable SVG.
const CanvasRenderer = (() => {
  const CARD_RATIOS = { original:null, '1:1':1, '4:3':4/3, '3:2':3/2, '16:9':16/9, '2:1':2, '9:16':9/16 };
  const LAYOUTS = {
    bottom: { name:'底部通欄', min:8, max:40, ratio:25, axis:'高度' },
    'side-left': { name:'左側直條', min:8, max:35, ratio:20, axis:'寬度' },
    'side-right': { name:'右側直條', min:8, max:35, ratio:20, axis:'寬度' },
    corners: { name:'四角散佈', min:15, max:45, ratio:30, axis:'外框面積' },
    callout: { name:'標籤引線', min:25, max:50, ratio:35, axis:'寬度' },
    adjacent: { name:'並排色條', min:30, max:60, ratio:50, axis:'寬度' },
    dominant: { name:'色票主導', min:60, max:85, ratio:70, axis:'高度' },
  };
  const BG = '#f5f1ea';
  const clamp = (n, min, max) => Math.max(min,Math.min(max,n));
  const layoutKey = key => ({ thin:'bottom', standard:'bottom', half:'adjacent', color:'dominant' }[key] || (LAYOUTS[key] ? key : 'bottom'));
  function getLayout(opts = {}) {
    const key = layoutKey(opts.swatchLayout), definition = LAYOUTS[key];
    const legacy = { thin:12, standard:25, half:50, color:70 }[opts.swatchLayout];
    return { key, ...definition, ratio:clamp(Number(opts.swatchRatio ?? legacy ?? definition.ratio),definition.min,definition.max) };
  }

  function centerCropRect(img, w, h, offset = {}) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    let sw=iw, sh=ih;
    if (iw/ih>w/h) sw=ih*w/h; else sh=iw*h/w;
    return { sx:(iw-sw)/2*(1+clamp(offset.x||0,-1,1)), sy:(ih-sh)/2*(1+clamp(offset.y||0,-1,1)), sw, sh };
  }

  function buildScene(img, palette, opts = {}) {
    const layout = getLayout(opts), r = layout.ratio/100;
    const width = 1200;
    const iw = img?.naturalWidth || img?.width || 4, ih = img?.naturalHeight || img?.height || 3;
    const horizontal = ['side-left','side-right','adjacent','callout'].includes(layout.key);
    const fixed = CARD_RATIOS[opts.aspectRatio];
    let height = fixed ? Math.round(width/fixed) : !img ? 600 :
      Math.round(horizontal ? width*(1-r)*ih/iw : layout.key==='corners' ? width*ih/iw : width*ih/iw/(1-r));
    height = Math.max(1,height);
    const scene = { width,height,background:BG,photo:null,image:img,elements:[],layout:layout.key,swatchRatio:layout.ratio };
    const elements = scene.elements, n=palette.length;
    if (!n) return scene;
    const gap=clamp(Number(opts.gap)||0,0,16), radius=clamp(Number(opts.radius)||0,0,12);
    const rect=(x,y,w,h,fill,extra={})=>elements.push({type:'rect',x,y,w:Math.max(0,w),h:Math.max(0,h),fill,radius,...extra});
    const text=(value,x,y,w,fill,size=20,extra={})=> {
      const units=Array.from(value).reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:.62),0);
      elements.push({type:'text',value,x,y,fill,size:Math.min(size,Math.max(1,w)/Math.max(1,units)),font:'monospace',...extra});
    };
    const code = hex => opts.labelFormat==='rgb' ? (()=>{const c=ColorConvert.hexToRgb(hex);return `rgb(${c.r}, ${c.g}, ${c.b})`;})() : hex.toUpperCase();
    function swatch(hex,i,x,y,w,h,circle=false) {
      const below=opts.hexLabel==='below', inside=opts.hexLabel==='inside';
      const labelH=below ? Math.min(28,h*.22) : 0;
      const blockH=h-labelH;
      const diameter=Math.min(w,blockH);
      if (circle) elements.push({type:'circle',x:x+w/2,y:y+blockH/2,r:diameter/2,fill:hex,swatch:i});
      else rect(x,y,w,blockH,hex,{swatch:i});
      if (inside) text(code(hex),x+w/2,y+blockH/2,(circle?diameter*.86:w-12),ColorConvert.contrastColor(hex),Math.min(20,blockH*.35));
      if (below) text(code(hex),x+w/2,y+blockH+labelH/2,w-4,ColorConvert.contrastColor(BG),Math.min(18,labelH*.65));
    }
    function strip(x,y,w,h,vertical=false) {
      const step=((vertical?h:w)-gap*(n-1))/n;
      palette.forEach((hex,i)=>swatch(hex,i,x+(vertical?0:i*(step+gap)),y+(vertical?i*(step+gap):0),vertical?w:step,vertical?step:h));
    }
    if (!img) {
      if (opts.roleDistribution && n >= 3) {
        let x=30;
        const usable=width-60-gap*(n-1);
        StyleEngine.roles(n).forEach((role,i)=>{ const w=usable*role.weight; swatch(palette[i],i,x,30,w,height-60); x+=w+gap; });
      } else strip(30,30,width-60,height-60);
      return scene;
    }
    if (horizontal) {
      const band=width*r, left=layout.key==='side-left';
      scene.photo={x:left?band:0,y:0,w:width-band,h:height};
      if (layout.key!=='callout') strip(left?0:width-band,0,band,height,true);
    } else if (layout.key==='corners') {
      const fraction=Math.sqrt(1-r), mx=width*(1-fraction)/2, my=height*(1-fraction)/2;
      scene.photo={x:mx,y:my,w:width-2*mx,h:height-2*my};
      const positions=[[mx/2,my/2],[width-mx/2,my/2],[width-mx/2,height-my/2],[mx/2,height-my/2],
        [width/2,my/2],[width/2,height-my/2],[mx/2,height/2],[width-mx/2,height/2]];
      const d=Math.max(1,Math.min(mx,my)*.85-gap);
      palette.forEach((hex,i)=>{const [x,y]=positions[i];swatch(hex,i,x-d/2,y-d/2,d,d,true);});
    } else {
      const top=height*(1-r);
      if (layout.key==='dominant') {
        const margin=Math.min(24,top*.1);
        const ph=Math.max(1,top-2*margin), pw=Math.min(width*.45,ph*iw/ih);
        scene.photo={x:margin,y:margin,w:pw,h:ph};
        strip(0,top,width,height-top);
      } else {
        scene.photo={x:0,y:0,w:width,h:top};
        strip(0,top,width,height-top);
      }
    }
    const photo=scene.photo;
    if (opts.fitMode==='letterbox') {
      const scale=Math.min(photo.w/iw,photo.h/ih);
      scene.crop={sx:0,sy:0,sw:iw,sh:ih};
      scene.imageRect={x:photo.x+(photo.w-iw*scale)/2,y:photo.y+(photo.h-ih*scale)/2,w:iw*scale,h:ih*scale};
    } else {
      scene.crop=centerCropRect(img,photo.w,photo.h,opts.cropOffset);
      scene.imageRect={...photo};
    }
    if (layout.key==='callout') {
      const band=width-photo.w, row=height/n;
      palette.forEach((hex,i)=>{
        const x=photo.w+band*.19,y=row*(i+.5), d=Math.min(band*.25,row*.55);
        const pin=opts.pins?.[i];
        let suffix='';
        if (pin && !pin.external) {
          const crop=scene.crop, area=scene.imageRect;
          const px=area.x+(pin.x*iw-crop.sx)/crop.sw*area.w, py=area.y+(pin.y*ih-crop.sy)/crop.sh*area.h;
          const clipped=px<photo.x||px>photo.x+photo.w||py<photo.y||py>photo.y+photo.h;
          elements.push({type:'line',x1:clamp(px,photo.x,photo.x+photo.w),y1:clamp(py,photo.y,photo.y+photo.h),x2:x-d/2,y2:y,stroke:'#635b52',dash:clipped});
          if(clipped) suffix='（裁切外）';
        } else if (pin?.external) suffix='（外部色）';
        swatch(hex,i,x-d/2,y-d/2,d,d,true);
        text((opts.calloutLabels?.[i] || ColorMath.approximateName(hex))+suffix,
          x+d/2+12,y,Math.max(1,width-x-d/2-30),'#211d18',24,{align:'left',font:'"Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif'});
      });
    }
    return scene;
  }

  function paint(canvas,scene,scale=1) {
    canvas.width=Math.max(1,Math.round(scene.width*scale)); canvas.height=Math.max(1,Math.round(scene.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx) throw new Error('無法建立圖片畫布，請降低匯出倍率');
    ctx.scale(scale,scale);
    ctx.fillStyle=scene.background;ctx.fillRect(0,0,scene.width,scene.height);
    if(scene.photo) {
      const p=scene.photo,c=scene.crop,d=scene.imageRect;
      ctx.fillStyle=scene.background;ctx.fillRect(p.x,p.y,p.w,p.h);
      ctx.drawImage(scene.image,c.sx,c.sy,c.sw,c.sh,d.x,d.y,d.w,d.h);
    }
    for(const el of scene.elements) {
      if(el.type==='rect') {
        ctx.fillStyle=el.fill;ctx.beginPath();ctx.roundRect(el.x,el.y,el.w,el.h,Math.min(el.radius,el.w/2,el.h/2));ctx.fill();
      } else if(el.type==='circle') {
        ctx.fillStyle=el.fill;ctx.beginPath();ctx.arc(el.x,el.y,el.r,0,Math.PI*2);ctx.fill();
      } else if(el.type==='line') {
        ctx.strokeStyle=el.stroke;ctx.lineWidth=2;ctx.setLineDash(el.dash?[6,5]:[]);ctx.beginPath();ctx.moveTo(el.x1,el.y1);ctx.lineTo(el.x2,el.y2);ctx.stroke();ctx.setLineDash([]);
      } else if(el.type==='text') {
        ctx.fillStyle=el.fill;ctx.font=`500 ${el.size}px ${el.font}`;ctx.textAlign=el.align||'center';ctx.textBaseline='middle';ctx.fillText(el.value,el.x,el.y);
      }
    }
    canvas.paletteScene=scene;
    return canvas;
  }
  function render(canvas,img,palette,opts={}) {
    const scene=buildScene(img,palette,opts);
    // Render at devicePixelRatio so text and edges stay sharp on HiDPI screens — the bitmap
    // would otherwise sit at the 1200-logical-px scene size and get stretched to fill more
    // physical pixels than it has, blurring fine detail like swatch labels.
    const dpr=(typeof window!=='undefined' && window.devicePixelRatio) || 1;
    const perfCap=Math.min(8192/scene.width,8192/scene.height,Math.sqrt(16000000/(scene.width*scene.height)));
    const scale=Math.min(Math.max(1,dpr),Math.max(1,perfCap));
    return paint(canvas,scene,scale);
  }
  const renderSwatchOnly=(canvas,palette,opts={})=>render(canvas,null,palette,opts);
  function renderExport(img,palette,opts={}) {
    const scale=Number(opts.exportScale)||1,scene=buildScene(img,palette,opts);
    if(![1,2,4].includes(scale)) throw new Error('不支援的匯出倍率');
    if(Math.max(scene.width,scene.height)*scale>16384||scene.width*scene.height*scale*scale>48000000) throw new Error('匯出尺寸過大，請降低倍率或改用固定畫布比例');
    return paint(document.createElement('canvas'),scene,scale);
  }
  function fitToContainer(canvas,container) {
    // canvas.width/height may be rendered at devicePixelRatio (see render()), so size the
    // CSS box off the scene's logical dimensions, not the bitmap's pixel dimensions.
    const scene=canvas.paletteScene;
    const logicalW=scene?.width ?? canvas.width, logicalH=scene?.height ?? canvas.height;
    const scale=Math.min(1,Math.max(1,container.clientWidth-48)/logicalW,Math.max(1,container.clientHeight-48)/logicalH);
    canvas.style.width=`${Math.round(logicalW*scale)}px`;canvas.style.height=`${Math.round(logicalH*scale)}px`;
  }
  // Compatibility with the older rectangular sampler; source pins use the full source image.
  function computeSize(img,aspectRatio,swatchLayout) {
    const scene=buildScene(img,['#000000'],{aspectRatio,swatchLayout});
    return {canvasW:scene.width,canvasH:scene.height,photoH:scene.photo?.h||0,swatchH:scene.height-(scene.photo?.h||0)};
  }
  return { LAYOUTS,CARD_RATIOS,getLayout,buildScene,paint,render,renderSwatchOnly,renderExport,fitToContainer,centerCropRect,computeSize,
    getPhotoRatio:(img,ratio,layout)=>{const s=computeSize(img,ratio,layout);return s.photoH/s.canvasH;} };
})();
window.CanvasRenderer=CanvasRenderer;
