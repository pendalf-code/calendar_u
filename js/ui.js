"use strict";

/* ================= ТОСТ ================= */
const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg, ms = 2600) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
}

/* ================= МОДАЛЬНЫЕ ОКНА ================= */
function closeOverlay(overlay) {
  if (overlay.id === "scopeModal") finishScope(null);
  else overlay.classList.remove("open");
}
// Закрытие по клику вне окна — через mousedown (а не click), см. CLAUDE.md
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) closeOverlay(overlay); });
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".modal-overlay.open").forEach(closeOverlay);
  closeHeaderMenu();
});

/* ---------- Выбор области действия для повторяющегося события ---------- */
const scopeModal = document.getElementById("scopeModal");
let scopeResolve = null;

function finishScope(value) {
  const resolve = scopeResolve;
  scopeResolve = null;
  scopeModal.classList.remove("open");
  if (resolve) resolve(value);
}
// verb: "Изменить" | "Удалить". Результат: "this" | "all" | null (отмена)
function askScope(verb) {
  finishScope(null);
  return new Promise(resolve => {
    scopeResolve = resolve;
    document.getElementById("scopeText").textContent = verb + " только это вхождение или всю серию?";
    scopeModal.classList.add("open");
  });
}
scopeModal.querySelectorAll("[data-scope]").forEach(btn => {
  btn.addEventListener("click", () => finishScope(btn.dataset.scope === "cancel" ? null : btn.dataset.scope));
});

/* ================= МОДАЛКА СОБЫТИЯ ================= */
const modalOverlay = document.getElementById("modalOverlay");
const catPicker = document.getElementById("catPicker");
const evCategorySelect = document.getElementById("evCategory");
const evRepeat = document.getElementById("evRepeat");
let pickedCategory = "purple";
let editingInst = null;       // редактируемое событие или экземпляр серии (null — создание)
let attachedFiles = [];       // метаданные вложений {id,name,size,type} (или устаревшие {name,dataUrl})
const pendingFiles = new Map(); // id → File: выбраны, но ещё не записаны в IndexedDB

function fillCategorySelect(select, includeAll) {
  select.innerHTML = "";
  const add = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    select.appendChild(o);
  };
  if (includeAll) add("all", "Все категории");
  EVENT_CATEGORIES.forEach(c => add(c, c));
}

function buildColorPicker() {
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const el = document.createElement("div");
    el.className = "cat-option";
    el.style.background = cat.hex;
    el.title = cat.name;
    el.dataset.cat = key;
    el.addEventListener("click", () => { pickedCategory = key; markPickedColor(); });
    catPicker.appendChild(el);
  });
}

function markPickedColor() {
  catPicker.querySelectorAll(".cat-option").forEach(o => o.classList.toggle("active", o.dataset.cat === pickedCategory));
}

/* ---------- Повторение ---------- */
const weekdayPicker = document.getElementById("weekdayPicker");
const INTERVAL_LABELS = { daily: "Каждые N дней", weekly: "Каждые N недель", monthly: "Каждые N месяцев", yearly: "Каждые N лет" };

function buildWeekdayPicker(selected) {
  weekdayPicker.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = (settings.firstDay + i) % 7;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wd-chip" + (selected.includes(d) ? " active" : "");
    b.dataset.d = d;
    b.textContent = DOW[d];
    b.addEventListener("click", () => b.classList.toggle("active"));
    weekdayPicker.appendChild(b);
  }
}
const selectedWeekdays = () => [...weekdayPicker.querySelectorAll(".wd-chip.active")].map(b => Number(b.dataset.d));

function syncRepeatUi() {
  const freq = evRepeat.value;
  document.getElementById("repeatOpts").hidden = freq === "none";
  document.getElementById("weekdaysField").hidden = freq !== "weekly";
  document.getElementById("intervalLabel").textContent = INTERVAL_LABELS[freq] || "Интервал";
}
evRepeat.addEventListener("change", syncRepeatUi);

