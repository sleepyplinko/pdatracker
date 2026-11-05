/* =====================================================================
   PDA.exe tracker — app logic.
   Entries live in data.js, sound files are set in sounds.js.
   ===================================================================== */
(() => {
  "use strict";

  /* ---------- storage (wrapped: private windows can throw) ---------- */
  const KEY_FOUND = "pda-found-v1";
  const KEY_SET   = "pda-settings-v1";
  const KEY_UI    = "pda-ui-v1";
  const KEY_USER  = "pda-user-v1";
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

  let found    = load(KEY_FOUND, {});
  let settings = Object.assign({ lockedNames: false, hideFound: false, sound: true, hoverSound: true, volume: 70 }, load(KEY_SET, {}));
  let ui       = Object.assign({ tab: "tools", cat: 0, bio: 0, docs: 0 }, load(KEY_UI, {}));
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
    if (name === "hover" && !settings.hoverSound) return;
    const def = SFX[name];
    if (!def || !def.file) return;
    let pool = pools[name];
    if (!pool) {
      pool = pools[name] = { i: 0, list: [] };
      for (let n = 0; n < (name === "hover" ? 6 : 3); n++) {
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
  // preload the files so the first hover isn't late
  window.addEventListener("load", () => Object.keys(SFX).forEach(k => { if (SFX[k].file) { const a = new Audio(); a.preload = "auto"; a.src = SFX[k].file; } }));

  const HOVERABLE = ".tabbtn, .tab, .cat, .tile, .card, .doc, .subtab, .pbtn, .return, .star, .estar, .hstar, .arrow, .linkish, .tier-btn, .tier-yes, .tier-no, .onoff button, .sres-main, .sres-star, .mtab, .clear-search";
  let lastHover = null, lastHoverAt = 0;
  document.addEventListener("pointerover", e => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const el = e.target.closest(HOVERABLE);
    if (!el || el === lastHover) return;
    lastHover = el;
    const now = performance.now();
    if (now - lastHoverAt < 35) return;
    lastHoverAt = now;
    play("hover");
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
  const isFound   = id => !!found[trackOf(id)];
  const cardFound = c => isFound(c.entry.id);
  // older saves tracked each variant separately: fold those into their card
  people.forEach(v => { if (v.trackId) { const old = `${v.trackId.replace(/\|[^|]*$/, "")}|${slug(v.card.name)}|${slug(v.name)}`; if (found[old]) { found[v.trackId] = 1; delete found[old]; } } });
  const countOf   = list => [list.filter(e => isFound(e.id)).length, list.length];
  const label     = e => e.unknown ? "???" : e.name;

  /* ---------- sorting: found A→Z first, then locked A→Z, ??? last ---------- */
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  function sortBy(list, isOn, nameOf) {
    return list.slice().sort((a, b) => {
      const fa = isOn(a), fb = isOn(b);
      if (fa !== fb) return fa ? -1 : 1;
      const na = nameOf(a), nb = nameOf(b);
      const ua = na === "???", ub = nb === "???";
      if (ua !== ub) return ua ? 1 : -1;
      return collator.compare(na, nb);
    });
  }
  const sortEntries = list => sortBy(list, e => isFound(e.id), label);
  const sortCards   = list => sortBy(list, cardFound, c => c.name);

  function setFound(id, on) {
    id = trackOf(id);
    if (on) found[id] = 1; else delete found[id];
  }
  function toggle(id) {
    const on = !isFound(id);
    setFound(id, on);
    save(KEY_FOUND, found);
    play(on ? "select" : "deselect");
    updateCount();
    return on;
  }

  /* =====================================================================
     ICONS
     ===================================================================== */
  const I = {
    profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#111"/><circle cx="12" cy="9.5" r="3.6" fill="#ddd"/><path d="M5.5 18.5c1.4-3 3.8-4.4 6.5-4.4s5.1 1.4 6.5 4.4" fill="#ddd"/></svg>',
    cloud:   '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/><path d="M12 10v6m-2.5-2.5L12 16l2.5-2.5"/></svg>',
    manual:  '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#111"/><path d="M6 12.5l4 4 8-9" fill="none" stroke="#ddd" stroke-width="2.6"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="#111"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
    tools:   '<svg viewBox="0 0 24 24" fill="#111"><path d="M3 5.5 7.5 1l5 4-2 2 9.5 13-2 2L5 12.5l-2 2-1-5z"/></svg>',
    biography:'<svg viewBox="0 0 24 24" fill="#111"><path d="M2 6h7l2 2h11v13H2z"/><circle cx="12" cy="13" r="2.4" fill="#ccc"/><path d="M7.5 19c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3z" fill="#ccc"/><path d="M4 3h7v2H4z"/></svg>',
    documents:'<svg viewBox="0 0 24 24"><path d="M5 2h9l5 5v15H5z" fill="#111"/><path d="M8 11h8M8 14h8M8 17h6" stroke="#ccc" stroke-width="1.6"/></svg>',
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
  /* small icons for the enemy stat rows */
  const SI = {
    heart:  '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
    run:    '<circle cx="14" cy="4" r="2.2"/><path d="M11 7l-4 3 1.4 1.6L11 9.8l1 3.4-4 4.8 1.6 1.4 4.6-5 2.4 2.6V22h2v-6l-3-3.4.8-3.4 2 2.2H22v-2h-3.6l-3.2-3.6z"/>',
    shieldO:'<path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z"/>',
    shieldP:'<path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z"/><path d="M8 12h8M12 8v8" stroke="#111" stroke-width="2.4"/>',
    flame:  '<path d="M12 22c4.4 0 7-3 7-6.6 0-4-3-6-4-10-1.6 1.6-2 3.6-2 5-1.2-1.4-2-3.6-1.6-6.4C7.6 6.4 5 10.4 5 15.4 5 19 7.6 22 12 22z"/>',
    drop:   '<path d="M12 2.5C9 7 6 10.4 6 14.4a6 6 0 0 0 12 0c0-4-3-7.4-6-11.9z"/>',
    blast:  '<path d="M12 1l2 6 5-3-2 6 6 2-6 2 2 6-5-3-2 6-2-6-5 3 2-6-6-2 6-2-2-6 5 3z"/>',
    bolt:   '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
    bone:   '<path d="M6 3a3 3 0 0 0-1.5 5.6L15.4 19.5A3 3 0 1 0 19.5 15.4L8.6 4.5A3 3 0 0 0 6 3z"/>',
    mute:   '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15 9l6 6M21 9l-6 6" stroke="currentColor" stroke-width="2.2"/>',
    aim:    '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="currentColor" stroke-width="2.2"/>',
    fist:   '<path d="M7 9V5.5a1.5 1.5 0 0 1 3 0V9V4a1.5 1.5 0 0 1 3 0v5V5a1.5 1.5 0 0 1 3 0v5V7.5a1.5 1.5 0 0 1 3 0V14c0 4.4-3 8-7.5 8S5 19 5 15v-3.5a1.5 1.5 0 0 1 2-1.4z"/>',
    eye:    '<path d="M12 5C6.5 5 2.5 9.4 1.5 12c1 2.6 5 7 10.5 7s9.5-4.4 10.5-7C21.5 9.4 17.5 5 12 5z"/><circle cx="12" cy="12" r="3.4" fill="#111"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20 3v6h-6z"/>',
    ff:     '<path d="M2 5l9 7-9 7zM12 5l9 7-9 7z"/>',
    swing:  '<path d="M4 20A16 16 0 0 1 20 4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 20A12 12 0 0 1 20 8" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".6"/>',
    gun:    '<path d="M2 6h19v4h-7l-1.5 2H10l-1.5 8H4l2-8H2z"/>',
    ammo:   '<path d="M6 3h4v18H6z"/><path d="M6 17h12v4H6z"/>'
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
  function previewHTML(imgs, fallback) {
    if (!imgs.length) return fallback;
    const i = ((imgIndex % imgs.length) + imgs.length) % imgs.length;
    const im = imgs[i];
    return `<img src="${esc(im.src)}" alt="" ${im.caption ? `data-tip="${esc(im.caption)}"` : ""}>` +
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
  const TABS = ["profile", "cloud", "manual", "settings", "tools", "biography", "documents"];
  function renderTabs() {
    $("#tabs").innerHTML = TABS.map(t =>
      `<button class="tab" role="tab" data-tab="${t}" aria-selected="${!query && ui.tab === t}">${I[t]}<span>${t.toUpperCase()}</span></button>`
    ).join("");
  }
  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab"); if (!b) return;
    play("click");
    ui.tab = b.dataset.tab; detail = null; cancelTier(); persistUI();
    if (query) clearSearch(false);
    renderTabs(); render();
  });
  $("#tabs").addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

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
      else if (detail) { play("back"); detail = null; render(); }
      else if (query) { play("back"); clearSearch(); }
    }
  });

  /* =====================================================================
     MAIN RENDER
     ===================================================================== */
  function render() {
    screen.classList.toggle("show-locked-names", !!settings.lockedNames);
    if (detail && byId.has(detail.id)) {
      let e = byId.get(detail.id);
      if (e.isCard) e = e.card.members[0];    // a group card opens on its first variant
      return detail.type === "tool" ? renderToolDetail(e) : detail.type === "doc" ? renderDocDetail(e) : renderPersonDetail(e);
    }
    detail = null;
    if (query) return renderSearch();
    ({ profile: renderProfile, cloud: renderCloud, manual: renderManual, settings: renderSettings,
       tools: renderTools, biography: renderBio, documents: renderDocs })[ui.tab]();
  }

  /* =====================================================================
     TOOLS
     ===================================================================== */
  /* the star that appears on hover: the only way to mark/unmark from a list */
  function hstar(id, name) {
    const on = isFound(id);
    return `<span class="hstar${on ? " on" : ""}" data-star="${esc(id)}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${on ? "Unmark" : "Mark"} ${esc(name)} as found" title="${on ? "Found: click to unmark" : "Click to mark as found"}">${I.star(on)}</span>`;
  }
  /* font size that fills a tile the way the game does */
  function tileFont(name) {
    const n = name.length;
    if (n <= 5) return "font-size:var(--tf-xl)";
    if (n <= 8) return "font-size:var(--tf-l)";
    if (n <= 11) return "font-size:var(--tf-m)";
    if (n <= 15) return "font-size:var(--tf-s)";
    return "font-size:var(--tf-xs)";
  }
  function tileHTML(e) {
    const got = isFound(e.id);
    const l = label(e);
    if (!got) {
      return `<button class="tile locked" data-open-tool="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}: not found">
        <span class="lock">${I.lock}</span><span class="lname">${esc(l)}</span>${hstar(e.id, l)}</button>`;
    }
    return `<button class="tile${e.special ? " special" : ""}" data-open-tool="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}">
      <span class="tname" style="${tileFont(l)}">${esc(l)}</span>${hstar(e.id, l)}</button>`;
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
    return `<div class="tier-head"><button class="tier-btn" data-tier="${key}" title="${allFound ? "Lock" : "Unlock"} every weapon in this tier">TIER ${tier}<span class="tier-hint">${allFound ? "click to lock all" : "click to unlock all"}</span></button><small>${f}/${t}</small></div>`;
  }

  function renderTools() {
    const cats = PDA_DATA.tools;
    if (ui.cat >= cats.length) ui.cat = 0;
    const cat = cats[ui.cat];
    const catBtns = cats.map((c, i) => {
      const [f, t] = countOf(c.items);
      const n = c.name.length, cf = n <= 7 ? 38 : n <= 9 ? 33 : n <= 12 ? 27 : 21;
      return `<button class="cat" data-cat="${i}" aria-selected="${i === ui.cat}" style="--cf:${cf}px">${esc(c.name)}${t ? `<span class="mini">${f}/${t}</span>` : ""}</button>`;
    }).join("");

    let body = "";
    const tiers = Object.keys(cat.tiers).sort((a, b) => a - b);
    if (!tiers.length) {
      body = `<div class="empty-cat"><b>NO ENTRIES ON FILE</b>Add this category's weapons to data.js to track them.</div>`;
    } else {
      if (cat.note) body += `<p class="cat-note">${esc(cat.note)}</p>`;
      tiers.forEach(tier => {
        const all = cat.items.filter(e => e.tier === +tier);
        let items = sortEntries(all);
        if (settings.hideFound) items = items.filter(e => !isFound(e.id));
        body += tierHeadHTML(ui.cat, tier, all);
        body += items.length ? `<div class="tier-box">${items.map(tileHTML).join("")}</div>`
                             : `<div class="tier-box"><div class="cat-note" style="grid-column:1/-1">All found.</div></div>`;
      });
    }
    screen.innerHTML = `<div class="tools"><div class="cats" role="tablist" aria-label="Categories">${catBtns}</div><div class="grid-wrap" id="grid">${body}</div></div>`;
  }

  /* the "unlock this whole tab" bar under Biography / Documents sub-tabs */
  function tabBarHTML(kind, idx, items, name) {
    const [f, t] = countOf(items);
    const key = `tab:${kind}:${idx}`;
    const all = f === t;
    if (pendingTier === key) {
      return `<div class="tabbar confirm"><span><b>// ARE YOU SURE?</b> ${all ? `LOCK ALL ${t}` : `UNLOCK ALL ${t - f} REMAINING`} IN ${esc(name.toUpperCase())}</span>
        <span class="tier-actions"><button class="tier-yes" data-tier-yes="${key}">YES</button><button class="tier-no" data-tier-no>NO</button></span></div>`;
    }
    return `<div class="tabbar"><span class="tb-count">${esc(name)}: ${f} / ${t} found</span><button class="tier-btn tabbtn" data-tier="${key}">${all ? "LOCK ENTIRE TAB" : "UNLOCK ENTIRE TAB"}</button></div>`;
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
      items = (kind === "bio" ? PDA_DATA.biography : PDA_DATA.documents)[+idx].items;
    } else {
      const [ci, tier] = key.split("|");
      items = PDA_DATA.tools[+ci].items.filter(e => e.tier === +tier);
    }
    const lockAll = items.every(e => isFound(e.id));
    items.forEach(e => setFound(e.id, !lockAll));
    save(KEY_FOUND, found); updateCount();
    play(lockAll ? "deselect" : "confirm");
    cancelTier();
  }

  /* colours copied from the game's weapon stat page */
  const TOOL_STAT_COLORS = {
    "CALIBER TYPE": "#ff2a2a", "AUTO": "#ff8a3a", "BURST": "#ff8a3a", "BURST DELAY": "#ff8a3a",
    "BURST AMOUNT": "#ff8a3a", "BURST VOLLEY": "#ff8a3a", "STRENGTH": "#ff4fa0", "AIM TIME": "#35d6ff",
    "SWITCH TIME": "#ffa82a", "RPM": "#fff04a", "ALERT RADIUS": "#5a5aff", "RELOAD MODIFIER": "#2ae0e0",
    "WEAPON TYPE": "#d04aff", "MAX SPREAD": "#9a8aff", "MINIMUM SPREAD": "#9a8aff",
    "SPREAD INCREMENT": "#d8a0ff", "SPREAD DECREASE": "#d8a0ff", "EQUIP TIME": "#e8a070",
    "WEIGHT": "#2a2a2a", "TIER": "#fff89a"
  };
  const GAP_BEFORE = new Set(["MAX SPREAD", "EQUIP TIME", "WEIGHT"]);
  const paras = t => esc(t).split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

  function renderToolDetail(e) {
    const got = isFound(e.id);
    const l = label(e);
    const stats = Object.entries(e.stats || {});
    if (stats.length) stats.push(["TIER", `TIER ${e.tier}`]);
    else stats.push(["TIER", `TIER ${e.tier}`]);
    const statHTML = stats.map(([k, v]) => {
      const tip = (TIPS.weapon || {})[k];
      const gap = GAP_BEFORE.has(k) || (k === "TIER" && !e.stats) ? " gap" : "";
      return `<div class="stat${gap}"${tip ? ` data-tip="${esc(tip)}"` : ""}><i style="color:${TOOL_STAT_COLORS[k] || "#ddd"}${k === "WEIGHT" ? ";text-shadow:0 0 1px #888" : ""}">${esc(k)}</i>: ${esc(v)}</div>`;
    }).join("");
    const users = whoCarries(e.name);
    const imgs = imagesOf(e);
    screen.innerHTML = `
      <div class="detail">
        <div class="dbox"><div class="dhead">Preview${arrowsHTML(imgs)}</div>
          <div class="preview">${previewHTML(imgs, `<span class="ph">${I.gun}</span>`)}
            <button class="star" id="star" data-star="${esc(e.id)}" aria-pressed="${got}" title="${got ? "Found: click to unmark" : "Not found: click to mark"}">${I.star(got)}</button>
          </div></div>
        <div class="dbox"><div class="dhead">Statistics<span class="hright"><span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="stats"><h2 style="color:${e.special ? "var(--red)" : "#fff"}">// ${esc(l.toUpperCase())}</h2>
            ${statHTML}
            ${users.length ? `<div class="stat gap"><i style="color:#f3ee30">CARRIED BY</i>: ${users.map(u => `<button class="linkish" data-person="${esc(u.id)}">${esc(u.name)}</button>`).join(", ")}</div>` : ""}
          </div></div>
        <div class="dbox comment"><div class="dhead">Comment</div><div class="desc">${e.comment ? paras(e.comment) : '<p class="none">No comment.</p>'}</div></div>
      </div>`;
  }

  /* people whose loadout mentions this weapon name */
  const loadName = s => slug(String(s).replace(/\s*\(Random\)\s*$/i, ""));
  function whoCarries(name) {
    const n = slug(name);
    return people.filter(e => (e.loadout || []).some(([k, v]) => k === "Weapon" && loadName(v) === n));
  }

  /* =====================================================================
     BIOGRAPHY
     ===================================================================== */
  function renderBio() {
    const groups = PDA_DATA.biography;
    if (ui.bio >= groups.length) ui.bio = 0;
    const g = groups[ui.bio];
    const tabs = groups.map((x, i) => {
      const [f, t] = countOf(x.items);
      return `<button class="subtab" data-bio="${i}" aria-selected="${i === ui.bio}" style="--sc:${x.color};--sbg:${x.bg}">${esc(x.name)}<span class="n">${f}/${t}</span></button>`;
    }).join("");
    let cards = sortCards(g.cards);
    if (settings.hideFound) cards = cards.filter(c => !cardFound(c));
    const html = cards.map(c => cardHTML(c, g)).join("");
    screen.innerHTML = `<div class="subwrap"><div class="subtabs" role="tablist">${tabs}</div>${tabBarHTML("bio", ui.bio, g.items, g.name)}<div class="cards">${html || '<p class="cat-note">All found.</p>'}</div></div>`;
  }

  function cardHTML(c, g) {
    const got = cardFound(c);
    const isGroup = c.kind === "group";
    const first = c.members[0];
    const l = isGroup ? c.name : label(first);
    const ci = imagesOf(c.entry, c, first);
    const pic = got ? (ci.length ? `<img src="${esc(ci[0].src)}" alt="" loading="lazy">` : (isGroup ? I.people : I.person)) : I.question;
    const [f, t] = countOf(c.members);
    const tip = `${l}: ${got ? "found" : "not found"}${isGroup ? ` (${t} variants)` : ""}`;
    return `<button class="card${got ? "" : " missing"}${isGroup ? " group" : ""}" data-open="${esc(first.id)}" data-entry="${esc(first.id)}" style="--c:${g.color}" title="${esc(tip)}">
      <span class="pic">${pic}</span>
      ${isGroup ? `<span class="count" title="${t} variants">×${t}</span>` : ""}${hstar(c.entry.id, l)}
      <span class="nm" style="${fit(l, 26)}">${esc(l)}</span></button>`;
  }

  function statRow(key, val) {
    const s = STAT[key] || { c: "#ddd", i: "", u: "", tip: "" };
    let v = String(val);
    if (s.u && v !== "true" && !/[a-z%]$/i.test(v)) v += s.u;
    const icon = s.i ? `<svg viewBox="0 0 24 24" fill="currentColor">${SI[s.i]}</svg>` : "";
    return `<div class="erow" style="--rc:${s.c}" ${s.tip ? `data-tip="${esc(s.tip)}"` : ""}><span class="ei">${icon}</span><span class="ek">${esc(key)}:</span> <span class="ev">${esc(v)}</span></div>`;
  }

  /* the people in the current Biography tab, in on-screen order (for the < > arrows) */

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
        if (k !== "Weapon") return statRow(k, v);
        const tool = entries.find(t => t.section === "tools" && slug(t.name) === loadName(v));
        return tool ? statRow(k, v).replace(/<span class="ev">(.*?)<\/span>/, `<button class="ev linkish" data-tool="${esc(tool.id)}" title="Open ${esc(tool.name)}">$1</button>`) : statRow(k, v);
      })
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
          <div class="preview">${previewHTML(imgs, `<span class="ph big">${got ? I.person : I.question}</span>`)}</div>
        </div>
        <div class="dbox edata"><div class="dhead">Enemy Data
            <span class="hright"><span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="ename">${esc(l)}</div>
          <div class="ebody">
            <div class="erows">${empty ? '<div class="esec" style="color:#888">NO DATA ON FILE</div>' : rows}</div>
            <button class="estar${got ? " on" : ""}" data-star="${esc(e.id)}" aria-pressed="${got}" title="${members.length ? `${got ? "Found" : "Not found"}: this star covers all ${members.length} ${esc(card.name)} variants` : got ? "Found: click to unmark" : "Click to mark as found"}">${I.star(got)}</button>
          </div>
          ${mtabs}
        </div>
        <div class="dbox pdesc"><div class="dhead">Description</div>
          <div class="desc">${desc ? paras(desc) : '<p class="none">No description on file.</p>'}</div>
        </div>
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
            <span class="hright"><span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="ename">${esc(l)}</div>
          <div class="ebody">
            <div class="erows">
              ${statRow("Type", type)}
              ${statRow("Category", g.name)}
            </div>
            <button class="estar${got ? " on" : ""}" data-star="${esc(e.id)}" aria-pressed="${got}" title="${got ? "Found: click to unmark" : "Click to mark as found"}">${I.star(got)}</button>
          </div>
        </div>
        <div class="dbox pdesc"><div class="dhead">Description</div>
          <div class="desc">${e.desc ? paras(e.desc) : '<p class="none">No description on file.</p>'}</div>
        </div>
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
        <span class="pic">${I.lock}</span>${hstar(e.id, l)}
        <span class="nm"><span class="tag">- MISSING -</span>${settings.lockedNames && !e.unknown ? `<span class="sub">${esc(l)}</span>` : ""}</span></button>`;
    }
    return `<button class="doc ${e.kind}" data-open-doc="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}">
      <span class="pic">${icon}</span>${hstar(e.id, l)}<span class="nm" style="${fit(l, 26)}">${esc(l)}</span></button>`;
  }
  function renderDocs() {
    const groups = PDA_DATA.documents;
    if (ui.docs >= groups.length) ui.docs = 0;
    const g = groups[ui.docs];
    const tabs = groups.map((x, i) => {
      const [f, t] = countOf(x.items);
      const [c, bg] = DOC_TAB[x.kind];
      return `<button class="subtab striped" data-docs="${i}" aria-selected="${i === ui.docs}" style="--sc:${c};--sbg:${bg}">${esc(x.name)}<span class="n">${f}/${t}</span></button>`;
    }).join("");
    let items = sortEntries(g.items);
    if (settings.hideFound) items = items.filter(e => !isFound(e.id));
    screen.innerHTML = `<div class="subwrap"><div class="subtabs" role="tablist">${tabs}</div>${tabBarHTML("docs", ui.docs, g.items, g.name)}<div class="cards">${items.map(docHTML).join("") || '<p class="cat-note">All found.</p>'}</div></div>`;
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
  function renderSearch() {
    const q = slug(query);
    const hits = [];
    [...entries, ...people.filter(v => v.trackId)].forEach(e => {
      if (e.unknown) return;
      const s = score(e.name, q);
      if (s >= 0) hits.push([s, e]);
    });
    hits.sort((a, b) => a[0] - b[0] || (isFound(a[1].id) === isFound(b[1].id) ? collator.compare(a[1].name, b[1].name) : isFound(a[1].id) ? -1 : 1));
    // people carrying a weapon whose name matches
    const carriers = people.filter(e => (e.loadout || []).some(([k, v]) => k === "Weapon" && score(loadName(v), q) >= 0 && score(loadName(v), q) <= 3))
                            .filter(e => !hits.some(h => h[1] === e));
    const section = (title, list, note) => list.length ? `<div class="sgroup"><div class="tier-head">${title}<small>${list.length}${note ? " " + note : ""}</small></div>${list.map(resultHTML).join("")}</div>` : "";
    const by = s => hits.filter(h => h[1].section === s).map(h => h[1]);
    const html = section("TOOLS", by("tools")) + section("PEOPLE", by("bio")) + section("DOCUMENTS", by("docs")) +
                 section("CARRIES A MATCHING WEAPON", carriers);
    screen.innerHTML = `<div class="results">${html || `<div class="empty-cat"><b>NO MATCHES</b>Nothing in the PDA is called “${esc(query)}”.</div>`}</div>`;
  }
  function resultHTML(e) {
    const got = isFound(e.id);
    const open = { tools: "data-open-tool", bio: "data-open", docs: "data-open-doc" }[e.section];
    return `<div class="sres${got ? " got" : ""}${e.special ? " special" : ""}">
      <button class="sres-main" ${open}="${esc(e.id)}" data-entry="${esc(e.id)}" title="Open ${esc(e.name)}">
        <span class="sres-ic">${got ? I.check : I.lock}</span>
        <span class="sres-name">${esc(e.name)}</span>
        <span class="sres-ctx">${esc(contextOf(e))}</span>
      </button>
      <button class="sres-star${got ? " on" : ""}" data-star="${esc(e.id)}" aria-pressed="${got}" title="${got ? "Found: click to unmark" : "Click to mark as found"}">${I.star(got)}</button>
    </div>`;
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
          <h3>DATABANK PROGRESS //</h3>
          ${rows}
        </div>
      </div>`;
    $("#uname").addEventListener("input", ev => {
      user = ev.target.value; save(KEY_USER, user);
      $(".uname").textContent = user || "player";
      $(".face").textContent = (user.trim().charAt(0) || "?").toUpperCase();
    });
  }

  function renderCloud(msg = "", bad = false) {
    screen.innerHTML = `
      <div class="cloud">
        <div class="dhead">Download Entries<span style="display:flex;width:18px">${I.download}</span></div>
        <div class="cloud-body">
          <p>Your checkmarks are saved in this browser only. Download a backup file to keep them safe or to move them to another device or browser, then upload it there.</p>
          <button class="pbtn" id="exp">${I.download} DOWNLOAD BACKUP</button>
          <button class="pbtn" id="imp">${I.upload} UPLOAD BACKUP</button>
          <div class="msg" id="cmsg" style="${bad ? "color:#ff7a7a" : ""}">${esc(msg)}</div>
        </div>
      </div>`;
    $("#exp").onclick = () => {
      play("click");
      const blob = new Blob([JSON.stringify({ app: "onc-pda-tracker", v: 1, user, found }, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pda-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      $("#cmsg").textContent = "Backup downloaded.";
    };
    $("#imp").onclick = () => { play("click"); $("#importFile").click(); };
  }
  $("#importFile").addEventListener("change", async ev => {
    const file = ev.target.files[0]; ev.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.found !== "object") throw new Error();
      found = {}; Object.keys(data.found).forEach(k => { if (data.found[k]) found[k] = 1; });
      if (typeof data.user === "string") { user = data.user; save(KEY_USER, user); }
      save(KEY_FOUND, found); updateCount(); play("confirm");
      renderCloud(`Restored ${Object.keys(found).length} entries.`);
    } catch {
      play("warn");
      renderCloud("That file isn't a PDA backup.", true);
    }
  });

  function renderManual() {
    screen.innerHTML = `
      <div class="manual">
        <h3>-=-=- TRACKER GUIDE -=-=-</h3>
        <h4>How do I mark something as found?</h4>
        <p>Hover over any weapon, person or document and a star appears in its corner. Click the star to mark it found, and click it again to unmark it. On a phone the star is always showing. Every stat page also has a star.</p>
        <h4>How do I see stats?</h4>
        <p>Just click the weapon, person or document. Cards that hold several variants (like Robinson or Rogues) are one unlock: mark the card and every variant inside it counts, then switch between them with the tabs along the bottom. The arrows next to Preview step through the rest of that tab.</p>
        <h4>Can I unlock a whole tab of people or documents?</h4>
        <p>Use UNLOCK ENTIRE TAB under the sub-tabs in BIOGRAPHY or DOCUMENTS. Like tiers, it asks "ARE YOU SURE?" first.</p>
        <h4>What do the stats mean?</h4>
        <p>Hover over any stat name (tap it on a phone) to see what it does. Pictures can have hover text too.</p>
        <h4>Can I unlock a whole tier at once?</h4>
        <p>Click a TIER header in TOOLS. It asks "ARE YOU SURE?" first, so a misclick won't do anything until you press YES. If the tier is already complete, the same button locks it all again.</p>
        <h4>How are entries ordered?</h4>
        <p>Everything you've found comes first in A–Z order, then everything you haven't found, also A–Z.</p>
        <h4>Will I lose my progress?</h4>
        <p>Progress is saved in this browser. Clearing site data or using a private window will lose it, so use CLOUD to download a backup now and then.</p>
        <h3>-=-=- QUICK KEYS -=-=-</h3>
        <div class="k">/ - SEARCH</div>
        <div class="k">ESC - BACK / CLEAR SEARCH</div>
        <div class="k">MOUSE WHEEL ON TABS - SCROLL TABS</div>
        <div class="k">CLICK ENTRY - OPEN IT</div>
        <div class="k">HOVER + STAR - MARK FOUND / MISSING</div>
        <div class="k">CLICK TIER HEADER - UNLOCK WHOLE TIER</div>
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
    screen.innerHTML = `
      <div class="settings">
        <h3>Sound</h3>
        ${sw("sound", "Sound effects?")}
        ${sw("hoverSound", "Play a sound when hovering over things?")}
        <div class="srow"><input type="range" id="vol" min="0" max="100" step="5" value="${settings.volume}" aria-label="Volume"><span>Volume: <b id="volv">${settings.volume}</b>%</span></div>
        <h3>User Preference</h3>
        ${sw("lockedNames", "Show names on locked entries?")}
        ${sw("hideFound", "Hide entries you've already found?")}
        <h3>Data</h3>
        <div class="srow"><button class="pbtn danger" id="reset">RESET ALL PROGRESS</button><span id="rmsg" style="font-size:13px;color:#aaa"></span></div>
      </div>`;
    const vol = $("#vol");
    vol.addEventListener("input", () => { settings.volume = +vol.value; $("#volv").textContent = vol.value; save(KEY_SET, settings); });
    vol.addEventListener("change", () => play("select"));
    $("#reset").onclick = ev => {
      const b = ev.currentTarget;
      if (b.dataset.armed) {
        found = {}; save(KEY_FOUND, found); updateCount(); play("deselect");
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
  function keepScroll(fn) {
    const sc = screen.querySelector("#grid, .cards, .results, .erows");
    const y = sc ? sc.scrollTop : 0;
    fn();
    const s2 = screen.querySelector("#grid, .cards, .results, .erows");
    if (s2) s2.scrollTop = y;
  }
  function flash(id) {
    const el = screen.querySelector(`[data-entry="${CSS.escape(id)}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
  const openDetail = (type, id) => { play("open"); imgIndex = 0; detail = { type, id }; render(); };

  function handleStar(star) {
    const id = star.dataset.star;
    toggle(id);
    if (detail) { render(); return; }
    keepScroll(render);
    flash(id);
  }

  screen.addEventListener("click", ev => {
    const t = ev.target;
    // anything other than the YES/NO buttons cancels a pending tier prompt
    if (pendingTier && !t.closest("[data-tier-yes],[data-tier-no],[data-tier]")) { cancelTier(); }

    // the star is checked first, so pressing it never also opens the entry under it
    const star = t.closest("[data-star]");
    if (star) { ev.preventDefault(); handleStar(star); return; }

    const arrow = t.closest("[data-img]");
    if (arrow) { play("click"); imgIndex += +arrow.dataset.img; render(); return; }

    const yes = t.closest("[data-tier-yes]");
    if (yes) { applyTier(yes.dataset.tierYes); keepScroll(render); return; }
    if (t.closest("[data-tier-no]")) { play("back"); cancelTier(); keepScroll(render); return; }
    const tierBtn = t.closest("[data-tier]");
    if (tierBtn) { askTier(tierBtn.dataset.tier); keepScroll(render); return; }

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
    if (cat) { play("click"); ui.cat = +cat.dataset.cat; persistUI(); render(); const g = $("#grid"); if (g) g.scrollTop = 0; return; }
    const bio = t.closest("[data-bio]");
    if (bio) { play("click"); ui.bio = +bio.dataset.bio; persistUI(); render(); return; }
    const docs = t.closest("[data-docs]");
    if (docs) { play("click"); ui.docs = +docs.dataset.docs; persistUI(); render(); return; }
    if (t.closest("#ret")) { play("back"); detail = null; render(); return; }
  });
  // keyboard: Enter / Space on a focused star
  screen.addEventListener("keydown", ev => {
    const star = ev.target.closest && ev.target.closest(".hstar");
    if (star && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ev.stopPropagation(); handleStar(star); }
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

  /* ---------- go ---------- */
  renderTabs();
  updateCount();
  render();
  const active = document.querySelector('.tab[aria-selected="true"]');
  if (active) active.scrollIntoView({ inline: "nearest", block: "nearest" });
})();
