"use strict";

/* ================= SERVICE WORKER: офлайн-оболочка =================
   Кэшируются только файлы самого приложения (тот же origin). Запросы к api.github.com (Gist) сюда не попадают —
   синхронизация всегда идёт напрямую в сеть. Список файлов не дублируется: берётся из index.html (ссылки с ?v=N). */

const CACHE = "calendar-shell";
const SCOPE = self.registration.scope;
const INDEX = SCOPE + "index.html";
const STATIC = ["manifest.webmanifest", "assets/icon-192.png", "assets/icon-512.png", "assets/favicon.svg"];

const abs = path => new URL(path, SCOPE).href;
const assetsOf = html => [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);

// Оставить в кэше только то, что нужно текущему index.html (иначе старые ?v=N копились бы)
async function prune(cache, html) {
  const keep = new Set([INDEX, ...STATIC.map(abs), ...assetsOf(html).map(abs)]);
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(INDEX, { cache: "no-cache" });
  if (!res.ok) throw new Error("index.html: HTTP " + res.status);
  const html = await res.clone().text();
  await cache.put(INDEX, res);
  const urls = [...STATIC, ...assetsOf(html)].map(abs);
  await Promise.all(urls.map(async u => { if (!(await cache.match(u))) await cache.add(u); }));
  await prune(cache, html);
}

// Страница: сначала сеть (с проверкой свежести, чтобы новый ?v=N подхватился сразу), без сети — копия из кэша
async function navigate() {
  try {
    const res = await fetch(INDEX, { cache: "no-cache" });
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(INDEX, res.clone());
      await prune(cache, await res.clone().text());
    }
    return res;
  } catch (e) {
    return (await caches.match(INDEX)) || Response.error();
  }
}

// Остальное: сначала кэш (адреса версионированы), промах — сеть и запись в кэш
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

self.addEventListener("install", e => e.waitUntil(precache().then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(req.mode === "navigate" ? navigate() : cacheFirst(req));
});
