/* Piazza Beretta – appartamento tipo.
   Two looks at one apartment, in the style of the building view: «Pianta», the plan seen from above with its
   furniture, dimensions and entrance; «Vista interna», a walk through the rooms at eye height. Data: tipi.json,
   cut out of building.json (tools/tipi.py). */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const WALL_H = 2.74;
const DOOR_HEAD = 2.1;
const WIN_SILL = 1.0;
const WIN_HEAD = 2.35;
const EYE = 1.6;
const THEME_KEY = "piazza-beretta.3d.tema2";
const GROUP_OF = { living: "day", kitchen: "day", bedroom: "night", bathroom: "bath", storage: "serv", hall: "dist", balcony: "out", terrace: "out" };
const KIND = { living: "Soggiorno", kitchen: "Cucina", bedroom: "Camera", bathroom: "Bagno", storage: "Ripostiglio", hall: "Disimpegno", balcony: "Balcone", terrace: "Terrazzo" };
const OUTDOOR = new Set(["balcony", "terrace"]);

const fmt = (n, d = 1) => n.toLocaleString("it-IT", { maximumFractionDigits: d });
const fmtArea = (n) => `${fmt(n, n < 10 ? 1 : 0)} m²`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;
const root = document.getElementById("ix");
const stage = document.getElementById("stage");
const overlay = document.getElementById("overlay");

const DATA = await fetch("tipi.json").then((r) => r.json());
const U = DATA.units.find((u) => u.id === params.get("u")) ?? DATA.units[0];
document.title = `Piazza Beretta | Interno ${U.id} · ${U.typo}`;

const rooms = U.rooms.map((r) => ({ ...r, group: GROUP_OF[r.kind] ?? "dist", outdoor: OUTDOOR.has(r.kind), label: r.name ?? KIND[r.kind] ?? r.kind }));
const [bx0, by0, bx1, by1] = U.bounds;
const cx = (bx0 + bx1) / 2;
const cy = (by0 + by1) / 2;
const W3 = (x, h, y) => new THREE.Vector3(x - cx, h, -(y - cy));

/* ------------------------------------------------------------------ helpers */
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
const walkable = (pt) => !!roomAt(pt) || doorRects.some(([x0, y0, x1, y1]) => pt[0] >= x0 - 0.08 && pt[0] <= x1 + 0.08 && pt[1] >= y0 - 0.08 && pt[1] <= y1 + 0.08);

function parseColor(s, fb) {
  const v = s.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    const h = m[1];
    const full = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const n = (i) => parseInt(full.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4) };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255 };
  }
  return fb;
}
const GREY = { r: 0.55, g: 0.55, b: 0.55 };
function palette() {
  const css = getComputedStyle(root);
  const v = (n) => css.getPropertyValue(n);
  const group = {};
  for (const g of ["day", "night", "bath", "serv", "dist", "out"]) group[g] = parseColor(v(`--k-${g}`), GREY);
  return {
    dark: v("--o-dark").trim() !== "0",
    edge: parseColor(v("--o-edge"), { r: 1, g: 1, b: 1 }),
    ink: parseColor(v("--ink"), { r: 0.9, g: 0.9, b: 0.9 }),
    mute: parseColor(v("--mute"), GREY),
    signal: parseColor(v("--signal"), { r: 0.33, g: 0.89, b: 0.81 }),
    group,
  };
}
const setRGB = (c, x) => c.setRGB(x.r, x.g, x.b, THREE.SRGBColorSpace);

/* ------------------------------------------------------------------ scene */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.domElement.className = "b3d-canvas";
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(14, 30, 20);
scene.add(sun);

