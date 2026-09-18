'use strict';

// Runs in <head> so a saved preference is applied before the first paint.
(() => {
  const key = 'palette-studio-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['light', 'dark', 'system'].includes(value);
  let preference = 'light';
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch {}
  function moveThumb() {
    const group = document.getElementById('theme-switch');
    const thumb = group?.querySelector('.theme-switch-thumb');
    const checked = group?.querySelector('input:checked');
    if (!group || !thumb || !checked) return;
    const option = checked.closest('.theme-switch-option');
    thumb.style.width = `${option.offsetWidth}px`;
    thumb.style.transform = `translateX(${option.offsetLeft}px)`;
  }
  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#2c3240' : '#f5f6fb');
    const group = document.getElementById('theme-switch');
    if (!group) return;
    group.querySelectorAll('.theme-switch-option').forEach(option => {
      const input = option.querySelector('input');
      input.checked = input.value === preference;
      option.classList.toggle('is-active', input.checked);
    });
    moveThumb();
  }
  apply();
  media.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = valid(event.newValue) ? event.newValue : 'light';
      apply();
    }
  });
  window.addEventListener('resize', moveThumb);
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-switch').addEventListener('change', event => {
      if (event.target.name !== 'theme-pref') return;
      preference = event.target.value;
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
})();
