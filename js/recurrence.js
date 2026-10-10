"use strict";

/* ================= ПОВТОРЯЮЩИЕСЯ СОБЫТИЯ =================
   Серия хранится одной записью (мастером): start/end первого вхождения + repeat + exdates.
   Вхождения не хранятся — разворачиваются на лету в «экземпляры» с id "<id>@<YYYY-MM-DD>".
   exdates — даты, исключённые из серии (удалено или изменено только одно вхождение). */

const dayNumber = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
const isRecurring = e => Boolean(e.repeat && e.repeat.freq);

// Начинается ли вхождение серии в день `day` (локальная полночь)
function occursOn(e, day) {
  const r = e.repeat;
  const diff = dayNumber(day) - dayNumber(e.start);
  if (diff < 0) return false;
  const key = fmtDateInput(day);
  if (r.until && key > r.until) return false;
  if (e.exdates.includes(key)) return false;

  const n = r.interval || 1;
  switch (r.freq) {
    case "daily":
      return diff % n === 0;
    case "weekly": {
      const days = r.byDay.length ? r.byDay : [e.start.getDay()];
      if (!days.includes(day.getDay())) return false;
      const weekIndex = Math.floor((diff + (e.start.getDay() + 6) % 7) / 7); // недели от понедельника первой недели
      return weekIndex % n === 0;
    }
    case "monthly": {
      if (day.getDate() !== e.start.getDate()) return false; // 31-е пропускает короткие месяцы
      const months = (day.getFullYear() - e.start.getFullYear()) * 12 + day.getMonth() - e.start.getMonth();
      return months % n === 0;
    }
    case "yearly":
      return day.getMonth() === e.start.getMonth() && day.getDate() === e.start.getDate() &&
        (day.getFullYear() - e.start.getFullYear()) % n === 0;
  }
  return false;
}

// Экземпляр серии, начинающийся в день d
function makeInstance(e, d) {
  const span = dayNumber(e.end) - dayNumber(e.start);
  return {
    ...e,
    id: e.id + "@" + fmtDateInput(d),
    seriesId: e.id,
    occDate: fmtDateInput(d),
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), e.start.getHours(), e.start.getMinutes()),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + span, e.end.getHours(), e.end.getMinutes()),
  };
}

// Экземпляры серии, пересекающие промежуток [ds, de)
function occurrencesIn(e, ds, de) {
  const out = [];
  const span = dayNumber(e.end) - dayNumber(e.start); // вхождение могло начаться за span дней до ds
  for (let k = span; k >= 0; k--) {
    const d = addDays(ds, -k);
    if (!occursOn(e, d)) continue;
    const inst = makeInstance(e, d);
    if (inst.start < de && inst.end > ds) out.push(inst);
  }
  return out;
}

// Событие или экземпляр серии по id из DOM
function findEventById(id) {
  const at = id.indexOf("@");
  if (at === -1) return state.events.find(e => e.id === id) || null;
  const master = state.events.find(e => e.id === id.slice(0, at));
  return master ? makeInstance(master, parseDateInput(id.slice(at + 1))) : null;
}

// Ближайшая дата вхождения не раньше `from` (для результатов поиска); null — вхождений больше нет
function nextOccurrenceDate(e, from) {
  let d = startOfDay(from) < startOfDay(e.start) ? startOfDay(e.start) : startOfDay(from);
  for (let i = 0; i < 800; i++, d = addDays(d, 1)) if (occursOn(e, d)) return d;
  return null;
}

function pluralRu(n, forms) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

function repeatLabel(r) {
  if (!r) return "";
  const n = r.interval;
  const one = { daily: "Каждый день", weekly: "Каждую неделю", monthly: "Каждый месяц", yearly: "Каждый год" };
  const many = {
    daily: ["день", "дня", "дней"], weekly: ["неделю", "недели", "недель"],
    monthly: ["месяц", "месяца", "месяцев"], yearly: ["год", "года", "лет"],
  };
  let text = n === 1 ? one[r.freq] : "Каждые " + n + " " + pluralRu(n, many[r.freq]);
  if (r.freq === "weekly" && r.byDay.length) {
    const order = [...r.byDay].sort((a, b) => ((a - settings.firstDay + 7) % 7) - ((b - settings.firstDay + 7) % 7));
    text += " (" + order.map(d => DOW[d]).join(", ") + ")";
  }
  if (r.until) text += ", до " + r.until.split("-").reverse().join(".");
  return text;
}
