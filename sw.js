/* Offline support. Always tries the network first so updates show up straight away,
   and falls back to the saved copy when you're offline. */
const CACHE = "pda-tracker-v62";
const CORE = ["./", "index.html", "style.css", "app.js", "data.js", "descriptions.js", "tooltips.js", "changelog.js", "ammo-links.js", "ammo.js", "contribute.js", "cloud-config.js", "screenshot-import.js", "qr.js", "sounds.js", "manifest.webmanifest", "icons/icon-192.png", "fonts/inconsolata-400.woff?v=3", "fonts/inconsolata-500.woff?v=3", "fonts/inconsolata-600.woff?v=3", "fonts/inconsolata-700.woff?v=3", "fonts/inconsolata-800.woff?v=3", "fonts/inconsolata-900.woff?v=3", "fonts/inconsolata-800-85.woff?v=3", "fonts/inconsolata-600-88.woff?v=3"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.headers.has("range") || /\.(mp4|webm)$/.test(new URL(req.url).pathname)) return;   // let the browser stream video itself
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