const lineMats = [];
function lines(segs, opts = {}) {
  const pos = new Float32Array(Math.max(1, segs.length) * 6);
  segs.forEach((s, i) => {
    const a = W3(s[0], s[1], s[2]);
    const b = W3(s[3], s[4], s[5]);
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
  });
  return linesFrom(pos, opts);
}
function linesFrom(pos, opts = {}) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
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
  lineMats.push(mat);
  scene.add(obj);
  return { obj, mat };
}
const shape = (p) => {
  const s = new THREE.Shape(p.o.map(([x, y]) => new THREE.Vector2(x - cx, y - cy)));
  for (const h of p.h) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x - cx, y - cy))));
  return s;
};
function prism(p, h0, h1) {
  const g = new THREE.ExtrudeGeometry(shape(p), { depth: h1 - h0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, h0, 0);
  g.deleteAttribute("uv");
  return g.index ? g.toNonIndexed() : g;
}
function box(x0, y0, x1, y1, h0, h1) {
  const g = new THREE.BoxGeometry(x1 - x0, h1 - h0, y1 - y0);
  const c = W3((x0 + x1) / 2, (h0 + h1) / 2, (y0 + y1) / 2);
  g.translate(c.x, c.y, c.z);
  g.deleteAttribute("uv");
  return g.index ? g.toNonIndexed() : g;
}

// walls, lintels and sills
const parts = U.walls.map((p) => prism(p, 0, WALL_H));
for (const o of U.openings)
  for (const [x0, y0, x1, y1] of o.rects) {
    if (o.kind === "door") parts.push(box(x0, y0, x1, y1, DOOR_HEAD, WALL_H));
    else if (o.kind === "window") parts.push(box(x0, y0, x1, y1, 0, WIN_SILL), box(x0, y0, x1, y1, WIN_HEAD, WALL_H));
    else parts.push(box(x0, y0, x1, y1, WIN_HEAD, WALL_H));
  }
const solid = mergeGeometries(parts);
const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const depthMesh = new THREE.Mesh(solid, depthMat);
depthMesh.renderOrder = 0;
const fill = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth });
const fillMesh = new THREE.Mesh(solid, fill);
fillMesh.renderOrder = 1;
scene.add(depthMesh, fillMesh);
const edgePos = new THREE.EdgesGeometry(solid, 25).attributes.position.array;
const edges = linesFrom(edgePos, { order: 4 });
const hidden = linesFrom(edgePos, { dashed: 0.18, depthFunc: THREE.GreaterDepth, order: 2 });

// wall tops: the plan's poché
const capGeo = mergeGeometries(U.walls.map((p) => new THREE.ShapeGeometry(shape(p))));
capGeo.rotateX(-Math.PI / 2);
capGeo.translate(0, WALL_H + 0.01, 0);
const capMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
const caps = new THREE.Mesh(capGeo, capMat);
caps.renderOrder = 3;
scene.add(caps);

// windows: plan symbol and glass panes
const winSym = [];
const glassParts = [];
for (const o of U.openings) {
  if (o.kind === "door") continue;
  for (const [x0, y0, x1, y1] of o.rects) {
    const h = WALL_H + 0.02;
    const horiz = x1 - x0 >= y1 - y0;
    winSym.push([x0, h, y0, x1, h, y0], [x1, h, y0, x1, h, y1], [x1, h, y1, x0, h, y1], [x0, h, y1, x0, h, y0]);
    if (horiz) winSym.push([x0, h, (y0 + y1) / 2, x1, h, (y0 + y1) / 2]);
    else winSym.push([(x0 + x1) / 2, h, y0, (x0 + x1) / 2, h, y1]);
    const s0 = o.kind === "window" ? WIN_SILL : 0.02;
    const g = horiz ? new THREE.PlaneGeometry(x1 - x0, WIN_HEAD - s0) : new THREE.PlaneGeometry(y1 - y0, WIN_HEAD - s0);
    if (!horiz) g.rotateY(Math.PI / 2);
    const c = W3((x0 + x1) / 2, (s0 + WIN_HEAD) / 2, (y0 + y1) / 2);
    g.translate(c.x, c.y, c.z);
    glassParts.push(g);
  }
}
const winLines = lines(winSym, { order: 5, width: 1.4 });
const glassMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
const glass = new THREE.Mesh(glassParts.length ? mergeGeometries(glassParts) : new THREE.BufferGeometry(), glassMat);
glass.renderOrder = 2;
scene.add(glass);

