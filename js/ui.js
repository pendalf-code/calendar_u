"use strict";

/* ================= ОБЩИЙ UI: тост, «Отменить», окна, меню, навигация ================= */

/* ================= ТОСТ ================= */
const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg, ms = 2600) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
}

/* ================= «ОТМЕНИТЬ» ПОСЛЕ УДАЛЕНИЯ =================
   Отдельная плашка, а не тост: тост перекрывается другими сообщениями (например, «Синхронизировано»).
   Пока плашка видна, gcHold не даёт сборщику мусора удалить файлы вложений удалённого события. */
const undoBar = document.getElementById("undoBar");
const undoText = document.getElementById("undoText");
let undoPending = null; // { restore, timer }

function closeUndo() {
  if (!undoPending) return;
  clearTimeout(undoPending.timer);
  undoPending = null;
  undoBar.classList.remove("show");
  gcHold--;
  gcAttachments();
}

// message — что произошло; restore — вернуть данные (без сохранения и перерисовки: это делает кнопка)
function showUndo(message, restore) {
  closeUndo();
  gcHold++;
  undoText.textContent = message;
  undoPending = { restore, timer: setTimeout(closeUndo, UNDO_MS) };
  undoBar.classList.add("show");
}

document.getElementById("undoBtn").addEventListener("click", () => {
  const pending = undoPending;
  if (!pending) return;
  pending.restore();
  saveEvents();
  render();
  closeUndo(); // после restore: сборщик мусора должен увидеть вернувшиеся вложения
  showToast("Восстановлено");
});

/* ================= МОДАЛЬНЫЕ ОКНА ================= */
function closeOverlay(overlay) {
  if (overlay.id === "scopeModal") finishScope(null);
  else overlay.classList.remove("open");
}
// Закрытие по клику вне окна — через mousedown (а не click), см. CLAUDE.md
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) closeOverlay(overlay); });
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".modal-overlay.open").forEach(closeOverlay);
  closeHeaderMenu();
});

/* ---------- Выбор области действия для повторяющегося события ---------- */
const scopeModal = document.getElementById("scopeModal");
let scopeResolve = null;

function finishScope(value) {
  const resolve = scopeResolve;
  scopeResolve = null;
  scopeModal.classList.remove("open");
  if (resolve) resolve(value);
}
// verb: "Изменить" | "Удалить". Результат: "this" | "all" | null (отмена)
function askScope(verb) {
  finishScope(null);
  return new Promise(resolve => {
    scopeResolve = resolve;
    document.getElementById("scopeText").textContent = verb + " только это вхождение или всю серию?";
    scopeModal.classList.add("open");
  });
}
scopeModal.querySelectorAll("[data-scope]").forEach(btn => {
  btn.addEventListener("click", () => finishScope(btn.dataset.scope === "cancel" ? null : btn.dataset.scope));
});

/* ================= МЕНЮ ШАПКИ ================= */
const menuBtn = document.getElementById("menuBtn");
const headerActions = document.getElementById("headerActions");

function closeHeaderMenu() {
  headerActions.classList.remove("open");
  menuBtn.setAttribute("aria-expanded", "false");
}
menuBtn.addEventListener("click", () => {
  const open = headerActions.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});
headerActions.addEventListener("click", e => { if (e.target.closest("button")) closeHeaderMenu(); });
document.addEventListener("pointerdown", e => {
  if (!e.target.closest(".header-menu")) closeHeaderMenu();
});

/* ================= НАВИГАЦИЯ ================= */
function shift(dir) {
  const d = state.anchor;
  if (state.view === "month") {
    // Без «перескока»: 31 янв + 1 месяц = 28/29 фев, а не март
    const target = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), lastDay));
    state.anchor = target;
  } else {
    const step = state.view === "week" ? 7 : state.view === "agenda" ? AGENDA_DAYS : 1;
    state.anchor = addDays(d, step * dir);
  }
  render();
}

document.getElementById("prevBtn").addEventListener("click", () => shift(-1));
document.getElementById("nextBtn").addEventListener("click", () => shift(1));
document.getElementById("todayBtn").addEventListener("click", () => {
  state.anchor = new Date();
  state.selected = startOfDay(new Date());
  render();
});

document.querySelectorAll(".view-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b === btn));
    state.view = btn.dataset.view;
    if (state.selected) state.anchor = new Date(state.selected);
    render();
  });
});

document.getElementById("panelCloseBtn").addEventListener("click", () => {
  state.selected = null;
  render();
});
document.getElementById("panelAddBtn").addEventListener("click", () => openModal(state.selected || state.anchor));

document.getElementById("exportBtn").addEventListener("click", exportEvents);
