import * as THREE from './vendor/three.module.min.js';

/* ------------------------------------------------------------------ *
 * Artworks. Placeholder toys are generated from these parameters;
 * swap makeToy() for real models (e.g. GLB) when the designs are ready.
 * ------------------------------------------------------------------ */
const ARTWORKS = [
  { name: 'Mochi', body: '#f4a7b9', accent: '#fff3f0', ears: 'bear' },
  { name: 'Volt',  body: '#f6c945', accent: '#2b2b2b', ears: 'antenna' },
  { name: 'Koi',   body: '#ff7a45', accent: '#ffffff', ears: 'fin' },
  { name: 'Nori',  body: '#3f7d5c', accent: '#d9efc2', ears: 'bunny' },
  { name: 'Pixel', body: '#5b7cfa', accent: '#dfe6ff', ears: 'cat' },
  { name: 'Ember', body: '#d9412f', accent: '#ffd08a', ears: 'horn' },
  { name: 'Lumo',  body: '#b9a4f5', accent: '#fdf6ff', ears: 'bunny' },
  { name: 'Fig',   body: '#6d3b5e', accent: '#f0b7c8', ears: 'bear' },
  { name: 'Dusk',  body: '#2f3a4f', accent: '#f6c945', ears: 'cat' },
  { name: 'Tango', body: '#19a7a0', accent: '#ffe9c9', ears: 'horn' },
  { name: 'Blip',  body: '#e9e6df', accent: '#ff7a45', ears: 'antenna' },
  { name: 'Sol',   body: '#f0913a', accent: '#fff2c9', ears: 'none' },
];
const N = ARTWORKS.length;

/* Tunables */
const MAX_TILT = 0.26;                       // wall view: max tilt in radians (~15°)
const PARALLAX = [                           // wall view: how the niche interiors move vs the wall
  { label: 'Deep',    k: 1.5 },              // interior swings further than the wall (exaggerated depth)
  { label: 'Natural', k: 0 },                // plain geometry, no extra movement
  { label: 'Counter', k: -0.75 },            // interior swings against the wall
];
const PITCH = 1.3, OPEN = 1.0, DEPTH = 0.75, CORNER = 0.1;   // wall niche sizes
const R = 1;                                 // carousel niche half-size

/* ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 2.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(-3, 4.5, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(sun);

const clay = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.95, side: THREE.DoubleSide });

function applyTheme() {
  const wall = getComputedStyle(document.documentElement).getPropertyValue('--wall').trim() || '#f1efea';
  clay.color.set(wall);
  scene.background = new THREE.Color(wall);
  const dark = clay.color.getHSL({}).l < 0.5;
  hemi.intensity = dark ? 3.4 : 2.0;
  hemi.groundColor.set(dark ? 0x77736c : 0xd8d2c8);
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------------------------- geometry helpers ---------------------------- */
function roundedRect(target, cx, cy, w, h, r) {
  const x = cx - w / 2, y = cy - h / 2;
  target.moveTo(x + r, y);
  target.lineTo(x + w - r, y);
  target.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  target.lineTo(x + w, y + h - r);
  target.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  target.lineTo(x + r, y + h);
  target.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(x, y + r);
  target.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return target;
}

/** Flat wall with holes cut where the niches are. */
function wallGeometry(holes) {
  const shape = new THREE.Shape();
  shape.moveTo(-40, -40); shape.lineTo(40, -40); shape.lineTo(40, 40); shape.lineTo(-40, 40); shape.closePath();
  shape.holes = holes;
  return new THREE.ShapeGeometry(shape, 10);
}

