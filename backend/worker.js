const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const ID_RE = /^[tbd]\|[^\n]{1,150}$/;
const MAX_IDS = 3000;
const OV_RE = /^(?:[tbd]\|[^\n]{1,150}|a\|[^\n]{1,150}|site\|notice)$/;
const AMMO_KEYS = ["base", "mult", "spread", "proj", "pen", "shieldPierce", "fracture", "bleed", "saBypass", "ssBypass", "weakness", "statuses", "alert"];
const RARITY_TTL = 300;
const AUTH_LIMIT = 20;
const SUBMIT_LIMIT = 6;
const LB_TTL = 300;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
const err = (status, message) => json({ error: message }, status);

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const now = () => Math.floor(Date.now() / 1000);
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function body(req) {
  try { const t = await req.text(); if (t.length > 200000) return null; return JSON.parse(t || "{}"); }
  catch { return null; }
}
function cleanIds(list) {
  if (!Array.isArray(list)) return null;
  const out = [...new Set(list.filter(x => typeof x === "string" && ID_RE.test(x)))];
  return out.length > MAX_IDS ? null : out.sort();
}

async function ipTag(req) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pda-block:" + ip));
  return [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function isBlocked(env, req, account) {
  const tag = await ipTag(req);
  const row = await env.DB.prepare("SELECT 1 FROM blocks WHERE ip = ? OR (account != '' AND account = ?) LIMIT 1").bind(tag, account || "\u0000").first();
  return !!row;
}
async function logChange(env, id, before, after, by, what) {
  await env.DB.prepare("INSERT INTO changes (entry, before, after, by, what, t) VALUES (?, ?, ?, ?, ?, ?)").bind(id, before, after, by, what, now()).run();
}
async function rateLimit(env, req, bucket = "", limit = AUTH_LIMIT) {
  const ip = bucket + (req.headers.get("CF-Connecting-IP") || "local");
  const since = now() - 600;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM attempts WHERE ip = ? AND t > ?").bind(ip, since).first();
  if (row && row.n >= limit) return false;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO attempts (ip, t) VALUES (?, ?)").bind(ip, now()),
    env.DB.prepare("DELETE FROM attempts WHERE t < ?").bind(since)
  ]);
  return true;
}
async function newSession(env, name) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token, name, created) VALUES (?, ?, ?)").bind(await sha256(token), name, now()).run();
  return token;
}
async function whoami(env, req) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const s = await env.DB.prepare("SELECT name FROM sessions WHERE token = ?").bind(await sha256(m[1])).first();
  return s ? s.name : null;
}