// room tiles
const tiles = rooms.map((r) => {
  const g = mergeGeometries(r.polys.map((p) => new THREE.ShapeGeometry(shape(p))));
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.01, 0);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 1;
  mesh.userData.room = r;
  scene.add(mesh);
  return { r, mesh, mat, hot: 0 };
});
// a faint floor under the whole apartment and its outline, for the inside view
const floorEdges = rooms.flatMap((r) => r.polys.flatMap((p) => p.o.map((a, i) => { const b = p.o[(i + 1) % p.o.length]; return [a[0], 0.015, a[1], b[0], 0.015, b[1]]; })));
const roomLines = lines(floorEdges, { order: 3 });

// furniture: drawn lines (flat in plan, lifted to a volume inside) and the boxes placed by hand
const flat = U.furniture.map(([x1, y1, x2, y2]) => [x1, 0.03, y1, x2, 0.03, y2]);
const vol = [];
for (const [x1, y1, x2, y2, h] of U.furniture) {
  vol.push([x1, h, y1, x2, h, y2]);
  if (Math.hypot(x2 - x1, y2 - y1) > 0.25) vol.push([x1, 0.02, y1, x1, h, y1], [x2, 0.02, y2, x2, h, y2]);
}
const furnFlat = lines(flat, { order: 3 });
const furnVol = lines([...flat, ...vol], { order: 3 });
const boxGeo = U.boxes.length ? mergeGeometries(U.boxes.map(({ r: [x0, y0, x1, y1], h }) => box(x0, y0, x1, y1, 0, h))) : null;
const boxMat = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });
const boxMesh = boxGeo ? new THREE.Mesh(boxGeo, boxMat) : new THREE.Group();
boxMesh.renderOrder = 2;
scene.add(boxMesh);
const boxLines = boxGeo ? linesFrom(new THREE.EdgesGeometry(boxGeo, 25).attributes.position.array, { order: 4 }) : linesFrom(new Float32Array(6));

// dimensions of the apartment, in plan
const [ix0, iy0, ix1, iy1] = [bx0 + 0.4, by0 + 0.4, bx1 - 0.4, by1 - 0.4];
const o = 0.9;
const t = 0.18;
const dimSegs = [
  [ix0, 0.05, iy1 + o, ix1, 0.05, iy1 + o], [ix0, 0.05, iy1 + 0.25, ix0, 0.05, iy1 + o + 0.25], [ix1, 0.05, iy1 + 0.25, ix1, 0.05, iy1 + o + 0.25],
  [ix0 - t, 0.05, iy1 + o - t, ix0 + t, 0.05, iy1 + o + t], [ix1 - t, 0.05, iy1 + o - t, ix1 + t, 0.05, iy1 + o + t],
  [ix0 - o, 0.05, iy0, ix0 - o, 0.05, iy1], [ix0 - 0.25, 0.05, iy0, ix0 - o - 0.25, 0.05, iy0], [ix0 - 0.25, 0.05, iy1, ix0 - o - 0.25, 0.05, iy1],
  [ix0 - o - t, 0.05, iy0 - t, ix0 - o + t, 0.05, iy0 + t], [ix0 - o - t, 0.05, iy1 - t, ix0 - o + t, 0.05, iy1 + t],
];
const dims = lines(dimSegs, { order: 3 });

/* ------------------------------------------------------------------ cameras */
const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
ortho.position.set(0, 60, 0);
ortho.up.set(0, 0, -1);
ortho.lookAt(0, 0, 0);
const persp = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
const controls = new OrbitControls(ortho, renderer.domElement);
controls.enableRotate = false;
controls.screenSpacePanning = true;
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minZoom = 0.6;
controls.maxZoom = 6;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

