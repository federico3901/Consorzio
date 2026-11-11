/* Piazza Beretta – Edificio 3D.
   Port of the 3D-House building viewer (engine.ts + Building3D.tsx) to a static page. The geometry comes from the
   project's floor plans (tav. 04, dic. 2025): building.json holds, for every floor, the wall and slab outlines,
   doors and windows, the rooms with their kind and apartment, furniture lines and apartment outlines. */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------------ constants */

const STOREY = 3.04; // 19 alzate da 16 cm
const SLAB = 0.3;
const WALL_H = STOREY - SLAB;
const DOOR_HEAD = 2.1;
const WIN_SILL = 1.0;
const WIN_HEAD = 2.35;
const RAIL = 1.0;
const PARAPET = 0.6;

const FOV = 28;
const GAP = 4.2;
const LIFT = 6;
const VIEWS = { axo: { az: 36, el: 30 }, plan: { az: 0, el: 89 }, front: { az: 0, el: 5 } };
const THEME_KEY = "piazza-beretta.3d.tema2";
const NONE = { floor: null, unit: null };

const GROUPS = ["day", "night", "bath", "serv", "park", "dist", "out", "plant"];
const GROUP_OF = {
  living: "day", kitchen: "day", bedroom: "night", bathroom: "bath", storage: "serv", cellar: "serv",
  hall: "dist", landing: "dist", lobby: "dist", stairs: "dist", balcony: "out", terrace: "out", garden: "out", plant: "plant",
  garage: "park", drive: "dist",
};
const OUTDOOR = new Set(["balcony", "terrace", "garden"]);
const S = {
  groups: { day: "Zona giorno", night: "Camere", bath: "Bagni", serv: "Ripostigli e cantine", park: "Box auto", dist: "Ingressi, scale e corsie", out: "Balconi e terrazzi", plant: "Impianti" },
  kinds: {
    living: "Soggiorno", kitchen: "Cucina", bedroom: "Camera", bathroom: "Bagno", storage: "Ripostiglio", cellar: "Cantina",
    hall: "Disimpegno", landing: "Pianerottolo", lobby: "Atrio", stairs: "Scala", balcony: "Balcone", terrace: "Terrazzo", garden: "Giardino", plant: "Locale tecnico",
    garage: "Box", drive: "Corsia di manovra",
  },
  code: (level, roof) => (roof ? "CP" : level === 0 ? "PT" : level < 0 ? "PI" : `P${level}`),
};
const TYPO = ["", "Monolocale", "Bilocale", "Trilocale", "Quadrilocale"];

const fmt = (n, d = 1, min = 0) => n.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: min });
const fmtArea = (n) => `${fmt(n, n < 10 ? 1 : 0)} m²`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ------------------------------------------------------------------ data */

const app = document.getElementById("app");
const stageEl = document.getElementById("stage");
const overlayEl = document.getElementById("overlay");

const DATA = await fetch("building.json").then((r) => r.json());

function bbox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const floors = DATA.floors.map((f) => {
  const roof = !!f.roof;
  const rooms = f.rooms.map((r) => ({
    ...r,
    group: GROUP_OF[r.kind] ?? "dist",
    outdoor: OUTDOOR.has(r.kind),
    unitId: r.unit ?? null,
  }));
  for (const r of rooms) {
    // the living rooms with a kitchen drawn inside are «soggiorno con cucina»
    if (r.kind === "living" && r.area > 20) r.label = "Soggiorno con cucina";
  }
  const pts = [...f.slabPolys.flatMap((p) => p.o), ...rooms.flatMap((r) => r.polys.flatMap((p) => p.o))];
  return {
    id: f.id,
    level: f.level,
    name: f.name,
    roof,
    rooms,
    units: f.units.map((u) => ({ ...u, unitId: u.id })),
    wallPolys: f.wallPolys ?? [],
    slabPolys: f.slabPolys ?? [],
    parapetPolys: f.parapetPolys ?? [],
    openings: f.openings ?? [],
    furniture: f.furniture ?? [],
    equipment: f.equipment ?? [],
    bounds: bbox(pts),
  };
});

const B = { x0: 0, x1: 37.99, y0: 0, y1: 16.39, wallHeight: WALL_H, floors };

// Apartments, with what the plan says about them
const UNITS = new Map();
for (const f of floors) {
  if (f.roof) continue;
  for (const u of f.units) {
    const own = f.rooms.filter((r) => r.unitId === u.unitId);
    const rooms = own.filter((r) => ["living", "bedroom", "kitchen"].includes(r.kind)).length;
    const baths = own.filter((r) => r.kind === "bathroom").length;
    const outdoor = own.filter((r) => r.outdoor);
    UNITS.set(u.unitId, {
      id: u.unitId,
      floor: f,
      area: u.area,
      outdoor: u.outdoor,
      outdoorKind: outdoor.some((r) => r.kind === "terrace") ? "terrazzo" : outdoor.length ? (outdoor.length > 1 ? "balconi" : "balcone") : null,
      rooms,
      baths,
      typo: rooms >= 5 ? `${rooms} locali` : TYPO[rooms] || `${rooms} locali`,
    });
  }
}

/* ------------------------------------------------------------------ palette */

function parseColor(s, fb) {
  const v = s.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    const h = m[1];
    const full = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const n = (i) => parseInt(full.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) : 1 };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.slice(0, 3).every(Number.isFinite)) return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] ?? 1 };
  }
  return fb;
}
const GREY = { r: 0.55, g: 0.55, b: 0.55, a: 1 };
function readPalette(el) {
  const css = getComputedStyle(el);
  const v = (n) => css.getPropertyValue(n);
  const num = (n, fb) => (Number.isFinite(parseFloat(v(n))) ? parseFloat(v(n)) : fb);
  const group = {};
  for (const g of GROUPS) group[g] = parseColor(v(`--k-${g}`), GREY);
  return {
    dark: v("--o-dark").trim() !== "0",
    edge: parseColor(v("--o-edge"), { r: 1, g: 1, b: 1, a: 0.6 }),
    signal: parseColor(v("--signal"), { r: 0.33, g: 0.89, b: 0.81, a: 1 }),
    mute: parseColor(v("--mute"), GREY),
    group,
    fillAlpha: num("--o-fill-alpha", 0.12),
    tileAlpha: num("--o-tile-alpha", 0.2),
    dimAlpha: num("--o-dim-alpha", 0.04),
    glow: num("--o-glow", 0.45),
  };
}

/* ------------------------------------------------------------------ engine */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const approach = (cur, tgt, dt, rate = 9) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));
const setRGB = (c, x) => c.setRGB(x.r, x.g, x.b, THREE.SRGBColorSpace);