/* ---------- Открытие / закрытие ---------- */
function openModal(day, eventToEdit = null, preset = null) {
  editingInst = eventToEdit;
  const ev = eventToEdit;
  const master = ev ? (seriesMaster(ev) || ev) : null; // настройки повторения живут в мастере серии

  document.getElementById("eventModalTitle").textContent = ev ? "Редактировать событие" : "Новое событие";
  document.getElementById("evTitle").value = ev ? ev.title : "";
  document.getElementById("evDate").value = fmtDateInput(ev ? ev.start : day);
  document.getElementById("evStart").value = ev ? fmtTimeInput(ev.start) : preset ? minToTime(preset.startMin) : "10:00";
  document.getElementById("evEnd").value = ev ? fmtTimeInput(ev.end) : preset ? (preset.endMin >= 1440 ? "23:59" : minToTime(preset.endMin)) : "11:00";
  document.getElementById("evLocation").value = ev ? ev.location : "";
  document.getElementById("evDesc").value = ev ? ev.description : "";
  evCategorySelect.value = ev ? ev.eventCategory : EVENT_CATEGORIES[0];
  pickedCategory = ev ? ev.category : "purple";
  attachedFiles = ev ? [...ev.attachedFiles] : [];
  pendingFiles.clear();

  const r = master && master.repeat;
  evRepeat.value = r ? r.freq : "none";
  document.getElementById("evInterval").value = r ? r.interval : 1;
  document.getElementById("evUntil").value = r ? r.until : "";
  const base = ev ? ev.start : day;
  buildWeekdayPicker(r && r.byDay.length ? r.byDay : [base.getDay()]);
  syncRepeatUi();

  markPickedColor();
  updateAttachButton();
  modalOverlay.classList.add("open");
  setTimeout(() => document.getElementById("evTitle").focus(), 150);
}

function closeModal() { modalOverlay.classList.remove("open"); }

/* ---------- Вложения ---------- */
function updateAttachButton() {
  const btn = document.getElementById("attachFileBtn");
  if (attachedFiles.length > 0) {
    btn.innerHTML = ICONS.check + " Файлов: " + attachedFiles.length;
    btn.classList.add("has-file");
  } else {
    btn.innerHTML = ICONS.upload + " Загрузить файлы (до " + fmtSize(MAX_ATTACH_BYTES) + ")";
    btn.classList.remove("has-file");
  }
  const listEl = document.getElementById("attachFileList");
  listEl.innerHTML = "";
  attachedFiles.forEach((f, i) => {
    const item = document.createElement("div");
    item.className = "attach-file-item";
    item.innerHTML = `<span class="file-name">${escapeHtml(f.name)}${f.size ? " · " + fmtSize(f.size) : ""}</span><button type="button" class="file-remove" title="Убрать" aria-label="Убрать файл">${ICONS.close}</button>`;
    item.querySelector(".file-remove").addEventListener("click", () => {
      if (f.id) pendingFiles.delete(f.id);
      attachedFiles.splice(i, 1);
      updateAttachButton();
    });
    listEl.appendChild(item);
  });
}

const eventFileInput = document.getElementById("eventFileInput");
document.getElementById("attachFileBtn").addEventListener("click", () => eventFileInput.click());
eventFileInput.addEventListener("change", () => {
  for (const file of Array.from(eventFileInput.files)) {
    if (attachedFiles.length >= MAX_ATTACHED_FILES) { showToast("Максимум файлов: " + MAX_ATTACHED_FILES); break; }
    if (file.size > MAX_ATTACH_BYTES) { showToast("«" + file.name + "» больше " + fmtSize(MAX_ATTACH_BYTES)); continue; }
    const id = newAttachmentId();
    pendingFiles.set(id, file);
    attachedFiles.push({ id, name: file.name.slice(0, 255), size: file.size, type: file.type });
  }
  eventFileInput.value = "";
  updateAttachButton();
});

// Записать выбранные файлы в IndexedDB; не записавшиеся убираются из события
async function persistPendingFiles() {
  attSaving++;
  try {
    for (const [id, file] of pendingFiles) {
      const idx = attachedFiles.findIndex(f => f.id === id);
      if (idx === -1) continue;
      try {
        await attPut({ id, name: attachedFiles[idx].name, type: file.type, size: file.size, blob: file });
      } catch (err) {
        console.error("IndexedDB:", err);
        showToast("Не удалось сохранить файл «" + file.name + "» в браузере");
        attachedFiles.splice(idx, 1);
      }
    }
    pendingFiles.clear();
  } finally {
    attSaving--;
  }
}

