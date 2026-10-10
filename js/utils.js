"use strict";

/* ================= ДАТЫ И ВРЕМЯ =================
   Время события — «стенное» (wall-clock): ровно то, что ввёл пользователь.
   Никакого перевода между часовыми поясами: в хранилище пишется локальный ISO без пояса,
   а любой суффикс пояса (Z, +03:00) при чтении отбрасывается. */

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
const pad2 = n => String(n).padStart(2, "0");

function fmtTime(d) {
  if (settings.timeFormat === "12") {
    const h = d.getHours();
    return (h % 12 || 12) + ":" + pad2(d.getMinutes()) + " " + (h >= 12 ? "PM" : "AM");
  }
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function fmtHourLabel(h) {
  if (settings.timeFormat === "12") return (h % 12 || 12) + " " + (h >= 12 ? "PM" : "AM");
  return pad2(h) + ":00";
}

const fmtDayTitle = d => d.getDate() + " " + MONTHS_GEN[d.getMonth()] + ", " + DOW[d.getDay()];
const fmtDateInput = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const fmtTimeInput = d => pad2(d.getHours()) + ":" + pad2(d.getMinutes());

function parseDateInput(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Локальная ISO-строка без пояса
function fmtLocalIso(d) {
  return fmtDateInput(d) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

// Разбор «стенного» времени из ISO-строки; суффикс пояса игнорируется
function parseLocalIso(s) {
  if (s instanceof Date) return new Date(s.getTime());
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s == null ? "" : s).trim());
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

// Минуты от начала дня `day`, на которых находятся начало и конец события (обрезка по границам суток)
function eventSegment(e, day) {
  const ds = startOfDay(day);
  const de = addDays(ds, 1);
  const startMin = e.start <= ds ? 0 : e.start.getHours() * 60 + e.start.getMinutes();
  const endMin = e.end >= de ? 1440 : e.end.getHours() * 60 + e.end.getMinutes();
  return { startMin, endMin: Math.max(endMin, startMin) };
}

/* ================= БЕЗОПАСНОСТЬ ================= */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// Очистка объекта от prototype pollution
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    clean[key] = sanitizeObject(obj[key]);
  }
  return clean;
}

/* ================= СОБЫТИЯ ================= */
let idCounter = 1;
const uid = () => "ev" + Date.now().toString(36) + (idCounter++);
const cleanId = id => String(id).replace(/[^\w-]/g, "_").slice(0, 50); // "@" зарезервирован под id экземпляров серии