class BuildingEngine {
  constructor(host, overlay, b, events) {
    this.host = host;
    this.overlay = overlay;
    this.b = b;
    this.events = events;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 2000);
    this.floors = [];
    this.lineMats = [];
    this.depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.cx = (b.x0 + b.x1) / 2;
    this.cy = (b.y0 + b.y1) / 2;
    this.size = { w: 1, h: 1 };
    this.pads = { t: 0, r: 0, b: 0, l: 0 };
    this.pal = null;
    this.explode = 0;
    this.explodeNow = 0;
    this.isolate = true; // a selected floor or apartment is always shown on its own
    this.focus = { ...NONE };
    this.hoverRoom = null;
    this.layers = { labels: true, dims: false, furniture: true };
    this.view = "axo";
    this.orient = { phi: THREE.MathUtils.degToRad(90 - VIEWS.axo.el), theta: THREE.MathUtils.degToRad(VIEWS.axo.az) };
    this.anim = null;
    this.last = performance.now();
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.els = { leaders: new Map(), lines: new Map(), tags: new Map(), labels: new Map(), chip: null, target: null, dims: new Map() };
    this.raycaster = new THREE.Raycaster();
    this.sizes = new Map();
    this.written = new WeakMap();
    this.signal = new THREE.Color();
    this.pointer = { x: 0, y: 0, down: null };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.className = "b3d-canvas";
    host.prepend(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(18, 30, 24);
    this.scene.add(sun);

    for (const f of b.floors) this.floors.push(this.buildFloor(f));
    this.dims = this.buildDims();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 500;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(92);
    this.controls.addEventListener("start", () => (this.anim = null));
    this.controls.addEventListener("end", () => {
      const sp = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
      this.orient = { phi: sp.phi, theta: sp.theta };
    });

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", (e) => this.onMove(e));
    el.addEventListener("pointerdown", (e) => (this.pointer.down = { x: e.clientX, y: e.clientY }));
    el.addEventListener("pointerup", (e) => this.onUp(e));
    el.addEventListener("pointerleave", () => this.onLeave());

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.refreshOverlay();
    this.frame(false, 0, true);
    requestAnimationFrame((t) => this.tick(t));
  }

