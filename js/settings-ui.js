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

// Подпись режима и подсказка в поле токена. Сам токен в поле не подставляется (не остаётся в DOM).
function refreshGistModal() {
  const hasToken = validGistToken(gistConfig.token);
  document.getElementById("gistToken").placeholder = hasToken ? "токен сохранён (пусто = не менять)" : "ghp_... (только для редакторов)";
  document.getElementById("gistMode").textContent = !gistReady() ? "Не подключено."
    : hasToken ? "Режим: редактор — изменения уходят в общий календарь."
    : "Режим: только просмотр — календарь только читается, править нельзя.";
  document.getElementById("gistDisconnect").hidden = !gistReady() && !gistConfig.token;
}

document.getElementById("gistBtn").addEventListener("click", () => {
  document.getElementById("gistId").value = gistConfig.id;
  document.getElementById("gistToken").value = "";
  refreshGistModal();
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
  const typed = document.getElementById("gistToken").value.trim();
  if (id && !validGistId(id)) { showToast("Gist ID — только латинские буквы a–f и цифры"); return; }
  if (typed && !validGistToken(typed)) { showToast("Токен содержит недопустимые символы"); return; }
  if (!id) { showToast("Введите Gist ID (или нажмите «Отключить Gist»)"); return; }
  gistConfig.id = id;
  if (typed) { gistConfig.token = typed; gistAuthBroken = false; } // пустое поле — прежний токен остаётся; новый токен — пробуем снова
  saveGistConfig();
  document.getElementById("gistToken").value = "";
  gistModal.classList.remove("open");
  showToast(gistCanWrite() ? "Gist подключён" : "Gist подключён: только просмотр");
  gistSync({ silent: false });
});
document.getElementById("gistDisconnect").addEventListener("click", () => {
  disconnectGist();
  document.getElementById("gistId").value = "";
  document.getElementById("gistToken").value = "";
  gistModal.classList.remove("open");
  showToast("Gist отключён, токен удалён с этого устройства");
});
document.getElementById("gistCancel").addEventListener("click", () => {
  document.getElementById("gistToken").value = "";
  gistModal.classList.remove("open");
});
