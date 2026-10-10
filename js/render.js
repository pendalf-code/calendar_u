"use strict";

/* ================= РЕНДЕР ================= */
const viewContainer = document.getElementById("viewContainer");
const currentLabel = document.getElementById("currentLabel");
let renderedView = null; // какой вид отрисован сейчас — нужен, чтобы сохранять скролл сетки

function render() {
  const prevWrap = viewContainer.querySelector(".time-grid-wrapper");
  const prevScroll = prevWrap && renderedView === state.view
    ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft }
    : null;

  if (state.view === "month") renderMonth();
  else if (state.view === "week") renderWeek();
  else renderDay();
  renderedView = state.view;

  const wrap = viewContainer.querySelector(".time-grid-wrapper");
  if (wrap) {
    if (prevScroll) { wrap.scrollTop = prevScroll.top; wrap.scrollLeft = prevScroll.left; }
    else scrollGridToDefault(wrap);
  }
  renderPanel();
}

// При входе в вид: к первому событию, иначе к «сейчас» (если сегодня в сетке), иначе к 8:00
function scrollGridToDefault(wrap) {
  const hh = settings.hourHeight;
  const tops = [...wrap.querySelectorAll(".timed-event")].map(el => parseFloat(el.style.top));
  const nowLine = wrap.querySelector(".now-line");
  let target = 8 * hh;
  if (tops.length) target = Math.min(...tops) - hh;
  else if (nowLine) target = parseFloat(nowLine.style.top) - 2 * hh;
  wrap.scrollTop = Math.max(0, target);

  // Узкий экран: неделя шире окна — показываем сегодняшний (или выбранный) день
  const col = wrap.querySelector(".day-column.today") || wrap.querySelector(".day-column");
  const gutter = wrap.querySelector(".hour-labels").offsetWidth;
  if (col && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, col.offsetLeft - gutter - 6);
}

function bindSelect(root, selector) {
  root.querySelectorAll(selector).forEach(el => {
    el.addEventListener("click", () => {
      if (clickSuppressed()) return; // клик после перетаскивания
      state.selected = parseDateInput(el.dataset.date);
      render();
    });
  });
}

/* ---------- Месяц ---------- */
function renderMonth() {
  const year = state.anchor.getFullYear();
  const month = state.anchor.getMonth();
  currentLabel.textContent = MONTHS[month] + " " + year;

  const first = new Date(year, month, 1);
  const lead = (first.getDay() - settings.firstDay + 7) % 7;
  const startDate = addDays(first, -lead);
  const today = startOfDay(new Date());
  const weekendDays = settings.weekend.split(",").map(Number);

  let html = '<div class="month-grid">';
  for (let c = 0; c < 7; c++) {
    const dow = (settings.firstDay + c) % 7;
    html += `<div class="weekday-header${weekendDays.includes(dow) ? " weekend" : ""}">${DOW[dow]}</div>`;
  }

  for (let i = 0; i < 42; i++) {
    const day = addDays(startDate, i);
    const dayEvents = eventsForDay(day);
    const shown = dayEvents.slice(0, 3);
    const extra = dayEvents.length - shown.length;
    const cls = ["month-cell"];
    if (day.getMonth() !== month) cls.push("other-month");
    if (isSameDay(day, today)) cls.push("today");
    if (state.selected && isSameDay(day, state.selected)) cls.push("selected");
    if (weekendDays.includes(day.getDay())) cls.push("weekend");

    html += `<div class="${cls.join(" ")}" data-date="${fmtDateInput(day)}" tabindex="0"><div class="day-num">${day.getDate()}</div><div class="month-events">`;
    for (const e of shown) {
      const cat = catOf(e);
      html += `<div class="month-event" data-id="${escapeHtml(e.id)}" style="background:${cat.hex};color:${cat.text}" title="${escapeHtml(e.title)}">${e.seriesId ? ICONS.repeat : ""}${escapeHtml(e.title)}</div>`;
    }
    if (extra > 0) html += `<div class="month-event more">+${extra}<span class="more-word"> ещё</span></div>`;
    html += "</div></div>";
  }
  viewContainer.innerHTML = html + "</div>";

  bindSelect(viewContainer, ".month-cell");
  viewContainer.querySelectorAll(".month-cell").forEach(cell => {
    cell.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); cell.click(); }
    });
  });
}