  /* -------- inputs */
  setPalette(p) {
    this.pal = p;
    setRGB(this.signal, p.signal);
    for (const rt of this.floors) {
      setRGB(rt.fill.color, p.edge);
      rt.fill.emissive.copy(rt.fill.color).multiplyScalar(p.dark ? 0.25 : 0.1);
      setRGB(rt.edges.color, p.edge);
      setRGB(rt.hidden.color, p.edge);
      setRGB(rt.details.color, p.mute);
      setRGB(rt.railings.color, p.mute);
      for (const o of rt.outlines.values()) {
        setRGB(o.line.color, p.signal);
        setRGB(o.halo.color, p.signal);
      }
    }
    setRGB(this.dims.line.color, p.mute);
  }
  setExplode(v) {
    this.explode = v;
    if (this.reduced) this.explodeNow = v;
    this.frame(true, 0.35);
  }
  setView(v) {
    this.view = v;
    this.frame(true, 0.8, true);
  }
  setFocus(f) {
    const changed = f.floor !== this.focus.floor || f.unit !== this.focus.unit;
    this.focus = { ...f };
    this.applyClip();
    if (changed) this.frame(true, 0.7);
  }
  /** «Isolato»: only the selected floor is drawn, and of a selected apartment only its part of the floor. */
  setIsolate(v) {
    this.isolate = v;
    this.applyClip();
    this.frame(true, 0.7);
  }
  applyClip() {
    for (const rt of this.floors) {
      let planes = null;
      const u = this.isolate && this.focus.unit && rt.f.id === this.focus.floor ? rt.f.units.find((x) => x.unitId === this.focus.unit) : null;
      if (u) {
        const m = 0.35;
        const [x0, y0, x1, y1] = u.bounds;
        const X0 = x0 - m - this.cx, X1 = x1 + m - this.cx;
        const Z0 = -(y1 + m - this.cy), Z1 = -(y0 - m - this.cy);
        planes = [
          new THREE.Plane(new THREE.Vector3(1, 0, 0), -X0),
          new THREE.Plane(new THREE.Vector3(-1, 0, 0), X1),
          new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z0),
          new THREE.Plane(new THREE.Vector3(0, 0, -1), Z1),
        ];
      }
      const key = planes ? `${this.focus.unit}` : "";
      if (rt.clipKey === key) continue;
      rt.clipKey = key;
      const mats = [rt.fill, rt.depthMat, rt.edges, rt.hidden, rt.details, rt.railings, ...rt.tiles.map((t) => t.mat)];
      for (const m of mats) {
        m.clippingPlanes = planes;
        m.needsUpdate = true;
      }
    }
  }
  setHover(id) {
    this.hoverRoom = id;
  }
  setLayers(l) {
    this.layers = { ...l };
  }
  setPads(p) {
    this.pads = p;
    this.resize();
    this.frame(true, 0.3);
  }
  reset() {
    this.view = "axo";
    this.frame(true, 0.8, true);
  }
  refreshOverlay() {
    const q = (sel) => [...this.overlay.querySelectorAll(sel)];
    this.els.leaders = new Map(q("[data-leader]").map((e) => [e.dataset.leader, e]));
    this.els.lines = new Map(q("[data-leader-line]").map((e) => [e.dataset.leaderLine, e]));
    this.els.tags = new Map(q("[data-tag]").map((e) => [e.dataset.tag, e]));
    this.els.labels = new Map(q("[data-room]").map((e) => [e.dataset.room, e]));
    this.els.dims = new Map(q("[data-dim]").map((e) => [e.dataset.dim, e]));
    this.els.chip = this.overlay.querySelector("[data-chip]");
    this.els.target = this.overlay.querySelector("[data-target]");
    this.sizes.clear();
  }
  sizeOf(el) {
    let sz = this.sizes.get(el);
    if (!sz) {
      sz = { w: el.offsetWidth, h: el.offsetHeight };
      this.sizes.set(el, sz);
    }
    return sz;
  }

  /* -------- building */
  world(x, h, y, floorY = 0) {
    return new THREE.Vector3(x - this.cx, floorY + SLAB + h, -(y - this.cy));
  }
  line(segs, opts = {}) {
    const pos = new Float32Array(segs.length * 6);
    segs.forEach((s, i) => {
      const a = this.world(s[0], s[1], s[2]);
      const b = this.world(s[3], s[4], s[5]);
      pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    });
    return this.lineFromPositions(pos, opts);
  }
  lineFromPositions(pos, opts) {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos.length ? pos : new Float32Array(6));
    const mat = new LineMaterial({ linewidth: opts.width ?? 1, transparent: true, depthWrite: false, worldUnits: false });
    if (opts.dashed) {
      mat.dashed = true;
      mat.dashSize = opts.dashed;
      mat.gapSize = opts.dashed * 0.8;
    }
    if (opts.depthFunc !== undefined) mat.depthFunc = opts.depthFunc;
    if (opts.depthTest !== undefined) mat.depthTest = opts.depthTest;
    const obj = new LineSegments2(geo, mat);
    if (opts.dashed) obj.computeLineDistances();
    obj.renderOrder = opts.order ?? 4;
    obj.raycast = () => {};
    this.lineMats.push(mat);
    return { obj, mat };
  }
  shape(poly) {
    const s = new THREE.Shape(poly.o.map(([x, y]) => new THREE.Vector2(x - this.cx, y - this.cy)));
    for (const h of poly.h) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x - this.cx, y - this.cy))));
    return s;
  }
  /** A prism standing on the floor: plan outline, from h0 to h1 above the floor's top. */
  prism(poly, h0, h1) {
    const g = new THREE.ExtrudeGeometry(this.shape(poly), { depth: h1 - h0, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, SLAB + h0, 0);
    return g.index ? g.toNonIndexed() : g;
  }
  box(x0, y0, x1, y1, h0, h1) {
    const g = new THREE.BoxGeometry(x1 - x0, h1 - h0, y1 - y0);
    const c = this.world((x0 + x1) / 2, (h0 + h1) / 2, (y0 + y1) / 2);
    g.translate(c.x, c.y, c.z);
    return g.index ? g.toNonIndexed() : g;
  }

  buildFloor(f) {
    const group = new THREE.Group();
    group.name = f.id;
    this.scene.add(group);

    const parts = [];
    for (const p of f.slabPolys) parts.push(this.prism(p, -SLAB, 0));
    for (const p of f.wallPolys) parts.push(this.prism(p, 0, WALL_H));
    for (const p of f.parapetPolys) parts.push(this.prism(p, 0, PARAPET));
    for (const o of f.openings) {
      for (const [x0, y0, x1, y1] of o.rects) {
        if (o.kind === "door") parts.push(this.box(x0, y0, x1, y1, DOOR_HEAD, WALL_H));
        else if (o.kind === "window") parts.push(this.box(x0, y0, x1, y1, 0, WIN_SILL), this.box(x0, y0, x1, y1, WIN_HEAD, WALL_H));
        else parts.push(this.box(x0, y0, x1, y1, WIN_HEAD, WALL_H));
      }
    }
    for (const [x, y, w, d, h] of f.equipment) parts.push(this.box(x, y, x + w, y + d, 0, h));
    const solid = mergeGeometries(parts.map((g) => {
      g.deleteAttribute("uv");
      return g;
    }));
    parts.forEach((g) => g.dispose());

    const fill = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.FrontSide });
    const fillMesh = new THREE.Mesh(solid, fill);
    fillMesh.renderOrder = 1;
    fillMesh.raycast = () => {};
    const depthMat = this.depthMat.clone();
    const depth = new THREE.Mesh(solid, depthMat);
    depth.renderOrder = 0;
    depth.raycast = () => {};
    group.add(depth, fillMesh);

    const edgePos = new THREE.EdgesGeometry(solid, 25).attributes.position.array;
    const edges = this.lineFromPositions(edgePos, { order: 4 });
    const hidden = this.lineFromPositions(edgePos, { dashed: 0.22, depthFunc: THREE.GreaterDepth, order: 2 });
    group.add(edges.obj, hidden.obj);

    // furniture and sanitary fixtures from the drawing, on the floor
    const details = this.line(f.furniture.map(([x1, y1, x2, y2]) => [x1, 0.02, y1, x2, 0.02, y2]), { order: 3 });
    group.add(details.obj);

    // railings on the free edges of balconies and terraces
    const wallEdges = f.wallPolys.flatMap((p) => [p.o, ...p.h]).flatMap((ring) => ring.map((pt, i) => [pt, ring[(i + 1) % ring.length]]));
    const nearWall = (m) => wallEdges.some(([a, b]) => distSeg(m, a, b) < 0.45);
    const rails = [];
    for (const r of f.rooms.filter((x) => x.outdoor)) {
      for (const poly of r.polys) {
        const ring = poly.o;
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i];
          const q = ring[(i + 1) % ring.length];
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (len < 0.35) continue;
          const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          if (nearWall(m)) continue;
          rails.push([p[0], RAIL, p[1], q[0], RAIL, q[1]], [p[0], 0.05, p[1], q[0], 0.05, q[1]]);
          const n = Math.max(1, Math.round(len / 1.2));
          for (let k = 0; k <= n; k++) {
            const s = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n];
            rails.push([s[0], 0.05, s[1], s[0], RAIL, s[1]]);
          }
        }
      }
    }
    const railings = this.line(rails, { order: 3 });
    group.add(railings.obj);

    const tiles = f.rooms.map((room) => {
      const geos = room.polys.map((p) => new THREE.ShapeGeometry(this.shape(p)));
      const g = geos.length > 1 ? mergeGeometries(geos) : geos[0];
      g.rotateX(-Math.PI / 2);
      g.translate(0, SLAB + 0.012, 0);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 1;
      mesh.userData.roomId = room.id;
      group.add(mesh);
      return { room, mesh, mat, hot: 0, emph: 0 };
    });

    const outlines = new Map();
    for (const u of f.units) {
      const segs = u.outline.map(([x1, y1, x2, y2]) => [x1, 0.04, y1, x2, 0.04, y2]);
      const halo = this.line(segs, { width: 9, depthTest: false, order: 5 });
      const line = this.line(segs, { width: 2.2, depthTest: false, order: 6 });
      group.add(halo.obj, line.obj);
      outlines.set(u.unitId, { line: line.mat, halo: halo.mat, show: 0 });
    }

    return { f, group, fill, depth, depthMat, clipKey: "", edges: edges.mat, hidden: hidden.mat, details: details.mat, railings: railings.mat, detailsObj: details.obj, tiles, outlines, y: 0, dim: 0, lift: 0 };
  }

  buildDims() {
    const { x0, x1, y0, y1 } = this.b;
    const o = 2.4;
    const t = 0.35;
    const segs = [
      [x0, 0, y0 - o, x1, 0, y0 - o],
      [x0, 0, y0 - 0.6, x0, 0, y0 - o - 0.5],
      [x1, 0, y0 - 0.6, x1, 0, y0 - o - 0.5],
      [x0 - t, 0, y0 - o + t, x0 + t, 0, y0 - o - t],
      [x1 - t, 0, y0 - o + t, x1 + t, 0, y0 - o - t],
      [x0 - o, 0, y0, x0 - o, 0, y1],
      [x0 - 0.6, 0, y0, x0 - o - 0.5, 0, y0],
      [x0 - 0.6, 0, y1, x0 - o - 0.5, 0, y1],
      [x0 - o - t, 0, y0 - t, x0 - o + t, 0, y0 + t],
      [x0 - o - t, 0, y1 - t, x0 - o + t, 0, y1 + t],
    ];
    const { obj, mat } = this.line(segs, { order: 3 });
    const group = new THREE.Group();
    group.add(obj);
    this.floors[0]?.group.add(group);
    return { line: mat, group };
  }

  /* -------- layout */
  floorY(rt, explode, lift) {
    return rt.f.level * (STOREY + GAP * explode) + lift;
  }
  targetLift(rt) {
    if (this.isolate) return 0;
    const sel = this.floors.find((x) => x.f.id === this.focus.floor);
    return sel && rt.f.level > sel.f.level ? LIFT : 0;
  }
  contentBox() {
    const box = new THREE.Box3();
    const unitRT = this.focus.unit ? this.floors.find((x) => x.f.id === this.focus.floor) : null;
    const unit = unitRT?.f.units.find((u) => u.unitId === this.focus.unit);
    if (unitRT && unit) {
      const y = this.floorY(unitRT, this.explode, this.targetLift(unitRT));
      const [x0, y0, x1, y1] = unit.bounds;
      const m = 1.5;
      box.expandByPoint(this.world(x0 - m, 0, y0 - m, y));
      box.expandByPoint(this.world(x1 + m, WALL_H, y1 + m, y));
      return box;
    }
    const sel = this.floors.filter((x) => !this.focus.floor || x.f.id === this.focus.floor);
    for (const rt of sel) {
      const y = this.floorY(rt, this.explode, this.targetLift(rt));
      const [bx0, by0, bx1, by1] = rt.f.bounds;
      box.expandByPoint(this.world(bx0, 0, by0, y));
      box.expandByPoint(this.world(bx1, rt.f.roof ? 1.8 : WALL_H, by1, y));
      box.expandByPoint(this.world(bx1, -SLAB, by1, y));
    }
    if (!this.focus.floor && this.layers.dims) box.expandByPoint(this.world(this.b.x0 - 3.2, 0, this.b.y0 - 3.2, 0));
    return box;
  }
  frame(animate, dur = 0.6, preset = false) {
    const box = this.contentBox();
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const { w, h } = this.size;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const tanV = (tan * Math.max(80, h - this.pads.t - this.pads.b)) / h;
    const tanH = (tan * Math.max(80, w - this.pads.l - this.pads.r)) / h;
    const dist = (radius / Math.min(tanV, tanH)) * 1.04;
    if (preset) {
      const v = VIEWS[this.view];
      this.orient = { phi: THREE.MathUtils.degToRad(90 - v.el), theta: THREE.MathUtils.degToRad(v.az) };
    }
    const to = new THREE.Spherical(dist, this.orient.phi, this.orient.theta);
    if (!animate || this.reduced) {
      this.camera.position.copy(center.clone().add(new THREE.Vector3().setFromSpherical(to)));
      this.controls?.target.copy(center);
      this.camera.lookAt(center);
      this.anim = null;
      return;
    }
    const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2;
    while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2;
    this.anim = { from, to, tFrom: this.controls.target.clone(), tTo: center, t: 0, dur };
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.size = { w, h };
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, -(this.pads.l - this.pads.r) / 2, -(this.pads.t - this.pads.b) / 2, w, h);
    this.camera.updateProjectionMatrix();
    for (const m of this.lineMats) m.resolution.set(w, h);
  }

  /* -------- picking */
  onMove(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    if (e.pointerType === "mouse" && !e.buttons) {
      const id = this.pick();
      if (id !== this.hoverRoom) {
        this.hoverRoom = id;
        this.events.hover(id);
      }
      this.renderer.domElement.style.cursor = id ? "pointer" : "";
    }
  }
  onLeave() {
    if (this.hoverRoom) {
      this.hoverRoom = null;
      this.events.hover(null);
    }
  }
  onUp(e) {
    const d = this.pointer.down;
    this.pointer.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    this.onMove(e);
    const id = this.pick();
    if (!id) return this.events.pick({ ...NONE });
    const rt = this.floors.find((x) => x.tiles.some((t) => t.room.id === id));
    const room = rt.tiles.find((t) => t.room.id === id).room;
    this.events.pick({ floor: rt.f.id, unit: room.unitId });
  }
  pick() {
    this.raycaster.setFromCamera(new THREE.Vector2(this.pointer.x, this.pointer.y), this.camera);
    const meshes = this.floors.filter((rt) => rt.dim < 0.5 && rt.group.visible).flatMap((rt) => rt.tiles.map((t) => t.mesh));
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit?.object.userData.roomId ?? null;
  }

  /* -------- frame */
  tick(now) {
    requestAnimationFrame((t) => this.tick(t));
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const pal = this.pal;
    if (!pal) return;
    this.explodeNow = this.reduced ? this.explode : approach(this.explodeNow, this.explode, dt);
    const selUnit = this.focus.unit;
    const hoverUnit = this.hoverRoom ? this.floors.flatMap((rt) => rt.tiles).find((t) => t.room.id === this.hoverRoom)?.room.unitId ?? null : null;

    for (const rt of this.floors) {
      const dimT = this.focus.floor && rt.f.id !== this.focus.floor ? 1 : 0;
      rt.dim = this.reduced ? dimT : approach(rt.dim, dimT, dt, 7);
      rt.lift = this.reduced ? this.targetLift(rt) : approach(rt.lift, this.targetLift(rt), dt, 7);
      rt.y = this.floorY(rt, this.explodeNow, rt.lift);
      rt.group.position.y = rt.y;
      rt.group.visible = !(this.isolate && this.focus.floor && rt.f.id !== this.focus.floor);
      const d = rt.dim;
      rt.fill.opacity = THREE.MathUtils.lerp(pal.fillAlpha, pal.dimAlpha, d);
      rt.depth.visible = d < 0.5;
      rt.edges.opacity = THREE.MathUtils.lerp(pal.dark ? 0.62 : 0.7, pal.dark ? 0.035 : 0.045, d);
      rt.hidden.opacity = THREE.MathUtils.lerp(pal.dark ? 0.09 : 0.12, 0, d);
      rt.details.opacity = THREE.MathUtils.lerp(0.55, 0.02, d);
      rt.detailsObj.visible = this.layers.furniture;
      rt.railings.opacity = THREE.MathUtils.lerp(0.7, 0.03, d);
      for (const t of rt.tiles) {
        const hotT = t.room.id === this.hoverRoom ? 1 : 0;
        const emphT = t.room.unitId && t.room.unitId === selUnit ? 1 : 0;
        t.hot = this.reduced ? hotT : approach(t.hot, hotT, dt, 14);
        t.emph = this.reduced ? emphT : approach(t.emph, emphT, dt, 10);
        setRGB(t.mat.color, pal.group[t.room.group]);
        if (t.emph > 0.001) t.mat.color.lerp(this.signal, t.emph * 0.75);
        const base = pal.tileAlpha * (t.room.outdoor ? 0.7 : 1);
        const away = this.isolate && selUnit && t.room.unitId !== selUnit ? 0.15 : 1;
        t.mat.opacity = (base + t.hot * 0.22 + t.emph * 0.16) * (1 - 0.95 * d) * away;
      }
      for (const [unitId, o] of rt.outlines) {
        const showT = unitId === selUnit ? 1 : unitId === hoverUnit ? 0.55 : 0;
        o.show = this.reduced ? showT : approach(o.show, showT, dt, 12);
        o.line.opacity = o.show;
        o.halo.opacity = pal.glow * 0.45 * o.show;
        o.line.visible = o.show > 0.01;
        o.halo.visible = o.halo.opacity > 0.01;
      }
    }
    this.dims.group.visible = this.layers.dims;
    this.dims.line.opacity = 0.8 * (1 - (this.floors[0]?.dim ?? 0));

    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const k = ease(a.t);
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(a.from.radius, a.to.radius, k),
        THREE.MathUtils.lerp(a.from.phi, a.to.phi, k),
        THREE.MathUtils.lerp(a.from.theta, a.to.theta, k),
      );
      this.controls.target.lerpVectors(a.tFrom, a.tTo, k);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(s));
      if (a.t >= 1) this.anim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }
  screen(v) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.size.w, y: ((1 - p.y) / 2) * this.size.h, ok: p.z < 1 && p.z > -1 };
  }
  place(el, show, x = 0, y = 0) {
    if (!el) return;
    const state = show ? `translate(${Math.round(x)}px, ${Math.round(y)}px)` : "";
    if (this.written.get(el) === state) return;
    this.written.set(el, state);
    el.style.visibility = show ? "visible" : "hidden";
    if (show) el.style.transform = state;
  }
  placeLabels() {
    const { w } = this.size;
    const narrow = w < 860;
    const sel = this.focus;
    const roomById = new Map(this.floors.flatMap((rt) => rt.tiles.map((t) => [t.room.id, { rt, room: t.room }])));

    const showLeaders = !narrow && !sel.unit;
    const anchors = this.floors.map((rt) => ({ rt, p: this.screen(this.world(this.b.x1 + 0.4, WALL_H * 0.5, this.cy, rt.y)) }));
    const colX = Math.min(Math.max(...anchors.map((a) => a.p.x)) + 44, w - this.pads.r - 190);
    const sorted = [...anchors].sort((a, b) => b.p.y - a.p.y);
    let lastY = Infinity;
    for (const a of sorted) {
      const y = Math.min(a.p.y, lastY - 30);
      lastY = y;
      const el = this.els.leaders.get(a.rt.f.id);
      const ln = this.els.lines.get(a.rt.f.id);
      const show = showLeaders && a.p.ok && a.rt.dim < 0.9 && a.rt.group.visible;
      this.place(el, show, colX, y);
      if (ln) {
        ln.style.visibility = show ? "visible" : "hidden";
        ln.setAttribute("x1", String(a.p.x));
        ln.setAttribute("y1", String(a.p.y));
        ln.setAttribute("x2", String(colX - 4));
        ln.setAttribute("y2", String(y));
      }
    }

    const hoverUnit = this.hoverRoom ? roomById.get(this.hoverRoom)?.room.unitId : null;
    const placed = [];
    const fits = (el, x, y) => {
      const { w: ew, h: eh } = this.sizeOf(el);
      const r = [x - ew / 2 - 3, y - eh / 2 - 2, x + ew / 2 + 3, y + eh / 2 + 2];
      if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return false;
      placed.push(r);
      return true;
    };
    const rooms = [];
    for (const rt of this.floors) {
      for (const u of rt.f.units) {
        const el = this.els.tags.get(`${rt.f.id}:${u.unitId}`);
        if (rt.f.roof || !el) continue;
        const show = rt.group.visible && ((sel.floor === rt.f.id && !sel.unit) || sel.unit === u.unitId || (hoverUnit === u.unitId && !(this.isolate && sel.unit)));
        const p = this.screen(this.world(u.anchor[0], WALL_H + 0.4, u.anchor[1], rt.y));
        this.place(el, show && p.ok && fits(el, p.x, p.y), p.x, p.y);
      }
      for (const t of rt.tiles) rooms.push({ rt, r: t.room });
    }
    rooms.sort((a, b) => b.r.area - a.r.area);
    for (const { rt, r } of rooms) {
      const el = this.els.labels.get(r.id);
      if (!el) continue;
      const show = (sel.unit !== null && r.unitId === sel.unit && rt.f.id === sel.floor) || (this.layers.labels && sel.floor === rt.f.id && sel.unit === null);
      const p = show ? this.screen(this.world(r.anchor[0], 0.05, r.anchor[1], rt.y)) : null;
      this.place(el, !!p && p.ok && fits(el, p.x, p.y), p?.x, p?.y);
    }

    const hov = this.hoverRoom ? roomById.get(this.hoverRoom) : null;
    if (hov) {
      const p = this.screen(this.world(hov.room.anchor[0], 0.6, hov.room.anchor[1], hov.rt.y));
      this.place(this.els.chip, p.ok, p.x, p.y);
    } else this.place(this.els.chip, false);

    const unitRT = sel.unit ? this.floors.find((rt) => rt.f.id === sel.floor && rt.f.units.some((u) => u.unitId === sel.unit)) : null;
    const unit = unitRT?.f.units.find((u) => u.unitId === sel.unit);
    if (unitRT && unit && this.els.target) {
      const [x0, y0, x1, y1] = unit.bounds;
      const pts = [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [0, WALL_H].map((h) => this.screen(this.world(x, h, y, unitRT.y)))));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const pad = 10;
      const bx = Math.min(...xs) - pad;
      const by = Math.min(...ys) - pad;
      this.els.target.style.width = `${Math.max(...xs) - bx + pad}px`;
      this.els.target.style.height = `${Math.max(...ys) - by + pad}px`;
      this.place(this.els.target, pts.every((p) => p.ok), bx, by);
    } else this.place(this.els.target, false);

    const g = this.floors[0];
    if (g) {
      const { x0, x1, y0, y1 } = this.b;
      const showDims = this.layers.dims && g.dim < 0.5;
      const pw = this.screen(this.world((x0 + x1) / 2, 0, y0 - 2.4, g.y));
      const pd = this.screen(this.world(x0 - 2.4, 0, (y0 + y1) / 2, g.y));
      this.place(this.els.dims.get("w"), showDims && pw.ok, pw.x, pw.y);
      this.place(this.els.dims.get("d"), showDims && pd.ok, pd.x, pd.y);
    }
  }
}

