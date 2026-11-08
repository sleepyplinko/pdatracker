/* =====================================================================
   PDA TRACKER — CLOUD BACKEND (Cloudflare Worker + D1)
   ---------------------------------------------------------------------
   Accounts, cross-device sync, anonymous rarity stats and public
   profile links. Needs a D1 database bound as "DB" (see README.md).

   Passwords never reach this server: the site turns the password into
   a key in the browser (PBKDF2), and here that key is salted + hashed.
   ===================================================================== */

const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const ID_RE = /^[tbd]\|[^\n]{1,150}$/;
const MAX_IDS = 3000;
const RARITY_TTL = 300;            // seconds the rarity numbers are cached
const AUTH_LIMIT = 20;             // login/register tries per IP per 10 minutes
const SUBMIT_LIMIT = 6;            // submissions per IP per 10 minutes
const LB_TTL = 300;                // seconds the leaderboard is cached
const UPLOAD_LIMIT = 8;            // picture uploads per IP per 10 minutes
const UPLOAD_MAX = 5 * 1024 * 1024; // 5 MB per picture
const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
/* check the file really is the picture type it says it is */
function sniff(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}

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
function sameString(a, b) {                       // constant-time compare
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
/* a one-way fingerprint of the sender's IP, so spammers can be blocked without storing addresses */
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
const meRow = (env, name) => env.DB.prepare("SELECT display, found, ver, share, public, updated FROM users WHERE name = ?").bind(name).first();
/* admins are listed in the Worker's ADMINS variable, e.g. "Gabewant,OtherName" */
const isAdmin = (env, name) => !!name && String(env.ADMINS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean).includes(name.toLowerCase());
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
  if (path === "" || path === "/api") return json({ ok: true, service: "pda-tracker", uploads: !!env.IMAGES, admins: String(env.ADMINS || "").split(",").map(x => x.trim()).filter(Boolean) });

  /* ---- create an account ---- */
  if (path === "/api/register" && M === "POST") {
    if (!(await rateLimit(env, req))) return err(429, "Too many tries. Wait a few minutes.");
    const b = await body(req); if (!b) return err(400, "Bad request.");
    const name = String(b.name || ""), key = String(b.key || "");
    if (!NAME_RE.test(name)) return err(400, "Names are 3-20 letters, numbers or _.");
    if (!/^[0-9a-f]{64}$/.test(key)) return err(400, "Bad key.");
    const found = cleanIds(b.found || []) || [];
    if (await env.DB.prepare("SELECT 1 FROM users WHERE name = ?").bind(name).first()) return err(409, "That name is taken.");
    const salt = randomHex(16), t = now();
    await env.DB.prepare("INSERT INTO users (name, display, salt, hash, found, ver, share, public, created, updated) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)")
      .bind(name, name, salt, await sha256(salt + key), JSON.stringify(found), b.share === false ? 0 : 1, b.public === false ? 0 : 1, t, t).run();
    return json({ token: await newSession(env, name), ...meOut(await meRow(env, name)) }, 201);
  }

  /* ---- log in ---- */
  if (path === "/api/login" && M === "POST") {
    if (!(await rateLimit(env, req))) return err(429, "Too many tries. Wait a few minutes.");
    const b = await body(req); if (!b) return err(400, "Bad request.");
    const name = String(b.name || ""), key = String(b.key || "");
    const u = NAME_RE.test(name) && await env.DB.prepare("SELECT name, salt, hash FROM users WHERE name = ?").bind(name).first();
    if (!u || !sameString(await sha256(u.salt + key), u.hash)) return err(401, "Wrong name or password.");
    return json({ token: await newSession(env, u.name), ...meOut(await meRow(env, u.name)) });
  }

  /* ---- my account ---- */
  if (path === "/api/me") {
    const name = await whoami(env, req); if (!name) return err(401, "Logged out. Log in again.");
    if (M === "GET") { const u = await meRow(env, name); return u ? json(meOut(u)) : err(404, "Account not found."); }
    if (M === "PUT") {
      const b = await body(req); if (!b) return err(400, "Bad request.");
      const u = await meRow(env, name); if (!u) return err(404, "Account not found.");
      const sets = [], vals = [];
      if ("found" in b) {
        const found = cleanIds(b.found); if (!found) return err(400, "Bad found list.");
        if (b.ver !== u.ver) return json({ conflict: true, ...meOut(u) }, 409);   // changed on another device: merge and retry
        sets.push("found = ?", "ver = ver + 1"); vals.push(JSON.stringify(found));
        const had = new Set(JSON.parse(u.found)), added = found.filter(x => !had.has(x));
        if (added.length) {                                             // for friends' "recent finds"
          const t = now(), st = added.length <= 5 ? added.map(id => env.DB.prepare("INSERT INTO activity (name, id, n, t) VALUES (?, ?, 1, ?)").bind(name, id, t))
            : [env.DB.prepare("INSERT INTO activity (name, id, n, t) VALUES (?, '', ?, ?)").bind(name, added.length, t)];
          st.push(env.DB.prepare("DELETE FROM activity WHERE t < ?").bind(t - 30 * 86400));
          ctx.waitUntil(env.DB.batch(st).catch(() => {}));
        }
      }
      if (typeof b.share === "boolean") { sets.push("share = ?"); vals.push(b.share ? 1 : 0); }
      if (typeof b.public === "boolean") { sets.push("public = ?"); vals.push(b.public ? 1 : 0); }
      if (!sets.length) return json(meOut(u));
      sets.push("updated = ?"); vals.push(now());
      await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE name = ?`).bind(...vals, name).run();
      return json(meOut(await meRow(env, name)));
    }
    if (M === "DELETE") {
      await env.DB.batch([env.DB.prepare("DELETE FROM users WHERE name = ?").bind(name), env.DB.prepare("DELETE FROM sessions WHERE name = ?").bind(name),
        env.DB.prepare("DELETE FROM friends WHERE name = ? OR friend = ?").bind(name, name), env.DB.prepare("DELETE FROM counts WHERE name = ?").bind(name), env.DB.prepare("DELETE FROM activity WHERE name = ?").bind(name)]);
      return json({ deleted: true });
    }
  }
  if (path === "/api/logout" && M === "POST") {
    const m = (req.headers.get("Authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(await sha256(m[1])).run();
    return json({ ok: true });
  }


  /* ---- found counts (how many times you've found each thing) ---- */
  if (path === "/api/counts") {
    const name = await whoami(env, req); if (!name) return err(401, "Logged out. Log in again.");
    const row = await env.DB.prepare("SELECT data FROM counts WHERE name = ?").bind(name).first();
    const cur = row ? JSON.parse(row.data) : {};
    if (M === "GET") return json(cur);
    if (M === "PUT") {
      const b = await body(req); if (!b || (typeof b.counts !== "object" && typeof b.set !== "object")) return err(400, "Bad request.");
      Object.entries(b.counts || {}).forEach(([id, n]) => { if (ID_RE.test(id) && Number.isInteger(n) && n >= 0 && n < 100000) cur[id] = Math.max(cur[id] || 0, n); });
      if (b.set && typeof b.set === "object") Object.entries(b.set).forEach(([id, n]) => { if (ID_RE.test(id) && Number.isInteger(n) && n >= 0 && n < 100000) { if (n) cur[id] = n; else delete cur[id]; } });
      if (Object.keys(cur).length > MAX_IDS) return err(400, "Too many.");
      await env.DB.prepare("INSERT INTO counts (name, data) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data").bind(name, JSON.stringify(cur)).run();
      return json(cur);
    }
  }

  /* ---- friends: saved list of other players' public profiles ---- */
  if (path === "/api/friends") {
    const name = await whoami(env, req); if (!name) return err(401, "Logged out. Log in again.");
    if (M === "GET") {
      const rows = await env.DB.prepare("SELECT u.display AS name, u.found AS found, u.updated AS updated, u.public AS public FROM friends f JOIN users u ON u.name = f.friend WHERE f.name = ? ORDER BY f.created").bind(name).all();
      return json((rows.results || []).map(r => r.public ? { name: r.name, found: JSON.parse(r.found), updated: r.updated } : { name: r.name, hidden: true }));
    }
    if (M === "POST") {
      const b = await body(req); const f = String((b && b.name) || "");
      if (!NAME_RE.test(f)) return err(400, "Names are 3-20 letters, numbers or _.");
      if (f.toLowerCase() === name.toLowerCase()) return err(400, "That's you!");
      const u = await env.DB.prepare("SELECT display, public FROM users WHERE name = ?").bind(f).first();
      if (!u) return err(404, "No player with that name.");
      if (!u.public) return err(403, "That player's profile is private.");
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM friends WHERE name = ?").bind(name).first();
      if (n && n.n >= 50) return err(400, "You can have up to 50 friends.");
      await env.DB.prepare("INSERT OR IGNORE INTO friends (name, friend, created) VALUES (?, ?, ?)").bind(name, f, now()).run();
      return json({ ok: true, name: u.display }, 201);
    }
  }
  if (path === "/api/friends/activity" && M === "GET") {
    const name = await whoami(env, req); if (!name) return err(401, "Logged out. Log in again.");
    const rows = await env.DB.prepare("SELECT u.display AS name, a.id AS id, a.n AS n, a.t AS t FROM friends f JOIN users u ON u.name = f.friend JOIN activity a ON a.name = f.friend WHERE f.name = ? AND u.public = 1 AND a.t > ? ORDER BY a.t DESC LIMIT 40").bind(name, now() - 14 * 86400).all();
    return json(rows.results || []);
  }
  const fm = path.match(/^\/api\/friends\/([A-Za-z0-9_]{3,20})$/);
  if (fm && M === "DELETE") {
    const name = await whoami(env, req); if (!name) return err(401, "Logged out. Log in again.");
    await env.DB.prepare("DELETE FROM friends WHERE name = ? AND friend = ?").bind(name, fm[1]).run();
    return json({ ok: true });
  }

  /* ---- leaderboard: public profiles, most found (optionally one category) ---- */
  if (path === "/api/leaderboard" && M === "GET") {
    const prefix = clip(url.searchParams.get("prefix") || "", 60);
    if (prefix && !/^[tbd]\|[^%_\n]*$/.test(prefix)) return err(400, "Bad category.");
    return cachedJSON(ctx, url.origin + "/api/leaderboard?prefix=" + encodeURIComponent(prefix), LB_TTL, async () => {
      const rows = prefix
        ? await env.DB.prepare("SELECT u.display AS name, COUNT(*) AS n FROM users u, json_each(u.found) j WHERE u.public = 1 AND j.value LIKE ? GROUP BY u.name ORDER BY n DESC, u.updated ASC LIMIT 50").bind(prefix + "%").all()
        : await env.DB.prepare("SELECT display AS name, json_array_length(found) AS n FROM users WHERE public = 1 AND found != '[]' ORDER BY n DESC, updated ASC LIMIT 50").all();
      return { prefix, rows: rows.results || [], at: now() };
    });
  }

  /* ---- submissions: anyone can send; admins read them ---- */
  if (path === "/api/submit" && M === "POST") {
    const b = await body(req); if (!b) return err(400, "Bad request.");
    if (b.botcheck) return json({ ok: true });                       // spam bot filled the hidden box
    const text = clip(b.text, 4000).trim(), link = clip(b.link, 500).trim();
    if (!text && !link) return err(400, "Write some details or add a link first.");
    const subAcct = await whoami(env, req);
    if (await isBlocked(env, req, subAcct)) return err(403, "You can't send info to this site.");
    if (!(await rateLimit(env, req, "s:", SUBMIT_LIMIT))) return err(429, "You've sent a lot just now. Wait a few minutes.");
    const account = (await whoami(env, req)) || "";
    const r = await env.DB.prepare("INSERT INTO submissions (kind, entry, text, link, who, account, created) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(clip(b.kind, 40) || "Other", clip(b.entry, 150), text, link, clip(b.name, 60), account, now()).run();
    if (r.meta && r.meta.last_row_id) await env.DB.prepare("INSERT OR REPLACE INTO subip (sub, ip) VALUES (?, ?)").bind(r.meta.last_row_id, await ipTag(req)).run();
    if (env.DISCORD_WEBHOOK) {                                        // optional ping, kept secret on the server
      ctx.waitUntil(fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        content: "@everyone new PDA submission",
        allowed_mentions: { parse: ["everyone"] },
        embeds: [{ title: `${clip(b.kind, 40) || "Other"}${b.entry ? ": " + clip(b.entry, 150) : ""}`, description: (text + (link ? `\n\n${link}` : "")).slice(0, 3900), footer: { text: [clip(b.name, 60), account && "account: " + account].filter(Boolean).join(" · ") || "anonymous" } }] }) }).catch(() => {}));
    }
    return json({ ok: true }, 201);
  }
  if (path === "/api/mysubs" && M === "GET") {
    const name = await whoami(env, req); if (!name) return err(401, "Logged out. Log in again.");
    const rows = await env.DB.prepare("SELECT id, kind, entry, status, note, created FROM submissions WHERE account = ? ORDER BY created DESC LIMIT 50").bind(name).all();
    return json(rows.results || []);
  }

  /* ---- picture uploads (needs an R2 bucket bound as IMAGES) ---- */
  if (path === "/api/upload" && M === "POST") {
    if (!env.IMAGES) return err(501, "Picture uploads aren't set up.");
    const len = +(req.headers.get("Content-Length") || 0); if (len > UPLOAD_MAX) return err(413, "Pictures can be up to 5 MB.");
    const upName = await whoami(env, req);
    if (!isAdmin(env, upName) && await isBlocked(env, req, upName)) return err(403, "You can't send info to this site.");
    if (!isAdmin(env, upName) && !(await rateLimit(env, req, "u:", UPLOAD_LIMIT))) return err(429, "You've uploaded a lot just now. Wait a few minutes.");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return err(400, "No picture.");
    if (buf.byteLength > UPLOAD_MAX) return err(413, "Pictures can be up to 5 MB.");
    const type = sniff(buf); if (!type) return err(415, "Only PNG, JPG, WEBP or GIF pictures.");
    const key = `${now()}-${randomHex(8)}.${IMG_TYPES[type]}`;
    await env.IMAGES.put(key, buf, { httpMetadata: { contentType: type } });
    return json({ url: `${url.origin}/img/${key}` }, 201);
  }
  const im = path.match(/^\/img\/(\d+-[0-9a-f]{16}\.(png|jpg|webp|gif))$/);
  if (im && M === "GET") {
    if (!env.IMAGES) return err(404, "Not found.");
    const o = await env.IMAGES.get(im[1]); if (!o) return err(404, "Not found.");
    const type = Object.keys(IMG_TYPES).find(k => IMG_TYPES[k] === im[2]);
    return new Response(o.body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", ...CORS } });
  }

  if (path === "/api/admin/check" && M === "GET") return json({ admin: isAdmin(env, await whoami(env, req)), announce: !!env.ANNOUNCE_WEBHOOK });
  if (path.startsWith("/api/admin/")) {
    const name = await whoami(env, req);
    if (!isAdmin(env, name)) return err(403, "Admins only.");
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
    if (sm && M === "DELETE") {
      const row = await env.DB.prepare("SELECT link FROM submissions WHERE id = ?").bind(+sm[1]).first();
      const own = row && env.IMAGES && String(row.link).startsWith(url.origin + "/img/") ? row.link.slice(url.origin.length + 5) : "";
      const used = own && await env.DB.prepare("SELECT 1 FROM overrides WHERE data LIKE ?").bind("%" + own + "%").first();
      if (own && !used) await env.IMAGES.delete(own);                 // uploaded picture nobody published
      await env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(+sm[1]).run(); return json({ ok: true });
    }
    /* what's set up on this Worker (shown on the admin page) */
    if (path === "/api/admin/setup" && M === "GET") {
      const want = { users: 1, sessions: 1, attempts: 1, submissions: 2, overrides: 2, friends: 2, counts: 2, activity: 3, changes: 4, blocks: 4, subip: 4 };
      const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      const have = new Set((rows.results || []).map(r => r.name));
      const missing = Object.keys(want).filter(t => !have.has(t));
      const fix = missing.length ? [...new Set(missing.map(t => want[t] === 1 ? "schema.sql" : `schema-update-${want[t]}.sql`))].join(", then ") : "";
      return json({ tables: { missing, fix }, uploads: !!env.IMAGES, ping: !!env.DISCORD_WEBHOOK, announce: !!env.ANNOUNCE_WEBHOOK });
    }
    /* change history + undo */
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
    /* blocking spammers */
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
      if (acct && isAdmin(env, acct)) return err(400, "You can't block an admin.");
      await env.DB.prepare("INSERT INTO blocks (ip, account, note, by, created) VALUES (?, ?, ?, ?, ?)").bind(ip, acct, clip(b.note || (sub && sub.who) || "", 200), name, now()).run();
      if (b.sub && b.purge) {                                         // also hide everything else they sent
        if (ip) await env.DB.prepare("UPDATE submissions SET status = 'rejected' WHERE status = 'new' AND id IN (SELECT sub FROM subip WHERE ip = ?)").bind(ip).run();
        if (acct) await env.DB.prepare("UPDATE submissions SET status = 'rejected' WHERE status = 'new' AND account = ?").bind(acct).run();
      }
      return json({ ok: true }, 201);
    }
    const bm = path.match(/^\/api\/admin\/blocks\/(\d+)$/);
    if (bm && M === "DELETE") { await env.DB.prepare("DELETE FROM blocks WHERE id = ?").bind(+bm[1]).run(); return json({ ok: true }); }
    /* post a "new entries" message to Discord */
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
      const id = decodeURIComponent(om[1]); if (!ID_RE.test(id)) return err(400, "Bad entry.");
      if (M === "PUT") {
        const b = await body(req); if (!b || typeof b.data !== "object") return err(400, "Bad request.");
        const d = {}; const src = b.data;
        if (typeof src.comment === "string") d.comment = clip(src.comment, 8000);
        if (typeof src.desc === "string") d.desc = clip(src.desc, 8000);
        if (src.stats && typeof src.stats === "object") { d.stats = {}; Object.entries(src.stats).slice(0, 60).forEach(([k, v]) => { d.stats[clip(k, 40).toUpperCase()] = clip(v, 120); }); }
        if (typeof src.tier === "number" && src.tier >= 1 && src.tier <= 9) d.tier = src.tier;
        if (typeof src.update === "string" && src.update.trim()) d.update = clip(src.update.trim(), 40);
        const okUrl = u => typeof u === "string" && (/^https?:\/\/[^\s"'<>]{4,500}$/.test(u) || /^images\/[\w\-.\/]{1,200}$/.test(u));
        if (Array.isArray(src.imgs)) { const l = src.imgs.filter(okUrl).slice(0, 8); if (l.length) d.imgs = l; }
        else if (okUrl(src.img)) d.imgs = [src.img];
        if (src.add && typeof src.add === "object") {                  // a brand-new entry that isn't in data.js
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

  /* ---- published info (stats / comments / descriptions added from the admin page) ---- */
  if (path === "/api/overrides" && M === "GET") {
    const rows = await env.DB.prepare("SELECT id, data, updated FROM overrides").all();
    const out = {}; (rows.results || []).forEach(r => { out[r.id] = { ...JSON.parse(r.data), updated: r.updated }; });
    return json(out, 200, { "Cache-Control": "public, max-age=60" });
  }

  /* ---- rarity: how many sharing players have each entry ---- */
  if (path === "/api/rarity" && M === "GET") {
    const cache = caches.default, key = new Request(url.origin + "/api/rarity");
    const hit = await cache.match(key); if (hit) return hit;
    const players = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE share = 1 AND found != '[]'").first();
    const rows = await env.DB.prepare("SELECT j.value AS id, COUNT(*) AS n FROM users, json_each(users.found) AS j WHERE users.share = 1 GROUP BY j.value").all();
    const counts = {}; (rows.results || []).forEach(r => { counts[r.id] = r.n; });
    const res = json({ players: players ? players.n : 0, counts, at: now() }, 200, { "Cache-Control": `public, max-age=${RARITY_TTL}` });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }

  /* ---- public profile ---- */
  const pm = path.match(/^\/api\/u\/([A-Za-z0-9_]{3,20})$/);
  if (pm && M === "GET") {
    const u = await env.DB.prepare("SELECT display, found, updated FROM users WHERE name = ? AND public = 1").bind(pm[1]).first();
    if (!u) return err(404, "No public profile with that name.");
    return json({ name: u.display, found: JSON.parse(u.found), updated: u.updated });
  }

  return err(404, "Not found.");
}

export default {
  async fetch(req, env, ctx) {
    try { return await route(req, env, ctx); }
    catch (e) { return err(500, /no such table/.test(String(e && e.message)) ? "Database needs updating: run the newest schema-update SQL file in the D1 console." : "Server error."); }
  }
};
