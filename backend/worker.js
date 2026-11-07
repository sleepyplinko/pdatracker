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
  if (path === "" || path === "/api") return json({ ok: true, service: "pda-tracker" });

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
        env.DB.prepare("DELETE FROM friends WHERE name = ? OR friend = ?").bind(name, name), env.DB.prepare("DELETE FROM counts WHERE name = ?").bind(name)]);
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
    if (!(await rateLimit(env, req, "s:", SUBMIT_LIMIT))) return err(429, "You've sent a lot just now. Wait a few minutes.");
    const account = (await whoami(env, req)) || "";
    const r = await env.DB.prepare("INSERT INTO submissions (kind, entry, text, link, who, account, created) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(clip(b.kind, 40) || "Other", clip(b.entry, 150), text, link, clip(b.name, 60), account, now()).run();
    if (env.DISCORD_WEBHOOK) {                                        // optional ping, kept secret on the server
      ctx.waitUntil(fetch(env.DISCORD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        content: env.DISCORD_PING ? `<@${env.DISCORD_PING}> new submission` : "New PDA submission",
        allowed_mentions: { parse: [], users: env.DISCORD_PING ? [String(env.DISCORD_PING)] : [] },
        embeds: [{ title: `${clip(b.kind, 40) || "Other"}${b.entry ? ": " + clip(b.entry, 150) : ""}`, description: (text + (link ? `\n\n${link}` : "")).slice(0, 3900), footer: { text: [clip(b.name, 60), account && "account: " + account].filter(Boolean).join(" · ") || "anonymous" } }] }) }).catch(() => {}));
    }
    return json({ ok: true }, 201);
  }
  if (path === "/api/admin/check" && M === "GET") return json({ admin: isAdmin(env, await whoami(env, req)) });
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
    if (sm && M === "DELETE") { await env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(+sm[1]).run(); return json({ ok: true }); }
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
        await env.DB.prepare("INSERT INTO overrides (id, data, updated, by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated, by = excluded.by").bind(id, JSON.stringify(d), now(), name).run();
        return json({ ok: true, id, data: d });
      }
      if (M === "DELETE") { await env.DB.prepare("DELETE FROM overrides WHERE id = ?").bind(id).run(); return json({ ok: true }); }
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
    catch (e) { return err(500, /no such table/.test(String(e && e.message)) ? "Database needs updating: run schema-update-2.sql in the D1 console." : "Server error."); }
  }
};
