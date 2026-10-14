"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, ev } = require("./helpers");

const app = loadApp();
const D = (y, m, d) => new Date(y, m - 1, d);
const series = (repeat, fields = {}) => ev(app, { id: "s", start: "2026-03-02T10:00:00", end: "2026-03-02T11:00:00", repeat, ...fields });
const days = (e, from, to) => {
  const out = [];
  for (let d = from; d < to; d = app.addDays(d, 1)) if (app.occursOn(e, d)) out.push(app.fmtDateInput(d));
  return out;
};

test("daily с интервалом 2", () => {
  const e = series({ freq: "daily", interval: 2 });
  assert.deepEqual(days(e, D(2026, 3, 1), D(2026, 3, 9)), ["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-08"]);
});

test("weekly: дни недели и интервал 2 (недели считаются от понедельника первой недели)", () => {
  // 2026-03-02 — понедельник
  const e = series({ freq: "weekly", interval: 2, byDay: [1, 3] });
  assert.deepEqual(days(e, D(2026, 3, 1), D(2026, 3, 23)), ["2026-03-02", "2026-03-04", "2026-03-16", "2026-03-18"]);
});

test("weekly: воскресенье — последний день недели, начатой в понедельник раньше", () => {
  // старт — воскресенье 2026-03-01 (неделя 23.02–01.03); через неделю (02–08.03) пропуск, затем 09–15.03
  const e = series({ freq: "weekly", interval: 2, byDay: [0, 1] }, { start: "2026-03-01T10:00:00", end: "2026-03-01T11:00:00" });
  assert.deepEqual(days(e, D(2026, 3, 1), D(2026, 3, 17)), ["2026-03-01", "2026-03-09", "2026-03-15"]);
});

test("monthly: 31-е пропускает короткие месяцы", () => {
  const e = series({ freq: "monthly", interval: 1 }, { start: "2026-01-31T10:00:00", end: "2026-01-31T11:00:00" });
  assert.deepEqual(days(e, D(2026, 1, 1), D(2026, 6, 1)), ["2026-01-31", "2026-03-31", "2026-05-31"]);
});

test("yearly", () => {
  const e = series({ freq: "yearly", interval: 1 }, { start: "2024-02-29T10:00:00", end: "2024-02-29T11:00:00" });
  assert.deepEqual(days(e, D(2024, 1, 1), D(2029, 1, 1)), ["2024-02-29", "2028-02-29"]);
});

test("until включительно, exdates исключаются, до старта вхождений нет", () => {
  const e = series({ freq: "daily", interval: 1, until: "2026-03-05" }, { exdates: ["2026-03-04"] });
  assert.deepEqual(days(e, D(2026, 2, 28), D(2026, 3, 10)), ["2026-03-02", "2026-03-03", "2026-03-05"]);
});

test("occurrencesIn: многодневное вхождение, начатое накануне, попадает в следующий день", () => {
  const e = series({ freq: "daily", interval: 3 }, { start: "2026-03-02T22:00:00", end: "2026-03-03T02:00:00" });
  const list = app.occurrencesIn(e, D(2026, 3, 3), D(2026, 3, 4));
  assert.deepEqual(list.map(i => i.id), ["s@2026-03-02"]);
});

test("makeInstance / findEventById: id экземпляра «<id>@<дата>»", () => {
  const a = loadApp();
  a.state.events = [series({ freq: "daily", interval: 1 })];
  const inst = a.findEventById("s@2026-03-05");
  assert.equal(inst.seriesId, "s");
  assert.equal(inst.occDate, "2026-03-05");
  assert.equal(a.fmtLocalIso(inst.start), "2026-03-05T10:00:00");
  assert.equal(a.findEventById("s").id, "s");
  assert.equal(a.findEventById("нет@2026-03-05"), null);
});

test("eventsForDay: серия разворачивается, одиночное событие не дублируется", () => {
  const a = loadApp();
  a.state.events = [series({ freq: "daily", interval: 1 }), ev(a, { id: "x", start: "2026-03-03T09:00:00", end: "2026-03-03T09:30:00" })];
  assert.deepEqual(a.eventsForDay(D(2026, 3, 3)).map(e => e.id), ["x", "s@2026-03-03"]);
});

test("repeatLabel", () => {
  assert.equal(app.repeatLabel(null), "");
  assert.equal(app.repeatLabel({ freq: "daily", interval: 1, byDay: [], until: "" }), "Каждый день");
  assert.equal(app.repeatLabel({ freq: "weekly", interval: 2, byDay: [1], until: "2026-05-01" }), "Каждые 2 недели (Пн), до 01.05.2026");
  assert.equal(app.repeatLabel({ freq: "monthly", interval: 5, byDay: [], until: "" }), "Каждые 5 месяцев");
});
