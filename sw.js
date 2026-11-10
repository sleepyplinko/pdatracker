const CACHE = "pda-tracker-v81";
const CORE = ["./", "index.html", "style.css", "app.js", "data.js", "descriptions.js", "tooltips.js", "changelog.js", "ammo-links.js", "ammo.js", "contribute.js", "cloud-config.js", "screenshot-import.js", "qr.js", "sounds.js", "manifest.webmanifest", "icons/icon-192.png", "fonts/inconsolata-400.woff?v=3", "fonts/inconsolata-500.woff?v=3", "fonts/inconsolata-600.woff?v=3", "fonts/inconsolata-700.woff?v=3", "fonts/inconsolata-800.woff?v=3", "fonts/inconsolata-900.woff?v=3", "fonts/inconsolata-800-85.woff?v=3", "fonts/inconsolata-600-88.woff?v=3"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.headers.has("range") || /\.(mp4|webm)$/.test(url.pathname)) return;
  const scope = new URL("./", location).pathname;
  if (req.mode === "navigate" && url.pathname !== scope && url.pathname !== scope + "index.html") return;
  const nav = req.mode === "navigate";
  const key = nav ? "index.html" : req;
  e.respondWith(caches.open(CACHE).then(c => c.match(key, nav ? { ignoreSearch: true } : undefined).then(hit => hit || fetch(req).then(res => {
    if (res.ok && !nav) c.put(req, res.clone());
    return res;
  }).catch(() => nav ? c.match("index.html") : Response.error()))));
});
