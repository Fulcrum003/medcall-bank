/* MedRecall service worker — robust offline support.
   On install it PRE-CACHES the app shell + the manifest + every question pack,
   so the full bank is available offline even right after a version bump or an
   iOS storage eviction. Same-origin = network-first (fresh when online, cached
   when offline); cross-origin (fonts) = cache-first. */
const CACHE = "medrecall-v8";
const SHELL = ["./", "./index.html", "./manifest.json", "./sw.js"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL).catch(() => {});
    try {
      const res = await fetch("./manifest.json", { cache: "no-store" });
      if (res.ok) {
        const mf = await res.json();
        await Promise.all((mf.packs || []).map((p) => c.add("./" + p.url).catch(() => {})));
      }
    } catch (err) {}
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { await c.focus(); return; } catch (err) {} } }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
  } else {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; }).catch(() => r))
    );
  }
});
