// Reproducible local synthetic workloads, not physical-phone performance claims.
const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const {writeFile,mkdir}=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

(async()=>{
  const root=path.resolve(__dirname,'..');
  const server=spawn(process.execPath,['scripts/serve.mjs','dist'],{cwd:root,env:{...process.env,PORT:'4175'},windowsHide:true,stdio:'ignore'});
  let browser;
  try {
    for(let attempt=0;;attempt++) {
      try {await fetch('http://127.0.0.1:4175/');break;}catch(error){if(attempt>50)throw error;await new Promise(r=>setTimeout(r,100));}
    }
    browser=await chromium.launch();
    const rows=[];
    for(const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
      const page=await context.newPage();
      if(mobile) {const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
      await page.goto('http://127.0.0.1:4175/image-palette-studio/');
      for(const [width,height] of [[4000,3000],[6000,4000]]) {
        const metrics=await page.evaluate(async({width,height})=>{
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,width,height);
          ['#14213d','#fca311','#e5e5e5','#7d3559','#006d77'].forEach((color,i)=>gradient.addColorStop(i/4,color));
          ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
          const samples={decode:[],extraction:[],sourceCanvas:[],render:[],png:[]};
          const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));
          for(let iteration=0;iteration<6;iteration++) {
            const url=URL.createObjectURL(blob);
            let start=performance.now();const img=new Image();img.src=url;await img.decode();const decode=performance.now()-start;
            start=performance.now();const pins=await ExtractionEngine.extractSamples(img,8);const extraction=performance.now()-start;
            const palette=pins.map(p=>p.hex);
            start=performance.now();ImagePins.setImage(img);ImagePins.sample({x:.5,y:.5});const sourceCanvas=performance.now()-start;
            start=performance.now();const output=CanvasRenderer.renderExport(img,palette,{aspectRatio:'16:9',exportScale:2,swatchLayout:'callout',pins});const render=performance.now()-start;
            start=performance.now();await ExportEngine.canvasBlob(output);const png=performance.now()-start;
            output.width=1;output.height=1;
            URL.revokeObjectURL(url);
            if(iteration) for(const [key,value] of Object.entries({decode,extraction,sourceCanvas,render,png})) samples[key].push(value);
          }
          ImagePins.setImage(null);canvas.width=1;canvas.height=1;
          return Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,{median:values.slice().sort((a,b)=>a-b)[2],max:Math.max(...values),samples:values}]));
        },{width,height});
        rows.push({profile:mobile?'390×844 / CPU 4× slowdown':'1440×1000 / native CPU',width,height,metrics});
      }
      await context.close();
    }
    const report={date:new Date().toISOString(),platform:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0].model,browser:browser.version(),rows};
    await mkdir(path.join(root,'docs/benchmarks'),{recursive:true});
    await writeFile(path.join(root,'docs/benchmarks/latest.json'),JSON.stringify(report,null,2)+'\n');
    const lines=['# 本機效能基準','',`量測時間：${report.date}。環境：${report.platform}；${report.cpu}；Chromium ${report.browser}。`,'',
      '重現：`npm run benchmark`。合成 JPEG 漸層影像；各情境暖機一次、記錄五次，中位數／最大值單位為 ms。8 色提取、原圖畫布建立及取樣、16:9 引線版型 2×（2400×1350）渲染與 PNG 編碼分開計時。',
      '', '手機情境只有視窗、觸控與 CPU 4 倍降速模擬，並非 Android／iOS 實機或記憶體壓力測試；不含檔案選擇、磁碟下載與整體互動延遲。結果是這台機器的基準，不是所有裝置的服務保證。','',
      '| 情境 | 圖片 | 解碼 | 提取 | 原圖畫布／取樣 | 合成渲染 | PNG 編碼 |','| :--- | :--- | ---: | ---: | ---: | ---: | ---: |'];
    for(const row of rows) lines.push(`| ${row.profile} | ${row.width}×${row.height} | ${Object.values(row.metrics).map(m=>`${m.median.toFixed(1)} / ${m.max.toFixed(1)}`).join(' | ')} |`);
    lines.push('','原始逐次數據見 [latest.json](latest.json)。','');
    await writeFile(path.join(root,'docs/benchmarks/README.md'),lines.join('\n'));
    console.log('Benchmark saved to docs/benchmarks/README.md');
  } finally {await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