const state = {
  mode: params.get("vista") === "interna" ? "inside" : "plan",
  hover: null,
  pos: [...U.start.at],
  yaw: Math.atan2(U.start.look[0] - U.start.at[0], U.start.look[1] - U.start.at[1]),
  pitch: 0.06,
  walk: null,
  size: { w: 1, h: 1 },
  ppm: 1,
};

function fitPlan() {
  const { w, h } = state.size;
  const pad = 70;
  const spanX = bx1 - bx0 + 2.6;
  const spanY = by1 - by0 + 2.6;
  const ppm = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  state.ppm = ppm;
  ortho.left = -w / 2 / ppm;
  ortho.right = w / 2 / ppm;
  ortho.top = h / 2 / ppm;
  ortho.bottom = -h / 2 / ppm;
  ortho.zoom = 1;
  ortho.position.set(-0.5, 60, 0.4);
  controls.target.set(-0.5, 0, 0.4);
  ortho.updateProjectionMatrix();
}
function resize() {
  const { width, height } = stage.getBoundingClientRect();
  state.size = { w: Math.max(1, width), h: Math.max(1, height) };
  renderer.setSize(state.size.w, state.size.h);
  persp.aspect = state.size.w / state.size.h;
  persp.updateProjectionMatrix();
  for (const m of lineMats) m.resolution.set(state.size.w, state.size.h);
  fitPlan();
}
new ResizeObserver(resize).observe(stage);

/* ------------------------------------------------------------------ overlay */
const labelEls = new Map();
function buildOverlay() {
  overlay.innerHTML =
    rooms.map((r) => `<span class="ix-label" data-room="${r.id}" style="--c: var(--k-${r.group})">${esc(r.label)}<small>${fmtArea(r.area)}</small></span>`).join("") +
    `<span class="ix-entry" data-entry title="Ingresso"><svg viewBox="0 0 24 24"><path d="M12 4v15M6 13l6 6 6-6"/></svg></span>` +
    `<span class="ix-dim" data-dim="w">${fmt(ix1 - ix0, 2)} m</span><span class="ix-dim" data-dim="d">${fmt(iy1 - iy0, 2)} m</span>` +
    `<div class="b3d-chip" data-chip></div>`;
  for (const el of overlay.querySelectorAll("[data-room]")) {
    labelEls.set(el.dataset.room, el);
    el.addEventListener("click", () => state.mode === "inside" && walkTo(rooms.find((r) => r.id === el.dataset.room).anchor));
  }
  const entry = overlay.querySelector("[data-entry] svg");
  const rot = { down: 0, up: 180, left: 90, right: -90 }[U.entry[2]] ?? 0;
  entry.style.transform = `rotate(${rot}deg)`;
}
const screen = (v, cam) => {
  const p = v.clone().project(cam);
  return { x: ((p.x + 1) / 2) * state.size.w, y: ((1 - p.y) / 2) * state.size.h, ok: p.z > -1 && p.z < 1 };
};
const place = (el, show, x = 0, y = 0) => {
  el.style.visibility = show ? "visible" : "hidden";
  if (show) el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
};
function placeOverlay() {
  const plan = state.mode === "plan";
  const cam = plan ? ortho : persp;
  const here = roomAt(state.pos);
  for (const r of rooms) {
    const el = labelEls.get(r.id);
    if (plan) {
      const p = screen(W3(r.anchor[0], 0.1, r.anchor[1]), cam);
      place(el, p.ok && (r.area > 2.2 || ortho.zoom > 1.6), p.x, p.y);
    } else {
      const v = W3(r.anchor[0], 1.1, r.anchor[1]);
      const d = Math.hypot(r.anchor[0] - state.pos[0], r.anchor[1] - state.pos[1]);
      const ahead = v.clone().sub(persp.position).dot(new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw))) > 0.3;
      const p = screen(v, cam);
      place(el, r !== here && ahead && p.ok && d < 14 && r.area > 2.2, p.x, p.y);
    }
  }
  const ent = overlay.querySelector("[data-entry]");
  const pe = screen(W3(U.entry[0], 0.1, U.entry[1]), ortho);
  place(ent, plan, pe.x, pe.y);
  const pw = screen(W3((ix0 + ix1) / 2, 0.05, iy1 + o), ortho);
  const pd = screen(W3(ix0 - o, 0.05, (iy0 + iy1) / 2), ortho);
  place(overlay.querySelector('[data-dim="w"]'), plan, pw.x, pw.y);
  place(overlay.querySelector('[data-dim="d"]'), plan, pd.x, pd.y);
  const chip = overlay.querySelector("[data-chip]");
  if (plan && state.hover) {
    const p = screen(W3(state.hover.anchor[0], 0.1, state.hover.anchor[1]), ortho);
    chip.innerHTML = `<small>Interno ${esc(U.id)}</small>${esc(state.hover.label)} · ${fmtArea(state.hover.area)}`;
    chip.style.setProperty("--c", `var(--k-${state.hover.group})`);
    place(chip, true, p.x, p.y - 18);
  } else place(chip, false);
  // scale bar: 2 m
  if (plan) {
    const ppm = state.ppm * ortho.zoom;
    const m = ppm * 2 > 150 ? 1 : ppm * 2 < 50 ? 5 : 2;
    document.getElementById("scaleBar").style.width = `${Math.round(ppm * m)}px`;
    document.getElementById("scaleTxt").textContent = `${m} m`;
  }
  document.getElementById("hereName").textContent = here ? here.label : "Passaggio";
}

