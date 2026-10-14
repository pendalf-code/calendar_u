"use strict";

/* ================= ФИЛЬТР ПО КАТЕГОРИЯМ И ПОИСК ================= */

const categoryFilterEl = document.getElementById("categoryFilter");
const filterWrap = document.getElementById("filterWrap");

function syncFilterUi() {
  categoryFilterEl.value = state.categoryFilter;
  filterWrap.classList.toggle("is-active", state.categoryFilter !== "all");
}
categoryFilterEl.addEventListener("change", () => {
  state.categoryFilter = categoryFilterEl.value;
  syncFilterUi();
  render();
  renderSearchResults();
});

/* ================= ПОИСК ================= */
const searchBox = document.getElementById("searchBox");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
const searchResults = document.getElementById("searchResults");
let searchTimer;
let searchHits = [];

function fmtShortDate(d) {
  const y = d.getFullYear() === new Date().getFullYear() ? "" : " " + d.getFullYear();
  return d.getDate() + " " + MONTHS_GEN[d.getMonth()] + y;
}

// Результаты — по всем датам: ближайшие и будущие сверху, прошедшие ниже
function renderSearchResults() {
  if (!state.search.trim()) { searchResults.hidden = true; searchHits = []; return; }
  const today = startOfDay(new Date());
  searchHits = state.events
    .filter(matchesFilters)
    .map(e => ({ e, date: isRecurring(e) ? (nextOccurrenceDate(e, today) || startOfDay(e.start)) : startOfDay(e.start) }))
    .sort((a, b) => {
      const fa = a.date >= today, fb = b.date >= today;
      if (fa !== fb) return fa ? -1 : 1;
      return fa ? a.date - b.date : b.date - a.date;
    })
    .slice(0, 30);

  if (!searchHits.length) {
    searchResults.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
  } else {
    searchResults.innerHTML = searchHits.map(({ e, date }, i) => `
      <button type="button" class="search-item" data-i="${i}">
        <span class="si-dot" style="background:${catOf(e).hex}"></span>
        <span class="si-main"><span class="si-title">${escapeHtml(e.title)}</span>${e.location ? `<span class="si-place">${escapeHtml(e.location)}</span>` : ""}</span>
        <span class="si-date">${e.repeat ? ICONS.repeat : ""}${fmtShortDate(date)}</span>
      </button>`).join("");
  }
  searchResults.hidden = false;
}

function jumpToSearchHit(i) {
  const hit = searchHits[i];
  if (!hit) return;
  state.anchor = new Date(hit.date);
  state.selected = hit.date;
  searchResults.hidden = true;
  render();
}

function applySearch() {
  state.search = searchInput.value;
  const active = Boolean(state.search.trim());
  searchBox.classList.toggle("is-active", active);
  searchClear.hidden = !searchInput.value;
  render();
  renderSearchResults();
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 120);
});
searchInput.addEventListener("focus", renderSearchResults);
searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") jumpToSearchHit(0);
  if (e.key === "Escape") {
    if (searchInput.value) { searchInput.value = ""; applySearch(); }
    else searchInput.blur();
    e.stopPropagation();
  }
});
searchClear.addEventListener("click", () => { searchInput.value = ""; applySearch(); searchInput.focus(); });
searchResults.addEventListener("click", e => {
  const item = e.target.closest(".search-item");
  if (item) jumpToSearchHit(Number(item.dataset.i));
});
document.addEventListener("pointerdown", e => {
  if (!searchBox.contains(e.target)) searchResults.hidden = true;
});
