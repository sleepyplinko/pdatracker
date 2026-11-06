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
  const KEY_FAV   = "pda-fav-v1";
  const KEY_NOTES = "pda-notes-v1";
  const KEY_LOG   = "pda-log-v1";
  const KEY_SEEN  = "pda-seen-v1";
  const KEY_FRIEND= "pda-friend-v1";
  const KEY_SINCE = "pda-since-backup-v1";
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

  let found    = load(KEY_FOUND, {});
  let settings = Object.assign({ lockedNames: false, hideFound: false, sound: true, hoverSound: true, volume: 70 }, load(KEY_SET, {}));
  const savedUI = load(KEY_UI, {});
  let ui       = Object.assign({ tab: "tools", cat: 0, bio: 0, docs: 0, view: "grid", filter: "all", stype: "all", btab: "desc" }, savedUI);
  if (!("filter" in savedUI) && settings.hideFound) ui.filter = "missing";   // old "hide found" setting
  let favs     = load(KEY_FAV, {});
  let notes    = load(KEY_NOTES, {});
  let history_ = load(KEY_LOG, []);
  let friend   = load(KEY_FRIEND, null);      // { name, set } from a friend's share link
  let sinceBackup = load(KEY_SINCE, 0);
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

  const HOVERABLE = ".favbtn, .btab, .chip-btn, .viewtools button, .sres-ic, .tabbtn, .tab, .cat, .tile, .card, .doc, .subtab, .pbtn, .return, .star, .estar, .hstar, .arrow, .linkish, .tier-btn, .tier-yes, .tier-no, .onoff button, .sres-main, .sres-star, .mtab, .clear-search";
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
  const isFound   = id => !!(viewOnly ? viewOnly.set : found)[trackOf(id)];
  const cardFound = c => isFound(c.entry.id);
  // older saves tracked each variant separately: fold those into their card
  people.forEach(v => { if (v.trackId) { const old = `${v.trackId.replace(/\|[^|]*$/, "")}|${slug(v.card.name)}|${slug(v.name)}`; if (found[old]) { found[v.trackId] = 1; delete found[old]; } } });
  const countOf   = list => [list.filter(e => isFound(e.id)).length, list.length];
  const label     = e => e.unknown ? "???" : e.name;

  /* NEW badges: anything not in the list saved on your last visit */
  const allTracked = entries.map(e => e.id);
  const seenPrev = load(KEY_SEEN, null);
  const newIds = new Set(Array.isArray(seenPrev) ? allTracked.filter(id => !seenPrev.includes(id)) : []);
  save(KEY_SEEN, allTracked);

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

  const passFilter = on => ui.filter === "all" || (ui.filter === "missing" ? !on : on);

  /* every mark/unmark goes through here: saves, logs, offers undo */
  function change(ids, on, what) {
    if (viewOnly) { play("warn"); toast("This is someone else's PDA. Press EXIT at the top to go back to yours."); return false; }
    const before = { ...found };
    const changed = [];
    ids.forEach(id => { const t = trackOf(id); if (!!found[t] !== on) { if (on) found[t] = 1; else delete found[t]; changed.push(t); } });
    if (!changed.length) return false;
    save(KEY_FOUND, found); updateCount();
    undoStack.push(before); if (undoStack.length > 30) undoStack.shift();
    const now = Date.now();
    if (changed.length <= 3) changed.forEach(id => history_.unshift({ id, on, t: now }));
    else history_.unshift({ bulk: what || "several entries", n: changed.length, on, t: now });
    history_ = history_.slice(0, 60); save(KEY_LOG, history_);
    sinceBackup += changed.length; save(KEY_SINCE, sinceBackup);
    const nm = changed.length === 1 ? (byId.get(changed[0]) || {}).name : `${changed.length} entries`;
    toast(`${on ? "Marked" : "Unmarked"} ${nm}${on ? " as found" : ""}`, { undo: true });
    backupNag();
    return true;
  }
  function undo() {
    if (viewOnly || !undoStack.length) { toast("Nothing to undo."); return; }
    found = undoStack.pop();
    save(KEY_FOUND, found); updateCount();
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
    profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#111"/><circle cx="12" cy="9.5" r="3.6" fill="#ddd"/><path d="M5.5 18.5c1.4-3 3.8-4.4 6.5-4.4s5.1 1.4 6.5 4.4" fill="#ddd"/></svg>',
    cloud:   '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/><path d="M12 10v6m-2.5-2.5L12 16l2.5-2.5"/></svg>',
    manual:  '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#111"/><path d="M6 12.5l4 4 8-9" fill="none" stroke="#ddd" stroke-width="2.6"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="#111"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
    missing: '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10"/></svg>',
    heart: on => `<svg viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`,
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="#111"><path d="M3 5.5 7.5 1l5 4-2 2 9.5 13-2 2L5 12.5l-2 2-1-5z"/></svg>',
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
  const TABS = ["profile", "cloud", "manual", "settings", "tools", "biography", "documents", "missing"];
  const TAB_LABEL = { missing: "WHAT'S LEFT" };
  function renderTabs() {
    $("#tabs").innerHTML = TABS.map(t =>
      `<button class="tab" role="tab" data-tab="${t}" aria-selected="${!query && ui.tab === t}">${I[t]}<span>${TAB_LABEL[t] || t.toUpperCase()}</span></button>`
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
    syncToolbar(); renderBanner();
    if (detail && byId.has(detail.id)) {
      let e = byId.get(detail.id);
      if (e.isCard) e = e.card.members[0];    // a group card opens on its first variant
      return detail.type === "tool" ? renderToolDetail(e) : detail.type === "doc" ? renderDocDetail(e) : renderPersonDetail(e);
    }
    detail = null;
    if (query) return renderSearch();
    ({ profile: renderProfile, cloud: renderCloud, manual: renderManual, settings: renderSettings,
       tools: renderTools, biography: renderBio, documents: renderDocs, missing: renderMissing })[ui.tab]();
  }

  /* =====================================================================
     TOOLS
     ===================================================================== */
  /* little tags on tiles/cards: NEW, friend has it, favourite */
  function badges(e) {
    const t = trackOf(e.id);
    const out = [];
    if (newIds.has(t)) out.push('<b class="bnew" title="Added since your last visit">NEW</b>');
    if (friend && !viewOnly && friend.set[t] && !found[t]) out.push(`<b class="bfr" title="${esc(friend.name || "Your friend")} has this and you don't">${esc((friend.name || "F").charAt(0).toUpperCase())}✓</b>`);
    if (favs[e.id] || favs[t]) out.push('<b class="bfav" title="Favourite">♥</b>');
    return out.length ? `<span class="badges">${out.join("")}</span>` : "";
  }
  const pbar = (f, t) => `<span class="pbar"><i style="width:${t ? Math.round(f / t * 100) : 0}%"></i></span>`;

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
        <span class="lock">${I.lock}</span><span class="lname">${esc(l)}</span>${hstar(e.id, l)}${badges(e)}</button>`;
    }
    return `<button class="tile${e.special ? " special" : ""}" data-open-tool="${esc(e.id)}" data-entry="${esc(e.id)}" title="${esc(l)}">
      <span class="tname" style="${tileFont(l)}">${esc(l)}</span>${hstar(e.id, l)}${badges(e)}</button>`;
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
    return `<div class="tier-head${allFound ? " complete" : ""}"><button class="tier-btn" data-tier="${key}" title="${allFound ? "Lock" : "Unlock"} every weapon in this tier">TIER ${tier}<span class="tier-hint">${allFound ? "click to lock all" : "click to unlock all"}</span></button><small>${f}/${t}</small>${pbar(f, t)}</div>`;
  }

  function renderTools() {
    const cats = PDA_DATA.tools;
    if (ui.cat >= cats.length) ui.cat = 0;
    const cat = cats[ui.cat];
    const catBtns = cats.map((c, i) => {
      const [f, t] = countOf(c.items);
      const n = c.name.length, cf = n <= 7 ? 38 : n <= 9 ? 33 : n <= 12 ? 27 : 21;
      return `<button class="cat${t && f === t ? " complete" : ""}" data-cat="${i}" aria-selected="${i === ui.cat}" style="--cf:${cf}px">${esc(c.name)}${t ? `<span class="mini">${f}/${t}</span>${pbar(f, t)}` : ""}</button>`;
    }).join("");

    let body = "";
    const tiers = Object.keys(cat.tiers).sort((a, b) => a - b);
    if (!tiers.length) {
      body = `<div class="empty-cat"><b>NO ENTRIES ON FILE</b>Add this category's weapons to data.js to track them.</div>`;
    } else {
      if (cat.note) body += `<p class="cat-note">${esc(cat.note)}</p>`;
      tiers.forEach(tier => {
        const all = cat.items.filter(e => e.tier === +tier);
        const items = sortEntries(all).filter(e => passFilter(isFound(e.id)));
        body += tierHeadHTML(ui.cat, tier, all);
        const none = `<div class="cat-note" style="grid-column:1/-1">${ui.filter === "found" ? "Nothing found here yet." : "All found."}</div>`;
        body += ui.view === "list"
          ? `<div class="list">${items.map(e => resultHTML(e)).join("") || none}</div>`
          : `<div class="tier-box">${items.map(tileHTML).join("") || none}</div>`;
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
      items = (kind === "bio" ? PDA_DATA.biography : PDA_DATA.documents)[+idx].items;
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
    "WEIGHT": "#2a2a2a", "TIER": "#fff89a"
  };
  const GAP_BEFORE = new Set(["MAX SPREAD", "EQUIP TIME", "WEIGHT"]);
  const favBtn = id => `<button class="favbtn${favs[id] ? " on" : ""}" data-fav="${esc(id)}" title="${favs[id] ? "Remove from favourites" : "Add to favourites (shows on your Profile)"}">${I.heart(!!favs[id])}</button>`;
  /* bottom box with two tabs: the game's text, and your own notes */
  function bottomBox(first, textHTML, noteId) {
    const nt = ui.btab === "notes";
    const has = !!(notes[noteId] || "").trim();
    return `<div class="dhead btabs"><button class="btab${nt ? "" : " on"}" data-btab="desc">${first}</button><button class="btab${nt ? " on" : ""}" data-btab="notes">My Notes${has ? " •" : ""}</button></div>
      ${nt ? `<textarea class="notes" data-note="${esc(noteId)}" placeholder="Your own notes, saved in this browser (where you found it, what it needs...)">${esc(notes[noteId] || "")}</textarea>` : `<div class="desc">${textHTML}</div>`}`;
  }
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
        <div class="dbox"><div class="dhead">Statistics<span class="hright">${favBtn(e.id)}<span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="stats"><h2 style="color:${e.special ? "var(--red)" : "#fff"}">// ${esc(l.toUpperCase())}</h2>
            ${statHTML}
            ${users.length ? `<div class="stat gap"><i style="color:#f3ee30">CARRIED BY</i>: ${users.map(u => `<button class="linkish" data-person="${esc(u.id)}">${esc(u.name)}</button>`).join(", ")}</div>` : ""}
          </div></div>
        <div class="dbox comment">${bottomBox("Comment", e.comment ? paras(e.comment) : '<p class="none">No comment.</p>', e.id)}</div>
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
      return `<button class="subtab${f === t ? " complete" : ""}" data-bio="${i}" aria-selected="${i === ui.bio}" style="--sc:${x.color};--sbg:${x.bg}" title="${i === ui.bio ? "Click again to unlock the whole tab" : ""}">${esc(x.name)}<span class="n">${f}/${t}</span>${pbar(f, t)}</button>`;
    }).join("");
    const cards = sortCards(g.cards).filter(c => passFilter(cardFound(c)));
    const html = ui.view === "list" ? cards.map(c => resultHTML(c.entry)).join("") : cards.map(c => cardHTML(c, g)).join("");
    const none = `<p class="cat-note">${ui.filter === "found" ? "Nothing found here yet." : "All found."}</p>`;
    screen.innerHTML = `<div class="subwrap"><div class="subtabs" role="tablist">${tabs}</div>${tabBarHTML("bio", ui.bio, g.items, g.name)}<div class="cards${ui.view === "list" ? " aslist" : ""}">${html || none}</div></div>`;
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
      ${isGroup ? `<span class="count" title="${t} variants">×${t}</span>` : ""}${hstar(c.entry.id, l)}${badges(c.entry)}
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
            <span class="hright">${favBtn(e.id)}<span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
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
            <span class="hright">${favBtn(e.id)}<span class="chip ${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span><button class="return" id="ret">RETURN</button></span></div>
          <div class="ename">${esc(l)}</div>
          <div class="ebody">
            <div class="erows">
              ${statRow("Type", type)}
              ${statRow("Category", g.name)}
            </div>
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
    const special = query.trim().toLowerCase() === ":new";
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
    return `<div class="sres${got ? " got" : ""}${e.special ? " special" : ""}">
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
  function renderMissing() {
    const [f, t] = countOf(entries);
    const groups = [];
    PDA_DATA.tools.forEach(c => groups.push(["TOOLS › " + c.name, c.items]));
    PDA_DATA.biography.forEach(g => groups.push(["BIOGRAPHY › " + g.name, g.items]));
    PDA_DATA.documents.forEach(g => groups.push(["DOCUMENTS › " + g.name, g.items]));
    const body = groups.map(([name, items]) => {
      const left = sortEntries(items.filter(e => !isFound(e.id)));
      if (!left.length) return "";
      return `<div class="sgroup"><div class="tier-head">${esc(name)}<small>${left.length} left</small>${pbar(items.length - left.length, items.length)}</div>${left.map(e => resultHTML(e)).join("")}</div>`;
    }).join("");
    screen.innerHTML = `<div class="results">
      <div class="leftsum"><b>${t - f}</b> left to find · ${f} / ${t} found (${t ? Math.round(f / t * 100) : 0}%)${pbar(f, t)}</div>
      ${body || '<div class="empty-cat"><b>EVERYTHING FOUND</b>Nice work.</div>'}</div>`;
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
        <div class="rows wide">
          <h3>USER FAVOURITES //</h3>
          ${favRows()}
        </div>
        <div class="rows wide">
          <h3>RECENTLY FOUND //</h3>
          ${recentRows()}
        </div>
      </div>`;
    $("#uname").addEventListener("input", ev => {
      user = ev.target.value; save(KEY_USER, user);
      $(".uname").textContent = user || "player";
      $(".face").textContent = (user.trim().charAt(0) || "?").toUpperCase();
    });
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
    const blob = new Blob([JSON.stringify({ app: "onc-pda-tracker", v: 2, user, found, favs, notes, log: history_ }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pda-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    sinceBackup = 0; save(KEY_SINCE, 0);
  }
  let nagged = false;
  function backupNag() {
    if (nagged || sinceBackup < 25) return;
    nagged = true;
    setTimeout(() => toast(`You've marked ${sinceBackup} things since your last backup.`, { action: () => { doExport(); toast("Backup downloaded."); }, actionLabel: "DOWNLOAD BACKUP", ms: 12000, nag: true }), 600);
  }

  function renderCloud(msg = "", bad = false) {
    screen.innerHTML = `
      <div class="cloud">
        <div class="dhead">Download Entries<span style="display:flex;width:18px">${I.download}</span></div>
        <div class="cloud-body">
          <p>Your checkmarks are saved in this browser only. Download a backup file to keep them safe or to move them to another device or browser, then upload it there.</p>
          <div class="btnrow"><button class="pbtn" id="exp">${I.download} DOWNLOAD BACKUP</button>
          <button class="pbtn" id="imp">${I.upload} UPLOAD BACKUP</button></div>
          <div class="msg" id="cmsg" style="${bad ? "color:#ff7a7a" : ""}">${esc(msg)}</div>
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
      found = {}; Object.keys(data.found).forEach(k => { if (data.found[k]) found[k] = 1; });
      if (typeof data.user === "string") { user = data.user; save(KEY_USER, user); }
      if (data.favs && typeof data.favs === "object") { favs = data.favs; save(KEY_FAV, favs); }
      if (data.notes && typeof data.notes === "object") { notes = data.notes; save(KEY_NOTES, notes); }
      if (Array.isArray(data.log)) { history_ = data.log.slice(0, 60); save(KEY_LOG, history_); }
      undoStack.length = 0; sinceBackup = 0; save(KEY_SINCE, 0);
      save(KEY_FOUND, found); updateCount(); play("confirm");
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
        <div class="srow dim">To hide found or missing entries, use the ALL / MISSING / FOUND buttons next to the search bar.</div>
        <h3>Data</h3>
        <div class="srow"><button class="pbtn danger" id="reset">RESET ALL PROGRESS</button><span id="rmsg" style="font-size:13px;color:#aaa"></span></div>
      </div>`;
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
  function keepScroll(fn) {
    const sc = screen.querySelector("#grid, .cards, .results, .erows");
    const y = sc ? sc.scrollTop : 0;
    const st = screen.querySelector(".subtabs"); const sx = st ? st.scrollLeft : 0;
    fn();
    const st2 = screen.querySelector(".subtabs"); if (st2) st2.scrollLeft = sx;
    const s2 = screen.querySelector("#grid, .cards, .results, .erows");
    if (s2) s2.scrollTop = y;
  }
  function flash(id) {
    const el = screen.querySelector(`[data-entry="${CSS.escape(id)}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
  const openDetail = (type, id) => { play("open"); imgIndex = 0; detail = { type, id }; render(); };

  function handleStar(star, shift) {
    const id = star.dataset.star;
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
    // clicking the sub-tab that's already open asks to unlock (or lock) the whole tab
    const bio = t.closest("[data-bio]");
    if (bio) {
      if (+bio.dataset.bio === ui.bio) { askTier(`tab:bio:${ui.bio}`); keepScroll(render); return; }
      play("click"); ui.bio = +bio.dataset.bio; persistUI(); render(); return;
    }
    const docs = t.closest("[data-docs]");
    if (docs) {
      if (+docs.dataset.docs === ui.docs) { askTier(`tab:docs:${ui.docs}`); keepScroll(render); return; }
      play("click"); ui.docs = +docs.dataset.docs; persistUI(); render(); return;
    }
    if (t.closest("#ret")) { play("back"); detail = null; render(); return; }
  });
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
    if (!cur || !els.includes(cur)) { els[0].focus(); return; }
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
    if (next) { next.focus(); next.scrollIntoView({ block: "nearest" }); }
  }
  document.addEventListener("keydown", e => {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); undo(); return; }
    if (typing) return;
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
    document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", ui.view === b.dataset.view));
    document.querySelectorAll("[data-filter]").forEach(b => b.setAttribute("aria-pressed", ui.filter === b.dataset.filter));
  }
  document.querySelector(".viewtools").addEventListener("click", e => {
    const v = e.target.closest("[data-view]"), f = e.target.closest("[data-filter]");
    if (v) { ui.view = v.dataset.view; }
    else if (f) { ui.filter = f.dataset.filter; }
    else return;
    play("click"); persistUI(); detail = null; render();
  });

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
      bannerEl.innerHTML = `<span>VIEWING <b>${esc(viewOnly.name || "SOMEONE")}</b>'S PDA · READ-ONLY · ${Object.keys(viewOnly.set).length} / ${entries.length} FOUND</span>
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
  const showActiveSubtab = () => { const a = screen.querySelector('.subtab[aria-selected="true"]'); if (a) a.scrollIntoView({ inline: "nearest", block: "nearest" }); };
  new MutationObserver(() => { if (!screen.dataset.keepx) showActiveSubtab(); }).observe(screen, { childList: true });

  /* ---------- go ---------- */
  if (/^#v=/.test(location.hash)) viewOnly = parseShare(location.hash);
  if (newIds.size) setTimeout(() => toast(`${newIds.size} new entr${newIds.size > 1 ? "ies were" : "y was"} added since your last visit.`, {
    action: () => { searchBox.value = ":new"; query = ":new"; clearBtn.hidden = false; renderTabs(); render(); }, actionLabel: "SHOW THEM", ms: 10000 }), 400);
  renderTabs();
  updateCount();
  render();
  const active = document.querySelector('.tab[aria-selected="true"]');
  if (active) active.scrollIntoView({ inline: "nearest", block: "nearest" });
})();
