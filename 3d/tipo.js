/* Piazza Beretta – appartamento tipo.
   «Pianta»: a furnished plan in the manner of a sales brochure (black walls, tiled and wooden floors, furniture seen
   from above), drawn as SVG from tipi.json. «Tour 3D»: the same apartment built in 3D with materials, daylight and
   furniture, walked through at eye height. */

const WALL_H = 2.74;
const DOOR_HEAD = 2.1;
const WIN_SILL = 1.0;
const WIN_HEAD = 2.35;
const EYE = 1.6;

const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;
const THUMB = params.has("thumb");
if (THUMB) document.body.classList.add("thumb");

const DATA = await fetch("tipi.json").then((r) => r.json());
const U = DATA.units.find((u) => u.id === params.get("u")) ?? DATA.units[0];
document.title = `Piazza Beretta | Interno ${U.id} · ${U.typo}`;

const KIND = { living: "Soggiorno", kitchen: "Cucina", bedroom: "Camera", bathroom: "Bagno", storage: "Ripostiglio", hall: "Disimpegno", balcony: "Balcone", terrace: "Terrazzo" };
const OUT = new Set(["balcony", "terrace"]);
const rooms = U.rooms.map((r) => ({ ...r, outdoor: OUT.has(r.kind), label: r.name ?? KIND[r.kind] ?? r.kind }));
const fmt = (n, d = 0) => n.toLocaleString("it-IT", { maximumFractionDigits: d });
const fmtA = (n) => `${fmt(n, n < 10 ? 1 : 0)} m²`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ------------------------------------------------------------------ geometry helpers */
function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const inPoly = (pt, p) => inside(pt, p.o) && !p.h.some((h) => inside(pt, h));
const roomAt = (pt) => rooms.find((r) => r.polys.some((p) => inPoly(pt, p))) ?? null;
const doorRects = U.openings.filter((o) => o.kind !== "window").flatMap((o) => o.rects);
const walkable = (pt) => !!roomAt(pt) || doorRects.some(([x0, y0, x1, y1]) => pt[0] >= x0 - 0.1 && pt[0] <= x1 + 0.1 && pt[1] >= y0 - 0.1 && pt[1] <= y1 + 0.1);
const distSeg = ([x, y], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
};
const wallEdges = U.walls.flatMap((p) => [p.o, ...p.h]).flatMap((ring) => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]));
const nearWall = (pt, d = 0.4) => wallEdges.some(([a, b]) => distSeg(pt, a, b) < d);

/** Doors: which jamb holds the hinge and which room the leaf swings into. */
const doors = U.openings
  .filter((o) => o.kind === "door")
  .flatMap((o) => o.rects)
  .map(([x0, y0, x1, y1]) => {
    const horiz = x1 - x0 >= y1 - y0; // the wall runs along x
    const w = horiz ? x1 - x0 : y1 - y0;
    const c = [(x0 + x1) / 2, (y0 + y1) / 2];
    const probe = (s) => (horiz ? [c[0], c[1] + s * 0.45] : [c[0] + s * 0.45, c[1]]);
    const a = roomAt(probe(-1));
    const b = roomAt(probe(1));
    const score = (r) => (!r ? -1 : r.kind === "hall" ? 1 : r.outdoor ? 0 : 3 + 1 / (r.area + 1));
    const side = score(b) >= score(a) ? 1 : -1;
    const face = horiz ? (side > 0 ? y1 : y0) : side > 0 ? x1 : x0;
    const entrance = !a || !b;
    const stray = entrance && Math.hypot(c[0] - U.entry[0], c[1] - U.entry[1]) > 1.2;
    return { horiz, w: Math.min(w, 1.0), x0, y0, x1, y1, side, face, entrance, stray };
  })
  .filter((d) => d.w > 0.55);
const strayDoors = doors.filter((d) => d.stray);
doors.splice(0, doors.length, ...doors.filter((d) => !d.stray));

const allPts = [...rooms.flatMap((r) => r.polys.flatMap((p) => p.o)), ...U.walls.flatMap((p) => p.o)];
const BX0 = Math.min(...allPts.map((p) => p[0]));
const BX1 = Math.max(...allPts.map((p) => p[0]));
const BY0 = Math.min(...allPts.map((p) => p[1]));
const BY1 = Math.max(...allPts.map((p) => p[1]));

