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
}

// Внутри чужого <iframe> (guard.js) приложение не запускается: ни данных, ни запросов
if (!window.__framed) startApp();
