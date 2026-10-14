"use strict";

/* ================= ЗАЩИТА ОТ ВСТРАИВАНИЯ (clickjacking) =================
   GitHub Pages не отдаёт заголовки X-Frame-Options / CSP frame-ancestors, а в <meta> CSP они не работают.
   Поэтому страница сама прячет интерфейс, если открыта внутри чужого <iframe>, и main.js не запускает приложение.
   Скрипт подключается первым, в <head>. */
(function () {
  let framed;
  try { framed = window.top !== window.self; } catch (e) { framed = true; } // чужой top → доступ кидает исключение
  if (!framed) return;
  window.__framed = true;
  document.documentElement.hidden = true;
  document.documentElement.style.display = "none";
})();