/** Surface between two equally long rings/lines of points. */
function strip(a, b, closed) {
  const n = a.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z);
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    idx.push(2 * i, 2 * j, 2 * i + 1, 2 * i + 1, 2 * j, 2 * j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Triangle fan over a convex outline. */
function fan(pts) {
  const pos = [], idx = [];
  pts.forEach((p) => pos.push(p.x, p.y, p.z));
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function clayMesh(geometry) {
  const m = new THREE.Mesh(geometry, clay);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

/** The wall face shades the niches but never sits in shadow itself. */
function wallMesh(holes) {
  const m = clayMesh(wallGeometry(holes));
  m.receiveShadow = false;
  return m;
}

/* ------------------------------- toys ------------------------------- */
const G = {
  sphere: new THREE.SphereGeometry(1, 32, 24),
  leg: new THREE.CapsuleGeometry(0.085, 0.1, 6, 16),
  body: new THREE.CapsuleGeometry(0.2, 0.14, 8, 24),
  arm: new THREE.CapsuleGeometry(0.065, 0.15, 6, 16),
  longEar: new THREE.CapsuleGeometry(0.06, 0.24, 6, 16),
  cone: new THREE.ConeGeometry(0.1, 0.2, 24),
  rod: new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8),
};
const matCache = new Map();
function vinyl(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35 }));
  }
  return matCache.get(color);
}
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.2 });

/** Placeholder art toy, about 1.1 units tall, feet at y = 0, facing +z. */
function makeToy(art) {
  const toy = new THREE.Group();
  const main = vinyl(art.body), accent = vinyl(art.accent);
  const add = (geo, mat, x, y, z, s = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s);
    m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    toy.add(m);
    return m;
  };
  add(G.leg, main, -0.11, 0.135, 0);
  add(G.leg, main, 0.11, 0.135, 0);
  add(G.body, main, 0, 0.4, 0);
  add(G.sphere, accent, 0, 0.38, 0.13, [0.12, 0.13, 0.09]);
  add(G.arm, main, -0.26, 0.42, 0, 1, -0.45);
  add(G.arm, main, 0.26, 0.42, 0, 1, 0.45);
  add(G.sphere, main, 0, 0.76, 0, [0.31, 0.28, 0.29]);
  add(G.sphere, eyeMat, -0.105, 0.77, 0.265, 0.036);
  add(G.sphere, eyeMat, 0.105, 0.77, 0.265, 0.036);
  switch (art.ears) {
    case 'bear':
      add(G.sphere, main, -0.22, 0.98, 0, 0.1); add(G.sphere, main, 0.22, 0.98, 0, 0.1);
      add(G.sphere, accent, -0.22, 0.98, 0.06, 0.055); add(G.sphere, accent, 0.22, 0.98, 0.06, 0.055);
      break;
    case 'bunny':
      add(G.longEar, main, -0.12, 1.14, 0, 1, 0.12); add(G.longEar, main, 0.12, 1.14, 0, 1, -0.12);
      break;
    case 'cat':
      add(G.cone, main, -0.19, 1.02, 0, 1, 0.35); add(G.cone, main, 0.19, 1.02, 0, 1, -0.35);
      break;
    case 'horn':
      add(G.cone, accent, -0.17, 1.03, 0, [0.6, 1, 0.6], 0.3); add(G.cone, accent, 0.17, 1.03, 0, [0.6, 1, 0.6], -0.3);
      break;
    case 'antenna':
      add(G.rod, accent, 0, 1.12, 0); add(G.sphere, accent, 0, 1.24, 0, 0.05);
      break;
    case 'fin':
      add(G.cone, accent, 0, 1.06, -0.02, [0.5, 1.1, 1.3]);
      break;
    default:
  }
  return toy;
}

/* ------------------------------ wall view ------------------------------ */
const wallView = new THREE.Group();
scene.add(wallView);
let niches = [], grid = { cols: 0, rows: 0 };

