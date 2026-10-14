"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, at, ev } = require("./helpers");

const app = loadApp();

test("escapeHtml: экранирует все пять опасных символов", () => {
  assert.equal(app.escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(app.escapeHtml(null), "null");
});

test("safeFileName: без путей, управляющих символов и длиннее 255", () => {
  assert.equal(app.safeFileName("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(app.safeFileName("a\\b:c*d?e\"f<g>h|i"), "a_b_c_d_e_f_g_h_i");
  assert.equal(app.safeFileName("x\u0000y\u001fz"), "x_y_z");
  assert.equal(app.safeFileName(""), "file");
  assert.equal(app.safeFileName(undefined), "file");
  assert.equal(app.safeFileName("а".repeat(400)).length, 255);
});

test("safeMime: только type/subtype, всегда строка", () => {
  assert.equal(app.safeMime("image/png"), "image/png");
  assert.equal(app.safeMime("application/vnd.ms-excel"), "application/vnd.ms-excel");
  assert.equal(app.safeMime("text/html;base64,AAAA"), "application/octet-stream");
  assert.equal(app.safeMime("text/html; charset=utf-8"), "application/octet-stream");
  assert.equal(app.safeMime(["a/b"]), "application/octet-stream");
  assert.equal(app.safeMime({ toString: () => "a/b" }), "application/octet-stream");
  assert.equal(app.safeMime(""), "application/octet-stream");
  assert.equal(app.safeMime(undefined), "application/octet-stream");
});

test("BASE64_RE / base64ToBlob: чужие символы не проходят в data:-URL", async () => {
  assert.ok(app.BASE64_RE.test("SGVsbG8="));
  assert.ok(app.BASE64_RE.test(""));
  assert.ok(!app.BASE64_RE.test("AAAA,evil"));
  assert.ok(!app.BASE64_RE.test("AAAA;text/html,<script>"));
  await assert.rejects(() => app.base64ToBlob("AAAA;x", "text/plain"), /Некорректные данные/);
});

test("validGistId / validGistToken: только допустимые форматы", () => {
  assert.ok(app.validGistId("a1B2c3"));
  assert.ok(!app.validGistId(""));
  assert.ok(!app.validGistId("../users"));
  assert.ok(!app.validGistId("abc/def"));
  assert.ok(!app.validGistId("g1"));
  assert.ok(!app.validGistId("a".repeat(65)));
  assert.ok(app.validGistToken("ghp_AbC123"));
  assert.ok(app.validGistToken("github_pat_11AAA_bbb"));
  assert.ok(!app.validGistToken(""));
  assert.ok(!app.validGistToken("tok en"));
  assert.ok(!app.validGistToken("tok\nen"));
  assert.ok(!app.validGistToken("a".repeat(256)));
});

test("sanitizeObject: __proto__, constructor, prototype отбрасываются, глубина ограничена", () => {
  const dirty = JSON.parse('{"a":1,"__proto__":{"polluted":true},"constructor":{"x":1},"prototype":2,"n":{"__proto__":{"p":1},"ok":2}}');
  const clean = app.sanitizeObject(dirty);
  assert.deepEqual(clean, { a: 1, n: { ok: 2 } });
  assert.equal({}.polluted, undefined);

  let deep = { v: 1 };
  for (let i = 0; i < 30; i++) deep = { d: deep };
  let node = app.sanitizeObject(deep), depth = 0;
  while (node && node.d) { node = node.d; depth++; }
  assert.ok(depth <= 13, "глубже MAX_JSON_DEPTH ключ отбрасывается (null)");
});

test("safeTimestamp: Infinity, NaN, отрицательные и «из далёкого будущего» → 0", () => {
  const now = 1_700_000_000_000;
  at(now, () => {
    assert.equal(app.safeTimestamp(now), now);
    assert.equal(app.safeTimestamp(String(now)), now);
    assert.equal(app.safeTimestamp(now + app.MAX_FUTURE_MS), now + app.MAX_FUTURE_MS);
    assert.equal(app.safeTimestamp(now + app.MAX_FUTURE_MS + 1), 0);
    assert.equal(app.safeTimestamp(Infinity), 0);
    assert.equal(app.safeTimestamp("Infinity"), 0);
    assert.equal(app.safeTimestamp(1e300), 0);
    assert.equal(app.safeTimestamp(NaN), 0);
    assert.equal(app.safeTimestamp(-5), 0);
    assert.equal(app.safeTimestamp(null), 0);
  });
});

test("validateEvent: Infinity в updatedAt и fieldTimes не даёт выиграть слияние", () => {
  const e = ev(app, { updatedAt: Infinity, fieldTimes: { title: 1e300, when: 1000 } });
  assert.equal(e.updatedAt, 0);
  assert.deepEqual(e.fieldTimes, { when: 1000 });
});

test("normalizeRecords: «надгробие» с мусорной меткой получает 0 и со временем удаляется", () => {
  const { tombstones } = app.normalizeRecords([{ id: "t1", deleted: true, updatedAt: 1e300 }]);
  assert.equal(tombstones[0].updatedAt, 0);
});

test("normalizeRecords: потолок MAX_RECORDS для событий и надгробий", () => {
  const raw = [];
  for (let i = 0; i < app.MAX_RECORDS + 50; i++) raw.push({ id: "e" + i, title: "t", start: "2026-01-01T10:00:00" });
  assert.equal(app.normalizeRecords(raw).events.length, app.MAX_RECORDS);
});

test("validateEvent: длинные массивы вложений и exdates усечены", () => {
  const files = Array.from({ length: 500 }, (_, i) => ({ id: "f" + i, name: "n" + i, size: 1, type: "text/plain" }));
  const exdates = Array.from({ length: 5000 }, () => "2026-01-01");
  const e = ev(app, { attachedFiles: files, exdates });
  assert.equal(e.attachedFiles.length, app.MAX_ATTACHED_FILES);
  assert.equal(e.exdates.length, 1000);
});

test("normalizeAttachment: MIME очищается, имя безопасное, мусор отбрасывается", () => {
  assert.deepEqual(app.normalizeAttachment({ id: "at1", name: "../a.png", size: "12", type: "image/png;x" }),
    { id: "at1", name: ".._a.png", size: 12, type: "application/octet-stream" });
  assert.equal(app.normalizeAttachment({ id: "../x", name: "a" }), null);
  assert.equal(app.normalizeAttachment({ id: "ok", name: 5 }), null);
  assert.equal(app.normalizeAttachment(null), null);
  assert.deepEqual(app.normalizeAttachment({ name: "a", dataUrl: "data:text/plain;base64,AAAA" }), { name: "a", dataUrl: "data:text/plain;base64,AAAA" });
  assert.equal(app.normalizeAttachment({ name: "a", dataUrl: "javascript:alert(1)" }), null);
});

test("validateEvent: HTML в названии не вырезается, а хранится как текст (экранирует рендер)", () => {
  const e = ev(app, { title: "<script>alert(1)</script>" });
  assert.equal(e.title, "<script>alert(1)</script>");
  assert.equal(app.escapeHtml(e.title), "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("normalizeSettings: мусор → значения по умолчанию, __proto__ игнорируется", () => {
  const s = app.normalizeSettings(JSON.parse('{"theme":"<x>","firstDay":"9","hourHeight":"1e9","__proto__":{"a":1}}'));
  assert.equal(s.theme, "auto");
  assert.equal(s.firstDay, 1);
  assert.equal(s.hourHeight, 120);
  assert.equal({}.a, undefined);
});

test("режимы Gist: нет ID — отключено, ID без токена — только просмотр, ID + токен — редактор", () => {
  const a = loadApp();
  assert.ok(!a.gistReady() && !a.gistReadOnly() && !a.gistCanWrite());
  a.setGistConfig({ id: "abc123", token: "" });
  assert.ok(a.gistReady() && a.gistReadOnly() && !a.gistCanWrite());
  a.setGistConfig({ id: "abc123", token: "ghp_token" });
  assert.ok(a.gistReady() && !a.gistReadOnly() && a.gistCanWrite());
  a.setGistConfig({ id: "abc123", token: "bad token" });
  assert.ok(a.gistReadOnly(), "токен недопустимого формата не считается токеном");
});

test("gistRequest: в режиме просмотра заголовка Authorization нет, у редактора есть", async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { seen.push({ url, headers: opts.headers }); return { ok: true, json: async () => ({}) }; };
  try {
    const a = loadApp();
    a.setGistConfig({ id: "abc123", token: "" });
    await a.gistRequest("GET", "/gists/abc123");
    a.setGistConfig({ id: "abc123", token: "ghp_token" });
    await a.gistRequest("GET", "/gists/abc123");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(seen[0].url, "https://api.github.com/gists/abc123");
  assert.equal(seen[0].headers.Authorization, undefined);
  assert.equal(seen[1].headers.Authorization, "token ghp_token");
});

test("только просмотр: createEvent / applyEventChange / deleteEvent ничего не меняют", async () => {
  const a = loadApp();
  a.setGistConfig({ id: "abc123", token: "" });
  a.createEvent({ title: "X", start: new Date(2026, 0, 1, 10), end: new Date(2026, 0, 1, 11), category: "purple", eventCategory: "Прочее", details: {}, attachedFiles: [], repeat: null });
  assert.equal(a.state.events.length, 0);
  assert.equal(a.calls.saves, 0);
  assert.match(a.calls.toasts.at(-1), /только просмотр/);

  a.state.events.push(ev(a, { id: "e1" }));
  assert.equal(await a.applyEventChange(a.state.events[0], { title: "Y" }), false);
  assert.equal(a.state.events[0].title, "Событие");
  await a.deleteEvent(a.state.events[0]);
  assert.equal(a.state.events.length, 1);
  assert.equal(a.state.tombstones.length, 0);
});

test("редактор: правки применяются", async () => {
  const a = loadApp();
  a.setGistConfig({ id: "abc123", token: "ghp_token" });
  a.state.events.push(ev(a, { id: "e1" }));
  assert.equal(await a.applyEventChange(a.state.events[0], { title: "Y" }), true);
  assert.equal(a.state.events[0].title, "Y");
});
