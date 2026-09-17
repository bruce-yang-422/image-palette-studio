'use strict';

(() => {
  const button = document.getElementById('btn-install');
  const status = document.getElementById('offline-status');
  let installPrompt;
  let offlineReady = false;

  function updateStatus() {
    status.textContent = !navigator.onLine ? '離線模式' : offlineReady ? '可離線使用' : '';
  }
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    button.hidden = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn('安裝提示無法開啟', error);
    }
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.hidden = true;
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
        offlineReady = true;
        updateStatus();
        const notifyUpdate = () => window.AppToast?.show('新版已備妥，關閉本站所有分頁後重新開啟即可更新', 'success', 6000);
        if (registration.waiting) notifyUpdate();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) notifyUpdate();
          });
        });
      } catch (error) {
        console.warn('離線快取未就緒；仍可連線使用', error);
        status.textContent = '離線快取未就緒';
      }
    });
  }
})();