function distSeg([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/* ------------------------------------------------------------------ UI */

const state = {
  theme: "scuro",
  focus: { ...NONE },
  hover: null,
  layers: { labels: true, dims: false, furniture: true },
  sheet: false,
  narrow: false,
};
let engine = null;

const floorCode = (f) => S.code(f.level, f.roof);
const roomName = (r) => r.label ?? S.kinds[r.kind] ?? r.kind;
const indoorFloors = floors.filter((f) => !f.roof);
const roomById = new Map(floors.flatMap((f) => f.rooms.map((r) => [r.id, { room: r, floor: f }])));
const floorOfUnit = (id) => floors.find((f) => !f.roof && f.units.some((u) => u.unitId === id));

function select(next) {
  if (next.unit) {
    const f = floorOfUnit(next.unit);
    if (f) next = { floor: f.id, unit: next.unit };
  }
  state.focus = next;
  state.sheet = next.floor !== null;
  engine?.setFocus(next);
  history.replaceState(null, "", next.unit ? `#${next.unit}` : next.floor ? `#${next.floor}` : location.pathname);
  renderPanels();
  updateOverlayState();
  updatePads();
}

/* -------- overlay (built once, the engine places it) */
function buildOverlay() {
  const parts = [];
  parts.push(`<svg class="b3d-leader-svg" aria-hidden="true">${floors.map((f) => `<line data-leader-line="${f.id}"/>`).join("")}</svg>`);
  for (const f of floors) {
    parts.push(
      `<button type="button" data-leader="${f.id}" class="b3d-lead"><span class="b3d-lead-code">${floorCode(f)}</span>${esc(f.name)}${f.roof ? "" : f.level < 0 ? `<small>31 box</small>` : `<small>${f.units.length} app.</small>`}</button>`,
    );
  }
  for (const f of indoorFloors)
    for (const u of f.units)
      parts.push(`<button type="button" data-tag="${f.id}:${u.unitId}" data-unit="${u.unitId}" class="b3d-tag">${esc(u.unitId)}</button>`);
  for (const f of floors)
    for (const r of f.rooms)
      parts.push(`<span data-room="${r.id}" class="b3d-room" style="--c: var(--k-${r.group})">${esc(roomName(r))}<small>${fmtArea(r.area)}</small></span>`);
  parts.push(`<div data-chip class="b3d-chip" aria-hidden="true"></div>`);
  parts.push(`<div data-target class="b3d-target" aria-hidden="true"></div>`);
  parts.push(`<span data-dim="w" class="b3d-dim">${fmt(B.x1 - B.x0, 2, 2)} m</span>`);
  parts.push(`<span data-dim="d" class="b3d-dim">${fmt(B.y1 - B.y0, 2, 2)} m</span>`);
  overlayEl.innerHTML = parts.join("");
  overlayEl.querySelectorAll("[data-leader]").forEach((el) =>
    el.addEventListener("click", () => {
      const id = el.dataset.leader;
      select(state.focus.floor === id && !state.focus.unit ? { ...NONE } : { floor: id, unit: null });
    }),
  );
  overlayEl.querySelectorAll("[data-tag]").forEach((el) => el.addEventListener("click", () => select({ floor: null, unit: el.dataset.unit })));
}
function updateOverlayState() {
  overlayEl.querySelectorAll("[data-leader]").forEach((el) => {
    if (state.focus.floor === el.dataset.leader) el.setAttribute("data-current", "true");
    else el.removeAttribute("data-current");
  });
  overlayEl.querySelectorAll("[data-leader-line]").forEach((el) => {
    if (state.focus.floor === el.dataset.leaderLine) el.setAttribute("data-current", "true");
    else el.removeAttribute("data-current");
  });
  overlayEl.querySelectorAll("[data-tag]").forEach((el) => {
    if (state.focus.unit === el.dataset.unit) el.setAttribute("data-current", "true");
    else el.removeAttribute("data-current");
  });
}
function updateChip() {
  const chip = overlayEl.querySelector("[data-chip]");
  const hov = state.hover ? roomById.get(state.hover) : null;
  if (!hov) return;
  chip.style.setProperty("--c", `var(--k-${hov.room.group})`);
  chip.innerHTML = `<small>${hov.room.unitId ? `Int. ${esc(hov.room.unitId)} · ` : ""}${floorCode(hov.floor)}</small>${esc(roomName(hov.room))} · ${fmtArea(hov.room.area)}`;
}

/* -------- panels */
const kpi = (value, label) => `<div class="b3d-kpi"><b>${value}</b><span>${label}</span></div>`;

function renderLeft() {
  const el = document.getElementById("left");
  el.innerHTML = `
    <section class="b3d-sec">
      <h3 class="b3d-eyebrow">Piani</h3>
      <div class="b3d-flist">
        ${[...floors].reverse().map((f) => `
          <button type="button" class="b3d-frow" data-floor="${f.id}" ${state.focus.floor === f.id ? 'aria-current="true"' : ""}>
            <span class="b3d-code">${floorCode(f)}</span>
            <span class="b3d-fname">${esc(f.name)}<small>${f.roof ? "Copertura piana" : f.level < 0 ? "Box 1–31 · cantine" : f.units.map((u) => u.unitId).join(" · ")}</small></span>
            <span class="b3d-fcount">${f.roof || f.level < 0 ? "—" : f.units.length}</span>
          </button>`).join("")}
      </div>
    </section>
    <section class="b3d-sec">
      <h3 class="b3d-eyebrow">Legenda</h3>
      <div class="b3d-key">${GROUPS.map((g) => `<span style="--c: var(--k-${g})"><i></i>${S.groups[g]}</span>`).join("")}</div>
    </section>
    <section class="b3d-sec">
      <h3 class="b3d-eyebrow">Livelli</h3>
      ${[["labels", "Nomi delle stanze"], ["furniture", "Arredi e sanitari"], ["dims", "Quote"]].map(([k, l]) => `
        <button type="button" class="b3d-layer" data-layer="${k}" aria-pressed="${state.layers[k]}"><span>${l}</span><i class="b3d-switch"></i></button>`).join("")}
    </section>`;
  el.querySelectorAll("[data-floor]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.floor;
      select(state.focus.floor === id && !state.focus.unit ? { ...NONE } : { floor: id, unit: null });
    }),
  );
  el.querySelectorAll("[data-layer]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.layer;
      state.layers = { ...state.layers, [k]: !state.layers[k] };
      engine?.setLayers(state.layers);
      if (k === "dims") engine?.frame(true, 0.4);
      renderLeft();
    }),
  );
}

