"use strict";

/* ================= ФОРМА СОБЫТИЯ =================
   Окно создания/редактирования, повторение, «Подробности» выездного конкурса.
   Вложения формы — attachments-ui.js. Данные меняются только через events.js. */

const modalOverlay = document.getElementById("modalOverlay");
const catPicker = document.getElementById("catPicker");
const evCategorySelect = document.getElementById("evCategory");
const evRepeat = document.getElementById("evRepeat");
let pickedCategory = "purple";
let editingInst = null;       // редактируемое событие или экземпляр серии (null — создание)

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

/* ---------- Подробности выездного конкурса ---------- */
const tripRow = document.getElementById("tripRow");
const detailsBtn = document.getElementById("detailsBtn");
const detailsModal = document.getElementById("detailsModal");
const detailsFields = document.getElementById("detailsFields");
let tripDetails = {};         // черновик подробностей редактируемого события {key: строка}

function buildDetailsFields() {
  TRIP_FIELDS.forEach(f => {
    const wrap = document.createElement("div");
    wrap.className = "field" + (f.multiline ? " wide" : "");
    const label = document.createElement("label");
    label.htmlFor = "det_" + f.key;
    label.textContent = f.label;
    const input = document.createElement(f.multiline ? "textarea" : "input");
    input.id = "det_" + f.key;
    input.maxLength = f.multiline ? DETAIL_MAX_LEN_MULTILINE : DETAIL_MAX_LEN;
    if (f.multiline) input.rows = 4; else input.type = "text";
    wrap.append(label, input);
    detailsFields.appendChild(wrap);
  });
}

function updateDetailsButton() {
  const n = Object.keys(tripDetails).length;
  detailsBtn.innerHTML = ICONS.details + " Подробности" + (n ? " · заполнено " + n + " из " + TRIP_FIELDS.length : "");
  detailsBtn.classList.toggle("has-file", n > 0);
}

// Кнопка «Подробности» видна только у «Выездного конкурса»
function syncTripUi() {
  tripRow.hidden = evCategorySelect.value !== TRIP_CATEGORY;
}
evCategorySelect.addEventListener("change", syncTripUi);

function openDetails() {
  TRIP_FIELDS.forEach(f => { document.getElementById("det_" + f.key).value = tripDetails[f.key] || ""; });
  detailsModal.classList.add("open");
  detailsModal.querySelector(".details-body").scrollTop = 0;
}
detailsBtn.addEventListener("click", openDetails);
document.getElementById("detailsCancel").addEventListener("click", () => detailsModal.classList.remove("open"));
document.getElementById("detailsSave").addEventListener("click", () => {
  const raw = {};
  TRIP_FIELDS.forEach(f => { raw[f.key] = document.getElementById("det_" + f.key).value; });
  tripDetails = normalizeDetails(raw);
  updateDetailsButton();
  detailsModal.classList.remove("open");
});

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
  tripDetails = ev ? { ...ev.details } : {};
  syncTripUi();
  updateDetailsButton();
  resetAttachments(ev ? ev.attachedFiles : []);

  const r = master && master.repeat;
  evRepeat.value = r ? r.freq : "none";
  document.getElementById("evInterval").value = r ? r.interval : 1;
  document.getElementById("evUntil").value = r ? r.until : "";
  const base = ev ? ev.start : day;
  buildWeekdayPicker(r && r.byDay.length ? r.byDay : [base.getDay()]);
  syncRepeatUi();

  markPickedColor();
  modalOverlay.classList.add("open");
  setTimeout(() => document.getElementById("evTitle").focus(), 150);
}

function closeModal() {
  modalOverlay.classList.remove("open");
  detailsModal.classList.remove("open");
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
    details: evCategorySelect.value === TRIP_CATEGORY ? { ...tripDetails } : {},
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
  // В виде «Список» окно не прыгает за событием, пока оно в пределах текущего окна
  const from = startOfDay(state.anchor);
  const inWindow = state.view === "agenda" && start >= from && start < addDays(from, AGENDA_DAYS);
  if (!inWindow) state.anchor = new Date(start);
  closeModal();
  render();
  gcAttachments();
}

document.getElementById("modalSave").addEventListener("click", saveEventFromModal);
document.getElementById("modalCancel").addEventListener("click", closeModal);
