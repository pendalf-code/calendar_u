"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, ev } = require("./helpers");

const app = loadApp();

test("parseLocalIso: суффикс пояса отбрасывается, время «настенное»", () => {
  const d = app.parseLocalIso("2026-03-05T10:30:00Z");
  assert.equal(d.getHours(), 10);
  assert.equal(d.getMinutes(), 30);
  assert.equal(app.parseLocalIso("2026-03-05T10:30:00+03:00").getHours(), 10);
});

test("parseLocalIso / fmtLocalIso: круговое преобразование", () => {
  assert.equal(app.fmtLocalIso(app.parseLocalIso("2026-12-31T23:59:00")), "2026-12-31T23:59:00");
  assert.ok(isNaN(app.parseLocalIso("мусор")));
});

test("validateEvent: пустое название и битая дата — отказ", () => {
  assert.equal(app.validateEvent({ title: "  ", start: "2026-03-02T10:00:00" }), null);
  assert.equal(app.validateEvent({ title: "A", start: "не дата" }), null);
  assert.equal(app.validateEvent(null), null);
});

test("validateEvent: конец не позже начала → +1 час", () => {
  const e = ev(app, { end: "2026-03-02T09:00:00" });
  assert.equal(app.fmtLocalIso(e.end), "2026-03-02T11:00:00");
});

test("validateEvent: неизвестные категории → значения по умолчанию, details только у выездного конкурса", () => {
  const a = ev(app, { category: "нет", eventCategory: "нет", details: { position: "x" } });
  assert.equal(a.category, "lavender");
  assert.equal(a.eventCategory, "Прочее");
  assert.deepEqual(a.details, {});
  const b = ev(app, { eventCategory: "Выездной конкурс", details: { position: " x ", bogus: "y" } });
  assert.deepEqual(b.details, { position: "x" });
});

test("validateEvent: fieldTimes — только известные группы с положительными числами", () => {
  const a = ev(app, { updatedAt: 5, fieldTimes: { title: 10, bogus: 99, when: -1, color: "7" } });
  assert.deepEqual(a.fieldTimes, { title: 10, color: 7 });
  assert.equal("fieldTimes" in ev(app, { fieldTimes: { bogus: 1 } }), false);
  assert.equal("fieldTimes" in ev(app, {}), false);
});

test("validateEvent: id очищается, «@» вырезается", () => {
  assert.equal(ev(app, { id: "a@2026-01-01" }).id, "a_2026-01-01");
});

test("normalizeRecords: события и «надгробия» раздельно, __proto__ не проходит", () => {
  const raw = JSON.parse('[{"id":"a","title":"A","start":"2026-03-02T10:00:00","__proto__":{"x":1}},{"id":"b","deleted":true,"updatedAt":7},{"title":""}]');
  const r = app.normalizeRecords(raw);
  assert.equal(r.events.length, 1);
  assert.deepEqual(r.tombstones, [{ id: "b", updatedAt: 7 }]);
  assert.equal({}.x, undefined);
  assert.deepEqual(app.normalizeRecords("не массив"), { events: [], tombstones: [] });
});

test("serializeEvents: даты в локальном ISO, fieldTimes сохраняются, надгробия по флагу", () => {
  const a = loadApp();
  a.state.events = [ev(a, { updatedAt: 3, fieldTimes: { title: 3 } })];
  a.state.tombstones = [{ id: "t", updatedAt: 1 }];
  const all = a.serializeEvents();
  assert.equal(all[0].start, "2026-03-02T10:00:00");
  assert.deepEqual(all[0].fieldTimes, { title: 3 });
  assert.deepEqual(all[1], { id: "t", deleted: true, updatedAt: 1 });
  assert.equal(a.serializeEvents(false).length, 1);
});

test("eventSegment: многодневное событие обрезается по суткам", () => {
  const e = ev(app, { start: "2026-03-02T22:00:00", end: "2026-03-04T02:00:00" });
  assert.deepEqual(app.eventSegment(e, new Date(2026, 2, 2)), { startMin: 22 * 60, endMin: 1440 });
  assert.deepEqual(app.eventSegment(e, new Date(2026, 2, 3)), { startMin: 0, endMin: 1440 });
  assert.deepEqual(app.eventSegment(e, new Date(2026, 2, 4)), { startMin: 0, endMin: 120 });
});

test("layoutEvents: пересекающиеся делят колонки, непересекающиеся — нет", () => {
  const day = new Date(2026, 2, 2);
  const mk = (id, s, e) => ev(app, { id, start: `2026-03-02T${s}:00`, end: `2026-03-02T${e}:00` });
  const layout = app.layoutEvents([mk("a", "10:00", "11:00"), mk("b", "10:30", "11:30"), mk("c", "13:00", "14:00")], day);
  assert.equal(layout.get("a").total, 2);
  assert.equal(layout.get("b").total, 2);
  assert.notEqual(layout.get("a").x, layout.get("b").x);
  assert.equal(layout.get("c").total, 1);
});

test("layoutEvents: цепочка пересечений — один кластер", () => {
  const day = new Date(2026, 2, 2);
  const mk = (id, s, e) => ev(app, { id, start: `2026-03-02T${s}:00`, end: `2026-03-02T${e}:00` });
  const layout = app.layoutEvents([mk("a", "10:00", "11:00"), mk("b", "10:30", "12:00"), mk("c", "11:30", "12:30")], day);
  assert.equal(layout.get("a").total, layout.get("c").total);
});