function renderStrip() {
  const el = document.getElementById("strip");
  el.innerHTML =
    `<button type="button" data-f="" aria-pressed="${!state.focus.floor}">Edificio</button>` +
    floors.map((f) => `<button type="button" data-f="${f.id}" aria-pressed="${state.focus.floor === f.id}">${floorCode(f)}</button>`).join("");
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => select(b.dataset.f ? { floor: b.dataset.f, unit: null } : { ...NONE })));
}

function renderRight() {
  const el = document.getElementById("right");
  el.dataset.open = state.sheet ? "true" : "false";
  const f = floors.find((x) => x.id === state.focus.floor) ?? null;
  const info = state.focus.unit ? UNITS.get(state.focus.unit) : null;
  let body = "";
  if (info && f) {
    const rooms = [...f.rooms.filter((r) => r.unitId === info.id)].sort((a, b) => b.area - a.area);
    const max = Math.max(...rooms.map((r) => r.area));
    body = `
      <div class="b3d-dhead">
        <button type="button" class="b3d-back" data-go="floor">← ${esc(f.name)}</button>
        <h2>Interno ${esc(info.id)}</h2>
        <p class="b3d-meta">${info.typo} · ${esc(f.name)}${info.outdoorKind ? ` · con ${info.outdoorKind}` : ""}</p>
      </div>
      <div class="b3d-kpis b3d-pad">
        ${kpi(fmt(info.area, 0), "m² netti")}
        ${kpi(String(info.rooms), "Locali")}
        ${kpi(info.outdoor ? fmt(info.outdoor, 0) : "—", info.outdoorKind === "terrazzo" ? "m² terrazzo" : "m² balconi")}
      </div>
      <section class="b3d-sec">
        <h3 class="b3d-eyebrow">Stanze</h3>
        <div class="b3d-bars">
          ${rooms.map((r) => `
            <div class="b3d-bar" data-hover="${r.id}">
              <span class="b3d-blbl"><span>${esc(roomName(r))}</span></span>
              <span class="b3d-track"><span style="width:${(r.area / max) * 100}%; background: var(--k-${r.group})"></span></span>
              <span class="b3d-pct">${fmtArea(r.area)}</span>
            </div>`).join("")}
        </div>
        <p class="b3d-note">Superfici nette calpestabili misurate sulla pianta di progetto, indicative.</p>
      </section>
      <div class="b3d-acts b3d-pad">
        <a href="../#contatti" class="b3d-act b3d-act-main" data-ask="${esc(info.id)}">Chiedi info</a>
        ${{ "4": "4", "10": "4", "21": "21", "25": "25" }[info.id] ? `<a href="tipo.html?u=${{ "4": "4", "10": "4", "21": "21", "25": "25" }[info.id]}" class="b3d-act">Pianta e tour</a>` : ""}
        <a href="../assets/${f.id === "pt" ? "pianta-pt.png" : f.id === "p3" ? "pianta-p3.png" : f.id === "p4" ? "pianta-p4.png" : f.id === "p5" ? "pianta-p5.png" : "pianta-p12.png"}" target="_blank" rel="noopener" class="b3d-act">Pianta del piano</a>
      </div>`;
  } else if (f) {
    const notes = {
      pt: "Al piano terra: tre appartamenti, l'atrio d'ingresso, il deposito cantine (17 cantine) e il portico verso la piazza.",
      cp: "Copertura piana con parapetto perimetrale e volume dell'extracorsa ascensore (schematico).",
      p5: "Due attici con terrazzi su tre lati.",
      pi: "Autorimessa interrata dalla tavola 03: 31 box (numerati 1–31), le cantine 18–28 e i locali tecnici attorno al vano scala, con accesso carraio dalla rampa verso via Alessandro Volta. I box doppi in tandem compaiono come un unico vano.",
    };
    body = `
      <div class="b3d-dhead">
        <button type="button" class="b3d-back" data-go="none">← Tutto l'edificio</button>
        <h2>${esc(f.name)}</h2>
        <p class="b3d-meta">${floorCode(f)} · quota ${f.level < 0 ? "−" : ""}${fmt(Math.abs(f.level * STOREY), 2, 2)} m</p>
      </div>
      ${f.level < 0 ? `
      <div class="b3d-kpis b3d-pad">
        ${kpi("31", "Box auto")}
        ${kpi("11", "Cantine")}
        ${kpi(fmtArea(Math.round(f.rooms.filter((r) => r.kind === "drive").reduce((n, r) => n + r.area, 0))), "Corsia")}
      </div>
      <section class="b3d-sec">
        <h3 class="b3d-eyebrow">Locali</h3>
        <div class="b3d-bars">
          ${["garage", "cellar", "plant", "drive"].map((k) => {
            const rs = f.rooms.filter((r) => r.kind === k);
            if (!rs.length) return "";
            const tot = rs.reduce((n, r) => n + r.area, 0);
            return `<div class="b3d-bar"><span class="b3d-blbl"><span>${S.kinds[k]}</span><span class="b3d-bval">${rs.length} ${rs.length === 1 ? "vano" : "vani"}</span></span>
              <span class="b3d-track"><span style="width:${Math.min(100, (tot / 720) * 100)}%; background: var(--k-${GROUP_OF[k]})"></span></span><span class="b3d-pct">${fmtArea(Math.round(tot))}</span></div>`;
          }).join("")}
        </div>
      </section>
      <p class="b3d-note b3d-pad">${notes.pi}</p>` : f.roof ? `<p class="b3d-note b3d-pad">${notes.cp}</p>` : `
      <div class="b3d-kpis b3d-pad">
        ${kpi(String(f.units.length), "Appartamenti")}
        ${kpi(fmtArea(Math.round(f.units.reduce((n, u) => n + u.area, 0))), "Superficie netta")}
        ${kpi(fmtArea(Math.round(f.units.reduce((n, u) => n + u.outdoor, 0))), "Esterni")}
      </div>
      <div class="b3d-rows">
        ${f.units.map((u) => {
          const i = UNITS.get(u.unitId);
          return `<button type="button" class="b3d-row" data-unit="${u.unitId}" data-hover="${u.rooms[0] ?? ""}">
            <span class="b3d-rn">Int. ${esc(u.unitId)}<small>${i.typo}${i.outdoorKind ? ` · ${i.outdoorKind}` : ""}</small></span>
            <span class="b3d-rs">${fmt(u.area, 0)} m²</span>
            <span class="b3d-pill us-available">${u.outdoor ? `+${fmt(u.outdoor, 0)} m²` : "—"}</span>
          </button>`;
        }).join("")}
      </div>
      ${notes[f.id] ? `<p class="b3d-note b3d-pad">${notes[f.id]}</p>` : ""}`}`;
  } else {
    const units = [...UNITS.values()];
    body = `
      <div class="b3d-dhead">
        <p class="b3d-eyebrow">Edificio residenziale</p>
        <h2>Piazza Beretta</h2>
        <p class="b3d-meta">Ambito ATU 5A · ex Consorzio Agrario · Corbetta (MI)</p>
      </div>
      <div class="b3d-kpis b3d-pad">
        ${kpi(String(indoorFloors.filter((f) => f.level >= 0).length), "Piani f.t.")}
        ${kpi(String(units.length), "Appartamenti")}
        ${kpi("19,45", "m altezza")}
      </div>
      <section class="b3d-sec">
        <h3 class="b3d-eyebrow">Tipologie</h3>
        <div class="b3d-bars">
          ${["Bilocale", "Trilocale", "Quadrilocale", "5 locali", "6 locali", "7 locali"].map((t) => {
            const n = units.filter((u) => u.typo === t).length;
            if (!n) return "";
            return `<div class="b3d-bar"><span class="b3d-blbl"><span>${t}</span><span class="b3d-bval">${fmt(Math.min(...units.filter((u) => u.typo === t).map((u) => u.area)), 0)}–${fmt(Math.max(...units.filter((u) => u.typo === t).map((u) => u.area)), 0)} m²</span></span>
              <span class="b3d-track"><span style="width:${(n / units.length) * 100}%; background: var(--signal)"></span></span><span class="b3d-pct">${n}</span></div>`;
          }).join("")}
        </div>
      </section>
      <section class="b3d-sec">
        <h3 class="b3d-eyebrow">Dati urbanistici ATU 5A</h3>
        <div class="b3d-facts">
          <div><span>Superficie territoriale</span><b>5.773,33 m²</b></div>
          <div><span>Superficie fondiaria</span><b>2.977,41 m²</b></div>
          <div><span>SL residenziale</span><b>2.239,59 m²</b></div>
          <div><span>SL commerciale</span><b>486,97 m²</b></div>
          <div><span>Altezza di progetto</span><b>19,45 m</b></div>
        </div>
      </section>
      <p class="b3d-note b3d-pad">Modello generato dalle piante di progetto (tav. 04, dic. 2025): pareti, porte, finestre e arredi sono ricavati dal disegno; destinazione dei locali e superfici nette sono calcolate in automatico e hanno valore indicativo.</p>`;
  }
  el.innerHTML = `<button type="button" class="b3d-handle" aria-label="Apri" aria-expanded="${state.sheet}"></button><div>${body}</div>`;
  el.querySelector(".b3d-handle").addEventListener("click", () => {
    state.sheet = !state.sheet;
    renderRight();
    updatePads();
  });
  el.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => select(b.dataset.go === "floor" ? { floor: state.focus.floor, unit: null } : { ...NONE })),
  );
  el.querySelectorAll("[data-unit]").forEach((b) => b.addEventListener("click", () => select({ floor: state.focus.floor, unit: b.dataset.unit })));
  el.querySelectorAll("[data-hover]").forEach((b) => {
    b.addEventListener("mouseenter", () => setHover(b.dataset.hover || null));
    b.addEventListener("mouseleave", () => setHover(null));
  });
  el.querySelectorAll("[data-ask]").forEach((a) =>
    a.addEventListener("click", () => {
      const i = UNITS.get(a.dataset.ask);
      try {
        sessionStorage.setItem("pb:ask", `Vorrei informazioni sull'interno ${i.id} (${i.typo.toLowerCase()}, ${i.floor.name.toLowerCase()}, circa ${fmt(i.area, 0)} m² netti) della residenza Piazza Beretta.`);
      } catch {
        /* the form opens empty */
      }
    }),
  );
}

