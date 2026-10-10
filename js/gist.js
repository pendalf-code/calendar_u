"use strict";

/* ================= СИНХРОНИЗАЦИЯ ЧЕРЕЗ GITHUB GIST =================
   Файлы Gist:
   - calendar-events.json — события и «надгробия» удалённых (метаданные вложений внутри событий);
   - att-<id>.json        — по одному файлу на вложение: {name, type, size, data(base64)}.
   Слияние идёт по id и updatedAt (см. mergeRecords в utils.js): правки с разных устройств не затирают друг друга. */

const ATT_PREFIX = "att-";
const attFileName = id => ATT_PREFIX + id + ".json";

let gistConfig = { id: "", token: "" };
let gistSyncTimer = null;
let gistSyncing = false;
let gistResync = false;
let gistAuthBroken = false; // GitHub ответил 401: токен истёк или отозван
const TOKEN_EXPIRED_MSG = "Токен истек - синхронизация не работает. Свяжитесь с разработчиком.";
let gistFiles = {}; // список файлов Gist с последней синхронизации

const gistReady = () => Boolean(gistConfig.id && gistConfig.token);

function loadGistConfig() {
  try {
    const raw = localStorage.getItem(GIST_STORAGE_KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      gistConfig = { id: String(cfg.id || ""), token: String(cfg.token || "") };
    }
  } catch (e) { /* ignore */ }
  updateGistButton();
}

function saveGistConfig() {
  try { localStorage.setItem(GIST_STORAGE_KEY, JSON.stringify(gistConfig)); } catch (e) { /* ignore */ }
  updateGistButton();
}

function updateGistButton() {
  const ok = gistReady() && !gistAuthBroken;
  document.getElementById("gistBtn").classList.toggle("connected", ok);
  document.getElementById("menuBtn").classList.toggle("gist-on", ok);
  document.getElementById("menuBtn").classList.toggle("gist-bad", gistReady() && gistAuthBroken);
  document.getElementById("gistBtn").title = gistAuthBroken ? "Токен недействителен" : gistReady() ? "Gist подключён" : "Настроить GitHub Gist синхронизацию";
}

async function gistRequest(method, url, body) {
  const res = await fetch("https://api.github.com" + url, {
    method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "Authorization": "token " + gistConfig.token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.message || ("HTTP " + res.status));
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// Большие файлы GitHub отдаёт усечёнными — тогда берём raw_url
async function gistReadFile(file) {
  if (!file.truncated && file.content != null) return file.content;
  return (await fetch(file.raw_url)).text();
}

async function gistFetchAttachment(id) {
  if (!gistReady()) return null;
  let file = gistFiles[attFileName(id)];
  if (!file) {
    gistFiles = (await gistRequest("GET", "/gists/" + gistConfig.id)).files || {};
    file = gistFiles[attFileName(id)];
  }
  if (!file) return null;
  const obj = JSON.parse(await gistReadFile(file));
  const type = safeMime(obj.type);
  const blob = await base64ToBlob(String(obj.data || ""), type);
  return { id, name: String(obj.name || "file").slice(0, 255), type, size: blob.size, blob };
}

// Полная синхронизация: скачать → слить с локальными → записать результат обратно.
// silent=true (фон, автосинхронизация) — тост только если что-то изменилось.
async function gistSync({ silent = true } = {}) {
  if (!gistReady()) return;
  if (gistAuthBroken && silent) return; // токен мёртв — автосинхронизацию не повторяем, ручная попытка разрешена
  if (gistSyncing) { gistResync = true; return; }
  gistSyncing = true;
  try {
    const gist = await gistRequest("GET", "/gists/" + gistConfig.id);
    gistFiles = gist.files || {};

    let remote = { events: [], tombstones: [] };
    let legacyRemote = false;
    const eventsFile = gistFiles[GIST_FILE_NAME];
    if (eventsFile) {
      const text = await gistReadFile(eventsFile);
      remote = normalizeRecords(JSON.parse(text));
      legacyRemote = text.includes('"dataUrl"'); // вложения в старом формате — перезапишем
    }

    const local = { events: state.events, tombstones: state.tombstones };
    const merged = mergeRecords(local, remote);
    const changedLocal = recordsSignature(merged) !== recordsSignature(local);
    const changedRemote = recordsSignature(merged) !== recordsSignature(remote) || legacyRemote;

    if (changedLocal) {
      state.events = merged.events;
      state.tombstones = merged.tombstones;
      saveEvents({ sync: false });
      render();
    }
    await migrateLegacyAttachments();

    // Файл событий + удаление вложений, на которые больше никто не ссылается
    const live = liveAttachmentIds();
    const files = {};
    if (changedRemote) files[GIST_FILE_NAME] = { content: JSON.stringify(serializeEvents(), null, 2) };
    for (const name of Object.keys(gistFiles)) {
      if (name.startsWith(ATT_PREFIX) && !live.has(name.slice(ATT_PREFIX.length, -".json".length))) files[name] = null;
    }
    if (Object.keys(files).length) await gistRequest("PATCH", "/gists/" + gistConfig.id, { files });

    // Новые вложения — по одному запросу, чтобы сбой большого файла не ломал синхронизацию событий
    let uploaded = 0, failed = 0;
    for (const id of live) {
      if (gistFiles[attFileName(id)]) continue;
      const rec = await attGet(id).catch(() => null);
      if (!rec) continue;
      try {
        const content = JSON.stringify({ name: rec.name, type: rec.type, size: rec.size, data: await blobToBase64(rec.blob) });
        await gistRequest("PATCH", "/gists/" + gistConfig.id, { files: { [attFileName(id)]: { content } } });
        uploaded++;
      } catch (err) {
        failed++;
        console.error("Вложение не выгружено в Gist:", err);
      }
    }

    await prefetchAttachments();
    await gcAttachments();

    if (failed) showToast("Вложений не выгружено в Gist: " + failed + " (слишком большие?)");
    else if (!silent || changedLocal || changedRemote || uploaded) {
      showToast(changedLocal ? "Синхронизировано: получены изменения из Gist" : "Синхронизировано с Gist");
    }
  } catch (e) {
    console.error("Gist sync error:", e);
    if (e.status === 401) {
      gistAuthBroken = true;
      updateGistButton();
      showToast(TOKEN_EXPIRED_MSG, 9000);
    } else if (!silent) showToast("Ошибка синхронизации: " + e.message);
    else if (e.message && !/Failed to fetch|NetworkError/.test(e.message)) showToast("Ошибка Gist: " + e.message);
  } finally {
    gistSyncing = false;
    if (gistResync) { gistResync = false; scheduleGistSync(); }
  }
}

function scheduleGistSync() {
  if (!gistReady()) return;
  clearTimeout(gistSyncTimer);
  gistSyncTimer = setTimeout(() => gistSync(), 2000); // debounce 2 секунды
}
