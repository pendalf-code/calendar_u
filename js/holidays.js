"use strict";

/* ================= ПРАЗДНИКИ РФ =================
   Отдельный слой: события не затрагивает, только подсветка дней и подпись.
   Данные зашиты в код (без сети). Состав:
   - RU_HOLIDAYS — нерабочие праздничные дни по ст. 112 ТК РФ (даты не меняются);
   - правило ст. 112: праздник на субботу/воскресенье переносится на ближайший рабочий день (кроме 1–8 января);
   - RU_DAYOFF_DECREES — переносы по постановлениям Правительства на конкретные годы; для года, которого здесь нет,
     работают только фиксированные даты и правило ст. 112 — таблицу пополняют раз в год. */

const RU_HOLIDAYS = [
  { m: 1, d: 1, name: "Новый год", jan: true },
  { m: 1, d: 2, name: "Новогодние каникулы", jan: true },
  { m: 1, d: 3, name: "Новогодние каникулы", jan: true },
  { m: 1, d: 4, name: "Новогодние каникулы", jan: true },
  { m: 1, d: 5, name: "Новогодние каникулы", jan: true },
  { m: 1, d: 6, name: "Новогодние каникулы", jan: true },
  { m: 1, d: 7, name: "Рождество Христово", jan: true },
  { m: 1, d: 8, name: "Новогодние каникулы", jan: true },
  { m: 2, d: 23, name: "День защитника Отечества" },
  { m: 3, d: 8, name: "Международный женский день" },
  { m: 5, d: 1, name: "Праздник Весны и Труда" },
  { m: 5, d: 9, name: "День Победы" },
  { m: 6, d: 12, name: "День России" },
  { m: 11, d: 4, name: "День народного единства" },
];

// Дополнительные выходные по постановлениям: { год: { "ММ-ДД": подпись } }
const RU_DAYOFF_DECREES = {
  2026: { "01-09": "Выходной (перенос)", "12-31": "Выходной (перенос)" },
  2027: { "02-22": "Выходной (перенос)", "11-05": "Выходной (перенос)", "12-31": "Выходной (перенос)" },
};

const holidayCache = new Map(); // год → Map("ММ-ДД" → подпись)
const dayKey = (m, d) => pad2(m) + "-" + pad2(d);

function buildHolidayYear(year) {
  const map = new Map();
  for (const h of RU_HOLIDAYS) map.set(dayKey(h.m, h.d), h.name);

  // Ст. 112: праздник на выходной → выходной на ближайший следующий рабочий день
  for (const h of RU_HOLIDAYS) {
    if (h.jan) continue;
    const dow = new Date(year, h.m - 1, h.d).getDay();
    if (dow !== 0 && dow !== 6) continue;
    let t = new Date(year, h.m - 1, h.d + 1);
    while (t.getDay() === 0 || t.getDay() === 6 || map.has(dayKey(t.getMonth() + 1, t.getDate()))) {
      t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    }
    if (t.getFullYear() === year) map.set(dayKey(t.getMonth() + 1, t.getDate()), "Выходной за " + h.name);
  }

  for (const [key, label] of Object.entries(RU_DAYOFF_DECREES[year] || {})) map.set(key, label);
  return map;
}

// Название праздника (или подпись переноса) для дня `day`; null — обычный день или слой отключён в настройках
function holidayName(day) {
  if (!settings.holidays) return null;
  const y = day.getFullYear();
  let map = holidayCache.get(y);
  if (!map) { map = buildHolidayYear(y); holidayCache.set(y, map); }
  return map.get(dayKey(day.getMonth() + 1, day.getDate())) || null;
}