/* ------------------------------------------------------------------ band */
function renderBand() {
  const band = document.getElementById("band");
  band.innerHTML = `
    <svg class="mono" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="gS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#c9c9c9"/><stop offset=".7" stop-color="#f4f4f4"/><stop offset="1" stop-color="#9c9c9c"/></linearGradient>
        <linearGradient id="gG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1c56d"/><stop offset=".5" stop-color="#c8902f"/><stop offset="1" stop-color="#f5d48a"/></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill="none" stroke="url(#gS)" stroke-width="5.5"/>
      <path d="M55 25 V75 H66 a13 13 0 0 0 0 -26 H55 M55 49 H64 a12 12 0 0 0 0 -24 H55" fill="none" stroke="url(#gS)" stroke-width="6.5"/>
      <path d="M27 77 V25 H41 a13.5 13.5 0 0 1 0 27 H27" fill="none" stroke="url(#gG)" stroke-width="7.5"/>
    </svg>
    <div class="stem"></div>
    <div class="code">APP / ${esc(U.id)}</div>
    <div class="rule"></div>
    <div class="typo">${esc(U.typo)}</div>
    <div class="sub">${esc(U.floorName)} · ${esc(U.also)}</div>
    <div class="kpis">
      <div><b>${fmt(U.area)}</b><span>m² netti</span></div>
      <div><b>${U.locali}</b><span>locali</span></div>
      <div><b>${U.outdoor ? fmt(U.outdoor) : "—"}</b><span>m² esterni</span></div>
    </div>
    <div class="modes" role="group" aria-label="Vista">
      <button type="button" data-mode="plan">Pianta</button>
      <button type="button" data-mode="tour">Tour 360°</button>
    </div>
    <div class="acts">
      <a class="main" href="../#contatti" id="ask">Richiedi informazioni</a>
      <a href="./#${encodeURIComponent(U.id)}" target="_top">Vedi nell'edificio 3D</a>
    </div>
    <p class="note">Arredi a titolo illustrativo. Pianta ricavata dalle tavole di progetto; superfici nette indicative.</p>
    <div class="foot">Corbetta (MI)</div>`;
  band.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  const msg = `Vorrei informazioni sull'interno ${U.id} (${U.typo.toLowerCase()}, ${U.floorName.toLowerCase()}, circa ${fmt(U.area)} m² netti) della residenza Piazza Beretta.`;
  document.getElementById("ask").addEventListener("click", (e) => {
    if (embedded) {
      e.preventDefault();
      parent.postMessage({ type: "pb-ask", message: msg }, "*");
      return;
    }
    try {
      sessionStorage.setItem("pb:ask", msg);
    } catch {
      /* the form opens empty */
    }
  });
}
document.getElementById("close").addEventListener("click", (e) => {
  if (embedded) {
    e.preventDefault();
    parent.postMessage({ type: "pb-close" }, "*");
  }
});

/* ------------------------------------------------------------------ the furnished plan (SVG) */
const S = 100; // svg units per metre (1 unit = 1 cm)
const M = 0.95;
const VX0 = BX0 - M;
const VY1 = BY1 + M;
const X = (x) => +((x - VX0) * S).toFixed(1);
const Y = (y) => +((VY1 - y) * S).toFixed(1);
const ringPath = (r) => "M" + r.map(([x, y]) => `${X(x)},${Y(y)}`).join("L") + "Z";
const polyPath = (p) => ringPath(p.o) + p.h.map(ringPath).join("");

function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const FLOOR = { living: "tile", kitchen: "tile", hall: "tile", storage: "tile", bedroom: "wood", bathroom: "bath", balcony: "deck", terrace: "deck" };

