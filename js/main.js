"use strict";

/* ================= ЗАПУСК ================= */
loadSettings();
loadStoredEvents();

fillCategorySelect(categoryFilterEl, true);
fillCategorySelect(evCategorySelect, false);
buildColorPicker();
syncFilterUi();

loadGistConfig();
render();

// Старые вложения (внутри localStorage) → IndexedDB; затем убрать «осиротевшие» файлы
migrateLegacyAttachments().then(() => gcAttachments());

if (gistReady()) gistSync(); // подтянуть и слить изменения с других устройств

setInterval(updateNowLines, 60 * 1000);