function buildWall(cols, rows) {
  wallView.clear();
  niches = [];
  grid = { cols, rows };
  const holes = [];
  const count = cols * rows;
  for (let i = 0; i < count; i++) {
    const cx = ((i % cols) - (cols - 1) / 2) * PITCH;
    const cy = ((rows - 1) / 2 - Math.floor(i / cols)) * PITCH;
    holes.push(roundedRect(new THREE.Path(), cx, cy, OPEN, OPEN, CORNER));

    // Interior shell, modelled around its own origin so it can be skewed by depth.
    const ring = roundedRect(new THREE.Path(), 0, 0, OPEN, OPEN, CORNER).getPoints(8);
    const front = ring.map((p) => new THREE.Vector3(p.x, p.y, 0));
    const back = ring.map((p) => new THREE.Vector3(p.x, p.y, -DEPTH));
    const shell = new THREE.Group();
    shell.add(clayMesh(strip(front, back, true)), clayMesh(fan(back)));
    shell.matrixAutoUpdate = false;

    const toy = makeToy(ARTWORKS[i % N]);
    toy.scale.setScalar(0.62);
    wallView.add(shell, toy);
    niches.push({ cx, cy, shell, toy });
  }
  wallView.add(wallMesh(holes));
}

const shear = new THREE.Matrix4();
function poseWall(rx, ry, k) {
  wallView.rotation.set(rx, ry, 0);
  // Skew each interior along its depth: the rim stays glued to the wall,
  // the back swings by k times the tilt. That is the "rotates differently" effect.
  const sx = -k * Math.tan(ry), sy = k * Math.tan(rx);
  const toyZ = -DEPTH * 0.55;
  for (const n of niches) {
    shear.set(1, 0, sx, n.cx, 0, 1, sy, n.cy, 0, 0, 1, 0, 0, 0, 0, 1);
    n.shell.matrix.copy(shear);
    n.toy.position.set(n.cx + sx * toyZ, n.cy - OPEN / 2 + sy * toyZ, toyZ);
    n.toy.rotation.set(-rx * k * 0.5, -ry * k * 0.5, 0);
  }
}

/* ---------------------------- carousel view ---------------------------- */
const carouselView = new THREE.Group();
scene.add(carouselView);
const cavity = new THREE.Group();     // fixed alcove: straight sides, half-round back
const rotor = new THREE.Group();      // revolving panel with one toy on each face
rotor.position.z = -R;
carouselView.add(cavity, rotor);
carouselView.add(wallMesh([roundedRect(new THREE.Path(), 0, 0, 2 * R, 2 * R, 0.08)]));

{
  const profile = [[-R, 0]];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI + (i / 40) * Math.PI;
    profile.push([R * Math.cos(a), -R + R * Math.sin(a)]);
  }
  profile.push([R, 0]);
  const top = profile.map(([x, z]) => new THREE.Vector3(x, R, z));
  const bottom = profile.map(([x, z]) => new THREE.Vector3(x, -R, z));
  cavity.add(clayMesh(strip(top, bottom, false)), clayMesh(fan(top)), clayMesh(fan(bottom)));
}

const faces = [new THREE.Group(), new THREE.Group()];
let axis = 'y';            // 'y' = swipe sideways, 'x' = swipe up/down
let angle = 0, target = 0, velocity = 0;
const shown = [null, null];

function buildRotor() {
  rotor.clear();
  rotor.rotation.set(0, 0, 0);
  cavity.rotation.z = axis === 'y' ? 0 : Math.PI / 2;
  rotor.add(clayMesh(new THREE.BoxGeometry(2 * R - 0.03, 2 * R - 0.03, 0.05)));
  if (axis === 'y') {
    const disc = clayMesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.03, 64));
    disc.position.y = -R + 0.02;
    rotor.add(disc);
  }
  faces.forEach((face, i) => {
    face.clear();
    face.rotation.set(0, 0, 0);
    face.rotation[axis] = i * Math.PI;
    if (axis === 'x') {
      const ledge = clayMesh(new THREE.BoxGeometry(1.15, 0.05, 0.6));
      ledge.position.set(0, -0.625, 0.325);
      face.add(ledge);
    }
    rotor.add(face);
    shown[i] = null;
  });
}

const mod = (v, m) => ((v % m) + m) % m;

