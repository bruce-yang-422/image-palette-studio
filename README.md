# Image Palette Studio 圖片色票工作室

以原生 HTML、CSS 與 JavaScript 製作的純前端色票工具，提供圖片色彩提取、配色生成與色票匯出。圖片處理與色彩運算於瀏覽器端執行。

A browser-based palette tool built with vanilla HTML, CSS, and JavaScript for image color extraction, palette generation, and export. Image processing and color calculations run locally in the browser.

線上展示 / Live demo: <https://bruce-yang-422.github.io/image-palette-studio/>

## 功能 / Features

- 圖片上傳、拖曳與貼上，以及 K-means++ 色彩提取 / Image upload, drag-and-drop, paste, and K-means++ extraction.
- 隨機與五種調和配色（含單色調）、HEX／RGB／HSL 主色輸入、風格預設及持續保留色票鎖定；憑空生成時有鎖定色，風格自帶的重點色／跳色會呼應鎖定色相而非隨機生成 / Random and five harmony modes, manual seed colors, styles, and persistent locks during regeneration; when a swatch is locked, a style's built-in accent hue echoes it instead of being randomized.
- 圖片提取的色票一律保留照片原始色調，不套用風格 / Image-extracted swatches always keep the photo's true colors — no style projection is applied.
- 原圖編號錨點、滑鼠／觸控拖曳即時取色、放大鏡、平均取樣與螢幕滴管 / Numbered image sample pins, live mouse/touch sampling, loupe, averaging, and screen eyedropper.
- 淺色／暗色／跟隨系統主題，圖示式滑動 Pill 切換並記憶偏好 / Light, dark, and system theme icons with a sliding-pill switch and saved preference.
- 七款版型縮圖畫廊、可調色票佔比與引線標籤編輯，以及色盲模擬 / Seven-preset layout gallery with live thumbnails, adjustable swatch ratio, callout label editing, and color blindness simulation.
- 文字對比檢測（WCAG 對比值與等級）/ Text contrast checker with WCAG ratio and grade.
- PNG、SVG、ASE、ACO、JSON 與 CSS 匯出，以及 CSS 漸層生成 / Palette exports and CSS gradient generation.
- 可安裝 PWA、離線使用與 GitHub Pages 子路徑部署 / Installable PWA, offline use, and GitHub Pages subpath support.

## 本機執行 / Run locally

目前無需安裝 npm 相依套件或執行建置。使用 VS Code Live Preview 開啟根目錄的 `index.html`，或在已安裝 Python 的環境中，於專案根目錄執行：

No npm dependencies or build step are required. Open the root `index.html` with VS Code Live Preview, or run this command from the project root if Python is installed:

```sh
python -m http.server 8000
```

瀏覽 / Visit: <http://localhost:8000>.

字型使用系統備援字型，不需要連線載入第三方資源。首次以 HTTPS 或 localhost 開啟並出現「可離線使用」後，即可離線重新開啟、載入本機圖片、生成及匯出。照片、色票與鎖定狀態目前只留在記憶體，重新整理後需重新載入。

The app uses system font fallbacks and no third-party runtime resources. After the first HTTPS/localhost visit shows “可離線使用”, it can reopen, load local images, generate and export offline. Images and palettes are kept in memory only and are reset on reload.

## PWA 安裝與更新 / Install and update

- Chrome／Edge 支援安裝時，工具列會顯示「安裝」；也可使用瀏覽器的安裝選單。其他瀏覽器依各自支援提供「加入主畫面」。
- 不支援安裝或 Service Worker 的環境仍可使用線上工具。直接開啟 `file://` 不提供離線快取。
- 新版本快取完成後會顯示提示。關閉本站所有分頁及已安裝視窗，再開啟即可更新，避免工作中的照片因自動重新整理而遺失。
- 離線快取只儲存本站程式與圖示，不保存上傳照片或匯出檔案。

## 雙軌操作 / Two workflows

