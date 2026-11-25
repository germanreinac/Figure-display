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
const mod = (v, m) => ((v % m) + m) % m;
const clamp = THREE.MathUtils.clamp;

/* Tunables */
const MAX_TILT = 0.32;        // wall view: max sideways tilt in radians (~18°); up/down uses 70% of it
const PARALLAX = 1.1;         // wall view: how much further the niche interiors swing than the wall
const FLIP_AT = 0.9;          // wall view: fraction of max tilt that makes every cube turn
const ZOOM_MAX = 2.6, ZOOM_STEP = 2.2;
const PITCH = 1.3, CELL = 0.5;          // wall niche spacing and half-size
const R = 1;                            // carousel niche half-size
const TOY_H = 1.32;                     // tallest placeholder toy, in toy units
const TOY_SCALE = 1.12;                 // figure size inside a room, relative to the cube's half-size
const PARTICLES = 14000;

/* ------------------------------ renderer ------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;     // this type honours shadow.radius, for soft edges
renderer.toneMapping = THREE.LinearToneMapping;   // keeps the wall a true white and the figure colours saturated
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(26, 1, 1, 100);

/* Studio environment for reflections: a grey room with a few soft boxes. */
{
  const studio = new THREE.Scene();
  const glow = (v) => new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), side: THREE.DoubleSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x8c8c8c, side: THREE.BackSide }));
  const panel = (w, h, v, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow(v));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    studio.add(m);
  };
  studio.add(room);
  panel(10, 10, 5, 0, 9, 0);        // overhead
  panel(6, 8, 7, -8, 3, 6);         // key soft box, front left
  panel(4, 6, 2.5, 8, 1, 5);        // fill, front right
  panel(8, 2, 3, 0, -2, 9);         // low strip in front
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, 0.03).texture;
  pmrem.dispose();
}

const hemi = new THREE.HemisphereLight(0xffffff, 0xdcd8d2, 0.3);
scene.add(hemi);
// Raking daylight from above: bright on the wall face, mostly blocked inside the niches.
const sun = new THREE.DirectionalLight(0xffffff, 3.05);
sun.position.set(-4.5, 8.5, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 9;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(sun);

/** Limewash relief: soft uneven plaster with faint horizontal brush marks (tileable). */
const limewash = (() => {
  const size = 256, c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  const hash = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  const noise = (x, y, period, s) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const h = (i, j) => hash(((x0 + i) % period + period) % period, ((y0 + j) % period + period) % period, s);
    return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const h = 0.5 * noise(u * 4, v * 4, 4, 1) + 0.25 * noise(u * 8, v * 16, 8, 2) + 0.17 * noise(u * 16, v * 48, 16, 3) + 0.08 * noise(u * 64, v * 64, 64, 4);
    const g = Math.round(h * 255), i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  return t;
})();

/** Soft round contact shadow for niches whose lamp casts no real shadow. */
const blobTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.45, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

const plaster = { color: 0xffffff, roughness: 1, bumpMap: limewash, bumpScale: 1.5 };
const wallMat = new THREE.MeshStandardMaterial({ ...plaster, envMapIntensity: 0.3 });
const frameMat = wallMat;
const roomMat = new THREE.MeshStandardMaterial({ ...plaster, bumpScale: 0.5, envMapIntensity: 0.16, vertexColors: true, side: THREE.DoubleSide });
const voidMat = new THREE.MeshStandardMaterial({ color: 0xcfcbc4, roughness: 1, envMapIntensity: 0.2 });
const plinthMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, envMapIntensity: 0.4 });
const ventMat = new THREE.MeshBasicMaterial({ color: 0x2b2a28 });
const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false });
const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/* ---------------------------- geometry ---------------------------- */
function wallMesh(holes) {
  const shape = new THREE.Shape();
  shape.moveTo(-40, -40); shape.lineTo(40, -40); shape.lineTo(40, 40); shape.lineTo(-40, 40); shape.closePath();
  shape.holes = holes.map(([cx, cy, half]) => {
    const p = new THREE.Path();
    p.moveTo(cx - half, cy - half); p.lineTo(cx + half, cy - half);
    p.lineTo(cx + half, cy + half); p.lineTo(cx - half, cy + half); p.closePath();
    return p;
  });
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), wallMat);
  m.castShadow = true;        // shades the niches, never sits in shadow itself
  return m;
}

function backdrop(z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), voidMat);
  m.position.z = z;
  return m;
}

/*
 * The turning cube (half-size 1). Each face has a rounded opening into a
 * straight-walled room with soft corners. Rooms on neighbouring faces would
 * collide inside a real cube, so every opening is a stencil "window": a room
 * is only drawn through its own opening and never shows through another.
 */
const ROOM = { half: 0.86, depth: 1.15, corner: 0.16, lip: 0.05, cove: 0.16, toyZ: 0.42 };

