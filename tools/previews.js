// node tools/previews.js — regenerates e/<hash>/index.html (Discord/OG link previews) from the live data
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), SITE = "https://sleepyplinko.github.io/pdatracker/";
const TYPES = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html" };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s).split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };

const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    if (p.endsWith("app.js")) d = Buffer.from(String(d).replace("  const byId = new Map();", "  const byId = new Map(); window.__pda = () => ({ entries, h5, imagesOf, DESC });"));
    r.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); r.end(d);
  });
}).listen(0, async () => {
  const b = await chromium.launch(), pg = await b.newPage();
  await pg.route(/workers\.dev/, r => r.abort());
  await pg.goto(`http://localhost:${srv.address().port}/`);
  const list = await pg.evaluate(() => {
    const { entries, h5, imagesOf, DESC } = window.__pda();
    return entries.filter(e => !e.unknown).map(e => {
      const card = e.card || {}, members = card.members || [];
      const img = (imagesOf(e, card.entry, card, ...members)[0] || {}).src || "";
      let bits = [];
      if (e.section === "tools") {
        bits.push(`${e.group} · Tier ${e.tier}`);
        const s = e.stats || {};
        ["CALIBER TYPE", "DAMAGE", "RPM", "GEAR TYPE"].forEach(k => { if (s[k] != null && s[k] !== "") bits.push(`${k}: ${s[k]}`); });
        if (e.comment && e.comment.trim() !== "--") bits.push("\n" + e.comment);
      } else if (e.section === "bio") {
        bits.push(e.group);
        const base = e.isCard ? null : e.base;
        if (base && base.Health != null) bits.push(`Health ${base.Health}` + (base.Defense ? ` · Defense ${base.Defense}%` : ""));
        const d = e.desc || DESC[e.name] || card.desc || DESC[card.name] || (members[0] && (members[0].desc || DESC[members[0].name])) || "";
        if (d) bits.push("\n" + d.replace(/^\[[^\]]*\]\s*/, ""));
      } else bits.push(`${e.group} · Document`);
      return { h: h5(e.id), name: e.name, sec: e.section, img, text: bits.join(" · ").replace(/ · \n/, "\n") };
    });
  });
  await b.close(); srv.close();

  const seen = new Set(); list.forEach(x => { if (seen.has(x.h)) throw new Error("hash collision " + x.h); seen.add(x.h); });
  fs.rmSync(path.join(ROOT, "e"), { recursive: true, force: true });
  for (const x of list) {
    const img = x.img && !/^https?:/.test(x.img) ? SITE + x.img.replace(/^\.?\//, "") : x.img;
    const title = `${x.name} · PDA.exe`;
    const desc = clip(x.text, 300);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="PDA.exe · Once A Normal City tracker">
<meta property="og:title" content="${esc(x.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}e/${x.h}/">
<meta property="og:image" content="${esc(img || SITE + "icons/icon-512.png")}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#e8e8e8">
<script>location.replace("../../#e=${x.h}")</script>
</head><body style="background:#0a0a0a;color:#ddd;font-family:monospace"><a href="../../#e=${x.h}" style="color:#ddd">Open ${esc(x.name)} on PDA.exe</a></body></html>
`;
    fs.mkdirSync(path.join(ROOT, "e", x.h), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "e", x.h, "index.html"), html);
  }
  console.log(list.length, "preview pages,", list.filter(x => x.img).length, "with a picture");
});
