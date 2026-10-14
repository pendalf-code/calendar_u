"use strict";

/* ================= ЗАПУСК ================= */
function startApp() {
  loadSettings();
  loadStoredEvents();

  fillCategorySelect(categoryFilterEl, true);
  fillCategorySelect(evCategorySelect, false);
  buildColorPicker();
  buildDetailsFields();
  document.querySelectorAll(".select-wrapper select").forEach(enhanceSelect);
  syncFilterUi();

  loadGistConfig();
  render();

  // Старые вложения (внутри localStorage) → IndexedDB; затем убрать «осиротевшие» файлы
  migrateLegacyAttachments().then(() => gcAttachments());

  if (gistReady()) gistSync(); // подтянуть и слить изменения с других устройств

  setInterval(updateNowLines, 60 * 1000);

  document.addEventListener("visibilitychange", gistSyncOnVisibility);
  window.addEventListener("online", () => { if (gistReady()) gistSync(); }); // правки, сделанные без сети, уходят при её возвращении
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColor);
  registerServiceWorker();
}

// Офлайн-режим и установка как приложение (PWA). Service worker работает только по https/localhost — по file:// пропускаем
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("sw.js").catch(err => console.error("Service worker не зарегистрирован:", err));
}

// Внутри чужого <iframe> (guard.js) приложение не запускается: ни данных, ни запросов
if (!window.__framed) startApp();