/** Rounded square outline at depth z, counter-clockwise, same point count for any size. */
function roundedRing(half, radius, z) {
  const pts = [], c = half - radius;
  [[c, c, 0], [-c, c, 1], [-c, -c, 2], [c, -c, 3]].forEach(([cx, cy, q]) => {
    for (let i = 0; i <= 8; i++) {
      const a = (q + i / 8) * Math.PI / 2;
      pts.push(new THREE.Vector3(cx + radius * Math.cos(a), cy + radius * Math.sin(a), z));
    }
  });
  return pts;
}

const roomRings = (() => {
  const { half, depth, corner, lip, cove } = ROOM, rings = [];
  for (let i = 0; i <= 5; i++) {                       // soft lip where the room meets the wall face
    const t = (i / 5) * Math.PI / 2, grow = lip * (1 - Math.sin(t));
    rings.push({ pts: roundedRing(half + grow, corner + grow, 1 - lip * (1 - Math.cos(t))), shade: 1 - 0.1 * i / 5 });
  }
  for (let i = 0; i <= 6; i++) {                       // straight walls, then a cove into the back wall
    const t = (i / 6) * Math.PI / 2, shrink = cove * (1 - Math.cos(t));
    rings.push({ pts: roundedRing(half - shrink, Math.max(corner - shrink, 0.03), 1 - (depth - cove) - cove * Math.sin(t)), shade: 0.9 - 0.14 * i / 6 });
  }
  return rings;
})();

const roomGeometry = (() => {
  const pos = [], col = [], uv = [], idx = [], n = roomRings[0].pts.length;
  roomRings.forEach((ring) => ring.pts.forEach((p, i) => { pos.push(p.x, p.y, p.z); col.push(ring.shade, ring.shade, ring.shade); uv.push(i / n * 6, p.z); }));
  for (let r = 0; r < roomRings.length - 1; r++) for (let i = 0; i < n; i++) {
    const a = r * n + i, b = r * n + (i + 1) % n, c = a + n, d = b + n;
    idx.push(a, b, c, c, b, d);
  }
  const last = roomRings[roomRings.length - 1], base = pos.length / 3;   // back wall
  last.pts.forEach((p) => { pos.push(p.x, p.y, p.z); col.push(last.shade, last.shade, last.shade); uv.push(p.x, p.y); });
  for (let i = 1; i < n - 1; i++) idx.push(base, base + i, base + i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
})();

const maskGeometry = (() => {
  const pts = roomRings[0].pts, pos = [], idx = [];
  pts.forEach((p) => pos.push(p.x, p.y, p.z));
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
})();

/** The six outer faces of the cube, each with its opening cut out. */
const frameGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-1, -1); shape.lineTo(1, -1); shape.lineTo(1, 1); shape.lineTo(-1, 1); shape.closePath();
  shape.holes = [new THREE.Path(roomRings[0].pts.map((p) => new THREE.Vector2(p.x, p.y)))];
  const face = new THREE.ShapeGeometry(shape).toNonIndexed();
  face.translate(0, 0, 1);
  const pos = [], uv = [];
  [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [-1, 0]].forEach(([x, y]) => {
    const g = face.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x * Math.PI / 2, y * Math.PI / 2, 0)));
    pos.push(...g.attributes.position.array);
    uv.push(...face.attributes.uv.array);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
})();

const plinthGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.05, 56);
const ventGeometry = new THREE.CircleGeometry(0.2, 40);
const ledGeometry = new THREE.RingGeometry(0.2, 0.27, 56);
const blobGeometry = new THREE.PlaneGeometry(1, 1);
const gapGeometry = new THREE.RingGeometry(0.37, 0.46, 56);

/* ------------------------------- toys ------------------------------- */
const G = {
  sphere: new THREE.SphereGeometry(1, 40, 28),
  leg: new THREE.CapsuleGeometry(0.085, 0.1, 8, 20),
  body: new THREE.CapsuleGeometry(0.2, 0.14, 10, 28),
  arm: new THREE.CapsuleGeometry(0.065, 0.15, 8, 20),
  longEar: new THREE.CapsuleGeometry(0.06, 0.24, 8, 20),
  cone: new THREE.ConeGeometry(0.1, 0.2, 28),
  rod: new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8),
};
const matCache = new Map();
function vinyl(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshPhysicalMaterial({
      color, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.45,
    }));
  }
  return matCache.get(color);
}
const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0c, roughness: 0.08, clearcoat: 1 });

/** Placeholder art toy, feet at y = 0, facing +z. `skin` can swap each material (used for clipping). */
function makeToy(art, skin = (m) => m) {
  const toy = new THREE.Group();
  const main = skin(vinyl(art.body)), accent = skin(vinyl(art.accent)), eye = skin(eyeMat);
  const add = (geo, mat, x, y, z, s = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s);
    m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    toy.add(m);
  };
  add(G.leg, main, -0.11, 0.135, 0);
  add(G.leg, main, 0.11, 0.135, 0);
  add(G.body, main, 0, 0.4, 0);
  add(G.sphere, accent, 0, 0.38, 0.13, [0.12, 0.13, 0.09]);
  add(G.arm, main, -0.26, 0.42, 0, 1, -0.45);
  add(G.arm, main, 0.26, 0.42, 0, 1, 0.45);
  add(G.sphere, main, 0, 0.76, 0, [0.31, 0.28, 0.29]);
  add(G.sphere, eye, -0.105, 0.77, 0.265, 0.036);
  add(G.sphere, eye, 0.105, 0.77, 0.265, 0.036);
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

