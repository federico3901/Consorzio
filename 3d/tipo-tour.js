/* Piazza Beretta – tour 360° di un appartamento tipo, nello stile del tour di 3D-House: an equirectangular panorama
   on the inside of a sphere, drag to look, wheel or pinch to zoom, auto-rotate, rooms strip and hotspots.
   The panoramas are path-traced renders of the furnished apartment (tools/render). A point on the image at (x, y),
   both 0–1 from the top-left corner, sits at longitude 360·x and latitude 90 − 180·y. */

import * as THREE from "three";

const FOV = { min: 32, max: 90, start: 75 };
const direction = (lon, lat, out = new THREE.Vector3()) => {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return out.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
};

export async function startTour(ctx) {
  const { U, rooms } = ctx;
  const all = await fetch("tour/tour.json").then((r) => r.json());
  const tour = all[U.id];
  const scenes = tour.scenes;
  const host = document.getElementById("tour");
  const canvas = document.getElementById("pano");
  const hot = document.getElementById("hot");
  const fade = document.getElementById("fade");
  const loading = document.getElementById("tLoad");
  const hint = document.getElementById("tHint");
  document.getElementById("tLabel").textContent = tour.title;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(FOV.start, 1, 1, 1100);
  const world = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(500, 72, 48);
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  world.add(new THREE.Mesh(geometry, material));
  const loader = new THREE.TextureLoader();
  const textures = new Map();

  const v = { lon: 0, lat: 0, fov: FOV.start, lastInput: 0 };
  let current = null;
  let rotate = true;
  let active = false;
  let dirty = true;
  let onHotspot = false;

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  new ResizeObserver(resize).observe(host);

  /* -------- input */
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const touched = () => {
    v.lastInput = performance.now();
    hint.style.opacity = "0";
  };
  const pinchDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  host.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-hotspot], .t-ctrl, .t-strip")) return;
    host.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, lon: v.lon, lat: v.lat };
    if (pointers.size === 2) {
      drag = null;
      pinch = { dist: pinchDist(), fov: v.fov };
    }
    touched();
  });
  host.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) v.fov = THREE.MathUtils.clamp((pinch.fov * pinch.dist) / Math.max(pinchDist(), 1), FOV.min, FOV.max);
    else if (drag) {
      const k = (v.fov / FOV.start) * 0.13;
      v.lon = drag.lon - (e.clientX - drag.x) * k;
      v.lat = THREE.MathUtils.clamp(drag.lat + (e.clientY - drag.y) * k, -85, 85);
    }
    touched();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
  };
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", up);
  host.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      v.fov = THREE.MathUtils.clamp(v.fov + e.deltaY * 0.04, FOV.min, FOV.max);
      touched();
    },
    { passive: false },
  );
  addEventListener("keydown", (e) => {
    if (!active) return;
    const step = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key];
    if (step) {
      e.preventDefault();
      v.lon += step[0];
      v.lat = THREE.MathUtils.clamp(v.lat + step[1], -85, 85);
    } else if (e.key === "+" || e.key === "=") v.fov = THREE.MathUtils.clamp(v.fov - 6, FOV.min, FOV.max);
    else if (e.key === "-") v.fov = THREE.MathUtils.clamp(v.fov + 6, FOV.min, FOV.max);
    else return;
    touched();
  });
  document.getElementById("zin").onclick = () => {
    v.fov = THREE.MathUtils.clamp(v.fov - 8, FOV.min, FOV.max);
    touched();
  };
  document.getElementById("zout").onclick = () => {
    v.fov = THREE.MathUtils.clamp(v.fov + 8, FOV.min, FOV.max);
    touched();
  };
  const rotBtn = document.getElementById("rot");
  rotBtn.onclick = () => {
    rotate = !rotate;
    rotBtn.setAttribute("aria-pressed", String(rotate));
  };

  /* -------- rooms strip and hotspots */
  const strip = document.getElementById("strip");
  strip.innerHTML = scenes
    .map((s) => `<button type="button" role="tab" data-scene="${s.id}"><img src="tour/${s.thumb}" alt=""><span>${s.title}</span></button>`)
    .join("");
  strip.querySelectorAll("[data-scene]").forEach((b) => b.addEventListener("click", () => show(b.dataset.scene)));

  let hotEls = [];
  function buildHotspots(sc) {
    hot.innerHTML = sc.hotspots
      .map(
        (h, i) =>
          `<button type="button" data-hotspot="${i}" class="t-spot"><span class="t-ring"><span class="t-ping"></span><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span><span class="t-spotlbl">${h.label}</span></button>`,
      )
      .join("");
    hotEls = [...hot.querySelectorAll("[data-hotspot]")];
    hotEls.forEach((el, i) => {
      el.addEventListener("click", () => {
        onHotspot = false;
        show(sc.hotspots[i].target);
      });
      el.addEventListener("pointerenter", () => (onHotspot = true));
      el.addEventListener("pointerleave", () => (onHotspot = false));
    });
  }

  function show(id) {
    const sc = scenes.find((s) => s.id === id) ?? scenes[0];
    if (current === sc) return;
    current = sc;
    document.getElementById("tTitle").textContent = sc.title;
    strip.querySelectorAll("[data-scene]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.scene === sc.id)));
    hot.innerHTML = "";
    hotEls = [];
    fade.style.opacity = "1";
    const apply = (tex) => {
      if (current !== sc) return;
      material.map = tex;
      material.needsUpdate = true;
      v.lon = sc.startX * 360;
      v.lat = 0;
      v.fov = FOV.start;
      buildHotspots(sc);
      dirty = true;
      loading.style.display = "none";
      requestAnimationFrame(() => (fade.style.opacity = "0"));
    };
    const cached = textures.get(sc.image);
    if (cached) {
      setTimeout(() => apply(cached), 180);
      return;
    }
    loading.style.display = "";
    loader.load(`tour/${sc.image}`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textures.set(sc.image, tex);
      apply(tex);
    });
  }

  /* -------- frame */
  const target = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const look = new THREE.Vector3();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(now - last, 100);
    last = now;
    if (!active && !dirty) return;
    dirty = false;
    if (rotate && !drag && !pinch && !onHotspot && now - v.lastInput > 2500) v.lon += dt * 0.006;
    camera.fov += (v.fov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
    direction(v.lon, v.lat, target);
    camera.lookAt(target);
    renderer.render(world, camera);
    if (!current) return;
    const { width, height } = canvas.getBoundingClientRect();
    camera.getWorldDirection(look);
    current.hotspots.forEach((h, i) => {
      const el = hotEls[i];
      if (!el) return;
      direction(h.x * 360, 90 - h.y * 180, spot);
      const facing = spot.dot(look) > 0.15;
      spot.multiplyScalar(400).project(camera);
      const inView = facing && Math.abs(spot.x) < 1.2 && Math.abs(spot.y) < 1.2;
      el.style.opacity = inView ? "1" : "0";
      el.style.pointerEvents = inView ? "auto" : "none";
      el.style.transform = `translate(${((spot.x + 1) / 2) * width}px, ${((1 - spot.y) / 2) * height}px) translate(-50%, -50%)`;
    });
  }
  requestAnimationFrame(frame);

  /** The panorama for a room of the plan: its own, else the one nearest to it. */
  const sceneFor = (roomId) => {
    if (scenes.some((s) => s.id === roomId)) return roomId;
    const r = rooms.find((x) => x.id === roomId);
    if (!r) return scenes[0].id;
    let best = scenes[0].id;
    let bd = 1e9;
    for (const s of scenes) {
      const rr = rooms.find((x) => x.id === s.id);
      const d = rr ? Math.hypot(rr.anchor[0] - r.anchor[0], rr.anchor[1] - r.anchor[1]) : 1e9;
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    return best;
  };

  return {
    enter(roomId) {
      active = true;
      resize();
      show(roomId ? sceneFor(roomId) : (current?.id ?? scenes[0].id));
      dirty = true;
    },
    leave() {
      active = false;
    },
  };
}