function renderTape() {
  const items = indoorFloors.flatMap((f) =>
    f.units.map((u) => {
      const i = UNITS.get(u.unitId);
      return `<span><b>Int. ${esc(u.unitId)}</b> ${floorCode(f)} · ${i.typo.toLowerCase()} ${fmt(u.area, 0)} m²${u.outdoor ? ` · <em class="us-available">+ ${fmt(u.outdoor, 0)} m² ${i.outdoorKind}</em>` : ""}</span>`;
    }),
  );
  document.getElementById("tape").innerHTML = [0, 1].map((k) => `<span${k ? ' aria-hidden="true"' : ""}>${items.join("")}</span>`).join("");
}

function renderPanels() {
  renderLeft();
  renderStrip();
  renderRight();
}

function setHover(id) {
  state.hover = id;
  engine?.setHover(id);
  updateChip();
}

function updatePads() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  state.narrow = w < 860;
  app.dataset.narrow = state.narrow ? "true" : "false";
  const pads = state.narrow
    ? { t: 52 + 48, l: 0, r: 0, b: 16 + (state.sheet ? Math.round(h * 0.46) : 0) }
    : { t: 52 + 8, l: w < 1100 ? 244 : 272, r: w < 1100 ? 352 : 392, b: 30 + 50 };
  engine?.setPads(pads);
}

