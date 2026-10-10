"use strict";

/* ================= НАСТРОЙКИ ================= */
const THEMES = ["auto", "light", "dark", "sepia", "ocean", "forest"];
const WEEKEND_OPTIONS = ["6,0", "0", "1,6"];

// Приведение сохранённых/введённых настроек к допустимым значениям
function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? sanitizeObject(raw) : {}) };
  const weekend = String(s.weekend).replace(/\s+/g, "");
  return {
    theme: THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    firstDay: [0, 1, 6].includes(Number(s.firstDay)) ? Number(s.firstDay) : DEFAULT_SETTINGS.firstDay,
    weekend: WEEKEND_OPTIONS.includes(weekend) ? weekend : DEFAULT_SETTINGS.weekend,
    timeFormat: s.timeFormat === "12" ? "12" : "24",
    hourHeight: Math.min(120, Math.max(32, Number(s.hourHeight) || DEFAULT_SETTINGS.hourHeight)),
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    settings = normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch (e) {
    settings = { ...DEFAULT_SETTINGS };
  }
  applyTheme();
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* приватный режим */ }
  applyTheme();
}

// Тема задаётся атрибутом data-theme на <html>; "auto" — без атрибута (работает prefers-color-scheme)
function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
}