/* ------------------------------------------------------------------ inside: look, walk, minimap */
const ray = new THREE.Raycaster();
let drag = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: false, yaw: state.yaw, pitch: state.pitch };
  if (state.mode === "inside") renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (state.mode === "inside" && drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    state.yaw = drag.yaw - dx * 0.0042;
    state.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch - dy * 0.0035));
    state.walk = state.walk && { ...state.walk, keepYaw: true };
    return;
  }
  if (state.mode === "plan" && !e.buttons) {
    const r = pickRoom(e, ortho);
    if (r !== state.hover) {
      state.hover = r;
      renderer.domElement.style.cursor = r ? "pointer" : "";
      markRoomList();
    }
  }
});
renderer.domElement.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
  if (state.mode === "plan") {
    const r = pickRoom(e, ortho);
    if (r) enterAt(r);
  } else {
    const hit = pickPoint(e, persp);
    if (hit) walkTo(hit);
  }
});
renderer.domElement.addEventListener(
  "wheel",
  (e) => {
    if (state.mode !== "inside") return;
    e.preventDefault();
    persp.fov = Math.max(38, Math.min(90, persp.fov + e.deltaY * 0.03));
    persp.updateProjectionMatrix();
  },
  { passive: false },
);
function ndc(e) {
  const r = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}
