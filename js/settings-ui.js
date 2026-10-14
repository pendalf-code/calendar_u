"use strict";

/* ================= ОКНА НАСТРОЕК И GIST ================= */

/* ================= НАСТРОЙКИ ================= */
const settingsModal = document.getElementById("settingsModal");

document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("setTheme").value = settings.theme;
  document.getElementById("setFirstDay").value = settings.firstDay;
  document.getElementById("setWeekend").value = settings.weekend;
  document.getElementById("setTimeFormat").value = settings.timeFormat;
  document.getElementById("setHourHeight").value = settings.hourHeight;
  document.getElementById("setHolidays").value = settings.holidays ? "on" : "off";
  settingsModal.classList.add("open");
});

document.getElementById("settingsSave").addEventListener("click", () => {
  settings = normalizeSettings({
    theme: document.getElementById("setTheme").value,
    firstDay: document.getElementById("setFirstDay").value,
    weekend: document.getElementById("setWeekend").value,
    timeFormat: document.getElementById("setTimeFormat").value,
    hourHeight: document.getElementById("setHourHeight").value,
    holidays: document.getElementById("setHolidays").value,
  });
  saveSettings();
  settingsModal.classList.remove("open");
  render();
  showToast("Настройки сохранены");
});
document.getElementById("settingsCancel").addEventListener("click", () => settingsModal.classList.remove("open"));

/* ================= GIST ================= */
const gistModal = document.getElementById("gistModal");

document.getElementById("gistBtn").addEventListener("click", () => {
  document.getElementById("gistId").value = gistConfig.id;
  document.getElementById("gistToken").value = gistConfig.token;
  gistModal.classList.add("open");
  setTimeout(() => document.getElementById("gistId").focus(), 150);
});

document.getElementById("gistSyncBtn").addEventListener("click", () => {
  if (!gistReady()) { showToast("Сначала настройте Gist"); return; }
  showToast("Синхронизация...");
  gistSync({ silent: false });
});

document.getElementById("gistSave").addEventListener("click", () => {
  const id = document.getElementById("gistId").value.trim();
  const token = document.getElementById("gistToken").value.trim();
  if (id && !validGistId(id)) { showToast("Gist ID — только латинские буквы a–f и цифры"); return; }
  if (token && !validGistToken(token)) { showToast("Токен содержит недопустимые символы"); return; }
  gistConfig.id = id;
  gistConfig.token = token;
  gistAuthBroken = false; // введён новый токен — пробуем снова
  saveGistConfig();
  gistModal.classList.remove("open");
  showToast(gistReady() ? "Gist подключён" : "Gist отключён");
  if (gistReady()) gistSync({ silent: false });
});
document.getElementById("gistCancel").addEventListener("click", () => gistModal.classList.remove("open"));
