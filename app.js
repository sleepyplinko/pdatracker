/* =====================================================================
   PDA.exe tracker — app logic. Entries live in data.js.
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
  let settings = Object.assign({ lockedNames: true, hideFound: false }, load(KEY_SET, {}));
  let ui       = Object.assign({ tab: "tools", cat: 0, bio: 0, docs: 0 }, load(KEY_UI, {}));
  let user     = load(KEY_USER, "");
  let detailId = null;

  /* ---------- flatten data into entries with stable ids ---------- */
  const slug = s => String(s).toLowerCase().replace(/\s+/g, " ").trim();
  const entries = [];
  const byId = new Map();
  const add = e => { entries.push(e); byId.set(e.id, e); return e; };
  const norm = raw => Array.isArray(raw) ? { name: raw[0], ...(raw[1] || {}) } : { name: raw };

  PDA_DATA.tools.forEach(cat => {
    cat.items = [];
    Object.keys(cat.tiers).sort((a, b) => a - b).forEach(tier => {
      cat.tiers[tier].forEach((raw, i) => {
        const r = norm(raw);
        const unknown = r.name === "???";
        const id = unknown ? `t|${slug(cat.name)}|${tier}|???${i}` : `t|${slug(cat.name)}|${slug(r.name)}`;
        cat.items.push(add({ ...r, id, section: "tools", group: cat.name, tier: +tier, unknown }));
      });
    });
  });
  PDA_DATA.biography.forEach(g => {
    g.items = g.entries.map((raw, i) => {
      const r = norm(raw);
      const unknown = r.name === "???";
      return add({ ...r, id: `b|${slug(g.name)}|${unknown ? "???" + i : slug(r.name)}`, section: "bio", group: g.name, unknown });
    });
  });
  PDA_DATA.documents.forEach(g => {
    g.items = g.entries.map((raw, i) => {
      const r = norm(raw);
      const unknown = r.name === "???";
      return add({ ...r, id: `d|${slug(g.name)}|${unknown ? "???" + i : slug(r.name)}`, section: "docs", group: g.name, kind: g.kind, unknown });
    });
  });

  const isFound = id => !!found[id];
  const countOf = list => [list.filter(e => isFound(e.id)).length, list.length];

  function toggle(id) {
    if (found[id]) delete found[id]; else found[id] = 1;
    save(KEY_FOUND, found);
    updateCount();
  }

  /* ---------- icons ---------- */
  const I = {
    profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#111"/><circle cx="12" cy="9.5" r="3.6" fill="#ddd"/><path d="M5.5 18.5c1.4-3 3.8-4.4 6.5-4.4s5.1 1.4 6.5 4.4" fill="#ddd"/></svg>',
    cloud:   '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/><path d="M12 10v6m-2.5-2.5L12 16l2.5-2.5"/></svg>',
    manual:  '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#111"/><path d="M6 12.5l4 4 8-9" fill="none" stroke="#ddd" stroke-width="2.6"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="#111"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
    tools:   '<svg viewBox="0 0 24 24" fill="#111"><path d="M3 5.5 7.5 1l5 4-2 2 9.5 13-2 2L5 12.5l-2 2-1-5z"/></svg>',
    biography:'<svg viewBox="0 0 24 24" fill="#111"><path d="M2 6h7l2 2h11v13H2z"/><circle cx="12" cy="13" r="2.4" fill="#ccc"/><path d="M7.5 19c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3z" fill="#ccc"/><path d="M4 3h7v2H4z"/></svg>',
    documents:'<svg viewBox="0 0 24 24"><path d="M5 2h9l5 5v15H5z" fill="#111"/><path d="M8 11h8M8 14h8M8 17h6" stroke="#ccc" stroke-width="1.6"/></svg>',
    lock:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v12h-13V10zm2.5 0h5V7a2.5 2.5 0 0 0-5 0z"/><circle cx="12" cy="15.5" r="1.6" fill="#000"/><rect x="11.3" y="16" width="1.4" height="3" fill="#000"/></svg>',
    question:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor"><circle cx="50" cy="50" r="44" stroke-width="5"/><path d="M36 38a14 14 0 1 1 20 12.6c-4 2-6 4.6-6 9.4v4" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="76" r="4.5" fill="currentColor" stroke="none"/></svg>',
    person:  '<svg viewBox="0 0 100 100" fill="#e9e9e9"><circle cx="50" cy="34" r="20"/><path d="M12 92c4-22 20-34 38-34s34 12 38 34z"/></svg>',
    wifi:    '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"><path d="M18 74a56 56 0 0 1 56-56"/><path d="M34 74a40 40 0 0 1 40-40"/><path d="M50 74a24 24 0 0 1 24-24"/><circle cx="72" cy="72" r="6" fill="currentColor" stroke="none"/></svg>',
    note:    '<svg viewBox="0 0 100 100"><path d="M18 6h44l22 22v66H18z" fill="currentColor"/><path d="M62 6v22h22" fill="#000" opacity=".25"/><path d="M30 46h40M30 58h40M30 70h40M30 34h24" stroke="#111" stroke-width="7" stroke-linecap="round"/></svg>',
    star:    on => `<svg viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/></svg>`,
    gun:     '<svg viewBox="0 0 100 70" fill="currentColor"><path d="M4 10h82v14H58l-6 8H40l-6 34H14l8-34H4z"/></svg>',
    download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></svg>',
    upload:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 15V3M7 8l5-5 5 5M4 20h16"/></svg>'
  };

  /* ---------- helpers ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fit = (name, base = 22) => {
    const n = name.length;
    const size = n <= 6 ? base : n <= 9 ? base * .86 : n <= 12 ? base * .7 : n <= 16 ? base * .58 : base * .48;
    return `font-size:${size.toFixed(1)}px`;
  };
  const screen = $("#screen");

  function updateCount() {
    const [f, t] = countOf(entries);
    $("#titleCount").textContent = `DATABANKS ${f} / ${t}`;
  }
  const persistUI = () => save(KEY_UI, ui);

  /* ---------- top tabs ---------- */
  const TABS = ["profile", "cloud", "manual", "settings", "tools", "biography", "documents"];
  function renderTabs() {
    $("#tabs").innerHTML = TABS.map(t =>
      `<button class="tab" role="tab" data-tab="${t}" aria-selected="${ui.tab === t}">${I[t]}<span>${t.toUpperCase()}</span></button>`
    ).join("");
  }
  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab"); if (!b) return;
    ui.tab = b.dataset.tab; detailId = null; persistUI(); renderTabs(); render();
  });
  // "< SCROLL TABS FOR MORE OPTIONS >": mouse wheel scrolls the tab strip sideways
  $("#tabs").addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  /* ---------- main render ---------- */
  function render() {
    screen.classList.toggle("hide-locked-names", !settings.lockedNames);
    ({ profile: renderProfile, cloud: renderCloud, manual: renderManual, settings: renderSettings,
       tools: renderTools, biography: renderBio, documents: renderDocs })[ui.tab]();
  }

  /* ================= TOOLS ================= */
  function tileHTML(e) {
    const got = isFound(e.id);
    const label = e.unknown ? "???" : e.name;
    if (!got) {
      return `<button class="tile locked" data-id="${esc(e.id)}" title="${esc(label)}: not found (click to mark found)">
        <span class="lock">${I.lock}</span><span class="lname">${esc(label)}</span>
        <span class="info" data-info="${esc(e.id)}" role="button" aria-label="View ${esc(label)}">i</span></button>`;
    }
    return `<button class="tile${e.special ? " special" : ""}" data-id="${esc(e.id)}" style="${fit(label)}" title="${esc(label)}: found (click to unmark)">
      ${esc(label)}<span class="info" data-info="${esc(e.id)}" role="button" aria-label="View ${esc(label)}">i</span></button>`;
  }

  function renderTools() {
    if (detailId && byId.has(detailId)) return renderDetail(byId.get(detailId));
    const cats = PDA_DATA.tools;
    if (ui.cat >= cats.length) ui.cat = 0;
    const cat = cats[ui.cat];

    const catBtns = cats.map((c, i) => {
      const [f, t] = countOf(c.items);
      return `<button class="cat${c.name.length > 12 ? " small" : ""}" data-cat="${i}" aria-selected="${i === ui.cat}">${esc(c.name)}${t ? `<span class="mini">${f}/${t}</span>` : ""}</button>`;
    }).join("");

    let body = "";
    const tiers = Object.keys(cat.tiers).sort((a, b) => a - b);
    if (!tiers.length) {
      body = `<div class="empty-cat"><b>NO ENTRIES ON FILE</b>Add this category's weapons to data.js to track them.</div>`;
    } else {
      if (cat.note) body += `<p class="cat-note">${esc(cat.note)}</p>`;
      tiers.forEach(tier => {
        let items = cat.items.filter(e => e.tier === +tier);
        const [f, t] = countOf(items);
        if (settings.hideFound) items = items.filter(e => !isFound(e.id));
        body += `<div class="tier-head">TIER ${tier}<small>${f}/${t}</small></div>`;
        body += items.length ? `<div class="tier-box">${items.map(tileHTML).join("")}</div>`
                             : `<div class="tier-box"><div class="cat-note" style="grid-column:1/-1">All found.</div></div>`;
      });
    }
    screen.innerHTML = `<div class="tools"><div class="cats" role="tablist" aria-label="Categories">${catBtns}</div><div class="grid-wrap" id="grid">${body}</div></div>`;
  }

  const STAT_COLORS = {
    "CALIBER TYPE": "#ff4a4a", "AUTO": "#9cff6b", "BURST": "#ff9a3c", "STRENGTH": "#ff5fa8",
    "AIM TIME": "#4fd8ff", "SWITCH TIME": "#ffb347", "RPM": "#ffe14d", "ALERT RADIUS": "#7474ff",
    "RELOAD MODIFIER": "#3fe0c8", "WEAPON TYPE": "#e86bff", "MAX SPREAD": "#a38cff",
    "MINIMUM SPREAD": "#a38cff", "SPREAD INCREMENT": "#a38cff", "SPREAD DECREASE": "#a38cff",
    "EQUIP TIME": "#ffb347", "WEIGHT": "#666"
  };
  const PALETTE = ["#ff9a3c", "#ff5fa8", "#4fd8ff", "#ffe14d", "#7474ff", "#3fe0c8", "#e86bff"];

  function renderDetail(e) {
    const got = isFound(e.id);
    const label = e.unknown ? "???" : e.name;
    const stats = Object.entries(e.stats || {});
    const statHTML = stats.length
      ? stats.map(([k, v], i) => `<div class="stat"><i style="color:${STAT_COLORS[k] || PALETTE[i % PALETTE.length]}">${esc(k)}</i>: ${esc(v)}</div>`).join("")
      : `<div class="stat" style="color:#777">NO STATISTICS ON FILE</div>`;
    screen.innerHTML = `
      <div class="detail">
        <div class="dbox"><div class="dhead">Preview</div>
          <div class="preview">${e.img ? `<img src="${esc(e.img)}" alt="">` : `<span class="ph">${I.gun}</span>`}
            <button class="star" id="star" aria-pressed="${got}" title="${got ? "Found: click to unmark" : "Not found: click to mark"}">${I.star(got)}</button>
          </div></div>
        <div class="dbox"><div class="dhead">Statistics<button class="return" id="ret">RETURN</button></div>
          <div class="stats"><h2 style="color:${e.special ? "var(--red)" : "#fff"}">// ${esc(label.toUpperCase())}</h2>
            ${statHTML}
            <div class="stat gap"><i style="color:#fff">TIER</i>: TIER ${e.tier}</div>
            <div class="stat"><i style="color:#fff">STATUS</i>: <span class="${got ? "status-found" : "status-missing"}">${got ? "FOUND" : "MISSING"}</span></div>
          </div></div>
        <div class="dbox comment"><div class="dhead">Comment</div><p>${e.comment ? esc(e.comment) : '<span style="color:#666">No comment on file.</span>'}</p></div>
      </div>`;
  }

  /* ================= BIOGRAPHY ================= */
  function renderBio() {
    const groups = PDA_DATA.biography;
    if (ui.bio >= groups.length) ui.bio = 0;
    const g = groups[ui.bio];
    const tabs = groups.map((x, i) => {
      const [f, t] = countOf(x.items);
      return `<button class="subtab" data-bio="${i}" aria-selected="${i === ui.bio}" style="--sc:${x.color};--sbg:${x.bg}">${esc(x.name)}<span class="n">${f}/${t}</span></button>`;
    }).join("");
    let items = g.items;
    if (settings.hideFound) items = items.filter(e => !isFound(e.id));
    const cards = items.map(e => {
      const got = isFound(e.id);
      const label = e.unknown ? "???" : e.name;
      const pic = got ? (e.img ? `<img src="${esc(e.img)}" alt="" loading="lazy">` : I.person) : I.question;
      return `<button class="card${got ? "" : " missing"}" data-id="${esc(e.id)}" style="--c:${g.color}" title="${esc(label)}: ${got ? "found" : "not found"}">
        <span class="pic">${pic}</span><span class="nm" style="${fit(label, 17)}">${esc(label)}</span></button>`;
    }).join("");
    screen.innerHTML = `<div class="subwrap"><div class="subtabs" role="tablist">${tabs}</div><div class="cards">${cards || '<p class="cat-note">All found.</p>'}</div></div>`;
  }

  /* ================= DOCUMENTS ================= */
  const DOC_TAB = { location: ["var(--cyan)", "#0a2a2e"], note: ["var(--doc-yellow)", "#24230a"], misc: ["#fff", "#1c1c1c"] };
  function renderDocs() {
    const groups = PDA_DATA.documents;
    if (ui.docs >= groups.length) ui.docs = 0;
    const g = groups[ui.docs];
    const tabs = groups.map((x, i) => {
      const [f, t] = countOf(x.items);
      const [c, bg] = DOC_TAB[x.kind];
      return `<button class="subtab striped" data-docs="${i}" aria-selected="${i === ui.docs}" style="--sc:${c};--sbg:${bg}">${esc(x.name)}<span class="n">${f}/${t}</span></button>`;
    }).join("");
    let items = g.items;
    if (settings.hideFound) items = items.filter(e => !isFound(e.id));
    const icon = { location: I.wifi, note: I.note, misc: "" }[g.kind];
    const tiles = items.map(e => {
      const got = isFound(e.id);
      const label = e.unknown ? "???" : e.name;
      if (!got) {
        return `<button class="doc ${g.kind} missing" data-id="${esc(e.id)}" title="${esc(label)}: not found">
          <span class="pic" style="width:100%">${I.lock.replace("<svg", '<svg style="width:46%"')}</span>
          <span class="nm"><span class="tag">- MISSING -</span>${settings.lockedNames && !e.unknown ? `<span class="sub">${esc(label)}</span>` : ""}</span></button>`;
      }
      return `<button class="doc ${g.kind}" data-id="${esc(e.id)}" title="${esc(label)}: found">
        <span class="pic">${icon}</span><span class="nm" style="${fit(label, 17)}">${esc(label)}</span></button>`;
    }).join("");
    screen.innerHTML = `<div class="subwrap"><div class="subtabs" role="tablist">${tabs}</div><div class="cards">${tiles || '<p class="cat-note">All found.</p>'}</div></div>`;
  }

  /* ================= PROFILE ================= */
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

  /* ================= CLOUD (backup) ================= */
  function renderCloud(msg = "") {
    screen.innerHTML = `
      <div class="cloud">
        <div class="dhead">Download Entries<span style="display:flex;width:18px">${I.download}</span></div>
        <div class="cloud-body">
          <p>Your checkmarks are saved in this browser only. Download a backup file to keep them safe or to move them to another device or browser, then upload it there.</p>
          <button class="pbtn" id="exp">${I.download} DOWNLOAD BACKUP</button>
          <button class="pbtn" id="imp">${I.upload} UPLOAD BACKUP</button>
          <div class="msg" id="cmsg">${esc(msg)}</div>
        </div>
      </div>`;
    $("#exp").onclick = () => {
      const blob = new Blob([JSON.stringify({ app: "onc-pda-tracker", v: 1, user, found }, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pda-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      $("#cmsg").textContent = "Backup downloaded.";
    };
    $("#imp").onclick = () => $("#importFile").click();
  }
  $("#importFile").addEventListener("change", async ev => {
    const file = ev.target.files[0]; ev.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.found !== "object") throw new Error();
      found = {}; Object.keys(data.found).forEach(k => { if (data.found[k]) found[k] = 1; });
      if (typeof data.user === "string") { user = data.user; save(KEY_USER, user); }
      save(KEY_FOUND, found); updateCount();
      renderCloud(`Restored ${Object.keys(found).length} entries.`);
    } catch {
      renderCloud("That file isn't a PDA backup.");
      $("#cmsg").style.color = "#ff7a7a";
    }
  });

  /* ================= MANUAL ================= */
  function renderManual() {
    screen.innerHTML = `
      <div class="manual">
        <h3>-=-=- TRACKER GUIDE -=-=-</h3>
        <h4>How do I mark something as found?</h4>
        <p>Click any locked entry in TOOLS, BIOGRAPHY or DOCUMENTS to unlock it. Click it again to lock it back up.</p>
        <h4>How do I see a weapon's stats?</h4>
        <p>Hover over a weapon and press the small "i" in its corner (always visible on phones). The star on the stat page also marks it found.</p>
        <h4>Will I lose my progress?</h4>
        <p>Progress is saved in this browser. Clearing site data or using a private window will lose it, so use CLOUD to download a backup now and then.</p>
        <h3>-=-=- QUICK KEYS -=-=-</h3>
        <div class="k">MOUSE WHEEL ON TABS - SCROLL TABS</div>
        <div class="k">CLICK ENTRY - MARK FOUND / MISSING</div>
        <div class="k">"i" BUTTON - OPEN STAT PAGE</div>
        <div class="k">RETURN - BACK TO LIST</div>
        <h3>-=-=- ABOUT -=-=-</h3>
        <p>A fan-made tracker for Once A Normal City. Not affiliated with the game's developers. Entries marked ??? are ones whose names aren't known yet.</p>
      </div>`;
  }

  /* ================= SETTINGS ================= */
  function renderSettings() {
    const sw = (key, label) => `
      <div class="srow"><div class="onoff">
        <button class="on" data-set="${key}" data-val="1" aria-pressed="${!!settings[key]}">ON</button>
        <button class="off" data-set="${key}" data-val="0" aria-pressed="${!settings[key]}">OFF</button>
      </div>${label}</div>`;
    screen.innerHTML = `
      <div class="settings">
        <h3>User Preference</h3>
        ${sw("lockedNames", "Show names on locked entries?")}
        ${sw("hideFound", "Hide entries you've already found?")}
        <h3>Data</h3>
        <div class="srow"><button class="pbtn danger" id="reset">RESET ALL PROGRESS</button><span id="rmsg" style="font-size:13px;color:#aaa"></span></div>
      </div>`;
    $("#reset").onclick = ev => {
      const b = ev.currentTarget;
      if (b.dataset.armed) {
        found = {}; save(KEY_FOUND, found); updateCount();
        b.textContent = "RESET ALL PROGRESS"; delete b.dataset.armed;
        $("#rmsg").textContent = "Progress cleared.";
      } else {
        b.dataset.armed = "1"; b.textContent = "CLICK AGAIN TO CONFIRM";
        $("#rmsg").textContent = "This clears every checkmark. Download a backup first if you want one.";
      }
    };
  }

  /* ---------- one click handler for the whole screen ---------- */
  screen.addEventListener("click", ev => {
    const t = ev.target;
    const info = t.closest("[data-info]");
    if (info) { detailId = info.dataset.info; render(); return; }
    const set = t.closest("[data-set]");
    if (set) { settings[set.dataset.set] = set.dataset.val === "1"; save(KEY_SET, settings); render(); return; }
    const cat = t.closest("[data-cat]");
    if (cat) { ui.cat = +cat.dataset.cat; persistUI(); render(); const g = $("#grid"); if (g) g.scrollTop = 0; return; }
    const bio = t.closest("[data-bio]");
    if (bio) { ui.bio = +bio.dataset.bio; persistUI(); render(); return; }
    const docs = t.closest("[data-docs]");
    if (docs) { ui.docs = +docs.dataset.docs; persistUI(); render(); return; }
    if (t.closest("#ret")) { detailId = null; render(); return; }
    if (t.closest("#star")) { toggle(detailId); render(); return; }
    const item = t.closest("[data-id]");
    if (item) {
      const id = item.dataset.id;
      const scroller = screen.querySelector("#grid, .cards");
      const y = scroller ? scroller.scrollTop : 0;
      toggle(id); render();
      const s2 = screen.querySelector("#grid, .cards");
      if (s2) s2.scrollTop = y;
      const el = screen.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (el) el.classList.add("flash");
    }
  });

  /* ---------- go ---------- */
  renderTabs();
  updateCount();
  render();
  const active = document.querySelector('.tab[aria-selected="true"]');
  if (active) active.scrollIntoView({ inline: "nearest", block: "nearest" });
})();
