"use strict";

/* ================= ОПЕРАЦИИ С СОБЫТИЯМИ =================
   Все изменения данных идут через эти функции: они проставляют updatedAt (нужен для слияния с Gist),
   ведут «надгробия» удалённых и спрашивают область действия для повторяющихся событий. */

const touch = e => { e.updatedAt = Date.now(); return e; };
const seriesMaster = inst => state.events.find(e => e.id === (inst.seriesId || inst.id));

function commitChange(message) {
  saveEvents();
  render();
  if (message) showToast(message);
}

function createEvent(data) {
  state.events.push(touch({ id: uid(), exdates: [], ...data }));
  commitChange("Событие добавлено");
}

// Изменить событие или экземпляр серии. patch — поля события (start/end/title/...).
// Для экземпляра спрашиваем: только это вхождение или вся серия. Возвращает false, если пользователь отказался.
async function applyEventChange(inst, patch, message = "Событие обновлено") {
  const master = seriesMaster(inst);
  if (!master) return false;

  if (!inst.seriesId) {
    Object.assign(master, patch);
    touch(master);
    commitChange(message);
    return true;
  }

  const scope = await askScope("Изменить");
  if (!scope) { render(); return false; }

  if (scope === "this") {
    // Вхождение выпадает из серии и становится отдельным событием
    master.exdates = [...master.exdates, inst.occDate];
    touch(master);
    const { id, seriesId, occDate, exdates, repeat, updatedAt, ...fields } = inst;
    state.events.push(touch({ ...fields, ...patch, id: uid(), repeat: null, exdates: [] }));
  } else {
    // Вся серия: сдвигаем мастера на столько же дней, на сколько сдвинули вхождение
    const { start, end, ...rest } = patch;
    const delta = dayNumber(start) - dayNumber(inst.start);
    const span = dayNumber(end) - dayNumber(start);
    const base = addDays(startOfDay(master.start), delta);
    master.start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), start.getHours(), start.getMinutes());
    master.end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + span, end.getHours(), end.getMinutes());
    if (delta) master.exdates = master.exdates.map(k => fmtDateInput(addDays(parseDateInput(k), delta)));
    Object.assign(master, rest);
    touch(master);
  }
  commitChange(message);
  return true;
}

async function deleteEvent(inst) {
  const master = seriesMaster(inst);
  if (!master) return;

  if (inst.seriesId) {
    const scope = await askScope("Удалить");
    if (!scope) return;
    if (scope === "this") {
      master.exdates = [...master.exdates, inst.occDate];
      touch(master);
      commitChange("Вхождение удалено");
      return;
    }
  }
  state.events = state.events.filter(e => e.id !== master.id);
  state.tombstones = state.tombstones.filter(t => t.id !== master.id);
  state.tombstones.push({ id: master.id, updatedAt: Date.now() });
  commitChange(inst.seriesId ? "Серия удалена" : "Событие удалено");
}
