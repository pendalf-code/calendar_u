"use strict";

/* ================= ОПЕРАЦИИ С СОБЫТИЯМИ =================
   Все изменения данных идут через эти функции: они проставляют updatedAt (нужен для слияния с Gist),
   ведут «надгробия» удалённых и спрашивают область действия для повторяющихся событий. */

/* Метки времени: updatedAt — последняя правка записи, fieldTimes[группа] — последняя правка группы полей (MERGE_GROUPS).
   touch(e)         — правка «всего события» (создание, восстановление): fieldTimes сбрасывается, все группы = updatedAt;
   touch(e, groups) — правка только перечисленных групп: остальные сохраняют свои метки (у старой записи без fieldTimes
                      сначала фиксируются метки = прежний updatedAt). Так правки разных полей с двух устройств не затирают друг друга. */
function touch(e, groups) {
  const now = Date.now();
  if (groups) {
    const ft = {};
    for (const g of MERGE_GROUP_NAMES) ft[g] = fieldTime(e, g);
    for (const g of groups) ft[g] = now;
    e.fieldTimes = ft;
  } else {
    delete e.fieldTimes;
  }
  e.updatedAt = now;
  return e;
}

const MERGE_FIELDS = MERGE_GROUP_NAMES.flatMap(g => MERGE_GROUPS[g]);
const snapshotFields = e => Object.fromEntries(MERGE_FIELDS.map(f => [f, e[f]]));
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b); // Date → ISO-строка

// Группы, поля которых у e отличаются от снимка before
const changedGroups = (before, e) =>
  MERGE_GROUP_NAMES.filter(g => MERGE_GROUPS[g].some(f => !sameValue(before[f], e[f])));

// Отметить правку мастера: touch только изменённых групп (нет изменений — метки не трогаем)
function touchChanged(master, before) {
  const groups = changedGroups(before, master);
  if (groups.length) touch(master, groups);
}

const seriesMaster = inst => state.events.find(e => e.id === (inst.seriesId || inst.id));

// Режим «только просмотр» (Gist без токена): правки не ушли бы в общий календарь и разошлись бы с остальными устройствами
const READ_ONLY_MSG = "Режим «только просмотр»: чтобы править календарь, нужен токен редактора";
function blockedByReadOnly() {
  if (!gistReadOnly()) return false;
  showToast(READ_ONLY_MSG);
  return true;
}

function commitChange(message) {
  saveEvents();
  render();
  if (message) showToast(message);
}

function createEvent(data) {
  if (blockedByReadOnly()) return;
  state.events.push(touch({ id: uid(), exdates: [], ...data }));
  commitChange("Событие добавлено");
}

// Изменить событие или экземпляр серии. patch — поля события (start/end/title/...).
// Для экземпляра спрашиваем: только это вхождение или вся серия. Возвращает false, если пользователь отказался.
async function applyEventChange(inst, patch, message = "Событие обновлено") {
  if (blockedByReadOnly()) { render(); return false; }
  const master = seriesMaster(inst);
  if (!master) return false;

  if (!inst.seriesId) {
    const before = snapshotFields(master);
    Object.assign(master, patch);
    touchChanged(master, before);
    commitChange(message);
    return true;
  }

  const scope = await askScope("Изменить");
  if (!scope) { render(); return false; }

  if (scope === "this") {
    // Вхождение выпадает из серии и становится отдельным событием
    master.exdates = [...master.exdates, inst.occDate];
    touch(master, ["when"]);
    const { id, seriesId, occDate, exdates, repeat, updatedAt, fieldTimes, ...fields } = inst;
    state.events.push(touch({ ...fields, ...patch, id: uid(), repeat: null, exdates: [] }));
  } else {
    // Вся серия: сдвигаем мастера на столько же дней, на сколько сдвинули вхождение
    const before = snapshotFields(master);
    const { start, end, ...rest } = patch;
    const delta = dayNumber(start) - dayNumber(inst.start);
    const span = dayNumber(end) - dayNumber(start);
    const base = addDays(startOfDay(master.start), delta);
    master.start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), start.getHours(), start.getMinutes());
    master.end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + span, end.getHours(), end.getMinutes());
    if (delta) master.exdates = master.exdates.map(k => fmtDateInput(addDays(parseDateInput(k), delta)));
    Object.assign(master, rest);
    touchChanged(master, before);
  }
  commitChange(message);
  return true;
}

// Удаление с возможностью отмены: showUndo (ui.js) на UNDO_MS показывает кнопку «Отменить»
async function deleteEvent(inst) {
  if (blockedByReadOnly()) return;
  const master = seriesMaster(inst);
  if (!master) return;

  if (inst.seriesId) {
    const scope = await askScope("Удалить");
    if (!scope) return;
    if (scope === "this") {
      master.exdates = [...master.exdates, inst.occDate];
      touch(master, ["when"]);
      commitChange();
      showUndo("Вхождение удалено", () => {
        master.exdates = master.exdates.filter(k => k !== inst.occDate); // только эта дата: другие правки серии не трогаем
        touch(master, ["when"]);
      });
      return;
    }
  }
  state.events = state.events.filter(e => e.id !== master.id);
  state.tombstones = state.tombstones.filter(t => t.id !== master.id);
  state.tombstones.push({ id: master.id, updatedAt: Date.now() });
  commitChange();
  showUndo(inst.seriesId ? "Серия удалена" : "Событие удалено", () => {
    // Новый updatedAt сильнее «надгробия», в том числе уже ушедшего в Gist
    state.tombstones = state.tombstones.filter(t => t.id !== master.id);
    state.events.push(touch(master));
  });
}