/* ---------------------- shelf module: cube + two figures ---------------------- */
/**
 * One niche: a turning cube plus two figure holders. Holder 0 is the figure
 * facing out; holder 1 is the one arriving on a side face (or, in particle
 * mode, the one forming in the same spot). Sizes are relative to `half`.
 */
let nextStencil = 0;
function stencilled(material, ref) {
  const m = material.clone();
  m.stencilWrite = true;
  m.stencilFunc = THREE.EqualStencilFunc;
  m.stencilRef = ref;
  return m;
}

function makeShelf(half, withParticles) {
  const group = new THREE.Group();          // sits in the wall, never turns
  const cube = new THREE.Group();           // turns
  cube.scale.setScalar(half * 1.0015);       // a hair larger than the opening and just behind it, so no seam shows
  cube.position.z = -half * 1.0035;
  const frame = new THREE.Mesh(frameGeometry, frameMat);
  frame.castShadow = true;
  cube.add(frame);
  group.add(cube);

  const floorY = -ROOM.half, slotY = floorY + 0.05;
  const holders = [0, 1].map(() => {
    const ref = (nextStencil++ % 250) + 1;
    const g = new THREE.Group();
    const inside = (mesh) => { mesh.renderOrder = 2; g.add(mesh); return mesh; };

    const mask = new THREE.Mesh(maskGeometry, maskMat.clone());
    Object.assign(mask.material, { stencilWrite: true, stencilRef: ref, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    mask.renderOrder = 1;
    g.add(mask);

    inside(new THREE.Mesh(roomGeometry, stencilled(roomMat, ref))).receiveShadow = true;
    const plinth = inside(new THREE.Mesh(plinthGeometry, stencilled(plinthMat, ref)));
    plinth.position.set(0, floorY + 0.025, ROOM.toyZ);
    plinth.castShadow = true;
    plinth.receiveShadow = true;

    const slot = new THREE.Group();
    slot.position.set(0, slotY, ROOM.toyZ);
    slot.scale.setScalar(TOY_SCALE);
    g.add(slot);
    cube.add(g);

    const h = { group: g, slot, plinth, ref, art: -1, toy: null, skins: new Map() };
    h.plane = withParticles ? new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6) : null;
    h.skin = (m) => {
      if (!h.skins.has(m)) {
        const c = stencilled(m, h.ref);
        if (h.plane) { c.clippingPlanes = [h.plane]; c.clipShadows = true; }
        h.skins.set(m, c);
      }
      return h.skins.get(m);
    };
    // Ring of LEDs in the ceiling, straight above the figure.
    const led = inside(new THREE.Mesh(ledGeometry, stencilled(ledMat, ref)));
    led.position.set(0, ROOM.half - 0.004, ROOM.toyZ);
    led.rotation.x = Math.PI / 2;
    if (!withParticles) {
      [[1.25, floorY + 0.004], [0.62, slotY + 0.003]].forEach(([size, y]) => {
        const blob = inside(new THREE.Mesh(blobGeometry, stencilled(blobMat, ref)));
        blob.position.set(0, y, ROOM.toyZ);
        blob.rotation.x = -Math.PI / 2;
        blob.scale.setScalar(size);
      });
    }
    if (withParticles) {
      // Openings the dust travels through, shown only in particle mode:
      // a vent inside the LED ring and a gap around the plinth.
      const vent = inside(new THREE.Mesh(ventGeometry, stencilled(ventMat, ref)));
      vent.position.set(0, ROOM.half - 0.003, ROOM.toyZ);
      vent.rotation.x = Math.PI / 2;
      const gap = inside(new THREE.Mesh(gapGeometry, stencilled(ventMat, ref)));
      gap.position.set(0, floorY + 0.003, ROOM.toyZ);
      gap.rotation.x = -Math.PI / 2;
      h.absorbers = [vent, gap];
      h.points = new THREE.Points(new THREE.BufferGeometry(), stencilled(particleMaterial, ref));
      h.points.material.uniforms.uTop.value = (ROOM.half - slotY) / TOY_SCALE;
      h.points.material.uniforms.uBottom.value = (floorY - slotY) / TOY_SCALE;
      h.points.frustumCulled = false;
      h.points.visible = false;
      h.points.renderOrder = 2;
      slot.add(h.points);
    }
    return h;
  });
  return { group, cube, holders, half };
}

/** Draw a holder's figure through another holder's opening (used when two figures share one room). */
function showThrough(holder, ref) {
  if (holder.ref === ref) return;
  holder.ref = ref;
  holder.skins.forEach((m) => { m.stencilRef = ref; });
  if (holder.points) holder.points.material.stencilRef = ref;
}

function setArt(holder, index) {
  if (holder.art === index) return;
  holder.art = index;
  if (holder.toy) holder.slot.remove(holder.toy);
  holder.toy = makeToy(ARTWORKS[index], holder.skin);
  holder.toy.traverse((o) => { o.renderOrder = 2; });
  holder.slot.add(holder.toy);
  if (holder.points) holder.points.geometry = particleGeometry(index);
}

/** Pose a cube `frac` quarter-turns (-0.5..0.5) towards the next figure along `axis`. */
function turnCube(shelf, axis, frac) {
  shelf.cube.rotation.set(0, 0, 0);
  shelf.cube.rotation[axis] = -frac * Math.PI / 2;
  const side = shelf.holders[1].group;
  side.rotation.set(0, 0, 0);
  side.rotation[axis] = (frac >= 0 ? 1 : -1) * Math.PI / 2;
  side.visible = Math.abs(frac) > 0.0005;
}

/* ------------------------------ particles ------------------------------ */
const particleMaterial = new THREE.ShaderMaterial({
  uniforms: { uD: { value: 0 }, uSide: { value: 1 }, uSize: { value: 30 }, uTop: { value: 1.5 }, uBottom: { value: 0 } },
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */`
    attribute vec3 color; attribute vec3 aSeed; attribute float aH;
    uniform float uD, uSide, uSize, uTop, uBottom;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      // Grains leave from the head down: each one sets off when the sweep reaches its height.
      float start = (1.0 - aH) * 0.45;
      float e = clamp((uD - start) / 0.55, 0.0, 1.0);
      float k = e * e * (3.0 - 2.0 * e);
      float a = aSeed.x * 6.2832;
      // Leaving grains funnel into the ceiling vent; arriving grains start in the gap around the plinth.
      vec3 goal = uSide > 0.0
        ? vec3(cos(a) * 0.17 * sqrt(aSeed.z), uTop + 0.12, sin(a) * 0.17 * sqrt(aSeed.z))
        : vec3(cos(a) * (0.335 + 0.05 * aSeed.z), uBottom - 0.1, sin(a) * (0.335 + 0.05 * aSeed.z));
      float ky = pow(k, mix(0.75, 1.35, aSeed.y));
      float kxz = uSide > 0.0 ? k * k : pow(k, 0.7);
      vec3 p = vec3(mix(position.xz, goal.xz, kxz), mix(position.y, goal.y, ky)).xzy;
      float sway = sin(3.14159 * k);
      p.x += sin(k * 9.0 + aSeed.x * 40.0) * 0.07 * sway;
      p.z += cos(k * 7.0 + aSeed.y * 40.0) * 0.05 * sway;
      vec3 n = normalize(normalMatrix * normal);
      // Lit by the LED above: bright on top, dark underneath, stronger near the ceiling.
      float near = 0.55 + 0.75 * clamp(p.y / uTop, 0.0, 1.0);
      float light = 0.1 + 1.25 * near * max(dot(n, normalize(vec3(0.0, 0.92, 0.38))), 0.0);
      vColor = color * light;
      vAlpha = step(0.0005, e) * (1.0 - smoothstep(0.9, 1.0, k));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uSize * mix(1.0, 0.5, k) * (0.7 + 0.6 * aSeed.y) / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vColor; varying float vAlpha;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float r = dot(c, c);
      if (r > 0.25 || vAlpha < 0.01) discard;
      gl_FragColor = vec4(vColor * (0.72 - c.y * 0.9) * (1.0 - r * 1.6), vAlpha);   // each grain shaded like a tiny bead
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

const particleCache = new Map();
/** Points scattered evenly over a figure's surface, coloured like it. */
function particleGeometry(index) {
  if (particleCache.has(index)) return particleCache.get(index);
  const toy = makeToy(ARTWORKS[index]);
  const tris = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  toy.children.forEach((mesh) => {
    mesh.updateMatrix();
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrix);
    const p = mesh.geometry.attributes.position, nrm = mesh.geometry.attributes.normal, idx = mesh.geometry.index;
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, ia).applyMatrix4(mesh.matrix);
      b.fromBufferAttribute(p, ib).applyMatrix4(mesh.matrix);
      c.fromBufferAttribute(p, ic).applyMatrix4(mesh.matrix);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      if (area < 1e-9) continue;
      total += area;
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), n: new THREE.Vector3().fromBufferAttribute(nrm, ia).applyMatrix3(nm).normalize(), color: mesh.material.color, sum: total });
    }
  });
  const pos = new Float32Array(PARTICLES * 3), col = new Float32Array(PARTICLES * 3), nor = new Float32Array(PARTICLES * 3);
  const seed = new Float32Array(PARTICLES * 3), hs = new Float32Array(PARTICLES);
  const rgb = new THREE.Color();
  for (let i = 0; i < PARTICLES; i++) {
    const pick = Math.random() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid].sum < pick) lo = mid + 1; else hi = mid; }
    const t = tris[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const x = t.a.x + (t.b.x - t.a.x) * u + (t.c.x - t.a.x) * v;
    const y = t.a.y + (t.b.y - t.a.y) * u + (t.c.y - t.a.y) * v;
    const z = t.a.z + (t.b.z - t.a.z) * u + (t.c.z - t.a.z) * v;
    pos.set([x, y, z], i * 3);
    nor.set([t.n.x, t.n.y, t.n.z], i * 3);
    rgb.copy(t.color);
    col.set([rgb.r, rgb.g, rgb.b], i * 3);
    seed.set([Math.random(), Math.random(), Math.random()], i * 3);
    hs[i] = clamp(y / TOY_H, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(hs, 1));
  particleCache.set(index, g);
  return g;
}

/* ------------------------------ wall view ------------------------------ */
const wallView = new THREE.Group();
scene.add(wallView);
let niches = [], grid = { cols: 0, rows: 0 };
let wallOffset = 0;                 // which artwork sits in the first niche
let flip = null;                    // running "all cubes turn" transition

/** The lamp behind the LED ring: a downlight in the niche ceiling, straight above the figure. */
function displayLight(half, shadows) {
  const light = new THREE.SpotLight(0xfff6ea, 1, shadows ? 0 : half * 2.45, 0.95, 0.85, 1.2);
  light.position.set(0, half * 0.8, -half * (1 - ROOM.toyZ) + half * 0.14);
  light.target.position.set(0, -half * ROOM.half, -half * (1 - ROOM.toyZ));
  if (shadows) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.radius = 6;
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.02;
    light.shadow.camera.near = 0.05;
  }
  const g = new THREE.Group();
  g.add(light, light.target);
  g.userData.light = light;
  return g;
}

function buildWall(cols, rows) {
  wallView.clear();
  niches = [];
  grid = { cols, rows };
  flip = null;
  const holes = [];
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = (col - (cols - 1) / 2) * PITCH, cy = ((rows - 1) / 2 - row) * PITCH;
    holes.push([cx, cy, CELL]);
    const shelf = makeShelf(CELL, false);
    shelf.group.matrixAutoUpdate = false;
    setArt(shelf.holders[0], mod(i + wallOffset, N));
    turnCube(shelf, 'y', 0);
    const lamp = displayLight(CELL, false);
    lamp.position.set(cx, cy, 0);
    lamp.userData.light.intensity = 1.9;
    wallView.add(shelf.group, lamp);
    niches.push({ cx, cy, col, row, shelf });
  }
  wallView.add(wallMesh(holes), backdrop(-CELL * 2.6));
}

const shear = new THREE.Matrix4();
function poseWall(rx, ry) {
  wallView.rotation.set(rx, ry, 0);
  // Skew each interior along its depth: the rim stays glued to the wall while
  // the back swings further than the wall itself, exaggerating the parallax.
  const sx = PARALLAX * Math.tan(ry), sy = -PARALLAX * Math.tan(rx);
  for (const n of niches) {
    shear.set(1, 0, sx, n.cx, 0, 1, sy, n.cy, 0, 0, 1, 0, 0, 0, 0, 1);
    n.shelf.group.matrix.copy(shear);
  }
}

/**
 * Every cube makes a half turn in the direction of the push (px, py are -1, 0
 * or 1, so diagonals work too) and each niche gets its neighbour's figure.
 * The turn starts in the corner the push comes from and travels across the wall.
 */
function startFlip(px, py) {
  const len = Math.hypot(px, py);
  const delta = -px + py * grid.cols;
  flip = { axis: new THREE.Vector3(-py / len, px / len, 0), delta, time: 0 };
  const along = (n) => (n.cx * px + n.cy * py) / len, across = (n) => (n.cx * py - n.cy * px) / len;
  const minAlong = Math.min(...niches.map(along)), minAcross = Math.min(...niches.map(across));
  niches.forEach((n, i) => {
    n.delay = (along(n) - minAlong) * 0.17 + (across(n) - minAcross) * 0.075;
    const arriving = n.shelf.holders[1];
    setArt(arriving, mod(i + wallOffset + delta, N));
    arriving.group.quaternion.setFromAxisAngle(flip.axis, Math.PI);     // waits on the back face, ready to arrive upright
    arriving.group.visible = true;
  });
}

function stepFlip(dt) {
  flip.time += dt;
  let done = true;
  for (const n of niches) {
    const p = clamp((flip.time - n.delay) / 1.15, 0, 1);
    if (p < 1) done = false;
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    n.shelf.cube.quaternion.setFromAxisAngle(flip.axis, e * Math.PI);
  }
  if (!done) return;
  wallOffset = mod(wallOffset + flip.delta, N);
  niches.forEach((n, i) => {
    // The arriving figure becomes the resting one; the cube snaps back unseen.
    n.shelf.holders.reverse();
    n.shelf.holders[0].group.rotation.set(0, 0, 0);
    n.shelf.holders[0].group.visible = true;
    turnCube(n.shelf, 'y', 0);
    setArt(n.shelf.holders[0], mod(i + wallOffset, N));
  });
  flip = null;
}

/* ---------------------------- carousel view ---------------------------- */
const carouselView = new THREE.Group();
scene.add(carouselView);
const hero = makeShelf(R, true);
hero.sideRef = hero.holders[1].ref;
const heroLamp = displayLight(R, true);
heroLamp.userData.light.intensity = 4.2;
carouselView.add(hero.group, heroLamp, wallMesh([[0, 0, R]]), backdrop(-R * 2.6));

const car = {
  mode: 'cube',        // 'cube' or 'particles'
  cur: 0,              // artwork at rest
  axis: 'y',           // 'y' = sideways swipe, 'x' = up/down swipe
  t: 0, target: 0,     // progress in steps along the current axis
  velocity: 0,
};
const carStep = () => (car.axis === 'y' ? 1 : (grid.cols || 3));
const carArt = (k) => mod(car.cur + k * carStep(), N);

function settleCarousel() {
  const n = Math.round(car.t);
  car.cur = carArt(n);
  car.t -= n;
  car.target -= n;
}

function dissolve(holder, d, side) {
  // d: 0 = solid figure, 1 = fully turned to dust. A cut plane sweeps down the solid as the grains leave.
  const baseY = holder.slot.getWorldPosition(new THREE.Vector3()).y;
  holder.plane.constant = d <= 0 ? 1e6 : baseY + (1 - d / 0.45) * TOY_H * TOY_SCALE * R;
  holder.points.visible = d > 0 && d < 1;
  const u = holder.points.material.uniforms;
  u.uD.value = d;
  u.uSide.value = side;
  u.uSize.value = 0.011 * renderer.domElement.height / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}

function poseCarousel() {
  const [a, b] = hero.holders;
  let current;
  hero.holders.forEach((h) => h.absorbers.forEach((m) => { m.visible = car.mode === 'particles'; }));
  if (car.mode === 'cube') {
    const n = Math.round(car.t), frac = car.t - n;
    if (b.slot.parent !== b.group) b.group.add(b.slot);
    showThrough(b, hero.sideRef);
    setArt(a, carArt(n));
    setArt(b, carArt(n + (frac >= 0 ? 1 : -1)));
    turnCube(hero, car.axis, frac);
    dissolve(a, 0, 1); dissolve(b, 0, 1);
    current = carArt(n);
  } else {
    // Both figures share the front room: the first leaves through the ceiling,
    // then, after a beat, the next gathers from the gap in the floor.
    const f = Math.floor(car.t + 1e-6), u = clamp(car.t - f, 0, 1);
    if (b.slot.parent !== a.group) a.group.add(b.slot);
    showThrough(b, a.ref);
    setArt(a, carArt(f));
    setArt(b, carArt(f + 1));
    turnCube(hero, car.axis, 0);
    b.group.visible = false;
    dissolve(a, clamp(u / 0.5, 0, 1), 1);
    dissolve(b, 1 - clamp((u - 0.58) / 0.42, 0, 1), -1);
    current = carArt(Math.round(car.t));
  }
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
const tilt = { x: 0, y: 0, tx: 0, ty: 0, hold: false, armed: true };
const cam = { dist: 10, zoom: 1, zoomT: 1, x: 0, y: 0, px: 0, py: 0, halfW: 1, halfH: 1 };

function refreshUI() {
  const wall = view === 'wall';
  wallView.visible = wall;
  carouselView.visible = !wall;
  if (!wall) hint.style.opacity = 1;
  plate.hidden = wall;
  btnWall.setAttribute('aria-pressed', String(wall));
  btnCarousel.setAttribute('aria-pressed', String(!wall));
  if (wall) {
    hint.textContent = 'Drag to tilt; push to the edge to turn every shelf. Pinch or scroll to zoom. Tap a figure to open it.';
    btnOption.innerHTML = cam.zoomT > 1.05 ? '<b>Zoom</b> Out' : '<b>Zoom</b> In';
  } else {
    hint.textContent = 'Swipe sideways or up and down to browse.';
    btnOption.innerHTML = `<b>Transition</b> ${car.mode === 'cube' ? 'Cube' : 'Particles'}`;
  }
  fitCamera();
}

function setView(next, artIndex) {
  if (next === view && artIndex === undefined) return;
  canvas.classList.add('fade');
  setTimeout(() => {
    view = next;
    if (artIndex !== undefined) { car.cur = artIndex; car.t = car.target = 0; }
    tilt.x = tilt.y = tilt.tx = tilt.ty = 0;
    refreshUI();
    canvas.classList.remove('fade');
  }, 200);
}

btnWall.addEventListener('click', () => setView('wall'));
btnCarousel.addEventListener('click', () => setView('carousel'));
btnOption.addEventListener('click', () => {
  if (view === 'wall') {
    cam.zoomT = cam.zoomT > 1.05 ? 1 : ZOOM_STEP;
    hint.style.opacity = cam.zoomT > 1.05 ? 0 : 1;
  } else {
    settleCarousel();
    car.t = car.target = 0;
    car.mode = car.mode === 'cube' ? 'particles' : 'cube';
  }
  refreshUI();
});

/* ------------------------------- camera ------------------------------- */
function fitCamera() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  let cw, ch;
  if (view === 'wall') {
    const cols = camera.aspect > 1.15 ? 4 : 3, rows = 12 / cols;
    if (cols !== grid.cols) buildWall(cols, rows);
    cw = cols * PITCH + 0.5; ch = rows * PITCH + 2.2;
  } else {
    cw = 3.3; ch = 5.2;
  }
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  cam.dist = Math.max(ch / 2 / tan, cw / 2 / (tan * camera.aspect));
  cam.halfH = cam.dist * tan;
  cam.halfW = cam.halfH * camera.aspect;
  camera.updateProjectionMatrix();
}
new ResizeObserver(fitCamera).observe(canvas);

function clampPan() {
  const k = 1 - 1 / cam.zoom;
  const mx = (grid.cols * PITCH / 2 + 0.2) * k, my = (grid.rows * PITCH / 2 + 0.2) * k;
  cam.px = clamp(cam.px, -mx, mx);
  cam.py = clamp(cam.py, -my, my);
  cam.x = clamp(cam.x, -mx, mx);
  cam.y = clamp(cam.y, -my, my);
}

function placeCamera() {
  if (view === 'wall') {
    clampPan();
    camera.position.set(cam.x, cam.y, cam.dist / cam.zoom);
    camera.lookAt(cam.x, cam.y, 0);
  } else {
    camera.position.set(0, -0.25, cam.dist);
    camera.lookAt(0, -0.25, 0);
  }
}

/** Zoom the wall while keeping the point under (clientX, clientY) in place. */
function zoomAt(next, clientX, clientY) {
  next = clamp(next, 1, ZOOM_MAX);
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1, ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  cam.px += nx * cam.halfW * (1 / cam.zoom - 1 / next);
  cam.py += ny * cam.halfH * (1 / cam.zoom - 1 / next);
  cam.x = cam.px; cam.y = cam.py;
  cam.zoom = cam.zoomT = next;
  btnOption.innerHTML = next > 1.05 ? '<b>Zoom</b> Out' : '<b>Zoom</b> In';
  hint.style.opacity = next > 1.05 ? 0 : 1;
}

/* ------------------------------ pointer ------------------------------ */
const pointers = new Map();
const drag = { moved: 0, time: 0, axisLocked: false, pinch: 0, pinchZoom: 1, tiltOff: false };
const raycaster = new THREE.Raycaster();

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  if (pointers.size === 1) {
    Object.assign(drag, { moved: 0, time: performance.now(), axisLocked: false, tiltOff: false });
    car.velocity = 0;
  } else if (pointers.size === 2) {
    const [p, q] = [...pointers.values()];
    drag.pinch = Math.hypot(p.x - q.x, p.y - q.y);
    drag.pinchZoom = cam.zoom;
    drag.moved = 99;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const mouse = e.pointerType === 'mouse';
  if (view === 'wall' && mouse) {
    // Mouse: the wall follows the pointer, no press needed.
    tilt.ty = (e.clientX / w - 0.5) * 2.3 * MAX_TILT;
    tilt.tx = (e.clientY / h - 0.5) * 2.3 * MAX_TILT * 0.7;
  }
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;

  if (pointers.size === 2 && view === 'wall') {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt(drag.pinchZoom * dist / drag.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }
  if (pointers.size !== 1) return;
  const now = performance.now(), dt = Math.max(now - drag.time, 1);
  drag.time = now;
  drag.moved += Math.abs(dx) + Math.abs(dy);

  if (view === 'wall') {
    if (cam.zoom > 1.02) {                      // zoomed in: dragging also moves across the wall
      const perPx = (2 * cam.halfH / cam.zoom) / h;
      cam.px -= dx * perPx;
      cam.py += dy * perPx;
    }
    if (!mouse && !drag.tiltOff) {
      const gain = cam.zoom > 1.05 ? 1.2 : 2.6;
      tilt.ty += (dx / w) * gain * MAX_TILT;
      tilt.tx += (dy / w) * gain * MAX_TILT * 0.7;
    }
  } else {
    if (!drag.axisLocked) {
      if (drag.moved < 6) return;
      if (Math.abs(car.t - Math.round(car.t)) < 0.03) {      // at rest: this swipe may pick a new direction
        settleCarousel();
        car.t = car.target = 0;
        car.axis = Math.abs(dx) >= Math.abs(dy) ? 'y' : 'x';
      }
      drag.axisLocked = true;
    }
    // One figure per ~55% of the short screen side. Left and up go forward.
    const d = -(car.axis === 'y' ? dx : dy) / (Math.min(w, h) * 0.55);
    car.t += d;
    car.target = car.t;
    car.velocity = 0.7 * car.velocity + 0.3 * (d / dt) * 1000;
  }
});

function release(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size) return;
  canvas.classList.remove('dragging');
  if (view === 'wall') {
    if (e.pointerType !== 'mouse') tilt.tx = tilt.ty = 0;   // settle back to front-on
    if (drag.moved < 8 && e.type === 'pointerup') openAt(e.clientX, e.clientY);
  } else {
    // Throw: settle on the figure the swipe is heading for, at most one past the nearest.
    const near = Math.round(car.t);
    car.target = clamp(Math.round(car.t + car.velocity * 0.2), near - 1, near + 1);
    car.velocity = 0;
  }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pointers.size) tilt.tx = tilt.ty = 0; });

function openAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  wallView.updateMatrixWorld();
  const inv = new THREE.Matrix4().copy(wallView.matrixWorld).invert();
  const o = raycaster.ray.origin.clone().applyMatrix4(inv);
  const d = raycaster.ray.direction.clone().transformDirection(inv);
  const p = o.addScaledVector(d, -o.z / d.z);
  const i = niches.findIndex((n) => Math.abs(p.x - n.cx) < CELL && Math.abs(p.y - n.cy) < CELL);
  if (i >= 0) setView('carousel', mod(i + wallOffset, N));
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (view === 'wall') { zoomAt(cam.zoom * Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY); return; }
  if (Math.abs(car.target - car.t) > 0.15) return;
  const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const delta = sideways ? e.deltaX : e.deltaY;
  if (Math.abs(delta) < 4) return;
  settleCarousel();
  car.axis = sideways ? 'y' : 'x';
  car.target = Math.round(car.t) + Math.sign(delta);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (view !== 'carousel') return;
  const move = { ArrowRight: ['y', 1], ArrowLeft: ['y', -1], ArrowDown: ['x', -1], ArrowUp: ['x', 1] }[e.key];
  if (!move || Math.abs(car.target - car.t) > 0.15) return;
  settleCarousel();
  car.axis = move[0];
  car.target = Math.round(car.t) + move[1];
  e.preventDefault();
});

/* -------------------------------- loop -------------------------------- */
refreshUI();
let last = performance.now();
function update(dt) {
  if (view === 'wall') {
    const limX = MAX_TILT * 0.7, limY = MAX_TILT;
    const zoomed = cam.zoomT > 1.05;
    // Keep the push inside an ellipse so diagonals reach the limit as easily as straight pushes.
    const cap = zoomed ? 0.55 : 1, push = Math.hypot(tilt.ty / limY, tilt.tx / limX);
    if (push > cap) { tilt.ty *= cap / push; tilt.tx *= cap / push; }
    // After a turn the wall swings back and ignores the push until it has been let go.
    if (tilt.hold && !flip && push < 0.5) tilt.hold = false;
    const ease = 1 - Math.exp(-dt * 4.5);
    tilt.x += ((tilt.hold ? 0 : tilt.tx) - tilt.x) * ease;
    tilt.y += ((tilt.hold ? 0 : tilt.ty) - tilt.y) * ease;
    if (!flip && !tilt.hold && !zoomed && Math.hypot(tilt.y / limY, tilt.x / limX) > FLIP_AT) {
      // Turn the way the wall is being pushed, snapped to the nearest of eight directions.
      const a = Math.round(Math.atan2(-tilt.x / limX, tilt.y / limY) / (Math.PI / 4)) * (Math.PI / 4);
      startFlip(Math.round(Math.cos(a)), Math.round(Math.sin(a)));
      tilt.hold = true;
      if (pointers.size) { drag.tiltOff = true; tilt.tx = tilt.ty = 0; }
    }
    const glide = 1 - Math.exp(-dt * 14);
    cam.x += (cam.px - cam.x) * glide;
    cam.y += (cam.py - cam.y) * glide;
    if (flip) stepFlip(dt);
    cam.zoom += (cam.zoomT - cam.zoom) * (1 - Math.exp(-dt * 9));
    poseWall(tilt.x, tilt.y);
  } else {
    if (!pointers.size) {
      if (car.mode === 'cube') car.t += (car.target - car.t) * (1 - Math.exp(-dt * 8));
      else car.t += clamp(car.target - car.t, -dt * 0.55, dt * 0.55);     // steady pace, so the dust has time to travel
      if (Math.abs(car.target - car.t) < 0.0015) car.t = car.target;
    }
    poseCarousel();
  }
  placeCamera();
}
function frame(now) {
  update(Math.min((now - last) / 1000, 0.05));
  last = now;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Small hook for testing from the console.
window.figureDisplay = { setView, tilt, cam, car, advance(seconds) { for (let t = 0; t < seconds; t += 0.02) update(0.02); } };
