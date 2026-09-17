/**
 * upload.js
 * 圖片上傳元件
 * 處理：拖曳上傳 / 點擊選擇 / 檔案驗證 / 縮圖預覽
 */

'use strict';

const UploadComponent = (() => {

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  let _onImageLoaded = null;  // callback(imgElement, file)
  let _onImageRemoved = null; // callback()
  let loadVersion = 0;

  // DOM 引用
  let dropzone, uploadInput, uploadPreview, thumbnail, btnRemove, btnTrigger;

  function init() {
    dropzone      = document.getElementById('upload-dropzone');
    uploadInput   = document.getElementById('upload-input');
    uploadPreview = document.getElementById('upload-preview');
    thumbnail     = document.getElementById('upload-thumbnail');
    btnRemove     = document.getElementById('btn-remove-image');
    btnTrigger    = document.getElementById('btn-upload-trigger');

    // 點擊 dropzone 或觸發按鈕開啟檔案選擇器
    dropzone.addEventListener('click', () => uploadInput.click());
    dropzone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); uploadInput.click(); }
    });
    btnTrigger?.addEventListener('click', e => {
      e.stopPropagation();
      uploadInput.click();
    });

    // 檔案選擇
    uploadInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = ''; // reset so same file can be re-selected
    });

    // 拖曳事件
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', e => {
      if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    // 全頁面拖曳接收（防止瀏覽器預設開啟圖片）
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    // 圖片貼上沿用相同驗證流程；文字輸入區保留原有貼上行為。
    document.addEventListener('paste', e => {
      if (e.target.closest?.('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      const item = Array.from(e.clipboardData?.items ?? [])
        .find(item => item.kind === 'file' && item.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      handleFile(file);
    });

    // 移除圖片
    btnRemove?.addEventListener('click', e => {
      e.stopPropagation();
      removeImage();
    });
  }

  // ─────────────────────────────────────────────
  // 驗證
  // ─────────────────────────────────────────────

  function isValidImage(file) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      window.AppToast?.show(`不支援的檔案類型：${file.type}`, 'error');
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      window.AppToast?.show(`檔案過大（最大 20MB），目前 ${(file.size/1024/1024).toFixed(1)}MB`, 'error');
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────
  // 處理上傳
  // ─────────────────────────────────────────────

  function handleFile(file) {
    if (!isValidImage(file)) return;
    const version = ++loadVersion;

    const reader = new FileReader();
    reader.onload = e => {
      if (version !== loadVersion) return;
      const img = new Image();
      img.onload = () => {
        if (version !== loadVersion) return;
        showPreview(e.target.result);
        _onImageLoaded?.(img, file);
      };
      img.onerror = () => {
        if (version !== loadVersion) return;
        window.AppToast?.show('圖片讀取失敗，請重試', 'error');
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      if (version === loadVersion) window.AppToast?.show('檔案讀取失敗，請重試', 'error');
    };
    reader.readAsDataURL(file);
  }

  // ─────────────────────────────────────────────
  // 顯示 / 隱藏預覽
  // ─────────────────────────────────────────────

  function showPreview(dataUrl) {
    thumbnail.src = dataUrl;
    thumbnail.alt = '已上傳圖片縮圖';
    uploadPreview.hidden = false;
    dropzone.style.display = 'none';
  }

  function removeImage() {
    loadVersion++;
    uploadPreview.hidden = true;
    thumbnail.src = '';
    dropzone.style.display = '';
    _onImageRemoved?.();
  }

  // ─────────────────────────────────────────────
  // 公開 API
  // ─────────────────────────────────────────────
  return {
    init,

    /** 設定圖片載入成功回呼 */
    onImageLoaded:  (cb) => { _onImageLoaded  = cb; },

    /** 設定圖片移除回呼 */
    onImageRemoved: (cb) => { _onImageRemoved = cb; },
  };

})();

window.UploadComponent = UploadComponent;