function pickRoom(e, cam) {
  ray.setFromCamera(ndc(e), cam);
  const hit = ray.intersectObjects(tiles.map((t) => t.mesh), false)[0];
  return hit?.object.userData.room ?? null;
}
function pickPoint(e, cam) {
  ray.setFromCamera(ndc(e), cam);
  const hit = ray.intersectObjects(tiles.map((t) => t.mesh), false)[0];
  if (!hit) return null;
  return [hit.point.x + cx, -hit.point.z + cy];
}
function walkTo(pt) {
  let target = [...pt];
  if (!walkable(target)) {
    const r = roomAt(pt);
    target = r ? [...r.anchor] : null;
  }
  if (!target) return;
  state.walk = { from: [...state.pos], to: target, t: 0, dur: Math.min(1.4, 0.35 + Math.hypot(target[0] - state.pos[0], target[1] - state.pos[1]) * 0.12) };
}
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.mode === "inside") setMode("plan");
    else if (embedded) parent.postMessage({ type: "pb-close" }, "*");
  }
  if (state.mode === "inside" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)) {
    keys.add(e.key.toLowerCase());
    e.preventDefault();
  }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function stepKeys(dt) {
  if (!keys.size) return;
  const turn = (keys.has("arrowleft") ? 1 : 0) - (keys.has("arrowright") ? 1 : 0);
  state.yaw -= turn * dt * 1.6;
  const fwd = (keys.has("arrowup") || keys.has("w") ? 1 : 0) - (keys.has("arrowdown") || keys.has("s") ? 1 : 0);
  const side = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
  if (!fwd && !side) return;
  state.walk = null;
  const sp = 1.6 * dt;
  const fx = Math.sin(state.yaw);
  const fy = Math.cos(state.yaw);
  const next = [state.pos[0] + (fx * fwd + fy * side) * sp, state.pos[1] + (fy * fwd - fx * side) * sp];
  if (walkable(next)) state.pos = next;
}

const map = document.getElementById("map");
function buildMap() {
  const s = 100 / Math.max(bx1 - bx0, by1 - by0);
  const Wm = (bx1 - bx0) * s;
  const Hm = (by1 - by0) * s;
  const P = (x, y) => `${((x - bx0) * s).toFixed(1)},${((by1 - y) * s).toFixed(1)}`;
  const path = (p) => "M" + p.o.map((q) => P(...q)).join("L") + "Z" + p.h.map((h) => "M" + h.map((q) => P(...q)).join("L") + "Z").join("");
  map.innerHTML = `<svg viewBox="0 0 ${Wm.toFixed(1)} ${Hm.toFixed(1)}">
    ${rooms.map((r) => r.polys.map((p) => `<path d="${path(p)}" fill="var(--k-${r.group})" fill-opacity=".22" stroke="var(--k-${r.group})" stroke-opacity=".5" stroke-width=".4"/>`).join("")).join("")}
    ${U.walls.map((p) => `<path d="${path(p)}" fill="var(--ink)" fill-opacity=".85" fill-rule="evenodd"/>`).join("")}
    <g id="mapMe"><path d="M0,0 L-9,-16 A18,18 0 0 1 9,-16 Z" fill="var(--signal)" fill-opacity=".35"/><circle r="2.6" fill="var(--signal)"/></g>
  </svg>`;
  map.onclick = (e) => {
    const r = map.querySelector("svg").getBoundingClientRect();
    const x = bx0 + ((e.clientX - r.left) / r.width) * (bx1 - bx0);
    const y = by1 - ((e.clientY - r.top) / r.height) * (by1 - by0);
    walkTo([x, y]);
  };
  map._s = s;
}
function updateMap() {
  const me = document.getElementById("mapMe");
  if (!me) return;
  const s = map._s;
  me.setAttribute("transform", `translate(${((state.pos[0] - bx0) * s).toFixed(1)},${((by1 - state.pos[1]) * s).toFixed(1)}) rotate(${((state.yaw * 180) / Math.PI).toFixed(1)})`);
}