/* ---------- Сохранение ---------- */
async function saveEventFromModal() {
  const title = document.getElementById("evTitle").value.trim();
  if (!title) { showToast("Введите название события"); return; }

  const dateVal = document.getElementById("evDate").value;
  const startVal = document.getElementById("evStart").value;
  const endVal = document.getElementById("evEnd").value;
  if (!dateVal || !startVal || !endVal) { showToast("Укажите дату, время начала и конца"); return; }

  // Время события — ровно то, что указал пользователь, без перевода между часовыми поясами
  const start = parseLocalIso(dateVal + "T" + startVal);
  const end = parseLocalIso(dateVal + "T" + endVal);
  if (end <= start) { showToast("Время конца должно быть позже начала"); return; }

  let repeat = null;
  if (evRepeat.value !== "none") {
    const until = document.getElementById("evUntil").value;
    if (until && until < dateVal) { showToast("Дата окончания повторения раньше даты события"); return; }
    const days = selectedWeekdays();
    repeat = normalizeRepeat({
      freq: evRepeat.value,
      interval: document.getElementById("evInterval").value,
      byDay: days.length ? days : [start.getDay()],
      until,
    });
  }

  await persistPendingFiles();

  const data = {
    title, start, end,
    location: document.getElementById("evLocation").value.trim(),
    description: document.getElementById("evDesc").value.trim(),
    category: pickedCategory,
    eventCategory: evCategorySelect.value,
    attachedFiles: [...attachedFiles],
    repeat,
  };

  if (editingInst) {
    // Многодневное событие: дату окончания сохраняем, если дату начала не меняли
    if (!editingInst.seriesId && fmtDateInput(editingInst.start) === dateVal && fmtDateInput(editingInst.end) !== dateVal) {
      data.end = new Date(editingInst.end.getFullYear(), editingInst.end.getMonth(), editingInst.end.getDate(), end.getHours(), end.getMinutes());
    }
    if (!(await applyEventChange(editingInst, data))) return; // отказались в диалоге области действия
  } else {
    createEvent(data);
  }

  state.selected = startOfDay(start);
  state.anchor = new Date(start);
  closeModal();
  render();
  gcAttachments();
}

document.getElementById("modalSave").addEventListener("click", saveEventFromModal);
document.getElementById("modalCancel").addEventListener("click", closeModal);

/* ================= ФИЛЬТР ПО КАТЕГОРИЯМ ================= */
const categoryFilterEl = document.getElementById("categoryFilter");
const filterWrap = document.getElementById("filterWrap");

function syncFilterUi() {
  categoryFilterEl.value = state.categoryFilter;
  filterWrap.classList.toggle("is-active", state.categoryFilter !== "all");
}
categoryFilterEl.addEventListener("change", () => {
  state.categoryFilter = categoryFilterEl.value;
  syncFilterUi();
  render();
  renderSearchResults();
});

/* ================= ПОИСК ================= */
const searchBox = document.getElementById("searchBox");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
const searchResults = document.getElementById("searchResults");
let searchTimer;
let searchHits = [];

function fmtShortDate(d) {
  const y = d.getFullYear() === new Date().getFullYear() ? "" : " " + d.getFullYear();
  return d.getDate() + " " + MONTHS_GEN[d.getMonth()] + y;
}

// Результаты — по всем датам: ближайшие и будущие сверху, прошедшие ниже
function renderSearchResults() {
  if (!state.search.trim()) { searchResults.hidden = true; searchHits = []; return; }
  const today = startOfDay(new Date());
  searchHits = state.events
    .filter(matchesFilters)
    .map(e => ({ e, date: isRecurring(e) ? (nextOccurrenceDate(e, today) || startOfDay(e.start)) : startOfDay(e.start) }))
    .sort((a, b) => {
      const fa = a.date >= today, fb = b.date >= today;
      if (fa !== fb) return fa ? -1 : 1;
      return fa ? a.date - b.date : b.date - a.date;
    })
    .slice(0, 30);

  if (!searchHits.length) {
    searchResults.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
  } else {
    searchResults.innerHTML = searchHits.map(({ e, date }, i) => `
      <button type="button" class="search-item" data-i="${i}">
        <span class="si-dot" style="background:${catOf(e).hex}"></span>
        <span class="si-main"><span class="si-title">${escapeHtml(e.title)}</span>${e.location ? `<span class="si-place">${escapeHtml(e.location)}</span>` : ""}</span>
        <span class="si-date">${e.repeat ? ICONS.repeat : ""}${fmtShortDate(date)}</span>
      </button>`).join("");
  }
  searchResults.hidden = false;
}

