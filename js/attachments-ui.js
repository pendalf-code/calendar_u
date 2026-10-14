"use strict";

/* ================= ВЛОЖЕНИЯ В ФОРМЕ СОБЫТИЯ =================
   Состояние черновика вложений редактируемого события. В IndexedDB файлы попадают только при сохранении события
   (persistPendingFiles); сами хранилище и скачивание — attachments.js. */

let attachedFiles = [];         // метаданные вложений {id,name,size,type} (или устаревшие {name,dataUrl})
const pendingFiles = new Map(); // id → File: выбраны, но ещё не записаны в IndexedDB

// Начать черновик с вложений открываемого события (пустой список — новое событие)
function resetAttachments(list) {
  attachedFiles = [...list];
  pendingFiles.clear();
  updateAttachButton();
}

function updateAttachButton() {
  const btn = document.getElementById("attachFileBtn");
  if (attachedFiles.length > 0) {
    btn.innerHTML = ICONS.check + " Файлов: " + attachedFiles.length;
    btn.classList.add("has-file");
  } else {
    btn.innerHTML = ICONS.upload + " Загрузить файлы (до " + fmtSize(MAX_ATTACH_BYTES) + ")";
    btn.classList.remove("has-file");
  }
  const listEl = document.getElementById("attachFileList");
  listEl.innerHTML = "";
  attachedFiles.forEach((f, i) => {
    const item = document.createElement("div");
    item.className = "attach-file-item";
    item.innerHTML = `<span class="file-name">${escapeHtml(f.name)}${f.size ? " · " + fmtSize(f.size) : ""}</span><button type="button" class="file-remove" title="Убрать" aria-label="Убрать файл">${ICONS.close}</button>`;
    item.querySelector(".file-remove").addEventListener("click", () => {
      if (f.id) pendingFiles.delete(f.id);
      attachedFiles.splice(i, 1);
      updateAttachButton();
    });
    listEl.appendChild(item);
  });
}

const eventFileInput = document.getElementById("eventFileInput");
document.getElementById("attachFileBtn").addEventListener("click", () => eventFileInput.click());
eventFileInput.addEventListener("change", () => {
  for (const file of Array.from(eventFileInput.files)) {
    if (attachedFiles.length >= MAX_ATTACHED_FILES) { showToast("Максимум файлов: " + MAX_ATTACHED_FILES); break; }
    if (file.size > MAX_ATTACH_BYTES) { showToast("«" + file.name + "» больше " + fmtSize(MAX_ATTACH_BYTES)); continue; }
    const id = newAttachmentId();
    pendingFiles.set(id, file);
    attachedFiles.push({ id, name: safeFileName(file.name), size: file.size, type: safeMime(file.type) });
  }
  eventFileInput.value = "";
  updateAttachButton();
});

// Записать выбранные файлы в IndexedDB; не записавшиеся убираются из события
async function persistPendingFiles() {
  attSaving++;
  try {
    for (const [id, file] of pendingFiles) {
      const idx = attachedFiles.findIndex(f => f.id === id);
      if (idx === -1) continue;
      try {
        await attPut({ id, name: attachedFiles[idx].name, type: safeMime(file.type), size: file.size, blob: file });
      } catch (err) {
        console.error("IndexedDB:", err);
        showToast("Не удалось сохранить файл «" + file.name + "» в браузере");
        attachedFiles.splice(idx, 1);
      }
    }
    pendingFiles.clear();
  } finally {
    attSaving--;
  }
}
