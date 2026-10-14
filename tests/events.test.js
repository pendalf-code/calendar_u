"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, at, ev } = require("./helpers");

// Date.now подменяется на всё время асинхронной операции (touch вызывается после await диалога области действия)
async function atAsync(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
}

const series = (a, fields = {}) => ev(a, {
  id: "s", title: "Серия", start: "2026-03-02T10:00:00", end: "2026-03-02T11:00:00",
  repeat: { freq: "daily", interval: 1 }, updatedAt: 100, ...fields,
});

test("touch(e, группы): у старой записи метки фиксируются по прежнему updatedAt", () => {
  const a = loadApp();
  const e = ev(a, { updatedAt: 100 });
  at(500, () => a.touch(e, ["title"]));
  assert.equal(e.updatedAt, 500);
  assert.equal(e.fieldTimes.title, 500);
  assert.equal(e.fieldTimes.location, 100);
  assert.equal(e.fieldTimes.when, 100);
});

test("touch(e) без групп: метки полей сбрасываются, все поля = updatedAt", () => {
  const a = loadApp();
  const e = ev(a, { updatedAt: 100, fieldTimes: { title: 100 } });
  at(500, () => a.touch(e));
  assert.equal("fieldTimes" in e, false);
  assert.equal(a.fieldTime(e, "title"), 500);
});

test("changedGroups: сравнивает значения, в том числе даты и объекты", () => {
  const a = loadApp();
  const e = ev(a, {});
  const before = { title: e.title, start: e.start, end: e.end, repeat: e.repeat, exdates: e.exdates, location: e.location,
    description: e.description, category: e.category, eventCategory: e.eventCategory, details: e.details, attachedFiles: e.attachedFiles };
  e.start = new Date(e.start.getTime());
  assert.deepEqual(a.changedGroups(before, e), []);
  e.location = "Новое";
  e.end = new Date(e.end.getTime() + 60000);
  assert.deepEqual(a.changedGroups(before, e).sort(), ["location", "when"]);
});

test("applyEventChange: меняется только название — обновляется только метка title", async () => {
  const a = loadApp();
  a.state.events = [ev(a, { updatedAt: 100 })];
  const inst = a.state.events[0];
  assert.equal(await atAsync(500, () => a.applyEventChange(inst, { title: "Другое" })), true);
  const e = a.state.events[0];
  assert.equal(e.title, "Другое");
  assert.equal(e.updatedAt, 500);
  assert.equal(e.fieldTimes.title, 500);
  assert.equal(e.fieldTimes.location, 100);
  assert.equal(a.calls.saves, 1);
});

test("applyEventChange: без реальных изменений updatedAt не трогается", async () => {
  const a = loadApp();
  a.state.events = [ev(a, { updatedAt: 100 })];
  await a.applyEventChange(a.state.events[0], { title: "Событие" });
  assert.equal(a.state.events[0].updatedAt, 100);
});

test("applyEventChange «только это»: вхождение выпадает из серии и становится отдельным событием", async () => {
  const a = loadApp({ askScope: async () => "this" });
  a.state.events = [series(a)];
  const inst = a.findEventById("s@2026-03-04");
  const patch = { title: "Особое", start: inst.start, end: inst.end };
  await atAsync(900, () => a.applyEventChange(inst, patch));
  const master = a.state.events.find(e => e.id === "s");
  const single = a.state.events.find(e => e.id !== "s");
  assert.deepEqual(master.exdates, ["2026-03-04"]);
  assert.equal(master.fieldTimes.when, 900);
  assert.equal(single.title, "Особое");
  assert.equal(single.repeat, null);
  assert.equal(a.fmtLocalIso(single.start), "2026-03-04T10:00:00");
  assert.equal("fieldTimes" in single, false);
  assert.equal("seriesId" in single, false);
});

test("applyEventChange «вся серия»: мастер сдвигается, метка группы времени обновляется", async () => {
  const a = loadApp({ askScope: async () => "all" });
  a.state.events = [series(a)];
  const inst = a.findEventById("s@2026-03-04");
  const start = new Date(2026, 2, 4, 12, 0);
  const end = new Date(2026, 2, 4, 13, 0);
  await atAsync(900, () => a.applyEventChange(inst, { title: inst.title, start, end }));
  const master = a.state.events[0];
  assert.equal(a.fmtLocalIso(master.start), "2026-03-02T12:00:00");
  assert.equal(master.fieldTimes.when, 900);
  assert.equal(master.fieldTimes.title, 100);
});

test("deleteEvent: «надгробие» + кнопка отмены; отмена возвращает событие новее «надгробия»", async () => {
  const a = loadApp();
  a.state.events = [ev(a, { updatedAt: 100 })];
  await atAsync(1000, () => a.deleteEvent(a.state.events[0]));
  assert.equal(a.state.events.length, 0);
  assert.deepEqual(a.state.tombstones, [{ id: "e1", updatedAt: 1000 }]);
  assert.equal(a.calls.undos.length, 1);
  assert.equal(a.calls.undos[0].message, "Событие удалено");

  at(2000, () => a.calls.undos[0].restore());
  assert.equal(a.state.tombstones.length, 0);
  assert.equal(a.state.events.length, 1);
  assert.equal(a.state.events[0].updatedAt, 2000);

  // Слияние с копией, где уже есть «надгробие» от удаления: восстановленное событие выигрывает
  const merged = a.mergeRecords({ events: a.state.events, tombstones: [] }, { events: [], tombstones: [{ id: "e1", updatedAt: 1000 }] });
  assert.equal(merged.events.length, 1);
});

test("deleteEvent «только это вхождение»: отмена убирает только свою дату из exdates", async () => {
  const a = loadApp({ askScope: async () => "this" });
  a.state.events = [series(a, { exdates: ["2026-03-10"] })];
  await a.deleteEvent(a.findEventById("s@2026-03-04"));
  assert.deepEqual(a.state.events[0].exdates, ["2026-03-10", "2026-03-04"]);
  assert.equal(a.state.tombstones.length, 0);
  a.calls.undos[0].restore();
  assert.deepEqual(a.state.events[0].exdates, ["2026-03-10"]);
});

test("deleteEvent: отказ в диалоге области действия ничего не меняет", async () => {
  const a = loadApp({ askScope: async () => null });
  a.state.events = [series(a)];
  await a.deleteEvent(a.findEventById("s@2026-03-04"));
  assert.equal(a.state.events.length, 1);
  assert.equal(a.calls.undos.length, 0);
});