function defs() {
  return `<defs>
    <pattern id="tile" width="60" height="60" patternUnits="userSpaceOnUse">
      <rect width="60" height="60" fill="#d8c6ae"/><rect x="1" y="1" width="58" height="58" fill="url(#tileG)"/>
      <path d="M0 .5H60M.5 0V60" stroke="#c4b096" stroke-width="1.2"/></pattern>
    <linearGradient id="tileG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ddcbb4"/><stop offset="1" stop-color="#d3c0a7"/></linearGradient>
    <pattern id="wood" width="120" height="32" patternUnits="userSpaceOnUse">
      <rect width="120" height="32" fill="#d7b48b"/><rect y="0" width="120" height="16" fill="#dcba93"/>
      <path d="M0 .5H120M0 16.5H120M80 0V16M20 16V32" stroke="#c39f74" stroke-width="1"/>
      <path d="M5 6H60M30 24H100" stroke="#cfab80" stroke-width=".6" opacity=".7"/></pattern>
    <pattern id="bath" width="30" height="30" patternUnits="userSpaceOnUse">
      <rect width="30" height="30" fill="#ebe7e0"/><path d="M0 .5H30M.5 0V30" stroke="#d7d0c5" stroke-width="1"/></pattern>
    <pattern id="deck" width="45" height="45" patternUnits="userSpaceOnUse">
      <rect width="45" height="45" fill="#c9bead"/><rect x="1" y="1" width="43" height="43" fill="#cec3b2"/>
      <path d="M0 .5H45M.5 0V45" stroke="#b3a792" stroke-width="1.2"/><circle cx="12" cy="30" r="1.2" fill="#bdb19d"/><circle cx="33" cy="12" r="1" fill="#bdb19d"/></pattern>
    <linearGradient id="duvet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ebe7e1"/></linearGradient>
    <linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dedad3"/><stop offset="1" stop-color="#cbc6bd"/></linearGradient>
    <linearGradient id="woodF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b48d66"/><stop offset="1" stop-color="#97714d"/></linearGradient>
    <linearGradient id="darkWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5a40"/><stop offset="1" stop-color="#5d4330"/></linearGradient>
    <radialGradient id="porc" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6e8ea"/></radialGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4e7ea"/><stop offset="1" stop-color="#b9c0c6"/></linearGradient>
    <radialGradient id="leaf" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#8dbb6a"/><stop offset="1" stop-color="#3f6e35"/></radialGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#2b1d10" flood-opacity=".32"/></filter>
    <filter id="sh2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1" dy="1.5" stdDeviation="1.6" flood-color="#2b1d10" flood-opacity=".28"/></filter>
  </defs>`;
}

/** Draws an item in its own frame: width W across, depth D, back (or headboard) at the top. */
function item(it, draw) {
  const [x0, y0, x1, y1] = it.r;
  const w = (x1 - x0) * S;
  const h = (y1 - y0) * S;
  const cx = X((x0 + x1) / 2);
  const cy = Y((y0 + y1) / 2);
  const rot = { N: 0, S: 180, E: 90, W: -90 }[it.d] ?? 0;
  const side = rot === 90 || rot === -90;
  const W = side ? h : w;
  const D = side ? w : h;
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">${draw(W, D, it)}</g>`;
}
const R = (x, y, w, h, a = "") => `<rect x="${(x).toFixed(1)}" y="${(y).toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" ${a}/>`;

const chairSVG = (cx, cy, rot) =>
  `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot})" filter="url(#sh2)">${R(-21, -20, 42, 40, 'rx="9" fill="#ebe6dd" stroke="#c9c1b4" stroke-width="1"')}${R(-21, 12, 42, 9, 'rx="4" fill="#d6cfc3"')}</g>`;

