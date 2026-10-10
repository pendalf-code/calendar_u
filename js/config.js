"use strict";

/* ================= КОНСТАНТЫ И СОСТОЯНИЕ ================= */

// Цвета событий (ключ хранится в event.category)
const CATEGORIES = {
  purple:   { name: "Пурпурный",   hex: "#8b5cf6", text: "#ffffff" },
  amber:    { name: "Жёлтый",      hex: "#f0b429", text: "#2e2545" },
  pink:     { name: "Розовый",     hex: "#e879c9", text: "#ffffff" },
  lavender: { name: "Лавандовый",  hex: "#c4b5fd", text: "#2e2545" },
  peach:    { name: "Персиковый",  hex: "#fcd34d", text: "#2e2545" },
};
const DEFAULT_COLOR = "lavender";

// Текстовые категории (хранятся в event.eventCategory, используются в фильтре)
const EVENT_CATEGORIES = [
  "Конкурс в Москве",
  "Выездной конкурс",
  "Внутреннее мероприятие",
  "Выездное мероприятие",
  "Постановка",
  "Прочее",
];
const DEFAULT_EVENT_CATEGORY = "Прочее";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
// Индекс = Date.getDay() (0 — воскресенье)
const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const MAX_ATTACHED_FILES = 10;
const MAX_ATTACH_BYTES = 5 * 1024 * 1024; // лимит одного вложения (Gist плохо переносит большие файлы)
const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000; // сколько хранить «надгробия» удалённых событий
const MIN_EVENT_HEIGHT = 22; // px, минимальная высота события в сетке

// Ключи localStorage
const STORAGE_KEY = "calendar_events_v1";
const SETTINGS_KEY = "calendar_settings_v1";
const GIST_STORAGE_KEY = "calendar_gist_config_v1";
const GIST_FILE_NAME = "calendar-events.json";

const state = {
  view: "month",            // day | week | month
  anchor: new Date(),       // дата, вокруг которой строится вид
  selected: null,           // выбранный день (Date)
  events: [],               // [{id,title,start,end,location,description,category,eventCategory,attachedFiles,repeat,exdates,updatedAt}]
  tombstones: [],           // [{id,updatedAt}] — удалённые события (нужны для слияния с Gist)
  categoryFilter: "all",    // "all" или одно из EVENT_CATEGORIES
  search: "",               // строка поиска по названию и месту
};

// Повторение события
const REPEAT_FREQS = ["daily", "weekly", "monthly", "yearly"];

const DEFAULT_SETTINGS = {
  theme: "auto",     // auto | light | dark | sepia | ocean | forest
  firstDay: 1,       // 0 — вс, 1 — пн, 6 — сб
  weekend: "6,0",    // дни, считающиеся выходными
  timeFormat: "24",  // 24 | 12
  hourHeight: 56,    // px на час в дневной/недельной сетке
};
let settings = { ...DEFAULT_SETTINGS };

// Иконки (inline SVG, наследуют цвет текста)
const ICONS = {
  close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  clip: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  repeat: '<svg class="rep-ico" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
};