function jumpToSearchHit(i) {
  const hit = searchHits[i];
  if (!hit) return;
  state.anchor = new Date(hit.date);
  state.selected = hit.date;
  searchResults.hidden = true;
  render();
}

function applySearch() {
  state.search = searchInput.value;
  const active = Boolean(state.search.trim());
  searchBox.classList.toggle("is-active", active);
  searchClear.hidden = !searchInput.value;
  render();
  renderSearchResults();
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 120);
});
searchInput.addEventListener("focus", renderSearchResults);
searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") jumpToSearchHit(0);
  if (e.key === "Escape") {
    if (searchInput.value) { searchInput.value = ""; applySearch(); }
    else searchInput.blur();
    e.stopPropagation();
  }
});
searchClear.addEventListener("click", () => { searchInput.value = ""; applySearch(); searchInput.focus(); });
searchResults.addEventListener("click", e => {
  const item = e.target.closest(".search-item");
  if (item) jumpToSearchHit(Number(item.dataset.i));
});
document.addEventListener("pointerdown", e => {
  if (!searchBox.contains(e.target)) searchResults.hidden = true;
});

/* ================= МЕНЮ ШАПКИ (узкие экраны) ================= */
const menuBtn = document.getElementById("menuBtn");
const headerActions = document.getElementById("headerActions");

function closeHeaderMenu() {
  headerActions.classList.remove("open");
  menuBtn.setAttribute("aria-expanded", "false");
}
menuBtn.addEventListener("click", () => {
  const open = headerActions.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});
headerActions.addEventListener("click", e => { if (e.target.closest("button")) closeHeaderMenu(); });
document.addEventListener("pointerdown", e => {
  if (!e.target.closest(".header-menu")) closeHeaderMenu();
});

/* ================= НАВИГАЦИЯ ================= */
function shift(dir) {
  const d = state.anchor;
  if (state.view === "month") {
    // Без «перескока»: 31 янв + 1 месяц = 28/29 фев, а не март
    const target = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), lastDay));
    state.anchor = target;
  } else {
    state.anchor = addDays(d, state.view === "week" ? 7 * dir : dir);
  }
  render();
}

document.getElementById("prevBtn").addEventListener("click", () => shift(-1));
document.getElementById("nextBtn").addEventListener("click", () => shift(1));
document.getElementById("todayBtn").addEventListener("click", () => {
  state.anchor = new Date();
  state.selected = startOfDay(new Date());
  render();
});

document.querySelectorAll(".view-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b === btn));
    state.view = btn.dataset.view;
    if (state.selected) state.anchor = new Date(state.selected);
    render();
  });
});

document.getElementById("panelCloseBtn").addEventListener("click", () => {
  state.selected = null;
  render();
});
document.getElementById("panelAddBtn").addEventListener("click", () => openModal(state.selected || state.anchor));

document.getElementById("exportBtn").addEventListener("click", exportEvents);

/* ================= НАСТРОЙКИ ================= */
const settingsModal = document.getElementById("settingsModal");

document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("setTheme").value = settings.theme;
  document.getElementById("setFirstDay").value = settings.firstDay;
  document.getElementById("setWeekend").value = settings.weekend;
  document.getElementById("setTimeFormat").value = settings.timeFormat;
  document.getElementById("setHourHeight").value = settings.hourHeight;
  settingsModal.classList.add("open");
});

document.getElementById("settingsSave").addEventListener("click", () => {
  settings = normalizeSettings({
    theme: document.getElementById("setTheme").value,
    firstDay: document.getElementById("setFirstDay").value,
    weekend: document.getElementById("setWeekend").value,
    timeFormat: document.getElementById("setTimeFormat").value,
    hourHeight: document.getElementById("setHourHeight").value,
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
  gistConfig.id = document.getElementById("gistId").value.trim();
  gistConfig.token = document.getElementById("gistToken").value.trim();
  gistAuthBroken = false; // введён новый токен — пробуем снова
  saveGistConfig();
  gistModal.classList.remove("open");
  showToast(gistReady() ? "Gist подключён" : "Gist отключён");
  if (gistReady()) gistSync({ silent: false });
});
document.getElementById("gistCancel").addEventListener("click", () => gistModal.classList.remove("open"));