const DRAW = {
  bed2: (W, D) => bedSVG(W, D, 2),
  bed1: (W, D) => bedSVG(W, D, 1),
  side: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'rx="3" fill="url(#woodF)" stroke="#8d6a49" stroke-width="1"')}<circle r="${Math.min(W, D) * 0.28}" fill="#fbf6ea" stroke="#e1d6bf" stroke-width="1.5"/><circle r="${Math.min(W, D) * 0.1}" fill="#f1dfae"/></g>`,
  wardrobe: (W, D) => {
    let s = `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'fill="#efece7" stroke="#b9b2a7" stroke-width="1.2"')}${R(-W / 2, -D / 2, W, 5, 'fill="#cfc8bd"')}`;
    const n = Math.max(1, Math.round(W / 60));
    for (let i = 1; i < n; i++) s += `<path d="M${-W / 2 + (W * i) / n} ${-D / 2 + 5}V${D / 2}" stroke="#cfc8bd" stroke-width="1"/>`;
    for (let i = 0; i < n; i++) s += R(-W / 2 + (W * (i + 0.5)) / n - 8, D / 2 - 6, 16, 2.5, 'rx="1" fill="#9d958a"');
    return s + "</g>";
  },
  dresser: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'rx="2" fill="url(#woodF)" stroke="#8d6a49" stroke-width="1"')}<circle cx="${-W / 4}" cy="0" r="${D * 0.2}" fill="#f4efe6" stroke="#d6cbb9"/><circle cx="${W / 5}" cy="2" r="${D * 0.12}" fill="#6f9a5a"/></g>`,
  sideboard: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'rx="2" fill="url(#darkWood)" stroke="#4c3727" stroke-width="1"')}<circle cx="${-W / 3}" cy="0" r="${D * 0.25}" fill="#e9e1d1"/><circle cx="${W / 4}" cy="0" r="${D * 0.3}" fill="url(#leaf)"/></g>`,
  shelves: (W, D) => {
    let s = `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'fill="#e4ddd2" stroke="#b9ad9b" stroke-width="1"')}`;
    for (let x = -W / 2 + 25; x < W / 2; x += 35) s += R(x, -D / 2 + 6, 18, D - 12, 'rx="2" fill="#cbbfac"');
    return s + "</g>";
  },
  tv: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2 + 4, W, D - 4, 'rx="2" fill="url(#darkWood)" stroke="#4c3727" stroke-width="1"')}${R(-W * 0.38, -D / 2, W * 0.76, 5, 'rx="1.5" fill="#1d1f22"')}</g>`,
  sofa: (W, D) => sofaSVG(W, D),
  sofaL: (W, D, it) => {
    // main sofa along the back, a chaise towards the front on one end
    const dep = Math.min(95, D * 0.45);
    const flip = (it.flip ?? 1) > 0;
    const cxs = flip ? W / 2 - dep / 2 : -W / 2 + dep / 2;
    return `<g filter="url(#sh)">${R(-W / 2, -D / 2, W, dep, 'rx="10" fill="url(#fabric)" stroke="#b6afa4" stroke-width="1.2"')}
      ${R(cxs - dep / 2, -D / 2 + dep - 6, dep, D - dep + 6, 'rx="10" fill="url(#fabric)" stroke="#b6afa4" stroke-width="1.2"')}
      ${R(-W / 2, -D / 2, W, 22, 'rx="9" fill="#c6c0b6"')}${R(flip ? -W / 2 : W / 2 - 18, -D / 2, 18, dep, 'rx="8" fill="#c6c0b6"')}
      ${[0.18, 0.42].map((k) => `<path d="M${(-W / 2 + W * k * 1.6).toFixed(1)} ${-D / 2 + 22}v${dep - 26}" stroke="#bdb6aa" stroke-width="1.2"/>`).join("")}
      ${R(-W / 2 + 26, -D / 2 + 24, 30, 26, 'rx="6" fill="#7f93a8" transform="rotate(-12)"')}${R(cxs - 16, -D / 2 + 26, 32, 26, 'rx="6" fill="#c9a27c" transform="rotate(10)"')}</g>`;
  },
  armchair: (W, D) => `<g filter="url(#sh)">${R(-W / 2, -D / 2, W, D, 'rx="10" fill="url(#fabric)" stroke="#b6afa4" stroke-width="1.2"')}${R(-W / 2, -D / 2, W, 18, 'rx="8" fill="#c6c0b6"')}${R(-W / 2, -D / 2, 14, D, 'rx="7" fill="#c6c0b6"')}${R(W / 2 - 14, -D / 2, 14, D, 'rx="7" fill="#c6c0b6"')}</g>`,
  rug: (W, D) => `${R(-W / 2, -D / 2, W, D, 'rx="3" fill="#ece5da" stroke="#d9cfc0" stroke-width="1"')}${R(-W / 2 + 10, -D / 2 + 10, W - 20, D - 20, 'fill="none" stroke="#d5c8b6" stroke-width="2" stroke-dasharray="1 5"')}${R(-W / 2 + 18, -D / 2 + 18, W - 36, D - 36, 'fill="none" stroke="#e0d6c8" stroke-width="1"')}`,
  coffee: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'rx="6" fill="url(#darkWood)"')}${R(-W / 4, -D / 4, W / 2.5, D / 4, 'rx="2" fill="#e9e3d8" transform="rotate(8)"')}<circle cx="${W / 5}" cy="${D / 5}" r="${Math.min(W, D) / 7}" fill="#d5c6ae"/></g>`,
  coffeeR: (W, D) => `<g filter="url(#sh2)"><circle r="${Math.min(W, D) / 2}" fill="url(#darkWood)"/><circle r="${Math.min(W, D) / 6}" fill="url(#leaf)"/></g>`,
  table: (W, D, it) => {
    const seats = it.chairs ?? "NS";
    let s = "";
    const along = Math.max(1, Math.floor(W / 62));
    for (const side of ["N", "S"]) {
      if (!seats.includes(side)) continue;
      for (let i = 0; i < along; i++) {
        const x = -W / 2 + (W * (i + 0.5)) / along;
        s += side === "N" ? chairSVG(x, -D / 2 - 14, 180) : chairSVG(x, D / 2 + 14, 0);
      }
    }
    if (seats.includes("E")) s += chairSVG(W / 2 + 14, 0, -90);
    if (seats.includes("W")) s += chairSVG(-W / 2 - 14, 0, 90);
    return s + `<g filter="url(#sh)">${R(-W / 2, -D / 2, W, D, 'rx="4" fill="url(#woodF)" stroke="#8d6a49" stroke-width="1"')}</g><circle r="${Math.min(W, D) * 0.16}" fill="url(#leaf)"/><circle cx="${-W / 4}" r="5" fill="#f4efe6"/>`;
  },
  tableR: (W, D, it) => {
    const r = Math.min(W, D) / 2;
    const n = it.chairs ?? 4;
    let s = "";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4;
      s += chairSVG(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14), (a * 180) / Math.PI - 90);
    }
    return s + `<g filter="url(#sh)"><circle r="${r}" fill="url(#darkWood)" stroke="#4c3727"/></g><circle r="${r * 0.22}" fill="url(#leaf)"/>`;
  },
  chair: (W, D) => chairSVG(0, 0, 0),
  desk: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'rx="2" fill="#f3f0ea" stroke="#c9c1b4" stroke-width="1"')}${R(-W / 6, -D / 2 + 6, W / 3, 6, 'rx="2" fill="#2b2d31"')}<circle cx="${W / 2 - 18}" cy="${-D / 2 + 14}" r="8" fill="#fbf6ea" stroke="#e1d6bf"/></g>`,
  kitchen: (W, D, it) => {
    const [x0, y0, x1, y1] = it.r;
    const horizontal = it.d === "N" || it.d === "S";
    const toLocal = ([a, b]) => {
      // ranges are given along the counter, in plan metres; map them to the item's local x axis
      const c = horizontal ? (x0 + x1) / 2 : (y0 + y1) / 2;
      const sgn = { N: 1, S: -1, E: -1, W: 1 }[it.d] ?? 1;
      const p = (v) => sgn * (v - c) * S;
      return [Math.min(p(a), p(b)), Math.abs(p(b) - p(a))];
    };
    let s = `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'fill="#f2f1ee" stroke="#c4c1bb" stroke-width="1.2"')}${R(-W / 2, D / 2 - 4, W, 4, 'fill="#dedbd5"')}`;
    if (it.hob) {
      const [x, w] = toLocal(it.hob);
      s += R(x, -D / 2 + 8, w, D - 18, 'rx="3" fill="#1e1f22"');
      for (const [cx, cy] of [[0.27, 0.3], [0.73, 0.3], [0.27, 0.72], [0.73, 0.72]]) s += `<circle cx="${(x + w * cx).toFixed(1)}" cy="${(-D / 2 + 8 + (D - 18) * cy).toFixed(1)}" r="${Math.min(w, D) * 0.13}" fill="none" stroke="#6b6e73" stroke-width="1.5"/>`;
    }
    if (it.sink) {
      const [x, w] = toLocal(it.sink);
      s += R(x, -D / 2 + 8, w, D - 18, 'rx="4" fill="url(#steel)" stroke="#9aa2a9" stroke-width="1"') + R(x + 5, -D / 2 + 13, w - 10, D - 28, 'rx="6" fill="#cdd3d8"') + `<circle cx="${(x + w / 2).toFixed(1)}" cy="${-D / 2 + 9}" r="3" fill="#8a9298"/>`;
    }
    return s + "</g>";
  },
  island: (W, D, it) => {
    let s = "";
    const n = Math.max(2, Math.floor(W / 50));
    for (let i = 0; i < n; i++) s += `<circle cx="${(-W / 2 + (W * (i + 0.5)) / n).toFixed(1)}" cy="${D / 2 + 22}" r="16" fill="#b48d66" stroke="#8d6a49" filter="url(#sh2)"/>`;
    return s + `<g filter="url(#sh)">${R(-W / 2, -D / 2, W, D, 'rx="2" fill="#f2f1ee" stroke="#c4c1bb" stroke-width="1.2"')}</g><circle cx="${W / 4}" r="9" fill="#e7d9b8"/>`;
  },
  toilet: (W, D) => `<g filter="url(#sh2)">${R(-W * 0.42, -D / 2, W * 0.84, D * 0.3, 'rx="4" fill="url(#porc)" stroke="#c8cdd1"')}<ellipse cy="${D * 0.12}" rx="${W * 0.36}" ry="${D * 0.36}" fill="url(#porc)" stroke="#c8cdd1"/><ellipse cy="${D * 0.14}" rx="${W * 0.22}" ry="${D * 0.24}" fill="#eef1f3"/></g>`,
  bidet: (W, D) => `<g filter="url(#sh2)"><ellipse cy="${D * 0.04}" rx="${W * 0.4}" ry="${D * 0.44}" fill="url(#porc)" stroke="#c8cdd1"/><ellipse cy="${D * 0.08}" rx="${W * 0.24}" ry="${D * 0.28}" fill="#eef1f3"/><circle cy="${-D * 0.3}" r="3" fill="#a8b0b6"/></g>`,
  sink: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'rx="4" fill="url(#porc)" stroke="#c8cdd1"')}<ellipse cy="${D * 0.08}" rx="${W * 0.32}" ry="${D * 0.3}" fill="#e9edf0" stroke="#cfd5da"/><circle cy="${-D * 0.32}" r="3" fill="#a8b0b6"/></g>`,
  tub: (W, D) => `<g filter="url(#sh2)">${R(-W / 2, -D / 2, W, D, 'rx="10" fill="url(#porc)" stroke="#c8cdd1" stroke-width="1.2"')}${R(-W / 2 + 7, -D / 2 + 7, W - 14, D - 14, 'rx="18" fill="#e6ecf0" stroke="#d3dbe1"')}<circle cx="${W / 2 - 22}" r="3" fill="#a8b0b6"/></g>`,
  shower: (W, D) => `${R(-W / 2, -D / 2, W, D, 'fill="#e8edf1" stroke="#c8cfd5" stroke-width="1"')}<path d="M${-W / 2} ${-D / 2}L${W / 2} ${D / 2}M${W / 2} ${-D / 2}L${-W / 2} ${D / 2}" stroke="#d3dae0" stroke-width="1"/><circle r="4" fill="#a8b0b6"/><path d="M${-W / 2} ${D / 2 - 1}H${W / 2}" stroke="#8fb3c4" stroke-width="2.5"/>`,
  plant: (W, D, it) => plantSVG(Math.min(W, D) / 2, it),
  planter: (W, D) => {
    const rnd = rng(Math.round(W * 7 + D));
    let s = R(-W / 2, -D / 2, W, D, 'rx="3" fill="#7d6b57" stroke="#5f5141"');
    for (let x = -W / 2 + 6; x < W / 2 - 4; x += 7) {
      const y = -D / 2 + 4 + rnd() * (D - 8);
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(3 + rnd() * 3).toFixed(1)}" fill="${rnd() > 0.5 ? "#5f8f4e" : "#4a7a3f"}"/>`;
      if (rnd() > 0.35) s += `<circle cx="${(x + rnd() * 5).toFixed(1)}" cy="${(y + (rnd() - 0.5) * 8).toFixed(1)}" r="${(2.5 + rnd() * 2).toFixed(1)}" fill="${["#d0627a", "#e58fa3", "#b8344f", "#f2b5c2"][Math.floor(rnd() * 4)]}"/>`;
    }
    return `<g filter="url(#sh2)">${s}</g>`;
  },
  lounger: (W, D) => `<g filter="url(#sh)">${R(-W / 2, -D / 2, W, D, 'rx="8" fill="#ece6da" stroke="#c9bfae" stroke-width="1.2"')}${R(-W / 2, -D / 2, W, D * 0.32, 'rx="8" fill="#ddd5c6"')}${R(-W / 2 + 8, -D / 2 + 8, W - 16, 22, 'rx="6" fill="#f7f4ef"')}</g>`,
};

