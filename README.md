# Image Palette Studio 圖片色票工作室

以原生 HTML、CSS 與 JavaScript 製作的純前端色票工具，提供圖片色彩提取、配色生成與色票匯出。圖片處理與色彩運算於瀏覽器端執行。

A browser-based palette tool built with vanilla HTML, CSS, and JavaScript for image color extraction, palette generation, and export. Image processing and color calculations run locally in the browser.

## 功能 / Features

- 圖片上傳、拖曳與貼上，以及 K-means++ 色彩提取 / Image upload, drag-and-drop, paste, and K-means++ extraction.
- 隨機與調和配色、風格預設及色票鎖定 / Random and harmony palettes, style presets, and color locking.
- 手動取色、畫布排版及色盲模擬 / Manual sampling, canvas composition, and color blindness simulation.
- PNG、SVG、ASE、ACO、JSON 與 CSS 匯出，以及 CSS 漸層生成 / Palette exports and CSS gradient generation.

## 本機執行 / Run locally

目前無需安裝 npm 相依套件或執行建置。使用 VS Code Live Preview 開啟根目錄的 `index.html`，或在已安裝 Python 的環境中，於專案根目錄執行：

No npm dependencies or build step are required. Open the root `index.html` with VS Code Live Preview, or run this command from the project root if Python is installed:

```sh
python -m http.server 8000
```

瀏覽 / Visit: <http://localhost:8000>.

Google Fonts 字型需連線載入。概念文件中的 PWA、多語系等內容屬於規劃，不代表目前已全部實作。

Google Fonts requires a network connection. The concept document includes planned features such as PWA support and localization that are not yet fully implemented.

## 專案結構 / Project structure

```text
index.html       網頁入口 / Page entry
css/             介面樣式 / Stylesheets
js/app.js        應用程式狀態與互動 / Application state and interactions
js/components/   介面元件 / UI components
js/core/         色彩提取、配色、渲染與匯出 / Extraction, generation, rendering, and export
js/utils/        色彩轉換與數學工具 / Color conversions and math
docs/            概念與規格文件 / Concept and specification
```

詳細規劃請參閱 [專案概念與規格 / Concept and specification](docs/image_palette_studio_概念.md)。
