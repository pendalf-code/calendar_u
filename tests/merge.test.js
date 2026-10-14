"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, ev } = require("./helpers");

const app = loadApp();
const rec = (events, tombstones = []) => ({ events, tombstones });
const one = (r, id = "e1") => r.events.find(e => e.id === id);

test("старый формат (без fieldTimes): побеждает запись с большим updatedAt целиком", () => {
  const local = ev(app, { title: "Локальное", location: "A", updatedAt: 100 });
  const remote = ev(app, { title: "Удалённое", location: "B", updatedAt: 200 });
  const m = one(app.mergeRecords(rec([local]), rec([remote])));
  assert.equal(m.title, "Удалённое");
  assert.equal(m.location, "B");
});

test("равные updatedAt: побеждает локальная запись", () => {
  const local = ev(app, { title: "Локальное", updatedAt: 100 });
  const remote = ev(app, { title: "Удалённое", updatedAt: 100 });
  assert.equal(one(app.mergeRecords(rec([local]), rec([remote]))).title, "Локальное");
});

test("правки разных полей с двух устройств сохраняются обе", () => {
  const base = { updatedAt: 100, fieldTimes: { title: 100, when: 100, location: 100, description: 100, color: 100, kind: 100, files: 100 } };
  const local = ev(app, { ...base, title: "Новое название", updatedAt: 300, fieldTimes: { ...base.fieldTimes, title: 300 } });
  const remote = ev(app, { ...base, location: "Новое место", updatedAt: 200, fieldTimes: { ...base.fieldTimes, location: 200 } });
  const m = one(app.mergeRecords(rec([local]), rec([remote])));
  assert.equal(m.title, "Новое название");
  assert.equal(m.location, "Новое место");
  assert.equal(m.updatedAt, 300);
  assert.equal(m.fieldTimes.title, 300);
  assert.equal(m.fieldTimes.location, 200);
});

test("одно и то же поле: побеждает более поздняя правка", () => {
  const base = { fieldTimes: { title: 100, when: 100, location: 100, description: 100, color: 100, kind: 100, files: 100 } };
  const local = ev(app, { ...base, title: "Старая", updatedAt: 150, fieldTimes: { ...base.fieldTimes, title: 150 } });
  const remote = ev(app, { ...base, title: "Новая", updatedAt: 250, fieldTimes: { ...base.fieldTimes, title: 250 } });
  assert.equal(one(app.mergeRecords(rec([local]), rec([remote]))).title, "Новая");
});

test("время события (start/end/repeat/exdates) берётся одной группой", () => {
  const ft = { title: 100, when: 100, location: 100, description: 100, color: 100, kind: 100, files: 100 };
  const local = ev(app, { updatedAt: 100, fieldTimes: ft });
  const remote = ev(app, {
    start: "2026-03-09T15:00:00", end: "2026-03-09T16:00:00", location: "X",
    updatedAt: 200, fieldTimes: { ...ft, when: 200 },
  });
  const m = one(app.mergeRecords(rec([local]), rec([remote])));
  assert.equal(app.fmtLocalIso(m.start), "2026-03-09T15:00:00");
  assert.equal(app.fmtLocalIso(m.end), "2026-03-09T16:00:00");
  assert.equal(m.location, "");
});

test("смесь: запись без fieldTimes против записи с fieldTimes (метка группы = updatedAt)", () => {
  const legacy = ev(app, { title: "Старое", location: "L", updatedAt: 200 });
  const modern = ev(app, { title: "Новое", location: "M", updatedAt: 300, fieldTimes: { title: 300, location: 100 } });
  const m = one(app.mergeRecords(rec([legacy]), rec([modern])));
  assert.equal(m.title, "Новое");
  assert.equal(m.location, "L"); // у legacy метка location = 200 > 100
});

test("«надгробие» новее правки — событие удалено; правка новее — событие остаётся", () => {
  const now = Date.now(); // «надгробия» старше TTL отбрасываются, поэтому метки — свежие
  const e = ev(app, { updatedAt: now - 100 });
  const dead = app.mergeRecords(rec([e]), rec([], [{ id: "e1", updatedAt: now - 50 }]));
  assert.equal(dead.events.length, 0);
  assert.equal(dead.tombstones.length, 1);
  const alive = app.mergeRecords(rec([ev(app, { updatedAt: now })]), rec([], [{ id: "e1", updatedAt: now - 50 }]));
  assert.equal(alive.events.length, 1);
});

test("при равенстве удаление сильнее правки (в любом порядке аргументов)", () => {
  const e = ev(app, { updatedAt: Date.now() });
  const t = { id: "e1", updatedAt: e.updatedAt };
  assert.equal(app.mergeRecords(rec([e]), rec([], [t])).events.length, 0);
  assert.equal(app.mergeRecords(rec([], [t]), rec([e])).events.length, 0);
});

test("recordsSignature: учитывает метки полей, а не только updatedAt", () => {
  const ft = { title: 100, when: 100, location: 100, description: 100, color: 100, kind: 100, files: 100 };
  const a = ev(app, { updatedAt: 300, fieldTimes: { ...ft, title: 300 } });
  const b = ev(app, { updatedAt: 300, fieldTimes: { ...ft, location: 300 } });
  assert.notEqual(app.recordsSignature(rec([a])), app.recordsSignature(rec([b])));
  const merged = app.mergeRecords(rec([a]), rec([b]));
  assert.notEqual(app.recordsSignature(merged), app.recordsSignature(rec([a])));
  assert.notEqual(app.recordsSignature(merged), app.recordsSignature(rec([b])));
});

test("слияние сходится: повторное слияние с теми же данными ничего не меняет, порядок не важен", () => {
  const ft = { title: 100, when: 100, location: 100, description: 100, color: 100, kind: 100, files: 100 };
  const a = ev(app, { title: "T-a", updatedAt: 300, fieldTimes: { ...ft, title: 300 } });
  const b = ev(app, { location: "L-b", description: "D-b", updatedAt: 250, fieldTimes: { ...ft, location: 250, description: 200 } });
  const ab = app.mergeRecords(rec([a]), rec([b]));
  const ba = app.mergeRecords(rec([b]), rec([a]));
  assert.equal(app.recordsSignature(ab), app.recordsSignature(ba));
  assert.equal(one(ab).title, "T-a");
  assert.equal(one(ab).location, "L-b");
  assert.equal(one(ab).description, "D-b");
  const again = app.mergeRecords(ab, rec([b]));
  assert.equal(app.recordsSignature(again), app.recordsSignature(ab));
});

test("записи только с одной стороны переносятся как есть", () => {
  const r = app.mergeRecords(rec([ev(app, { id: "a" })]), rec([ev(app, { id: "b" })]));
  assert.deepEqual(r.events.map(e => e.id).sort(), ["a", "b"]);
});

test("старые «надгробия» (старше TTL) отбрасываются при слиянии", () => {
  const r = app.mergeRecords(rec([], [{ id: "old", updatedAt: 1 }]), rec([]));
  assert.equal(r.tombstones.length, 0);
});
