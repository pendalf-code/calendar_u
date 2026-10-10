"use strict";

/* ================= КАСТОМНЫЕ ВЫПАДАЮЩИЕ СПИСКИ =================
   Нативный <select> остаётся в DOM (скрыт): из него читается value, на нём срабатывает change,
   а программная запись select.value = ... перехватывается и обновляет подпись кнопки.
   Список открывается поверх страницы (position: fixed, вынесен в <body>), поэтому не обрезается модалкой. */

const CS_CHEVRON = '<svg class="cs-chev" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CS_CHECK = '<svg class="cs-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const selectValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");

let csOpen = null; // { list, btn, close } — открытый сейчас список (одновременно не больше одного)

function enhanceSelect(select) {
  const wrap = select.closest(".select-wrapper");
  if (!wrap || select.dataset.cs) return;
  select.dataset.cs = "1";
  wrap.classList.add("cs-enhanced");
  select.classList.add("cs-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cs-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<span class="cs-label"></span>' + CS_CHEVRON;
  wrap.appendChild(btn);
  const label = btn.querySelector(".cs-label");

  const list = document.createElement("div");
  list.className = "cs-list";
  list.setAttribute("role", "listbox");
  let active = -1;

  const items = () => [...list.children];
  const currentValue = () => selectValueDesc.get.call(select);

  function sync() {
    const opt = select.options[select.selectedIndex];
    label.textContent = opt ? opt.textContent : "";
    items().forEach(it => {
      const on = it.dataset.value === currentValue();
      it.classList.toggle("selected", on);
      it.setAttribute("aria-selected", String(on));
    });
  }

  function build() {
    list.innerHTML = "";
    [...select.options].forEach((o, i) => {
      const it = document.createElement("div");
      it.className = "cs-opt";
      it.setAttribute("role", "option");
      it.dataset.value = o.value;
      it.innerHTML = '<span class="cs-opt-text"></span>' + CS_CHECK;
      it.firstChild.textContent = o.textContent;
      it.addEventListener("click", () => choose(i));
      it.addEventListener("pointermove", () => setActive(i, false));
      list.appendChild(it);
    });
    sync();
  }

  function setActive(i, scroll = true) {
    active = i;
    items().forEach((it, k) => it.classList.toggle("active", k === i));
    if (scroll && items()[i]) items()[i].scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const changed = select.options[i].value !== currentValue();
    selectValueDesc.set.call(select, select.options[i].value);
    sync();
    close();
    btn.focus();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function open() {
    if (csOpen) csOpen.close();
    if (list.children.length !== select.options.length) build();
    document.body.appendChild(list);

    const r = btn.getBoundingClientRect();
    const width = Math.max(r.width, 180);
    const below = innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below;
    list.style.minWidth = width + "px";
    list.style.maxWidth = Math.min(innerWidth - 16, 420) + "px";
    list.style.left = Math.max(8, Math.min(r.left, innerWidth - width - 8)) + "px";
    list.style.maxHeight = Math.min(300, up ? above : below) + "px";
    list.style.top = up ? "" : r.bottom + 6 + "px";
    list.style.bottom = up ? innerHeight - r.top + 6 + "px" : "";
    list.classList.toggle("up", up);

    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    setActive(Math.max(0, select.selectedIndex));
    csOpen = { list, btn, close };
  }

  function close() {
    list.remove();
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    if (csOpen && csOpen.list === list) csOpen = null;
  }

  btn.addEventListener("click", () => (btn.classList.contains("open") ? close() : open()));
  btn.addEventListener("keydown", e => {
    const isOpen = btn.classList.contains("open");
    const n = select.options.length;
    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); open(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(n - 1, active + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(n - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (active >= 0) choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } // не закрывать модалку под списком
    else if (e.key === "Tab") close();
  });

  // Клик по <label for=...> фокусирует скрытый select — переводим фокус на кнопку
  select.addEventListener("focus", () => btn.focus());
  // select.value = ... из кода обновляет подпись
  Object.defineProperty(select, "value", {
    configurable: true,
    get() { return currentValue(); },
    set(v) { selectValueDesc.set.call(select, v); sync(); },
  });

  build();
}

// Закрытие списка: клик мимо, прокрутка страницы, изменение размера окна
document.addEventListener("pointerdown", e => {
  if (csOpen && !csOpen.list.contains(e.target) && !csOpen.btn.contains(e.target)) csOpen.close();
}, true);
window.addEventListener("scroll", e => {
  if (csOpen && !csOpen.list.contains(e.target)) csOpen.close();
}, true);
window.addEventListener("resize", () => { if (csOpen) csOpen.close(); });
