const PDA_MATCH = (() => {
  const fold = s => String(s).toUpperCase().replace(/&/g, "").replace(/[|]/g, "I").replace(/0/g, "O").replace(/1/g, "I").replace(/[^A-Z0-9$+]/g, "");
  const words = s => String(s).split(/[\s/\\,·:;()"'“”‘’.\-_]+/).map(fold).filter(Boolean);
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  const allow = w => w.length >= 9 ? 2 : w.length >= 4 ? 1 : 0;
  return function match(text, entries, ignore = []) {
    const pool = words(text).map(w => ({ w, used: false }));
    const take = (w, exactOnly) => {
      let hit = pool.find(t => !t.used && t.w === w);
      if (!hit && !exactOnly) { const m = allow(w); if (m) hit = pool.find(t => !t.used && lev(t.w, w, m) <= m); }
      return hit || null;
    };

    ignore.forEach(l => { const ws = words(l); const hits = ws.map(w => take(w, true)); if (hits.every(Boolean)) hits.forEach(h => { h.used = true; }); });

    const list = entries.map(e => ({ ...e, ws: words(e.name) })).filter(e => e.ws.length && e.ws.join("").length >= 2)
      .sort((a, b) => b.ws.length - a.ws.length || b.ws.join("").length - a.ws.join("").length);
    const out = [];

    for (const fuzzy of [false, true]) {
      list.forEach(e => {
        if (e.done) return;
        const hits = []; let exact = 0;
        for (const w of e.ws) {
          const h = take(w, !fuzzy); if (!h) { hits.forEach(x => { x.used = false; }); return; }
          h.used = true; hits.push(h); if (h.w === w) exact++;
        }
        if (fuzzy && e.ws.length === 1 && e.ws[0].length < 4) { hits.forEach(x => { x.used = false; }); return; }
        e.done = true;
        out.push({ id: e.id, name: e.name, sure: exact === e.ws.length });
      });
    }
    return out;
  };
})();
if (typeof module !== "undefined") module.exports = PDA_MATCH;
