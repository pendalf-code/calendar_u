"use strict";

/* ================= ПЕРЕТАСКИВАНИЕ ПО СЕТКЕ =================
   Мышь/перо:
   - потянуть по пустому месту колонки   → создать событие на выбранный промежуток (шаг 15 минут);
   - потянуть блок события               → перенести (в т. ч. на другой день недели);
   - потянуть нижний край блока          → изменить длительность;
   - потянуть событие в ячейку месяца    → перенести на другой день;
   - двойной клик по пустому месту       → событие на час с этого времени.
   Тач: долгое нажатие на пустом месте колонки создаёт событие (перетаскивание отключено, чтобы не мешать скроллу;
   перенести можно через форму редактирования). */

const SNAP_MIN = 15;
const DRAG_THRESHOLD = 5;   // px до начала перетаскивания мышью
const LONG_PRESS_MS = 500;
const TOUCH_SLOP = 8;       // px: сдвиг пальца больше — это скролл, а не долгое нажатие

let drag = null;
let suppressClickUntil = 0;
const clickSuppressed = () => performance.now() < suppressClickUntil;

const snap = m => Math.round(m / SNAP_MIN) * SNAP_MIN;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const minToTime = m => pad2(Math.floor(m / 60) % 24) + ":" + pad2(m % 60);

function columnAt(clientX) {
  return [...viewContainer.querySelectorAll(".day-column")].find(c => {
    const r = c.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right;
  }) || null;
}

// Минуты от начала суток для вертикальной координаты внутри колонки
function minutesAt(col, clientY) {
  const r = col.getBoundingClientRect();
  return clamp((clientY - r.top - col.clientTop) / settings.hourHeight * 60, 0, 1440);
}

function showGhost(col, startMin, endMin, label) {
  if (!drag.ghost) {
    drag.ghost = document.createElement("div");
    drag.ghost.className = "drag-ghost";
  }
  if (drag.ghost.parentElement !== col) col.appendChild(drag.ghost);
  const hh = settings.hourHeight;
  drag.ghost.style.top = startMin / 60 * hh + "px";
  drag.ghost.style.height = Math.max((endMin - startMin) / 60 * hh, MIN_EVENT_HEIGHT) + "px";
  drag.ghost.innerHTML = `<div class="te-time">${minToTime(startMin)}–${endMin >= 1440 ? "24:00" : minToTime(endMin)}</div>` + (label ? `<div class="te-title">${escapeHtml(label)}</div>` : "");
}

function endDrag() {
  if (!drag) return;
  clearTimeout(drag.timer);
  if (drag.ghost) drag.ghost.remove();
  if (drag.chipGhost) drag.chipGhost.remove();
  viewContainer.querySelectorAll(".drag-source").forEach(el => el.classList.remove("drag-source"));
  viewContainer.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
  document.body.classList.remove("dragging");
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", endDrag);
  drag = null;
}

function onPointerDown(e) {
  if (e.button !== 0 || drag) return;
  const mouse = e.pointerType !== "touch";
  const block = e.target.closest(".timed-event");
  const chip = e.target.closest(".month-event[data-id]");
  const col = e.target.closest(".day-column");

  if (block && mouse) {
    const inst = findEventById(block.dataset.id);
    const colEl = block.parentElement;
    if (!inst) return;
    const seg = eventSegment(inst, parseDateInput(colEl.dataset.date));
    drag = {
      mode: e.target.closest(".te-resize") ? "resize" : "move",
      block, inst, col: colEl, seg,
      grab: minutesAt(colEl, e.clientY) - seg.startMin,
      durMin: Math.round((inst.end - inst.start) / 60000),
    };
  } else if (chip && mouse) {
    const inst = findEventById(chip.dataset.id);
    if (!inst) return;
    drag = { mode: "chip", chip, inst };
  } else if (col && !block) {
    drag = { mode: "create", col, anchor: minutesAt(col, e.clientY), touch: !mouse };
    if (!mouse) {
      const min = drag.anchor;
      drag.timer = setTimeout(() => {
        const start = clamp(Math.floor(min / 60) * 60, 0, 23 * 60);
        endDrag();
        suppressClickUntil = performance.now() + 400;
        openModal(parseDateInput(col.dataset.date), null, { startMin: start, endMin: start + 60 });
      }, LONG_PRESS_MS);
    }
  } else {
    return;
  }
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.active = false;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", endDrag);
}