function bedSVG(W, D, n) {
  const head = 9;
  const pw = n === 2 ? (W - 30) / 2 : W - 26;
  let s = `<g filter="url(#sh)">${R(-W / 2, -D / 2, W, D, 'rx="4" fill="#efe9e0" stroke="#c9bfb0" stroke-width="1.2"')}${R(-W / 2, -D / 2, W, head, 'rx="3" fill="#a99780"')}`;
  for (let i = 0; i < n; i++) {
    const x = n === 2 ? -W / 2 + 10 + i * (pw + 10) : -pw / 2;
    s += R(x, -D / 2 + head + 6, pw, 36, 'rx="9" fill="#fbfaf8" stroke="#ddd6cb" stroke-width="1"') + `<path d="M${x + 8} ${-D / 2 + head + 24}H${x + pw - 8}" stroke="#ece6dc" stroke-width="1"/>`;
  }
  const dy = -D / 2 + head + 50;
  s += R(-W / 2 + 2, dy, W - 4, D / 2 - dy - 2, 'rx="5" fill="url(#duvet)" stroke="#dcd5ca" stroke-width="1"');
  s += R(-W / 2 + 2, dy, W - 4, 16, 'rx="5" fill="#fdfcfa" stroke="#e2dcd2" stroke-width="1"');
  for (let x = -W / 2 + 22; x < W / 2 - 10; x += 26) s += `<path d="M${x} ${dy + 22}V${D / 2 - 30}" stroke="#ece7df" stroke-width="1"/>`;
  s += R(-W / 2 + 2, D / 2 - 34, W - 4, 22, `rx="3" fill="${n === 2 ? "#8193a6" : "#c4a07b"}" opacity=".92"`);
  return s + "</g>";
}
function sofaSVG(W, D) {
  const n = Math.max(2, Math.round(W / 80));
  let s = `<g filter="url(#sh)">${R(-W / 2, -D / 2, W, D, 'rx="10" fill="url(#fabric)" stroke="#b6afa4" stroke-width="1.2"')}${R(-W / 2, -D / 2, W, D * 0.26, 'rx="9" fill="#c6c0b6"')}${R(-W / 2, -D / 2, 16, D, 'rx="8" fill="#c6c0b6"')}${R(W / 2 - 16, -D / 2, 16, D, 'rx="8" fill="#c6c0b6"')}`;
  for (let i = 1; i < n; i++) s += `<path d="M${-W / 2 + 16 + ((W - 32) * i) / n} ${-D / 2 + D * 0.26}V${D / 2 - 4}" stroke="#bdb6aa" stroke-width="1.2"/>`;
  s += R(-W / 2 + 20, -D / 2 + D * 0.26 + 2, 26, 24, 'rx="6" fill="#7f93a8" transform="rotate(-10)"') + R(W / 2 - 48, -D / 2 + D * 0.26 + 4, 26, 24, 'rx="6" fill="#c9a27c" transform="rotate(12)"');
  return s + "</g>";
}
function plantSVG(r, it) {
  const rnd = rng(Math.round((it.r[0] + it.r[1]) * 100));
  let s = `<circle r="${r * 0.62}" fill="#d9cfc1" stroke="#b9ab97" stroke-width="1.5"/>`;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + rnd() * 30;
    const len = r * (0.75 + rnd() * 0.3);
    s += `<ellipse cx="${len / 2}" cy="0" rx="${len / 2}" ry="${r * 0.2}" fill="url(#leaf)" transform="rotate(${a.toFixed(0)})" stroke="#3d6a33" stroke-width=".6"/>`;
  }
  return `<g filter="url(#sh)">${s}<circle r="${r * 0.18}" fill="#6f9f55"/></g>`;
}