/* ---------- Неделя / день ---------- */
function renderWeek() {
  const offset = (state.anchor.getDay() - settings.firstDay + 7) % 7;
  const startOfWeek = addDays(startOfDay(state.anchor), -offset);
  const endOfWeek = addDays(startOfWeek, 6);
  currentLabel.textContent = startOfWeek.getDate() + " " + MONTHS_GEN[startOfWeek.getMonth()] +
    " — " + endOfWeek.getDate() + " " + MONTHS_GEN[endOfWeek.getMonth()];
  renderTimeGrid(Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i)));
}

function renderDay() {
  const day = startOfDay(state.anchor);
  currentLabel.textContent = fmtDayTitle(day);
  renderTimeGrid([day]);
}

function renderTimeGrid(days) {
  const today = startOfDay(new Date());
  const weekendDays = settings.weekend.split(",").map(Number);
  const hh = settings.hourHeight;

  let html = `<div class="time-grid-wrapper${days.length > 1 ? " is-week" : ""}" style="--cols:${days.length};--hour-height:${hh}px">`;

  html += '<div class="time-grid-header"><div class="corner"></div>';
  for (const day of days) {
    const cls = ["day-col-header"];
    if (isSameDay(day, today)) cls.push("today");
    if (state.selected && isSameDay(day, state.selected)) cls.push("selected");
    if (weekendDays.includes(day.getDay())) cls.push("weekend");
    html += `<div class="${cls.join(" ")}" data-date="${fmtDateInput(day)}"><div class="dow-name">${DOW[day.getDay()]}</div><div class="dow-num">${day.getDate()}</div></div>`;
  }
  html += '</div><div class="time-grid-body"><div class="hour-labels">';
  for (let h = 0; h < 24; h++) html += `<div class="hour-label"><span>${fmtHourLabel(h)}</span></div>`;
  html += "</div>";

  for (const day of days) html += dayColumnHtml(day, today, weekendDays, hh);
  viewContainer.innerHTML = html + "</div></div>";

  bindSelect(viewContainer, ".day-column, .day-col-header");
  viewContainer.querySelectorAll(".timed-event").forEach(el => {
    const open = ev => {
      ev.stopPropagation();
      if (clickSuppressed()) return;
      const e = findEventById(el.dataset.id);
      if (e) openModal(startOfDay(e.start), e);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", ev => { if (ev.key === "Enter") open(ev); });
  });
}

function nowOffsetPx(hh) {
  const n = new Date();
  return (n.getHours() * 60 + n.getMinutes()) / 60 * hh;
}

function dayColumnHtml(day, today, weekendDays, hh) {
  const cls = ["day-column"];
  const isToday = isSameDay(day, today);
  if (weekendDays.includes(day.getDay())) cls.push("weekend");
  if (isToday) cls.push("today");

  let html = `<div class="${cls.join(" ")}" data-date="${fmtDateInput(day)}">`;
  for (let h = 0; h < 24; h++) html += '<div class="hour-line"></div>';

  const dayEvents = eventsForDay(day);
  const layout = layoutEvents(dayEvents, day);
  for (const e of dayEvents) {
    const cat = catOf(e);
    const pos = layout.get(e.id);
    const top = pos.startMin / 60 * hh;
    const height = Math.max((pos.endMin - pos.startMin) / 60 * hh, MIN_EVENT_HEIGHT) - 2;
    // Формула из INSTRUCTIONS: небольшой зазор между пересекающимися событиями
    const left = (pos.x * (100 / pos.total) + 1.5) + "%";
    const width = (100 / pos.total - 3) + "%";
    const ds = startOfDay(day);
    const singleDay = e.start >= ds && e.end <= addDays(ds, 1); // только такие можно растягивать
    const tip = `${e.title}\n${fmtTime(e.start)}–${fmtTime(e.end)}` + (e.location ? "\n" + e.location : "");
    html += `<div class="timed-event${height < 40 ? " compact" : ""}" data-id="${escapeHtml(e.id)}" tabindex="0" style="top:${top}px;height:${height}px;left:${left};width:${width};background:${cat.hex};color:${cat.text}" title="${escapeHtml(tip)}">` +
      `<div class="te-time">${e.seriesId ? ICONS.repeat : ""}${fmtTime(e.start)}–${fmtTime(e.end)}</div><div class="te-title">${escapeHtml(e.title)}</div>` +
      (singleDay ? '<div class="te-resize"></div>' : "") + "</div>";
  }
  if (isToday) html += `<div class="now-line" style="top:${nowOffsetPx(hh)}px"></div>`;
  return html + "</div>";
}

// Линия «сейчас» двигается без полной перерисовки
function updateNowLines() {
  document.querySelectorAll(".now-line").forEach(el => { el.style.top = nowOffsetPx(settings.hourHeight) + "px"; });
}

/* ---------- Панель событий дня ---------- */
const dayPanel = document.getElementById("dayPanel");
const panelTitle = document.getElementById("panelTitle");
const eventsList = document.getElementById("eventsList");

function renderPanel() {
  if (!state.selected) { dayPanel.classList.remove("open"); return; }
  const day = state.selected;
  panelTitle.textContent = fmtDayTitle(day);

  const evs = eventsForDay(day);
  eventsList.innerHTML = "";
  if (evs.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = state.categoryFilter === "all"
      ? "Событий нет — самое время что-нибудь запланировать"
      : "Нет событий категории «" + state.categoryFilter + "»";
    eventsList.appendChild(note);
  }

  evs.forEach((e, i) => {
    const card = document.createElement("div");
    card.className = "event-card";
    card.tabIndex = 0;
    card.style.setProperty("--cat-color", catOf(e).hex);
    card.style.animationDelay = (i * 0.05) + "s";

    // Многодневное событие: время показываем только на дне, где оно реально начинается/заканчивается
    const startsToday = e.start >= startOfDay(day);
    const endsToday = e.end <= addDays(startOfDay(day), 1);
    const timeText = (startsToday ? fmtTime(e.start) : "…") + " – " + (endsToday ? fmtTime(e.end) : "…");

    const files = e.attachedFiles.length
      ? `<div class="event-meta">${e.attachedFiles.map((f, k) => `<button type="button" class="event-file" data-att="${k}" title="Скачать">${ICONS.clip}${escapeHtml(f.name)}${f.size ? " · " + fmtSize(f.size) : ""}</button>`).join("")}</div>`
      : "";
    const place = [e.location, e.description].filter(Boolean).join(" · ");
    card.innerHTML = `
      <div class="event-time">${timeText}</div>
      <div class="event-info">
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-meta event-cat">${escapeHtml(e.eventCategory)}${e.repeat ? ` <span class="event-repeat">${ICONS.repeat}${escapeHtml(repeatLabel(e.repeat))}</span>` : ""}</div>
        ${place ? `<div class="event-meta">${escapeHtml(place)}</div>` : ""}
        ${files}
      </div>
      <button class="event-del" title="Удалить" aria-label="Удалить событие">${ICONS.close}</button>`;

    card.querySelector(".event-del").addEventListener("click", ev => {
      ev.stopPropagation();
      deleteEvent(e);
    });
    card.querySelectorAll(".event-file").forEach(btn => btn.addEventListener("click", ev => {
      ev.stopPropagation();
      downloadAttachment(e.attachedFiles[Number(btn.dataset.att)]);
    }));
    const edit = () => openModal(startOfDay(e.start), e);
    card.addEventListener("click", edit);
    card.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target === card) edit(); });
    eventsList.appendChild(card);
  });
  dayPanel.classList.add("open");
}
