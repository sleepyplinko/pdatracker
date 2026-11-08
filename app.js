/* =====================================================================
   PDA.exe tracker — app logic.
   Entries live in data.js, sound files are set in sounds.js.
   ===================================================================== */
(() => {
  "use strict";

  /* ---------- storage (wrapped: private windows can throw) ---------- */
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
  /* save profiles: "Main" uses the original keys, others get "@Name" on the end */
  const KEY_PROF  = "pda-profiles-v1";
  const PROF = Object.assign({ active: "Main", list: ["Main"] }, load(KEY_PROF, {}));
  if (!PROF.list.includes(PROF.active)) PROF.active = "Main";
  const pk = k => PROF.active === "Main" ? k : `${k}@${PROF.active}`;
  const KEY_FOUND = pk("pda-found-v1");
  const KEY_SET   = "pda-settings-v1";
  const KEY_UI    = "pda-ui-v1";
  const KEY_USER  = pk("pda-user-v1");
  const KEY_FAV   = pk("pda-fav-v1");
  const KEY_NOTES = pk("pda-notes-v1");
  const KEY_LOG   = pk("pda-log-v1");
  const KEY_SEEN  = "pda-seen-v1";
  const KEY_FRIEND= pk("pda-friend-v1");
  const KEY_SINCE = pk("pda-since-backup-v1");
  const KEY_PROG  = pk("pda-progress-v1");
  const KEY_LOAD  = pk("pda-loadout-v2");      // { items: [[entry id, count]], base: "" }      // { "2026-11-06": 42, ... } found count per day
  const REPO = "https://github.com/sleepyplinko/pdatracker";

  let found    = load(KEY_FOUND, {});
  let settings = Object.assign({ lockedNames: false, missingPics: true, hideFound: false, confirmUnmark: false, crt: false, sound: true, hoverSound: true, volume: 70 }, load(KEY_SET, {}));
  const savedUI = load(KEY_UI, {});
  let ui       = Object.assign({ tab: "tools", cat: 0, bio: 0, docs: 0, view: "grid", filter: "all", stype: "all", btab: "desc",
                                sort: "found", compact: false, hideDone: false, tmin: "", tmax: "", tierMin: "", tsort: "", cal: "", cmp: [], scroll: {}, detail: null }, savedUI);
  if (!Array.isArray(ui.cmp)) ui.cmp = [];
  if (!ui.scroll || typeof ui.scroll !== "object") ui.scroll = {};
  if (!("filter" in savedUI) && settings.hideFound) ui.filter = "missing";   // old "hide found" setting
  let favs     = load(KEY_FAV, {});
  let notes    = load(KEY_NOTES, {});
  /* entries that moved to another tab keep their progress (old id -> new id) */
  const MOVED = { "b|miscellaneous|wc emissary": "b|wc|wc emissary", "b|miscellaneous|wc speedster": "b|wc|wc speedster" };
  const migrateIds = (obj, key) => {
    let ch = false;
    Object.entries(MOVED).forEach(([o, n]) => { if (obj && o in obj) { if (!(n in obj)) obj[n] = obj[o]; delete obj[o]; ch = true; } });
    if (ch) save(key, obj);
    return obj;
  };
  migrateIds(found, KEY_FOUND); migrateIds(favs, KEY_FAV); migrateIds(notes, KEY_NOTES);
  let history_ = load(KEY_LOG, []);
  let friend   = load(KEY_FRIEND, null);      // { name, set } from a friend's share link
  let sinceBackup = load(KEY_SINCE, 0);
  let progress = load(KEY_PROG, {});
  let loadout  = load(KEY_LOAD, null);
  if (!loadout || !Array.isArray(loadout.items)) loadout = { items: [], base: "" };
  const BASE_CARRY = 5;                          // everyone starts with 5 carry weight
  const baseCarry = () => { const n = parseFloat(loadout.base); return isNaN(n) ? BASE_CARRY : n; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  // this browser tab's session: what you had when you opened the site
  let sessionStart = null;
  try { sessionStart = JSON.parse(sessionStorage.getItem("pda-session-" + PROF.active)); } catch { /* ignore */ }
  let viewOnly = null;                        // { name, set } while looking at someone's share link
  const undoStack = [];
  let lastStar = null;                        // { id, on } for shift-click ranges
  let user     = load(KEY_USER, "");
  let detail   = null;      // { type: "tool" | "person" | "doc", id }
  let query    = "";
  let pendingTier = null;   // "catIndex|tier" while its "are you sure?" is showing
  let pendingTimer = 0;

  /* =====================================================================
     SOUND
     ===================================================================== */
  const SFX = (typeof PDA_SOUNDS === "object" && PDA_SOUNDS) || {};
  const pools = {};
  function play(name) {
    if (!settings.sound) return;
    if (name.startsWith("hover") && !settings.hoverSound) return;
    const def = SFX[name];
    if (!def || !def.file) return;
    let pool = pools[name];
    if (!pool) {
      pool = pools[name] = { i: 0, list: [] };
      for (let n = 0; n < (name.startsWith("hover") ? 6 : 3); n++) {
        const a = new Audio(def.file); a.preload = "auto"; pool.list.push(a);
      }
    }
    const a = pool.list[pool.i++ % pool.list.length];
    try {
      a.volume = Math.max(0, Math.min(1, (def.volume ?? 1) * settings.volume / 100));
      a.currentTime = 0;
      const p = a.play(); if (p && p.catch) p.catch(() => {});
    } catch { /* browsers block sound until the first click; ignore */ }
  }
  /* the PDA "turning on": browsers only allow sound after the first click/key, so it waits for that if it has to */
  (() => {
    let done = false;
    const go = () => { if (done || !settings.sound) return; done = true; play("pdaOpen"); };
    try { const d = SFX.pdaOpen; if (d && d.file && settings.sound) { const a = new Audio(d.file); a.volume = Math.max(0, Math.min(1, (d.volume ?? 1) * settings.volume / 100)); a.play().then(() => { done = true; }).catch(() => {}); } } catch { /* ignore */ }
    ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, go, { once: true, capture: true }));
  })();
  // preload the files so the first hover isn't late
  window.addEventListener("load", () => Object.keys(SFX).forEach(k => { if (SFX[k].file) { const a = new Audio(); a.preload = "auto"; a.src = SFX[k].file; } }));

  const HOVERABLE = "[data-hidedone], .pg-hit, .hbtn, .mini-btn, .xbtn, .lbnav, .cmpbar button, .zoomable, .favbtn, .btab, .chip-btn, .viewtools button, .sres-ic, .tabbtn, .tab, .cat, .tile, .card, .doc, .subtab, .pbtn, .return, .star, .estar, .hstar, .arrow, .linkish, .tier-btn, .tier-yes, .tier-no, .onoff button, .sres-main, .sres-star, .mtab, .clear-search";
  let lastHover = null, lastHoverAt = 0;
  document.addEventListener("pointerover", e => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const el = e.target.closest(HOVERABLE);
    if (!el || el === lastHover) return;
    lastHover = el;
    const now = performance.now();
    if (now - lastHoverAt < 35) return;
    lastHoverAt = now;
    play(el.matches(".card") ? "hoverPerson" : el.matches(".tile, .doc") ? "hoverTool" : el.matches(".tab, .cat, .subtab, .mtab") ? "hoverTab" : "hover");
  });
  document.addEventListener("pointerout", e => {
    const el = e.target.closest(HOVERABLE);
    if (el && !el.contains(e.relatedTarget)) lastHover = null;
  });

  /* =====================================================================
     DATA → ENTRIES (each with a stable id)
     ===================================================================== */
  const slug = s => String(s).toLowerCase().replace(/\s+/g, " ").trim();
  const entries = [];
  const byId = new Map();
  const add = e => { entries.push(e); byId.set(e.id, e); return e; };
  const norm = raw => Array.isArray(raw) ? { name: raw[0], ...(raw[1] || {}) }
                    : typeof raw === "string" ? { name: raw } : { ...raw };

  /* entries added from the admin page: the last copy from the server is slotted
     into the data before anything is built (loadOverrides reloads if it changes) */
  const OV_CACHE = (typeof PDA_CLOUD === "object" && PDA_CLOUD && PDA_CLOUD.api) ? load("pda-overrides-v1", {}) : {};
  const addedSig = ov => JSON.stringify(Object.entries(ov || {}).filter(([, o]) => o && o.add).map(([id, o]) => [id, o.add]).sort());
  const ADDED_SIG = addedSig(OV_CACHE);
  const SEC_DATA = { tools: () => PDA_DATA.tools, bio: () => PDA_DATA.biography, docs: () => PDA_DATA.documents };
  const SEC_LETTER = { tools: "t", bio: "b", docs: "d" };
  Object.values(OV_CACHE).forEach(o => {
    const a = o && o.add; if (!a || !SEC_DATA[a.section]) return;
    const g = SEC_DATA[a.section]().find(x => slug(x.name) === slug(a.group)); if (!g) return;
    const all = a.section === "tools" ? Object.values(g.tiers).flat() : g.entries;
    if (all.some(r => slug(norm(r).name) === slug(a.name))) return;          // data.js has it now
    const raw = [a.name, { added: true }];
    const newId = `${SEC_LETTER[a.section]}|${slug(g.name)}|${slug(a.name)}`;
    const m = a.replace && a.replace.match(/^[tbd]\|[^|]+\|(?:(\d+)\|)?\?\?\?(\d+)$/);
    let list = a.section === "tools" ? (g.tiers[m && m[1] ? m[1] : a.tier] = g.tiers[m && m[1] ? m[1] : a.tier] || []) : g.entries;
    if (m && list[+m[2]] !== undefined && norm(list[+m[2]]).name === "???") {
      list[+m[2]] = raw;                                                       // fills a ??? slot
      if (found[a.replace] && !found[newId]) { found[newId] = 1; save(KEY_FOUND, found); }
    } else list.push(raw);
  });

  PDA_DATA.tools.forEach((cat, ci) => {
    cat.items = [];
    Object.keys(cat.tiers).sort((a, b) => a - b).forEach(tier => {
      cat.tiers[tier].forEach((raw, i) => {
        const r = norm(raw);
        const unknown = r.name === "???";
        const id = unknown ? `t|${slug(cat.name)}|${tier}|???${i}` : `t|${slug(cat.name)}|${slug(r.name)}`;
        cat.items.push(add({ ...r, id, section: "tools", group: cat.name, catIndex: ci, tier: +tier, unknown }));
      });
    });
  });

  // Biography: a "card" is either one person or a group of variants (members).
  // A card is ONE unlock. Unlocking it lets you view every variant inside it.
  const people = [];        // every person page (single people + every variant)
  PDA_DATA.biography.forEach((g, gi) => {
    g.cards = g.entries.map((raw, i) => {
      const r = norm(raw);
      const unknown = r.name === "???";
      const cardId = `b|${slug(g.name)}|${unknown ? "???" + i : slug(r.name)}`;
      if (Array.isArray(r.members)) {
        const card = { kind: "group", name: r.name, img: r.img, desc: r.desc, members: [] };
        // the tracked entry for the whole card
        card.entry = add({ name: r.name, id: cardId, section: "bio", group: g.name, groupIndex: gi, card, isCard: true });
        // the variants: viewable pages that share the card's checkmark
        card.members = r.members.map(m => {
          const v = { ...norm(m), id: `${cardId}|${slug(norm(m).name)}`, trackId: cardId,
                      section: "bio", group: g.name, groupIndex: gi, card };
          byId.set(v.id, v); people.push(v);
          return v;
        });
        return card;
      }
      const card = { kind: "single", name: r.name, img: r.img };
      card.entry = add({ ...r, id: cardId, section: "bio", group: g.name, groupIndex: gi, unknown, card });
      card.members = [card.entry];
      people.push(card.entry);
      return card;
    });
    g.items = g.cards.map(c => c.entry);
  });

  PDA_DATA.documents.forEach((g, gi) => {
    g.items = g.entries.map((raw, i) => {
      const r = norm(raw);
      const unknown = r.name === "???";
      return add({ ...r, id: `d|${slug(g.name)}|${unknown ? "???" + i : slug(r.name)}`,
                   section: "docs", group: g.name, groupIndex: gi, kind: g.kind, unknown });
    });
  });

  // a variant's checkmark is its card's checkmark
  const trackOf   = id => { const e = byId.get(id); return (e && e.trackId) || id; };
  const isFound   = id => !!(viewOnly ? viewOnly.set : found)[trackOf(id)];
  const cardFound = c => isFound(c.entry.id);
  // older saves tracked each variant separately: fold those into their card
  people.forEach(v => { if (v.trackId) { const old = `${v.trackId.replace(/\|[^|]*$/, "")}|${slug(v.card.name)}|${slug(v.name)}`; if (found[old]) { found[v.trackId] = 1; delete found[old]; } } });
  const countOf   = list => [list.filter(e => isFound(e.id)).length, list.length];
  const label     = e => e.unknown ? "???" : e.name;



  /* ---------- sorting: found A→Z first, then locked A→Z, ??? last ---------- */
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  /* when something was last marked found (for "recently found" sorting) */
  function foundAt(id) {
    if (!isFound(id)) return 0;
    const t = trackOf(id);
    const h = history_.find(x => x.id === t);
    return h && h.on ? h.t : 1;
  }
  function sortBy(list, isOn, nameOf, idOf) {
    return list.slice().sort((a, b) => {
      if (ui.sort === "recent" && idOf) {
        const ta = foundAt(idOf(a)), tb = foundAt(idOf(b));
        if (ta !== tb) return tb - ta;
      } else if (ui.sort === "rare" && idOf && rarity) {
        const ra = rarityOf(idOf(a)), rb = rarityOf(idOf(b));
        if (ra !== rb) return (ra == null ? 2 : ra) - (rb == null ? 2 : rb);
      } else if (ui.sort !== "az") {
        const fa = isOn(a), fb = isOn(b);
        if (fa !== fb) return fa ? -1 : 1;
      }
      const na = nameOf(a), nb = nameOf(b);
      const ua = na === "???", ub = nb === "???";
      if (ua !== ub) return ua ? 1 : -1;
      return collator.compare(na, nb);
    });
  }
  const sortEntries = list => sortBy(list, e => isFound(e.id), label, e => e.id);
  const sortCards   = list => sortBy(list, cardFound, c => c.name, c => c.entry.id);

  const passFilter = on => ui.filter === "all" || (ui.filter === "missing" ? !on : on);

  /* every mark/unmark goes through here: saves, logs, offers undo */
  function change(ids, on, what) {
    if (viewOnly) { play("warn"); toast("This is someone else's PDA. Press EXIT at the top to go back to yours."); return false; }
    const before = { ...found };
    const changed = [];
    ids.forEach(id => { const t = trackOf(id); if (!!found[t] !== on) { if (on) found[t] = 1; else delete found[t]; changed.push(t); } });
    if (!changed.length) return false;
    save(KEY_FOUND, found); updateCount(); scheduleSync();
    undoStack.push(before); if (undoStack.length > 30) undoStack.shift();
    const now = Date.now();
    if (changed.length <= 3) changed.forEach(id => history_.unshift({ id, on, t: now }));
    else history_.unshift({ bulk: what || "several entries", n: changed.length, on, t: now });
    history_ = history_.slice(0, 60); save(KEY_LOG, history_);
    sinceBackup += changed.length; save(KEY_SINCE, sinceBackup);
    snapProgress();
    const nm = changed.length === 1 ? (byId.get(changed[0]) || {}).name : `${changed.length} entries`;
    toast(`${on ? "Marked" : "Unmarked"} ${nm}${on ? " as found" : ""}`, { undo: true });
    backupNag();
    return true;
  }
  function undo() {
    if (viewOnly || !undoStack.length) { toast("Nothing to undo."); return; }
    found = undoStack.pop();
    save(KEY_FOUND, found); updateCount(); scheduleSync();
    history_.unshift({ undo: true, t: Date.now() }); save(KEY_LOG, history_.slice(0, 60));
    play("back"); toast("Undone.");
    keepScroll(render); renderTabs();
  }
  function toggle(id) {
    const on = !isFound(id);
    if (change([id], on)) play(on ? "select" : "deselect");
    return on;
  }

  /* =====================================================================
     ICONS
     ===================================================================== */
  const I = {
    profile: '<svg viewBox="0 0 24 24" fill="#111"><path d="M12 19.2c-2.5 0-4.71-1.28-6-3.2.03-2 4-3.1 6-3.1s5.97 1.1 6 3.1a7.23 7.23 0 0 1-6 3.2M12 5a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3m0-3A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10c0-5.53-4.5-10-10-10"/></svg>',
    cloud:   '<svg viewBox="0 0 24 24" fill="#111"><path d="M6.5 20q-2.28 0-3.89-1.57Q1 16.85 1 14.58q0-1.95 1.17-3.48 1.18-1.53 3.08-1.95.43-1.8 2.13-3.42Q9.07 4.1 11 4.1q.83 0 1.41.59.59.59.59 1.41v6.05l1.6-1.55L16 12l-4 4-4-4 1.4-1.4 1.6 1.55V6.1q-1.9.35-2.95 1.84T7 11h-.5q-1.45 0-2.47 1.03Q3 13.05 3 14.5T4.03 17q1.02 1 2.47 1h12q1.05 0 1.77-.73.73-.72.73-1.77t-.73-1.77Q19.55 13 18.5 13H17v-2q0-1.2-.55-2.24Q15.9 7.73 15 7V4.68q1.85.87 2.93 2.58Q19 9 19 11q1.73.2 2.86 1.5 1.14 1.28 1.14 3 0 1.88-1.31 3.19T18.5 20M12 11.05"/></svg>',
    manual:  '<svg viewBox="0 0 24 24" fill="#111"><path d="m16.75 22.16-2.75-3L15.16 18l1.59 1.59L20.34 16l1.16 1.41zM6 22a2 2 0 0 1-2-2V4c0-1.11.89-2 2-2h1v7l2.5-1.5L12 9V2h6a2 2 0 0 1 2 2v9.34A6.005 6.005 0 0 0 12.8 22z"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="#111"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64z"/></svg>',
    community: '<svg viewBox="0 0 24 24" fill="#111"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2M6 9h12v2H6m8 3H6v-2h8m4-4H6V6h12"/></svg>',
    damage: '<svg viewBox="0 0 24 24" fill="#111"><path d="M12 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m-8.95 5H1v-2h2.05C3.5 6.83 6.83 3.5 11 3.05V1h2v2.05c4.17.45 7.5 3.78 7.95 7.95H23v2h-2.05c-.45 4.17-3.78 7.5-7.95 7.95V23h-2v-2.05C6.83 20.5 3.5 17.17 3.05 13M12 5a7 7 0 0 0-7 7 7 7 0 0 0 7 7 7 7 0 0 0 7-7 7 7 0 0 0-7-7"/></svg>',
    players: '<svg viewBox="0 0 24 24" fill="#111"><path d="M12 5.5A3.5 3.5 0 0 1 15.5 9a3.5 3.5 0 0 1-3.5 3.5A3.5 3.5 0 0 1 8.5 9 3.5 3.5 0 0 1 12 5.5M5 8c.56 0 1.08.15 1.53.42-.15 1.43.27 2.85 1.13 3.96C7.16 13.34 6.16 14 5 14a3 3 0 0 1-3-3 3 3 0 0 1 3-3m14 0a3 3 0 0 1 3 3 3 3 0 0 1-3 3c-1.16 0-2.16-.66-2.66-1.62a5.54 5.54 0 0 0 1.13-3.96c.45-.27.97-.42 1.53-.42M5.5 18.25c0-2.07 2.91-3.75 6.5-3.75s6.5 1.68 6.5 3.75V20h-13zM0 20v-1.5c0-1.39 1.89-2.56 4.45-2.9-.59.68-.95 1.62-.95 2.65V20zm24 0h-3.5v-1.75c0-1.03-.36-1.97-.95-2.65 2.56.34 4.45 1.51 4.45 2.9z"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="#111"><path d="m12 1 9 4v6c0 5.55-3.84 10.74-9 12-5.16-1.26-9-6.45-9-12V5zm4 13H8v1.5c0 .27.19.46.47.5h6.96c.31 0 .52-.16.57-.41V14m1-6-2.67 2.67L12 8.34l-2.33 2.33L7 8l1 5h8z"/></svg>',
    loadout: '<svg viewBox="0 0 24 24" fill="#111"><path d="M10 3 8 5v2H5C3.85 7 3.12 8 3 9L2 19c-.12 1 .54 2 2 2h16c1.46 0 2.12-1 2-2L21 9c-.12-1-.94-2-2-2h-3V5l-2-2zm0 2h4v2h-4zm1 5h2v3h3v2h-3v3h-2v-3H8v-2h3z"/></svg>',
    missing: '<svg viewBox="0 0 24 24" fill="#111"><path d="M7 5h14v2H7zm0 8v-2h14v2zM4 4.5A1.5 1.5 0 0 1 5.5 6 1.5 1.5 0 0 1 4 7.5 1.5 1.5 0 0 1 2.5 6 1.5 1.5 0 0 1 4 4.5m0 6A1.5 1.5 0 0 1 5.5 12 1.5 1.5 0 0 1 4 13.5 1.5 1.5 0 0 1 2.5 12 1.5 1.5 0 0 1 4 10.5M7 19v-2h14v2zm-3-2.5A1.5 1.5 0 0 1 5.5 18 1.5 1.5 0 0 1 4 19.5 1.5 1.5 0 0 1 2.5 18 1.5 1.5 0 0 1 4 16.5"/></svg>',
    heart: on => `<svg viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`,
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="#111"><g transform="translate(24 0) scale(-1 1)"><path d="M2 19.63 13.43 8.2l-.71-.7 1.42-1.43L12 3.89c1.2-1.19 3.09-1.19 4.27 0l3.6 3.61-1.42 1.41h2.84l.71.71-3.55 3.59-.71-.71V9.62l-1.47 1.42-.71-.71L4.13 21.76z"/></g></svg>',
    biography:'<svg viewBox="0 0 24 24" fill="#111"><path d="M19 17h-8v-1c0-1.33 2.67-2 4-2s4 .67 4 2m-4-7a2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2 2 2 0 0 1 2-2m5-3h-8l-2-2H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2"/></svg>',
    documents:'<svg viewBox="0 0 24 24" fill="#111"><path d="M13 9h5.5L13 3.5zM6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.11.89-2 2-2m9 16v-2H6v2zm3-4v-2H6v2z"/></svg>',
    lock:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v12h-13V10zm2.5 0h5V7a2.5 2.5 0 0 0-5 0z"/><circle cx="12" cy="15.5" r="1.6" fill="#000"/><rect x="11.3" y="16" width="1.4" height="3" fill="#000"/></svg>',
    check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    question:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor"><circle cx="50" cy="50" r="44" stroke-width="5"/><path d="M36 38a14 14 0 1 1 20 12.6c-4 2-6 4.6-6 9.4v4" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="76" r="4.5" fill="currentColor" stroke="none"/></svg>',
    person:  '<svg viewBox="0 0 100 100" fill="#e9e9e9"><circle cx="50" cy="34" r="20"/><path d="M12 92c4-22 20-34 38-34s34 12 38 34z"/></svg>',
    people:  '<svg viewBox="0 0 100 100" fill="#e9e9e9"><circle cx="34" cy="38" r="14"/><circle cx="66" cy="38" r="14"/><path d="M4 88c3-17 15-26 30-26s27 9 30 26z"/><path d="M36 88c3-17 15-26 30-26s27 9 30 26z" opacity=".75"/></svg>',
    wifi:    '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"><path d="M18 74a56 56 0 0 1 56-56"/><path d="M34 74a40 40 0 0 1 40-40"/><path d="M50 74a24 24 0 0 1 24-24"/><circle cx="72" cy="72" r="6" fill="currentColor" stroke="none"/></svg>',
    note:    '<svg viewBox="0 0 100 100"><path d="M18 6h44l22 22v66H18z" fill="currentColor"/><path d="M62 6v22h22" fill="#000" opacity=".25"/><path d="M30 46h40M30 58h40M30 70h40M30 34h24" stroke="#111" stroke-width="7" stroke-linecap="round"/></svg>',
    star:    on => `<svg viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/></svg>`,
    gun:     '<svg viewBox="0 0 100 70" fill="currentColor"><path d="M4 10h82v14H58l-6 8H40l-6 34H14l8-34H4z"/></svg>',
    search:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/></svg>',
    download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></svg>',
    upload:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 15V3M7 8l5-5 5 5M4 20h16"/></svg>'
  };
  /* small icons for the enemy stat rows (Material Design Icons, Apache 2.0; burst + fist from Font Awesome Free, CC BY 4.0) */
  const SI = {
    heart: { vb: "0 0 24 24", b: '<path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53z"/>' },
    run: { vb: "0 0 24 24", b: '<path d="M16.5 5.5a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2m-3.6 13.9 1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 22 13v-2c-1.76.03-3.4-.89-4.3-2.4l-1-1.6c-.36-.6-1-1-1.7-1-.3 0-.5.1-.8.1L9 8.3V13h2V9.6l1.8-.7-1.6 8.1-4.9-1-.4 2zM4 9a1 1 0 0 1-1-1 1 1 0 0 1 1-1h3v2zm1-4a1 1 0 0 1-1-1 1 1 0 0 1 1-1h5v2zm-2 8a1 1 0 0 1-1-1 1 1 0 0 1 1-1h4v2z"/>' },
    shieldO: { vb: "0 0 24 24", b: '<path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5z"/>' },
    shieldP: { vb: "0 0 24 24", b: '<path d="M12 12h7c-.53 4.11-3.28 7.78-7 8.92zH5V6.3l7-3.11M12 1 3 5v6c0 5.55 3.84 10.73 9 12 5.16-1.27 9-6.45 9-12V5z"/>' },
    flame: { vb: "0 0 24 24", b: '<path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-.95.23-1.78.75-2.49 1.32-2.59 2.08-3.61 5.75-2.39 8.9.04.1.08.2.08.33 0 .22-.15.42-.35.5-.23.1-.47.04-.66-.12a.6.6 0 0 1-.14-.17c-1.13-1.43-1.31-3.48-.55-5.12C5.78 10 4.87 12.3 5 14.47c.06.5.12 1 .29 1.5.14.6.41 1.2.71 1.73 1.08 1.73 2.95 2.97 4.96 3.22 2.14.27 4.43-.12 6.07-1.6 1.83-1.66 2.47-4.32 1.53-6.6l-.13-.26c-.21-.46-.77-1.26-.77-1.26m-3.16 6.3c-.28.24-.74.5-1.1.6-1.12.4-2.24-.16-2.9-.82 1.19-.28 1.9-1.16 2.11-2.05.17-.8-.15-1.46-.28-2.23-.12-.74-.1-1.37.17-2.06.19.38.39.76.63 1.06.77 1 1.98 1.44 2.24 2.8.04.14.06.28.06.43.03.82-.33 1.72-.93 2.27"/>' },
    drop: { vb: "0 0 24 24", b: '<path d="M12 20a6 6 0 0 1-6-6c0-4 6-10.75 6-10.75S18 10 18 14a6 6 0 0 1-6 6"/>' },
    blast: { vb: "0 0 512 512", b: '<path d="M37.6 4.2C28-2.3 15.2-1.1 7 7S-2.3 28 4.2 37.6l112 163.3-99.6 32.3C6.7 236.4 0 245.6 0 256s6.7 19.6 16.6 22.8l103.1 33.4-52.9 100.6c-4.9 9.3-3.2 20.7 4.3 28.1s18.8 9.2 28.1 4.3l100.6-52.9 33.4 103.1c3.2 9.9 12.4 16.6 22.8 16.6s19.6-6.7 22.8-16.6l33.4-103.1 100.6 52.9c9.3 4.9 20.7 3.2 28.1-4.3s9.2-18.8 4.3-28.1l-52.9-100.6 103.1-33.4c9.9-3.2 16.6-12.4 16.6-22.8s-6.7-19.6-16.6-22.8l-106.5-34.5 25.7-70.4c3.2-8.8 1-18.6-5.6-25.2s-16.4-8.8-25.2-5.6l-70.4 25.7-34.5-106.5C275.6 6.7 266.4 0 256 0s-19.6 6.7-22.8 16.6L200.9 116.2 37.6 4.2z"/>' },
    bolt: { vb: "0 0 24 24", b: '<path d="M21.4 7.5c.8.8.8 2.1 0 2.8l-2.8 2.8-7.8-7.8 2.8-2.8c.8-.8 2.1-.8 2.8 0l1.8 1.8 3-3 1.4 1.4-3 3zm-5.8 5.8-1.4-1.4-2.8 2.8-2.1-2.1 2.8-2.8-1.4-1.4-2.8 2.8-1.5-1.4-2.8 2.8c-.8.8-.8 2.1 0 2.8l1.8 1.8-4 4 1.4 1.4 4-4 1.8 1.8c.8.8 2.1.8 2.8 0l2.8-2.8-1.4-1.4z"/>' },
    fist: { vb: "0 0 384 512", b: '<path d="M160 0c17.7 0 32 14.3 32 32l0 112-64 0 0-112c0-17.7 14.3-32 32-32zM32 64c0-17.7 14.3-32 32-32S96 46.3 96 64l0 80-64 0 0-80zm192 0c0-17.7 14.3-32 32-32s32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96zm96 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64zm-96 88l0-.6c9.4 5.4 20.3 8.6 32 8.6 13.2 0 25.4-4 35.6-10.8 8.7 24.9 32.5 42.8 60.4 42.8 11.7 0 22.6-3.1 32-8.6l0 8.6c0 52.3-25.1 98.8-64 128l0 96c0 17.7-14.3 32-32 32l-160 0c-17.7 0-32-14.3-32-32l0-78.4c-17.3-7.9-33.2-18.8-46.9-32.5L37.5 357.5C13.5 333.5 0 300.9 0 267l0-27c0-35.3 28.7-64 64-64l88 0c22.1 0 40 17.9 40 40s-17.9 40-40 40l-56 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l56 0c39.8 0 72-32.2 72-72z"/>' },
    eye: { vb: "0 0 24 24", b: '<path d="M12 9a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3m0 8a5 5 0 0 1-5-5 5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5m0-12.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5"/>' },
    reload: { vb: "0 0 24 24", b: '<path d="M12 18a6 6 0 0 1-6-6c0-1 .25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12a8 8 0 0 0 8 8v3l4-4-4-4m0-11V1L8 5l4 4V6a6 6 0 0 1 6 6c0 1-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12a8 8 0 0 0-8-8"/>' },
    ff: { vb: "0 0 24 24", b: '<path d="M13 6v12l8.5-6M4 18l8.5-6L4 6z"/>' },
    swing: { vb: "0 0 24 24", b: '<path d="M12 16c1.66 0 3-1.34 3-3 0-1.12-.61-2.1-1.5-2.61L3.79 4.77l5.53 9.58c.5.98 1.51 1.65 2.68 1.65m0-13c-1.81 0-3.5.5-4.97 1.32l2.1 1.21C10 5.19 11 5 12 5c4.42 0 8 3.58 8 8 0 2.21-.89 4.21-2.34 5.65h-.01a.996.996 0 0 0 0 1.41c.39.39 1.03.39 1.42.01A9.97 9.97 0 0 0 22 13c0-5.5-4.5-10-10-10M2 13c0 2.76 1.12 5.26 2.93 7.07.39.38 1.02.38 1.41-.01a.996.996 0 0 0 0-1.41A7.95 7.95 0 0 1 4 13c0-1 .19-2 .54-2.9L3.33 8C2.5 9.5 2 11.18 2 13"/>' },
    gun: { vb: "0 0 24 24", b: '<path d="M7 5h16v4h-1v1h-6a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2H9.62c-.38 0-.73.22-.9.56l-2.45 4.89c-.17.34-.51.55-.89.55H2s-3 0 1-6c0 0 3-4-1-4V5h1l.5-1h3zm7 7v-1a1 1 0 0 0-1-1h-1s-1 1 0 2a2 2 0 0 1-2-2 1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1"/>' },
    mute: { vb: "0 0 24 24", b: '<circle cx="12" cy="12" r="10.4" fill="none" stroke="currentColor" stroke-width="1.8"/><g transform="translate(12 12) scale(.66) translate(-12 -12)"><path d="m20.84 22.73-1.67-1.67C17.7 22.85 15.5 24 13 24c-3.26 0-6.19-2-7.4-5l-3.03-7.63a1 1 0 0 1 1.24-1.32l.79.26c.56.19 1.02.61 1.24 1.16L7.25 15H8V9.89L1.11 3l1.28-1.27 19.72 19.73zM14 1.25a1.25 1.25 0 0 0-2.5 0V8.3l2.5 2.5zM21 16V5.75a1.25 1.25 0 0 0-2.5 0V12h-1V2.75a1.25 1.25 0 0 0-2.5 0v9.05l5.83 5.83c.11-.52.17-1.07.17-1.63M10.5 3.25a1.25 1.25 0 0 0-2.5 0V4.8l2.5 2.5z"/></g>' },
    aim: { vb: "0 0 24 24", b: '<path d="M3.05 13H1v-2h2.05C3.5 6.83 6.83 3.5 11 3.05V1h2v2.05c4.17.45 7.5 3.78 7.95 7.95H23v2h-2.05c-.45 4.17-3.78 7.5-7.95 7.95V23h-2v-2.05C6.83 20.5 3.5 17.17 3.05 13M12 5a7 7 0 0 0-7 7 7 7 0 0 0 7 7 7 7 0 0 0 7-7 7 7 0 0 0-7-7"/><circle cx="12" cy="12" r="1.3"/>' },
    bone: { vb: "0 0 24 24", b: '<path d="M6 3a3 3 0 0 0-1.5 5.6L15.4 19.5A3 3 0 1 0 19.5 15.4L8.6 4.5A3 3 0 0 0 6 3z"/>' },
    ammo: { vb: "0 0 24 24", b: '<path d="M6 3h4v18H6z"/><path d="M6 17h12v4H6z"/>' }
  };
  const STAT = {
    // base stats
    "Health":               { c: "#ff4848", i: "heart",   u: "HP", tip: "How much damage the entity can take." },
    "Speed":                { c: "#8ef0c8", i: "run",     u: "⇅",  tip: "Describes the enemie's speed. (Formula is their walk speed divided by 16)" },
    "Defense":              { c: "#8a8a8a", i: "shieldO", u: "%",  tip: "Subtracts the damage dealt with the enemy's defense percentage. May be subtract with some bludgeons or ammo types. Mostly bypassed with explosives." },
    "Shield":               { c: "#4fe3e8", i: "shieldO", u: "∴",  tip: "Subtracts the damage dealt and directs it to the shield health. Will no longer work once it runs out. Bypassed by explosives." },
    "Supershield":          { c: "#ffd23a", i: "shieldO", u: "⌅",  tip: "Completely negates all incoming damage but negates supershield by one point." },
    "Super Armour":         { c: "#7dff7d", i: "shieldP", u: "⌅",  tip: "Significantly punishes & reduces high damage count compared to lower damages. Any weapon that fires more than one pellet per blast counts as a single damage blast." },
    "Burn Resistance":      { c: "#ff8a2a", i: "flame",   u: "%",  tip: "Subtracts incoming fire damage by resistance's percentage." },
    "Bleed Resistance":     { c: "#ff4aa0", i: "drop",    u: "%",  tip: "Subtracts incoming bleed damage by resistance's percentage." },
    "Explosive Resistance": { c: "#ff5a3a", i: "blast",   u: "%",  tip: "Subtracts incoming explosive damage by resistance's percentage." },
    "Stun Resistance":      { c: "#ffd04a", i: "bolt",    u: "%",  tip: "Subtracts incoming stun by resistance's percentage." },
    "Fracture Immunity":    { c: "#ffe7b0", i: "bone",    u: "",   tip: "Can't have their bones fractured." },
    // skills
    "Suppressor":           { c: "#33c9ff", i: "mute",    u: "",   tip: "Entity will not cancel aim regardless of their target going back to cover." },
    "Pre-Aim":              { c: "#38f0a0", i: "aim",     u: " Range", tip: "How close you need to be before the entity starts aiming early." },
    "Strength":             { c: "#e01b1b", i: "fist",    u: "",   tip: "The damage multiplier for the entity's weapon." },
    "Aim Time Multiplier":  { c: "#3ad8ff", i: "eye",     u: "",   tip: "The multiplier for the entity's aim time." },
    "Reload Speed Multiplier": { c: "#a24dff", i: "reload", u: "", tip: "The multiplier for the entity's reload speed." },
    "Aim Slowdown":         { c: "#8a7dff", i: "ff",      u: "",   tip: "The multiplier for the entity's speed upon aiming down." },
    "Attack Slowdown":      { c: "#8a7dff", i: "swing",   u: "",   tip: "The multiplier for the entity's speed while attacking." },
    // loadout
    "Weapon":               { c: "#f3ee30", i: "gun",     u: "",   tip: "The primary or secondary the entity uses. If firearm is specified and no magazine & bullet type specified, then the magazine & ammo are random." },
    "Ammo Loaded":          { c: "#f0a050", i: "ammo",    u: "",   tip: "The bullet type the entity's weapon is loaded with." },
    "Magazine Loaded":      { c: "#f3ee30", i: "ammo",    u: "",   tip: "The magazine the entity's weapon is loaded with." },
    "Type":                 { c: "#45e3f0", i: "aim",     u: "",   tip: "" },
    "Category":             { c: "#f4ee3c", i: "ammo",    u: "",   tip: "" }
  };
  const TIPS = (typeof PDA_TIPS === "object" && PDA_TIPS) || { person: {}, weapon: {} };
  const DESC = (typeof PDA_DESC === "object" && PDA_DESC) || {};
  Object.keys(STAT).forEach(k => { if (k in (TIPS.person || {})) STAT[k].tip = TIPS.person[k]; });
  const BASE_ORDER  = ["Health", "Speed", "Defense", "Shield", "Supershield", "Super Armour", "Burn Resistance", "Bleed Resistance", "Explosive Resistance", "Stun Resistance", "Fracture Immunity"];
  const SKILL_ORDER = ["Suppressor", "Pre-Aim", "Strength", "Aim Time Multiplier", "Reload Speed Multiplier", "Aim Slowdown", "Attack Slowdown"];
  const orderBy = (obj, order) => Object.keys(obj || {}).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  /* ---------- images ----------
     An entry can have  img: "images/a.webp"
     or several:        imgs: ["images/a.webp", { src: "images/b.webp", caption: "hover text" }]  */
  function imagesOf(...objs) {
    for (const o of objs) {
      if (!o) continue;
      const list = o.imgs || (o.img ? [o.img] : null);
      if (list && list.length) return list.map(x => typeof x === "string" ? { src: x, caption: "" } : { src: x.src, caption: x.caption || "" });
    }
    return [];
  }
  let imgIndex = 0;          // which image the open page is showing
  let curImgs = [];
  function previewHTML(imgs, fallback) {
    curImgs = imgs;
    if (!imgs.length) return fallback;
    const i = ((imgIndex % imgs.length) + imgs.length) % imgs.length;
    const im = imgs[i];
    return `<img src="${esc(im.src)}" alt="" class="zoomable" loading="lazy" decoding="async" title="Click to enlarge" ${im.caption ? `data-tip="${esc(im.caption)}"` : ""}>` +
           (imgs.length > 1 ? `<span class="imgcount">${i + 1}/${imgs.length}</span>` : "");
  }
  function arrowsHTML(imgs) {
    if (imgs.length < 2) return `<span class="arrows"><button class="arrow" disabled>&#9664;</button><button class="arrow" disabled>&#9654;</button></span>`;
    return `<span class="arrows"><button class="arrow" data-img="-1" title="Previous image">&#9664;</button><button class="arrow" data-img="1" title="Next image">&#9654;</button></span>`;
  }

  /* ---------- helpers ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fit = (name, base = 22) => {
    const n = name.length;
    const size = n <= 6 ? base : n <= 9 ? base * .86 : n <= 12 ? base * .7 : n <= 16 ? base * .58 : base * .48;
    return `font-size:${size.toFixed(1)}px`;
  };
  const screen = $("#screen");
  const persistUI = () => save(KEY_UI, ui);

  function updateCount() {
    const [f, t] = countOf(entries);
    $("#titleCount").textContent = `DATABANKS ${f} / ${t}`;
  }

  /* =====================================================================
     TOP TABS + SEARCH
     ===================================================================== */
  const TABS = ["profile", "cloud", "manual", "settings", "tools", "biography", "documents", "missing", "loadout", "damage", "community", "players", "admin"];
  const TAB_LABEL = { missing: "WHAT'S LEFT", community: "SUBMIT", damage: "DAMAGE", players: "PLAYERS", admin: "ADMIN" };
  /* the checklist tabs sit on top, everything else along the bottom */
  const TOP_TABS = ["tools", "biography", "documents", "missing", "loadout", "damage"];
  let BOTTOM_TABS = ["profile", "cloud", "manual", "settings", "community"];
  const tabBtn = t => `<button class="tab" role="tab" data-tab="${t}" aria-selected="${!query && ui.tab === t}">${I[t]}<span>${TAB_LABEL[t] || t.toUpperCase()}</span></button>`;
  function renderTabs() {
    [["#tabs", TOP_TABS], ["#tabs2", BOTTOM_TABS]].forEach(([sel, list]) => {
      const el = $(sel), x = el.scrollLeft;
      el.innerHTML = list.map(tabBtn).join("");
      el.scrollLeft = x;                       // don't jump back to the start
      const a = el.querySelector('[aria-selected="true"]'); if (a) revealInStrip(a);
    });
  }
  /* scroll a sideways strip just enough to show el, without moving the page */
  function revealInStrip(el) {
    const s = el.parentElement; if (!s || s.scrollWidth <= s.clientWidth) return;
    const l = el.offsetLeft - s.offsetLeft, r = l + el.offsetWidth;
    if (l < s.scrollLeft) s.scrollLeft = l - 8;
    else if (r > s.scrollLeft + s.clientWidth) s.scrollLeft = r - s.clientWidth + 8;
  }
  /* scroll a list just enough to show el, without moving the page */
  function revealInList(el) {
    const s = el.closest(SCROLLERS); if (!s) return;
    const er = el.getBoundingClientRect(), sr = s.getBoundingClientRect();
    if (er.top < sr.top) s.scrollTop -= sr.top - er.top + 6;
    else if (er.bottom > sr.bottom) s.scrollTop += er.bottom - sr.bottom + 6;
  }
  ["#tabs", "#tabs2"].forEach(sel => {
    $(sel).addEventListener("click", e => {
      const b = e.target.closest(".tab"); if (!b) return;
      play(b.dataset.tab === ui.tab && !detail ? "click" : "transition");
      ui.tab = b.dataset.tab; detail = null; cancelTier(); persistUI();
      if (query) clearSearch(false);
      renderTabs(); render();
    });
    $(sel).addEventListener("wheel", e => {
      const el = e.currentTarget; if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  });

  const searchBox = $("#search");
  const clearBtn  = $("#clearSearch");
  $("#searchIcon").innerHTML = I.search;
  let searchTimer = 0;
  searchBox.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = searchBox.value.trim();
      if (q === query) return;
      query = q; detail = null; cancelTier();
      clearBtn.hidden = !query;
      renderTabs(); render();
    }, 90);
  });
  /* quick-mark: Enter in the search box marks the best missing match as found */
  searchBox.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    clearTimeout(searchTimer);
    const q = slug(searchBox.value.trim()); if (!q) return;
    const pool = [...entries, ...people.filter(v => v.trackId)].filter(x => !x.unknown && !x.isCard);
    const best = pool.map(x => [score(x.name, q), x]).filter(([sc]) => sc >= 0)
      .sort((a, b) => (isFound(a[1].id) - isFound(b[1].id)) || a[0] - b[0] || collator.compare(a[1].name, b[1].name))[0];
    if (!best) { play("warn"); toast("Nothing matches that."); return; }
    const x = best[1];
    if (e.shiftKey) { play("click"); clearSearch(false); openEntry(x); return; }
    if (isFound(x.id)) { play("warn"); toast(`${x.name} is already found.`); return; }
    if (change([x.id], true)) play("confirm");
    searchBox.select();                      // ready for the next name
    query = searchBox.value.trim(); renderTabs(); render();
  });
  function clearSearch(rerender = true) {
    searchBox.value = ""; query = ""; clearBtn.hidden = true;
    if (rerender) { detail = null; renderTabs(); render(); }
  }
  clearBtn.addEventListener("click", () => { play("back"); clearSearch(); searchBox.focus(); });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement !== searchBox && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault(); searchBox.focus(); searchBox.select();
    } else if (e.key === "Escape") {
      if (pendingTier) { cancelTier(); render(); }
      else if (detail) { play("close"); detail = null; render(); }
      else if (query) { play("back"); clearSearch(); }
    }
  });

  /* =====================================================================
     MAIN RENDER
     ===================================================================== */
  const viewKey = () => detail ? `d:${detail.type}:${detail.id}` : query ? "" : `${ui.tab}:${ui.tab === "tools" ? ui.cat : ui.tab === "biography" ? ui.bio : ui.tab === "documents" ? ui.docs : ""}`;
  let keeping = false;
  let lastVk = null;
  function render() {
    // re-drawing the same page (marking, favouriting, switching notes...) keeps every scroll position
    const vkBefore = lastVk, wy = window.scrollY;
    const same = vkBefore !== null && vkBefore === viewKey();
    const before = same ? [...screen.querySelectorAll(SCROLLERS)].map(el => el.scrollTop) : null;
    renderInner();
    ui.detail = detail && !viewOnly ? detail : null; persistUI();
    renderCmpBar();
    lastVk = viewKey();
    if (same) {
      [...screen.querySelectorAll(SCROLLERS)].forEach((el, i) => { if (before[i] != null) el.scrollTop = before[i]; });
      window.scrollTo(0, wy);
    } else if (!keeping) {
      const sc = screen.querySelector(SCROLLERS);
      if (sc && lastVk && ui.scroll[lastVk]) sc.scrollTop = ui.scroll[lastVk];
    }
    if (settings.kbMode && !detail && !query) {
      const el = (kbFocus && screen.querySelector(`[data-entry="${CSS.escape(kbFocus)}"]`)) || (!same && screen.querySelector("[data-entry]"));
      if (el && document.activeElement !== el && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) el.focus({ preventScroll: true });
    }
  }
  let kbFocus = null;
  screen.addEventListener("focusin", e => { const el = e.target.closest && e.target.closest("[data-entry]"); if (el) kbFocus = el.dataset.entry; });
  function renderInner() {
    screen.classList.toggle("show-locked-names", !!settings.lockedNames);
    screen.classList.toggle("compact", !!ui.compact);
    document.body.classList.toggle("crt", !!settings.crt);
    document.body.classList.toggle("light", !!settings.light);
    document.body.classList.toggle("kbmode", !!settings.kbMode);
    syncToolbar(); renderBanner();
    if (detail && detail.type === "compare") return renderCompare();
    if (detail && byId.has(detail.id)) {
      let e = byId.get(detail.id);
      if (e.isCard) e = e.card.members[0];    // a group card opens on its first variant
      return detail.type === "tool" ? renderToolDetail(e) : detail.type === "doc" ? renderDocDetail(e) : renderPersonDetail(e);
    }
    detail = null;
    if (query) return renderSearch();
    ({ profile: renderProfile, cloud: renderCloud, manual: renderManual, settings: renderSettings,
       tools: renderTools, biography: renderBio, documents: renderDocs, missing: renderMissing, loadout: renderLoadout, damage: renderDamage, community: renderCommunity, players: renderPlayers, admin: renderAdmin })[ui.tab]();
  }

  /* =====================================================================
     TOOLS
     ===================================================================== */
  /* little tags on tiles/cards: NEW, friend has it, favourite */
  function badges(e) {
    const t = trackOf(e.id);
    const out = [];
    if (friend && !viewOnly && friend.set[t] && !found[t]) out.push(`<b class="bfr" title="${esc(friend.name || "Your friend")} has this and you don't">${esc((friend.name || "F").charAt(0).toUpperCase())}✓</b>`);
    if (favs[e.id] || favs[t]) out.push('<b class="bfav" title="Favourite">♥</b>');
    if (e.update && e.update === latestUpdate) out.push(`<b class="bnew" title="New in ${esc(e.update)}">NEW</b>`);
    return out.length ? `<span class="badges">${out.join("")}</span>` : "";
  }
  const pbar = (f, t) => `<span class="pbar"><i style="width:${t ? Math.round(f / t * 100) : 0}%"></i></span>`;

  /* the star that appears on hover: the only way to mark/unmark from a list */
  function hstar(id, name) {
    const on = isFound(id);
    return `<span class="hstar${on ? " on" : ""}" data-star="${esc(id)}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${on ? "Unmark" : "Mark"} ${esc(name)} as found" title="${on ? "Found: click to unmark" : "Click to mark as found"}">${I.star(on)}</span>`;
  }
  /* font size that fills a tile the way the game does */
  /* like the game: the name fills the tile width; long names wrap onto two balanced lines */
  function tileLines(name) {
    const w = String(name).split(" ");
    if (name.length <= 12 || w.length < 2) return [name];
    let best = [name], bestLen = name.length;
    for (let i = 1; i < w.length; i++) {
      const a = w.slice(0, i).join(" "), b = w.slice(i).join(" "), m = Math.max(a.length, b.length);
      if (m < bestLen) { best = [a, b]; bestLen = m; }
    }
    return best;
  }
  function tileFont(name) {
    const lines = tileLines(name), n = Math.max(...lines.map(l => l.length), 3);
    return `--tn:${n};--tl:${lines.length}`;
  }
  const tileText = name => tileLines(name).map(esc).join("<br>");
  function tileHTML(e) {
    const got = isFound(e.id);
    const l = label(e);
    if (!got) {
      return `<button class="tile locked" data-open-tool="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}: not found">
        <span class="lock">${I.lock}</span><span class="lname">${esc(l)}</span>${hstar(e.id, l)}${badges(e)}</button>`;
    }
    return `<button class="tile${e.special ? " special" : ""}${e.gold ? " gold" : ""}" data-open-tool="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}">
      <span class="tname" style="${tileFont(l)}">${tileText(l)}</span>${hstar(e.id, l)}${badges(e)}</button>`;
  }

  function tierHeadHTML(ci, tier, items) {
    const [f, t] = countOf(items);
    const key = `${ci}|${tier}`;
    const allFound = f === t;
    if (pendingTier === key) {
      return `<div class="tier-head confirm" data-tierkey="${key}">
        <span>TIER ${tier} <b>// ARE YOU SURE?</b> ${allFound ? `LOCK ALL ${t}` : `UNLOCK ALL ${t - f} REMAINING`}</span>
        <span class="tier-actions"><button class="tier-yes" data-tier-yes="${key}">YES</button><button class="tier-no" data-tier-no>NO</button></span>
      </div>`;
    }
    return `<div class="tier-head clickable${allFound ? " complete" : ""}" data-tier="${key}" role="button" tabindex="0" title="Click anywhere on this bar to ${allFound ? "lock" : "unlock"} every entry in tier ${tier}"><span class="tier-btn">TIER ${tier}<span class="tier-hint">${allFound ? "click the bar to lock all" : "click the bar to unlock all"}</span></span><small>${f}/${t}</small>${pbar(f, t)}</div>`;
  }

  /* ---------- weapon stats as numbers ---------- */
  const NUM_STATS = ["DAMAGE", "DEFENSE BYPASS", "STRENGTH", "AIM TIME", "SWITCH TIME", "SWING TIME", "RPM", "ALERT RADIUS", "RANGE", "RELOAD MODIFIER", "MAX SPREAD", "MINIMUM SPREAD", "SPREAD INCREMENT", "SPREAD DECREASE", "AIM SLOWDOWN", "ATTACK SLOWDOWN", "EQUIP TIME", "SHIELD DURABILITY", "DEFENSE INCREASE", "CARRY WEIGHT INCREASE", "QUICK SLOT INCREASE", "SUPER SHIELD INCREASE", "WEIGHT"];
  const HIGHER_BETTER = new Set(["DAMAGE", "DEFENSE BYPASS", "STRENGTH", "RPM", "RANGE", "SPREAD DECREASE", "AIM SLOWDOWN", "ATTACK SLOWDOWN", "SHIELD DURABILITY", "DEFENSE INCREASE", "CARRY WEIGHT INCREASE", "QUICK SLOT INCREASE", "SUPER SHIELD INCREASE"]);
  const statNum = (e, k) => {
    const v = e.stats && e.stats[k]; if (v == null) return null;
    const m = String(v).match(/^\s*([\d.]+)\s*\/\s*([\d.]+)/);          // "1.5/0.1s" → amount per second
    if (m) return parseFloat(m[1]) / parseFloat(m[2]);
    const n = parseFloat(String(v)); return isNaN(n) ? null : n;
  };
  const calibersOf = e => String((e.stats && e.stats["CALIBER TYPE"]) || "").split("|").map(x => x.trim()).filter(Boolean);
  const allTools = () => entries.filter(e => e.section === "tools");
  /* the "type" filter: caliber for guns, gear type for gear */
  const typesOf = e => { const c = calibersOf(e); return c.length ? c : (e.stats && e.stats["GEAR TYPE"] ? [e.stats["GEAR TYPE"]] : []); };

  function statBarHTML(cat) {
    const cals = [...new Set(cat.items.flatMap(typesOf))].sort(collator.compare);
    const typeLabel = cat.items.some(e => e.stats && e.stats["GEAR TYPE"]) ? "GEAR TYPE" : "CALIBER";
    const hasStats = cat.items.some(e => e.stats);
    if (!hasStats) return "";
    const keys = NUM_STATS.filter(k => k === ui.tsort || cat.items.some(e => statNum(e, k) != null));
    return `<div class="statbar">
      <label>SORT BY <select data-tsort>${["", ...keys].map(k => `<option value="${k}"${ui.tsort === k ? " selected" : ""}>${k ? k + (HIGHER_BETTER.has(k) ? " (high first)" : " (low first)") : "TIER (default)"}</option>`).join("")}</select></label>
      ${cals.length ? `<label>${typeLabel} <select data-cal><option value="">ANY</option>${cals.map(c => `<option${ui.cal === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>` : ""}
      <label>TIER <select data-tiermin><option value="">ALL</option>${Object.keys(cat.tiers).sort((a, b) => a - b).map(t => `<option value="${t}"${String(ui.tierMin) === t ? " selected" : ""}>${t}+</option>`).join("")}</select></label>
      ${ui.tsort ? `<label>${esc(ui.tsort)} FROM <input data-tmin type="number" step="any" value="${esc(ui.tmin)}" placeholder="min"> TO <input data-tmax type="number" step="any" value="${esc(ui.tmax)}" placeholder="max"></label>` : ""}
      ${ui.tsort || ui.cal || ui.tierMin ? '<button class="mini-btn" data-tclear>RESET</button>' : ""}
    </div>`;
  }

  function renderCaliberIndex() {
    const map = new Map();
    allTools().forEach(e => calibersOf(e).forEach(c => { if (!map.has(c)) map.set(c, []); map.get(c).push(e); }));
    const keys = [...map.keys()].sort(collator.compare);
    return `<p class="cat-note">Every caliber, and the weapons that fire it. Built from the weapon stats, so it fills in as more weapons get stats.</p>` +
      (keys.map(c => {
        const list = sortEntries(map.get(c)).filter(e => passFilter(isFound(e.id)));
        const [f, t] = countOf(map.get(c));
        return `<div class="tier-head"><span>${esc(c)}</span><small>${f}/${t}</small>${pbar(f, t)}</div><div class="list">${list.map(e => resultHTML(e, `${e.group} · TIER ${e.tier}`)).join("") || '<p class="cat-note">None match the filter.</p>'}</div>`;
      }).join("") || '<div class="empty-cat"><b>NO CALIBERS YET</b>Add CALIBER TYPE to weapon stats in data.js.</div>');
  }

  function renderTools() {
    const cats = PDA_DATA.tools;
    if (ui.cat >= cats.length) ui.cat = 0;
    if (ui.cat === -1) {
      screen.innerHTML = `<div class="tools"><div class="cats" role="tablist" aria-label="Categories">${catButtons(cats)}</div><div class="grid-wrap" id="grid">${renderCaliberIndex()}</div></div>`;
      return;
    }
    const cat = cats[ui.cat];
    const catBtns = catButtons(cats);

    let body = "", hiddenDone = 0;
    const tiers = Object.keys(cat.tiers).sort((a, b) => a - b);
    if (tiers.length && (ui.tsort || ui.cal)) {
      // stat sort / caliber filter: one flat list
      let list = cat.items.filter(e => !e.unknown && passFilter(isFound(e.id)));
      if (ui.cal) list = list.filter(e => typesOf(e).includes(ui.cal));
      if (ui.tierMin) list = list.filter(e => e.tier >= +ui.tierMin);
      if (ui.tsort && (ui.tmin !== "" || ui.tmax !== "")) list = list.filter(e => { const n = statNum(e, ui.tsort); if (n == null) return false;
        return (ui.tmin === "" || n >= +ui.tmin) && (ui.tmax === "" || n <= +ui.tmax); });
      if (ui.tsort) {
        const dir = HIGHER_BETTER.has(ui.tsort) ? -1 : 1;
        list.sort((a, b) => { const x = statNum(a, ui.tsort), y = statNum(b, ui.tsort);
          if (x == null && y == null) return collator.compare(a.name, b.name); if (x == null) return 1; if (y == null) return -1;
          return (x - y) * dir || collator.compare(a.name, b.name); });
      } else list = sortEntries(list);
      body = statBarHTML(cat) + `<div class="list">${list.map(e => resultHTML(e, ui.tsort ? `${ui.tsort}: ${(e.stats && e.stats[ui.tsort]) || "—"}` : `TIER ${e.tier} · ${typesOf(e).join(" | ")}`)).join("") || '<p class="cat-note">Nothing matches.</p>'}</div>`;
    } else if (!tiers.length) {
      body = `<div class="empty-cat"><b>NO ENTRIES ON FILE</b>Add this category's weapons to data.js to track them.</div>`;
    } else {
      body += statBarHTML(cat);
      if (cat.note) body += `<p class="cat-note">${esc(cat.note)}</p>`;
      if (!settings.tierTip && !viewOnly) body += `<div class="tiptip">&#128161; Tip: click anywhere on a <b>TIER</b> bar to mark that whole tier found. <button class="mini-btn" data-tiptip>GOT IT</button></div>`;
      tiers.filter(t => !ui.tierMin || +t >= +ui.tierMin).forEach(tier => {
        const all = cat.items.filter(e => e.tier === +tier);
        if (ui.hideDone && all.length && all.every(e => isFound(e.id))) { hiddenDone++; return; }
        const items = sortEntries(all).filter(e => passFilter(isFound(e.id)));
        body += tierHeadHTML(ui.cat, tier, all);
        const none = `<div class="cat-note" style="grid-column:1/-1">${ui.filter === "found" ? "Nothing found here yet." : "All found."}</div>`;
        body += ui.view === "list"
          ? `<div class="list">${items.map(e => resultHTML(e)).join("") || none}</div>`
          : `<div class="tier-box">${items.map(tileHTML).join("") || none}</div>`;
      });
    }
    if (hiddenDone) body += `<p class="cat-note">${hiddenDone} finished tier${hiddenDone > 1 ? "s" : ""} hidden (turn off HIDE DONE to see ${hiddenDone > 1 ? "them" : "it"}).</p>`;
    screen.innerHTML = `<div class="tools"><div class="cats" role="tablist" aria-label="Categories">${catBtns}</div><div class="grid-wrap" id="grid">${body}</div></div>`;
  }

  function catButtons(cats) {
    return cats.map((c, i) => {
      const [f, t] = countOf(c.items);
      if (ui.hideDone && t && f === t && i !== ui.cat) return "";
      return `<button class="cat${t && f === t ? " complete" : ""}" data-cat="${i}" aria-selected="${i === ui.cat}" style="--cn:${c.name.length}"><span class="cl">${esc(c.name)}</span>${t ? `<span class="mini">${f}/${t}</span>${pbar(f, t)}` : ""}</button>`;
    }).join("") + `<button class="cat calcat" data-cat="-1" aria-selected="${ui.cat === -1}" style="--cn:8"><span class="cl">CALIBERS</span></button>`;
  }

  /* the "unlock this whole tab" bar under Biography / Documents sub-tabs */
  function tabBarHTML(kind, idx, items, name) {
    const [f, t] = countOf(items);
    const key = `tab:${kind}:${idx}`;
    const all = f === t;
    if (pendingTier === key) {
      return `<div class="tabbar confirm"><span><b>// ARE YOU SURE?</b> ${all ? `LOCK ALL ${t}` : `UNLOCK ALL ${t - f} REMAINING`} IN ${esc(String(name).toUpperCase())}</span>
        <span class="tier-actions"><button class="tier-yes" data-tier-yes="${key}">YES</button><button class="tier-no" data-tier-no>NO</button></span></div>`;
    }
    return "";
  }

  function cancelTier() { pendingTier = null; clearTimeout(pendingTimer); }
  function askTier(key) {
    pendingTier = key; play("warn");
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { if (pendingTier === key) { pendingTier = null; keepScroll(render); } }, 7000);
  }
  function applyTier(key) {
    let items;
    if (key.startsWith("tab:")) {
      const [, kind, idx] = key.split(":");
      items = kind === "bio" && +idx === -1 ? PDA_DATA.biography.flatMap(x => x.items) : (kind === "bio" ? PDA_DATA.biography : PDA_DATA.documents)[+idx].items;
    } else {
      const [ci, tier] = key.split("|");
      items = PDA_DATA.tools[+ci].items.filter(e => e.tier === +tier);
    }
    const lockAll = items.every(e => isFound(e.id));
    const what = key.startsWith("tab:") ? "a whole tab" : "a whole tier";
    if (change(items.map(e => e.id), !lockAll, what)) play(lockAll ? "deselect" : "confirm");
    cancelTier();
  }

  /* colours copied from the game's weapon stat page */
  const TOOL_STAT_COLORS = {
    "CALIBER TYPE": "#ff2a2a", "AUTO": "#ff8a3a", "BURST": "#ff8a3a", "BURST DELAY": "#ff8a3a",
    "BURST AMOUNT": "#ff8a3a", "BURST VOLLEY": "#ff8a3a", "STRENGTH": "#ff4fa0", "AIM TIME": "#35d6ff",
    "SWITCH TIME": "#ffa82a", "RPM": "#fff04a", "ALERT RADIUS": "#5a5aff", "RELOAD MODIFIER": "#2ae0e0",
    "WEAPON TYPE": "#d04aff", "MAX SPREAD": "#9a8aff", "MINIMUM SPREAD": "#9a8aff",
    "SPREAD INCREMENT": "#d8a0ff", "SPREAD DECREASE": "#d8a0ff", "EQUIP TIME": "#e8a070",
    "WEIGHT": "#2a2a2a", "TIER": "#fff89a",
    "MODE": "#8de08d", "DAMAGE": "#ff2a2a", "DEFENSE BYPASS": "#ff7a3a", "SWING TIME": "#ffa82a",
    "RANGE": "#a070ff", "AIM SLOWDOWN": "#d09a6a", "ATTACK SLOWDOWN": "#9a8a7a",
    "GEAR TYPE": "#8a8aff", "DEFENSE INCREASE": "#ff9a40", "SHIELD DURABILITY": "#35d6ff",
    "CARRY WEIGHT INCREASE": "#7ae07a", "QUICK SLOT INCREASE": "#ff4a5a", "SUPER SHIELD INCREASE": "#ff3a3a"
  };
  /* blank lines between stat groups, laid out like each kind of page in the game */
  const gapsFor = s => s["GEAR TYPE"] ? new Set(["TIER"])
    : s["DAMAGE"] ? new Set(["WEIGHT"])
    : s["CALIBER TYPE"] ? new Set(["MAX SPREAD", "AIM SLOWDOWN", "ATTACK SLOWDOWN", "EQUIP TIME", "WEIGHT"])
    : new Set();
  /* the next entry you haven't found, after this one, in the same category / tab */
  function siblingsOf(e) {
    if (e.section === "tools") return PDA_DATA.tools[e.catIndex].items.slice().sort((a, b) => a.tier - b.tier || collator.compare(label(a), label(b)));
    if (e.section === "bio") return PDA_DATA.biography[e.groupIndex].cards.map(c => c.entry).sort((a, b) => collator.compare(a.name, b.name));
    return PDA_DATA.documents[e.groupIndex].items.slice().sort((a, b) => collator.compare(label(a), label(b)));
  }
  function nextMissing(e) {
    const base = e.card && e.card.entry ? e.card.entry : e;
    const list = siblingsOf(base), i = list.indexOf(base);
    for (let k = 1; k <= list.length; k++) {
      const x = list[(i + k) % list.length];
      if (x !== base && !x.unknown && !isFound(x.id)) return x;
    }
    return null;
  }
  const typeOf = x => ({ tools: "tool", bio: "person", docs: "doc" }[x.section]);
  const flowBtns = e => {
    const base = e.card && e.card.entry ? e.card.entry : e;
    const got = isFound(base.id), nx = nextMissing(base);
    return `<span class="flow">${!got && !viewOnly ? `<button class="hbtn go" data-marknext="${esc(base.id)}" title="Mark this as found and open the next missing one (N)">&#9733; FOUND + NEXT</button>` : ""}${nx ? `<button class="hbtn" data-next="${esc(nx.id)}" title="Next missing: ${esc(nx.name)} (M)">NEXT MISSING &#9654;</button>` : '<span class="flowdone">ALL FOUND HERE</span>'}</span>`;
  };
  /* rarely-used page buttons tucked behind a ⋯ menu */
  const moreMenu = inner => `<details class="more"><summary title="More: link, fix, compare...">⋯</summary><div class="morebox">${inner}</div></details>`;
  document.addEventListener("click", e => { document.querySelectorAll("details.more[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; }); });
  const linkBtn = id => `<button class="hbtn" data-link="${esc(id)}" title="Copy a link straight to this page">LINK</button>`;
  const suggestBtn = id => `<button class="hbtn" data-suggest="${esc(id)}" title="Send a fix or missing info for this entry (no account needed)">FIX?</button>`;
  const favBtn = id => `<button class="favbtn${favs[id] ? " on" : ""}" data-fav="${esc(id)}" title="${favs[id] ? "Remove from favourites" : "Add to favourites (shows on your Profile)"}">${I.heart(!!favs[id])}</button>`;
  /* bottom box with two tabs: the game's text, and your own notes */
  function bottomBox(first, textHTML, noteId) {
    const nt = ui.btab === "notes";
    const has = !!(notes[noteId] || "").trim();
    return `<div class="dhead btabs"><button class="btab${nt ? "" : " on"}" data-btab="desc">${first}</button><button class="btab${nt ? " on" : ""}" data-btab="notes">My Notes${has ? " •" : ""}</button></div>
      ${nt ? `<textarea class="notes" data-note="${esc(noteId)}" placeholder="Your own notes, saved in this browser (where you found it, what it needs...)">${esc(notes[noteId] || "")}</textarea>` : `<div class="desc">${textHTML}</div>`}`;
  }
  const paras = t => esc(t).split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

  /* magazine <-> gun links: from ammo-links.js (names) and from people's loadouts (seen in the PDA) */
  let ammoCache = null;
  const ammoLinks = () => ammoCache || (ammoCache = (() => {
    const byName = new Map(entries.filter(x => x.section === "tools" && !x.unknown).map(x => [slug(x.name), x]));
    const magsOf = new Map(), gunsOf = new Map();
    const link = (mag, gun, how) => {
      if (!mag || !gun) return;
      if (!magsOf.has(gun.id)) magsOf.set(gun.id, new Map()); if (!gunsOf.has(mag.id)) gunsOf.set(mag.id, new Map());
      const a = magsOf.get(gun.id), b = gunsOf.get(mag.id);
      a.set(mag, a.get(mag) === "seen" ? "seen" : how); b.set(gun, b.get(gun) === "seen" ? "seen" : how);
    };
    Object.entries(typeof PDA_AMMO_LINKS === "object" ? PDA_AMMO_LINKS : {}).forEach(([m, gs]) => gs.forEach(g => link(byName.get(slug(m)), byName.get(slug(g)), "named")));
    people.forEach(p => {
      const l = p.loadout || [];
      const ws = l.filter(([k]) => k === "Weapon"), ms = l.filter(([k]) => k === "Magazine Loaded");
      if (ws.length === 1) ms.forEach(([, m]) => link(byName.get(loadName(m)), byName.get(loadName(ws[0][1])), "seen"));
    });
    return { magsOf, gunsOf };
  })());
  function ammoLinkHTML(e) {
    const L = ammoLinks(), m = L.magsOf.get(e.id) || L.gunsOf.get(e.id);
    if (!m || !m.size) return "";
    const isMag = L.gunsOf.has(e.id);
    const list = [...m].sort((a, b) => collator.compare(a[0].name, b[0].name)).map(([x, how]) =>
      `<button class="linkish" data-tool="${esc(x.id)}" title="${how === "seen" ? "Seen together in a person's loadout" : "Going by the name"}">${esc(x.name)}</button>${isFound(x.id) ? '<span class="egot"> ✓</span>' : ""}${how === "seen" ? "<sup>*</sup>" : ""}`).join(", ");
    const seen = [...m.values()].includes("seen");
    return `<div class="stat gap"><i style="color:#c8a0ff">${isMag ? "FOR" : "MAGAZINES"}</i>: ${list}</div><div class="ammonote">Going by the names${seen ? "; * = seen loaded together in someone's loadout" : ""}.</div>`;
  }
  function renderToolDetail(e) {
    const got = isFound(e.id);
    const l = label(e);
    const st = e.stats || {};
    const gaps = gapsFor(st);
    const line = (k, v, gap) => {
      const tip = (TIPS.weapon || {})[k];
      return `<div class="stat${gap ? " gap" : ""}"${tip ? ` data-tip="${esc(tip)}"` : ""}><i style="color:${TOOL_STAT_COLORS[k] || "#ddd"}${k === "WEIGHT" ? ";text-shadow:0 0 1px #888" : ""}">${esc(k)}</i>: ${esc(v)}</div>`;
    };
    const block = s => Object.entries(s).filter(([k]) => k !== "WEIGHT").map(([k, v]) => line(k, v, gaps.has(k))).join("");
    const dash = '<div class="stat">--------</div>';
    let statHTML = block(st);
    /* weapons with more than one firing mode list each mode, split by dashes like the game */
    if (e.modes && e.modes.length) statHTML += dash + e.modes.map(block).join(dash) + dash;
    if (st.WEIGHT != null) statHTML += line("WEIGHT", st.WEIGHT, gaps.has("WEIGHT"));
    statHTML += line("TIER", `TIER ${e.tier}`, gaps.has("TIER") || !e.stats);
    const users = whoCarries(e.name);
    const imgs = imagesOf(e);
    screen.innerHTML = `
      <div class="detail">
        <div class="dbox"><div class="dhead">Preview${arrowsHTML(imgs)}</div>
          <div class="preview">${previewHTML(imgs, `<span class="ph">${I.gun}</span>`)}
            <button class="star" id="star" data-star="${esc(e.id)}" aria-pressed="${got}" title="${got ? "Found: click to unmark" : "Not found: click to mark"}">${I.star(got)}</button>
          </div></div>
        <div class="dbox"><div class="dhead">Statistics<span class="hright">${flowBtns(e)}${moreMenu((fireModes(e).some(m => m.melee || m.cals.length) ? `<button class="hbtn" data-dmgcalc="${esc(e.id)}" title="Work out its damage against anyone">DAMAGE CALC</button>` : "") + `<button class="hbtn${ui.cmp.includes(e.id) ? " on" : ""}" data-cmp="${esc(e.id)}" title="Add to the weapon comparison">${ui.cmp.includes(e.id) ? "COMPARING ✓" : "COMPARE +"}</button>` + linkBtn(e.id) + suggestBtn(e.id))}${favBtn(e.id)}<span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="stats"><h2 style="color:${e.special ? "var(--red)" : e.gold ? "#f0c060" : "#fff"}">// ${esc(l.toUpperCase())}</h2>
            ${statHTML}
            ${countHTML(e)}
            ${rarityHTML(e)}
            ${communityHTML(e)}
            ${ammoLinkHTML(e)}
            ${users.length ? `<div class="stat gap"><i style="color:#f3ee30">CARRIED BY</i>: ${users.map(u => `<button class="linkish" data-person="${esc(u.id)}">${esc(u.name)}</button>`).join(", ")}</div>` : ""}
          </div></div>
        <div class="dbox comment">${bottomBox("Comment", e.comment ? paras(e.comment) : '<p class="none">No comment.</p>', e.id)}</div>
      </div>`;
  }

  /* =====================================================================
     WEAPON COMPARISON
     ===================================================================== */
  function renderCompare() {
    const list = ui.cmp.map(id => byId.get(id)).filter(Boolean);
    if (!list.length) { detail = null; return render(); }
    const keys = [];
    list.forEach(e => Object.keys(e.stats || {}).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
    keys.push("TIER");
    const val = (e, k) => k === "TIER" ? `TIER ${e.tier}` : ((e.stats || {})[k] ?? "—");
    const rows = keys.map(k => {
      let best = null, worst = null;
      if (NUM_STATS.includes(k) && list.length > 1) {
        const nums = list.map(e => statNum(e, k)).filter(n => n != null);
        if (nums.length > 1 && Math.max(...nums) !== Math.min(...nums)) {
          const hi = HIGHER_BETTER.has(k);
          best = hi ? Math.max(...nums) : Math.min(...nums);
          worst = hi ? Math.min(...nums) : Math.max(...nums);
        }
      }
      return `<tr><th style="color:${TOOL_STAT_COLORS[k] || "#ddd"}"${(TIPS.weapon || {})[k] ? ` data-tip="${esc(TIPS.weapon[k])}"` : ""}>${esc(k)}</th>${list.map(e => {
        const n = statNum(e, k);
        const cls = best != null && n === best ? "best" : worst != null && n === worst ? "worst" : "";
        return `<td class="${cls}">${esc(val(e, k))}</td>`;
      }).join("")}</tr>`;
    }).join("");
    screen.innerHTML = `
      <div class="dbox cmpwrap"><div class="dhead">Weapon Comparison<span class="hright"><button class="hbtn" data-cmpclear>CLEAR ALL</button><button class="return" id="ret">RETURN</button></span></div>
        <div class="cmpscroll"><table class="cmp">
          <thead><tr><th></th>${list.map(e => `<th><button class="linkish" data-tool="${esc(e.id)}">${esc(label(e).toUpperCase())}</button> <button class="xbtn" data-cmprm="${esc(e.id)}" title="Remove">×</button><div class="cmpstat ${isFound(e.id) ? "status-found" : "status-missing"}">${isFound(e.id) ? "FOUND" : "MISSING"}</div></th>`).join("")}</tr></thead>
          <tbody>${rows}<tr><th style="color:#f3ee30">CARRIED BY</th>${list.map(e => { const u = whoCarries(e.name);
            return `<td class="carried">${u.length ? u.map(p => `<button class="linkish" data-person="${esc(p.id)}">${esc(p.name)}</button>`).join(", ") : "—"}</td>`; }).join("")}</tr></tbody></table>
          <p class="cat-note">Green = best of the group, red = worst. Add up to 3 weapons with COMPARE + on their pages.</p>
        </div></div>`;
  }
  const cmpBar = document.createElement("div"); cmpBar.className = "cmpbar"; document.body.appendChild(cmpBar);
  function renderCmpBar() {
    if (!ui.cmp.length || (detail && detail.type === "compare")) { cmpBar.classList.remove("on"); return; }
    cmpBar.innerHTML = `<span>COMPARING ${ui.cmp.length}/3: ${ui.cmp.map(id => esc((byId.get(id) || {}).name || "?")).join(", ")}</span><button data-cb="view">VIEW</button><button data-cb="clear">×</button>`;
    cmpBar.classList.add("on");
  }
  cmpBar.addEventListener("click", e => {
    const b = e.target.closest("[data-cb]"); if (!b) return;
    play("click");
    if (b.dataset.cb === "view") { if (query) clearSearch(false); detail = { type: "compare", id: "" }; }
    else { ui.cmp = []; persistUI(); }
    render();
  });

  /* people whose loadout mentions this weapon name */
  const loadName = s => slug(String(s).replace(/\s*\(Random\)\s*$/i, ""));
  function whoCarries(name) {
    const n = slug(name);
    return people.filter(e => (e.loadout || []).some(([k, v]) => k === "Weapon" && loadName(v) === n));
  }

  /* =====================================================================
     BIOGRAPHY
     ===================================================================== */
  const ALL_BIO = { name: "Everyone", color: "#ffffff", bg: "#1a1a1a" };
  function renderBio() {
    const groups = PDA_DATA.biography;
    if (ui.bio >= groups.length) ui.bio = 0;
    const isAll = ui.bio === -1;
    const g = isAll ? Object.assign({}, ALL_BIO, { items: groups.flatMap(x => x.items), cards: groups.flatMap(x => x.cards) }) : groups[ui.bio];
    const [af, at] = countOf(groups.flatMap(x => x.items));
    const allTab = `<button class="subtab${af === at ? " complete" : ""}" data-bio="-1" aria-selected="${isAll}" style="--sc:#fff;--sbg:#1a1a1a" title="Everyone, A–Z${isAll ? " · click again to unlock everyone" : ""}">ALL<span class="n">${af}/${at}</span>${pbar(af, at)}</button>`;
    const tabs = allTab + groups.map((x, i) => {
      const [f, t] = countOf(x.items);
      if (ui.hideDone && f === t && i !== ui.bio) return "";
      return `<button class="subtab${f === t ? " complete" : ""}" data-bio="${i}" aria-selected="${i === ui.bio}" style="--sc:${x.color};--sbg:${x.bg}" title="${i === ui.bio ? "Click again to unlock the whole tab" : ""}">${esc(x.name)}<span class="n">${f}/${t}</span>${pbar(f, t)}</button>`;
    }).join("");
    const cards = sortCards(g.cards).filter(c => passFilter(cardFound(c)));
    const grpOf = c => groups[c.entry.groupIndex];
    const html = ui.view === "list" ? cards.map(c => resultHTML(c.entry)).join("") : cards.map(c => cardHTML(c, isAll ? grpOf(c) : g)).join("");
    const none = `<p class="cat-note">${ui.filter === "found" ? "Nothing found here yet." : "All found."}</p>`;
    screen.innerHTML = `<div class="subwrap"><div class="subtabs" role="tablist">${tabs}</div>${tabBarHTML("bio", ui.bio, g.items, g.name)}<div class="cards${ui.view === "list" ? " aslist" : ""}">${html || none}</div></div>`;
  }

  function cardHTML(c, g) {
    const got = cardFound(c);
    const isGroup = c.kind === "group";
    const first = c.members[0];
    const l = isGroup ? c.name : label(first);
    const ci = imagesOf(c.entry, c, first);
    const showPic = got || (settings.missingPics && ci.length);
    const pic = showPic ? (ci.length ? `<img src="${esc(ci[0].src)}" alt="" loading="lazy"${got ? "" : ' class="dimpic"'}>` : (isGroup ? I.people : I.person)) : I.question;
    const [f, t] = countOf(c.members);
    const tip = `${l}: ${got ? "found" : "not found"}${isGroup ? ` (${t} variants)` : ""}`;
    return `<button class="card${got ? "" : " missing"}${isGroup ? " group" : ""}" data-open="${esc(first.id)}" data-entry="${esc(first.id)}" style="--c:${g.color}" title="${esc(tip)}">
      <span class="pic">${pic}</span>
      ${isGroup ? `<span class="count" title="${t} variants">×${t}</span>` : ""}${hstar(c.entry.id, l)}${badges(c.entry)}
      <span class="nm" style="${fit(l, 26)}">${esc(l)}</span></button>`;
  }

  function statRow(key, val) {
    const s = STAT[key] || { c: "#ddd", i: "", u: "", tip: "" };
    let v = String(val);
    if (s.u && v !== "true" && (!/[a-z%]$/i.test(v) || v === "inf")) v += s.u;
    const icon = s.i && SI[s.i] ? `<svg viewBox="${SI[s.i].vb}" fill="currentColor">${SI[s.i].b}</svg>` : "";
    return `<div class="erow" style="--rc:${s.c}" ${s.tip ? `data-tip="${esc(s.tip)}"` : ""}><span class="ei">${icon}</span><span class="ek">${esc(key)}:</span> <span class="ev">${esc(v)}</span></div>`;
  }

  /* the people in the current Biography tab, in on-screen order (for the < > arrows) */

  /* the PDA tool entry a loadout line points at (weapons and magazines) */
  const loadTool = (k, v) => (k === "Weapon" || k === "Magazine Loaded")
    ? entries.find(t => t.section === "tools" && !t.unknown && slug(t.name) === loadName(v)) : null;
  let loadPick = null;                         // person id whose "which random one?" picker is open
  function loadoutParts(e) {
    const fixed = [], random = [];
    (e.loadout || []).forEach(([k, v]) => { const t = loadTool(k, v); if (!t) return;
      (/\(Random\)\s*$/i.test(v) ? random : fixed).push(t); });
    return { fixed: [...new Set(fixed)], random: [...new Set(random)].filter(t => !fixed.includes(t)) };
  }
  function loadoutMarkHTML(e) {
    const { fixed, random } = loadoutParts(e);
    if (!fixed.length && !random.length) return "";
    const left = fixed.filter(t => !isFound(t.id));
    if (loadPick === e.id && random.length) {
      return `<div class="lmark"><div class="lmark-h">WHICH RANDOM ONES DID YOU GET?</div>
        ${random.map(t => `<label><input type="checkbox" data-lpickid="${esc(t.id)}"${isFound(t.id) ? " checked disabled" : ""}> ${esc(t.name)}${isFound(t.id) ? " (already found)" : ""}</label>`).join("")}
        ${fixed.length ? `<div class="dim">Also marks: ${fixed.map(t => esc(t.name)).join(", ")}</div>` : ""}
        <div class="lmark-b"><button class="mini-btn go" data-lmarkgo="${esc(e.id)}">MARK FOUND</button><button class="mini-btn" data-lmarkcancel>CANCEL</button></div></div>`;
    }
    const all = left.length === 0 && random.every(t => isFound(t.id));
    return `<div class="lmark"><button class="mini-btn${all ? "" : " go"}" data-lmark="${esc(e.id)}"${all ? " disabled" : ""} title="Mark the weapons and magazines this person carries as found">${all ? "✓ ALL THEIR GEAR IS FOUND" : `★ MARK THEIR GEAR FOUND${random.length ? " …" : ` (${left.length})`}`}</button></div>`;
  }
  function renderPersonDetail(e) {
    const card = e.card;
    const g = PDA_DATA.biography[e.groupIndex];
    const got = isFound(e.id);
    const l = label(e);
    const base = orderBy(e.base, BASE_ORDER);
    const skills = orderBy(e.skills, SKILL_ORDER);
    const load = e.loadout || [];
    const rows = [
      ...base.map(k => statRow(k, e.base[k])),
      skills.length ? `<div class="esec">- SKILLS -</div>` : "",
      ...skills.map(k => statRow(k, e.skills[k])),
      load.length ? `<div class="esec">- LOADOUT -</div>` : "",
      ...load.map(([k, v]) => {
        const tool = loadTool(k, v);
        if (!tool) return statRow(k, v);
        return statRow(k, v).replace(/<span class="ev">(.*?)<\/span>/, `<button class="ev linkish" data-tool="${esc(tool.id)}" title="Open ${esc(tool.name)}">$1</button>${isFound(tool.id) ? ' <span class="egot" title="Found">✓</span>' : ""}`);
      }),
      loadoutMarkHTML(e),
      `<div class="erarity">${countHTML(card.entry)}${rarityHTML(card.entry)}${communityHTML(e) || communityHTML(card.entry)}</div>`
    ].join("");
    const empty = !base.length && !skills.length && !load.length;
    const members = card.kind === "group" ? card.members : [];
    const mtabs = members.length ? `<div class="mtabs" style="--n:${members.length}">${members.map(m => {
      return `<button class="mtab${m.id === e.id ? " on" : ""}${got ? " got" : ""}" data-member="${esc(m.id)}" title="${esc(m.name)}" style="${fit(m.name, 19)}">${esc(m.name)}</button>`;
    }).join("")}</div>` : "";
    const imgs = imagesOf(e, card.entry, card);
    const desc = e.desc || DESC[e.name] || card.desc || DESC[card.name];
    screen.innerHTML = `
      <div class="pdetail" style="--c:${g.color}">
        <div class="dbox pprev"><div class="dhead">Preview${arrowsHTML(imgs)}</div>
          <div class="preview">${got || settings.missingPics ? previewHTML(imgs, `<span class="ph big">${got ? I.person : I.question}</span>`) : `<span class="ph big">${I.question}</span>`}</div>
        </div>
        <div class="dbox edata"><div class="dhead">Enemy Data
            <span class="hright">${flowBtns(e)}${moreMenu(linkBtn(card.entry.id) + suggestBtn(card.entry.id))}${favBtn(e.id)}<span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="ename">${esc(l)}</div>
          <div class="ebody">
            <div class="erows">${empty ? '<div class="esec" style="color:#888">NO DATA ON FILE</div>' : rows}</div>
            <button class="estar${got ? " on" : ""}" data-star="${esc(e.id)}" aria-pressed="${got}" title="${members.length ? `${got ? "Found" : "Not found"}: this star covers all ${members.length} ${esc(card.name)} variants` : got ? "Found: click to unmark" : "Click to mark as found"}">${I.star(got)}</button>
          </div>
          ${mtabs}
        </div>
        <div class="dbox pdesc">${bottomBox("Description", desc ? paras(desc) : '<p class="none">No description on file.</p>', e.id)}</div>
      </div>`;
  }

  function renderDocDetail(e) {
    const g = PDA_DATA.documents[e.groupIndex];
    const got = isFound(e.id);
    const l = label(e);
    const icon = { location: I.wifi, note: I.note, misc: I.documents }[e.kind];
    const imgs = imagesOf(e);
    const type = { location: "Location", note: "Note", misc: "Miscellaneous" }[e.kind];
    screen.innerHTML = `
      <div class="pdetail doc-detail ${e.kind}">
        <div class="dbox pprev"><div class="dhead">Preview${arrowsHTML(imgs)}</div>
          <div class="preview docprev">${previewHTML(imgs, `<span class="ph big">${got ? icon : I.lock}</span>`)}</div>
        </div>
        <div class="dbox edata"><div class="dhead">Document Data
            <span class="hright">${flowBtns(e)}${moreMenu(linkBtn(e.id) + suggestBtn(e.id))}${favBtn(e.id)}<span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="ename">${esc(l)}</div>
          <div class="ebody">
            <div class="erows">
              ${statRow("Type", type)}
              ${statRow("Category", g.name)}
            </div>
            <div class="erarity">${communityHTML(e)}</div>
            <button class="estar${got ? " on" : ""}" data-star="${esc(e.id)}" aria-pressed="${got}" title="${got ? "Found: click to unmark" : "Click to mark as found"}">${I.star(got)}</button>
          </div>
        </div>
        <div class="dbox pdesc">${bottomBox("Description", e.desc ? paras(e.desc) : '<p class="none">No description on file.</p>', e.id)}</div>
      </div>`;
  }

  /* =====================================================================
     DOCUMENTS
     ===================================================================== */
  const DOC_TAB = { location: ["var(--cyan)", "#0a2a2e"], note: ["var(--doc-yellow)", "#24230a"], misc: ["#fff", "#1c1c1c"] };
  function docHTML(e) {
    const got = isFound(e.id);
    const l = label(e);
    const icon = { location: I.wifi, note: I.note, misc: "" }[e.kind];
    if (!got) {
      return `<button class="doc ${e.kind} missing" data-open-doc="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}: not found">
        <span class="pic">${I.lock}</span>${hstar(e.id, l)}${badges(e)}
        <span class="nm"><span class="tag">- MISSING -</span>${settings.lockedNames && !e.unknown ? `<span class="sub">${esc(l)}</span>` : ""}</span></button>`;
    }
    return `<button class="doc ${e.kind}" data-open-doc="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}">
      <span class="pic">${icon}</span>${hstar(e.id, l)}${badges(e)}<span class="nm" style="${fit(l, 26)}">${esc(l)}</span></button>`;
  }
  function renderDocs() {
    const groups = PDA_DATA.documents;
    if (ui.docs >= groups.length) ui.docs = 0;
    const g = groups[ui.docs];
    const tabs = groups.map((x, i) => {
      const [f, t] = countOf(x.items);
      if (ui.hideDone && f === t && i !== ui.docs) return "";
      const [c, bg] = DOC_TAB[x.kind];
      return `<button class="subtab striped${f === t ? " complete" : ""}" data-docs="${i}" aria-selected="${i === ui.docs}" style="--sc:${c};--sbg:${bg}" title="${i === ui.docs ? "Click again to unlock the whole tab" : ""}">${esc(x.name)}<span class="n">${f}/${t}</span>${pbar(f, t)}</button>`;
    }).join("");
    const items = sortEntries(g.items).filter(e => passFilter(isFound(e.id)));
    const none = `<p class="cat-note">${ui.filter === "found" ? "Nothing found here yet." : "All found."}</p>`;
    const html = ui.view === "list" ? items.map(e => resultHTML(e)).join("") : items.map(docHTML).join("");
    screen.innerHTML = `<div class="subwrap"><div class="subtabs" role="tablist">${tabs}</div>${tabBarHTML("docs", ui.docs, g.items, g.name)}<div class="cards${ui.view === "list" ? " aslist" : ""}">${html || none}</div></div>`;
  }

  /* =====================================================================
     SEARCH
     ===================================================================== */
  function contextOf(e) {
    if (e.section === "tools") return `TOOLS › ${e.group} › TIER ${e.tier}`;
    if (e.section === "bio") return `BIOGRAPHY › ${e.group}${e.card && e.card.kind === "group" ? " › " + e.card.name : ""}`;
    return `DOCUMENTS › ${e.group}`;
  }
  function score(name, q) {
    const n = slug(name);
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.split(/[\s\-.'&]+/).some(w => w.startsWith(q))) return 2;
    if (n.includes(q)) return 3;
    // loose match: letters in order ("mp5k" finds "H&K MP5K", "bfc" finds "DEVILSPAWN-BFC")
    const compact = n.replace(/[^a-z0-9]/g, ""), cq = q.replace(/[^a-z0-9]/g, "");
    if (cq && compact.includes(cq)) return 4;
    return -1;
  }
  /* stat text each entry can be found by ("9x19mm", "tier 5", "health: 90hp") */
  function haystack(e) {
    if (e._hay) return e._hay;
    const out = [];
    if (e.section === "tools") {
      Object.entries(e.stats || {}).forEach(([k, v]) => out.push(`${k}: ${v}`));
      out.push(`TIER ${e.tier}`, e.group);
    } else if (e.section === "bio") {
      const src = e.isCard ? e.card.members : [e];
      src.forEach(m => {
        Object.entries(m.base || {}).forEach(([k, v]) => out.push(`${k}: ${v}`));
        Object.entries(m.skills || {}).forEach(([k, v]) => out.push(`${k}: ${v}`));
        (m.loadout || []).forEach(([k, v]) => out.push(`${k}: ${v}`));
      });
      out.push(e.group);
    } else out.push(e.group);
    return (e._hay = out);
  }
  const STYPE = { all: "ALL", tools: "WEAPONS", bio: "PEOPLE", docs: "DOCUMENTS" };
  function renderSearch() {
    const special = false;
    const q = slug(query);
    const okType = e => ui.stype === "all" || e.section === ui.stype;
    const okFound = e => passFilter(isFound(e.id));
    const hits = [], statHits = [];
    const pool = [...entries, ...people.filter(v => v.trackId)];
    pool.forEach(e => {
      if (!okType(e) || !okFound(e)) return;
      if (special) { if (newIds.has(trackOf(e.id)) && !e.trackId) hits.push([0, e]); return; }
      if (e.unknown) return;
      const sc = score(e.name, q);
      if (sc >= 0) { hits.push([sc, e]); return; }
      if (q.length >= 2 && !e.trackId) {
        const m = haystack(e).find(h => h.toLowerCase().includes(q));
        if (m) statHits.push([e, m]);
      }
    });
    hits.sort((a, b) => a[0] - b[0] || (isFound(a[1].id) === isFound(b[1].id) ? collator.compare(a[1].name, b[1].name) : isFound(a[1].id) ? -1 : 1));
    const section = (title, rows, n) => n ? `<div class="sgroup"><div class="tier-head">${title}<small>${n}</small></div>${rows}</div>` : "";
    const by = sec => hits.filter(h => h[1].section === sec).map(h => h[1]);
    const chips = `<div class="chips">${Object.entries(STYPE).map(([k, v]) => `<button class="chip-btn" data-stype="${k}" aria-pressed="${ui.stype === k}">${v}</button>`).join("")}
      <span class="chips-note">${special ? "Entries added since your last visit" : `Showing ${ui.filter === "all" ? "found + missing" : ui.filter} · change with the buttons above`}</span></div>`;
    const html =
      section("TOOLS", by("tools").map(e => resultHTML(e)).join(""), by("tools").length) +
      section("PEOPLE", by("bio").map(e => resultHTML(e)).join(""), by("bio").length) +
      section("DOCUMENTS", by("docs").map(e => resultHTML(e)).join(""), by("docs").length) +
      section("MATCHING STATS", statHits.map(([e, m]) => resultHTML(e, m)).join(""), statHits.length);
    screen.innerHTML = `<div class="results">${chips}${html || `<div class="empty-cat"><b>NO MATCHES</b>${special ? "Nothing new since your last visit." : `Nothing in the PDA matches “${esc(query)}”.`}</div>`}</div>`;
  }
  function resultHTML(e, ctx) {
    const got = isFound(e.id);
    const open = { tools: "data-open-tool", bio: "data-open", docs: "data-open-doc" }[e.section];
    return `<div class="sres${got ? " got" : ""}${e.special ? " special" : ""}${e.gold ? " gold" : ""}">
      <button class="sres-main" ${open}="${esc(e.id)}" data-entry="${esc(e.id)}" title="Open ${esc(label(e))}">
        <span class="sres-ic" data-star="${esc(e.id)}" role="checkbox" aria-checked="${got}" title="${got ? "Found: click to unmark" : "Click to mark as found"}">${got ? I.check : '<span class="box"></span>'}</span>
        <span class="sres-name">${esc(label(e))}${badges(e)}</span>
        <span class="sres-ctx">${esc(ctx || contextOf(e))}</span>
      </button>
      <button class="sres-star${got ? " on" : ""}" data-star="${esc(e.id)}" aria-pressed="${got}" title="${got ? "Found: click to unmark" : "Click to mark as found"}">${I.star(got)}</button>
    </div>`;
  }

  /* =====================================================================
     WHAT'S LEFT — every missing entry in one place
     ===================================================================== */


  /* =====================================================================
     SEARCH PICKER: type to filter, arrows + Enter or click to pick
     ===================================================================== */
  const PICKERS = {};                 // key -> { items: [{ v, label, group, sub, star }], onPick, keepOpen, chips }
  const pkState = {};                 // key -> { chip, hi }
  const pkFold = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9$+.]+/g, " ").trim();
  function pickerHTML(key, cfg) {
    PICKERS[key] = cfg;
    const st = pkState[key] || (pkState[key] = { chip: "", hi: 0 });
    return `<div class="picker" data-pk="${key}"><input class="pk-in" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(cfg.placeholder || "Type to search…")}" aria-label="${esc(cfg.label || "Search")}">
      <div class="pk-pop" hidden></div></div>`;
  }
  function pkFilter(key, q) {
    const cfg = PICKERS[key], st = pkState[key];
    const words = pkFold(q).split(" ").filter(Boolean);
    const scored = [];
    cfg.items.forEach((it, i) => {
      if (st.chip && it.group !== st.chip) return;
      const toks = (it._t || (it._t = pkFold(it.label + " " + (it.alias || "")).split(" ")));
      let sc = 0;
      for (const w of words) {
        if (toks.includes(w)) continue;                        // whole word: best
        if (toks.some(x => x.startsWith(w))) { sc += 1; continue; }
        if (toks.join(" ").includes(w)) { sc += 3; continue; }
        return;
      }
      scored.push([sc, i, it]);
    });
    if (words.length) scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return scored.map(x => x[2]);
  }
  function pkDraw(root) {
    const key = root.dataset.pk, cfg = PICKERS[key], st = pkState[key]; if (!cfg) return;
    const inp = root.querySelector(".pk-in"), pop = root.querySelector(".pk-pop");
    const list = pkFilter(key, inp.value);
    st.hi = Math.max(0, Math.min(st.hi, list.length - 1));
    const groups = [...new Set(cfg.items.map(i => i.group).filter(Boolean))];
    const chips = cfg.chips !== false && groups.length > 1 ? `<div class="pk-chips"><button type="button" class="pk-chip${st.chip ? "" : " on"}" data-pkchip="">ALL</button>${groups.map(g => `<button type="button" class="pk-chip${st.chip === g ? " on" : ""}" data-pkchip="${esc(g)}">${esc(g)}</button>`).join("")}</div>` : "";
    let last = null, html = "";
    list.slice(0, 150).forEach((it, i) => {
      const searching = !!inp.value.trim();
      if (!searching && it.group && it.group !== last && !st.chip) { html += `<div class="pk-grp">${esc(it.group)}</div>`; last = it.group; }
      const sub = [searching && !st.chip ? it.group : "", it.sub].filter(Boolean).join(" · ");
      html += `<div class="pk-opt${i === st.hi ? " hi" : ""}" data-pkv="${esc(it.v)}" data-pki="${i}">${it.star ? '<span class="pk-star">★</span>' : ""}<span class="pk-l">${esc(it.label)}</span>${sub ? `<span class="pk-sub">${esc(sub)}</span>` : ""}</div>`;
    });
    pop.innerHTML = chips + `<div class="pk-scroll">${html || '<div class="pk-none">Nothing matches.</div>'}${list.length > 150 ? `<div class="pk-none">${list.length - 150} more: keep typing…</div>` : ""}</div>`;
    pop.hidden = false;
    const h = pop.querySelector(".pk-opt.hi"); if (h) { const sc = pop.querySelector(".pk-scroll"); const t = h.offsetTop - sc.offsetTop; if (t < sc.scrollTop) sc.scrollTop = t; else if (t + h.offsetHeight > sc.scrollTop + sc.clientHeight) sc.scrollTop = t + h.offsetHeight - sc.clientHeight; }
  }
  function pkPick(root, v) {
    const key = root.dataset.pk, cfg = PICKERS[key]; if (!cfg) return;
    const keep = cfg.keepOpen, q = keep ? root.querySelector(".pk-in").value : "";
    cfg.onPick(v);
    if (keep) requestAnimationFrame(() => { const r = screen.querySelector(`[data-pk="${key}"]`); if (!r) return; const i = r.querySelector(".pk-in"); i.value = q; i.focus(); i.select(); pkDraw(r); });
  }
  screen.addEventListener("focusin", e => { const r = e.target.closest && e.target.closest(".picker"); if (r && e.target.matches(".pk-in")) pkDraw(r); });
  screen.addEventListener("input", e => { if (!e.target.matches || !e.target.matches(".pk-in")) return; const r = e.target.closest(".picker"); pkState[r.dataset.pk].hi = 0; pkDraw(r); });
  screen.addEventListener("focusout", e => { const r = e.target.closest && e.target.closest(".picker"); if (r) setTimeout(() => { if (!r.contains(document.activeElement)) { const p = r.querySelector(".pk-pop"); if (p) p.hidden = true; } }, 120); });
  screen.addEventListener("keydown", e => {
    if (!e.target.matches || !e.target.matches(".pk-in")) return;
    const r = e.target.closest(".picker"), st = pkState[r.dataset.pk], n = pkFilter(r.dataset.pk, e.target.value).length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); st.hi = (st.hi + (e.key === "ArrowDown" ? 1 : -1) + n) % Math.max(1, n); pkDraw(r); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); const it = pkFilter(r.dataset.pk, e.target.value)[st.hi]; if (it) pkPick(r, it.v); }
    else if (e.key === "Escape") { e.stopPropagation(); r.querySelector(".pk-pop").hidden = true; e.target.blur(); }
  }, true);
  screen.addEventListener("mousedown", e => {
    const r = e.target.closest && e.target.closest(".picker"); if (!r) return;
    const ch = e.target.closest("[data-pkchip]");
    if (ch) { e.preventDefault(); pkState[r.dataset.pk].chip = ch.dataset.pkchip; pkState[r.dataset.pk].hi = 0; play("click"); pkDraw(r); return; }
    const o = e.target.closest("[data-pkv]");
    if (o) { e.preventDefault(); pkPick(r, o.dataset.pkv); }
  });

  /* =====================================================================
     DAMAGE CALCULATOR — ammo data from the OANC Ammo Chart (ammo.js)
     ===================================================================== */
  const AMMO = (typeof PDA_AMMO === "object" && PDA_AMMO) || { groups: [] };
  const CAL_ALIAS = { "5 KG BIO-SLUG": ["8x25mm / .50 BC / Bio-slug", "5 KG-Somafluid Slug"] };
  const ammoAll = AMMO.groups.flatMap((g, gi) => g.items.map((a, ai) => ({ ...a, key: gi + ":" + ai, caliber: g.caliber, section: g.section, notes: g.notes })));
  const ammoFor = cal => {
    if (CAL_ALIAS[cal]) { const [c, n] = CAL_ALIAS[cal]; return ammoAll.filter(a => a.caliber === c && (!n || a.name === n)); }
    return ammoAll.filter(a => a.caliber === cal);
  };
  const xnum = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? null : n; };
  const fmt2 = n => n == null || !isFinite(n) ? "—" : String(Math.round(n * 100) / 100);
  /* every way a weapon can fire: its base stats plus any extra modes (e.g. underslung) */
  function fireModes(e) {
    if (!e || !e.stats) return [];
    const list = [e.stats, ...(e.modes || [])];
    return list.map((s, i) => ({ i, label: s.MODE || (i ? "Mode " + (i + 1) : "Base"), s,
      melee: s.DAMAGE != null && !s["CALIBER TYPE"],
      cals: String(s["CALIBER TYPE"] || "").split("|").map(x => x.trim()).filter(Boolean),
      strength: xnum(s.STRENGTH) || 1, rpm: xnum(s.RPM) }));
  }
  const dmgWeapons = () => allTools().filter(e => !e.unknown && fireModes(e).some(m => m.melee || m.cals.length));
  /* "Advanced Scavengers (Master)" for a variant, plain name otherwise */
  const tgtName = p => { const c = p.card; return c && c.kind === "group" && c.members && c.members.length > 1 && c.name && c.name !== p.name ? `${c.name} (${p.name})` : p.name; };
  const dmgTargets = () => people.filter(p => p.base && p.base.Health != null && isFinite(+p.base.Health));   // not the unkillable ones
  /* the rules, in order: superarmor bypass → superarmor → defense penetration → defense */
  function calcHit({ dmg, sa, saBypass, def, pen, trueDmg }) {
    const effSA = trueDmg ? 0 : Math.max(0, sa - saBypass * 100);
    const afterSA = dmg > 0 ? dmg / Math.pow(dmg, effSA / 100) : 0;
    const effDef = trueDmg ? 0 : Math.min(100, Math.max(0, def * (1 - Math.min(1, pen))));
    return { effSA, afterSA, effDef, final: afterSA * (1 - effDef / 100) };
  }
  function dmgState() {
    const d = ui.dmg || (ui.dmg = {});
    return Object.assign({ gun: "", mode: 0, ammo: "", str: true, hits: "", target: "", hp: "100", def: "0", sa: "0", ss: "0", sh: "0", direct: true, custom: "" }, d);
  }
  function setDmg(k, v) {
    const d = ui.dmg = dmgState();
    d[k] = v;
    if (k === "gun") { d.mode = 0; d.ammo = ""; d.hits = ""; }
    if (k === "mode") { d.mode = +v; d.ammo = ""; d.hits = ""; }
    if (k === "ammo") d.hits = "";
    persistUI(); play("select"); keepScroll(render);
  }
  function renderDamage() {
    const d = dmgState();
    const weapons = dmgWeapons();
    const gun = d.gun && byId.get(d.gun);
    const modes = fireModes(gun);
    const mode = modes[Math.min(d.mode, modes.length - 1)] || null;
    const melee = mode && mode.melee;
    const pool = mode && !melee ? mode.cals.flatMap(ammoFor) : (gun ? [] : ammoAll);
    let ammo = pool.find(a => a.key === d.ammo) || null;
    if (!ammo && pool.length && mode) ammo = pool[0];
    const tgt = d.target && people.find(p => p.id === d.target);
    const tb = tgt ? tgt.base : null;
    const hp = tb ? +tb.Health : xnum(d.hp) || 0;
    const def = tb ? +(tb.Defense || 0) : xnum(d.def) || 0;
    const sa = tb ? +(tb["Super Armour"] || 0) : xnum(d.sa) || 0;
    const ss = Math.max(0, Math.floor(tb ? +(tb.Supershield || 0) : xnum(d.ss) || 0));   // each hit knocks 1 off and does no damage
    const strength = mode && !melee && d.str ? mode.strength : 1;

    /* one shot with a given ammo */
    const shot = a => {
      if (melee) { const dmg = xnum(mode.s.DAMAGE) || 0; return { per: dmg, proj: 1, dmg, ...calcHit({ dmg, sa, saBypass: 0, def, pen: (xnum(mode.s["DEFENSE BYPASS"]) || 0) / 100, trueDmg: false }) }; }
      if (!a) { const dmg = xnum(d.custom) || 0; return { per: dmg, proj: 1, dmg, ...calcHit({ dmg, sa, saBypass: 0, def, pen: 0, trueDmg: false }) }; }
      const per = a.base * (a.mult == null ? 1 : a.mult) * strength;
      const proj = xnum(d.hits) != null && a.proj > 1 ? Math.max(0, Math.min(a.proj, xnum(d.hits))) : a.proj;
      const dmg = per * proj;
      return { per, proj, dmg, ...calcHit({ dmg, sa, saBypass: a.saBypass || 0, def, pen: a.pen || 0, trueDmg: a.trueOnDirect && d.direct }) };
    };
    const r = (mode || !gun) ? shot(ammo) : null;
    /* supershield: a hit with bypass B goes through if supershield ≤ B, otherwise it's blocked and knocks max(1, B) off */
    const ssByp = a => melee || !a ? 0 : (a.trueOnDirect && !d.direct && /\*/.test(a.raw.ssBypass || "") ? 0 : Math.max(0, xnum(a.raw.ssBypass) || 0));
    const blocked = B => ss > B ? Math.ceil((ss - B) / Math.max(1, B)) : 0;
    /* shield: while it lasts, half of each hit goes to the shield and half to health. Explosives and bludgeons ignore it */
    const shield = Math.max(0, tb ? +(tb.Shield || 0) : xnum(d.sh) || 0);
    const isBludgeon = !!(melee && gun && gun.group === "BLUDGEON");
    const isExplosive = a => !!a && (/\(HE\)/.test(a.name) || /rocket/i.test(a.caliber) || /rocket/i.test(a.name));
    const ignoresShield = a => isBludgeon || isExplosive(a);
    function healthHits(f, a) {
      if (!(f > 0) || !(hp > 0)) return null;
      if (!shield || ignoresShield(a)) return { n: Math.ceil(hp / f - 1e-9), sh: 0 };
      let h = hp, sh = shield, n = 0, shHits = 0;
      while (h > 1e-9 && n < 100000) {
        n++;
        if (sh > 1e-9) { const half = f / 2, took = Math.min(sh, half); sh -= took; h -= f - took; shHits++; }
        else h -= f;
      }
      return { n, sh: shHits };
    }
    const toKill = (f, a) => { const k = healthHits(f, a); return k ? blocked(ssByp(a)) + k.n : null; };
    const htk = r ? toKill(r.final, ammo) : null;
    const nBlocked = blocked(ssByp(ammo));
    const shInfo = r ? healthHits(r.final, ammo) : null;
    /* time to kill: guns from RPM; melee from SWING TIME (a burst is several swings in a row) */
    const rpm = mode && mode.rpm;
    const swing = melee ? xnum(mode.s["SWING TIME"]) : null;
    const burstN = melee && mode.s.BURST === "YES" ? Math.max(1, xnum(mode.s["BURST AMOUNT"]) || 1) : 1;
    const ttk = htk && rpm ? (htk - 1) * 60 / rpm : htk && swing ? (htk - 1) * swing : null;

    const opt = (v, cur, label) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(label)}</option>`;
    const gunOpts = PDA_DATA.tools.map(c => { const l = sortEntries(weapons.filter(e => e.group === c.name)); return l.length ? `<optgroup label="${esc(c.name)}">${l.map(e => opt(e.id, d.gun, e.name + (isFound(e.id) ? " ★" : ""))).join("")}</optgroup>` : ""; }).join("");
    const ammoOpts = [...new Set(pool.map(a => a.caliber))].map(c => `<optgroup label="${esc(c)}">${pool.filter(a => a.caliber === c).map(a => opt(a.key, ammo && ammo.key, a.name)).join("")}</optgroup>`).join("");
    const tgtGroups = PDA_DATA.biography.map(g => { const l = dmgTargets().filter(p => p.group === g.name || (p.card && p.card.entry && p.card.entry.group === g.name)); return l.length ? `<optgroup label="${esc(g.name)}">${l.map(p => [p, tgtName(p)]).sort((a, b) => collator.compare(a[1], b[1])).map(([p, n]) => opt(p.id, d.target, n)).join("")}</optgroup>` : ""; }).join("");

    const step = (k, v, note = "") => `<div class="stat"><i style="color:#c8a0ff">${k}</i>: ${v}${note ? ` <span class="dim">${note}</span>` : ""}</div>`;
    let steps = "";
    if (r) {
      if (melee) steps += step("DAMAGE", fmt2(r.dmg), "melee hit");
      else if (ammo) {
        steps += step("PER PROJECTILE", fmt2(r.per), `${ammo.base} base × ${ammo.mult == null ? "?" : ammo.mult}${strength !== 1 ? ` × ${strength} strength` : ""}`);
        if (ammo.proj > 1) steps += step("ONE BLAST", fmt2(r.dmg), `${r.proj} projectile${r.proj === 1 ? "" : "s"} counted as one hit`);
      } else steps += step("DAMAGE", fmt2(r.dmg), "your number");
      steps += step("SUPERARMOR", `${fmt2(r.effSA)}%`, ammo && ammo.trueOnDirect && d.direct ? "true damage on a direct hit" : `${fmt2(sa)}%${ammo && ammo.saBypass ? ` − ${fmt2(ammo.saBypass * 100)}% bypass` : ""}`);
      steps += step("AFTER SUPERARMOR", fmt2(r.afterSA), r.effSA ? `${fmt2(r.dmg)} ÷ ${fmt2(r.dmg)}^${fmt2(r.effSA / 100)}` : "no superarmor");
      const penP = melee ? (xnum(mode.s["DEFENSE BYPASS"]) || 0) : ammo ? (ammo.pen || 0) * 100 : 0;
      steps += step("DEFENSE", `${fmt2(r.effDef)}%`, ammo && ammo.trueOnDirect && d.direct ? "ignored on a direct hit" : `${fmt2(def)}%${penP ? ` × (1 − ${fmt2(penP)}% ${melee ? "defense bypass" : "armor pen"})` : ""}`);
    }
    const tShield = "";
    const resist = tb ? Object.entries(tb).filter(([k]) => !["Health", "Speed", "Defense", "Super Armour", "Shield", "Supershield"].includes(k)).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(" · ") : "";

    /* every ammo that fits, side by side */
    const cmpRows = !melee && pool.length > 1 ? pool.map(a => [a, shot(a)]).sort((x, y) => y[1].final - x[1].final).map(([a, s]) => {
      const kk = toKill(s.final, a), kb = kk && ss ? blocked(ssByp(a)) : 0;
      const k = kk ? (kb ? `${kk} <small class="dim">(${kb}+${kk - kb})</small>` : kk) : "—";
      return `<tr class="${ammo && a.key === ammo.key ? "on" : ""}" data-dmgammo="${esc(a.key)}"><td>${esc(a.name)}</td><td>${fmt2(s.dmg)}</td><td><b>${fmt2(s.final)}</b></td><td>${k}</td><td>${a.pen != null ? fmt2(a.pen * 100) + "%" + (a.trueOnDirect ? "*" : "") : esc(a.raw.pen || "")}</td><td>${a.saBypass ? fmt2(a.saBypass * 100) + "%" : ""}</td><td>${esc(xnum(a.raw.ssBypass) ? a.raw.ssBypass : "")}</td><td>${esc([a.raw.bleed && a.raw.bleed !== "NO" ? "Bleed " + a.raw.bleed : "", a.raw.fracture === "True" ? "Fracture" : "", a.raw.weakness === "True" ? "Weakness" : "", a.raw.statuses && !/^(N\/A|)$/.test(a.raw.statuses) ? a.raw.statuses : ""].filter(Boolean).join(", "))}</td></tr>`;
    }).join("") : "";

    const ammoCard = ammo ? `<div class="ammocard"><b>${esc(ammo.name)}</b> <span class="dim">${esc(ammo.caliber)} · ${esc(ammo.section)}</span>
      <div class="ammoraw">${Object.entries({ "Base Damage": "base", "Damage Mult": "mult", "Spread Multiplier": "spread", "# of Projectiles": "proj", "Armor Pen": "pen", "Shield Piercing": "shieldPierce", "Fracture": "fracture", "Causes Bleed": "bleed", "Super Armor Bypass": "saBypass", "Supershield Bypass": "ssBypass", "Causes Weakness": "weakness", "Statuses": "statuses", "Alert Radius Mult": "alert" })
        .filter(([, k]) => k in ammo.raw).map(([l, k]) => `<span><i>${l}</i>: ${esc(ammo.raw[k] === "" ? "—" : ammo.raw[k])}</span>`).join("")}</div>
      ${ammo.notes && ammo.notes.length ? `<div class="dim">${ammo.notes.map(n => "* " + esc(n)).join("<br>")}</div>` : ""}</div>` : "";

    screen.innerHTML = `<div class="results dmgcalc">
      <div class="leftsum"><b>DAMAGE CALCULATOR</b> · ammo stats from the <a href="${esc(AMMO.url || "#")}" target="_blank" rel="noopener">OANC Ammo Chart</a>, made by <b>gluehesthar</b> (@iaminyourwallsiaminyourwalls on Discord)</div>
      <div class="dgrid">
        <div class="dbox"><div class="dhead">Attacker</div><div class="dform">
          <label>WEAPON</label>${pickerHTML("dmggun", { label: "Weapon", placeholder: gun ? `${gun.name}  (type to change)` : "Type a weapon name…", onPick: v => setDmg("gun", v),
            items: [{ v: "", label: "No weapon (pick ammo directly)", group: "" }, ...PDA_DATA.tools.flatMap(c => sortEntries(weapons.filter(e => e.group === c.name)).map(e => ({ v: e.id, label: e.name, group: c.name, star: isFound(e.id), sub: "T" + e.tier })))] })}
          ${gun ? `<button class="mini-btn" data-open-tool="${esc(gun.id)}">OPEN ${esc(gun.name.toUpperCase())}</button>` : ""}
          ${modes.length > 1 ? `<label>MODE <select data-dmg="mode">${modes.map(m => opt(m.i, mode.i, m.label + (m.cals.length ? " (" + m.cals.join(" | ") + ")" : ""))).join("")}</select></label>` : ""}
          ${melee ? `<p class="cat-note">Melee: uses the weapon's DAMAGE, with its DEFENSE BYPASS as defense penetration.</p>`
            : pool.length ? `<label>AMMO</label>${pickerHTML("dmgammo", { label: "Ammo", placeholder: ammo ? `${ammo.name}  (type to change)` : "Type an ammo name…", onPick: v => setDmg("ammo", v), chips: true,
                items: pool.map(a => ({ v: a.key, label: a.name, group: a.caliber, star: !!(ammo && a.key === ammo.key), sub: `${fmt2(a.base * (a.mult == null ? 1 : a.mult))} dmg${a.proj > 1 ? " ×" + a.proj : ""}${a.pen ? " · " + fmt2(a.pen * 100) + "% pen" : ""}` })) })}`
            : gun ? `<p class="cat-note">The ammo chart has nothing for ${esc(mode ? mode.cals.join(" | ") : "this weapon")}. Type a damage number instead:</p><label>DAMAGE PER HIT <input type="number" step="any" data-dmg="custom" value="${esc(d.custom)}"></label>` : ""}
          ${!melee && mode && mode.strength !== 1 ? `<label class="chk"><input type="checkbox" data-dmg="str"${d.str ? " checked" : ""}> multiply by the weapon's STRENGTH (${mode.strength}x)</label>` : ""}
          ${ammo && ammo.proj > 1 ? `<label>PELLETS THAT HIT <input type="number" min="0" max="${ammo.proj}" step="1" data-dmg="hits" value="${esc(d.hits)}" placeholder="all ${ammo.proj}"></label>` : ""}
          ${ammo && ammo.trueOnDirect ? `<label class="chk"><input type="checkbox" data-dmg="direct"${d.direct ? " checked" : ""}> direct hit (true damage)</label>` : ""}
          ${ammoCard}
        </div></div>
        <div class="dbox"><div class="dhead">Target</div><div class="dform">
          <label>WHO</label>${pickerHTML("dmgtgt", { label: "Target", placeholder: tgt ? `${tgtName(tgt)}  (type to change)` : "Type a name, or leave for custom numbers…", onPick: v => setDmg("target", v),
            items: [{ v: "", label: "Custom numbers", group: "" }, ...PDA_DATA.biography.flatMap(g => dmgTargets().filter(p => p.group === g.name || (p.card && p.card.entry && p.card.entry.group === g.name)).map(p => ({ v: p.id, label: tgtName(p), group: g.name, sub: `${p.base.Health} HP` }))).sort((a, b) => 0)] })}
          ${tgt ? `<button class="mini-btn" data-open="${esc((tgt.card && tgt.card.entry ? tgt.card.entry : tgt).id)}">OPEN ${esc(tgtName(tgt).toUpperCase())}</button>
            <div class="stat"><i style="color:#ff5a5a">HEALTH</i>: ${esc(tb.Health)}</div><div class="stat"><i style="color:#ff9a40">DEFENSE</i>: ${esc(tb.Defense || 0)}%</div><div class="stat"><i style="color:#35d6ff">SUPER ARMOUR</i>: ${esc(tb["Super Armour"] || 0)}%</div><div class="stat"><i style="color:#ff3a3a">SUPERSHIELD</i>: ${esc(tb.Supershield || 0)}</div><div class="stat"><i style="color:#c8c8ff">SHIELD</i>: ${esc(tb.Shield || 0)}</div>${resist ? `<div class="dim">${resist}</div>` : ""}${tShield}`
          : `<label>HEALTH <input type="number" step="any" data-dmg="hp" value="${esc(d.hp)}"></label>
             <label>DEFENSE % <input type="number" step="any" data-dmg="def" value="${esc(d.def)}"></label>
             <label>SUPERARMOR % <input type="number" step="any" data-dmg="sa" value="${esc(d.sa)}"></label>
             <label>SUPERSHIELD <input type="number" step="1" min="0" data-dmg="ss" value="${esc(d.ss)}"></label>
             <label>SHIELD <input type="number" step="any" min="0" data-dmg="sh" value="${esc(d.sh)}"></label>`}
        </div></div>
        <div class="dbox dres"><div class="dhead">Result</div><div class="stats">
          ${r ? `${steps}<div class="dbig">${fmt2(r.final)} <small>damage per ${melee ? "hit" : ammo && ammo.proj > 1 ? "blast" : "shot"}</small></div>
            ${htk ? `<div class="dbig2">${ss && nBlocked ? `<span class="sscalc">${nBlocked} supershield + ${htk - nBlocked} health =</span> ` : ""}${htk} hit${htk === 1 ? "" : "s"} to kill${ttk != null ? ` · ${fmt2(ttk)}s ${rpm ? `at ${rpm} RPM` : `at ${fmt2(swing)}s per swing`}` : ""}</div>${melee && burstN > 1 ? `<div class="dim">${Math.ceil(htk / burstN)} attack${Math.ceil(htk / burstN) === 1 ? "" : "s"}: each one is a burst of ${burstN} swings.</div>` : ""}${shield ? `<div class="dim">${ignoresShield(ammo) ? `Ignores the shield (${fmt2(shield)}): ${isBludgeon ? "bludgeons" : "explosives"} go straight through it.` : shInfo && shInfo.sh ? `Shield (${fmt2(shield)}) soaks half of the first ${shInfo.sh} hit${shInfo.sh === 1 ? "" : "s"} before it breaks.` : ""}</div>` : ""}` : '<div class="dbig2">Can\'t kill with this.</div>'}
            ${ttk != null ? `<p class="cat-note">Time to kill assumes every ${melee ? "swing" : "shot"} lands${melee ? "" : " and no reloading or burst delay"}.</p>` : ""}`
          : '<p class="none">Pick a weapon or ammo.</p>'}
        </div></div>
      </div>
      ${cmpRows ? `<div class="dbox"><div class="dhead">Every ammo that fits, against this target</div><div class="dtable"><table class="ammotab"><thead><tr><th>AMMO</th><th>PER SHOT</th><th>AFTER ARMOR</th><th>HITS TO KILL</th><th>ARMOR PEN</th><th>SA BYPASS</th><th>SS BYPASS</th><th>EFFECTS</th></tr></thead><tbody>${cmpRows}</tbody></table></div></div>` : ""}
      <details class="helpw"><summary>FULL AMMO CHART <small>${ammoAll.length} ammo types</small></summary>${ammoChartHTML()}</details>
      <p class="cat-note">How damage works: Superarmor bypass takes a flat amount off the target's superarmor. Superarmor is applied first: damage ÷ damage^(superarmor ÷ 100), with a shotgun blast counted as all its pellets together. Then armor pen lowers the target's defense by that percent, and defense takes that percent off the damage. Supershield blocks whole hits: a blocked hit does no damage and takes 1 off it, or the ammo's supershield bypass if that's higher. Once supershield is at or below the bypass, hits go straight through. Shield takes half of each hit as extra health until it runs out; explosives and bludgeons skip it.</p>
      <p class="cat-note">Ammo data: <a href="${esc(AMMO.url || "#")}" target="_blank" rel="noopener">${esc(AMMO.title || "OANC Ammo Chart")}</a>. Credit to <b>gluehesthar</b> (@iaminyourwallsiaminyourwalls on Discord) for being the original spreadsheet creator and putting most of these ammo types in.</p>
    </div>`;
  }
  function ammoChartHTML() {
    const cols = [["Base Damage", "base"], ["Damage Mult", "mult"], ["Spread Multiplier", "spread"], ["# of Projectiles", "proj"], ["Armor Pen", "pen"], ["Shield Piercing", "shieldPierce"], ["Fracture", "fracture"], ["Causes Bleed", "bleed"], ["Super Armor Bypass", "saBypass"], ["Supershield Bypass", "ssBypass"], ["Causes Weakness", "weakness"], ["Statuses", "statuses"], ["Alert Radius Mult", "alert"]];
    let sec = "";
    return AMMO.groups.map(g => {
      const use = cols.filter(([, k]) => g.items.some(a => k in a.raw));
      const head = g.section !== sec ? `<h4 class="ammosec">${esc(sec = g.section)}</h4>` : "";
      return `${head}<div class="dtable"><table class="ammotab"><thead><tr><th>${esc(g.caliber)}</th>${use.map(([l]) => `<th>${esc(l)}</th>`).join("")}</tr></thead><tbody>${g.items.map(a => `<tr><td>${esc(a.name)}</td>${use.map(([, k]) => `<td>${esc(a.raw[k] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>${g.notes.length ? `<div class="dim">${g.notes.map(n => "* " + esc(n)).join("<br>")}</div>` : ""}</div>`;
    }).join("");
  }

  /* =====================================================================
     LOADOUT PLANNER: carry anything (duplicates too); space is carry weight
     ===================================================================== */
  const LOAD_SUMS = ["CARRY WEIGHT INCREASE", "QUICK SLOT INCREASE", "DEFENSE INCREASE", "SHIELD DURABILITY", "SUPER SHIELD INCREASE"];
  const KEY_STATS = ["CALIBER TYPE", "DAMAGE", "STRENGTH", "RPM", "GEAR TYPE", "DEFENSE INCREASE", "SHIELD DURABILITY", "CARRY WEIGHT INCREASE", "QUICK SLOT INCREASE"];
  const num = v => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; };
  const fmtN = n => String(Math.round(n * 1000) / 1000);
  const saveLoad = () => save(KEY_LOAD, loadout);
  const loadItems = () => loadout.items.map(([id, n]) => [byId.get(id), n]).filter(([e]) => e);
  function loadoutSums() {
    const out = { WEIGHT: 0 };
    loadItems().forEach(([e, n]) => {
      out.WEIGHT += num(e.stats && e.stats.WEIGHT) * n;
      LOAD_SUMS.forEach(k => { const v = e.stats && e.stats[k]; if (v != null) out[k] = (out[k] || 0) + num(v) * n; });
    });
    return out;
  }
  function renderLoadout() {
    const onlyFound = !!ui.loadFound;
    const pool = allTools().filter(e => !e.unknown && (!onlyFound || isFound(e.id)));
    const pickItems = PDA_DATA.tools.flatMap(c => sortEntries(pool.filter(e => e.group === c.name)).map(e => ({ v: e.id, label: e.name, group: c.name, star: isFound(e.id),
      sub: `T${e.tier}${e.stats && e.stats.WEIGHT != null ? " · " + e.stats.WEIGHT + " wt" : ""}${e.stats && e.stats["GEAR TYPE"] ? " · " + e.stats["GEAR TYPE"].toLowerCase() : ""}` })));
    const items = loadItems();
    const sums = loadoutSums();
    const cap = baseCarry() + (sums["CARRY WEIGHT INCREASE"] || 0);
    const used = sums.WEIGHT, over = cap != null && used > cap;
    const pct = cap ? Math.min(100, used / cap * 100) : 0;
    const rows = items.map(([e, n], i) => {
      const facts = KEY_STATS.filter(s => e.stats && e.stats[s] != null).map(s =>
        `<span><i style="color:${TOOL_STAT_COLORS[s] || "#ddd"}">${esc(s)}</i>: ${esc(e.stats[s])}</span>`).join("");
      const w = num(e.stats && e.stats.WEIGHT);
      return `<div class="litem">
        <button class="linkish lname" data-open-tool="${esc(e.id)}" title="Open its PDA page">${esc(e.name)}</button>
        <span class="lmeta">${esc(e.group)} · T${e.tier}</span>
        <span class="lcount"><button class="mini-btn" data-lminus="${i}" title="One less">−</button><b>×${n}</b><button class="mini-btn" data-lplus="${i}" title="One more">+</button></span>
        <span class="lweight">${e.stats && e.stats.WEIGHT != null ? `${fmtN(w * n)} wt` : "no weight"}</span>
        <button class="mini-btn" data-lremove="${i}" title="Remove">✕</button>
        ${facts ? `<div class="lfacts">${facts}</div>` : ""}</div>`;
    }).join("");
    const sumHTML = LOAD_SUMS.filter(k => sums[k] != null).map(k =>
      `<div class="stat"><i style="color:${TOOL_STAT_COLORS[k] || "#ddd"}">TOTAL ${esc(k)}</i>: ${fmtN(sums[k])}${k.includes("DEFENSE") || k.includes("SHIELD") ? "%" : ""}</div>`).join("");
    screen.innerHTML = `<div class="results loadout">
      <div class="leftsum"><b>LOADOUT</b> · carry anything you like, as many as you like
        <span class="leftbtns"><label class="lfound"><input type="checkbox" data-lfound${onlyFound ? " checked" : ""}> ONLY WHAT I'VE FOUND</label><button class="mini-btn" data-lcopy>COPY AS TEXT</button><button class="mini-btn" data-lclear>CLEAR</button></span></div>
      <div class="ladd">${pickerHTML("load", { items: pickItems, keepOpen: true, label: "Add to loadout", placeholder: "Type to add: ak74, plate carrier, fak…  (Enter adds, keeps open for more)", onPick: v => loadoutAdd(v) })}</div>
      <div class="dbox lspace${over ? " over" : ""}"><div class="dhead">Space</div><div class="stats">
        <label class="lbase">BASE CARRY WEIGHT <input type="number" step="any" min="0" data-lbase value="${esc(fmtN(baseCarry()))}" title="Everyone starts with ${BASE_CARRY}"></label>
        <div class="lbar"><div style="width:${pct}%"></div></div>
        <div class="stat"><i style="color:#bbb">USED</i>: ${fmtN(used)}${cap != null ? ` / ${fmtN(cap)}` : ""}${cap != null ? (over ? ` <b class="lover">OVER BY ${fmtN(used - cap)}</b>` : ` <span class="lfree">(${fmtN(cap - used)} free)</span>`) : ""}</div>
        <p class="cat-note">Space = base ${fmtN(baseCarry())}${baseCarry() === BASE_CARRY ? " (what everyone starts with)" : ""} + ${fmtN(sums["CARRY WEIGHT INCREASE"] || 0)} from gear. You can go over; it just shows how far.</p>
        ${sumHTML}
      </div></div>
      <div class="llist">${rows || '<p class="none">Nothing yet. Pick something above and press ADD.</p>'}</div>
      <p class="cat-note">Totals are the PDA's numbers added together. The game may combine some differently (for example, whether defence from two pieces of gear stacks).</p>
    </div>`;
  }
  function loadoutAdd(id) {
    if (!byId.has(id)) return;
    const it = loadout.items.find(x => x[0] === id);
    if (it) it[1]++; else loadout.items.push([id, 1]);
    saveLoad(); play("select"); keepScroll(render);
  }
  function loadoutText() {
    const sums = loadoutSums(), cap = baseCarry() + (sums["CARRY WEIGHT INCREASE"] || 0);
    return `PDA LOADOUT${user ? " — " + user : ""}\n` + loadItems().map(([e, n]) => `${n > 1 ? n + "x " : ""}${e.name} (Tier ${e.tier})`).join("\n") +
      `\n\nWEIGHT: ${fmtN(sums.WEIGHT)}${cap != null ? " / " + fmtN(cap) : ""}` +
      LOAD_SUMS.filter(k => sums[k] != null).map(k => `\nTOTAL ${k}: ${fmtN(sums[k])}`).join("");
  }

  /* tiers / tabs you're closest to finishing */
  function closestHTML() {
    const groups = [];
    PDA_DATA.tools.forEach(c => Object.keys(c.tiers).forEach(t => groups.push([`${c.name} · TIER ${t}`, c.items.filter(e => e.tier === +t)])));
    PDA_DATA.biography.forEach(g => groups.push([`BIOGRAPHY · ${g.name}`, g.items]));
    PDA_DATA.documents.forEach(g => groups.push([`DOCUMENTS · ${g.name}`, g.items]));
    const close = groups.map(([n, items]) => { const real = items.filter(e => !e.unknown); const left = sortEntries(real.filter(e => !isFound(e.id))); return [n, left, real.length]; })
      .filter(([, left, tot]) => left.length && left.length <= 3 && tot > left.length)
      .sort((a, b) => a[1].length - b[1].length || b[2] - a[2]).slice(0, 10);
    if (!close.length) return "";
    const open = e => ({ tools: "open-tool", bio: "open", docs: "open-doc" }[e.section]);
    return `<div class="sgroup closest"><div class="tier-head">ALMOST DONE<small>${close.length}</small></div>${close.map(([n, left, tot]) =>
      `<div class="closerow"><b>${esc(n)}</b><span class="dim">${tot - left.length}/${tot}</span><span>${left.length} left: ${left.map(e => `<button class="linkish" data-${open(e)}="${esc(e.id)}">${esc(e.name)}</button>`).join(", ")}</span></div>`).join("")}</div>`;
  }
  function renderMissing() {
    const tags = updateTags();
    if (ui.leftUpd && !tags.includes(ui.leftUpd)) ui.leftUpd = "";
    const inUpd = list => ui.leftUpd ? list.filter(e => e.update === ui.leftUpd) : list;
    const [f, t] = countOf(inUpd(entries));
    const groups = [];
    PDA_DATA.tools.forEach(c => groups.push(["TOOLS › " + c.name, inUpd(c.items)]));
    PDA_DATA.biography.forEach(g => groups.push(["BIOGRAPHY › " + g.name, inUpd(g.items)]));
    PDA_DATA.documents.forEach(g => groups.push(["DOCUMENTS › " + g.name, inUpd(g.items)]));
    const updSel = tags.length ? `<label class="leftupd">SHOW <select data-leftupd><option value="">EVERYTHING</option>${tags.map(x => `<option value="${esc(x)}"${x === ui.leftUpd ? " selected" : ""}>NEW IN ${esc(x.toUpperCase())}</option>`).join("")}</select></label>` : "";
    const body = groups.map(([name, items]) => {
      const left = sortEntries(items.filter(e => !isFound(e.id)));
      if (!left.length) return "";
      return `<div class="sgroup"><div class="tier-head">${esc(name)}<small>${left.length} left</small>${pbar(items.length - left.length, items.length)}</div>${left.map(e => resultHTML(e)).join("")}</div>`;
    }).join("");
    screen.innerHTML = `<div class="results">
      <div class="leftsum"><b>${t - f}</b> left to find · ${f} / ${t} found (${t ? Math.round(f / t * 100) : 0}%)${pbar(f, t)}
        ${updSel}<span class="leftbtns"><button class="mini-btn" data-random title="Open a random entry you haven't found (R)">&#127922; RANDOM</button><button class="mini-btn" data-copylist>COPY AS TEXT</button><button class="mini-btn" data-printlist>PRINT</button></span></div>
      ${ui.leftUpd ? "" : closestHTML()}
      ${body || `<div class="empty-cat"><b>${ui.leftUpd ? "ALL OF " + esc(ui.leftUpd.toUpperCase()) + " FOUND" : "EVERYTHING FOUND"}</b>Nice work.</div>`}</div>`;
  }

  function missingGroups() {
    const out = [];
    PDA_DATA.tools.forEach(c => out.push(["TOOLS › " + c.name, c.items]));
    PDA_DATA.biography.forEach(g => out.push(["BIOGRAPHY › " + g.name, g.items]));
    PDA_DATA.documents.forEach(g => out.push(["DOCUMENTS › " + g.name, g.items]));
    return out.map(([n, items]) => [n, sortEntries(items.filter(e => !isFound(e.id) && !e.unknown))]).filter(([, l]) => l.length);
  }
  function missingText() {
    const [f, t] = countOf(entries);
    return `PDA CHECKLIST — ${t - f} left (${f}/${t} found)${user ? " — " + user : ""}\n\n` +
      missingGroups().map(([n, l]) => `${n} (${l.length})\n` + l.map(e => `  [ ] ${e.name}${e.tier ? "  (tier " + e.tier + ")" : ""}`).join("\n")).join("\n\n");
  }
  function openEntry(x) {
    const e = byId.get(x.id) || byId.get(trackOf(x.id)); if (!e) return;
    ui.tab = { tools: "tools", bio: "biography", docs: "documents" }[e.section] || ui.tab;
    if (e.section === "tools") ui.cat = e.catIndex; else if (e.section === "bio") ui.bio = e.groupIndex; else if (e.section === "docs") ui.docs = e.groupIndex;
    renderTabs(); openDetail(typeOf(e), e.id);
  }
  function goNext(x) {
    if (!x) return;
    play("open"); imgIndex = 0;
    detail = { type: typeOf(x), id: x.id }; render();
  }
  function markAndNext(id) {
    const e = byId.get(id); if (!e) return;
    if (!isFound(id) && change([id], true)) play("select");
    const nx = nextMissing(e);
    if (nx) goNext(nx); else { toast("That was the last one missing here!"); render(); }
  }
  function randomMissing() {
    const pool = entries.filter(e => !isFound(e.id) && !e.unknown);
    if (!pool.length) { toast("You've found everything!"); return; }
    const e = pool[Math.floor(Math.random() * pool.length)];
    if (query) clearSearch(false);
    ui.tab = { tools: "tools", bio: "biography", docs: "documents" }[e.section];
    if (e.section === "tools") ui.cat = e.catIndex; else if (e.section === "bio") ui.bio = e.groupIndex; else ui.docs = e.groupIndex;
    toast(`Go find: ${e.name}`);
    renderTabs(); openDetail({ tools: "tool", bio: "person", docs: "doc" }[e.section], e.id);
  }
  function printList() {
    const w = window.open("", "_blank");
    if (!w) { toast("Your browser blocked the print window. Allow pop-ups for this site."); return; }
    const body = missingGroups().map(([n, l]) => `<h2>${esc(n)} <small>(${l.length})</small></h2><ul>${l.map(e => `<li>&#9744; ${esc(e.name)}${e.tier ? ` <small>tier ${e.tier}</small>` : ""}</li>`).join("")}</ul>`).join("");
    const [f, t] = countOf(entries);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>PDA checklist</title><style>body{font:14px/1.4 monospace;margin:24px;color:#000;background:#fff}h1{font-size:20px}h2{font-size:15px;margin:16px 0 4px;border-bottom:1px solid #999}ul{list-style:none;padding:0;columns:3}li{break-inside:avoid}small{color:#666}</style><h1>PDA checklist — ${t - f} left (${f}/${t} found)</h1>${body}<script>onload=()=>print()<\/script>`);
    w.document.close();
  }

  /* ---------- progress over time ---------- */
  function snapProgress() {
    const [f] = countOf(entries);
    progress[today()] = f;
    const ks = Object.keys(progress).sort(); while (ks.length > 120) delete progress[ks.shift()];
    save(KEY_PROG, progress);
  }
  function progressChart() {
    const [, total] = countOf(entries);
    const days = Object.keys(progress).sort();
    if (days.length < 2) return '<div class="row dim">A graph of your progress shows up here once you\'ve marked things on two different days.</div>';
    const W = 640, H = 150, L = 34, R = 10, T = 10, B = 22;
    const t0 = Date.parse(days[0]), t1 = Date.parse(days[days.length - 1]) || t0 + 1;
    const x = d => L + (W - L - R) * ((Date.parse(d) - t0) / Math.max(1, t1 - t0));
    const y = v => T + (H - T - B) * (1 - v / Math.max(1, total));
    let path = "";
    days.forEach((d, i) => { path += i ? ` H${x(d).toFixed(1)} V${y(progress[d]).toFixed(1)}` : `M${x(d).toFixed(1)} ${y(progress[d]).toFixed(1)}`; });
    const grid = [0, .5, 1].map(r => `<line x1="${L}" x2="${W - R}" y1="${y(total * r)}" y2="${y(total * r)}" class="pg-grid"/><text x="${L - 6}" y="${y(total * r) + 4}" class="pg-ax" text-anchor="end">${Math.round(total * r)}</text>`).join("");
    const pts = days.map(d => `<circle cx="${x(d)}" cy="${y(progress[d])}" r="4" class="pg-pt"/><circle cx="${x(d)}" cy="${y(progress[d])}" r="12" class="pg-hit" data-tip="${d}: ${progress[d]} / ${total} found"/>`).join("");
    return `<div class="row pgwrap"><svg viewBox="0 0 ${W} ${H}" class="pgchart" role="img" aria-label="Databanks found over time">${grid}
      <path d="${path}" class="pg-line"/>${pts}
      <text x="${L}" y="${H - 5}" class="pg-ax">${days[0]}</text><text x="${W - R}" y="${H - 5}" class="pg-ax" text-anchor="end">${days[days.length - 1]}</text></svg></div>`;
  }

  /* =====================================================================
     PROFILE / CLOUD / MANUAL / SETTINGS
     ===================================================================== */
  function renderProfile() {
    const [f, t] = countOf(entries);
    const pct = t ? Math.round(f / t * 100) : 0;
    const rows = [
      ["TOOLS", "#9cff6b", entries.filter(e => e.section === "tools")],
      ["PERSON ENTRIES", "#8a8aff", entries.filter(e => e.section === "bio")],
      ...PDA_DATA.documents.map((g, i) => [g.name.toUpperCase(), ["#45e3f0", "#f4ee3c", "#ff79e0"][i % 3], g.items])
    ].map(([n, c, list]) => { const [a, b] = countOf(list); return `<div class="row"><b style="color:${c}">${n}:</b> ${a} / ${b}</div>`; }).join("");
    const initial = (user || "?").trim().charAt(0).toUpperCase() || "?";
    screen.innerHTML = `
      <div class="profile">
        <div class="avatar"><div class="uname">${esc(user || "player")}</div><div class="face">${esc(initial)}</div></div>
        <div class="rows">
          <h3>USER PROFILE //</h3>
          <div class="row"><b style="color:#4fd8ff">USER:</b><input id="uname" maxlength="40" placeholder="type your name" value="${esc(user)}"></div>
          <div class="row"><b style="color:#ffb347">COMPLETION:</b> ${pct}%</div>
          <div class="row bar"><span class="fill" style="width:${pct}%"></span><span><b style="color:#c8d0ff">DATABANKS FOUND:</b> ${f} / ${t}</span></div>
        </div>
        <div class="rows wide">
          <h3>SAVE PROFILES //</h3>
          <div class="row profrow">
            <select id="profSel">${PROF.list.map(n => `<option${n === PROF.active ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>
            <input id="profNew" maxlength="24" placeholder="new profile name">
            <button class="mini-btn" id="profAdd">CREATE</button>
            ${PROF.active !== "Main" ? '<button class="mini-btn danger" id="profDel">DELETE THIS PROFILE</button>' : ""}
            <span class="dim">Separate checklists, e.g. for an alt account. Each has its own marks, notes and favourites.</span>
          </div>
        </div>
        <div class="rows wide">
          <h3>DATABANK PROGRESS //</h3>
          ${rows}
        </div>
        <div class="rows wide">
          <h3>USER FAVOURITES //</h3>
          ${favRows()}
        </div>
        <div class="rows wide">
          <h3>THIS SESSION //</h3>
          ${sessionRow()}
          ${progressChart()}
        </div>
        <div class="rows wide">
          <h3>RECENTLY FOUND //</h3>
          ${recentRows()}
        </div>
      </div>`;
    $("#profSel").onchange = ev => { PROF.active = ev.target.value; save(KEY_PROF, PROF); ui.detail = null; persistUI(); location.reload(); };
    $("#profAdd").onclick = () => {
      const n = $("#profNew").value.trim().replace(/[@|]/g, "");
      if (!n) { toast("Type a name for the new profile."); return; }
      if (PROF.list.includes(n)) { toast("A profile with that name already exists."); return; }
      PROF.list.push(n); PROF.active = n; save(KEY_PROF, PROF); location.reload();
    };
    const del = $("#profDel");
    if (del) del.onclick = () => {
      if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = "CLICK AGAIN TO DELETE"; play("warn"); return; }
      ["pda-found-v1", "pda-user-v1", "pda-fav-v1", "pda-notes-v1", "pda-log-v1", "pda-friend-v1", "pda-since-backup-v1"].forEach(k => { try { localStorage.removeItem(`${k}@${PROF.active}`); } catch { /* ignore */ } });
      PROF.list = PROF.list.filter(x => x !== PROF.active); PROF.active = "Main"; save(KEY_PROF, PROF); location.reload();
    };
    $("#uname").addEventListener("input", ev => {
      user = ev.target.value; save(KEY_USER, user);
      $(".uname").textContent = user || "player";
      $(".face").textContent = (user.trim().charAt(0) || "?").toUpperCase();
    });
  }

  /* bulk paste: match pasted lines to entry names */
  const bulkKey = n => String(n).toLowerCase().replace(/[^a-z0-9$+]/g, "");
  function bulkMark(text) {
    const lines = String(text).split(/\r?\n/).map(l => l
      .replace(/^\s*(?:[-*•★☆✓✔]|\d+[.)])\s*/, "")       // bullets / numbering
      .replace(/^\d+\s*x\s+/i, "")                          // "2x AK74"
      .replace(/\s*\((?:t|tier)\s*\d+[^)]*\)\s*$/i, "")     // "(T3)" / "(Tier 3)"
      .trim()).filter(l => l && !/^(tools|biography|documents|pda)\b.*[›:]/i.test(l));
    if (!lines.length) { play("warn"); toast("Paste some names first."); return null; }
    const idx = new Map();
    [...entries, ...people.filter(v => v.trackId)].forEach(x => { if (!x.unknown) { const k = bulkKey(x.name); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(x.id); } });
    const ids = [], miss = []; let already = 0;
    lines.forEach(l => { const hit = idx.get(bulkKey(l)); if (!hit) { miss.push(l); return; } hit.forEach(id => { if (isFound(id)) already++; else ids.push(id); }); });
    const uniq = [...new Set(ids)];
    if (uniq.length) { change(uniq, true, "a pasted list"); play("confirm"); } else play(miss.length ? "warn" : "click");
    return { marked: uniq.length, already, miss };
  }
  /* everything checked off since the site was opened in this tab */
  function sessionFinds() {
    const before = new Set((sessionStart && sessionStart.ids) || []);
    return Object.keys(found).filter(id => !before.has(id) && byId.has(id)).map(id => byId.get(id));
  }
  function sessionText() {
    const got = sessionFinds();
    const groups = new Map();
    got.forEach(e => { const g = { tools: "TOOLS", bio: "BIOGRAPHY", docs: "DOCUMENTS" }[e.section] + " › " + e.group; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e.isCard ? e.name : e.name); });
    return `PDA — found this run${user ? " by " + user : ""}: ${got.length}\n` + [...groups].map(([g, l]) => `\n${g}\n` + l.sort(collator.compare).map(n => "- " + n).join("\n")).join("\n");
  }
  function sessionRow() {
    const got = sessionFinds();
    const mins = sessionStart ? Math.max(1, Math.round((Date.now() - sessionStart.t) / 60000)) : 0;
    return `<div class="row"><b style="color:#6cff6c">FOUND THIS RUN:</b> ${got.length} <span class="dim">· since you opened the site ${mins} min ago</span>
      ${got.length ? '<button class="mini-btn" data-copyrun title="Copy everything you found this run as a list">COPY LIST</button> <button class="mini-btn" data-newrun title="Start counting a new run from now">NEW RUN</button>' : ""}</div>
      ${got.length ? `<div class="runlist">${sortEntries(got).map(e => `<button class="linkish" data-${{ tools: "open-tool", bio: "open", docs: "open-doc" }[e.section]}="${esc(e.id)}">${esc(e.name)}</button>`).join(", ")}</div>` : ""}`;
  }
  function favRows() {
    const ids = Object.keys(favs).filter(id => byId.has(id));
    if (!ids.length) return '<div class="row dim">Press the ♥ on any weapon, person or document page to add it here.</div>';
    const groupsOf = [["FAVOURITE GUNS", "#9cff6b", "tools"], ["FAVOURITE PERSON ENTRIES", "#4fd8ff", "bio"], ["FAVOURITE DOCUMENTS", "#ff79e0", "docs"]];
    return groupsOf.map(([title, c, sec]) => {
      const list = ids.map(id => byId.get(id)).filter(e => e.section === sec);
      if (!list.length) return "";
      const open = { tools: "data-tool", bio: "data-person", docs: "data-open-doc" }[sec];
      return `<div class="row"><b style="color:${c}">${title}:</b> ${list.map(e => `<button class="linkish" ${open}="${esc(e.id)}">${esc(e.name)}</button>`).join(", ")}</div>`;
    }).join("");
  }
  function ago(t) {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24); return `${d} day${d > 1 ? "s" : ""} ago`;
  }
  function recentRows() {
    const list = history_.slice(0, 15);
    if (!list.length) return '<div class="row dim">Nothing yet. Things you mark show up here.</div>';
    return list.map(h => {
      const when = `<span class="when">${ago(h.t)}</span>`;
      if (h.undo) return `<div class="row dim">${when}Undid a change</div>`;
      if (h.bulk) return `<div class="row">${when}<b style="color:${h.on ? "#6cff6c" : "#ff6a6a"}">${h.on ? "FOUND" : "UNMARKED"}</b> ${h.n} entries <span class="dim">(${esc(h.bulk)})</span></div>`;
      const e = byId.get(h.id); if (!e) return "";
      return `<div class="row">${when}<b style="color:${h.on ? "#6cff6c" : "#ff6a6a"}">${h.on ? "FOUND" : "UNMARKED"}</b> <button class="linkish" ${{ tools: "data-tool", bio: "data-person", docs: "data-open-doc" }[e.section]}="${esc(e.id)}">${esc(e.name)}</button></div>`;
    }).join("");
  }

  /* ---------- share links: #v=<name>.<5-char code per found entry> ---------- */
  const h5 = id => { let h = 0x811c9dc5; for (const ch of id) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36).padStart(7, "0").slice(-5); };
  const byHash = new Map(entries.map(e => [h5(e.id), e.id]));
  Object.entries(MOVED).forEach(([o, n]) => { if (!byHash.has(h5(o))) byHash.set(h5(o), n); });   // old share links
  function shareLink() {
    const codes = Object.keys(found).filter(id => byId.has(id)).map(h5).join("");
    return `${location.origin}${location.pathname}#v=${encodeURIComponent(user || "")}.${codes}`;
  }
  function parseShare(str) {
    const m = String(str).match(/#v=([^.]*)\.([0-9a-z]*)/);
    if (!m) return null;
    const set = {};
    for (let i = 0; i + 5 <= m[2].length; i += 5) { const id = byHash.get(m[2].slice(i, i + 5)); if (id) set[id] = 1; }
    let name = ""; try { name = decodeURIComponent(m[1]); } catch { /* ignore */ }
    return { name, set };
  }
  function doExport() {
    const blob = new Blob([JSON.stringify({ app: "onc-pda-tracker", v: 3, user, found, favs, notes, log: history_, counts, loadout }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pda-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    sinceBackup = 0; save(KEY_SINCE, 0); save(KEY_SNOOZE, 0);
  }
  let nagged = false;

  /* =====================================================================
     CLOUD: accounts + sync, rarity, live profile links (backend/worker.js)
     ===================================================================== */
  const API = (typeof PDA_CLOUD === "object" && PDA_CLOUD && String(PDA_CLOUD.api || "").replace(/\/+$/, "")) || "";
  const KEY_ACC = pk("pda-account-v1");          // { name, token, base: [ids at last sync], ver, at }
  let acc = API ? load(KEY_ACC, null) : null;
  let syncState = { busy: false, msg: "", bad: false, timer: 0 };
  let rarity = API ? load("pda-rarity-v1", null) : null;    // { players, counts, at }
  const rarityOf = id => { if (!rarity || !rarity.players) return null; const t = trackOf(id); return (rarity.counts[t] || 0) / rarity.players; };
  async function api(method, path, data) {
    const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(acc && acc.token ? { Authorization: "Bearer " + acc.token } : {}) }, body: data ? JSON.stringify(data) : undefined });
    let j = null; try { j = await r.json(); } catch { /* ignore */ }
    return [r.status, j || {}];
  }
  let serverInfo = API ? load("pda-server-v1", { uploads: false, admins: [] }) : { uploads: false, admins: [] };
  const isAdminName = n => !!n && (serverInfo.admins || []).some(a => a.toLowerCase() === String(n).toLowerCase());
  const adminTag = n => isAdminName(n) ? ' <b class="badm" title="Runs this site">ADMIN</b>' : "";
  const amAdmin = () => BOTTOM_TABS.includes("admin");
  async function loadServerInfo() { try { const [st, r] = await api("GET", "/api"); if (st === 200) { serverInfo = r; save("pda-server-v1", r); if (["community", "players"].includes(ui.tab)) keepScroll(render); } } catch { /* offline */ } }
  async function uploadPic(file) {
    const r = await fetch(API + "/api/upload", { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", ...(acc && acc.token ? { Authorization: "Bearer " + acc.token } : {}) }, body: file });
    let j = {}; try { j = await r.json(); } catch { /* ignore */ }
    if (r.status !== 201) { const e = new Error(j.error || "Upload failed."); e.user = true; throw e; }
    return j.url;
  }
  /* the password never leaves the browser: it's stretched into a key first */
  async function passKey(name, pass) {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("pda-tracker:" + name.toLowerCase()), iterations: 150000 }, k, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const foundIds = () => Object.keys(found).filter(id => /^[tbd]\|/.test(id)).sort();
  /* three-way merge: what the server has, plus what you added here, minus what you removed here */
  function mergeFound(server, base, local) {
    const B = new Set(base), L = new Set(local), out = new Set(server);
    local.forEach(id => { if (!B.has(id)) out.add(id); });
    base.forEach(id => { if (!L.has(id)) out.delete(id); });
    return [...out].sort();
  }
  function applyServer(ids) {
    const before = foundIds().join("\n");
    found = {}; ids.forEach(id => { found[MOVED[id] || id] = 1; });
    save(KEY_FOUND, found);
    if (before !== ids.join("\n")) { updateCount(); keepScroll(render); renderTabs(); }
  }
  function scheduleSync(ms = 2500) { if (!acc || viewOnly) return; clearTimeout(syncState.timer); syncState.timer = setTimeout(syncNow, ms); }
  async function syncNow(quiet = true) {
    if (!acc || syncState.busy || viewOnly) return;
    syncState.busy = true;
    try {
      for (let tries = 0; tries < 3; tries++) {
        let [st, me] = await api("GET", "/api/me");
        if (st === 401) { acc = null; save(KEY_ACC, null); syncState.msg = "You were logged out. Log in again to keep syncing."; syncState.bad = true; break; }
        if (st !== 200) throw new Error(me.error || "Couldn't reach the server.");
        const merged = mergeFound(me.found, acc.base || [], foundIds());
        if (merged.join("\n") !== me.found.join("\n")) {
          [st, me] = await api("PUT", "/api/me", { found: merged, ver: me.ver });
          if (st === 409) continue;                       // changed elsewhere meanwhile: redo the merge
          if (st !== 200) throw new Error(me.error || "Couldn't save.");
        }
        if (!acc.at) { pullCounts(); checkAdmin(); }
        acc.base = me.found; acc.ver = me.ver; acc.at = Date.now(); acc.share = me.share; acc.public = me.public; acc.name = me.name;
        save(KEY_ACC, acc);
        applyServer(me.found);
        syncState.msg = ""; syncState.bad = false;
        break;
      }
    } catch (e) { syncState.msg = (e && e.message) || "Sync failed. It'll retry."; syncState.bad = true; scheduleSync(30000); }
    syncState.busy = false;
    const sb = $("#syncStatus"); if (sb) sb.innerHTML = syncStatusHTML();
    if (!quiet && !syncState.bad) toast("Synced.");
  }
  const syncStatusHTML = () => syncState.busy ? "Syncing…" : syncState.bad ? `<span style="color:#ff8a7a">${esc(syncState.msg)}</span>` : acc && acc.at ? `Synced ${ago(acc.at)}.` : "";
  const profileURL = name => `${location.origin}${location.pathname}#u=${encodeURIComponent(name)}`;
  async function loadRarity(force) {
    if (!API) return;
    if (!force && rarity && Date.now() - rarity.got < 10 * 60000) return;
    try { const [st, r] = await api("GET", "/api/rarity"); if (st === 200) { rarity = { ...r, got: Date.now() }; save("pda-rarity-v1", rarity); if (detail) keepScroll(render); } } catch { /* offline */ }
  }
  function rarityHTML(e) {
    const r = rarityOf(e.id); if (r == null) return "";
    const pct = Math.round(r * 1000) / 10;
    const tag = pct < 5 ? "VERY RARE" : pct < 20 ? "RARE" : pct < 50 ? "UNCOMMON" : "COMMON";
    return `<div class="stat gap rarity" title="Out of ${rarity.players} players who share their progress"><i style="color:#7ad7ff">FOUND BY</i>: ${pct}% of players <span class="rtag r-${tag.replace(" ", "")}">${tag}</span></div>`;
  }
  function accountHTML() {
    if (!API) return "";
    if (!acc) return `<h4>ACCOUNT · SYNC BETWEEN DEVICES</h4>
      <p>Make a free account and your checklist follows you to every phone and computer you log in on. Your password never leaves this browser.</p>
      <form class="accform" id="accForm" autocomplete="on">
        <input id="accName" name="username" autocomplete="username" placeholder="name (3-20 letters, numbers, _)" maxlength="20">
        <input id="accPass" name="password" type="password" autocomplete="current-password" placeholder="password (8+ characters)">
        <label class="chk"><input type="checkbox" id="accShare" checked> Count my finds in the anonymous "found by %" numbers</label>
        <label class="chk"><input type="checkbox" id="accPublic" checked> Let people see my progress with a profile link</label>
        <div class="btnrow"><button class="pbtn" type="submit" data-acc="login">LOG IN</button><button class="pbtn" type="submit" data-acc="register">CREATE ACCOUNT</button></div>
        <div class="msg" id="accMsg"></div>
      </form>`;
    return `<h4>ACCOUNT · SYNC BETWEEN DEVICES</h4>
      <p>Logged in as <b>${esc(acc.name)}</b>. Everything you mark is saved to your account and shows up on your other devices. <span id="syncStatus">${syncStatusHTML()}</span></p>
      <div class="btnrow"><button class="pbtn" id="syncNow">SYNC NOW</button><button class="pbtn" id="accOut">LOG OUT</button></div>
      <label class="chk"><input type="checkbox" id="accShare2"${acc.share !== false ? " checked" : ""}> Count my finds in the anonymous "found by %" numbers</label>
      <label class="chk"><input type="checkbox" id="accPublic2"${acc.public !== false ? " checked" : ""}> Let people see my progress with a profile link</label>
      ${acc.public !== false ? `<div class="btnrow"><input readonly id="liveLink" value="${esc(profileURL(acc.name))}"><button class="pbtn" id="copyLive">${I.share} COPY PROFILE LINK</button></div><p class="dim">This link always shows your current progress (unlike the share link below, which is a snapshot).</p>` : ""}
      <div class="btnrow"><button class="pbtn danger" id="accDel">DELETE ACCOUNT</button><span class="dim" id="accDelMsg">Removes it from the server. Your progress stays in this browser.</span></div>`;
  }
  function wireAccount() {
    if (!API) return;
    const f = $("#accForm");
    if (f) f.onsubmit = async ev => {
      ev.preventDefault();
      const mode = (ev.submitter && ev.submitter.dataset.acc) || "login";
      const name = $("#accName").value.trim(), pass = $("#accPass").value, msg = $("#accMsg");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) { msg.textContent = "Names are 3-20 letters, numbers or _."; play("warn"); return; }
      if (pass.length < 8) { msg.textContent = "Use at least 8 characters for the password."; play("warn"); return; }
      msg.textContent = mode === "login" ? "Logging in…" : "Creating your account…";
      try {
        const key = await passKey(name, pass);
        const [st, r] = await api("POST", "/api/" + mode, mode === "register" ? { name, key, found: foundIds(), share: $("#accShare").checked, public: $("#accPublic").checked } : { name, key });
        if (st !== 200 && st !== 201) { msg.textContent = r.error || "Something went wrong."; play("warn"); return; }
        acc = { name: r.name, token: r.token, base: [], ver: r.ver, share: r.share, public: r.public };
        if (mode === "register") { acc.base = r.found; acc.at = Date.now(); }
        save(KEY_ACC, acc); play("confirm");
        await syncNow();
        if (mode === "login") { const s = !$("#accShare").checked ? false : null, p = !$("#accPublic").checked ? false : null; if (s === false || p === false) await api("PUT", "/api/me", { ...(s === false ? { share: false } : {}), ...(p === false ? { public: false } : {}) }); }
        checkAdmin(); pullCounts(); friends = null; mySubs = null;
        toast(mode === "login" ? `Logged in as ${acc.name}. Your progress here was merged with your account.` : `Account ${acc.name} created.`, { ms: 6000 });
        loadRarity(true); keepScroll(render);
      } catch { msg.textContent = "Couldn't reach the server. Check your connection."; play("warn"); }
    };
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("syncNow", () => { play("click"); syncNow(false); const sb = $("#syncStatus"); if (sb) sb.textContent = "Syncing…"; });
    on("accOut", async () => { play("back"); try { await api("POST", "/api/logout"); } catch { /* ignore */ } acc = null; save(KEY_ACC, null); setAdmin(false); friends = null; activity = null; mySubs = null; toast("Logged out. Your progress stays in this browser."); keepScroll(render); });
    const flag = (id, k) => { const el = $("#" + id); if (el) el.onchange = async () => { const [st, r] = await api("PUT", "/api/me", { [k]: el.checked }).catch(() => [0, {}]); if (st === 200) { acc.share = r.share; acc.public = r.public; save(KEY_ACC, acc); play("click"); keepScroll(render); } else { toast("Couldn't save that. Try again."); el.checked = !el.checked; } }; };
    flag("accShare2", "share"); flag("accPublic2", "public");
    on("copyLive", async () => { play("click"); try { await navigator.clipboard.writeText($("#liveLink").value); toast("Profile link copied."); } catch { $("#liveLink").select(); toast("Link selected. Press Ctrl+C to copy."); } });
    on("accDel", async ev => {
      const b = ev.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "CLICK AGAIN TO DELETE"; play("warn"); return; }
      const [st] = await api("DELETE", "/api/me").catch(() => [0]);
      if (st === 200) { acc = null; save(KEY_ACC, null); toast("Account deleted. Your progress stays in this browser."); keepScroll(render); } else toast("Couldn't delete it right now.");
    });
  }
  async function openProfileLink(name) {
    try {
      const [st, r] = await api("GET", "/api/u/" + encodeURIComponent(name));
      if (st !== 200) { toast(r.error || "That profile isn't available.", { ms: 6000 }); leaveView(); return; }
      const set = {}; r.found.forEach(id => { set[MOVED[id] || id] = 1; });
      viewOnly = { name: r.name, set, live: true };
      renderTabs(); updateCount(); render();
    } catch { toast("Couldn't load that profile."); }
  }

  if (API) { const o = document.createElement("option"); o.value = "rare"; o.textContent = "RAREST FIRST"; $("#sortSel").appendChild(o); $("#sortSel").value = ui.sort; }
  else if (ui.sort === "rare") ui.sort = "found";


  /* =====================================================================
     IMPORT FROM SCREENSHOTS: read names off PDA screenshots (tesseract.js)
     ===================================================================== */
  const OCR_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  let ocr = { busy: false, msg: "", found: null, already: 0 };
  let ocrWorker = null;
  function loadScript(src) {
    return new Promise((ok, bad) => { if (window.Tesseract) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load the text reader. Check your connection.")); document.head.appendChild(s); });
  }
  async function getOcr() {
    if (ocrWorker) return ocrWorker;
    await loadScript(OCR_SRC);
    ocrWorker = await window.Tesseract.createWorker("eng");
    await ocrWorker.setParameters({ tessedit_pageseg_mode: "11" });
    return ocrWorker;
  }
  /* two versions of each screenshot: as-is (people / documents) and only the brightest pixels (white tile names) */
  async function prepImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That file isn't a picture.")); i.src = url; });
      const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
      const plain = mk(), pc = plain.getContext("2d"); pc.drawImage(img, 0, 0, w, h);
      const px = pc.getImageData(0, 0, w, h), d = px.data;
      const thr = mk(), tc = thr.getContext("2d"), tp = tc.createImageData(w, h), t = tp.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = g;
        const v = g > 235 ? 0 : 255; t[i] = t[i + 1] = t[i + 2] = v; t[i + 3] = 255;
      }
      pc.putImageData(px, 0, 0); tc.putImageData(tp, 0, 0);
      return [thr, plain];
    } finally { URL.revokeObjectURL(url); }
  }
  const OCR_IGNORE = () => [...PDA_DATA.tools.map(c => c.name), ...PDA_DATA.biography.map(g => g.name), ...PDA_DATA.documents.map(g => g.name)];
  async function importShots(files) {
    files = [...files].filter(f => /^image\//.test(f.type));
    if (!files.length) { toast("Pick screenshot images (PNG or JPG)."); return; }
    if (typeof PDA_MATCH !== "function") { toast("The screenshot reader didn't load."); return; }
    if (viewOnly) { toast("This is someone else's PDA. Press EXIT first."); return; }
    ocr = { busy: true, msg: "Loading the text reader (first time takes a few seconds)…", found: null, already: 0 }; keepScroll(render);
    try {
      const w = await getOcr();
      const ids = new Map();
      const pool = entries.filter(e => !e.unknown).map(e => ({ id: e.id, name: e.name }));
      for (let i = 0; i < files.length; i++) {
        ocr.msg = `Reading screenshot ${i + 1} of ${files.length}…`; const m = $("#ocrMsg"); if (m) m.textContent = ocr.msg;
        let text = "";
        for (const c of await prepImage(files[i])) { const r = await w.recognize(c); text += "\n" + r.data.text; }
        PDA_MATCH(text, pool, OCR_IGNORE()).forEach(x => { if (!ids.has(x.id) || x.sure) ids.set(x.id, x); });
      }
      const all = [...ids.values()];
      ocr = { busy: false, msg: "", found: all.filter(x => !isFound(x.id)), already: all.filter(x => isFound(x.id)).length };
      play(ocr.found.length ? "confirm" : "click");
    } catch (e) { ocr = { busy: false, msg: (e && e.message) || "Something went wrong reading that.", found: null, already: 0 }; play("warn"); }
    keepScroll(render);
  }
  function importHTML() {
    const res = ocr.found;
    return `<h4>IMPORT FROM SCREENSHOTS</h4>
      <p>Screenshot your PDA in-game (weapon tiers, Biography, Documents) and drop the pictures here, or press Ctrl+V to paste one. Every name it can read is something you've unlocked; padlocks are skipped. You check the list before anything is marked.</p>
      <label class="dropzone" id="ocrDrop"><input type="file" id="ocrFile" accept="image/*" multiple hidden>${ocr.busy ? `<span id="ocrMsg">${esc(ocr.msg)}</span>` : "<b>DROP SCREENSHOTS HERE</b> or click to choose"}</label>
      ${!ocr.busy && ocr.msg ? `<div class="msg" style="color:#ff8a7a">${esc(ocr.msg)}</div>` : ""}
      ${res ? (res.length ? `<div class="ocrres"><div class="ocrhead">Found <b>${res.length}</b> new${ocr.already ? ` · ${ocr.already} you already had` : ""}. Untick anything that's wrong:</div>
          <div class="ocrlist">${sortEntries(res.map(x => byId.get(x.id)).filter(Boolean)).map(e => { const x = res.find(r => r.id === e.id);
            return `<label class="chk"><input type="checkbox" data-ocrid="${esc(e.id)}" checked> ${esc(e.name)} <span class="dim">${esc(e.group)}${x && !x.sure ? " · check this one" : ""}</span></label>`; }).join("")}</div>
          <div class="btnrow"><button class="pbtn" id="ocrGo">MARK TICKED AS FOUND</button><button class="pbtn" id="ocrClear">CLEAR</button></div></div>`
        : `<div class="msg">Nothing new found${ocr.already ? ` (${ocr.already} things it read you already have)` : ""}. Make sure the names are on screen and not too small.</div>`) : ""}`;
  }
  function wireImport() {
    const drop = $("#ocrDrop"), inp = $("#ocrFile"); if (!drop) return;
    inp.onchange = () => { if (inp.files.length) importShots(inp.files); };
    ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files.length) importShots(e.dataTransfer.files); });
    const go = $("#ocrGo"); if (go) go.onclick = () => {
      const ids = [...screen.querySelectorAll("[data-ocrid]:checked")].map(c => c.dataset.ocrid);
      if (ids.length && change(ids, true, "screenshot import")) play("confirm");
      ocr = { busy: false, msg: "", found: null, already: 0 }; keepScroll(render);
    };
    const cl = $("#ocrClear"); if (cl) cl.onclick = () => { ocr = { busy: false, msg: "", found: null, already: 0 }; play("back"); keepScroll(render); };
  }
  document.addEventListener("paste", e => {
    if (ui.tab !== "cloud" || detail || query || ocr.busy) return;
    const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type));
    if (files.length) { e.preventDefault(); importShots(files); }
  });


  /* =====================================================================
     PUBLISHED INFO: stats / comments / descriptions added on the admin page
     ===================================================================== */
  let overrides = API ? load("pda-overrides-v1", {}) : {};
  let latestUpdate = "";
  const origInfo = new Map();         // entry object -> its original fields
  const findEntry = id => { id = MOVED[id] || id; return byId.get(id) || people.find(p => p.id === id) || null; };
  /* the newest update tag: entries with it get a NEW badge */
  function updateTags() {
    const seen = new Map();
    entries.concat(people).forEach(e => { if (e.update && !seen.has(e.update)) seen.set(e.update, 0); });
    Object.values(overrides || {}).forEach(o => { if (o && o.update) seen.set(o.update, Math.max(seen.get(o.update) || 0, o.updated || 0)); });
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  }
  function applyOverrides(ov) {
    origInfo.forEach((o, e) => { ["stats", "comment", "desc", "tier", "community", "update", "img", "imgs"].forEach(k => { if (o[k] === undefined) delete e[k]; else e[k] = o[k]; });
      if (e.isCard && e.card) e.card.img = o.cardImg; });
    origInfo.clear();
    Object.entries(ov || {}).forEach(([id, o]) => {
      const e = findEntry(id); if (!e) return;
      origInfo.set(e, { stats: e.stats, comment: e.comment, desc: e.desc, tier: e.tier, community: e.community, update: e.update, img: e.img, imgs: e.imgs, cardImg: e.card && e.card.img });
      if (o.stats && Object.keys(o.stats).length) {
        const st = { ...(e.stats || {}), ...o.stats };
        if (st.WEIGHT != null) { const w = st.WEIGHT; delete st.WEIGHT; st.WEIGHT = w; }       // weight stays last, like the game
        e.stats = st;
      }
      if (typeof o.comment === "string") e.comment = o.comment;
      if (typeof o.desc === "string") e.desc = o.desc;
      if (o.tier && e.section === "tools") e.tier = o.tier;
      if (o.update) e.update = o.update;
      const oi = Array.isArray(o.imgs) ? o.imgs : o.img ? [o.img] : null;
      if (oi && oi.length && e.section !== "tools") { delete e.img; e.imgs = oi.slice(); if (e.isCard && e.card) e.card.img = oi[0]; }
      if (Object.keys(o).some(k => !["update", "updated", "add"].includes(k))) e.community = o.updated || 1;
    });
    latestUpdate = updateTags()[0] || "";
  }
  async function loadOverrides() {
    if (!API) return;
    try {
      const [st, r] = await api("GET", "/api/overrides");
      if (st !== 200) return;
      if (JSON.stringify(r) === JSON.stringify(overrides)) return;
      overrides = r; save("pda-overrides-v1", r);
      if (addedSig(r) !== ADDED_SIG) {                 // entries were added or removed: they need a fresh start
        if (!touched || adm.reloadAfter) { location.reload(); return; }
        toast("New entries were added to the site. Reload the page to see them.");
      }
      applyOverrides(r); keepScroll(render);
    } catch { /* offline: keep the cached copy */ }
  }
  let touched = false;
  document.addEventListener("pointerdown", () => { touched = true; }, { once: true, capture: true });
  document.addEventListener("keydown", () => { touched = true; }, { once: true, capture: true });
  const communityHTML = e => !e ? "" : (amAdmin() && !viewOnly ? `<div class="stat gap"><button class="mini-btn go" data-admquick="${esc(e.id)}">EDIT AS ADMIN${e.section !== "tools" ? " / ADD PICTURE" : ""}</button></div>` : "") + (e.update ? `<div class="stat gap"><i style="color:#ff9cf0">ADDED IN</i>: ${esc(e.update)}</div>` : "") +
    (e.community ? `<div class="stat${e.update ? "" : " gap"}"><i style="color:#8de08d">COMMUNITY</i>: <span class="dim">some info here was sent in by players and approved</span></div>` : "");

  /* =====================================================================
     FOUND COUNTS: how many times you've picked something up
     ===================================================================== */
  const KEY_COUNTS = pk("pda-counts-v1");
  let counts = migrateIds(load(KEY_COUNTS, {}), KEY_COUNTS);
  let countPush = {}, countTimer = 0;
  const countOf1 = id => counts[trackOf(id)] || (isFound(id) ? 1 : 0);
  function setCount(id, n) {
    const t = trackOf(id); n = Math.max(0, Math.min(99999, n | 0));
    if (n) counts[t] = n; else delete counts[t];
    save(KEY_COUNTS, counts);
    if (n && !isFound(id)) change([id], true);
    if (acc) { countPush[t] = n; clearTimeout(countTimer); countTimer = setTimeout(pushCounts, 2000); }
  }
  async function pushCounts() {
    if (!acc || !Object.keys(countPush).length) return;
    const set = countPush; countPush = {};
    try { const [st] = await api("PUT", "/api/counts", { set }); if (st !== 200) Object.assign(countPush, set); } catch { Object.assign(countPush, set); }
  }
  async function pullCounts() {
    if (!acc) return;
    try {
      const [st, r] = await api("GET", "/api/counts"); if (st !== 200) return;
      let changed = false, up = {};
      Object.entries(r).forEach(([id, n]) => { if ((counts[id] || 0) < n) { counts[id] = n; changed = true; } });
      Object.entries(counts).forEach(([id, n]) => { if ((r[id] || 0) < n) up[id] = n; });
      if (changed) save(KEY_COUNTS, counts);
      if (Object.keys(up).length) await api("PUT", "/api/counts", { counts: up });
    } catch { /* ignore */ }
  }
  function countHTML(e) {
    if (e.unknown || viewOnly) return "";
    const n = countOf1(e.id);
    return `<div class="stat gap timesfound"><i style="color:#f3c400">TIMES FOUND</i>: <button class="mini-btn" data-cnt="-1" data-cntid="${esc(e.id)}" title="One less"${n ? "" : " disabled"}>−</button> <b>${n}</b> <button class="mini-btn" data-cnt="1" data-cntid="${esc(e.id)}" title="Found it again">+</button></div>`;
  }

  /* =====================================================================
     PLAYERS: friends + leaderboard
     ===================================================================== */
  let friends = null, friendsMsg = "", board = { scope: "", rows: null, msg: "" };
  let activity = null, activityAt = 0;
  async function loadActivity() {
    activityAt = Date.now();
    try { const [st, r] = await api("GET", "/api/friends/activity"); if (st === 200) activity = r; } catch { /* offline */ }
    if (ui.tab === "players") keepScroll(render);
  }
  function activityHTML() {
    if (!acc || !(friends || []).length || !(activity || []).length) return "";
    const open = e => ({ tools: "open-tool", bio: "open", docs: "open-doc" }[e.section]);
    return `<h3 class="ph3">RECENT FINDS //</h3><div class="frlist recent">${activity.map(a => {
      const e = a.id && findEntry(a.id);
      const what = !a.id ? `${a.n} things at once` : e ? `<button class="linkish" data-${open(e)}="${esc(e.id)}">${esc(e.name)}</button>${isFound(e.id) ? ' <span class="dim">(you have it)</span>' : ""}` : "something";
      return `<div class="frrow"><b>${esc(a.name)}${adminTag(a.name)}</b><span>found ${what}</span><span class="dim">${esc(ago(a.t * 1000))}</span></div>`;
    }).join("")}</div>`;
  }
  async function loadFriends() {
    if (!acc) { friends = null; return; }
    loadActivity();
    try { const [st, r] = await api("GET", "/api/friends"); if (st === 200) friends = r; else friendsMsg = r.error || "Couldn't load friends."; } catch { friendsMsg = "Couldn't reach the server."; }
    if (ui.tab === "players") keepScroll(render);
  }
  async function loadLB() {
    try { const [st, r] = await api("GET", "/api/leaderboard" + (board.scope ? "?prefix=" + encodeURIComponent(board.scope) : "")); if (st === 200) { board.rows = r.rows; board.msg = ""; } else board.msg = r.error || "Couldn't load."; } catch { board.msg = "Couldn't reach the server."; }
    if (ui.tab === "players") keepScroll(render);
  }
  function lbScopes() {
    return [["", "EVERYTHING", entries], ...PDA_DATA.tools.map(c => [`t|${slug(c.name)}|`, c.name, c.items]),
      ["b|", "BIOGRAPHY", entries.filter(e => e.section === "bio")], ["d|", "DOCUMENTS", entries.filter(e => e.section === "docs")]];
  }
  function renderPlayers() {
    if (!API) { screen.innerHTML = '<div class="results"><p class="none">Players needs the cloud server.</p></div>'; return; }
    if (friends === null && acc) { friends = []; loadFriends(); }
    else if (acc && Date.now() - activityAt > 15000) loadActivity();
    if (board.rows === null) { board.rows = []; loadLB(); }
    const mine = new Set(Object.keys(found));
    const fr = !acc ? `<p>Log in (CLOUD tab) to add friends and see their progress next to yours.</p>`
      : `<form class="addfriend" id="addFriend"><input id="friendName" placeholder="their account name" maxlength="20" autocomplete="off"><button class="pbtn" type="submit">ADD FRIEND</button></form>
        ${friendsMsg ? `<div class="msg" style="color:#ff8a7a">${esc(friendsMsg)}</div>` : ""}
        ${(friends || []).length ? `<div class="frlist">${friends.map(f => {
          if (f.hidden) return `<div class="frrow"><b>${esc(f.name)}</b><span class="dim">made their profile private</span><span></span><button class="mini-btn" data-frdel="${esc(f.name)}">REMOVE</button></div>`;
          const set = new Set(f.found.map(id => MOVED[id] || id)), n = entries.filter(e => set.has(e.id)).length, they = entries.filter(e => set.has(e.id) && !mine.has(e.id)).length, you = entries.filter(e => mine.has(e.id) && !set.has(e.id)).length;
          return `<div class="frrow"><b>${esc(f.name)}${adminTag(f.name)}</b><span>${n} / ${entries.length} found ${pbar(n, entries.length)}</span><span class="dim">has ${they} you don't · you have ${you} they don't</span>
            <span class="frbtns"><button class="mini-btn" data-frview="${esc(f.name)}">VIEW</button><button class="mini-btn" data-frcmp="${esc(f.name)}" title="Show their finds as badges on your tiles">COMPARE</button><button class="mini-btn" data-frdel="${esc(f.name)}">REMOVE</button></span></div>`;
        }).join("")}</div>` : `<p class="dim">No friends added yet. Ask a friend for their account name (they need a public profile).</p>`}`;
    const sc = lbScopes(), cur = sc.find(x => x[0] === board.scope) || sc[0], total = countOf(cur[2])[1];
    const me = acc && acc.name ? acc.name.toLowerCase() : "";
    const rows = (board.rows || []).map((r, i) => `<tr class="${r.name.toLowerCase() === me ? "me" : ""}"><td>${i + 1}</td><td><button class="linkish" data-frview="${esc(r.name)}">${esc(r.name)}</button>${adminTag(r.name)}</td><td>${r.n}</td><td>${total ? Math.round(r.n / total * 100) : 0}%</td></tr>`).join("");
    screen.innerHTML = `<div class="results players">
      <h3 class="ph3">FRIENDS //</h3>${fr}
      ${activityHTML()}
      <h3 class="ph3">LEADERBOARD //</h3>
      <div class="lbbar"><select data-lbscope>${sc.map(([p, n]) => `<option value="${esc(p)}"${p === board.scope ? " selected" : ""}>${esc(n)}</option>`).join("")}</select><span class="dim">Players with a public profile. Updates every few minutes.</span></div>
      ${board.msg ? `<div class="msg" style="color:#ff8a7a">${esc(board.msg)}</div>` : ""}
      ${rows ? `<table class="ammotab lbtab"><thead><tr><th>#</th><th>PLAYER</th><th>FOUND</th><th>OF ${total}</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="dim">Nobody on the board yet.</p>'}
    </div>`;
    const f = $("#addFriend");
    if (f) f.onsubmit = async ev => {
      ev.preventDefault(); const n = $("#friendName").value.trim(); if (!n) return;
      const [st, r] = await api("POST", "/api/friends", { name: n }).catch(() => [0, { error: "Couldn't reach the server." }]);
      if (st === 201 || st === 200) { friendsMsg = ""; play("confirm"); toast(`Added ${r.name}.`); loadFriends(); } else { friendsMsg = r.error || "Couldn't add them."; play("warn"); keepScroll(render); }
    };
  }

  /* =====================================================================
     ADMIN: submissions + publishing info (only for names in the Worker's ADMINS)
     ===================================================================== */
  let adm = { status: "new", rows: null, counts: {}, msg: "", edit: null, announce: false, changes: null, blocks: null, ann: null };
  async function checkAdmin() {
    if (!API || !acc) { setAdmin(false); return; }
    try { const [st, r] = await api("GET", "/api/admin/check"); adm.announce = !!(r && r.announce); setAdmin(st === 200 && r.admin); } catch { /* keep */ }
  }
  function setAdmin(on) {
    const want = ["profile", "cloud", "manual", "settings", "community", ...(API ? ["players"] : []), ...(on ? ["admin"] : [])];
    if (want.join() !== BOTTOM_TABS.join()) { BOTTOM_TABS = want; if (!on && ui.tab === "admin") ui.tab = "community"; renderTabs(); }
  }
  async function loadAdmin() {
    if (adm.status === "history") { try { const [st, r] = await api("GET", "/api/admin/changes"); adm.changes = st === 200 ? r : []; adm.msg = st === 200 ? "" : r.error || "Couldn't load."; } catch { adm.msg = "Couldn't reach the server."; } if (ui.tab === "admin") keepScroll(render); return; }
    if (adm.status === "blocked") { try { const [st, r] = await api("GET", "/api/admin/blocks"); adm.blocks = st === 200 ? r : []; adm.msg = st === 200 ? "" : r.error || "Couldn't load."; } catch { adm.msg = "Couldn't reach the server."; } if (ui.tab === "admin") keepScroll(render); return; }
    try { const [st, r] = await api("GET", "/api/admin/submissions?status=" + adm.status); if (st === 200) { adm.rows = r.rows; adm.counts = r.counts || {}; adm.msg = ""; } else adm.msg = r.error || "Couldn't load."; }
    catch { adm.msg = "Couldn't reach the server."; }
    if (ui.tab === "admin") keepScroll(render);
  }
  const safeLink = u => /^https?:\/\//i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : esc(u);
  const statsToText = st => Object.entries(st || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
  function textToStats(t) { const o = {}; String(t).split(/\n/).forEach(l => { const m = l.match(/^\s*([^:]{1,40}?)\s*:\s*(.+?)\s*$/); if (m) o[m[1].toUpperCase()] = m[2]; }); return o; }
  let imgRowN = 0;
  const imgRowHTML = u => { const k = "admImg" + (imgRowN++); return `<div class="imgitem"><div class="imgrow"><input id="${k}" data-admimgi value="${esc(u)}" placeholder="https://">${upBtn("#" + k)}<button type="button" class="mini-btn" data-admimgdel title="Remove this picture">✕</button></div><img class="subimg" data-imgprev="#${k}" src="${esc(u)}" alt=""${u ? "" : " hidden"}></div>`; };
  const upBtn = target => serverInfo.uploads ? `<label class="mini-btn upbtn">UPLOAD…<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-admupload='${target}' hidden></label>` : "";
  const isImgLink = u => /^https?:\/\/\S+(\/img\/\S+|\.(png|jpe?g|webp|gif))(\?\S*)?$/i.test(u || "");
  const updateFieldHTML = v => `<label>ADDED IN UPDATE <small>optional, e.g. "Winter 2026": tagged entries get a NEW badge and a filter on WHAT'S LEFT</small><input id="admUpdate" list="admUpdList" maxlength="40" value="${esc(v)}"><datalist id="admUpdList">${updateTags().map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>`;
  function addEditorHTML() {
    const a = adm.edit.add, sec = a.section || "tools";
    const groups = SEC_DATA[sec]().map(g => g.name);
    if (!groups.includes(a.group)) a.group = groups[0];
    const g = SEC_DATA[sec]().find(x => x.name === a.group);
    const slots = (g.items || []).filter(e => e.unknown);
    return `<div class="dbox admedit"><div class="dhead">Add a new entry${adm.edit.sub ? ` (from submission #${adm.edit.sub})` : ""}</div><div class="dform addform">
      <div class="frow"><label>SECTION <select data-admadd="section">${[["tools", "TOOLS"], ["bio", "BIOGRAPHY"], ["docs", "DOCUMENTS"]].map(([v, n]) => `<option value="${v}"${v === sec ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>${sec === "tools" ? "CATEGORY" : "GROUP"} <select data-admadd="group">${groups.map(n => `<option${n === a.group ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        ${sec === "tools" ? `<label>TIER <input type="number" min="1" max="9" data-admadd="tier" value="${esc(a.tier || "")}"></label>` : ""}</div>
      <label>NAME <small>exactly as the PDA shows it</small><input data-admadd="name" maxlength="80" value="${esc(a.name || "")}"></label>
      ${slots.length ? `<label>FILLS A ??? SLOT? <small>pick one if this is one of the unknown entries, so the total stays right</small><select data-admadd="replace"><option value="">No, it's an extra entry</option>${slots.map(e => `<option value="${esc(e.id)}"${e.id === a.replace ? " selected" : ""}>??? in ${esc(e.group)}${e.tier ? " tier " + e.tier : ""}</option>`).join("")}</select></label>` : ""}
      ${sec === "tools" ? `<label>STATS <small>one per line, e.g. STRENGTH: 1.2x (optional)</small><textarea data-admadd="stats" rows="6">${esc(a.stats || "")}</textarea>
        <label>COMMENT</label><textarea data-admadd="comment" rows="4">${esc(a.comment || "")}</textarea>`
      : `<label>DESCRIPTION</label><textarea data-admadd="desc" rows="5">${esc(a.desc || "")}</textarea>
        <label>PICTURE <small>upload one, or paste any https:// image link</small></label><div class="imgrow"><input data-admadd="img" value="${esc(a.img || "")}" placeholder="https://">${upBtn('[data-admadd="img"]')}</div><img class="subimg" data-imgprev='[data-admadd="img"]' src="${esc(a.img || "")}" alt=""${a.img ? "" : " hidden"}>`}
      <label>ADDED IN UPDATE <small>optional</small><input data-admadd="update" list="admUpdList" maxlength="40" value="${esc(a.update || "")}"><datalist id="admUpdList">${updateTags().map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>
      <div class="btnrow"><button class="pbtn" id="admAddGo">ADD ENTRY${adm.edit.sub ? " + MARK DONE" : ""}</button><button class="pbtn" id="admCancel">CANCEL</button></div>
      <p class="dim">The page reloads after adding so the new entry shows up. It appears for everyone within a minute.</p>
    </div></div>`;
  }
  const entryName = id => { const e = findEntry(id); return e ? e.name : id.split("|").pop(); };
  function changeSummary(c) {
    const a = c.after ? JSON.parse(c.after) : null, b = c.before ? JSON.parse(c.before) : null, src = a || b || {};
    const parts = [];
    if (src.add) parts.push("new entry");
    ["stats", "comment", "desc", "tier", "update", "imgs", "img"].forEach(k => { if (JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k])) parts.push({ stats: "stats", comment: "comment", desc: "description", tier: "tier", update: "update tag", imgs: "pictures", img: "pictures" }[k]); });
    return [...new Set(parts)].join(", ") || "no visible change";
  }
  function historyHTML() {
    if (adm.changes === null) { adm.changes = []; loadAdmin(); }
    if (!adm.changes.length) return '<p class="dim">No changes yet. Everything published, edited, removed or undone shows up here.</p>';
    return `<div class="frlist hist">${adm.changes.map(c => `<div class="frrow"><b>${esc(entryName(c.entry))}</b><span>${esc(c.what)} <span class="dim">(${esc(changeSummary(c))})</span></span><span class="dim">${esc(c.by)} · ${esc(ago(c.t * 1000))}</span><span class="frbtns"><button class="mini-btn" data-admundo="${c.id}" title="Put this entry back the way it was before this change">UNDO</button></span></div>`).join("")}</div>`;
  }
  function blocksHTML() {
    if (adm.blocks === null) { adm.blocks = []; loadAdmin(); }
    if (!adm.blocks.length) return '<p class="dim">Nobody is blocked. Use BLOCK SENDER on a submission to stop someone spamming.</p>';
    return `<div class="frlist">${adm.blocks.map(x => `<div class="frrow"><b>${x.account ? esc(x.account) : "anonymous sender"}</b><span class="dim">${x.byip ? "blocked by connection" : ""}${x.byip && x.account ? " + " : ""}${x.account ? "account" : ""}${x.note ? " · " + esc(x.note) : ""}</span><span class="dim">by ${esc(x.by)} · ${esc(ago(x.created * 1000))}</span><span class="frbtns"><button class="mini-btn" data-admunblock="${x.id}">UNBLOCK</button></span></div>`).join("")}</div>`;
  }
  function announceHTML() {
    if (!adm.ann) return "";
    const tags = updateTags(), upd = adm.ann.update || tags[0] || "";
    const names = upd ? entries.concat(people).filter(e => e.update === upd).map(e => e.name).filter((n, i, a) => a.indexOf(n) === i) : [];
    return `<div class="dbox admedit"><div class="dhead">Announce on Discord</div><div class="dform">
      ${tags.length ? `<label>UPDATE <select data-annupd>${tags.map(x => `<option${x === upd ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label>MESSAGE <small>optional, shown above the list</small><textarea id="annMsg" rows="3" maxlength="1500">${esc(adm.ann.msg || "")}</textarea></label>
      <p class="dim">Will list ${names.length} entr${names.length === 1 ? "y" : "ies"}: ${esc(names.join(", ")) || "none tagged yet"}</p>
      <div class="btnrow"><button class="pbtn" id="annGo"${names.length ? "" : " disabled"}>POST TO DISCORD</button><button class="pbtn" id="annCancel">CANCEL</button></div>`
      : `<p class="dim">Tag entries with an update first (ADDED IN UPDATE in the editor). Then you can post the list here.</p><div class="btnrow"><button class="pbtn" id="annCancel">CLOSE</button></div>`}
    </div></div>`;
  }
  function readAddForm() { if (!adm.edit || !adm.edit.add) return; screen.querySelectorAll("[data-admadd]").forEach(el => { adm.edit.add[el.dataset.admadd] = el.value; }); }
  function adminEditorHTML() {
    const ed = adm.edit; if (!ed) return "";
    if (ed.add) return addEditorHTML();
    const e = ed.entry && findEntry(ed.entry);
    const items = entries.filter(x => !x.unknown).map(x => ({ v: x.id, label: x.name, group: { tools: x.group, bio: "BIOGRAPHY", docs: "DOCUMENTS" }[x.section] }));
    const isTool = e && e.section === "tools", isPerson = e && e.section === "bio";
    const target = isPerson && e.isCard ? e.card.members[0] : e;
    const pub = e && overrides[e.id];
    return `<div class="dbox admedit"><div class="dhead">Publish info${ed.sub ? ` (from submission #${ed.sub})` : ""}</div><div class="dform">
      <label>ENTRY</label>${pickerHTML("admentry", { items, placeholder: e ? `${e.name}  (type to change)` : "Type the entry this is for…", onPick: v => { adm.edit.entry = v; keepScroll(render); } })}
      ${e ? `${isTool ? `<label>STATS <small>one per line, e.g. STRENGTH: 1.2x · lines you leave out keep their old value</small><textarea id="admStats" rows="10">${esc(statsToText(e.stats))}</textarea>
          <label>COMMENT</label><textarea id="admComment" rows="5">${esc(e.comment || "")}</textarea>
          <label>TIER <input type="number" id="admTier" min="1" max="9" value="${esc(e.tier)}"></label>`
        : `<label>DESCRIPTION</label><textarea id="admDesc" rows="7">${esc((target && (target.desc || DESC[target.name])) || DESC[e.name] || "")}</textarea>
          <label>PICTURES <small>the first one shows on the tile; upload, or paste https:// image links</small></label>
          <div id="admImgs">${(() => { const cur = imagesOf(target, target && target.card).map(x => x.src); const l = [...cur]; if (ed.img && !l.includes(ed.img)) l.push(ed.img); return (l.length ? l : [""]).map(u => imgRowHTML(u)).join(""); })()}</div>
          <button type="button" class="mini-btn" data-admimgadd>+ ANOTHER PICTURE</button>`}
        ${updateFieldHTML(pub && pub.update || e.update || "")}
        <div class="btnrow"><button class="pbtn" id="admPublish">PUBLISH${ed.sub ? " + MARK DONE" : ""}</button>${pub ? '<button class="pbtn danger" id="admUnpub">REMOVE PUBLISHED INFO</button>' : ""}<button class="pbtn" id="admCancel">CANCEL</button></div>
        <p class="dim">Published info shows on everyone's site within a minute. It's stored on your server, separate from data.js.</p>` : ""}
    </div></div>`;
  }
  function renderAdmin() {
    if (!API || !acc) { screen.innerHTML = '<div class="results"><p class="none">Log in with an admin account.</p></div>'; return; }
    if (adm.rows === null) { adm.rows = []; loadAdmin(); }
    const st = ["new", "done", "rejected"];
    const list = (adm.rows || []).map(r => {
      const e = r.entry && entries.find(x => x.name.toLowerCase() === r.entry.toLowerCase());
      return `<div class="subcard"><div class="subhead"><b>#${r.id} · ${esc(r.kind)}${r.entry ? ": " + esc(r.entry) : ""}</b><span class="dim">${esc(r.who || "anonymous")}${r.account ? ` (account ${esc(r.account)})` : ""} · ${new Date(r.created * 1000).toLocaleString()}</span></div>
        ${r.text ? `<div class="subtext">${esc(r.text)}</div>` : ""}${r.link ? `<div class="sublink">${safeLink(r.link)}</div>${isImgLink(r.link) ? `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer"><img class="subimg" src="${esc(r.link)}" alt="" loading="lazy"></a>` : ""}` : ""}
        <input class="admnote" data-admnoteid="${r.id}" maxlength="300" value="${esc(r.note || "")}" placeholder="${r.account ? `Note for ${esc(r.account)}, shown on their SUBMIT tab (optional, e.g. why it wasn't added)` : "Private note (they sent it without an account, so they won't see it)"}">
        <div class="btnrow"><button class="mini-btn go" data-admedit="${r.id}" data-admentry="${esc(e ? e.id : "")}" data-admimg="${isImgLink(r.link) ? esc(r.link) : ""}">PUBLISH INFO…</button><button class="mini-btn go" data-admaddnew="${r.id}" data-admname="${esc(e ? "" : r.entry || "")}">ADD AS NEW ENTRY…</button>${r.status !== "done" ? `<button class="mini-btn" data-admst="done" data-admid="${r.id}">DONE</button>` : ""}${r.status !== "rejected" ? `<button class="mini-btn" data-admst="rejected" data-admid="${r.id}">REJECT</button>` : ""}${r.status !== "new" ? `<button class="mini-btn" data-admst="new" data-admid="${r.id}">BACK TO NEW</button>` : ""}<button class="mini-btn danger" data-admdel="${r.id}">DELETE</button><button class="mini-btn danger" data-admblock="${r.id}" title="Stop this person sending anything else, and reject the rest of what they sent">BLOCK SENDER</button></div></div>`;
    }).join("");
    const pubs = Object.entries(overrides).map(([id, o]) => { const e = findEntry(id); return { id, name: e ? e.name : (o.add ? o.add.name : id), group: e ? e.group : (o.add ? o.add.group : ""), added: !!o.add, update: o.update, ok: !!e }; })
      .sort((a, b) => collator.compare(a.name, b.name));
    screen.innerHTML = `<div class="results admin">
      <div class="leftsum"><b>ADMIN</b> · submissions sent through SUBMIT <span class="leftbtns">${adm.announce ? `<button class="mini-btn" data-admann>ANNOUNCE ON DISCORD…</button>` : ""}<button class="mini-btn" data-admaddnew="">ADD NEW ENTRY…</button><button class="mini-btn" data-admnew>EDIT ANY ENTRY…</button><button class="mini-btn" data-admreload>REFRESH</button></span></div>
      ${adminEditorHTML()}
      ${announceHTML()}
      <div class="chips">${st.map(x => `<button class="chip-btn" data-admtab="${x}" aria-pressed="${adm.status === x}">${x.toUpperCase()} ${adm.counts[x] || 0}</button>`).join("")}<button class="chip-btn" data-admtab="history" aria-pressed="${adm.status === "history"}">CHANGE HISTORY</button><button class="chip-btn" data-admtab="blocked" aria-pressed="${adm.status === "blocked"}">BLOCKED</button></div>
      ${adm.msg ? `<div class="msg" style="color:#ff8a7a">${esc(adm.msg)}</div>` : ""}
      ${adm.status === "history" ? historyHTML() : adm.status === "blocked" ? blocksHTML() : (list || `<p class="dim">Nothing here.</p>`)}
      <h3 class="ph3">PUBLISHED //</h3>
      ${pubs.length ? `<div class="frlist">${pubs.map(e => `<div class="frrow"><b>${esc(e.name)}</b><span class="dim">${esc(e.group)}${e.added ? " · NEW ENTRY" : ""}${e.update ? " · " + esc(e.update) : ""}${e.ok ? "" : " · not showing (category not found)"}</span><span></span><span class="frbtns"><button class="mini-btn" data-admedit="" data-admentry="${esc(e.id)}">EDIT</button></span></div>`).join("")}</div>` : '<p class="dim">Nothing published yet.</p>'}
    </div>`;
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("admCancel", () => { adm.edit = null; play("back"); keepScroll(render); });
    on("admUnpub", async () => {
      const id = adm.edit.entry; const [st] = await api("DELETE", "/api/admin/overrides/" + encodeURIComponent(id)).catch(() => [0]);
      if (st === 200) { const wasAdd = overrides[id] && overrides[id].add; delete overrides[id]; save("pda-overrides-v1", overrides); if (wasAdd) { location.reload(); return; } applyOverrides(overrides); toast("Removed."); adm.edit = null; keepScroll(render); } else toast("Couldn't remove it.");
    });
    on("admPublish", async () => {
      const e = findEntry(adm.edit.entry); if (!e) return;
      const data = {};
      if (e.section === "tools") { data.stats = textToStats($("#admStats").value); data.comment = $("#admComment").value; const t = +$("#admTier").value; if (t && t !== e.tier) data.tier = t; }
      else {
        data.desc = $("#admDesc").value;
        const ims = [...screen.querySelectorAll("[data-admimgi]")].map(x => x.value.trim()).filter(Boolean);
        if (ims.some(u => !/^(https?:\/\/|images\/)/.test(u))) { toast("Picture links have to start with https://"); play("warn"); return; }
        const orig = imagesOf(origInfo.has(e) ? { img: origInfo.get(e).img, imgs: origInfo.get(e).imgs } : e).map(x => x.src);
        if (ims.length && JSON.stringify(ims) !== JSON.stringify(orig)) data.imgs = ims;
      }
      const up = $("#admUpdate").value.trim(); if (up) data.update = up;
      if (overrides[e.id] && overrides[e.id].add) data.add = overrides[e.id].add;      // keep it an added entry
      const [st, r] = await api("PUT", "/api/admin/overrides/" + encodeURIComponent(e.id), { data }).catch(() => [0, {}]);
      if (st !== 200) { toast(r.error || "Couldn't publish."); play("warn"); return; }
      if (adm.edit.sub) await api("PUT", "/api/admin/submissions/" + adm.edit.sub, { status: "done" }).catch(() => {});
      overrides[e.id] = { ...r.data, updated: Math.floor(Date.now() / 1000) }; save("pda-overrides-v1", overrides); applyOverrides(overrides);
      play("confirm"); toast(`Published for ${e.name}.`); adm.edit = null; loadAdmin();
    });
    on("annCancel", () => { adm.ann = null; play("back"); keepScroll(render); });
    on("annGo", async () => {
      const upd = (screen.querySelector("[data-annupd]") || {}).value || "", msg = $("#annMsg").value;
      const names = entries.concat(people).filter(e => e.update === upd).map(e => e.name).filter((n, i, a) => a.indexOf(n) === i);
      const [st, r] = await api("POST", "/api/admin/announce", { update: upd, names, message: msg }).catch(() => [0, {}]);
      if (st !== 200) { toast(r.error || "Couldn't post it."); play("warn"); return; }
      adm.ann = null; play("confirm"); toast("Posted to Discord."); keepScroll(render);
    });
    on("admAddGo", async () => {
      readAddForm(); const a = adm.edit.add, sec = a.section || "tools";
      const name = (a.name || "").trim(), tier = +a.tier;
      if (!name || name === "???") { toast("Type the entry's name."); play("warn"); return; }
      if (sec === "tools" && !(tier >= 1 && tier <= 9) && !a.replace) { toast("Pick a tier from 1 to 9."); play("warn"); return; }
      const g = SEC_DATA[sec]().find(x => x.name === a.group);
      const id = `${SEC_LETTER[sec]}|${slug(g.name)}|${slug(name)}`;
      if (findEntry(id)) { toast(`${name} is already in ${g.name}. Use EDIT ANY ENTRY to change it.`); play("warn"); return; }
      const slot = a.replace && findEntry(a.replace);
      const data = { add: { section: sec, group: g.name, name, tier: sec === "tools" ? (slot ? slot.tier : tier) : undefined, replace: a.replace || undefined } };
      if (sec === "tools") { const st = textToStats(a.stats || ""); if (Object.keys(st).length) data.stats = st; if ((a.comment || "").trim()) data.comment = a.comment; }
      else { if ((a.desc || "").trim()) data.desc = a.desc; if ((a.img || "").trim()) { if (!/^https?:\/\//.test(a.img.trim())) { toast("The picture link has to start with https://"); play("warn"); return; } data.imgs = [a.img.trim()]; } }
      if ((a.update || "").trim()) data.update = a.update.trim();
      const [st, r] = await api("PUT", "/api/admin/overrides/" + encodeURIComponent(id), { data }).catch(() => [0, {}]);
      if (st !== 200) { toast(r.error || "Couldn't add it."); play("warn"); return; }
      if (adm.edit.sub) await api("PUT", "/api/admin/submissions/" + adm.edit.sub, { status: "done" }).catch(() => {});
      overrides[id] = { ...r.data, updated: Math.floor(Date.now() / 1000) }; save("pda-overrides-v1", overrides);
      play("confirm"); toast(`Added ${name}. Reloading…`); setTimeout(() => location.reload(), 600);
    });
  }

  /* first-visit tour */
  const TOUR = [
    ["Welcome to PDA.exe", "A checklist for everything in the Once A Normal City PDA: weapons, people and documents. Here's the 30-second version."],
    ["Mark what you've found", "Hover over (or tap) any tile and press its <b>&#9733; star</b> to mark it found. Click the tile itself to open its page with stats and comments."],
    ["Unlock a whole tier at once", "Click anywhere on a <b>TIER</b> bar (or a Biography / Documents tab you're already on) to mark everything in it as found. It asks first, and clicking a finished bar again locks it all."],
    ["Search marks things too", "Type a name in the search bar and press <b>ENTER</b> to mark the top match as found, without leaving the page. Made a mistake? <b>Ctrl+Z</b> undoes it."],
    ["See what's left", "<b>WHAT'S LEFT</b> lists everything you're still missing. <b>MISSING</b> next to the search bar hides what you already have."],
    ["Keep a backup", "Your progress lives only in this browser. Download a backup in <b>CLOUD</b> (or from the reminder bar) so you never lose it. That's it, have fun!"]
  ];
  function startTour(i = 0) {
    let el = $("#tour"); if (!el) { el = document.createElement("div"); el.id = "tour"; document.body.appendChild(el); }
    const [h, p] = TOUR[i];
    el.innerHTML = `<div class="tourbox" role="dialog" aria-label="${esc(h)}"><div class="dhead">${esc(h)}<span>${i + 1} / ${TOUR.length}</span></div>
      <div class="tourbody"><p>${p}</p></div>
      <div class="tourbtns"><button class="mini-btn" data-tourskip>${i === TOUR.length - 1 ? "CLOSE" : "SKIP"}</button>${i ? `<button class="mini-btn" data-tourgo="${i - 1}">BACK</button>` : ""}${i < TOUR.length - 1 ? `<button class="mini-btn go" data-tourgo="${i + 1}">NEXT</button>` : `<button class="mini-btn go" data-tourskip>GOT IT</button>`}</div></div>`;
    el.hidden = false;
  }
  document.addEventListener("click", e => {
    const aq = e.target.closest("[data-admquick]");
    if (aq && amAdmin()) { play("click"); adm.edit = { entry: aq.dataset.admquick }; ui.tab = "admin"; detail = null; cancelTier(); persistUI(); if (query) clearSearch(false); renderTabs(); render(); const sc = screen.querySelector(".results"); if (sc) sc.scrollTop = 0; return; }
    const g = e.target.closest("[data-tourgo]"); if (g) { play("click"); startTour(+g.dataset.tourgo); return; }
    if (e.target.closest("[data-tourskip]") || e.target.id === "tour") { const el = $("#tour"); if (el) el.hidden = true; settings.tourDone = true; save(KEY_SET, settings); play("back"); }
  });
  document.addEventListener("keydown", e => { const el = $("#tour"); if (el && !el.hidden && e.key === "Escape") { el.hidden = true; settings.tourDone = true; save(KEY_SET, settings); } });

  /* a bar that stays put once you've marked 25+ things without backing up */
  const KEY_SNOOZE = pk("pda-backup-snooze-v1");
  function backupNag() {
    const el = $("#backupbar"); if (!el) return;
    const snooze = load(KEY_SNOOZE, 0);
    const show = !viewOnly && sinceBackup >= 25 && sinceBackup >= snooze;
    el.hidden = !show;
    if (show) el.innerHTML = `<span>&#9888; You've marked <b>${sinceBackup}</b> things since your last backup. Progress only lives in this browser.</span><button class="mini-btn go" data-bkdl>DOWNLOAD BACKUP</button><button class="mini-btn" data-bklater title="Remind me after 25 more">LATER</button>`;
  }
  document.addEventListener("click", e => {
    if (e.target.closest("[data-bkdl]")) { doExport(); toast("Backup downloaded."); backupNag(); }
    else if (e.target.closest("[data-bklater]")) { save(KEY_SNOOZE, sinceBackup + 25); play("back"); backupNag(); }
  });

  function renderCloud(msg = "", bad = false) {
    screen.innerHTML = `
      <div class="cloud">
        <div class="dhead">Download Entries<span style="display:flex;width:18px">${I.download}</span></div>
        <div class="cloud-body">
          <p>Your checkmarks are saved in this browser only. Download a backup file to keep them safe or to move them to another device or browser, then upload it there.</p>
          <div class="btnrow"><button class="pbtn" id="exp">${I.download} DOWNLOAD BACKUP</button>
          <button class="pbtn" id="imp">${I.upload} UPLOAD BACKUP</button></div>
          <div class="msg" id="cmsg" style="${bad ? "color:#ff7a7a" : ""}">${esc(msg)}</div>
          ${importHTML()}
          ${accountHTML()}
          <h4>MARK A LIST AS FOUND</h4>
          <p>Paste names, one per line (from your notes, a friend, or a COPY AS TEXT list). Anything that matches an entry gets marked found. You can undo it with Ctrl+Z.</p>
          <textarea id="bulkIn" class="bulkin" rows="6" placeholder="AK74&#10;Plate Carrier Vest&#10;10rnd ADV Mag&#10;..."></textarea>
          <div class="btnrow"><button class="pbtn" id="bulkGo">MARK FOUND</button></div>
          <div class="msg" id="bulkMsg"></div>
          <h4>SHARE YOUR PDA</h4>
          <p>A link that shows your checklist to anyone, read-only. It doesn't change as you find more, so send a new one later.</p>
          <div class="btnrow"><input id="shareOut" readonly value="${esc(shareLink())}"><button class="pbtn" id="copyShare">${I.share} COPY LINK</button></div>
          <h4>COMPARE WITH A FRIEND</h4>
          <p>Paste a friend's share link to see what they have that you don't. Their entries get a small badge on your tiles.</p>
          <div class="btnrow"><input id="friendIn" placeholder="paste their link here" value=""><button class="pbtn" id="doCompare">COMPARE</button>${friend ? '<button class="pbtn danger" id="stopCompare">STOP COMPARING</button>' : ""}</div>
          ${compareHTML()}
        </div>
      </div>`;
    $("#exp").onclick = () => { play("click"); doExport(); $("#cmsg").textContent = "Backup downloaded."; };
    wireAccount(); wireImport();
    $("#bulkGo").onclick = () => {
      const r = bulkMark($("#bulkIn").value);
      if (!r) return;
      $("#bulkMsg").innerHTML = `Marked <b>${r.marked}</b> new${r.already ? ` · ${r.already} were already found` : ""}${r.miss.length ? `<br><span style="color:#ff9a7a">No match for ${r.miss.length}:</span> ${r.miss.slice(0, 40).map(esc).join(", ")}${r.miss.length > 40 ? "…" : ""}` : ""}`;
    };
    $("#imp").onclick = () => { play("click"); $("#importFile").click(); };
    $("#copyShare").onclick = async () => {
      play("click");
      const inp = $("#shareOut");
      try { await navigator.clipboard.writeText(inp.value); toast("Share link copied."); }
      catch { inp.select(); try { document.execCommand("copy"); } catch { /* ignore */ } toast("Link selected. Press Ctrl+C to copy."); }
    };
    $("#doCompare").onclick = () => {
      const f = parseShare($("#friendIn").value);
      if (!f) { play("warn"); toast("That doesn't look like a PDA share link."); return; }
      friend = f; save(KEY_FRIEND, friend); play("confirm"); render();
    };
    const stop = $("#stopCompare"); if (stop) stop.onclick = () => { friend = null; save(KEY_FRIEND, null); play("back"); render(); };
  }
  $("#importFile").addEventListener("change", async ev => {
    const file = ev.target.files[0]; ev.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.found !== "object") throw new Error();
      found = {}; Object.keys(data.found).forEach(k => { if (data.found[k]) found[MOVED[k] || k] = 1; });
      if (typeof data.user === "string") { user = data.user; save(KEY_USER, user); }
      if (data.favs && typeof data.favs === "object") { favs = data.favs; save(KEY_FAV, favs); }
      if (data.notes && typeof data.notes === "object") { notes = data.notes; save(KEY_NOTES, notes); }
      if (data.counts && typeof data.counts === "object") { counts = data.counts; save(KEY_COUNTS, counts); }
      if (data.loadout && Array.isArray(data.loadout.items)) { loadout = data.loadout; save(KEY_LOAD, loadout); }
      if (Array.isArray(data.log)) { history_ = data.log.slice(0, 60); save(KEY_LOG, history_); }
      undoStack.length = 0; sinceBackup = 0; save(KEY_SINCE, 0);
      save(KEY_FOUND, found); updateCount(); scheduleSync(); play("confirm");
      renderCloud(`Restored ${Object.keys(found).length} entries.`);
    } catch {
      play("warn");
      renderCloud("That file isn't a PDA backup.", true);
    }
  });

  function compareHTML() {
    if (!friend) return "";
    const nm = friend.name || "Your friend";
    const theyHave = sortEntries(entries.filter(e => friend.set[e.id] && !found[e.id]));
    const youHave = sortEntries(entries.filter(e => found[e.id] && !friend.set[e.id]));
    const both = entries.filter(e => found[e.id] && friend.set[e.id]).length;
    return `<div class="compare">
      <div class="leftsum">Comparing with <b>${esc(nm)}</b>: you both have ${both} · ${esc(nm)} has ${Object.keys(friend.set).length} / ${entries.length}</div>
      <div class="sgroup"><div class="tier-head">${esc(nm.toUpperCase())} HAS, YOU DON'T<small>${theyHave.length}</small></div>${theyHave.map(e => resultHTML(e)).join("") || '<p class="cat-note">Nothing. You have everything they do.</p>'}</div>
      <div class="sgroup"><div class="tier-head">YOU HAVE, ${esc(nm.toUpperCase())} DOESN'T<small>${youHave.length}</small></div>${youHave.map(e => resultHTML(e)).join("") || '<p class="cat-note">Nothing.</p>'}</div>
    </div>`;
  }

  function openIssue(title, body) {
    const url = `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body + "\n\n_Sent from the PDA tracker._")}`;
    window.open(url, "_blank", "noopener");
  }
  function openSuggest(e, kind) {
    if (!e) return;
    const nm = e.unknown ? `${e.group}${e.tier ? " tier " + e.tier : ""} ??? (unknown)` : e.name;
    draft = Object.assign({}, draft, { entry: nm, kind: kind || "Wrong info", text: draft.entry === nm ? draft.text : "" });
    formMsg = null; detail = null; ui.tab = "community"; persistUI(); renderTabs(); render();
    const ta = screen.querySelector("[name=ctext]"); if (ta) ta.focus();
  }
  function changelogHTML() {
    const log = (typeof PDA_CHANGELOG === "object" && PDA_CHANGELOG) || [];
    if (!log.length) return "";
    return `<h3>-=-=- CHANGELOG -=-=-</h3><div class="changelog">${log.map(b => `<div class="clb"><b>${esc(b.date)}</b><ul>${(b.items || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>`;
  }
  /* =====================================================================
     SUBMIT tab: contribution form + changelog
     ===================================================================== */
  const FORM = (typeof PDA_FORM === "object" && PDA_FORM) || {};
  const webhookURL = (() => {
    if (FORM.discordWebhook) return FORM.discordWebhook;
    const h = FORM.hook; if (!h || !h.p) return "";
    try { const b = atob(h.p.join("")); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b.charCodeAt(i) ^ h.k[i % h.k.length]); return [...s].reverse().join(""); }
    catch { return ""; }
  })();
  const hasDiscord = () => /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhookURL);
  const hasW3F = () => !!(FORM.web3formsKey && FORM.web3formsKey.trim());
  const hasServer = () => !!API;
  const formLive = () => hasServer() || hasDiscord() || hasW3F();
  async function sendServer(d, botcheck) {
    const [st, r] = await api("POST", "/api/submit", { kind: d.kind, entry: d.entry, text: d.text, link: d.link, name: d.name, botcheck });
    if (st !== 200 && st !== 201) { const e = new Error(r.error || "server " + st); e.user = st >= 400 && st < 500; throw e; }   // a "no" from the server (blocked, too many, bad input) is final
  }
  const KIND_COLOR = { "Description": 0x4fd8ff, "Stats": 0xffe14d, "Picture": 0xff79e0, "Missing entry": 0x6cff6c, "Wrong info": 0xff8a3c, "Site bug": 0xff3b3b, "Idea": 0xb48aff };
  const clip = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  async function sendDiscord(d) {
    const e = d.entry && entries.find(x => x.name.toLowerCase() === d.entry.toLowerCase());
    const fields = [{ name: "Type", value: d.kind, inline: true }, { name: "Entry", value: clip(d.entry || "-", 200), inline: true }];
    if (e) fields.push({ name: "Where", value: clip(contextOf(e), 200), inline: true });
    if (d.link) fields.push({ name: "Link", value: clip(d.link, 1000) });
    fields.push({ name: "From", value: clip(d.name || "anonymous", 100), inline: true });
    const res = await fetch(webhookURL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "PDA Tracker",
        // ping only the site owner; anything visitors type can't ping anyone
        content: /^\d{5,25}$/.test(FORM.pingUserId || "") ? `<@${FORM.pingUserId}> new submission` : undefined,
        allowed_mentions: { parse: [], users: /^\d{5,25}$/.test(FORM.pingUserId || "") ? [FORM.pingUserId] : [] },
        embeds: [{ title: clip(`${d.kind}${d.entry ? ": " + d.entry : ""}`, 250), description: clip(d.text || "(no details)", 4000),
          color: KIND_COLOR[d.kind] || 0xe6e18a, fields, footer: { text: "PDA tracker submission" }, timestamp: new Date().toISOString() }]
      })
    });
    if (!res.ok) throw new Error("discord " + res.status);
  }
  async function sendW3F(d) {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: FORM.web3formsKey.trim(), subject: `${FORM.subject || "PDA submission"}: ${d.kind}${d.entry ? " — " + d.entry : ""}`,
        from_name: d.name || "PDA tracker visitor", type: d.kind, entry: d.entry || "-", details: d.text || "-", link: d.link || "-", botcheck: false })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) throw new Error(j.message || res.status);
  }
  let draft = { kind: "Description", entry: "", text: "", link: "", name: "" };
  let pickedFile = null;
  let mySubs = null;
  async function loadMySubs() {
    if (!API || !acc) { mySubs = null; return; }
    try { const [st, r] = await api("GET", "/api/mysubs"); if (st === 200) mySubs = r; } catch { /* offline */ }
    if (ui.tab === "community") keepScroll(render);
  }
  function mySubsHTML() {
    if (!hasServer()) return "";
    if (!acc) return `<p class="cat-note">Log in from the CLOUD tab before sending, and you'll see here when what you sent gets added.</p>`;
    if (mySubs === null) { mySubs = []; loadMySubs(); }
    if (!mySubs.length) return "";
    const st = { new: ["WAITING", "#ffd23a"], done: ["ADDED", "#6cff6c"], rejected: ["NOT ADDED", "#ff7a7a"] };
    return `<h3>-=-=- WHAT YOU SENT -=-=-</h3><div class="frlist mysubs">${mySubs.map(r => `<div class="frrow"><b>${esc(r.kind)}${r.entry ? ": " + esc(r.entry) : ""}</b><span class="dim">${esc(new Date(r.created * 1000).toLocaleDateString())}</span><span class="substat" style="color:${(st[r.status] || st.new)[1]}">${(st[r.status] || st.new)[0]}</span>${r.note ? `<span class="subnote">${esc(r.note)}</span>` : ""}</div>`).join("")}</div>`;
  }
  let formMsg = null;   // { ok, text }
  function contribHTML() {
    const names = [...new Set(entries.filter(e => !e.unknown).map(e => e.name))].sort(collator.compare);
    const kinds = ["Description", "Stats", "Picture", "Missing entry", "Wrong info", "Site bug", "Idea"];
    return `<form class="contrib" autocomplete="off" novalidate>
      <p>Know a description, some stats, a missing weapon, or have a better picture? Send it here${formLive() ? " — no account needed. It goes straight to the site owner, who reviews it and adds it." : ". (This currently opens GitHub, which needs a free account.)"}</p>
      <div class="frow"><label>WHAT IS IT?<select name="ckind">${kinds.map(k => `<option${k === draft.kind ? " selected" : ""}>${k}</option>`).join("")}</select></label>
        <label class="grow">WHICH ENTRY? <small>(optional)</small><input name="centry" list="centries" value="${esc(draft.entry)}" placeholder="start typing a name"><datalist id="centries">${names.map(n => `<option value="${esc(n)}">`).join("")}</datalist></label></div>
      <label>DETAILS<textarea name="ctext" rows="6" placeholder="Paste the description or stats, or describe what's wrong.">${esc(draft.text)}</textarea></label>
      ${hasServer() && serverInfo.uploads ? `<div class="frow upl"><label class="grow">UPLOAD A PICTURE <small>(optional: PNG, JPG, WEBP or GIF, up to 5 MB)</small><input name="cfile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-cfile></label>${pickedFile ? `<span class="dim">${esc(pickedFile.name)} <button type="button" class="mini-btn" data-cfileclear>REMOVE</button></span>` : ""}</div>` : ""}
      <div class="frow"><label class="grow">PICTURE OR VIDEO LINK <small>(optional: Imgur, Discord, YouTube, Google Drive…)</small><input name="clink" type="url" value="${esc(draft.link)}" placeholder="https://"></label>
        <label>YOUR NAME <small>(optional, for credit)</small><input name="cname" maxlength="40" value="${esc(draft.name || user || "")}" placeholder="Roblox name"></label></div>
      <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="btnrow"><button class="pbtn" type="submit" data-contrib>${formLive() ? "SEND" : "OPEN ON GITHUB"}</button>
        ${formMsg ? `<span class="fmsg ${formMsg.ok ? "ok" : "bad"}">${esc(formMsg.text)}</span>` : ""}</div>
    </form>`;
  }
  /* entries the site has no info for yet, so visitors know what to send */
  function helpWanted() {
    const tools = entries.filter(e => e.section === "tools" && !e.unknown && e.group !== "AMMO" && !e.stats && e.comment === undefined);
    const bios = entries.filter(e => e.section === "bio" && !e.unknown);
    const mem = e => (e.card && e.card.members && e.card.members.length) ? e.card.members : [e];
    const noDesc = bios.filter(e => !mem(e).some(m => m.desc || DESC[m.name]) && !DESC[e.name] && !(e.card && e.card.desc));
    const noPic = bios.filter(e => !mem(e).some(m => imagesOf(m).length) && !imagesOf(e, e.card).length);
    const noStats = bios.filter(e => !mem(e).some(m => Object.keys(m.base || {}).length || Object.keys(m.skills || {}).length || (m.loadout || []).length));
    const noWeight = entries.filter(e => e.section === "tools" && !e.unknown && e.group !== "AMMO" && e.stats && e.stats.WEIGHT == null);
    const docs = entries.filter(e => e.section === "docs" && !e.unknown && !e.desc && !imagesOf(e).length);
    const unknown = entries.filter(e => e.unknown);
    return [["UNKNOWN ENTRIES (???)", unknown, "name and info", "Missing entry"], ["WEAPONS & ITEMS WITH NO STATS OR COMMENT", tools, "stats and comment", "Stats"],
            ["WEAPONS MISSING THEIR WEIGHT", noWeight, "weight", "Stats"], ["PEOPLE WITH NO DESCRIPTION", noDesc, "description", "Description"],
            ["PEOPLE WITH NO PICTURE", noPic, "picture", "Picture"], ["PEOPLE WITH NO STATS", noStats, "stats", "Stats"],
            ["DOCUMENTS WITH NO PICTURE OR TEXT", docs, "picture or text", "Picture"]].filter(([, l]) => l.length);
  }
  function helpHTML() {
    const groups = helpWanted();
    if (!groups.length) return "";
    return `<h3>-=-=- HELP WANTED -=-=-</h3>
      <p class="cat-note">The site doesn't have this info yet. If you have one of these in your PDA, press SEND next to it (screenshots or a video link are perfect).</p>
      ${groups.map(([title, list, what, kind]) => `<details class="helpw"><summary>${esc(title)} <small>${list.length}</small></summary><div class="helplist">${sortEntries(list).map(e =>
        `<div class="helprow">${e.unknown ? `<b>???</b>` : `<button class="linkish" data-${{ tools: "open-tool", bio: "open", docs: "open-doc" }[e.section]}="${esc(e.id)}">${esc(e.name)}</button>`}<span class="dim">${esc(e.group)}${e.tier ? " · T" + e.tier : ""}</span><button class="mini-btn" data-suggest="${esc(e.id)}" data-skind="${esc(kind)}" title="Send the ${esc(what)} for ${esc(label(e))}">SEND</button></div>`).join("")}</div></details>`).join("")}`;
  }
  function renderCommunity() {
    const log = (typeof PDA_CHANGELOG === "object" && PDA_CHANGELOG) || [];
    screen.innerHTML = `<div class="manual community">
      <h3>-=-=- SEND IN INFO -=-=-</h3>
      ${contribHTML()}
      ${mySubsHTML()}
      ${helpHTML()}
      ${log.length ? `<h3>-=-=- CHANGELOG -=-=-</h3><div class="changelog">${log.map(b => `<div class="clb"><b>${esc(b.date)}</b><ul>${(b.items || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>` : ""}
    </div>`;
  }
  function readForm(f) {
    draft = { kind: f.ckind.value, entry: f.centry.value.trim(), text: f.ctext.value.trim(), link: f.clink.value.trim(), name: f.cname.value.trim() };
    return draft;
  }
  let sending = false;
  async function submitForm(f) {
    const d = readForm(f);
    if (!d.text && !d.link && !pickedFile) { formMsg = { ok: false, text: "Write some details or add a link first." }; play("warn"); return keepScroll(render); }
    if (!formLive()) {
      openIssue(`[${d.kind}] ${d.entry || "General"}`, `**What:** ${d.kind}\n**Entry:** ${d.entry || "-"}\n${d.link ? `**Link:** ${d.link}\n` : ""}${d.name ? `**From:** ${d.name}\n` : ""}\n${d.text}`);
      return;
    }
    if (sending) return;
    if (Date.now() - (window.__pdaLastSend || 0) < 15000) { formMsg = { ok: false, text: "Just sent one! Wait a few seconds before sending another." }; play("warn"); return keepScroll(render); }
    if (f.botcheck.checked) return;               // spam bot filled the hidden box
    sending = true; formMsg = { ok: true, text: "Sending…" }; keepScroll(render);
    try {
      let sent = false;
      if (pickedFile) {
        if (pickedFile.size > 5 * 1024 * 1024) { const e = new Error("Pictures can be up to 5 MB."); e.user = true; throw e; }
        const url = await uploadPic(pickedFile);
        if (!d.link) d.link = url; else d.text = (d.text ? d.text + "\n\n" : "") + "Uploaded picture: " + url;
      }
      if (hasServer()) { try { await sendServer(d, false); sent = true; } catch (err) { if (err.user || (!hasDiscord() && !hasW3F())) throw err; } }
      if (!sent && hasDiscord()) { try { await sendDiscord(d); sent = true; } catch (err) { if (!hasW3F()) throw err; } }
      if (!sent) await sendW3F(d);
      window.__pdaLastSend = Date.now();
      formMsg = { ok: true, text: "Sent! Thanks — it'll be reviewed and added." };
      draft = { kind: d.kind, entry: "", text: "", link: "", name: d.name }; pickedFile = null; if (acc) loadMySubs();
      play("confirm");
    } catch (err) {
      formMsg = { ok: false, text: err && err.user ? err.message : "Couldn't send right now. Check your connection and try again." };
      play("warn");
    }
    sending = false; keepScroll(render);
  }

  function renderManual() {
    screen.innerHTML = `
      <div class="manual">
        <h3>-=-=- TRACKER GUIDE -=-=-</h3>
        <h4>How do I mark something as found?</h4>
        <p>Hover over a weapon, person or document and press the star in its corner (on a phone it's always showing). Or switch to the checklist view (&#9776; next to the search bar) and tick the boxes. Every stat page has a star too.</p>
        <h4>I marked the wrong thing!</h4>
        <p>Press UNDO on the message at the bottom of the screen, or Ctrl+Z. It works for whole tiers and tabs too.</p>
        <h4>Can I mark lots at once?</h4>
        <p>Mark one entry, then hold Shift and press the star on another: everything between them gets the same state. You can also click a TIER header, or click the Biography/Documents tab you're already on, to unlock the whole thing (it asks "ARE YOU SURE?" first).</p>
        <h4>How do I see only what I'm missing?</h4>
        <p>Use ALL / MISSING / FOUND next to the search bar. The WHAT'S LEFT tab lists every missing entry in the whole PDA in one place.</p>
        <h4>How do I see stats?</h4>
        <p>Click the weapon, person or document. Cards that hold several variants (like Robinson or Rogues) are one unlock; switch between variants with the tabs along the bottom. The arrows next to Preview flip through pictures.</p>
        <h4>Searching</h4>
        <p>Search finds names, and also stats: try "9x19mm", "tier 5" or "suppressor". Narrow it with the WEAPONS / PEOPLE / DOCUMENTS buttons.</p>
        <h4>Favourites and notes</h4>
        <p>Press the &#9829; on any page to add it to USER FAVOURITES on your Profile. The My Notes tab at the bottom of any page is a private notepad for that entry.</p>
        <h4>Sharing and comparing</h4>
        <p>CLOUD gives you a link anyone can open to see your PDA (read-only). Paste a friend's link there to see what they have that you don't.</p>
        <h4>Logging a lot at once</h4>
        <p>On any page, ★ FOUND + NEXT (or N) marks it and opens the next one you're missing in that category. NEXT MISSING (or M) skips ahead without marking. HIDE DONE next to the search bar hides tiers, tabs and categories you've finished.</p>
        <h4>Comparing weapons</h4>
        <p>Press COMPARE + on up to 3 weapon pages, then VIEW on the bar in the corner. The best value in each row is green and the worst is red.</p>
        <h4>Sorting by stats and calibers</h4>
        <p>In TOOLS, use SORT BY and CALIBER above the weapons. The blue CALIBERS button at the bottom of the categories lists every caliber and what fires it.</p>
        <h4>Links, pictures and profiles</h4>
        <p>LINK on any page copies a link straight to it. Click a picture to see it full size. SAVE PROFILES on the Profile tab keep separate checklists (for an alt account, say).</p>
        <h4>Install it like an app</h4>
        <p>On a phone, use your browser's "Add to Home Screen". On a computer, look for the install icon in the address bar. It then works offline too.</p>
        <h4>Will I lose my progress?</h4>
        <p>Progress is saved in this browser. Clearing site data or using a private window will lose it, so use CLOUD to download a backup now and then. The site reminds you after 25 new marks.</p>
        <h3>-=-=- QUICK KEYS -=-=-</h3>
        <div class="k">ARROW KEYS - MOVE BETWEEN ENTRIES</div>
        <div class="k">SPACE - MARK FOUND / MISSING</div>
        <div class="k">ENTER - OPEN</div>
        <div class="k">SHIFT + STAR - MARK A RANGE</div>
        <div class="k">CTRL + Z - UNDO</div>
        <div class="k">/ - SEARCH</div>
        <div class="k">ESC - BACK / CLEAR SEARCH</div>
        <div class="k">&#8592; &#8594; ON A PAGE - NEXT / PREVIOUS PICTURE</div>
        <h4>Sending in info</h4>
        <p>Use the SUBMIT tab (or FIX? on any page) to send descriptions, stats, pictures or bug reports. No account needed. The changelog is on that tab too.</p>
        <h3>-=-=- ABOUT -=-=-</h3>
        <p>A fan-made tracker for Once A Normal City. Not affiliated with the game's developers. Entries marked ??? are ones whose names aren't known yet.</p>
      </div>`;
  }

  function renderSettings() {
    const sw = (key, text) => `
      <div class="srow"><div class="onoff">
        <button class="on" data-set="${key}" data-val="1" aria-pressed="${!!settings[key]}">ON</button>
        <button class="off" data-set="${key}" data-val="0" aria-pressed="${!settings[key]}">OFF</button>
      </div>${text}</div>`;
    const note = t => `<div class="snote">${t}</div>`;
    screen.innerHTML = `
      <div class="settings">
        <h3>Sound</h3>
        ${note("Clicks and beeps copied from the game's PDA.")}
        ${sw("sound", "Sound effects?")}
        ${sw("hoverSound", "Play a sound when hovering over things?")}
        <div class="srow"><input type="range" id="vol" min="0" max="100" step="5" value="${settings.volume}" aria-label="Volume"><span>Volume: <b id="volv">${settings.volume}</b>%</span></div>
        <h3>Display</h3>
        ${note("How locked entries and pages look.")}
        ${sw("lockedNames", "Show names on locked entries?")}
        ${sw("missingPics", "Show pictures of people you haven't found yet?")}
        ${sw("crt", "Old monitor (CRT) effect?")}
        ${sw("light", "Light theme? (easier to read in daylight)")}
        <div class="srow dim">To hide found or missing entries, use the ALL / MISSING / FOUND buttons next to the search bar.</div>
        <h3>Checking off</h3>
        ${note("Safety nets for marking things.")}
        ${sw("confirmUnmark", "Ask before unmarking something?")}
        ${sw("kbMode", "Keyboard mode? (always shows where you are, keeps your place; arrows move, SPACE marks, [ ] switch category, ? lists keys)")}
        <div class="srow"><button class="pbtn" id="tourAgain">SHOW THE TOUR AGAIN</button><span class="dim">The quick walkthrough from your first visit.</span></div>
        <h3>Data</h3>
        ${note("Everything is saved in this browser only. Clearing your browser data deletes it, so keep a backup.")}
        <div class="srow"><button class="pbtn" id="bkNow">DOWNLOAD BACKUP</button><span class="dim">${sinceBackup ? `${sinceBackup} change${sinceBackup === 1 ? "" : "s"} since your last backup.` : "Backed up."} Upload it again in CLOUD.</span></div>
        <div class="srow"><button class="pbtn danger" id="reset">RESET ALL PROGRESS</button><span id="rmsg" style="font-size:13px;color:#aaa"></span></div>
      </div>`;
    $("#tourAgain").onclick = () => { play("click"); startTour(); };
    $("#bkNow").onclick = () => { play("click"); doExport(); toast("Backup downloaded."); backupNag(); keepScroll(render); };
    const vol = $("#vol");
    vol.addEventListener("input", () => { settings.volume = +vol.value; $("#volv").textContent = vol.value; save(KEY_SET, settings); });
    vol.addEventListener("change", () => play("select"));
    $("#reset").onclick = ev => {
      const b = ev.currentTarget;
      if (b.dataset.armed) {
        change(Object.keys(found), false, "reset all progress"); play("deselect");
        b.textContent = "RESET ALL PROGRESS"; delete b.dataset.armed;
        $("#rmsg").textContent = "Progress cleared.";
      } else {
        play("warn");
        b.dataset.armed = "1"; b.textContent = "CLICK AGAIN TO CONFIRM";
        $("#rmsg").textContent = "This clears every checkmark. Download a backup first if you want one.";
      }
    };
  }

  /* =====================================================================
     CLICKS
     ===================================================================== */
  const SCROLLERS = "#grid, .cards, .results, .erows, .manual, .settings, .profile, .cloud-body";
  function keepScroll(fn) {
    const sc = screen.querySelector(SCROLLERS);
    const y = sc ? sc.scrollTop : 0;
    const st = screen.querySelector(".subtabs"); const sx = st ? st.scrollLeft : 0;
    keeping = true; try { fn(); } finally { keeping = false; }
    const st2 = screen.querySelector(".subtabs"); if (st2) st2.scrollLeft = sx;
    const s2 = screen.querySelector(SCROLLERS);
    if (s2) s2.scrollTop = y;
  }
  // remember scroll position per page
  let scrollTimer = 0;
  screen.addEventListener("scroll", ev => {
    const t = ev.target; if (!t.matches || !t.matches(SCROLLERS)) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const vk = viewKey(); if (!vk) return;
      if (t.scrollTop > 0) ui.scroll[vk] = Math.round(t.scrollTop); else delete ui.scroll[vk];
      const ks = Object.keys(ui.scroll); if (ks.length > 40) delete ui.scroll[ks[0]];
      persistUI();
    }, 200);
  }, true);
  function flash(id) {
    const el = screen.querySelector(`[data-entry="${CSS.escape(id)}"]`);
    if (el) el.classList.add("flash");     // stay where you are; don't chase the entry if it moved
  }
  const openDetail = (type, id) => { play("open"); imgIndex = 0; detail = { type, id }; render(); };

  function handleStar(star, shift) {
    const id = star.dataset.star;
    if (settings.confirmUnmark && !shift && isFound(id) && !viewOnly) {
      const nm = (byId.get(trackOf(id)) || byId.get(id) || {}).name || "this";
      play("warn");
      toast(`Unmark ${nm}?`, { action: () => doStar(id, false), actionLabel: "UNMARK", ms: 6000 });
      return;
    }
    doStar(id, shift);
  }
  function doStar(id, shift) {
    // shift-click: give everything between the last star and this one the same state
    if (shift && lastStar && !detail) {
      const order = [...screen.querySelectorAll("[data-entry]")].map(el => trackOf(el.dataset.entry));
      const a = order.indexOf(trackOf(lastStar.id)), b = order.indexOf(trackOf(id));
      if (a >= 0 && b >= 0) {
        const ids = order.slice(Math.min(a, b), Math.max(a, b) + 1);
        if (change(ids, lastStar.on, "a shift-click range")) play(lastStar.on ? "confirm" : "deselect");
        keepScroll(render); return;
      }
    }
    const on = toggle(id);
    lastStar = { id, on };
    if (detail) { render(); return; }
    const focusedEntry = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.entry;
    keepScroll(render);
    flash(id);
    if (focusedEntry) { const el = screen.querySelector(`[data-entry="${CSS.escape(focusedEntry)}"]`); if (el) el.focus({ preventScroll: true }); }
  }

  screen.addEventListener("click", ev => {
    const t = ev.target;
    // anything other than the YES/NO buttons cancels a pending tier prompt
    if (pendingTier && !t.closest("[data-tier-yes],[data-tier-no],[data-tier],[data-bio],[data-docs]")) { cancelTier(); }

    // the star is checked first, so pressing it never also opens the entry under it
    const star = t.closest("[data-star]");
    if (star) { ev.preventDefault(); ev.stopPropagation(); handleStar(star, ev.shiftKey); return; }

    if (t.closest(".zoomable")) { openLightbox(); return; }
    if (t.closest("[data-random]")) { randomMissing(); return; }
    const nxb = t.closest("[data-next]");
    if (nxb) { goNext(byId.get(nxb.dataset.next)); return; }
    const mn = t.closest("[data-marknext]");
    if (mn) { markAndNext(mn.dataset.marknext); return; }
    if (t.closest("[data-ladd]")) { const sel = screen.querySelector("[data-lpick]"); if (sel && sel.value) loadoutAdd(sel.value); else toast("Pick something first."); return; }
    { const b = t.closest("[data-lplus],[data-lminus],[data-lremove]");
      if (b) { const i = +(b.dataset.lplus ?? b.dataset.lminus ?? b.dataset.lremove), it = loadout.items[i]; if (!it) return;
        if (b.dataset.lplus != null) { it[1]++; play("select"); }
        else if (b.dataset.lminus != null && it[1] > 1) { it[1]--; play("deselect"); }
        else { loadout.items.splice(i, 1); play("deselect"); }
        saveLoad(); keepScroll(render); return; } }
    { const b = t.closest("[data-lmark]");
      if (b) { const p = byId.get(b.dataset.lmark) || people.find(x => x.id === b.dataset.lmark); if (!p) return;
        const { fixed, random } = loadoutParts(p);
        if (random.length) { loadPick = p.id; play("click"); keepScroll(render); return; }
        if (change(fixed.map(x => x.id), true, `${p.name}'s gear`)) play("confirm"); keepScroll(render); return; } }
    if (t.closest("[data-lmarkcancel]")) { loadPick = null; play("back"); keepScroll(render); return; }
    { const b = t.closest("[data-lmarkgo]");
      if (b) { const p = byId.get(b.dataset.lmarkgo) || people.find(x => x.id === b.dataset.lmarkgo); if (!p) return;
        const { fixed } = loadoutParts(p);
        const picked = [...screen.querySelectorAll("[data-lpickid]:checked:not(:disabled)")].map(c => c.dataset.lpickid);
        loadPick = null;
        if (change([...fixed.map(x => x.id), ...picked], true, `${p.name}'s gear`)) play("confirm"); else { play("click"); toast("Nothing new to mark."); }
        keepScroll(render); return; } }
    { const row = t.closest("[data-dmgammo]"); if (row) { const d = ui.dmg = dmgState(); d.ammo = row.dataset.dmgammo; d.hits = ""; persistUI(); play("click"); keepScroll(render); return; } }
    { const b = t.closest("[data-dmgcalc]"); if (b) { const d = ui.dmg = dmgState(); d.gun = b.dataset.dmgcalc; d.mode = 0; d.ammo = ""; d.hits = ""; detail = null; ui.tab = "damage"; persistUI(); play("click"); renderTabs(); render(); return; } }
    { const b = t.closest("[data-cnt]"); if (b) { const id = b.dataset.cntid; setCount(id, countOf1(id) + +b.dataset.cnt); play(+b.dataset.cnt > 0 ? "select" : "deselect"); keepScroll(render); return; } }
    { const b = t.closest("[data-frview]"); if (b) { play("open"); location.hash = "#u=" + encodeURIComponent(b.dataset.frview); return; } }
    { const b = t.closest("[data-frcmp]"); if (b) { const f = (friends || []).find(x => x.name === b.dataset.frcmp); if (f) { const set = {}; f.found.forEach(id => { set[id] = 1; }); friend = { name: f.name, set }; save(KEY_FRIEND, friend); play("confirm"); toast(`Comparing with ${f.name}: their finds show as badges on your tiles.`); renderBanner(); } return; } }
    { const b = t.closest("[data-frdel]"); if (b) { api("DELETE", "/api/friends/" + encodeURIComponent(b.dataset.frdel)).then(() => { play("deselect"); loadFriends(); }).catch(() => toast("Couldn't remove.")); return; } }
    { const b = t.closest("[data-admtab]"); if (b) { adm.status = b.dataset.admtab; adm.rows = null; adm.changes = null; adm.blocks = null; play("click"); render(); return; } }
    if (t.closest("[data-admreload]")) { play("click"); loadAdmin(); loadOverrides(); return; }
    if (t.closest("[data-admnew]")) { adm.edit = { sub: null, entry: null }; play("click"); keepScroll(render); return; }
    { const b = t.closest("[data-admedit]"); if (b) { adm.edit = { sub: b.dataset.admedit ? +b.dataset.admedit : null, entry: b.dataset.admentry || null, img: b.dataset.admimg || "" }; play("click"); render(); const sc = screen.querySelector(".results"); if (sc) sc.scrollTop = 0; return; } }
    { const b = t.closest("[data-admaddnew]"); if (b) { const sub = b.dataset.admaddnew ? +b.dataset.admaddnew : null; const row = sub && (adm.rows || []).find(x => x.id === sub);
        adm.edit = { sub, add: { section: "tools", name: b.dataset.admname || "", img: row && isImgLink(row.link) ? row.link : "", stats: row && row.kind === "Stats" ? row.text : "", desc: row && row.kind === "Description" ? row.text : "" } };
        play("click"); render(); const sc = screen.querySelector(".results"); if (sc) sc.scrollTop = 0; return; } }
    { const b = t.closest("[data-admst]"); if (b) { const n = screen.querySelector(`[data-admnoteid="${b.dataset.admid}"]`); api("PUT", "/api/admin/submissions/" + b.dataset.admid, { status: b.dataset.admst, note: n ? n.value.trim() : "" }).then(() => { play("click"); loadAdmin(); }); return; } }
    if (t.closest("[data-admann]")) { adm.ann = { update: "", msg: "" }; play("click"); keepScroll(render); return; }
    if (t.closest("[data-admimgadd]")) { const box = $("#admImgs"); if (box) { box.insertAdjacentHTML("beforeend", imgRowHTML("")); play("click"); } return; }
    { const b = t.closest("[data-admimgdel]"); if (b) { const it = b.closest(".imgitem"); const box = $("#admImgs"); if (box && box.children.length > 1) it.remove(); else { const i = it.querySelector("input"); i.value = ""; const pv = it.querySelector("img"); pv.hidden = true; } play("deselect"); return; } }
    { const b = t.closest("[data-admundo]"); if (b) {
        if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "SURE?"; play("warn"); return; }
        api("POST", `/api/admin/changes/${b.dataset.admundo}/undo`).then(([st, r]) => {
          if (st !== 200) { toast(r.error || "Couldn't undo."); play("warn"); return; }
          const wasAdd = !!(overrides[r.entry] && overrides[r.entry].add), nowAdd = !!(r.data && r.data.add);
          if (r.data) overrides[r.entry] = { ...r.data, updated: Math.floor(Date.now() / 1000) }; else delete overrides[r.entry];
          save("pda-overrides-v1", overrides);
          if (wasAdd !== nowAdd) { location.reload(); return; }
          applyOverrides(overrides); play("confirm"); toast(`Undone: ${entryName(r.entry)} is back to how it was.`); adm.changes = null; keepScroll(render);
        }); return; } }
    { const b = t.closest("[data-admblock]"); if (b) {
        if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "BLOCK + REJECT ALL THEIR SUBMISSIONS?"; play("warn"); return; }
        api("POST", "/api/admin/blocks", { sub: +b.dataset.admblock, purge: true }).then(([st, r]) => { if (st !== 201) { toast(r.error || "Couldn't block."); play("warn"); return; } play("deselect"); toast("Blocked. They can't send anything else."); loadAdmin(); }); return; } }
    { const b = t.closest("[data-admunblock]"); if (b) { api("DELETE", "/api/admin/blocks/" + b.dataset.admunblock).then(() => { play("click"); toast("Unblocked."); loadAdmin(); }); return; } }
    { const b = t.closest("[data-admdel]"); if (b) { if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "SURE?"; play("warn"); return; } api("DELETE", "/api/admin/submissions/" + b.dataset.admdel).then(() => { play("deselect"); loadAdmin(); }); return; } }
    if (t.closest("[data-copyrun]")) { play("click"); const txt = sessionText(); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("This run's finds copied.")).catch(() => toast(txt, { ms: 12000 })); return; }
    if (t.closest("[data-newrun]")) { sessionStart = { f: countOf(entries)[0], t: Date.now(), ids: Object.keys(found) }; try { sessionStorage.setItem("pda-session-" + PROF.active, JSON.stringify(sessionStart)); } catch { /* ignore */ } play("confirm"); toast("New run started."); keepScroll(render); return; }
    if (t.closest("[data-lclear]")) { if (loadout.items.length) { loadout.items = []; saveLoad(); play("deselect"); render(); toast("Loadout cleared."); } return; }
    if (t.closest("[data-lcopy]")) { play("click"); const txt = loadoutText(); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Loadout copied.")).catch(() => toast(txt, { ms: 12000 })); return; }
    if (t.closest("[data-copylist]")) { play("click"); const txt = missingText(); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Missing list copied.")).catch(() => toast("Couldn't copy. Try PRINT instead.")); return; }
    if (t.closest("[data-printlist]")) { play("click"); printList(); return; }
    const cmpb = t.closest("[data-cmp]");
    if (cmpb) {
      const id = cmpb.dataset.cmp, i = ui.cmp.indexOf(id);
      if (i >= 0) ui.cmp.splice(i, 1);
      else { if (ui.cmp.length >= 3) { toast("You can compare up to 3 weapons. Remove one first."); play("warn"); return; } ui.cmp.push(id); }
      play("click"); persistUI(); render(); return;
    }
    const rm = t.closest("[data-cmprm]");
    if (rm) { ui.cmp = ui.cmp.filter(x => x !== rm.dataset.cmprm); play("back"); persistUI(); render(); return; }
    if (t.closest("[data-cmpclear]")) { ui.cmp = []; detail = null; play("back"); persistUI(); render(); return; }
    const lk = t.closest("[data-link]");
    if (lk) {
      const url = `${location.origin}${location.pathname}#e=${h5(lk.dataset.link)}`;
      play("click");
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("Link to this page copied.")).catch(() => toast(url, { ms: 12000 }));
      return;
    }
    const sg = t.closest("[data-suggest]");
    if (sg) { play("click"); openSuggest(byId.get(sg.dataset.suggest), sg.dataset.skind); return; }
    if (t.closest("[data-tclear]")) { ui.tsort = ""; ui.cal = ""; ui.tierMin = ""; ui.tmin = ""; ui.tmax = ""; play("back"); persistUI(); render(); return; }
    if (t.closest("[data-cfileclear]")) { pickedFile = null; play("back"); keepScroll(render); return; }
    const ct = t.closest("[data-contrib]");
    if (ct) { ev.preventDefault(); submitForm(ct.closest("form")); return; }

    const fav = t.closest("[data-fav]");
    if (fav) {
      const id = fav.dataset.fav;
      if (favs[id]) delete favs[id]; else favs[id] = 1;
      save(KEY_FAV, favs); play(favs[id] ? "select" : "deselect");
      toast(favs[id] ? "Added to favourites. It shows on your Profile." : "Removed from favourites.");
      render(); return;
    }
    const bt = t.closest("[data-btab]");
    if (bt) { play("click"); ui.btab = bt.dataset.btab; persistUI(); render(); if (ui.btab === "notes") { const ta = screen.querySelector(".notes"); if (ta) ta.focus(); } return; }
    const st = t.closest("[data-stype]");
    if (st) { play("click"); ui.stype = st.dataset.stype; persistUI(); render(); return; }

    const arrow = t.closest("[data-img]");
    if (arrow) { play("click"); imgIndex += +arrow.dataset.img; render(); return; }

    const yes = t.closest("[data-tier-yes]");
    if (yes) { applyTier(yes.dataset.tierYes); keepScroll(render); return; }
    if (t.closest("[data-tier-no]")) { play("back"); cancelTier(); keepScroll(render); return; }
    if (t.closest("[data-tiptip]")) { settings.tierTip = true; save(KEY_SET, settings); play("back"); keepScroll(render); return; }
    const tierBtn = t.closest("[data-tier]");
    if (tierBtn) { if (!settings.tierTip) { settings.tierTip = true; save(KEY_SET, settings); } askTier(tierBtn.dataset.tier); keepScroll(render); return; }

    const tool = t.closest("[data-open-tool]") || t.closest("[data-tool]");
    if (tool) { openDetail("tool", tool.dataset.openTool || tool.dataset.tool); return; }
    const doc = t.closest("[data-open-doc]") || t.closest("[data-docnav]");
    if (doc) { if (doc.dataset.docnav) { play("click"); detail = { type: "doc", id: doc.dataset.docnav }; render(); } else openDetail("doc", doc.dataset.openDoc); return; }
    const member = t.closest("[data-member]") || t.closest(".arrow[data-person]");
    if (member) { play("click"); imgIndex = 0; detail = { type: "person", id: member.dataset.member || member.dataset.person }; render(); return; }
    const person = t.closest("[data-open]") || t.closest("[data-person]");
    if (person) { openDetail("person", person.dataset.open || person.dataset.person); return; }

    const set = t.closest("[data-set]");
    if (set) { settings[set.dataset.set] = set.dataset.val === "1"; save(KEY_SET, settings); render(); play("click"); return; }
    const cat = t.closest("[data-cat]");
    if (cat) { play(+cat.dataset.cat === ui.cat ? "click" : "switch"); if (ui.cat !== +cat.dataset.cat) ui.cal = ""; ui.cat = +cat.dataset.cat;
      { const nc = PDA_DATA.tools[ui.cat]; if (nc && ui.tsort && !nc.items.some(e => statNum(e, ui.tsort) != null)) { ui.tsort = ""; ui.tmin = ""; ui.tmax = ""; } } persistUI(); render(); const g = $("#grid"); if (g) g.scrollTop = 0; return; }
    // clicking the sub-tab that's already open asks to unlock (or lock) the whole tab
    const bio = t.closest("[data-bio]");
    if (bio) {
      if (+bio.dataset.bio === ui.bio) { askTier(`tab:bio:${ui.bio}`); keepScroll(render); return; }
      play("switch"); ui.bio = +bio.dataset.bio; persistUI(); render(); return;
    }
    const docs = t.closest("[data-docs]");
    if (docs) {
      if (+docs.dataset.docs === ui.docs) { askTier(`tab:docs:${ui.docs}`); keepScroll(render); return; }
      play("switch"); ui.docs = +docs.dataset.docs; persistUI(); render(); return;
    }
    if (t.closest("#ret")) { play("close"); detail = null; render(); return; }
  });
  screen.addEventListener("change", ev => {
    const sel = ev.target;
    if (sel.matches("[data-tsort]")) { ui.tsort = sel.value; ui.tmin = ""; ui.tmax = ""; }
    else if (sel.matches("[data-tiermin]")) ui.tierMin = sel.value;
    else if (sel.matches("[data-tmin]")) ui.tmin = sel.value.trim();
    else if (sel.matches("[data-tmax]")) ui.tmax = sel.value.trim();
    else if (sel.matches("[data-cal]")) ui.cal = sel.value;
    else if (sel.matches("[data-dmg]")) {
      const d = ui.dmg = dmgState(), k = sel.dataset.dmg;
      d[k] = sel.type === "checkbox" ? sel.checked : sel.value;
      if (k === "gun") { d.mode = 0; d.ammo = ""; d.hits = ""; }
      if (k === "mode") { d.mode = +sel.value; d.ammo = ""; d.hits = ""; }
      if (k === "ammo") d.hits = "";
      persistUI(); play("click"); keepScroll(render); return;
    }
    else if (sel.matches("[data-admupload]")) {
      const f = sel.files && sel.files[0], tgt = screen.querySelector(sel.dataset.admupload); if (!f || !tgt) return;
      const lab = sel.closest("label"); lab.firstChild.textContent = "UPLOADING…";
      uploadPic(f).then(url => { tgt.value = url; if (adm.edit && adm.edit.add) adm.edit.add.img = url; const pv = screen.querySelector(`[data-imgprev='${sel.dataset.admupload}']`); if (pv) { pv.src = url; pv.hidden = false; } lab.firstChild.textContent = "UPLOAD…"; play("confirm"); toast("Uploaded. Press PUBLISH to put it on the page."); })
        .catch(err => { lab.firstChild.textContent = "UPLOAD…"; toast(err.user ? err.message : "Upload failed. Check your connection."); play("warn"); });
      return;
    }
    else if (sel.matches("[data-cfile]")) { const f = sel.files && sel.files[0]; if (f && f.size > 5 * 1024 * 1024) { toast("That picture is over 5 MB."); sel.value = ""; return; } pickedFile = f || null; readForm(sel.closest("form")); keepScroll(render); return; }
    else if (sel.matches('[data-admadd="section"], [data-admadd="group"]')) { readAddForm(); if (sel.dataset.admadd === "section") adm.edit.add.group = ""; play("click"); keepScroll(render); return; }
    else if (sel.matches("[data-annupd]")) { adm.ann.update = sel.value; adm.ann.msg = ($("#annMsg") || {}).value || ""; keepScroll(render); return; }
    else if (sel.matches("[data-leftupd]")) { ui.leftUpd = sel.value; persistUI(); play("click"); render(); return; }
    else if (sel.matches("[data-lbscope]")) { board.scope = sel.value; board.rows = null; play("click"); render(); return; }
    else if (sel.matches("[data-lpick]")) { if (sel.value) loadoutAdd(sel.value); return; }
    else if (sel.matches("[data-lbase]")) { loadout.base = sel.value.trim(); saveLoad(); play("click"); keepScroll(render); return; }
    else if (sel.matches("[data-lfound]")) { ui.loadFound = sel.checked; play("click"); persistUI(); keepScroll(render); return; }
    else return;
    play("click"); persistUI(); render();
  });
  // clicking a star shouldn't focus it (focusing scrolls the list to it)
  screen.addEventListener("keydown", ev => { const th = ev.target.closest && ev.target.closest(".tier-head[data-tier]"); if (th && (ev.key === "Enter" || ev.key === " ") && ev.target === th) { ev.preventDefault(); askTier(th.dataset.tier); keepScroll(render); } });
  screen.addEventListener("mousedown", ev => { if (ev.target.closest && ev.target.closest(".hstar, .sres-star, .sres-ic, .tile, .card, .doc, .subtab, .cat")) ev.preventDefault(); });
  screen.addEventListener("submit", ev => { if (!ev.target.matches("form.contrib")) return; ev.preventDefault(); submitForm(ev.target); });
  // keep the form's text if you switch tabs
  screen.addEventListener("input", ev => { const f = ev.target.closest && ev.target.closest("form.contrib"); if (f) readForm(f); });
  // notes save as you type
  screen.addEventListener("input", ev => {
    const ta = ev.target.closest && ev.target.closest("[data-note]");
    if (!ta) return;
    const id = ta.dataset.note;
    if (ta.value.trim()) notes[id] = ta.value; else delete notes[id];
    save(KEY_NOTES, notes);
  });

  /* =====================================================================
     KEYBOARD: arrows move, Space marks, Enter opens, Ctrl+Z undoes
     ===================================================================== */
  function moveFocus(key) {
    const els = [...screen.querySelectorAll("[data-entry]")].filter(el => el.offsetParent);
    if (!els.length) return;
    const cur = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-entry]");
    if (!cur || !els.includes(cur)) { els[0].focus({ preventScroll: true }); revealInList(els[0]); return; }
    let next;
    if (key === "ArrowRight") next = els[els.indexOf(cur) + 1];
    else if (key === "ArrowLeft") next = els[els.indexOf(cur) - 1];
    else {
      const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, dir = key === "ArrowDown" ? 1 : -1;
      let best = Infinity;
      els.forEach(el => {
        if (el === cur) return;
        const q = el.getBoundingClientRect(), dy = (q.top - r.top) * dir;
        if (dy < 4) return;
        const d = dy * 3 + Math.abs(q.left + q.width / 2 - cx);
        if (d < best) { best = d; next = el; }
      });
    }
    if (next) { next.focus({ preventScroll: true }); revealInList(next); }
  }
  document.addEventListener("keydown", e => {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); undo(); return; }
    if (typing) return;
    if (e.key === "?") { e.preventDefault(); toggleKeys(); return; }
    if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey) { e.preventDefault(); randomMissing(); return; }
    if ((e.key === "[" || e.key === "]") && !detail && !query) {
      e.preventDefault(); const d = e.key === "]" ? 1 : -1;
      if (ui.tab === "tools") { const n = PDA_DATA.tools.length; ui.cat = ((ui.cat < 0 ? 0 : ui.cat) + d + n) % n; }
      else if (ui.tab === "biography") { const n = PDA_DATA.biography.length; ui.bio = ((ui.bio < 0 ? 0 : ui.bio) + d + n) % n; }
      else if (ui.tab === "documents") { const n = PDA_DATA.documents.length; ui.docs = (ui.docs + d + n) % n; }
      else return;
      kbFocus = null; play("click"); persistUI(); render(); const g = $("#grid"); if (g) g.scrollTop = 0; return;
    }
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey) {
      const el = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-entry]");
      const st = el && el.querySelector("[data-star]"); if (st) { e.preventDefault(); handleStar(st, false); } return;
    }
    if (detail && !e.ctrlKey && !e.metaKey && (e.key === "n" || e.key === "N")) { const b = screen.querySelector("[data-marknext]"); if (b) { e.preventDefault(); markAndNext(b.dataset.marknext); } return; }
    if (detail && !e.ctrlKey && !e.metaKey && (e.key === "m" || e.key === "M")) { const b = screen.querySelector("[data-next]"); if (b) { e.preventDefault(); goNext(byId.get(b.dataset.next)); } return; }
    if (e.key.startsWith("Arrow")) {
      if (detail && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const imgs = screen.querySelectorAll("[data-img]");
        if (imgs.length) { e.preventDefault(); imgIndex += e.key === "ArrowRight" ? 1 : -1; play("click"); render(); }
        return;
      }
      if (!detail) { e.preventDefault(); moveFocus(e.key); }
      return;
    }
    if (e.key === " ") {
      const el = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-entry]");
      const st = el && el.querySelector("[data-star]");
      if (st) { e.preventDefault(); handleStar(st, e.shiftKey); }
      else if (document.activeElement && document.activeElement.classList.contains("hstar")) { e.preventDefault(); handleStar(document.activeElement, e.shiftKey); }
    }
  });

  /* phones: swipe the picture to change image, swipe the stats to change variant */
  let sw0 = null;
  screen.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") sw0 = { x: e.clientX, y: e.clientY, t: e.target }; });
  screen.addEventListener("pointerup", e => {
    if (!sw0) return;
    const dx = e.clientX - sw0.x, dy = e.clientY - sw0.y, tgt = sw0.t; sw0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > 40 || !detail) return;
    const step = dx < 0 ? 1 : -1;
    if (tgt.closest(".preview") && screen.querySelector("[data-img]")) { imgIndex += step; play("click"); render(); return; }
    if (tgt.closest(".edata")) {
      const tabs = [...screen.querySelectorAll("[data-member]")];
      const i = tabs.findIndex(b => b.classList.contains("on"));
      const nxt = tabs[i + step];
      if (nxt) { play("click"); imgIndex = 0; detail = { type: "person", id: nxt.dataset.member }; render(); }
    }
  });

  /* =====================================================================
     TOOLBAR (grid/list + all/missing/found), TOASTS, SHARED-LINK BANNER
     ===================================================================== */
  function syncToolbar() {
    const ss = $("#sortSel"); if (ss) ss.value = ui.sort;
    document.querySelectorAll("[data-compact]").forEach(b => b.setAttribute("aria-pressed", !!ui.compact));
    document.querySelectorAll("[data-hidedone]").forEach(b => b.setAttribute("aria-pressed", !!ui.hideDone));
    document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", ui.view === b.dataset.view));
    document.querySelectorAll("[data-filter]").forEach(b => b.setAttribute("aria-pressed", ui.filter === b.dataset.filter));
  }
  document.querySelector(".viewtools").addEventListener("click", e => {
    const v = e.target.closest("[data-view]"), f = e.target.closest("[data-filter]");
    if (e.target.closest("[data-compact]")) { ui.compact = !ui.compact; }
    else if (e.target.closest("[data-hidedone]")) { ui.hideDone = !ui.hideDone; toast(ui.hideDone ? "Finished tiers, tabs and categories are hidden." : "Showing finished ones again."); }
    else if (v) { ui.view = v.dataset.view; }
    else if (f) { ui.filter = f.dataset.filter; }
    else return;
    play("click"); persistUI(); detail = null; render();
  });

  $("#sortSel").addEventListener("change", e => { ui.sort = e.target.value; play("click"); persistUI(); keepScroll(render); });

  /* ---------- "?" keyboard shortcut list ---------- */
  const KEYS = [["← ↑ → ↓", "Move between entries"], ["SPACE", "Mark found / missing"], ["ENTER", "Open"], ["SHIFT + STAR", "Mark a range"],
    ["CTRL + Z", "Undo"], ["/", "Search"], ["ESC", "Back / clear search / close"], ["← →  on a page", "Previous / next picture"], ["R", "Random missing entry"], ["F", "Same as SPACE"], ["[  ]", "Previous / next category or tab"], ["N  on a page", "Mark found + open next missing"], ["M  on a page", "Next missing"], ["?", "This list"]];
  const keysEl = document.createElement("div"); keysEl.className = "lightbox keysbox"; keysEl.hidden = true; document.body.appendChild(keysEl);
  function toggleKeys() {
    if (!keysEl.hidden) { keysEl.hidden = true; return; }
    play("open");
    keysEl.innerHTML = `<div class="keys"><div class="dhead">Keyboard Shortcuts<button class="return" data-kclose>CLOSE</button></div><table>${KEYS.map(([k, d]) => `<tr><th>${k}</th><td>${d}</td></tr>`).join("")}</table></div>`;
    keysEl.hidden = false;
  }
  keysEl.addEventListener("click", e => { if (e.target.closest("[data-kclose]") || !e.target.closest(".keys")) { keysEl.hidden = true; play("back"); } });
  document.addEventListener("keydown", e => { if (!keysEl.hidden && e.key === "Escape") { e.stopImmediatePropagation(); keysEl.hidden = true; } }, true);

  /* ---------- picture lightbox ---------- */
  const lb = document.createElement("div"); lb.className = "lightbox"; lb.hidden = true; document.body.appendChild(lb);
  function drawLightbox() {
    const n = curImgs.length; if (!n) return closeLightbox();
    const i = ((imgIndex % n) + n) % n, im = curImgs[i];
    lb.innerHTML = `<figure><img src="${esc(im.src)}" alt="">${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}</figure>
      ${n > 1 ? `<button class="lbnav prev" data-lb="-1">&#9664;</button><button class="lbnav next" data-lb="1">&#9654;</button><span class="lbcount">${i + 1} / ${n}</span>` : ""}
      <button class="lbclose" data-lb="x">×</button>`;
  }
  function openLightbox() { if (!curImgs.length) return; play("open"); drawLightbox(); lb.hidden = false; }
  function closeLightbox() { lb.hidden = true; lb.innerHTML = ""; }
  lb.addEventListener("click", e => {
    const b = e.target.closest("[data-lb]");
    if (b && b.dataset.lb !== "x") { imgIndex += +b.dataset.lb; play("click"); render(); drawLightbox(); return; }
    if (b || !e.target.closest("figure img")) { play("back"); closeLightbox(); }
  });
  document.addEventListener("keydown", e => {
    if (lb.hidden) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); closeLightbox(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.stopImmediatePropagation(); e.preventDefault(); imgIndex += e.key === "ArrowRight" ? 1 : -1; render(); drawLightbox(); }
  }, true);

  const toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status");
  const nagEl = document.createElement("div"); nagEl.className = "toast nag"; nagEl.setAttribute("role", "status");
  document.body.append(toastEl, nagEl);
  function toast(msg, o = {}) {
    const el = o.nag ? nagEl : toastEl;
    el.innerHTML = `<span>${esc(msg)}</span>${o.undo ? '<button data-t="undo">UNDO</button>' : ""}${o.action ? `<button data-t="act">${esc(o.actionLabel || "OK")}</button>` : ""}<button data-t="x" aria-label="Close">×</button>`;
    el._act = o.action || null;
    el.classList.add("on");
    clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("on"), o.ms || 5000);
  }
  [toastEl, nagEl].forEach(el => el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.t === "undo") undo();
    else if (b.dataset.t === "act" && el._act) el._act();
    el.classList.remove("on");
  }));

  const bannerEl = $("#banner");
  function renderBanner() {
    if (viewOnly) {
      bannerEl.hidden = false;
      bannerEl.innerHTML = `<span>VIEWING <b>${esc(viewOnly.name || "SOMEONE")}</b>${adminTag(viewOnly.name)}'S PDA${viewOnly.live ? " (LIVE)" : ""} · READ-ONLY · ${countOf(entries)[0]} / ${entries.length} FOUND</span>
        <span><button data-b="compare">COMPARE WITH MINE</button><button data-b="exit">EXIT</button></span>`;
    } else if (friend) {
      const n = entries.filter(e => friend.set[e.id] && !found[e.id]).length;
      bannerEl.hidden = false;
      bannerEl.innerHTML = `<span>COMPARING WITH <b>${esc(friend.name || "A FRIEND")}</b> · THEY HAVE ${n} YOU DON'T</span>
        <span><button data-b="show">SHOW</button><button data-b="stop">STOP</button></span>`;
    } else bannerEl.hidden = true;
  }
  function leaveView() { viewOnly = null; try { history.replaceState(null, "", location.pathname + location.search); } catch { location.hash = ""; } }
  bannerEl.addEventListener("click", e => {
    const b = e.target.closest("[data-b]"); if (!b) return;
    play("click");
    if (b.dataset.b === "exit") leaveView();
    if (b.dataset.b === "compare") { friend = viewOnly; save(KEY_FRIEND, friend); leaveView(); ui.tab = "cloud"; }
    if (b.dataset.b === "show") { ui.tab = "cloud"; detail = null; if (query) clearSearch(false); }
    if (b.dataset.b === "stop") { friend = null; save(KEY_FRIEND, null); }
    persistUI(); updateCount(); renderTabs(); render();
  });

  /* =====================================================================
     HOVER TEXT (stats + images) — small black box like the game's
     ===================================================================== */
  const tipEl = document.createElement("div");
  tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);
  let tipFor = null;
  function placeTip(x, y) {
    const r = tipEl.getBoundingClientRect();
    let left = x + 14, top = y + 16;
    if (left + r.width > innerWidth - 6) left = x - r.width - 10;
    if (top + r.height > innerHeight - 6) top = y - r.height - 10;
    tipEl.style.left = Math.max(6, left) + "px"; tipEl.style.top = Math.max(6, top) + "px";
  }
  document.addEventListener("pointermove", ev => {
    const el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el !== tipFor) {
      tipFor = el;
      if (el && el.dataset.tip) { tipEl.textContent = el.dataset.tip; tipEl.classList.add("on"); }
      else tipEl.classList.remove("on");
    }
    if (tipFor) placeTip(ev.clientX, ev.clientY);
  });
  document.addEventListener("pointerleave", () => { tipFor = null; tipEl.classList.remove("on"); });
  // phones: tap a stat to show its text, tap elsewhere to hide
  document.addEventListener("pointerdown", ev => {
    if (ev.pointerType === "mouse") return;
    const el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el && el.dataset.tip) { tipFor = el; tipEl.textContent = el.dataset.tip; tipEl.classList.add("on"); placeTip(ev.clientX, ev.clientY); }
    else { tipFor = null; tipEl.classList.remove("on"); }
  });
  screen.addEventListener("scroll", () => { tipFor = null; tipEl.classList.remove("on"); }, true);

  /* mouse wheel scrolls the sideways strips (character tabs, variant tabs, phone categories) */
  screen.addEventListener("wheel", e => {
    const strip = e.target.closest(".subtabs, .mtabs, .cats");
    if (!strip || strip.scrollWidth <= strip.clientWidth + 1) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  // keep the open sub-tab in view
  // keep sideways strips (character tabs, categories on phones) where they were, and the open one in view
  let stripX = { sub: 0, cats: 0 };
  screen.addEventListener("scroll", e => {
    if (e.target.classList && e.target.classList.contains("subtabs")) stripX.sub = e.target.scrollLeft;
    if (e.target.classList && e.target.classList.contains("cats")) stripX.cats = e.target.scrollLeft;
  }, true);
  new MutationObserver(() => {
    const st = screen.querySelector(".subtabs"), ct = screen.querySelector(".cats");
    if (st) { st.scrollLeft = stripX.sub; const a = st.querySelector('[aria-selected="true"]'); if (a) revealInStrip(a); }
    if (ct && ct.scrollWidth > ct.clientWidth) { ct.scrollLeft = stripX.cats; const a = ct.querySelector('[aria-selected="true"]'); if (a) revealInStrip(a); }
  }).observe(screen, { childList: true });

  /* ---------- go ---------- */
  if (!sessionStart || !Array.isArray(sessionStart.ids)) { sessionStart = { f: countOf(entries)[0], t: (sessionStart && sessionStart.t) || Date.now(), ids: Object.keys(found) }; try { sessionStorage.setItem("pda-session-" + PROF.active, JSON.stringify(sessionStart)); } catch { /* ignore */ } }
  if (Object.keys(found).length && !progress[today()]) snapProgress();
  if (/^#v=/.test(location.hash)) viewOnly = parseShare(location.hash);
  else if (/^#u=/.test(location.hash) && API) { viewOnly = { name: decodeURIComponent(location.hash.slice(3)), set: {}, live: true }; openProfileLink(viewOnly.name); }
  else if (/^#e=/.test(location.hash)) {
    const id = byHash.get(location.hash.slice(3, 8));
    const e = id && byId.get(id);
    if (e) {
      detail = { type: { tools: "tool", bio: "person", docs: "doc" }[e.section], id };
      ui.tab = { tools: "tools", bio: "biography", docs: "documents" }[e.section];
      if (e.section === "tools") ui.cat = e.catIndex; else if (e.section === "bio") ui.bio = e.groupIndex; else ui.docs = e.groupIndex;
    }
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
  } else if (ui.detail && (ui.detail.type === "compare" || byId.has(ui.detail.id))) detail = ui.detail;   // reopen where you left off
  if (PROF.active !== "Main") setTimeout(() => toast(`Using save profile "${PROF.active}". Switch it on the Profile tab.`), 300);

  renderTabs();
  updateCount();
  render();
  backupNag();
  if (API) {
    applyOverrides(overrides);
    setAdmin(!!acc && ui.tab === "admin");          // checkAdmin() confirms it
    loadRarity(); loadOverrides(); loadServerInfo();
    if (acc) { syncNow(); pullCounts(); checkAdmin(); }
    // pick up changes made on another device when you come back to this tab
    document.addEventListener("visibilitychange", () => { if (!document.hidden && acc && (!acc.at || Date.now() - acc.at > 20000)) syncNow(); });
    window.addEventListener("online", () => scheduleSync(500));
    window.addEventListener("hashchange", () => { const m = location.hash.match(/^#u=(.+)$/); if (m) { detail = null; viewOnly = { name: decodeURIComponent(m[1]), set: {}, live: true }; openProfileLink(viewOnly.name); } });
  }
  // first visit: short tour (not when opening someone's share link)
  if (!settings.tourDone && !viewOnly && !Object.keys(found).length) setTimeout(() => startTour(), 400);

})();