/* ------------------------------------------------------------------ modes, palette, panel */
let pal = null;
function applyPalette() {
  pal = palette();
  setRGB(fill.color, pal.edge);
  fill.emissive.copy(fill.color).multiplyScalar(pal.dark ? 0.25 : 0.1);
  setRGB(edges.mat.color, pal.edge);
  setRGB(hidden.mat.color, pal.edge);
  setRGB(capMat.color, pal.ink);
  setRGB(winLines.mat.color, pal.signal);
  setRGB(glassMat.color, pal.signal);
  setRGB(roomLines.mat.color, pal.mute);
  for (const l of [furnFlat, furnVol, boxLines, dims]) setRGB(l.mat.color, pal.mute);
  setRGB(boxMat.color, pal.edge);
  for (const t of tiles) setRGB(t.mat.color, pal.group[t.r.group]);
}
function applyMode() {
  const plan = state.mode === "plan";
  root.dataset.mode = state.mode;
  controls.enabled = plan;
  caps.visible = plan;
  winLines.obj.visible = plan;
  glass.visible = !plan;
  furnFlat.obj.visible = plan;
  furnVol.obj.visible = !plan;
  dims.obj.visible = plan;
  hidden.obj.visible = plan;
  roomLines.obj.visible = !plan;
  document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
  document.getElementById("hint").textContent = plan
    ? "Trascina per spostare · rotella per lo zoom · clicca una stanza per entrare"
    : "Trascina per guardarti intorno · clicca il pavimento per camminare · frecce o WASD";
  renderChips();
  markRoomList();
}
function setMode(m) {
  state.mode = m;
  if (m === "plan") fitPlan();
  applyMode();
}
function enterAt(r) {
  state.pos = [...(r.outdoor ? r.anchor : r.anchor)];
  state.walk = null;
  setMode("inside");
}