const adminKeys = env => String(env.ADMIN_KEYS || "").split(",").map(x => x.trim()).filter(x => x.includes("=")).map(x => { const i = x.indexOf("="); return [x.slice(0, i).trim(), x.slice(i + 1)]; }).filter(([n, p]) => n && p.length >= 8);
const isAdmin = (env, sess) => !!sess && sess.startsWith("admin:") && adminKeys(env).some(([n]) => n.toLowerCase() === sess.slice(6).toLowerCase());
const shown = sess => String(sess || "").replace(/^admin:/, "");
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
async function cachedJSON(ctx, url, ttl, make) {
  const cache = caches.default, key = new Request(url);
  const hit = await cache.match(key); if (hit) return hit;
  const res = json(await make(), 200, { "Cache-Control": `public, max-age=${ttl}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
const meOut = u => ({ name: u.display, found: JSON.parse(u.found), ver: u.ver, share: !!u.share, public: !!u.public, updated: u.updated });

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const M = req.method;

  if (M === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (path === "" || path === "/api") return json({ ok: true, service: "pda-tracker", admins: adminKeys(env).map(([n]) => n) });

  if (path === "/api/logout" && M === "POST") {
    const m = (req.headers.get("Authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(await sha256(m[1])).run();
    return json({ ok: true });
  }

  if (path === "/api/admin/login" && M === "POST") {
    if (!(await rateLimit(env, req, "a:", 10))) return err(429, "Too many tries. Wait a few minutes.");
    const b = await body(req); if (!b) return err(400, "Bad request.");
    const name = String(b.name || "").trim(), pass = String(b.password || "");
    const hit = adminKeys(env).find(([n]) => n.toLowerCase() === name.toLowerCase());
    const ok = hit && sameString(await sha256("pw:" + pass), await sha256("pw:" + hit[1]));
    if (!ok) return err(401, "Wrong name or password.");
    await env.DB.prepare("DELETE FROM sessions WHERE created < ?").bind(now() - 60 * 86400).run();
    return json({ token: await newSession(env, "admin:" + hit[0]), name: hit[0] });
  }

  if (path === "/api/anon" && M === "PUT") {
    const b = await body(req); if (!b || !/^[0-9a-f]{32}$/.test(String(b.device || ""))) return err(400, "Bad request.");
    const found = cleanIds(b.found); if (!found) return err(400, "Bad found list.");
    const known = await env.DB.prepare("SELECT 1 FROM anon WHERE device = ?").bind(b.device).first();
    if (!known && !(await rateLimit(env, req, "n:", 5))) return err(429, "Slow down.");
    if (!found.length) { await env.DB.prepare("DELETE FROM anon WHERE device = ?").bind(b.device).run(); return json({ ok: true }); }
    await env.DB.prepare("INSERT INTO anon (device, found, updated) VALUES (?, ?, ?) ON CONFLICT(device) DO UPDATE SET found = excluded.found, updated = excluded.updated").bind(b.device, JSON.stringify(found), now()).run();
    return json({ ok: true });
  }
  if (path === "/api/anon" && M === "DELETE") {
    const b = await body(req); if (b && /^[0-9a-f]{32}$/.test(String(b.device || ""))) await env.DB.prepare("DELETE FROM anon WHERE device = ?").bind(b.device).run();
    return json({ ok: true });
  }

  if (path === "/api/transfer" && M === "POST") {
    if (!(await rateLimit(env, req, "x:", 10))) return err(429, "You've made a lot of transfer links just now. Wait a few minutes.");
    const b = await body(req); if (!b || typeof b.data !== "object" || !b.data) return err(400, "Bad request.");
    const data = JSON.stringify(b.data); if (data.length > 150000) return err(413, "That PDA is too big to send this way. Use DOWNLOAD BACKUP instead.");
    const ABC = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; const rnd = crypto.getRandomValues(new Uint8Array(8));
    const code = [...rnd].map(x => ABC[x % ABC.length]).join("");
    await env.DB.batch([env.DB.prepare("DELETE FROM transfers WHERE created < ?").bind(now() - 86400),
      env.DB.prepare("INSERT INTO transfers (code, data, created) VALUES (?, ?, ?)").bind(code, data, now())]);
    return json({ code, expires: now() + 86400 }, 201);
  }
  const xm = path.match(/^\/api\/transfer\/([2-9A-Za-z]{8})$/);
  if (xm && M === "GET") {
    if (!(await rateLimit(env, req, "y:", 30))) return err(429, "Too many tries. Wait a few minutes.");
    const row = await env.DB.prepare("SELECT data, created FROM transfers WHERE code = ? AND created > ?").bind(xm[1].toUpperCase(), now() - 86400).first();
    if (!row) return err(404, "That code doesn't exist or has expired (codes last 24 hours).");
    return json({ data: JSON.parse(row.data), created: row.created });
  }

  if (path === "/api/substatus" && M === "GET") {
    const toks = String(url.searchParams.get("t") || "").split(",").filter(t => /^[0-9a-f]{24}$/.test(t)).slice(0, 50);
    if (!toks.length) return json([]);
    const rows = await env.DB.prepare(`SELECT token, kind, entry, status, CASE WHEN status = 'new' THEN '' ELSE note END AS note, created FROM submissions WHERE token IN (${toks.map(() => "?").join(",")})`).bind(...toks).all();
    return json(rows.results || []);
  }

  if (path === "/api/submit" && M === "POST") {
    const b = await body(req); if (!b) return err(400, "Bad request.");
    if (b.botcheck) return json({ ok: true });
    const text = clip(b.text, 4000).trim(), link = clip(b.link, 500).trim();
    if (!text && !link) return err(400, "Write some details or add a link first.");
    if (await isBlocked(env, req, "")) return err(403, "You can't send info to this site.");
    if (!(await rateLimit(env, req, "s:", SUBMIT_LIMIT))) return err(429, "You've sent a lot just now. Wait a few minutes.");
    const account = "", token = randomHex(12);
    const r = await env.DB.prepare("INSERT INTO submissions (kind, entry, text, link, who, account, created, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(clip(b.kind, 40) || "Other", clip(b.entry, 150), text, link, clip(b.name, 60), account, now(), token).run();
    if (r.meta && r.meta.last_row_id) await env.DB.prepare("INSERT OR REPLACE INTO subip (sub, ip) VALUES (?, ?)").bind(r.meta.last_row_id, await ipTag(req)).run();
    if (env.DISCORD_WEBHOOK) {
      ctx.waitUntil(fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        content: "@everyone new PDA submission",
        allowed_mentions: { parse: ["everyone"] },
        embeds: [{ title: `${clip(b.kind, 40) || "Other"}${b.entry ? ": " + clip(b.entry, 150) : ""}`, description: (text + (link ? `\n\n${link}` : "")).slice(0, 3900), footer: { text: [clip(b.name, 60), account && "account: " + account].filter(Boolean).join(" · ") || "anonymous" } }] }) }).catch(() => {}));
    }
    return json({ ok: true, token }, 201);
  }
  if (path === "/api/admin/check" && M === "GET") { const sess = await whoami(env, req); return json({ admin: isAdmin(env, sess), name: isAdmin(env, sess) ? shown(sess) : "", announce: !!env.ANNOUNCE_WEBHOOK }); }
  if (path.startsWith("/api/admin/")) {
    const sess = await whoami(env, req);
    if (!isAdmin(env, sess)) return err(403, "Admins only.");
    const name = shown(sess);
    if (path === "/api/admin/submissions" && M === "GET") {
      const status = url.searchParams.get("status") || "new";
      const rows = await env.DB.prepare("SELECT * FROM submissions WHERE status = ? ORDER BY created DESC LIMIT 200").bind(status).all();
      const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM submissions GROUP BY status").all();
      return json({ rows: rows.results || [], counts: Object.fromEntries((counts.results || []).map(r => [r.status, r.n])) });
    }
    const sm = path.match(/^\/api\/admin\/submissions\/(\d+)$/);
    if (sm && M === "PUT") {
      const b = await body(req); const st = String((b && b.status) || "");
      if (!["new", "done", "rejected"].includes(st)) return err(400, "Bad status.");
      await env.DB.prepare("UPDATE submissions SET status = ?, note = ? WHERE id = ?").bind(st, clip(b.note, 500), +sm[1]).run();
      return json({ ok: true });
    }
    if (sm && M === "DELETE") { await env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(+sm[1]).run(); return json({ ok: true }); }

    if (path === "/api/admin/setup" && M === "GET") {
      const want = { sessions: 1, attempts: 1, submissions: 2, overrides: 2, changes: 4, blocks: 4, subip: 4, anon: 5, transfers: 6 };
      const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      const have = new Set((rows.results || []).map(r => r.name));
      const missing = Object.keys(want).filter(t => !have.has(t));
      const fix = missing.length ? [...new Set(missing.map(t => want[t] === 1 ? "schema.sql" : `schema-update-${want[t]}.sql`))].join(", then ") : "";
      const cols = (await env.DB.prepare("SELECT name FROM pragma_table_info('submissions')").all()).results || [];
      if (have.has("submissions") && !cols.some(c => c.name === "token") && !missing.includes("anon")) { missing.push("submissions.token"); }
      const fix2 = missing.includes("submissions.token") ? "schema-update-5.sql" : fix;
      return json({ admins: adminKeys(env).length, tables: { missing, fix: fix2 }, ping: !!env.DISCORD_WEBHOOK, announce: !!env.ANNOUNCE_WEBHOOK });
    }

    if (path === "/api/admin/stats" && M === "GET") {
      const wk = now() - 7 * 86400, day = now() - 86400;
      const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
      const [all, active, active1, subsWeek, subsNew, avg] = await Promise.all([
        q("SELECT COUNT(*) AS n FROM anon"), q("SELECT COUNT(*) AS n FROM anon WHERE updated > ?", wk), q("SELECT COUNT(*) AS n FROM anon WHERE updated > ?", day),
        q("SELECT COUNT(*) AS n FROM submissions WHERE created > ?", wk), q("SELECT COUNT(*) AS n FROM submissions WHERE status = 'new'"),
        q("SELECT AVG(json_array_length(found)) AS n FROM anon")]);
      return json({ players: all.n, active7: active.n, active1: active1.n, subsWeek: subsWeek.n, subsNew: subsNew.n, avgFound: avg && avg.n ? Math.round(avg.n) : 0 });
    }

    if (path === "/api/admin/changes" && M === "GET") {
      const rows = await env.DB.prepare("SELECT id, entry, before, after, by, what, t FROM changes ORDER BY id DESC LIMIT 150").all();
      return json(rows.results || []);
    }
    const um = path.match(/^\/api\/admin\/changes\/(\d+)\/undo$/);
    if (um && M === "POST") {
      const c = await env.DB.prepare("SELECT * FROM changes WHERE id = ?").bind(+um[1]).first();
      if (!c) return err(404, "That change isn't in the history any more.");
      const cur = await env.DB.prepare("SELECT data FROM overrides WHERE id = ?").bind(c.entry).first();
      if (c.before == null) await env.DB.prepare("DELETE FROM overrides WHERE id = ?").bind(c.entry).run();
      else await env.DB.prepare("INSERT INTO overrides (id, data, updated, by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated, by = excluded.by").bind(c.entry, c.before, now(), name).run();
      await logChange(env, c.entry, cur ? cur.data : null, c.before, name, `undid #${c.id}`);
      await env.DB.prepare("DELETE FROM changes WHERE t < ?").bind(now() - 180 * 86400).run();
      return json({ ok: true, entry: c.entry, data: c.before == null ? null : JSON.parse(c.before) });
    }

    if (path === "/api/admin/blocks" && M === "GET") {
      const rows = await env.DB.prepare("SELECT id, account, note, by, created, ip != '' AS byip FROM blocks ORDER BY id DESC").all();
      return json(rows.results || []);
    }
    if (path === "/api/admin/blocks" && M === "POST") {
      const b = await body(req); if (!b) return err(400, "Bad request.");
      const sub = b.sub ? await env.DB.prepare("SELECT s.account AS account, s.who AS who, i.ip AS ip FROM submissions s LEFT JOIN subip i ON i.sub = s.id WHERE s.id = ?").bind(+b.sub).first() : null;
      if (b.sub && !sub) return err(404, "Submission not found.");
      const acct = sub ? sub.account || "" : NAME_RE.test(String(b.account || "")) ? String(b.account) : "";
      const ip = sub ? sub.ip || "" : "";
      if (!acct && !ip) return err(400, "Nothing to block: that submission has no account or address on record.");

      await env.DB.prepare("INSERT INTO blocks (ip, account, note, by, created) VALUES (?, ?, ?, ?, ?)").bind(ip, acct, clip(b.note || (sub && sub.who) || "", 200), name, now()).run();
      if (b.sub && b.purge) {
        if (ip) await env.DB.prepare("UPDATE submissions SET status = 'rejected' WHERE status = 'new' AND id IN (SELECT sub FROM subip WHERE ip = ?)").bind(ip).run();
        if (acct) await env.DB.prepare("UPDATE submissions SET status = 'rejected' WHERE status = 'new' AND account = ?").bind(acct).run();
      }
      return json({ ok: true }, 201);
    }
    const bm = path.match(/^\/api\/admin\/blocks\/(\d+)$/);
    if (bm && M === "DELETE") { await env.DB.prepare("DELETE FROM blocks WHERE id = ?").bind(+bm[1]).run(); return json({ ok: true }); }

    if (path === "/api/admin/announce" && M === "POST") {
      if (!env.ANNOUNCE_WEBHOOK) return err(501, "Set ANNOUNCE_WEBHOOK on the Worker first (see the README).");
      const b = await body(req); const upd = clip(b && b.update, 40).trim(); if (!upd) return err(400, "Pick an update.");
      const names = (Array.isArray(b.names) ? b.names : []).map(x => clip(x, 80)).filter(Boolean).slice(0, 60);
      const site = env.SITE_URL || "https://sleepyplinko.github.io/pdatracker/";
      const msg = clip(b.message, 1500).trim();
      const res = await fetch(env.ANNOUNCE_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{ title: `New on PDA.exe: ${upd}`, url: site, description: ((msg ? msg + "\n\n" : "") + (names.length ? names.map(n => "• " + n).join("\n") : "")).slice(0, 3900) || "New entries were added.", footer: { text: "PDA.exe tracker" } }] }) }).catch(() => null);
      if (!res || !res.ok) return err(502, "Discord didn't accept the message. Check the webhook.");
      return json({ ok: true });
    }
    const om = path.match(/^\/api\/admin\/overrides\/(.+)$/);
    if (om) {
      const id = decodeURIComponent(om[1]); if (!OV_RE.test(id)) return err(400, "Bad entry.");
      if (M === "PUT") {
        const b = await body(req); if (!b || typeof b.data !== "object") return err(400, "Bad request.");
        const d = {}; const src = b.data;
        if (typeof src.comment === "string") d.comment = clip(src.comment, 8000);
        if (typeof src.desc === "string") d.desc = clip(src.desc, 8000);
        if (src.stats && typeof src.stats === "object") { d.stats = {}; Object.entries(src.stats).slice(0, 60).forEach(([k, v]) => { d.stats[clip(k, 40).toUpperCase()] = clip(v, 120); }); }
        if (typeof src.tier === "number" && src.tier >= 1 && src.tier <= 9) d.tier = src.tier;
        if (typeof src.update === "string" && src.update.trim()) d.update = clip(src.update.trim(), 40);
        if (id.startsWith("a|")) {
          if (src.ammo && typeof src.ammo === "object") { d.ammo = {}; AMMO_KEYS.forEach(k => { if (src.ammo[k] != null) d.ammo[k] = clip(src.ammo[k], 40); }); }
          if (src.ammoAdd && typeof src.ammoAdd === "object") { const c = clip(src.ammoAdd.caliber, 60).trim(), n = clip(src.ammoAdd.name, 80).trim(); if (!c || !n) return err(400, "New ammo needs a caliber and a name."); d.ammoAdd = { caliber: c, name: n }; }
          if (typeof src.note === "string") d.note = clip(src.note, 300);
        }
        if (id === "site|notice") {
          const t = clip(src.text, 400).trim(); if (!t) return err(400, "Write the notice first.");
          d.notice = { text: t, level: ["info", "update", "warn"].includes(src.level) ? src.level : "info", id: randomHex(4) };
        }
        const okUrl = u => typeof u === "string" && (/^https?:\/\/[^\s"'<>]{4,500}$/.test(u) || /^images\/[\w\-.\/]{1,200}$/.test(u));
        if (Array.isArray(src.imgs)) { const l = src.imgs.filter(okUrl).slice(0, 8); if (l.length) d.imgs = l; }
        else if (okUrl(src.img)) d.imgs = [src.img];
        if (src.add && typeof src.add === "object") {
          const a = src.add, sec = ["tools", "bio", "docs"].includes(a.section) ? a.section : "";
          const nm = clip(a.name, 80).trim(), grp = clip(a.group, 60).trim();
          if (!sec || !nm || nm === "???" || !grp) return err(400, "New entries need a section, group and name.");
          d.add = { section: sec, group: grp, name: nm };
          if (sec === "tools") { if (!(Number.isInteger(a.tier) && a.tier >= 1 && a.tier <= 9)) return err(400, "Pick a tier."); d.add.tier = a.tier; }
          if (typeof a.replace === "string" && ID_RE.test(a.replace)) d.add.replace = a.replace;
        }
        const prev = await env.DB.prepare("SELECT data FROM overrides WHERE id = ?").bind(id).first();
        await env.DB.prepare("INSERT INTO overrides (id, data, updated, by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated, by = excluded.by").bind(id, JSON.stringify(d), now(), name).run();
        await logChange(env, id, prev ? prev.data : null, JSON.stringify(d), name, clip(b.what || (prev ? "edited" : d.add ? "added" : "published"), 60));
        return json({ ok: true, id, data: d });
      }
      if (M === "DELETE") {
        const prev = await env.DB.prepare("SELECT data FROM overrides WHERE id = ?").bind(id).first();
        await env.DB.prepare("DELETE FROM overrides WHERE id = ?").bind(id).run();
        if (prev) await logChange(env, id, prev.data, null, name, "removed");
        return json({ ok: true });
      }
    }
  }

  if (path === "/api/overrides" && M === "GET") {
    const rows = await env.DB.prepare("SELECT id, data, updated FROM overrides").all();
    const out = {}; (rows.results || []).forEach(r => { out[r.id] = { ...JSON.parse(r.data), updated: r.updated }; });
    return json(out, 200, { "Cache-Control": "public, max-age=60" });
  }

  if (path === "/api/rarity" && M === "GET") {
    return cachedJSON(ctx, url.origin + "/api/rarity", RARITY_TTL, async () => {
      const players = await env.DB.prepare("SELECT COUNT(*) AS n FROM anon").first();
      const rows = await env.DB.prepare("SELECT j.value AS id, COUNT(*) AS n FROM anon, json_each(anon.found) AS j GROUP BY j.value").all();
      const counts = {}; (rows.results || []).forEach(r => { counts[r.id] = r.n; });
      return { players: players ? players.n : 0, counts, at: now() };
    });
  }

  return err(404, "Not found.");
}

export default {
  async fetch(req, env, ctx) {
    try { return await route(req, env, ctx); }
    catch (e) { return err(500, /no such (table|column)/.test(String(e && e.message)) ? "Database needs updating: run the newest schema-update SQL file in the D1 console." : "Server error."); }
  }
};
