const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), SITE = "https://sleepyplinko.github.io/pdatracker/";
const API = (fs.readFileSync(path.join(ROOT, "cloud-config.js"), "utf8").match(/api:\s*"([^"]+)"/) || [])[1];
const TYPES = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".woff": "font/woff", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif" };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s).split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const OUT = path.join(ROOT, "e"), MAN = path.join(OUT, "manifest.json");
const VERSION = 4;

async function overrides() {
  if (!API || process.env.NO_OVERRIDES) return {};
  try { const r = await fetch(API + "/api/overrides"); return r.ok ? await r.json() : {}; } catch { return {}; }
}

const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    if (p.endsWith("app.js")) d = Buffer.from(String(d).replace("  const byId = new Map();", "  const byId = new Map(); window.__pda = () => ({ entries, h5, imagesOf, DESC, STAT, TOOL_STAT_COLORS });"));
    r.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); r.end(d);
  });
}).listen(0, async () => {
  const ov = await overrides();
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await pg.route(/workers\.dev/, r => r.abort());
  await pg.addInitScript(o => {
    localStorage.setItem("pda-settings-v1", JSON.stringify({ tourDone: true, bootAnim: false, pageAnim: false, sound: false }));
    localStorage.setItem("pda-overrides-v1", JSON.stringify(o));
  }, ov);
  await pg.goto(`http://localhost:${srv.address().port}/`);
  await pg.waitForFunction(() => window.__pda && document.fonts.status === "loaded");

  const list = await pg.evaluate(() => {
    const { entries, h5, imagesOf, DESC, STAT, TOOL_STAT_COLORS } = window.__pda();
    const W_KEYS = ["CALIBER TYPE", "DAMAGE", "STRENGTH", "RPM", "SWING TIME", "DEFENSE BYPASS", "RANGE", "GEAR TYPE", "DEFENSE INCREASE", "SHIELD DURABILITY", "SUPER SHIELD INCREASE", "CARRY WEIGHT INCREASE", "QUICK SLOT INCREASE", "WEAPON TYPE", "EQUIP TIME", "WEIGHT"];
    const P_KEYS = ["Health", "Defense", "Shield", "Supershield", "Super Armour", "Speed"];
    return entries.filter(e => !e.unknown).map(e => {
      const card = e.card || {}, members = card.members || [];
      const img = (imagesOf(e, card.entry, card, ...members)[0] || {}).src || "";
      const sec = { tools: "TOOLS", bio: "BIOGRAPHY", docs: "DOCUMENTS" }[e.section];
      let sub = "", stats = [], text = "", meta = [];
      if (e.section === "tools") {
        sub = `${e.group} · TIER ${e.tier}`;
        const s = e.stats || {};
        stats = W_KEYS.filter(k => s[k] != null && s[k] !== "").slice(0, 7).map(k => [k, String(s[k]), TOOL_STAT_COLORS[k] || "#ddd"]);
        text = e.comment && e.comment.trim() !== "--" ? e.comment : "";
        meta = stats.slice(0, 3).map(([k, v]) => `${k}: ${v}`);
      } else if (e.section === "bio") {
        sub = e.group + (members.length > 1 ? ` · ${members.length} VARIANTS` : "");
        const base = e.isCard ? null : e.base;
        if (base) stats = P_KEYS.filter(k => base[k] != null).map(k => [k.toUpperCase(), String(base[k]) + (/Defense|Super Armour/.test(k) ? "%" : ""), (STAT[k] || {}).c || "#ddd"]);
        text = e.desc || DESC[e.name] || card.desc || DESC[card.name] || (members[0] && (members[0].desc || DESC[members[0].name])) || "";
        text = text.replace(/^\[[^\]]*\]\s*/, "");
        meta = stats.slice(0, 2).map(([k, v]) => `${k[0] + k.slice(1).toLowerCase()} ${v}`);
      } else {
        sub = `${e.group}`;
        text = e.desc || "";
      }
      return { id: e.id, h: h5(e.id), name: e.name, sec, sub, img, stats, text, meta };
    });
  });

  const seen = new Set(); list.forEach(x => { if (seen.has(x.h)) throw new Error("hash collision " + x.h); seen.add(x.h); });
  const old = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, "utf8")) : {};
  const man = {};
  const imgHash = src => { try { return /^https?:/.test(src) ? src : crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, src.split("?")[0]))).digest("hex"); } catch { return src; } };
  fs.mkdirSync(OUT, { recursive: true });
  for (const d of fs.readdirSync(OUT)) if (d !== "manifest.json" && !seen.has(d)) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });

  let drawn = 0;
  for (const x of list) {
    const sig = crypto.createHash("sha1").update(JSON.stringify([VERSION, x, imgHash(x.img)])).digest("hex");
    man[x.h] = sig;
    const dir = path.join(OUT, x.h), jpg = path.join(dir, "card.jpg");
    fs.mkdirSync(dir, { recursive: true });
    if (old[x.h] !== sig || !fs.existsSync(jpg)) {
      await pg.evaluate(x => {
        let c = document.getElementById("ogcard");
        if (!c) { c = document.createElement("div"); c.id = "ogcard"; document.body.appendChild(c); }
        const lift = c => { const m = /^#([0-9a-f]{6})$/i.exec(c); if (!m) return c; const n = parseInt(m[1], 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; return (r * .3 + g * .59 + b * .11) < 110 ? "#a8a8a8" : c; };
        const e = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const txt = x.text.replace(/\s+/g, " ").trim();
        c.innerHTML = `<div class="ogc-top"><b>PDA.exe</b><span>${e(x.sec)}</span></div>
          <div class="ogc-body">
            ${x.img ? `<div class="ogc-pic${x.sec === "TOOLS" ? " gun" : ""}"><img src="${e(x.img)}"></div>` : `<div class="ogc-pic ogc-ico"><img src="images/icons/${x.sec === "TOOLS" ? "tools" : x.sec === "BIOGRAPHY" ? "biography" : "manual"}.png"></div>`}
            <div class="ogc-info"><div class="ogc-name">// ${e(x.name.toUpperCase())}</div><div class="ogc-sub">${e(x.sub)}</div>
              ${x.stats.length ? `<div class="ogc-stats">${x.stats.map(([k, v, col]) => `<div><i style="color:${lift(col)}">${e(k)}</i>: ${e(v)}</div>`).join("")}</div>` : ""}
              ${txt ? `<div class="ogc-text${x.stats.length ? "" : " big"}">${e(txt)}</div>` : ""}</div></div>
          <div class="ogc-foot">ONCE A NORMAL CITY · PDA TRACKER</div>`;
        let s = document.getElementById("ogstyle");
        if (!s) { s = document.createElement("style"); s.id = "ogstyle"; document.head.appendChild(s); s.textContent = `
          #ogcard { position: fixed; inset: 0; width: 1200px; height: 630px; z-index: 99999; background: #0b0b0b; color: #e8e8e8; font-family: Inconsolata, monospace; display: flex; flex-direction: column; border: 3px solid #d8d8d8; box-sizing: border-box; }
          .ogc-top { height: 54px; background: linear-gradient(#f4f4f4, #cfcfcf); color: #111; display: flex; align-items: center; justify-content: space-between; padding: 0 22px; font-size: 30px; }
          .ogc-top b { font-weight: 800; } .ogc-top span { font-size: 24px; font-weight: 700; letter-spacing: 2px; color: #333; }
          .ogc-body { flex: 1; display: flex; gap: 26px; padding: 24px 26px 10px; min-height: 0; }
          .ogc-pic { width: 380px; flex: none; background: #1a1a1a; border: 2px solid #555; display: flex; align-items: center; justify-content: center; overflow: hidden; }
          .ogc-pic img { width: 100%; height: 100%; object-fit: cover; }
          .ogc-pic.gun { width: 440px; background: #2a2a2a; }
          .ogc-pic.gun img { object-fit: contain; }
          .ogc-ico { width: 260px; background: #141414; border-color: #333; }
          .ogc-ico img { width: 55%; height: auto; object-fit: contain; filter: invert(1); opacity: .22; }
          .ogc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
          .ogc-name { font-size: 50px; font-weight: 800; line-height: 1.05; color: #fff; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .ogc-sub { font-size: 24px; color: #f3ee30; font-weight: 700; letter-spacing: 1px; margin: 6px 0 14px; }
          .ogc-stats { font-size: 25px; line-height: 1.3; font-style: italic; }
          .ogc-stats i { font-style: italic; }
          .ogc-text { margin-top: 12px; font-size: 22px; line-height: 1.35; color: #c8c8c8; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
          .ogc-text.big { font-size: 26px; -webkit-line-clamp: 9; }
          .ogc-foot { height: 40px; display: flex; align-items: center; padding: 0 26px; font-size: 18px; letter-spacing: 3px; color: #777; border-top: 1px solid #333; }`; }
      }, x);
      await pg.waitForFunction(() => [...document.querySelectorAll("#ogcard img")].every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
      await pg.waitForTimeout(60);
      await pg.screenshot({ path: jpg, type: "jpeg", quality: 74, clip: { x: 0, y: 0, width: 1200, height: 630 } });
      drawn++;
    }
    const title = `${x.name} · PDA.exe`;
    const desc = clip([x.sub, x.meta.join(" · "), x.text].filter(Boolean).join("\n"), 280);
    fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PDA.exe · Once A Normal City tracker">
<meta property="og:title" content="${esc(x.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}e/${x.h}/">
<meta property="og:image" content="${SITE}e/${x.h}/card.jpg?v=${sig.slice(0, 8)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(x.name)} in PDA.exe">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f3ee30">
<script>location.replace("../../#e=${x.h}")</script>
</head><body style="background:#0a0a0a;color:#ddd;font-family:monospace"><a href="../../#e=${x.h}" style="color:#ddd">Open ${esc(x.name)} on PDA.exe</a></body></html>
`);
  }
  fs.writeFileSync(MAN, JSON.stringify(man));
  if (Object.keys(ov).length) fs.writeFileSync(path.join(OUT, "overrides.json"), JSON.stringify(ov, Object.keys(ov).sort(), 1).length ? JSON.stringify(Object.fromEntries(Object.keys(ov).sort().map(k => [k, ov[k]])), null, 1) + "\n" : "{}");
  const totals = await pg.evaluate(() => { const { entries } = window.__pda(); const n = sec => entries.filter(e => e.section === sec).length; return { tools: n("tools"), bio: n("bio"), docs: n("docs"), all: entries.length }; });
  const pics = list.filter(x => x.sec === "BIOGRAPHY" && x.img && !/^https?:/.test(x.img)).map(x => x.img);
  const pick = ["security-bot-c", "tony", "robinson", "bonecrab", "factory-king", "goat"].map(k => pics.find(p => p.includes(k))).filter(Boolean);
  for (const p of pics) if (pick.length < 6 && !pick.includes(p)) pick.push(p);
  await pg.evaluate(({ t, pick }) => {
    const c = document.getElementById("ogcard");
    c.innerHTML = `<div class="ogc-top"><b>PDA.exe</b><span>ONCE A NORMAL CITY</span></div>
      <div class="ogs-body">
        <div class="ogs-left">
          <div class="ogs-logo">PDA<span>.exe</span></div>
          <div class="ogs-tag">THE ONCE A NORMAL CITY<br>PDA CHECKLIST</div>
          <div class="ogs-nums"><div><b>${t.tools}</b>TOOLS</div><div><b>${t.bio}</b>PEOPLE</div><div><b>${t.docs}</b>DOCUMENTS</div></div>
          <div class="ogs-feat">&#9733;&#xFE0E; CHECK OFF &nbsp;·&nbsp; STATS &nbsp;·&nbsp; DAMAGE CALC</div>
        </div>
        <div class="ogs-grid">${pick.map(p => `<div><img src="${p}"></div>`).join("")}</div>
      </div>
      <div class="ogc-foot">SLEEPYPLINKO.GITHUB.IO/PDATRACKER</div>`;
    let st = document.getElementById("ogsite");
    if (!st) { st = document.createElement("style"); st.id = "ogsite"; document.head.appendChild(st); st.textContent = `
      .ogs-body { flex: 1; display: flex; gap: 28px; padding: 26px 28px 18px; min-height: 0; }
      .ogs-left { flex: 1; display: flex; flex-direction: column; justify-content: center; }
      .ogs-logo { font-size: 112px; font-weight: 900; line-height: .95; color: #fff; letter-spacing: 2px; text-shadow: 0 0 22px rgba(255,255,255,.18); }
      .ogs-logo span { color: #8a8a8a; }
      .ogs-tag { margin-top: 14px; font-size: 26px; font-weight: 700; letter-spacing: 3px; color: #f3ee30; line-height: 1.25; }
      .ogs-nums { display: flex; gap: 14px; margin-top: 26px; }
      .ogs-nums div { flex: 1; border: 2px solid #4a4a4a; background: #151515; padding: 10px 12px; font-size: 17px; letter-spacing: 2px; color: #9a9a9a; display: flex; flex-direction: column; }
      .ogs-nums b { font-size: 40px; color: #fff; letter-spacing: 0; }
      .ogs-feat { margin-top: 20px; font-size: 19px; letter-spacing: 2px; color: #bdbdbd; }
      .ogs-grid { width: 470px; flex: none; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); gap: 8px; }
      .ogs-grid div { border: 2px solid #555; background: #1a1a1a; overflow: hidden; }
      .ogs-grid img { width: 100%; height: 100%; object-fit: cover; display: block; }`; }
  }, { t: totals, pick });
  await pg.waitForFunction(() => [...document.querySelectorAll("#ogcard img")].every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(100);
  await pg.screenshot({ path: path.join(ROOT, "images", "og.jpg"), type: "jpeg", quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await b.close(); srv.close();
  console.log(`${list.length} preview pages, ${drawn} card images redrawn, ${Object.keys(ov).length} overrides applied`);
});