function renderBand() {
  const band = document.getElementById("band");
  const ordered = [...rooms].sort((a, b) => Number(a.outdoor) - Number(b.outdoor) || b.area - a.area);
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
    <div class="ix-code">${esc(U.code)}</div>
    <div class="ix-rule"></div>
    <div class="ix-typo">${esc(U.typo)}</div>
    <div class="ix-also">${esc(U.floorName)} · ${esc(U.also)}</div>
    <div class="ix-kpis">
      <div><b>${fmt(U.area, 0)}</b><span>m² netti</span></div>
      <div><b>${U.locali}</b><span>locali</span></div>
      <div><b>${U.outdoor ? fmt(U.outdoor, 0) : "—"}</b><span>m² esterni</span></div>
    </div>
    <div class="ix-modes" id="modes" role="group" aria-label="Vista">
      <button type="button" data-mode="plan">Pianta</button>
      <button type="button" data-mode="inside">Vista interna</button>
    </div>
    <div class="ix-rooms" id="roomList">
      ${ordered.map((r) => `<button type="button" data-room="${r.id}" style="--c: var(--k-${r.group})"><i></i><span>${esc(r.label)}</span><small>${fmtArea(r.area)}</small></button>`).join("")}
    </div>
    <div class="ix-acts">
      <a class="main" href="../#contatti" id="ask">Richiedi informazioni</a>
      <a href="./?isolato#${encodeURIComponent(U.id)}" target="_top">Vedi nell'edificio 3D</a>
    </div>
    <p class="ix-note">Pianta ricavata dalle tavole di progetto; superfici nette indicative.${U.boxes.length ? " Arredi della zona notte e del soggiorno aggiunti a titolo illustrativo." : " Arredi come da tavola di progetto."}</p>
    <div class="ix-foot">Corbetta (MI)</div>`;
  band.querySelectorAll("#modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  band.querySelectorAll("#roomList button").forEach((b) => {
    const r = rooms.find((x) => x.id === b.dataset.room);
    b.addEventListener("mouseenter", () => {
      state.hover = r;
      markRoomList();
    });
    b.addEventListener("mouseleave", () => {
      state.hover = null;
      markRoomList();
    });
    b.addEventListener("click", () => (state.mode === "inside" ? walkTo(r.anchor) : enterAt(r)));
  });
  const msg = `Vorrei informazioni sull'interno ${U.id} (${U.typo.toLowerCase()}, ${U.floorName.toLowerCase()}, circa ${fmt(U.area, 0)} m² netti) della residenza Piazza Beretta.`;
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
function markRoomList() {
  const here = state.mode === "inside" ? roomAt(state.pos) : state.hover;
  document.querySelectorAll("#roomList button").forEach((b) => b.setAttribute("data-on", String(here?.id === b.dataset.room)));
  document.querySelectorAll("#chips button").forEach((b) => b.setAttribute("aria-pressed", String(roomAt(state.pos)?.id === b.dataset.room)));
}
function renderChips() {
  const chips = document.getElementById("chips");
  const list = rooms.filter((r) => r.area > 2.2).sort((a, b) => Number(a.outdoor) - Number(b.outdoor) || b.area - a.area);
  chips.innerHTML = list.map((r) => `<button type="button" data-room="${r.id}">${esc(r.label)}</button>`).join("") + `<button type="button" data-plan>← Pianta</button>`;
  chips.querySelectorAll("[data-room]").forEach((b) => b.addEventListener("click", () => walkTo(rooms.find((r) => r.id === b.dataset.room).anchor)));
  chips.querySelector("[data-plan]").addEventListener("click", () => setMode("plan"));
}

function applyTheme(t, save) {
  root.dataset.tema = t;
  document.querySelectorAll("#themes [data-theme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === t)));
  if (save)
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* this visit only */
    }
  applyPalette();
}
document.querySelectorAll("#themes [data-theme]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.theme, true)));
const closeBtn = document.getElementById("close");
closeBtn.addEventListener("click", (e) => {
  if (embedded) {
    e.preventDefault();
    parent.postMessage({ type: "pb-close" }, "*");
  }
});

document.getElementById("cart").innerHTML = `<span><b>Piazza Beretta</b> · ${esc(U.code)} · ${esc(U.floorName)}</span><span>${fmt(ix1 - ix0, 2)} × ${fmt(iy1 - iy0, 2)} m · ${fmt(U.area, 0)} m² netti</span><em>Dalle piante di progetto</em>`;

/* ------------------------------------------------------------------ loop */
let saved = null;
try {
  saved = localStorage.getItem(THEME_KEY);
} catch {
  /* default */
}
renderBand();
buildOverlay();
buildMap();
resize();
applyTheme(saved === "chiaro" ? "chiaro" : "scuro", false);
applyMode();

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const plan = state.mode === "plan";
  if (!plan) {
    stepKeys(dt);
    if (state.walk) {
      const w = state.walk;
      w.t = Math.min(1, w.t + dt / w.dur);
      const k = w.t < 0.5 ? 2 * w.t * w.t : 1 - (-2 * w.t + 2) ** 2 / 2;
      state.pos = [w.from[0] + (w.to[0] - w.from[0]) * k, w.from[1] + (w.to[1] - w.from[1]) * k];
      if (w.t >= 1) {
        state.walk = null;
        markRoomList();
      }
    }
    const p = W3(state.pos[0], EYE, state.pos[1]);
    persp.position.copy(p);
    const d = new THREE.Vector3(Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(-state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
    persp.lookAt(p.clone().add(d));
    updateMap();
  } else controls.update();

  // the plan reads like a drawing: solid tops, light fills; inside, the walls turn into glass
  const dark = pal?.dark;
  fill.opacity = plan ? 0.1 : dark ? 0.16 : 0.2;
  edges.mat.opacity = plan ? 0.75 : 0.55;
  hidden.mat.opacity = plan ? 0.12 : 0;
  capMat.opacity = plan ? (dark ? 0.82 : 0.88) : 0;
  furnFlat.mat.opacity = 0.8;
  furnVol.mat.opacity = 0.75;
  boxLines.mat.opacity = 0.8;
  boxMat.opacity = plan ? 0.06 : 0.14;
  dims.mat.opacity = 0.7;
  roomLines.mat.opacity = 0.35;
  for (const t of tiles) {
    const hot = plan && state.hover === t.r ? 1 : 0;
    t.hot += (hot - t.hot) * Math.min(1, dt * 12);
    t.mat.opacity = (plan ? 0.2 : 0.16) * (t.r.outdoor ? 0.7 : 1) + t.hot * 0.22;
  }
  renderer.render(scene, plan ? ortho : persp);
  placeOverlay();
}
requestAnimationFrame(tick);
if (state.mode === "inside") markRoomList();
