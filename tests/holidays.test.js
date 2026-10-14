"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers");

const app = loadApp();
const D = (y, m, d) => new Date(y, m - 1, d);

test("фиксированные праздники", () => {
  assert.equal(app.holidayName(D(2026, 1, 1)), "Новый год");
  assert.equal(app.holidayName(D(2026, 1, 7)), "Рождество Христово");
  assert.equal(app.holidayName(D(2026, 5, 9)), "День Победы");
  assert.equal(app.holidayName(D(2026, 11, 4)), "День народного единства");
});

test("обычный день — не праздник", () => {
  assert.equal(app.holidayName(D(2026, 3, 4)), null);
  assert.equal(app.holidayName(D(2026, 1, 12)), null);
});

test("ст. 112: праздник на выходной переносится на ближайший рабочий день", () => {
  assert.match(app.holidayName(D(2026, 3, 9)), /Международный женский день/);   // 8 марта 2026 — воскресенье
  assert.match(app.holidayName(D(2026, 5, 11)), /День Победы/);                 // 9 мая 2026 — суббота
  assert.match(app.holidayName(D(2027, 5, 3)), /Праздник Весны и Труда/);       // 1 мая 2027 — суббота
  assert.match(app.holidayName(D(2027, 5, 10)), /День Победы/);                 // 9 мая 2027 — воскресенье
  assert.match(app.holidayName(D(2027, 6, 14)), /День России/);                 // 12 июня 2027 — суббота
});

test("новогодние праздники не переносятся по ст. 112", () => {
  assert.equal(app.holidayName(D(2027, 1, 11)), null); // 2 и 3 января 2027 — выходные, но 11-е не выходной
});

test("переносы по постановлениям", () => {
  assert.equal(app.holidayName(D(2026, 1, 9)), "Выходной (перенос)");
  assert.equal(app.holidayName(D(2026, 12, 31)), "Выходной (перенос)");
  assert.equal(app.holidayName(D(2027, 11, 5)), "Выходной (перенос)");
});

test("слой отключается настройкой", () => {
  const a = loadApp();
  a.setSettings({ ...a.getSettings(), holidays: false });
  assert.equal(a.holidayName(D(2026, 1, 1)), null);
});
