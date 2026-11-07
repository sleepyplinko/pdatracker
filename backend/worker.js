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
async function rateLimit(env, req) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const since = now() - 600;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM attempts WHERE ip = ? AND t > ?").bind(ip, since).first();
  if (row && row.n >= AUTH_LIMIT) return false;
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
      await env.DB.batch([env.DB.prepare("DELETE FROM users WHERE name = ?").bind(name), env.DB.prepare("DELETE FROM sessions WHERE name = ?").bind(name)]);
      return json({ deleted: true });
    }
  }
  if (path === "/api/logout" && M === "POST") {
    const m = (req.headers.get("Authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(await sha256(m[1])).run();
    return json({ ok: true });
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
    catch (e) { return err(500, "Server error."); }
  }
};
