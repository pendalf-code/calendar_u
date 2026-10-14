"use strict";

// Загрузка классических скриптов приложения (без модулей) в тесты: файлы склеиваются в одну функцию,
// заглушки UI передаются параметрами. Так тестируется настоящий код, а не его копия.
const fs = require("node:fs");
const path = require("node:path");

const JS_DIR = path.join(__dirname, "..", "js");
const FILES = ["config", "utils", "recurrence", "holidays", "events"];

const EXPORTS = [
  "state", "MERGE_GROUP_NAMES", "fieldTime",
  "parseLocalIso", "fmtLocalIso", "fmtDateInput", "startOfDay", "addDays",
  "validateEvent", "normalizeRecords", "normalizeRepeat", "serializeEvents",
  "mergeRecords", "mergeEventFields", "recordsSignature",
  "eventSegment", "layoutEvents", "eventsForDay",
  "occursOn", "occurrencesIn", "makeInstance", "findEventById", "repeatLabel",
  "holidayName",
  "touch", "changedGroups", "createEvent", "applyEventChange", "deleteEvent",
];

function loadApp(overrides = {}) {
  const calls = { toasts: [], undos: [], saves: 0, renders: 0 };
  const stubs = {
    showToast: msg => calls.toasts.push(msg),
    render: () => { calls.renders++; },
    saveEvents: () => { calls.saves++; },
    askScope: async () => "all",
    showUndo: (message, restore) => calls.undos.push({ message, restore }),
    ...overrides,
  };
  const source = FILES.map(f => fs.readFileSync(path.join(JS_DIR, f + ".js"), "utf8")).join("\n") +
    `\nreturn { ${EXPORTS.join(", ")}, setSettings: v => { settings = v; }, getSettings: () => settings };`;
  const app = new Function(...Object.keys(stubs), source)(...Object.values(stubs));
  app.calls = calls;
  app.stubs = stubs;
  return app;
}

// Подмена Date.now на время fn (метки updatedAt в тестах должны быть предсказуемыми)
function at(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
}

// Событие в «сыром» виде (как из localStorage/Gist) → нормализованное
function ev(app, fields) {
  return app.validateEvent({
    id: "e1", title: "Событие", start: "2026-03-02T10:00:00", end: "2026-03-02T11:00:00", ...fields,
  });
}

module.exports = { loadApp, at, ev };
