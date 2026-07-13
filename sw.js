/* MedRecall service worker — robust offline support.
   On install it PRE-CACHES the app shell + the manifest + every question pack,
   so the full bank is available offline even right after a version bump or an
   iOS storage eviction. Same-origin = network-first (fresh when online, cached
   when offline); cross-origin (fonts) = cache-first. */
const CACHE = "medrecall-v19";
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
  const wantReports = (e.notification.tag === "medcall-report");
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { await c.focus(); if (wantReports && c.postMessage) c.postMessage("open-reports"); return; } catch (err) {} } }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

// Cache-first is only safe for immutable assets; fonts are the only cross-origin
// assets the shell needs. Custom bank sources and the group-Script polls must NOT
// be cached: cache-first served stale banks forever, and the unique cb= poll URLs
// accumulated in the cache indefinitely.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache good responses: a transient 404/500 during a Pages deploy
          // must not overwrite the known-good offline copy.
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match(req).then((r) => {
          if (r) return r;
          // Fall back to the app shell only for page navigations. Serving HTML for
          // a missing pack JSON made r.json() blow up and aborted the whole sync.
          const wantsHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
          return wantsHTML ? caches.match("./index.html") : Response.error();
        }))
    );
  } else if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }))
    );
  }
  // Other cross-origin requests (custom bank sources, leaderboard Script) pass
  // through to the network untouched.
});