/* -------- theme, controls */
function applyTheme(t, save) {
  state.theme = t;
  app.dataset.tema = t;
  document.querySelectorAll("#themes [data-theme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === t)));
  if (save) {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* the choice lasts for this visit */
    }
  }
  engine?.setPalette(readPalette(app));
}
let saved = null;
try {
  saved = localStorage.getItem(THEME_KEY);
} catch {
  /* follow the default */
}
applyTheme(saved === "scuro" || saved === "chiaro" ? saved : "scuro", false);
document.querySelectorAll("#themes [data-theme]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.theme, true)));

document.getElementById("recenter").addEventListener("click", () => engine?.reset());
const hint = document.getElementById("hint");
stageEl.addEventListener("pointerdown", () => hint.setAttribute("data-hidden", "true"));
stageEl.addEventListener("wheel", () => hint.setAttribute("data-hidden", "true"), { passive: true });
addEventListener("keydown", (e) => {
  if (e.key === "Escape") select(state.focus.unit ? { floor: state.focus.floor, unit: null } : { ...NONE });
});
addEventListener("resize", updatePads);

document.getElementById("cartouche").innerHTML = `
  <span><b>Piazza Beretta</b> · Corbetta (MI)</span>
  <span>PI + ${indoorFloors.filter((f) => f.level >= 0).length} piani + CP · ${fmt(B.x1 - B.x0, 2, 2)} × ${fmt(B.y1 - B.y0, 2, 2)} m</span>
  <em>Dalle piante di progetto · tav. 04</em>`;

/* -------- start */
buildOverlay();
renderPanels();
renderTape();
try {
  engine = new BuildingEngine(stageEl, overlayEl, B, {
    hover: (id) => setHover(id),
    pick: (f) => select(f.unit ? f : f.floor ? { floor: f.floor, unit: null } : { ...NONE }),
  });
  engine.setPalette(readPalette(app));
  engine.setLayers(state.layers);
} catch (err) {
  console.error(err);
  const p = document.createElement("p");
  p.className = "b3d-failed";
  p.textContent = "Questo browser non può mostrare il modello 3D (WebGL non disponibile).";
  stageEl.append(p);
}
document.getElementById("boot").remove();
updatePads();
const fromHash = decodeURIComponent(location.hash.slice(1));
if (fromHash && floorOfUnit(fromHash)) select({ floor: null, unit: fromHash });
else if (fromHash && floors.some((f) => f.id === fromHash)) select({ floor: fromHash, unit: null });