- 開站即進入「憑空生成」，自動產出 5 色調和配色。按 Space／R、重新生成按鈕或手機右下角「重新配色」替換未鎖定色槽。品牌主色可由 HEX／RGB／HSL 或色盤輸入，套用風格後仍保留原色。
- 左側頂部切換「圖片提取」，可上傳、拖放或貼上圖片。在中央「原圖取色」區拖曳編號錨點，顏色會即時同步至右側同編號色槽和下方輸出預覽；也可先選右側色槽編號，再點擊原圖。
- 拖曳時顯示放大鏡；方向鍵移動一個原圖像素，Shift＋方向鍵移動十個像素。取樣範圍支援單像素、3×3 或 5×5 平均，邊緣會限制在圖片內。鎖定色槽不接受錨點移動，需先解鎖。
- 支援 EyeDropper API 的瀏覽器可用「螢幕滴管」覆寫目前選取槽位。外部取色不提供圖片座標，因此保留原錨點位置並標示外部色；再次拖曳即回到照片取樣。不支援時，仍可使用照片取色。
- 增減 3／4／5／6／8 色時，保留尚存在的錨點與鎖定槽。切换兩種工作模式會各自保留本次工作階段的色票、鎖定與畫布設定；重新整理仍會清空。
- 圖片提取以 K-means 候選色與 CIELAB ΔE 選擇亮部、暗部、鮮豔色及中性色；重新生成時會避開已顯示過的顏色，逐步探索照片其他代表色。低色彩照片可能出現重複色，不會以照片以外的隨機色補足。
- 圖片提取模式沒有風格套用選項，色票一律是照片本身的顏色；「風格色彩」面板只在「憑空生成」模式顯示。
- 頂部提供淺色／暗色／跟隨系統三個圖示，滑動 Pill 切換。預設淺色；跟隨系統會即時同步作業系統變更，選擇可於重新開啟後保留。介面主題不改變色票與匯出內容。

## 測試與發布 / Test and deploy

執行網頁不需 npm；開發測試與發布封裝使用 Node.js 22 以上：

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

`dist/` 是完整靜態網站，可部署於根目錄或 `/image-palette-studio/`。建置會依程式內容產生離線快取版本。直接發布原始碼時，修改資源後須同步更新 `sw.js` 的 `VERSION`。新增必要資源時，也須加入 `ASSETS` 快取清單。更新圖示可執行 `node scripts/generate-icons.cjs`。

GitHub Pages 發布步驟：

1. 將本次程式與 `.github/workflows/pages.yml` 提交並推送至 GitHub 儲存庫的 `main` 分支。
2. 開啟儲存庫 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。
3. 在 **Actions → Test and deploy Pages** 執行工作流程，或再次推送至 `main`。流程會執行測試、產生 `dist/`，再發布至 Pages；Pull Request 只測試，不發布。
4. 使用部署工作輸出的網址驗收；本儲存庫預期網址為 <https://bruce-yang-422.github.io/image-palette-studio/>。
5. 在實際網址逐項確認：資源無 404、上傳／拖放／貼上、3／4／5／6／8 色生成與鎖定、圖片與純色票預覽、色盲預覽、漸層複製，以及 PNG／SVG／ASE／ACO／JSON／CSS 下載。等待「可離線使用」後，斷網並重新整理，重做生成、上傳與匯出。

流程依 [GitHub Pages 自訂工作流程文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 設定。尚未推送或驗收實際 Pages 網址時，不應視為部署完成。

瀏覽器測試使用 Chromium 驗證儲存庫子路徑、根目錄與手機尺寸、圖片輸入、鎖定主色、風格還原、離線重新載入與六種匯出。Android 實機安裝、其他瀏覽器及 Adobe 匯入相容性仍需人工驗收。

## 專案結構 / Project structure

```text
index.html       網頁入口 / Page entry
404.html         GitHub Pages 找不到頁面時顯示 / Shown by GitHub Pages for unmatched URLs
css/             介面樣式 / Stylesheets
js/app.js        應用程式狀態與互動 / Application state and interactions
js/components/   介面元件 / UI components
js/core/         色彩提取、配色、渲染與匯出 / Extraction, generation, rendering, and export
js/utils/        色彩轉換與數學工具 / Color conversions and math
js/theme.js      主題切換與偏好記憶 / Theme toggle and saved preference
js/pwa.js        安裝提示與版本更新流程 / Install prompt and update flow
docs/            概念與規格文件 / Concept and specification
icons/           PWA 圖示 / App icons
sw.js            離線程式快取 / Offline app cache
manifest.webmanifest  PWA 安裝資訊 / Install metadata
scripts/         靜態封裝與測試伺服器 / Packaging and test server
tests/           核心及瀏覽器回歸測試 / Core and browser tests
```

詳細規劃請參閱 [專案概念與規格 / Concept and specification](docs/image_palette_studio_概念.md)。

尚未完成的規格為多語系介面切換。原生螢幕滴管的實際 OS 選色、Android 安裝及跨瀏覽器實機操作仍待人工驗收。
