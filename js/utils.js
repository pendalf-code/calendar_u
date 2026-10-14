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
function sanitizeObject(obj, depth = 0) {
  if (obj === null || typeof obj !== "object") return obj;
  if (depth > MAX_JSON_DEPTH) return null; // защита от «бомб» вложенности
  if (Array.isArray(obj)) return obj.map(v => sanitizeObject(v, depth + 1));
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    clean[key] = sanitizeObject(obj[key], depth + 1);
  }
  return clean;
}

// Имя файла из внешних данных: без путей, управляющих и служебных символов
const safeFileName = n => (String(n || "").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").trim().slice(0, 255)) || "file";

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

// Подробности выездного конкурса: только известные ключи, только непустые строки
function normalizeDetails(d) {
  const out = {};
  if (!d || typeof d !== "object") return out;
  for (const f of TRIP_FIELDS) {
    const v = String(d[f.key] == null ? "" : d[f.key]).trim().slice(0, f.multiline ? DETAIL_MAX_LEN_MULTILINE : DETAIL_MAX_LEN);
    if (v) out[f.key] = v;
  }
  return out;
}

// MIME из внешних данных: только type/subtype, иначе application/octet-stream (всегда строка)
const safeMime = t => {
  const s = typeof t === "string" ? t : "";
  return /^[\w.+-]+\/[\w.+-]+$/.test(s) ? s : "application/octet-stream";
};

// Вложение: новый формат {id,name,size,type} (файл лежит в IndexedDB) или устаревший {name,dataUrl}
function normalizeAttachment(f) {
  if (!f || typeof f.name !== "string") return null;
  const name = safeFileName(f.name);
  if (typeof f.dataUrl === "string" && f.dataUrl.startsWith("data:")) return { name, dataUrl: f.dataUrl };
  if (typeof f.id === "string" && /^[\w-]{1,60}$/.test(f.id)) {
    return { id: f.id, name, size: Number(f.size) || 0, type: safeMime(f.type) };
  }
  return null;
}

// Метка времени (мс): конечное положительное число не дальше года вперёд. Иначе 0 (нет метки).
// Без верхней границы запись с Infinity/1e300 всегда выигрывала бы слияние и не удалялась как «надгробие».
function safeTimestamp(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= Date.now() + MAX_FUTURE_MS ? n : 0;
}

// Метки времени по группам полей (см. MERGE_GROUPS): только известные группы с допустимым числом; нет меток — null
function normalizeFieldTimes(ft) {
  if (!ft || typeof ft !== "object") return null;
  const out = {};
  for (const g of MERGE_GROUP_NAMES) {
    const n = safeTimestamp(ft[g]);
    if (n) out[g] = n;
  }
  return Object.keys(out).length ? out : null;
}

// Метка времени последней правки группы полей; у записи без fieldTimes (старый формат) — общий updatedAt
const fieldTime = (e, group) => (e.fieldTimes && e.fieldTimes[group]) || e.updatedAt;

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

  const eventCategory = EVENT_CATEGORIES.includes(e.eventCategory) ? e.eventCategory : DEFAULT_EVENT_CATEGORY;
  const fieldTimes = normalizeFieldTimes(e.fieldTimes);
  return {
    id: cleanId(e.id || uid()),
    title,
    start, end,
    location: String(e.location || "").slice(0, 500),
    description: String(e.description || "").slice(0, 2000),
    category: CATEGORIES[e.category] ? e.category : DEFAULT_COLOR,
    eventCategory,
    details: eventCategory === TRIP_CATEGORY ? normalizeDetails(e.details) : {},
    // slice до map: огромный массив из внешних данных не обрабатывается целиком
    attachedFiles: (Array.isArray(e.attachedFiles) ? e.attachedFiles : []).slice(0, MAX_ATTACHED_FILES * 4)
      .map(normalizeAttachment).filter(Boolean).slice(0, MAX_ATTACHED_FILES),
    repeat: normalizeRepeat(e.repeat),
    exdates: (Array.isArray(e.exdates) ? e.exdates : []).slice(0, 4000).map(String).filter(k => DATE_KEY_RE.test(k)).slice(0, 1000),
    updatedAt: safeTimestamp(e.updatedAt), // 0 — запись без метки (старый формат)
    ...(fieldTimes ? { fieldTimes } : {}),
  };
}

// Сырые записи (localStorage, Gist) → { events, tombstones }. Запись {id, deleted:true, updatedAt} — «надгробие».
function normalizeRecords(arr) {
  const events = [];
  const tombstones = [];
  if (!Array.isArray(arr)) return { events, tombstones };
  for (const raw of sanitizeObject(arr).slice(0, MAX_RECORDS * 2)) {
    if (events.length >= MAX_RECORDS && tombstones.length >= MAX_RECORDS) break;
    if (raw && raw.deleted === true && raw.id) {
      if (tombstones.length < MAX_RECORDS) tombstones.push({ id: cleanId(raw.id), updatedAt: safeTimestamp(raw.updatedAt) });
    } else if (events.length < MAX_RECORDS) {
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

// Слияние двух версий одного события по группам полей: каждая группа берётся от той записи, где её правили позже
// (при равенстве — от `a`, локальной). Если все группы достались одной записи, возвращается она сама.
function mergeEventFields(a, b) {
  const pick = {};
  for (const g of MERGE_GROUP_NAMES) pick[g] = fieldTime(b, g) > fieldTime(a, g) ? b : a;
  const winners = new Set(Object.values(pick));
  if (winners.size === 1) return [...winners][0];

  const out = { ...a, fieldTimes: {}, updatedAt: Math.max(a.updatedAt, b.updatedAt) };
  for (const g of MERGE_GROUP_NAMES) {
    for (const f of MERGE_GROUPS[g]) out[f] = pick[g][f];
    out.fieldTimes[g] = fieldTime(pick[g], g);
  }
  return out;
}

// Слияние по id. Событие против события — по группам полей (mergeEventFields).
// Событие против «надгробия»: побеждает больший updatedAt; при равенстве удаление сильнее правки.
function mergeRecords(local, remote) {
  const map = new Map();
  const consider = (rec, deleted) => {
    const cur = map.get(rec.id);
    if (!cur) { map.set(rec.id, { rec, deleted }); return; }
    if (!deleted && !cur.deleted) { map.set(rec.id, { rec: mergeEventFields(cur.rec, rec), deleted: false }); return; }
    if (rec.updatedAt > cur.rec.updatedAt || (rec.updatedAt === cur.rec.updatedAt && deleted && !cur.deleted)) {
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
  return r.events.map(e => e.id + ":" + e.updatedAt + ":" + MERGE_GROUP_NAMES.map(g => fieldTime(e, g)).join(",") + ":0")
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
