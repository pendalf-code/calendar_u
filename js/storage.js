"use strict";

/* ================= ЛОКАЛЬНОЕ ХРАНИЛИЩЕ И ЭКСПОРТ ================= */

// sync=false — не планировать синхронизацию с Gist (например, сразу после слияния с ним)
function saveEvents({ sync = true } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEvents()));
  } catch (e) {
    showToast("Не удалось сохранить локально: хранилище переполнено или недоступно");
  }
  if (sync) scheduleGistSync();
}

function loadStoredEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const rec = normalizeRecords(JSON.parse(raw));
    state.events = rec.events;
    state.tombstones = pruneTombstones(rec.tombstones);
  } catch (e) { /* повреждённые данные — начинаем с чистого листа */ }
}

function exportEvents() {
  const blob = new Blob([JSON.stringify(serializeEvents(false), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "calendar-events-" + fmtDateInput(new Date()) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Экспортировано событий: " + state.events.length);
}
