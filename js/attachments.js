"use strict";

/* ================= ВЛОЖЕНИЯ: IndexedDB =================
   В событии хранятся только метаданные {id, name, size, type}; сами файлы — в IndexedDB браузера
   (лимит — десятки/сотни МБ вместо ~5 МБ у localStorage). Для синхронизации между устройствами
   каждое вложение выгружается в тот же Gist отдельным файлом att-<id>.json (см. gist.js). */

const ATT_DB_NAME = "calendar_attachments";
const ATT_STORE = "files";
let attDbPromise = null;

function attOpen() {
  if (!attDbPromise) {
    attDbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB недоступен")); return; }
      const rq = indexedDB.open(ATT_DB_NAME, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(ATT_STORE, { keyPath: "id" });
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }
  return attDbPromise;
}

function attTx(mode, fn) {
  return attOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(ATT_STORE, mode);
    const rq = fn(tx.objectStore(ATT_STORE));
    tx.oncomplete = () => resolve(rq ? rq.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));
}

const attPut = rec => attTx("readwrite", st => st.put(rec));       // rec: {id, name, type, size, blob}
const attGet = id => attTx("readonly", st => st.get(id));
const attDelete = id => attTx("readwrite", st => st.delete(id));
const attKeys = () => attTx("readonly", st => st.getAllKeys());

let attSaving = 0; // >0, пока вложения пишутся в IndexedDB — сборщик мусора в это время не работает

const newAttachmentId = () => "at" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function fmtSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " МБ";
  return Math.max(1, Math.round(bytes / 1024)) + " КБ";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const safeMime = t => (/^[\w.+-]+\/[\w.+-]+$/.test(String(t || "")) ? t : "application/octet-stream");
const base64ToBlob = async (b64, type) => (await fetch("data:" + safeMime(type) + ";base64," + b64)).blob();

// Устаревшие вложения {name, dataUrl} (лежали прямо в localStorage) → IndexedDB
async function migrateLegacyAttachments() {
  let changed = false;
  for (const e of state.events) {
    for (let i = 0; i < e.attachedFiles.length; i++) {
      const f = e.attachedFiles[i];
      if (!f.dataUrl) continue;
      try {
        const blob = await (await fetch(f.dataUrl)).blob();
        const meta = { id: newAttachmentId(), name: f.name, size: blob.size, type: blob.type };
        await attPut({ ...meta, blob });
        e.attachedFiles[i] = meta;
        changed = true;
      } catch (err) {
        console.error("Не удалось перенести вложение в IndexedDB:", err);
        return changed;
      }
    }
  }
  if (changed) saveEvents({ sync: false });
  return changed;
}

// Blob вложения: локально, а если нет — из Gist (и кладём в IndexedDB)
async function getAttachmentBlob(meta) {
  if (meta.dataUrl) return (await fetch(meta.dataUrl)).blob();
  const local = await attGet(meta.id);
  if (local) return local.blob;
  const remote = await gistFetchAttachment(meta.id);
  if (!remote) return null;
  await attPut(remote);
  return remote.blob;
}

async function downloadAttachment(meta) {
  try {
    const blob = await getAttachmentBlob(meta);
    if (!blob) { showToast("Файл «" + meta.name + "» недоступен на этом устройстве"); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = meta.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    showToast("Не удалось открыть файл: " + err.message);
  }
}

const liveAttachmentIds = () =>
  new Set(state.events.flatMap(e => e.attachedFiles.map(f => f.id).filter(Boolean)));

// Скачать из Gist вложения, которых ещё нет на устройстве (после слияния)
async function prefetchAttachments() {
  try {
    const have = new Set(await attKeys());
    for (const id of liveAttachmentIds()) {
      if (have.has(id) || !gistFiles[attFileName(id)]) continue;
      const rec = await gistFetchAttachment(id);
      if (rec) await attPut(rec);
    }
  } catch (err) { console.error("Prefetch вложений:", err); }
}

// Удалить из IndexedDB файлы, на которые не ссылается ни одно событие
async function gcAttachments() {
  if (attSaving > 0) return;
  try {
    const live = liveAttachmentIds();
    for (const id of await attKeys()) if (!live.has(id)) await attDelete(id);
  } catch (err) { /* IndexedDB недоступен — ничего не чистим */ }
}