function planSVG(mini = false) {
  const Wv = ((BX1 + M - VX0) * S).toFixed(0);
  const Hv = ((VY1 - (BY0 - M)) * S).toFixed(0);
  const order = ["rug"];
  const its = [...U.items].sort((a, b) => Number(!order.includes(a.t)) - Number(!order.includes(b.t)));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wv} ${Hv}" preserveAspectRatio="xMidYMid meet">${defs()}`;
  // floors (and the floor through the doorways)
  for (const r of rooms) for (const p of r.polys) s += `<path d="${polyPath(p)}" fill="url(#${FLOOR[r.kind] ?? "tile"})" fill-rule="evenodd"/>`;
  for (const d of doors) s += R(X(d.x0), Y(d.y1), (d.x1 - d.x0) * S, (d.y1 - d.y0) * S, 'fill="url(#tile)"');
  if (!mini) for (const it of its) if (DRAW[it.t]) s += item(it, DRAW[it.t]);
  // door leaves and swings
  for (const d of doors) {
    const w = d.w * S;
    if (d.horiz) {
      const hx = X(d.x0);
      const fy = Y(d.face);
      const dir = d.side > 0 ? -1 : 1; // svg y grows downwards
      s += `<path d="M${hx} ${fy}v${dir * w}" stroke="#2d2d2d" stroke-width="3"/><path d="M${hx} ${fy + dir * w}A${w} ${w} 0 0 ${dir > 0 ? 0 : 1} ${hx + w} ${fy}" fill="none" stroke="#8a8a8a" stroke-width="1.2"/>`;
    } else {
      const hy = Y(d.y0);
      const fx = X(d.face);
      const dir = d.side > 0 ? 1 : -1;
      s += `<path d="M${fx} ${hy}h${dir * w}" stroke="#2d2d2d" stroke-width="3"/><path d="M${fx + dir * w} ${hy}A${w} ${w} 0 0 ${dir > 0 ? 0 : 1} ${fx} ${hy - w}" fill="none" stroke="#8a8a8a" stroke-width="1.2"/>`;
    }
  }
  // walls and windows
  for (const p of U.walls) s += `<path d="${polyPath(p)}" fill="#1b1b1b" fill-rule="evenodd"/>`;
  for (const d of strayDoors) s += R(X(d.x0), Y(d.y1), (d.x1 - d.x0) * S, (d.y1 - d.y0) * S, 'fill="#1b1b1b"');
  for (const o of U.openings) {
    if (o.kind === "door") continue;
    for (const [x0, y0, x1, y1] of o.rects) {
      const horiz = x1 - x0 >= y1 - y0;
      s += R(X(x0), Y(y1), (x1 - x0) * S, (y1 - y0) * S, 'fill="#ffffff" stroke="#9c9c9c" stroke-width="1"');
      if (horiz) {
        const y = (Y(y0) + Y(y1)) / 2;
        s += `<path d="M${X(x0)} ${y - 3}H${X(x1)}M${X(x0)} ${y + 3}H${X(x1)}" stroke="#a7a7a7" stroke-width="1.4"/>`;
      } else {
        const x = (X(x0) + X(x1)) / 2;
        s += `<path d="M${x - 3} ${Y(y1)}V${Y(y0)}M${x + 3} ${Y(y1)}V${Y(y0)}" stroke="#a7a7a7" stroke-width="1.4"/>`;
      }
    }
  }
  // railings on the free edges of balconies
  for (const r of rooms.filter((x) => x.outdoor))
    for (const p of r.polys)
      p.o.forEach((a, i) => {
        const b = p.o[(i + 1) % p.o.length];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.4 || nearWall(m, 0.35)) return;
        s += `<path d="M${X(a[0])} ${Y(a[1])}L${X(b[0])} ${Y(b[1])}" stroke="#9aa3aa" stroke-width="4" opacity=".8"/>`;
      });
  if (!mini) {
    // entrance
    const [ex, ey, dir] = U.entry;
    const off = { down: [0, 0.6], up: [0, -0.6], left: [0.6, 0], right: [-0.6, 0] }[dir] ?? [0, 0.6];
    const rot = { down: 0, up: 180, left: 90, right: -90 }[dir] ?? 0;
    s += `<g transform="translate(${X(ex + off[0])} ${Y(ey + off[1])}) rotate(${rot})"><circle r="26" fill="#5f6266"/><path d="M0 -12V12M-9 3L0 12L9 3" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    // invisible room areas for hover and click
    for (const r of rooms) s += `<path class="room" data-room="${r.id}" d="${r.polys.map(polyPath).join("")}" fill-rule="evenodd"/>`;
  }
  return s + "</svg>";
}

function renderPlan() {
  const el = document.getElementById("plan");
  el.innerHTML = planSVG();
  const tip = document.getElementById("tip");
  el.querySelectorAll(".room").forEach((p) => {
    const r = rooms.find((x) => x.id === p.dataset.room);
    p.addEventListener("mousemove", (e) => {
      const box = el.parentElement.getBoundingClientRect();
      tip.innerHTML = `${esc(r.label)}<small>${fmtA(r.area)} · clicca per entrare</small>`;
      tip.style.display = "block";
      tip.style.left = `${e.clientX - box.left + 14}px`;
      tip.style.top = `${e.clientY - box.top + 14}px`;
    });
    p.addEventListener("mouseleave", () => (tip.style.display = "none"));
    p.addEventListener("click", () => {
      tip.style.display = "none";
      startAt = r.id;
      setMode("tour");
    });
  });
}

/* ------------------------------------------------------------------ modes */
let startAt = null;
let tour = null;
async function setMode(m) {
  document.body.dataset.mode = m;
  document.querySelectorAll("[data-mode]").forEach((b) => b.tagName === "BUTTON" && b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  document.getElementById("phint").style.display = m === "plan" ? "" : "none";
  if (m === "tour") {
    if (!tour) tour = await import("./tipo-tour.js").then((mod) => mod.startTour({ U, rooms, doors, roomAt, walkable, nearWall, planSVG, strayDoors, X, Y, VX0, VY1, S, WALL_H, DOOR_HEAD, WIN_SILL, WIN_HEAD, EYE }));
    tour.enter(startAt);
    startAt = null;
  } else tour?.leave();
}

if (!THUMB) renderBand();
renderPlan();
setMode(params.get("vista") === "interna" || params.get("vista") === "tour" ? "tour" : "plan");
