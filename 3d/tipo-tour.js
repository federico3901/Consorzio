/* Piazza Beretta – tour 3D di un appartamento tipo: the rooms of tipi.json built with materials, furniture and
   daylight, walked through at eye height (drag to look, click the floor to walk, arrows / WASD, minimap). */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function startTour(ctx) {
  const { U, rooms, doors, strayDoors, roomAt, walkable, nearWall, planSVG, VX0, VY1, S, WALL_H, DOOR_HEAD, WIN_SILL, WIN_HEAD, EYE } = ctx;
  const host = document.getElementById("tour");
  const pts = rooms.flatMap((r) => r.polys.flatMap((p) => p.o));
  const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
  const cy = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
  const W3 = (x, h, y) => new THREE.Vector3(x - cx, h, -(y - cy));

  /* ---------------------------------------------------------------- renderer */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dbe5ee");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight("#ffffff", "#b8a58c", 0.9));
  const sun = new THREE.DirectionalLight("#fff1dc", 3.2);
  sun.position.set(7, 13, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  /* ---------------------------------------------------------------- materials */
  const tex = (size, meters, draw) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / meters, 1 / meters);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const noise = (g, n, a) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "80,60,40"},${a * Math.random()})`;
      g.fillRect(Math.random() * g.canvas.width, Math.random() * g.canvas.height, 2, 2);
    }
  };
  const tiles = (base, grout, n, meters, varAmt = 10) =>
    tex(512, meters, (g, s) => {
      const k = s / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = (Math.random() - 0.5) * varAmt;
          g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
          g.fillRect(i * k, j * k, k, k);
        }
      noise(g, 5000, 0.05);
      g.strokeStyle = grout;
      g.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, s); g.stroke();
        g.beginPath(); g.moveTo(0, i * k); g.lineTo(s, i * k); g.stroke();
      }
    });
  const wood = tex(1024, 2.4, (g, s) => {
    const rows = 16;
    const h = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -Math.random() * s * 0.5;
      while (x < s) {
        const len = s * (0.35 + Math.random() * 0.4);
        const v = (Math.random() - 0.5) * 26;
        g.fillStyle = `rgb(${196 + v},${154 + v},${108 + v * 0.8})`;
        g.fillRect(x, r * h, len, h);
        g.strokeStyle = "rgba(90,60,30,.10)";
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          const y = r * h + Math.random() * h;
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + 3, x + len * 0.6, y - 3, x + len, y);
          g.stroke();
        }
        g.fillStyle = "rgba(70,45,20,.35)";
        g.fillRect(x, r * h, 2, h);
        x += len;
      }
      g.fillStyle = "rgba(70,45,20,.3)";
      g.fillRect(0, r * h, s, 2);
    }
  });
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tiles([214, 197, 174], "rgba(160,140,115,.9)", 2, 1.2), roughness: 0.55 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 }),
    bath: new THREE.MeshStandardMaterial({ map: tiles([233, 229, 222], "rgba(190,182,170,.9)", 4, 1.2, 5), roughness: 0.3 }),
    deck: new THREE.MeshStandardMaterial({ map: tiles([196, 186, 168], "rgba(140,128,110,.95)", 2, 0.9, 14), roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ color: "#f2efe9", roughness: 0.95 }),
    ceiling: new THREE.MeshStandardMaterial({ color: "#fbfaf8", roughness: 1, side: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: "#3a3f45", roughness: 0.45, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: "#c9dde8", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    door: new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 0.55 }),
    steel: new THREE.MeshStandardMaterial({ color: "#c3c9ce", roughness: 0.3, metalness: 0.85 }),
    black: new THREE.MeshStandardMaterial({ color: "#1d1e21", roughness: 0.35 }),
    lacquer: new THREE.MeshStandardMaterial({ color: "#f1efeb", roughness: 0.4 }),
    stone: new THREE.MeshStandardMaterial({ color: "#d6d2cb", roughness: 0.35 }),
    porc: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.15 }),
    wood1: new THREE.MeshStandardMaterial({ color: "#a98059", roughness: 0.55 }),
    wood2: new THREE.MeshStandardMaterial({ color: "#6a4b35", roughness: 0.5 }),
    fabric: new THREE.MeshStandardMaterial({ color: "#d8d3ca", roughness: 0.95 }),
    fabric2: new THREE.MeshStandardMaterial({ color: "#bfb8ad", roughness: 0.95 }),
    linen: new THREE.MeshStandardMaterial({ color: "#f6f3ee", roughness: 0.95 }),
    blue: new THREE.MeshStandardMaterial({ color: "#7d91a6", roughness: 0.9 }),
    terra: new THREE.MeshStandardMaterial({ color: "#c49b74", roughness: 0.9 }),
    rug: new THREE.MeshStandardMaterial({ color: "#e8e1d4", roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: "#4c8a3c", roughness: 0.8, flatShading: true }),
    leaf2: new THREE.MeshStandardMaterial({ color: "#6aa64f", roughness: 0.8, flatShading: true }),
    pot: new THREE.MeshStandardMaterial({ color: "#d8cebf", roughness: 0.8 }),
    planterBox: new THREE.MeshStandardMaterial({ color: "#7a6853", roughness: 0.8 }),
    pink: new THREE.MeshStandardMaterial({ color: "#d9667f", roughness: 0.7 }),
    rose: new THREE.MeshStandardMaterial({ color: "#f0a7b8", roughness: 0.7 }),
    shade: new THREE.MeshStandardMaterial({ color: "#fff6e3", emissive: "#ffd9a0", emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide }),
    mirror: new THREE.MeshStandardMaterial({ color: "#dfe8ee", roughness: 0.02, metalness: 1 }),
    ground: new THREE.MeshStandardMaterial({ color: "#d6d2ca", roughness: 1 }),
  };
  const FLOOR = { living: "tile", kitchen: "tile", hall: "tile", storage: "tile", bedroom: "wood", bathroom: "bath", balcony: "deck", terrace: "deck" };

  /* ---------------------------------------------------------------- shell */
  const shape = (p) => {
    const s = new THREE.Shape(p.o.map(([x, y]) => new THREE.Vector2(x - cx, y - cy)));
    for (const h of p.h) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x - cx, y - cy))));
    return s;
  };
  const add = (geo, mat, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    scene.add(m);
    return m;
  };
  const boxAt = (x0, y0, x1, y1, h0, h1) => {
    const g = new THREE.BoxGeometry(x1 - x0, h1 - h0, y1 - y0);
    const c = W3((x0 + x1) / 2, (h0 + h1) / 2, (y0 + y1) / 2);
    g.translate(c.x, c.y, c.z);
    return g;
  };

  const floorMeshes = [];
  for (const r of rooms) {
    const g = mergeGeometries(r.polys.map((p) => new THREE.ShapeGeometry(shape(p))));
    g.rotateX(-Math.PI / 2);
    const m = add(g, M[FLOOR[r.kind] ?? "tile"], { cast: false });
    m.userData.room = r;
    floorMeshes.push(m);
  }
  for (const d of doors) {
    const g = boxAt(d.x0, d.y0, d.x1, d.y1, -0.01, 0.001);
    add(g, M.tile, { cast: false });
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallParts = U.walls.map((p) => {
    const g = new THREE.ExtrudeGeometry(shape(p), { depth: WALL_H, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute("uv");
    return g.index ? g.toNonIndexed() : g;
  });
  const glassParts = [];
  const frameParts = [];
  for (const o of U.openings)
    for (const [x0, y0, x1, y1] of o.rects) {
      const z = (g) => {
        g.deleteAttribute("uv");
        return g.index ? g.toNonIndexed() : g;
      };
      if (o.kind === "door") {
        wallParts.push(z(boxAt(x0, y0, x1, y1, DOOR_HEAD, WALL_H)));
        continue;
      }
      const s0 = o.kind === "window" ? WIN_SILL : 0;
      if (o.kind === "window") wallParts.push(z(boxAt(x0, y0, x1, y1, 0, WIN_SILL)));
      wallParts.push(z(boxAt(x0, y0, x1, y1, WIN_HEAD, WALL_H)));
      const horiz = x1 - x0 >= y1 - y0;
      const mid = horiz ? (y0 + y1) / 2 : (x0 + x1) / 2;
      const f = 0.05;
      const a0 = horiz ? x0 : y0;
      const a1 = horiz ? x1 : y1;
      const bar = (b0, b1, h0, h1) => (horiz ? boxAt(b0, mid - 0.03, b1, mid + 0.03, h0, h1) : boxAt(mid - 0.03, b0, mid + 0.03, b1, h0, h1));
      frameParts.push(bar(a0, a0 + f, s0, WIN_HEAD), bar(a1 - f, a1, s0, WIN_HEAD), bar(a0, a1, WIN_HEAD - f, WIN_HEAD), bar(a0, a1, s0, s0 + f));
      if (a1 - a0 > 1.25) frameParts.push(bar((a0 + a1) / 2 - f / 2, (a0 + a1) / 2 + f / 2, s0, WIN_HEAD));
      const pane = horiz ? new THREE.PlaneGeometry(a1 - a0, WIN_HEAD - s0) : new THREE.PlaneGeometry(a1 - a0, WIN_HEAD - s0).rotateY(Math.PI / 2);
      const c = horiz ? W3((x0 + x1) / 2, (s0 + WIN_HEAD) / 2, mid) : W3(mid, (s0 + WIN_HEAD) / 2, (y0 + y1) / 2);
      pane.translate(c.x, c.y, c.z);
      glassParts.push(pane);
    }
  for (const d of strayDoors) {
    const g = boxAt(d.x0, d.y0, d.x1, d.y1, 0, WALL_H);
    g.deleteAttribute("uv");
    wallParts.push(g.index ? g.toNonIndexed() : g);
  }
  add(mergeGeometries(wallParts), M.wall);
  if (frameParts.length) add(mergeGeometries(frameParts), M.frame);
  if (glassParts.length) add(mergeGeometries(glassParts), M.glass, { cast: false, receive: false });
  // ceiling over the indoor rooms and the walls
  const ceil = mergeGeometries([
    ...rooms.filter((r) => !r.outdoor).flatMap((r) => r.polys.map((p) => new THREE.ShapeGeometry(shape(p)))),
    ...U.walls.map((p) => new THREE.ShapeGeometry(shape(p))),
    ...doors.map((d) => {
      const g = new THREE.PlaneGeometry(d.x1 - d.x0, d.y1 - d.y0);
      g.translate((d.x0 + d.x1) / 2 - cx, (d.y0 + d.y1) / 2 - cy, 0);
      return g;
    }),
  ].map((g) => {
    g.deleteAttribute("uv");
    return g.index ? g.toNonIndexed() : g;
  }));
  ceil.rotateX(-Math.PI / 2);
  ceil.translate(0, WALL_H, 0);
  add(ceil, M.ceiling);
  // door leaves, open at 90°
  for (const d of doors) {
    if (d.entrance) continue;
    const t = 0.04;
    const w = d.w - 0.04;
    const g = d.horiz
      ? boxAt(d.x0 + 0.02, d.side > 0 ? d.face : d.face - w, d.x0 + 0.02 + t, d.side > 0 ? d.face + w : d.face, 0.01, DOOR_HEAD - 0.02)
      : boxAt(d.side > 0 ? d.face : d.face - w, d.y0 + 0.02, d.side > 0 ? d.face + w : d.face, d.y0 + 0.02 + t, 0.01, DOOR_HEAD - 0.02);
    add(g, M.door);
  }
  // glass parapets on the free edges of balconies
  const railParts = [];
  const railTop = [];
  for (const r of rooms.filter((x) => x.outdoor))
    for (const p of r.polys)
      p.o.forEach((a, i) => {
        const b = p.o[(i + 1) % p.o.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (len < 0.4 || nearWall(m, 0.35)) return;
        const horiz = Math.abs(b[1] - a[1]) < 1e-3;
        const g = horiz ? boxAt(Math.min(a[0], b[0]), a[1] - 0.01, Math.max(a[0], b[0]), a[1] + 0.01, 0.05, 1.0) : boxAt(a[0] - 0.01, Math.min(a[1], b[1]), a[0] + 0.01, Math.max(a[1], b[1]), 0.05, 1.0);
        railParts.push(g);
        railTop.push(horiz ? boxAt(Math.min(a[0], b[0]), a[1] - 0.025, Math.max(a[0], b[0]), a[1] + 0.025, 1.0, 1.04) : boxAt(a[0] - 0.025, Math.min(a[1], b[1]), a[0] + 0.025, Math.max(a[1], b[1]), 1.0, 1.04));
      });
  if (railParts.length) {
    add(mergeGeometries(railParts), M.glass, { cast: false, receive: false });
    add(mergeGeometries(railTop), M.steel);
  }

  /* ---------------------------------------------------------------- furniture */
  const rb = (w, h, d, r = 0.03) => new RoundedBoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01), 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const bx = (w, h, d) => new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01));
  function piece(group, geo, mat, x, y, z, ry = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  const legs = (g, w, d, h, mat, inset = 0.04, r = 0.02) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece(g, new THREE.CylinderGeometry(r, r, h, 8), mat, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset));
  };
  function chair(g, x, z, ry) {
    const c = new THREE.Group();
    piece(c, rb(0.44, 0.05, 0.44, 0.02), M.fabric, 0, 0.46, 0);
    piece(c, rb(0.44, 0.42, 0.05, 0.02), M.fabric, 0, 0.7, 0.2);
    legs(c, 0.44, 0.44, 0.44, M.wood2, 0.04, 0.015);
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    g.add(c);
  }
  function sofa(g, W, D, x0 = 0, z0 = 0, arms = [true, true]) {
    piece(g, rb(W, 0.42, D, 0.05), M.fabric, x0, 0.21, z0);
    piece(g, rb(W, 0.45, 0.22, 0.06), M.fabric2, x0, 0.62, z0 - D / 2 + 0.11);
    if (arms[0]) piece(g, rb(0.16, 0.6, D, 0.05), M.fabric2, x0 - W / 2 + 0.08, 0.3, z0);
    if (arms[1]) piece(g, rb(0.16, 0.6, D, 0.05), M.fabric2, x0 + W / 2 - 0.08, 0.3, z0);
    const n = Math.max(1, Math.round(W / 0.8));
    const inner = W - (arms[0] ? 0.16 : 0) - (arms[1] ? 0.16 : 0);
    const start = x0 - W / 2 + (arms[0] ? 0.16 : 0);
    for (let i = 0; i < n; i++) piece(g, rb(inner / n - 0.02, 0.12, D - 0.26, 0.05), M.fabric, start + (inner * (i + 0.5)) / n, 0.48, z0 + 0.1);
  }
  const BUILD = {
    bed2: (g, W, D) => bed(g, W, D, 2),
    bed1: (g, W, D) => bed(g, W, D, 1),
    side: (g, W, D) => {
      piece(g, rb(W, 0.48, D, 0.02), M.wood1, 0, 0.24, 0);
      piece(g, new THREE.CylinderGeometry(0.05, 0.07, 0.25, 16), M.stone, 0, 0.6, 0);
      piece(g, new THREE.CylinderGeometry(0.1, 0.14, 0.18, 20, 1, true), M.shade, 0, 0.8, 0);
    },
    wardrobe: (g, W, D) => {
      piece(g, bx(W, 2.3, D), M.lacquer, 0, 1.15, 0);
      const n = Math.max(1, Math.round(W / 0.6));
      for (let i = 1; i < n; i++) piece(g, bx(0.006, 2.2, 0.01), M.fabric2, -W / 2 + (W * i) / n, 1.15, D / 2 + 0.003);
      for (let i = 0; i < n; i++) piece(g, bx(0.015, 0.3, 0.02), M.steel, -W / 2 + (W * (i + 0.5)) / n + 0.12, 1.1, D / 2 + 0.012);
    },
    dresser: (g, W, D) => {
      piece(g, rb(W, 0.8, D, 0.015), M.wood1, 0, 0.4, 0);
      piece(g, new THREE.CylinderGeometry(0.06, 0.05, 0.22, 16), M.stone, -W / 4, 0.91, 0);
    },
    sideboard: (g, W, D) => {
      piece(g, rb(W, 0.75, D, 0.015), M.wood2, 0, 0.375, 0);
      plant(g, 0.16, W / 4, 0.75, 0);
    },
    shelves: (g, W, D) => {
      piece(g, bx(W, 2.0, D), M.wood1, 0, 1.0, 0);
    },
    tv: (g, W, D) => {
      piece(g, rb(W, 0.45, D - 0.05, 0.015), M.wood2, 0, 0.225, 0.025);
      const tw = Math.min(W * 0.75, 1.45);
      piece(g, bx(tw, tw * 0.56, 0.04), M.black, 0, 1.15, -D / 2 + 0.03);
    },
    sofa: (g, W, D) => sofa(g, W, D),
    sofaL: (g, W, D, it) => {
      const dep = Math.min(0.95, D * 0.45);
      const flip = (it.flip ?? 1) > 0;
      sofa(g, W, dep, 0, -D / 2 + dep / 2, [!flip, flip]);
      const cxs = flip ? W / 2 - dep / 2 : -W / 2 + dep / 2;
      piece(g, rb(dep, 0.42, D - dep, 0.05), M.fabric, cxs, 0.21, dep / 2);
      piece(g, rb(dep - 0.04, 0.12, D - dep - 0.04, 0.05), M.fabric, cxs, 0.48, dep / 2);
      piece(g, rb(0.36, 0.3, 0.12, 0.05), M.blue, -W / 2 + 0.4, 0.64, -D / 2 + 0.28, 0.2);
      piece(g, rb(0.36, 0.3, 0.12, 0.05), M.terra, cxs, 0.64, -D / 2 + 0.3, -0.2);
    },
    armchair: (g, W, D) => {
      piece(g, rb(W, 0.4, D, 0.05), M.fabric, 0, 0.2, 0);
      piece(g, rb(W, 0.42, 0.18, 0.05), M.fabric2, 0, 0.6, -D / 2 + 0.09);
      piece(g, rb(0.14, 0.58, D, 0.04), M.fabric2, -W / 2 + 0.07, 0.29, 0);
      piece(g, rb(0.14, 0.58, D, 0.04), M.fabric2, W / 2 - 0.07, 0.29, 0);
    },
    rug: (g, W, D) => piece(g, bx(W, 0.012, D), M.rug, 0, 0.006, 0),
    coffee: (g, W, D) => {
      piece(g, rb(W, 0.06, D, 0.02), M.wood2, 0, 0.38, 0);
      piece(g, bx(W - 0.1, 0.3, D - 0.1), M.wood2, 0, 0.18, 0);
      piece(g, bx(0.25, 0.04, 0.18), M.linen, -W / 6, 0.43, 0, 0.2);
    },
    coffeeR: (g, W, D) => {
      const r = Math.min(W, D) / 2;
      piece(g, new THREE.CylinderGeometry(r, r, 0.05, 40), M.wood2, 0, 0.4, 0);
      piece(g, new THREE.CylinderGeometry(r * 0.3, r * 0.4, 0.38, 24), M.wood2, 0, 0.19, 0);
      plant(g, 0.08, 0, 0.42, 0);
    },
    table: (g, W, D, it) => {
      piece(g, rb(W, 0.045, D, 0.01), M.wood1, 0, 0.75, 0);
      legs(g, W, D, 0.73, M.wood2, 0.07, 0.025);
      const seats = it.chairs ?? "NS";
      const along = Math.max(1, Math.floor(W / 0.62));
      for (let i = 0; i < along; i++) {
        const x = -W / 2 + (W * (i + 0.5)) / along;
        if (seats.includes("N")) chair(g, x, -D / 2 - 0.16, Math.PI);
        if (seats.includes("S")) chair(g, x, D / 2 + 0.16, 0);
      }
      if (seats.includes("E")) chair(g, W / 2 + 0.16, 0, Math.PI / 2);
      if (seats.includes("W")) chair(g, -W / 2 - 0.16, 0, -Math.PI / 2);
      plant(g, 0.1, 0, 0.77, 0);
    },
    tableR: (g, W, D, it) => {
      const r = Math.min(W, D) / 2;
      piece(g, new THREE.CylinderGeometry(r, r, 0.04, 40), M.wood2, 0, 0.74, 0);
      piece(g, new THREE.CylinderGeometry(0.04, 0.04, 0.72, 12), M.black, 0, 0.36, 0);
      piece(g, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), M.black, 0, 0.01, 0);
      const n = it.chairs ?? 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / 4;
        chair(g, Math.cos(a) * (r + 0.16), Math.sin(a) * (r + 0.16), -a - Math.PI / 2);
      }
    },
    chair: (g) => chair(g, 0, 0, Math.PI),
    desk: (g, W, D) => {
      piece(g, rb(W, 0.04, D, 0.01), M.lacquer, 0, 0.75, 0);
      legs(g, W, D, 0.73, M.black, 0.04, 0.015);
      piece(g, bx(0.55, 0.33, 0.03), M.black, 0, 1.0, -D / 2 + 0.12);
    },
    kitchen: (g, W, D, it) => {
      piece(g, bx(W, 0.86, D - 0.02), M.lacquer, 0, 0.45, -0.01);
      piece(g, bx(W, 0.1, D - 0.08), M.black, 0, 0.05, -0.04);
      piece(g, bx(W + 0.01, 0.04, D + 0.02), M.stone, 0, 0.9, 0);
      piece(g, bx(W, 0.7, 0.34), M.lacquer, 0, 1.85, -D / 2 + 0.17);
      const [x0, y0, x1, y1] = it.r;
      const horizontal = it.d === "N" || it.d === "S";
      const c = horizontal ? (x0 + x1) / 2 : (y0 + y1) / 2;
      const sgn = { N: 1, S: -1, E: -1, W: 1 }[it.d] ?? 1;
      const loc = ([a, b]) => [sgn * (Math.min(a, b) - c), sgn * (Math.max(a, b) - c)].sort((p, q) => p - q);
      if (it.hob) {
        const [a, b] = loc(it.hob);
        piece(g, bx(b - a, 0.01, D - 0.16), M.black, (a + b) / 2, 0.925, 0);
      }
      if (it.sink) {
        const [a, b] = loc(it.sink);
        piece(g, bx(b - a, 0.012, D - 0.18), M.steel, (a + b) / 2, 0.925, 0);
        piece(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 10), M.steel, (a + b) / 2, 1.06, -D / 2 + 0.08);
      }
    },
    island: (g, W, D) => {
      piece(g, bx(W - 0.04, 0.88, D - 0.1), M.lacquer, 0, 0.44, -0.04);
      piece(g, bx(W, 0.04, D), M.stone, 0, 0.9, 0);
      const n = Math.max(2, Math.floor(W / 0.5));
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (W * (i + 0.5)) / n;
        piece(g, new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), M.wood1, x, 0.66, D / 2 + 0.25);
        piece(g, new THREE.CylinderGeometry(0.02, 0.02, 0.64, 8), M.black, x, 0.32, D / 2 + 0.25);
      }
    },
    toilet: (g, W, D) => {
      piece(g, rb(W * 0.85, 0.38, 0.17, 0.03), M.porc, 0, 0.55, -D / 2 + 0.085);
      const b = new THREE.CylinderGeometry(0.19, 0.16, 0.4, 28);
      b.scale(W / 0.42, 1, D / 0.6);
      piece(g, b, M.porc, 0, 0.2, 0.06);
    },
    bidet: (g, W, D) => {
      const b = new THREE.CylinderGeometry(0.18, 0.15, 0.4, 28);
      b.scale(W / 0.38, 1, D / 0.52);
      piece(g, b, M.porc, 0, 0.2, 0.02);
    },
    sink: (g, W, D) => {
      piece(g, rb(W, 0.2, D, 0.03), M.porc, 0, 0.8, 0);
      piece(g, bx(W - 0.04, 0.5, D - 0.06), M.wood1, 0, 0.45, -0.02);
      piece(g, new THREE.CylinderGeometry(0.012, 0.012, 0.2, 10), M.steel, 0, 0.98, -D / 2 + 0.06);
      piece(g, bx(Math.min(W, 0.8), 0.8, 0.02), M.mirror, 0, 1.55, -D / 2 + 0.01);
    },
    tub: (g, W, D) => {
      piece(g, rb(W, 0.56, D, 0.04), M.porc, 0, 0.28, 0);
      piece(g, bx(W - 0.14, 0.01, D - 0.14), M.bath, 0, 0.5, 0);
    },
    shower: (g, W, D) => {
      piece(g, bx(W, 0.04, D), M.porc, 0, 0.02, 0);
      piece(g, bx(W, 2.0, 0.012), M.glass, 0, 1.04, D / 2);
      piece(g, new THREE.CylinderGeometry(0.1, 0.1, 0.015, 24), M.steel, 0, 2.15, -D / 2 + 0.2);
    },
    plant: (g, W, D) => plant(g, Math.min(W, D) / 2, 0, 0, 0),
    planter: (g, W, D) => {
      piece(g, bx(W, 0.35, D), M.planterBox, 0, 0.175, 0);
      for (let x = -W / 2 + 0.06; x < W / 2 - 0.04; x += 0.09) {
        piece(g, new THREE.IcosahedronGeometry(0.06 + Math.random() * 0.03, 0), Math.random() > 0.5 ? M.leaf : M.leaf2, x, 0.4 + Math.random() * 0.05, (Math.random() - 0.5) * D * 0.4);
        if (Math.random() > 0.3) piece(g, new THREE.IcosahedronGeometry(0.035, 0), Math.random() > 0.5 ? M.pink : M.rose, x + 0.03, 0.47 + Math.random() * 0.05, (Math.random() - 0.5) * D * 0.5);
      }
    },
    lounger: (g, W, D) => {
      piece(g, rb(W, 0.25, D * 0.68, 0.04), M.linen, 0, 0.18, D * 0.16);
      const back = piece(g, rb(W, 0.08, D * 0.36, 0.04), M.linen, 0, 0.42, -D / 2 + D * 0.18);
      back.rotation.x = -0.65;
    },
  };
  function bed(g, W, D, n) {
    piece(g, rb(W, 0.3, D, 0.03), M.fabric2, 0, 0.15, 0);
    piece(g, rb(W - 0.04, 0.2, D - 0.1, 0.06), M.linen, 0, 0.4, 0.03);
    piece(g, rb(W, 1.0, 0.09, 0.03), M.fabric2, 0, 0.5, -D / 2 + 0.045);
    const pw = n === 2 ? (W - 0.25) / 2 : W - 0.3;
    for (let i = 0; i < n; i++) piece(g, rb(pw, 0.13, 0.36, 0.06), M.linen, n === 2 ? (i ? 1 : -1) * (pw / 2 + 0.06) : 0, 0.55, -D / 2 + 0.33);
    piece(g, rb(W - 0.02, 0.07, D - 0.6, 0.03), M.linen, 0, 0.53, 0.27);
    piece(g, rb(W, 0.08, 0.42, 0.03), n === 2 ? M.blue : M.terra, 0, 0.55, D / 2 - 0.3);
  }
  function plant(g, R, x, y, z) {
    const p = new THREE.Group();
    const big = R > 0.15;
    piece(p, new THREE.CylinderGeometry(R * 0.55, R * 0.42, big ? 0.42 : R * 0.9, 20), M.pot, 0, big ? 0.21 : R * 0.45, 0);
    const n = big ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const s = (big ? R * 0.55 : R * 0.6) * (0.7 + Math.random() * 0.5);
      const a = (i / n) * Math.PI * 2;
      const rr = big ? R * 0.35 : R * 0.2;
      piece(p, new THREE.IcosahedronGeometry(s, 1), i % 2 ? M.leaf : M.leaf2, Math.cos(a) * rr, (big ? 0.62 : R * 1.1) + Math.random() * (big ? 0.4 : 0.05), Math.sin(a) * rr);
    }
    p.position.set(x, y, z);
    g.add(p);
  }
  for (const it of U.items) {
    const f = BUILD[it.t];
    if (!f) continue;
    const [x0, y0, x1, y1] = it.r;
    const side = it.d === "E" || it.d === "W";
    const W = side ? y1 - y0 : x1 - x0;
    const D = side ? x1 - x0 : y1 - y0;
    const g = new THREE.Group();
    f(g, W, D, it);
    g.position.copy(W3((x0 + x1) / 2, 0, (y0 + y1) / 2));
    g.rotation.y = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }[it.d] ?? 0;
    scene.add(g);
  }
  // a warm light in each larger room
  for (const r of rooms.filter((x) => !x.outdoor && x.area > 6)) {
    const l = new THREE.PointLight("#ffd9ab", 2.2, 7, 1.6);
    l.position.copy(W3(r.anchor[0], WALL_H - 0.3, r.anchor[1]));
    scene.add(l);
  }

  /* ---------------------------------------------------------------- camera and walking */
  const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 300);
  const st = {
    pos: [...U.start.at],
    yaw: Math.atan2(U.start.look[0] - U.start.at[0], U.start.look[1] - U.start.at[1]),
    pitch: 0.05,
    walk: null,
    active: false,
  };
  const keys = new Set();
  const hint = document.getElementById("thint");
  const hideHint = () => (hint.style.opacity = "0");
  let drag = null;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch };
    el.setPointerCapture(e.pointerId);
    hideHint();
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    st.yaw = drag.yaw - (e.clientX - drag.x) * 0.0042;
    st.pitch = Math.max(-1.1, Math.min(1.1, drag.pitch - (e.clientY - drag.y) * 0.0035));
  });
  el.addEventListener("pointerup", (e) => {
    const d = drag;
    drag = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const r = el.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
    const hit = ray.intersectObjects(floorMeshes, false)[0];
    if (hit) walkTo([hit.point.x + cx, -hit.point.z + cy]);
  });
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cam.fov = Math.max(40, Math.min(90, cam.fov + e.deltaY * 0.03));
      cam.updateProjectionMatrix();
    },
    { passive: false },
  );
  addEventListener("keydown", (e) => {
    if (!st.active) return;
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
      keys.add(k);
      e.preventDefault();
      hideHint();
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  function walkTo(pt) {
    let to = [...pt];
    if (!walkable(to)) {
      const r = roomAt(pt);
      if (!r) return;
      to = [...r.anchor];
    }
    st.walk = { from: [...st.pos], to, t: 0, dur: Math.min(1.6, 0.4 + Math.hypot(to[0] - st.pos[0], to[1] - st.pos[1]) * 0.15) };
  }

  /* ---------------------------------------------------------------- HUD */
  const mini = document.getElementById("mini");
  mini.innerHTML = planSVG(true);
  const svg = mini.querySelector("svg");
  const NS = "http://www.w3.org/2000/svg";
  const me = document.createElementNS(NS, "g");
  me.innerHTML = `<path d="M0,0 L-55,-110 A123,123 0 0 1 55,-110 Z" fill="#001D4B" fill-opacity=".25"/><circle r="22" fill="#001D4B" stroke="#fff" stroke-width="7"/>`;
  svg.appendChild(me);
  mini.addEventListener("click", (e) => {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scale = Math.min(r.width / vb.width, r.height / vb.height);
    const ox = (r.width - vb.width * scale) / 2;
    const oy = (r.height - vb.height * scale) / 2;
    const sx = (e.clientX - r.left - ox) / scale;
    const sy = (e.clientY - r.top - oy) / scale;
    walkTo([VX0 + sx / S, VY1 - sy / S]);
    hideHint();
  });
  const chips = document.getElementById("chips");
  chips.innerHTML =
    rooms
      .filter((r) => r.area > 2.2)
      .sort((a, b) => Number(a.outdoor) - Number(b.outdoor) || b.area - a.area)
      .map((r) => `<button type="button" data-room="${r.id}">${r.label}</button>`)
      .join("") + `<button type="button" data-plan>← Pianta</button>`;
  chips.querySelectorAll("[data-room]").forEach((b) =>
    b.addEventListener("click", () => {
      walkTo(rooms.find((r) => r.id === b.dataset.room).anchor);
      hideHint();
    }),
  );
  chips.querySelector("[data-plan]").addEventListener("click", () => document.querySelector('.modes [data-mode="plan"]')?.click() ?? (document.body.dataset.mode = "plan"));
  const hereEl = document.getElementById("here");

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    cam.aspect = Math.max(1, width) / Math.max(1, height);
    cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);

  let last = performance.now();
  let lastRoom = null;
  function tick(now) {
    requestAnimationFrame(tick);
    if (!st.active) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (keys.size) {
      const turn = (keys.has("arrowleft") ? 1 : 0) - (keys.has("arrowright") ? 1 : 0);
      st.yaw -= turn * dt * 1.6;
      const fwd = (keys.has("arrowup") || keys.has("w") ? 1 : 0) - (keys.has("arrowdown") || keys.has("s") ? 1 : 0);
      const sideK = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
      if (fwd || sideK) {
        st.walk = null;
        const sp = 1.6 * dt;
        const fx = Math.sin(st.yaw);
        const fy = Math.cos(st.yaw);
        const next = [st.pos[0] + (fx * fwd + fy * sideK) * sp, st.pos[1] + (fy * fwd - fx * sideK) * sp];
        if (walkable(next)) st.pos = next;
      }
    }
    if (st.walk) {
      const w = st.walk;
      w.t = Math.min(1, w.t + dt / w.dur);
      const k = w.t < 0.5 ? 2 * w.t * w.t : 1 - (-2 * w.t + 2) ** 2 / 2;
      st.pos = [w.from[0] + (w.to[0] - w.from[0]) * k, w.from[1] + (w.to[1] - w.from[1]) * k];
      if (w.t >= 1) st.walk = null;
    }
    const p = W3(st.pos[0], EYE, st.pos[1]);
    cam.position.copy(p);
    cam.lookAt(p.clone().add(new THREE.Vector3(Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(-st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch))));
    renderer.render(scene, cam);
    me.setAttribute("transform", `translate(${((st.pos[0] - VX0) * S).toFixed(0)} ${((VY1 - st.pos[1]) * S).toFixed(0)}) rotate(${((st.yaw * 180) / Math.PI).toFixed(1)})`);
    const here = roomAt(st.pos);
    if (here !== lastRoom) {
      lastRoom = here;
      hereEl.textContent = here ? here.label : "Passaggio";
      chips.querySelectorAll("[data-room]").forEach((b) => b.setAttribute("aria-pressed", String(here?.id === b.dataset.room)));
    }
  }
  requestAnimationFrame(tick);
  document.getElementById("loading").remove();

  return {
    enter(at) {
      if (at) {
        st.pos = [...at];
        st.walk = null;
      }
      st.active = true;
      last = performance.now();
      resize();
    },
    leave() {
      st.active = false;
      keys.clear();
    },
  };
}
