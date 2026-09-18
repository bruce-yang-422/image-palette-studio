'use strict';

// Source-language messages stay in the existing components. Bind text/accessible
// attributes without replacing elements, event handlers, form values or user labels.
window.I18n = (() => {
  const languages = ['zh-TW','en','ja','ko','th','vi','es'];
  const key = 'palette-studio-language';
  const messages = window.PaletteMessages;
  let locale = 'zh-TW', observer;
  const originals = new WeakMap();
  const aliases = {
    '圖片色票工作室':'Image Palette Studio', '首頁':'Image Palette Studio',
    '色盲友善模擬器':'色盲模擬', '色盲模擬選項':'色盲模擬',
    '圖片與控制設定':'工作模式', '生成來源':'工作模式',
    '不需要圖片，直接憑空生成色票':'憑空生成',
    '上傳圖片開始提取色彩':'上傳圖片', '上傳圖片開始提取色票':'上傳圖片',
    '或點擊選擇 JPG / PNG / WebP':'選擇圖片', '拖曳圖片至此或點擊選擇檔案':'選擇圖片',
    '選擇圖片檔案':'選擇圖片','已上傳圖片縮圖':'原圖',
    '憑空生成模式':'憑空生成','憑空生成說明':'憑空生成','憑空生成選項':'憑空生成',
    '立即生成色票':'立即生成','卡片輸出比例':'卡片比例','原圖比例':'原圖',
    '原圖自然比例，色票外加於下方':'原圖','整張卡片（含色票）為正方形':'1:1',
    '整張卡片 16:9 寬螢幕':'16:9','整張卡片 2:1 電影格式':'2:1',
    '整張卡片 3:2':'3:2','整張卡片 4:3':'4:3','整張卡片 9:16 直式':'9:16',
    '1比1正方形':'1:1','16比9':'16:9','9比16':'9:16','2比1':'2:1','3比2':'3:2','4比3':'4:3',
    '圖片適配模式':'版型','置中裁切':'裁切','留白裝裱':'裝裱',
    '篩選版型色數':'色票數量','版型色數':'色票數量','色票版型':'版型',
    '選擇色票數量':'色票數量','3色 極簡':'3','5色 經典':'5','6色 豐富':'6',
    '取色工具':'原圖取色','手動取色':'原圖取色','前往原圖取色錨點':'原圖取色',
    '圖片提取選項':'圖片提取','生成演算法':'演算法',
    '和諧配色 Harmony Mode':'和諧','純亂數 Chaos Mode':'純亂數',
    '和諧配色類型':'和諧','和諧類型':'和諧','錨點色列表':'錨點色',
    '新增錨點色：指定一個主色，其餘色票圍繞它生成':'新增主色',
    '選擇色彩風格':'風格色彩','莫蘭迪色':'莫蘭迪','馬卡龍色':'馬卡龍',
    '大地色系':'大地色','美拉德色':'美拉德','多巴胺色':'多巴胺','波普色':'波普',
    '森林自然系':'森林系','礦石地質系':'礦石系',
    '原圖像素取色區':'原圖取色','劇照色票卡畫布':'色票卡圖片','劇照色票卡預覽':'色票卡圖片',
    '拖曳編號錨點，或選取色槽後點擊照片':'拖曳編號錨點即時取色；方向鍵微調，Shift 加速。右側編號對應相同色槽。',
    '選取錨點後，可用方向鍵精準微調':'拖曳編號錨點即時取色；方向鍵微調，Shift 加速。右側編號對應相同色槽。',
    '請上傳圖片以開始':'請先上傳圖片','畫布操作工具列':'工具列',
    '色塊間距設定':'間距','色塊間距 0到16像素':'間距','色塊圓角設定':'圓角','色塊圓角半徑 0到12像素':'圓角',
    'HEX色碼顯示位置':'色碼標籤','HEX色碼顯示設定':'色碼標籤','標籤格式':'色碼標籤',
    '顯示在色塊內':'內部','顯示在色塊下方':'下方',
    '完成取色，套用至色票':'完成','重新生成色票':'重新生成','隨機替換未鎖定色票':'重新生成',
    '色票槽位與匯出':'匯出','色票槽位列表':'色票數量','色票槽位':'色票數量',
    '自動挑選色票中色差最大的兩色配對':'自動挑最大色差','自行指定前景／背景色槽':'手動選色',
    '選擇前景色槽':'前景','選擇背景色槽':'背景',
    '漸層類型':'漸層生成器','線性漸層':'線性','放射漸層':'放射',
    '複製漸層 CSS 程式碼':'複製程式碼','CSS 漸層程式碼':'漸層生成器',
    '匯出倍率':'PNG／JPG 解析度','匯出程式碼預覽':'程式碼預覽與複製','程式碼格式':'匯出格式',
    '匯出 PNG 圖片':'PNG','匯出 JPG 圖片':'JPG','匯出 SVG 向量色票':'SVG',
    '匯出 ASE Adobe 色票':'ASE','匯出 ACO Photoshop 色票':'ACO','匯出 JSON Design Tokens':'JSON',
    '匯出 Tailwind 配色':'Tailwind','匯出 CSS 變數':'CSS','匯出色票':'匯出',
    '安裝圖片色票工作室':'安裝',
    'K-means++ 從圖片提取最具代表性的色彩，色票保留原始照片色調':'從上傳的圖片以 K-means++ 提取色彩',
    'K-means++ 從圖片提取最具代表性色彩，保留原始色調':'從上傳的圖片以 K-means++ 提取色彩',
    'K-means++ 從圖片提取代表色，色票保留原始照片色調，不套用風格':'從上傳的圖片以 K-means++ 提取色彩',
    '全色彩空間隨機取樣，附安全亮度邊界保護；鎖定色票後重生成可保留主色':'純亂數探索，全色彩空間隨機取樣（附安全亮度邊界保護）',
    '在錨點色附近進行 Chaos 隨機展開，未鎖定的空位以差異色補齊':'設定 1~N 個主色，其餘空位依演算法自動補色',
    '以錨點色（或隨機基準色）展開和諧配色——類比/互補/分裂互補/三角色/單色調':'以錨點色為基準，依照和諧規則展開色票',
  };
  const escape = s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const templates = Object.keys(messages).filter(key=>key.includes('{0}')).sort((a,b)=>b.length-a.length).map(key=>({key,
    regex:new RegExp('^'+key.split(/(\{\d+\})/).map(part=>/^\{\d+\}$/.test(part)?(['已載入：{0}','不支援的檔案類型：{0}','這個風格的明度範圍無法讓目前的對比配對達到 {0}，暫不可用',' · 已鎖定 {0}'].includes(key)?'(.+?)':'([0-9.]+)'):escape(part)).join('')+'$')}));
  const entries = [...new Set([...Object.keys(messages),...Object.keys(aliases)])].filter(key=>!key.includes('{0}')).sort((a,b)=>b.length-a.length);
  const pattern = new RegExp(entries.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  function t(source) {
    if (locale === 'zh-TW') return source;
    const index = languages.indexOf(locale)-1;
    const text=String(source), trimmed=text.trim();
    if(messages[trimmed] || aliases[trimmed]) {
      const key=aliases[trimmed] || trimmed;
      return text.replace(trimmed,()=>messages[key]?.[index] ?? key);
    }
    const icon=trimmed.match(/^([✓⚠✕ℹ] )(.+)$/s);
    if(icon) return text.replace(trimmed,()=>icon[1]+t(icon[2]));
    for(const {key,regex} of templates) {
      const match=trimmed.match(regex);
      if(match) return text.replace(trimmed,()=>messages[key][index].replace(/\{(\d+)\}/g,(_,n)=>match[Number(n)+1]));
    }
    return text.replace(/(\d+)\s*色/g,(_,n)=>messages['{0} 色'][index].replace('{0}',n)).replace(pattern, match => {
      const key = aliases[match] || match;
      return messages[key]?.[index] ?? key;
    });
  }
  function bind(node, name, read, write) {
    const value=read(); if (!value) return;
    let saved=originals.get(node);
    if (!saved) { saved={}; originals.set(node,saved); }
    const previous=saved[name];
    const source=previous && value===previous.output ? previous.source : value;
    const output=t(source);
    saved[name]={source,output};
    if(output!==value) write(output);
  }
  function visit(root) {
    if(root.nodeType===Node.TEXT_NODE) {
      if (!root.parentElement?.closest('script,style,pre,code,textarea,[translate="no"]'))
        bind(root,'text',()=>root.nodeValue,value=>{root.nodeValue=value;});
      return;
    }
    if(root.nodeType!==Node.ELEMENT_NODE || root.matches('script,style')) return;
    for(const attribute of ['title','aria-label','placeholder','alt','aria-valuetext']) {
      bind(root,attribute,()=>root.getAttribute(attribute),value=>root.setAttribute(attribute,value));
    }
    if(!root.matches('[translate="no"]')) root.childNodes.forEach(visit);
  }
  function observe() {
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,
      attributeFilter:['title','aria-label','placeholder','alt','aria-valuetext']});
  }
  function refresh() {
    observer?.disconnect(); visit(document.documentElement); if(observer) observe();
  }
  function setLanguage(value, persist=true) {
    if(!languages.includes(value)) return;
    locale=value; document.documentElement.lang=value;
    const select=document.getElementById('language-select'); if(select) select.value=value;
    if(persist) {try{localStorage.setItem(key,value);}catch{}}
    refresh(); window.dispatchEvent(new Event('languagechange'));
  }
  try {const saved=localStorage.getItem(key);if(languages.includes(saved)) locale=saved;}catch{}
  document.documentElement.lang=locale;
  document.addEventListener('DOMContentLoaded',()=>{
    observer=new MutationObserver(records=>{
      observer.disconnect();
      const roots=new Set();
      for(const record of records) {
        if(record.type==='childList') record.addedNodes.forEach(node=>roots.add(node));
        else roots.add(record.target);
      }
      roots.forEach(visit); observe();
    });
    document.getElementById('language-select').value=locale;
    document.getElementById('language-select').addEventListener('change',event=>setLanguage(event.target.value));
    refresh();
  });
  window.addEventListener('storage',event=>{
    if(event.key===key || event.key===null) setLanguage(languages.includes(event.newValue)?event.newValue:'zh-TW',false);
  });
  return {t,setLanguage,refresh,source:(node,attribute)=>originals.get(node)?.[attribute]?.source ?? node.getAttribute(attribute),get locale(){return locale;},languages};
})();