function poseCarousel() {
  rotor.rotation[axis] = angle;
  const t = angle / Math.PI;
  // Each face carries the artwork for the nearest half-turn at which it faces
  // the viewer; it is swapped while it is turned away.
  const want = [2 * Math.round(t / 2), 2 * Math.round((t - 1) / 2) + 1];
  faces.forEach((face, i) => {
    const art = mod(-want[i], N);
    if (shown[i] === art) return;
    shown[i] = art;
    const old = face.getObjectByName('toy');
    if (old) face.remove(old);
    const toy = makeToy(ARTWORKS[art]);
    toy.name = 'toy';
    if (axis === 'y') { toy.scale.setScalar(1.15); toy.position.set(0, -R + 0.035, 0.42); }
    else { toy.scale.setScalar(0.95); toy.position.set(0, -0.6, 0.33); }
    face.add(toy);
  });
  const current = mod(-Math.round(t), N);
  if (current !== plateIndex) {
    plateIndex = current;
    plateName.textContent = ARTWORKS[current].name;
    plateMeta.textContent = `${String(current + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;
  }
}

/* --------------------------------- UI --------------------------------- */
const hint = document.getElementById('hint');
const plate = document.getElementById('plate');
const plateName = document.getElementById('plate-name');
const plateMeta = document.getElementById('plate-meta');
const btnWall = document.getElementById('view-wall');
const btnCarousel = document.getElementById('view-carousel');
const btnOption = document.getElementById('option');
let plateIndex = -1;
let view = 'wall';
let parallaxMode = 0;
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

function refreshUI() {
  const wall = view === 'wall';
  wallView.visible = wall;
  carouselView.visible = !wall;
  plate.hidden = wall;
  btnWall.setAttribute('aria-pressed', String(wall));
  btnCarousel.setAttribute('aria-pressed', String(!wall));
  if (wall) {
    hint.textContent = 'Drag to tilt the wall. Tap a figure to open it.';
    btnOption.innerHTML = `<b>Parallax</b> ${PARALLAX[parallaxMode].label}`;
  } else {
    hint.textContent = axis === 'y' ? 'Swipe sideways to turn the shelf.' : 'Swipe up or down to turn the shelf.';
    btnOption.innerHTML = `<b>Swipe</b> ${axis === 'y' ? 'Sideways' : 'Up / down'}`;
  }
  fitCamera();
}

function setView(next, artIndex) {
  if (next === view && artIndex === undefined) return;
  canvas.classList.add('fade');
  setTimeout(() => {
    view = next;
    if (artIndex !== undefined) { angle = target = -artIndex * Math.PI; velocity = 0; }
    tilt.x = tilt.y = tilt.tx = tilt.ty = 0;
    refreshUI();
    canvas.classList.remove('fade');
  }, 200);
}

btnWall.addEventListener('click', () => setView('wall'));
btnCarousel.addEventListener('click', () => setView('carousel'));
btnOption.addEventListener('click', () => {
  if (view === 'wall') {
    parallaxMode = (parallaxMode + 1) % PARALLAX.length;
  } else {
    const current = mod(-Math.round(angle / Math.PI), N);
    axis = axis === 'y' ? 'x' : 'y';
    buildRotor();
    angle = target = -current * Math.PI;
  }
  refreshUI();
});

/* ------------------------------- camera ------------------------------- */
function fitCamera() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  let cw, ch, cy = 0;
  if (view === 'wall') {
    const cols = camera.aspect > 1.15 ? 4 : 3, rows = 12 / cols;
    if (cols !== grid.cols) buildWall(cols, rows);
    cw = cols * PITCH + 0.5; ch = rows * PITCH + 2.2;
  } else {
    cw = 3.3; ch = 5.2; cy = -0.25;
  }
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(ch / 2 / tan, cw / 2 / (tan * camera.aspect));
  camera.position.set(0, cy, dist);
  camera.lookAt(0, cy, 0);
  camera.updateProjectionMatrix();
}
new ResizeObserver(fitCamera).observe(canvas);

/* ------------------------------ pointer ------------------------------ */
const drag = { id: null, x: 0, y: 0, startX: 0, startY: 0, time: 0, moved: 0 };
const raycaster = new THREE.Raycaster();

canvas.addEventListener('pointerdown', (e) => {
  drag.id = e.pointerId;
  drag.x = drag.startX = e.clientX;
  drag.y = drag.startY = e.clientY;
  drag.time = performance.now();
  drag.moved = 0;
  velocity = 0;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (view === 'wall' && e.pointerType === 'mouse') {
    // Mouse: the wall follows the pointer, no press needed.
    tilt.ty = (e.clientX / w - 0.5) * 2 * MAX_TILT;
    tilt.tx = (e.clientY / h - 0.5) * 2 * MAX_TILT * 0.7;
  }
  if (drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const now = performance.now(), dt = Math.max(now - drag.time, 1);
  drag.x = e.clientX; drag.y = e.clientY; drag.time = now;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (view === 'wall') {
    if (e.pointerType !== 'mouse') {
      tilt.ty = THREE.MathUtils.clamp(tilt.ty + (dx / w) * 1.6 * MAX_TILT * 2, -MAX_TILT, MAX_TILT);
      tilt.tx = THREE.MathUtils.clamp(tilt.tx + (dy / h) * 1.2 * MAX_TILT * 2, -MAX_TILT * 0.7, MAX_TILT * 0.7);
    }
  } else {
    // One half-turn (one artwork) per ~60% of the short screen side.
    const perPx = Math.PI / (Math.min(w, h) * 0.6);
    const d = (axis === 'y' ? dx : dy) * perPx;
    angle += d;
    target = angle;
    velocity = 0.7 * velocity + 0.3 * (d / dt) * 1000;
  }
});

function release(e) {
  if (drag.id !== e.pointerId) return;
  drag.id = null;
  canvas.classList.remove('dragging');
  if (view === 'wall') {
    if (e.pointerType !== 'mouse') tilt.tx = tilt.ty = 0;   // settle back to front-on
    if (drag.moved < 8 && e.type === 'pointerup') openAt(e.clientX, e.clientY);
  } else {
    // Throw: settle on the half-turn the swipe is heading for, at most one step past the nearest.
    const near = Math.round(angle / Math.PI);
    const thrown = Math.round((angle + velocity * 0.22) / Math.PI);
    target = THREE.MathUtils.clamp(thrown, near - 1, near + 1) * Math.PI;
    velocity = 0;
  }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && drag.id === null) tilt.tx = tilt.ty = 0; });

function openAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  wallView.updateMatrixWorld();
  const inv = new THREE.Matrix4().copy(wallView.matrixWorld).invert();
  const o = raycaster.ray.origin.clone().applyMatrix4(inv);
  const d = raycaster.ray.direction.clone().transformDirection(inv);
  const p = o.addScaledVector(d, -o.z / d.z);
  const i = niches.findIndex((n) => Math.abs(p.x - n.cx) < OPEN / 2 && Math.abs(p.y - n.cy) < OPEN / 2);
  if (i >= 0) setView('carousel', i % N);
}

canvas.addEventListener('wheel', (e) => {
  if (view !== 'carousel') return;
  e.preventDefault();
  if (Math.abs(target - angle) > 0.4) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(delta) > 4) target = (Math.round(angle / Math.PI) - Math.sign(delta)) * Math.PI;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (view !== 'carousel') return;
  const step = { ArrowRight: -1, ArrowDown: -1, ArrowLeft: 1, ArrowUp: 1 }[e.key];
  if (step) { target = (Math.round(target / Math.PI) + step) * Math.PI; e.preventDefault(); }
});

/* -------------------------------- loop -------------------------------- */
buildRotor();
refreshUI();
let last = performance.now();
let kNow = PARALLAX[0].k;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (view === 'wall') {
    const ease = 1 - Math.exp(-dt * 7);
    tilt.x += (tilt.tx - tilt.x) * ease;
    tilt.y += (tilt.ty - tilt.y) * ease;
    kNow += (PARALLAX[parallaxMode].k - kNow) * ease;
    poseWall(tilt.x, tilt.y, kNow);
  } else {
    if (drag.id === null) angle += (target - angle) * (1 - Math.exp(-dt * 9));
    poseCarousel();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Small hook for testing from the console.
window.figureDisplay = { setView, tilt, get angle() { return angle; }, set angle(v) { angle = target = v; } };