function onPointerMove(e) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < (drag.touch ? TOUCH_SLOP : DRAG_THRESHOLD)) return;
    if (drag.touch) { endDrag(); return; } // палец поехал — это скролл
    drag.active = true;
    document.body.classList.add("dragging");
    (drag.block || drag.chip)?.classList.add("drag-source");
  }
  e.preventDefault();

  if (drag.mode === "create") {
    const cur = minutesAt(drag.col, e.clientY);
    drag.startMin = Math.min(1440 - SNAP_MIN, Math.floor(Math.min(drag.anchor, cur) / SNAP_MIN) * SNAP_MIN);
    drag.endMin = clamp(Math.ceil(Math.max(drag.anchor, cur) / SNAP_MIN) * SNAP_MIN, drag.startMin + SNAP_MIN, 1440);
    showGhost(drag.col, drag.startMin, drag.endMin, "Новое событие");
  } else if (drag.mode === "move") {
    const target = columnAt(e.clientX) || drag.target || drag.col;
    drag.target = target;
    const len = Math.min(drag.durMin, 1440);
    drag.newStartMin = clamp(snap(minutesAt(target, e.clientY) - drag.grab), 0, 1440 - len);
    showGhost(target, drag.newStartMin, drag.newStartMin + len, drag.inst.title);
  } else if (drag.mode === "resize") {
    drag.newEndMin = clamp(snap(minutesAt(drag.col, e.clientY)), drag.seg.startMin + SNAP_MIN, 1440);
    showGhost(drag.col, drag.seg.startMin, drag.newEndMin, drag.inst.title);
  } else if (drag.mode === "chip") {
    if (!drag.chipGhost) {
      drag.chipGhost = document.createElement("div");
      drag.chipGhost.className = "drag-chip";
      drag.chipGhost.textContent = drag.inst.title;
      document.body.appendChild(drag.chipGhost);
    }
    drag.chipGhost.style.left = e.clientX + 12 + "px";
    drag.chipGhost.style.top = e.clientY + 12 + "px";
    viewContainer.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
    drag.cell = document.elementFromPoint(e.clientX, e.clientY)?.closest(".month-cell") || null;
    drag.cell?.classList.add("drop-target");
  }
}

function onPointerUp() {
  const d = drag;
  endDrag();
  if (!d || !d.active) return;
  suppressClickUntil = performance.now() + 400; // гасим click, который браузер пошлёт после отпускания

  if (d.mode === "create") {
    openModal(parseDateInput(d.col.dataset.date), null, { startMin: d.startMin, endMin: d.endMin });
  } else if (d.mode === "move" && d.newStartMin != null) {
    moveEventTo(d.inst, d.target.dataset.date, d.newStartMin);
  } else if (d.mode === "resize" && d.newEndMin != null) {
    const day = startOfDay(d.inst.start);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, d.newEndMin);
    if (+end !== +d.inst.end) applyEventChange(d.inst, { start: d.inst.start, end }, "Длительность изменена");
  } else if (d.mode === "chip" && d.cell) {
    moveEventTo(d.inst, d.cell.dataset.date, d.inst.start.getHours() * 60 + d.inst.start.getMinutes());
  }
}

// Перенос экземпляра события на дату dateStr, начало — startMin минут от полуночи; длительность сохраняется
function moveEventTo(inst, dateStr, startMin) {
  const date = parseDateInput(dateStr);
  const durMin = Math.round((inst.end - inst.start) / 60000);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, startMin);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, startMin + durMin);
  if (+start === +inst.start) return;
  applyEventChange(inst, { start, end }, "Событие перенесено");
}

viewContainer.addEventListener("pointerdown", onPointerDown);

// Двойной клик по пустому месту колонки — событие на час
viewContainer.addEventListener("dblclick", e => {
  const col = e.target.closest(".day-column");
  if (!col || e.target.closest(".timed-event")) return;
  const start = clamp(Math.floor(minutesAt(col, e.clientY) / 60) * 60, 0, 23 * 60);
  openModal(parseDateInput(col.dataset.date), null, { startMin: start, endMin: start + 60 });
});