const catOf = e => CATEGORIES[e.category] || CATEGORIES[DEFAULT_COLOR];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeRepeat(r) {
  if (!r || typeof r !== "object" || !REPEAT_FREQS.includes(r.freq)) return null;
  const byDay = Array.isArray(r.byDay)
    ? [...new Set(r.byDay.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
    : [];
  return {
    freq: r.freq,
    interval: Math.min(99, Math.max(1, parseInt(r.interval, 10) || 1)),
    byDay: r.freq === "weekly" ? byDay : [],
    until: DATE_KEY_RE.test(String(r.until || "")) ? String(r.until) : "",
  };
}

// Вложение: новый формат {id,name,size,type} (файл лежит в IndexedDB) или устаревший {name,dataUrl}
function normalizeAttachment(f) {
  if (!f || typeof f.name !== "string") return null;
  const name = f.name.slice(0, 255);
  if (typeof f.dataUrl === "string" && f.dataUrl.startsWith("data:")) return { name, dataUrl: f.dataUrl };
  if (typeof f.id === "string" && /^[\w-]{1,60}$/.test(f.id)) {
    return { id: f.id, name, size: Number(f.size) || 0, type: String(f.type || "").slice(0, 100) };
  }
  return null;
}

// Проверка и нормализация одного события; null — событие негодное
function validateEvent(e) {
  if (!e || typeof e !== "object") return null;
  const title = String(e.title || "").trim().slice(0, 200);
  if (!title) return null;

  const start = parseLocalIso(e.start);
  if (isNaN(start)) return null;
  let end = e.end ? parseLocalIso(e.end) : new Date(NaN);
  if (isNaN(end) || end <= start) {
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + 1, start.getMinutes());
  }

  return {
    id: cleanId(e.id || uid()),
    title,
    start, end,
    location: String(e.location || "").slice(0, 500),
    description: String(e.description || "").slice(0, 2000),
    category: CATEGORIES[e.category] ? e.category : DEFAULT_COLOR,
    eventCategory: EVENT_CATEGORIES.includes(e.eventCategory) ? e.eventCategory : DEFAULT_EVENT_CATEGORY,
    attachedFiles: (Array.isArray(e.attachedFiles) ? e.attachedFiles : [])
      .map(normalizeAttachment).filter(Boolean).slice(0, MAX_ATTACHED_FILES),
    repeat: normalizeRepeat(e.repeat),
    exdates: (Array.isArray(e.exdates) ? e.exdates : []).map(String).filter(k => DATE_KEY_RE.test(k)).slice(0, 1000),
    updatedAt: Number(e.updatedAt) > 0 ? Number(e.updatedAt) : 0, // 0 — запись без метки (старый формат)
  };
}

// Сырые записи (localStorage, Gist) → { events, tombstones }. Запись {id, deleted:true, updatedAt} — «надгробие».
function normalizeRecords(arr) {
  const events = [];
  const tombstones = [];
  if (!Array.isArray(arr)) return { events, tombstones };
  for (const raw of sanitizeObject(arr)) {
    if (raw && raw.deleted === true && raw.id) {
      tombstones.push({ id: cleanId(raw.id), updatedAt: Number(raw.updatedAt) || 0 });
    } else {
      const v = validateEvent(raw);
      if (v) events.push(v);
    }
  }
  return { events, tombstones };
}

const pruneTombstones = list => list.filter(t => Date.now() - t.updatedAt < TOMBSTONE_TTL_MS);

// includeDeleted=false — для экспорта (только живые события)
function serializeEvents(includeDeleted = true) {
  const live = state.events.map(e => ({ ...e, start: fmtLocalIso(e.start), end: fmtLocalIso(e.end) }));
  if (!includeDeleted) return live;
  return live.concat(state.tombstones.map(t => ({ id: t.id, deleted: true, updatedAt: t.updatedAt })));
}

// Слияние по id: побеждает запись с большим updatedAt; при равенстве — локальная, но удаление сильнее правки
function mergeRecords(local, remote) {
  const map = new Map();
  const consider = (rec, deleted) => {
    const cur = map.get(rec.id);
    if (!cur || rec.updatedAt > cur.rec.updatedAt || (rec.updatedAt === cur.rec.updatedAt && deleted && !cur.deleted)) {
      map.set(rec.id, { rec, deleted });
    }
  };
  local.events.forEach(e => consider(e, false));
  local.tombstones.forEach(t => consider(t, true));
  remote.events.forEach(e => consider(e, false));
  remote.tombstones.forEach(t => consider(t, true));

  const events = [];
  const tombstones = [];
  for (const { rec, deleted } of map.values()) (deleted ? tombstones : events).push(rec);
  return { events, tombstones: pruneTombstones(tombstones) };
}

// Отпечаток набора записей — чтобы понять, отличаются ли локальные данные от удалённых
function recordsSignature(r) {
  return r.events.map(e => e.id + ":" + e.updatedAt + ":0")
    .concat(r.tombstones.map(t => t.id + ":" + t.updatedAt + ":1"))
    .sort().join("|");
}

function matchesFilters(e) {
  if (state.categoryFilter !== "all" && e.eventCategory !== state.categoryFilter) return false;
  const q = state.search.trim().toLowerCase();
  return !q || (e.title + " " + e.location).toLowerCase().includes(q);
}

// События дня с учётом фильтров и поиска. Повторяющиеся разворачиваются в экземпляры (id вида "<id>@<дата>").
// Многодневные события попадают в каждый день, который пересекают.
function eventsForDay(day) {
  const ds = startOfDay(day);
  const de = addDays(ds, 1);
  const out = [];
  for (const e of state.events) {
    if (isRecurring(e)) out.push(...occurrencesIn(e, ds, de));
    else if (e.start < de && e.end > ds) out.push(e);
  }
  return out.filter(matchesFilters).sort((a, b) => a.start - b.start || a.end - b.end);
}

// Раскладка пересекающихся событий дня по колонкам.
// События, связанные цепочкой пересечений, образуют кластер и делят одинаковое число колонок.
function layoutEvents(events, day) {
  const result = new Map();
  const items = events
    .map(e => {
      const seg = eventSegment(e, day);
      return { e, startMin: seg.startMin, endMin: seg.endMin, occupyEnd: Math.max(seg.endMin, seg.startMin + 30), col: 0 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  let cluster = [];
  let clusterEnd = -1;
  let colEnds = [];

  const flush = () => {
    const total = cluster.reduce((m, it) => Math.max(m, it.col + 1), 1);
    for (const it of cluster) result.set(it.e.id, { x: it.col, total, startMin: it.startMin, endMin: it.endMin });
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex(end => end <= it.startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(it.occupyEnd); }
    else colEnds[col] = it.occupyEnd;
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.occupyEnd);
  }
  flush();
  return result;
}
