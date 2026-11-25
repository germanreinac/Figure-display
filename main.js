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
const PARALLAX = 2.0;         // wall view: how much further the niche interiors swing than the wall
const FLIP_AT = 0.93;         // wall view: fraction of max tilt that makes every cube turn
const ZOOM_MAX = 2.6, ZOOM_STEP = 2.2;
const PITCH = 1.3, CELL = 0.5;          // wall niche spacing and half-size
const R = 1;                            // carousel niche half-size
const TOY_H = 1.32;                     // tallest placeholder toy, in toy units
const PARTICLES = 9000;

/* ------------------------------ renderer ------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.LinearToneMapping;   // keeps the wall a true white and the figure colours saturated
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

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

const hemi = new THREE.HemisphereLight(0xffffff, 0xe9e6e1, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-3.5, 8, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 6;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(sun);

const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, envMapIntensity: 0.55 });
const cubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, envMapIntensity: 0.55, vertexColors: true, side: THREE.DoubleSide });
const voidMat = new THREE.MeshStandardMaterial({ color: 0x6f6c68, roughness: 1, envMapIntensity: 0.05 });
const plinthMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, envMapIntensity: 0.6 });

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
  m.receiveShadow = true;
  return m;
}

/**
 * Unit cube (half-size 1) with a tapered alcove sunk into each of its six
 * faces. Because all faces match, any quarter turn looks the same as rest,
 * so the cube can keep turning forever while the figures are swapped.
 */
const ALC = { rim: 0.92, back: 0.36, depth: 0.55 };
const cubeGeometry = (() => {
  const pos = [], col = [];
  const sq = (h, z) => [[-h, -h, z], [h, -h, z], [h, h, z], [-h, h, z]];
  const face = [];           // [vertex, shade] triangles for the +z face
  const quad = (a, b, c, d, sa, sb) => face.push([a, sa], [b, sa], [c, sb], [a, sa], [c, sb], [d, sb]);
  const outer = sq(1, 1), rim = sq(ALC.rim, 1), back = sq(ALC.back, 1 - ALC.depth);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(outer[i], outer[j], rim[j], rim[i], 1, 1);
    quad(rim[i], rim[j], back[j], back[i], 0.74, 0.3);     // darker towards the back: cheap ambient occlusion
  }
  quad(back[0], back[1], back[2], back[3], 0.3, 0.3);
  const turns = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [-1, 0]].map(([x, y]) =>
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x * Math.PI / 2, y * Math.PI / 2, 0)));
  const v = new THREE.Vector3();
  for (const m of turns) for (const [p, s] of face) {
    v.set(p[0], p[1], p[2]).applyMatrix4(m);
    pos.push(v.x, v.y, v.z);
    col.push(s, s, s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
})();
const plinthGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 48);

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
function makeShelf(half, withParticles) {
  const group = new THREE.Group();          // sits in the wall, never turns
  const cube = new THREE.Group();           // turns
  cube.scale.setScalar(half * 0.998);
  cube.position.z = -half;
  const shell = new THREE.Mesh(cubeGeometry, cubeMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  cube.add(shell);
  group.add(cube);

  const holders = [0, 1].map(() => {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(plinthGeometry, plinthMat);
    plinth.position.set(0, -0.645, 0.7);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    const slot = new THREE.Group();
    slot.position.set(0, -0.62, 0.7);
    slot.scale.setScalar(0.95);
    g.add(plinth, slot);
    cube.add(g);
    const h = { group: g, slot, art: -1, toy: null };
    if (withParticles) {
      h.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
      h.skins = new Map();
      h.skin = (m) => {
        if (!h.skins.has(m)) {
          const c = m.clone();
          c.clippingPlanes = [h.plane];
          c.clipShadows = true;
          h.skins.set(m, c);
        }
        return h.skins.get(m);
      };
      h.points = new THREE.Points(new THREE.BufferGeometry(), particleMaterial.clone());
      h.points.frustumCulled = false;
      h.points.visible = false;
      slot.add(h.points);
    }
    return h;
  });
  return { group, cube, holders, half };
}

function setArt(holder, index) {
  if (holder.art === index) return;
  holder.art = index;
  if (holder.toy) holder.slot.remove(holder.toy);
  holder.toy = makeToy(ARTWORKS[index], holder.skin);
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
  uniforms: { uD: { value: 0 }, uDir: { value: 1 }, uSize: { value: 30 } },
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */`
    attribute vec3 color; attribute vec3 aSeed; attribute float aH;
    uniform float uD, uDir, uSize;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      // The figure comes apart from the top down: each grain leaves when the sweep reaches its height.
      float start = (1.0 - aH) * 0.5;
      float e = clamp((uD - start) / 0.5, 0.0, 1.0);
      float k = e * e * (3.0 - 2.0 * e);
      float ang = aSeed.x * 6.2832 + k * 6.0 * (aSeed.y - 0.5);
      vec3 p = position;
      p.x += sin(ang) * 0.3 * k * aSeed.z;
      p.z += (cos(ang) * 0.12 - 0.3) * k * aSeed.z;   // drift back, so the dust stays inside the niche
      p.y += uDir * k * (0.7 + aSeed.y * 1.1);
      vec3 n = normalize(normalMatrix * normal);
      float light = 0.5 + 0.75 * max(dot(n, normalize(vec3(-0.25, 0.9, 0.45))), 0.0);
      vColor = color * light;
      vAlpha = step(0.0005, e) * (1.0 - smoothstep(0.7, 1.0, e));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uSize * (1.0 - 0.55 * k) / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vColor; varying float vAlpha;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      if (dot(c, c) > 0.25 || vAlpha < 0.01) discard;
      gl_FragColor = vec4(vColor, vAlpha);
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

function displayLight(half, shadows) {
  const light = new THREE.SpotLight(0xfff1dc, 1, half * 2.5, 0.5, 0.9, 1.2);
  light.position.set(0, half * 0.95, -half * 0.1);
  light.target.position.set(0, -half * 0.25, -half * 0.42);
  if (shadows) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.radius = 4;
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
    lamp.userData.light.intensity = 3.4;
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
  const sx = -PARALLAX * Math.tan(ry), sy = PARALLAX * Math.tan(rx);
  for (const n of niches) {
    shear.set(1, 0, sx, n.cx, 0, 1, sy, n.cy, 0, 0, 1, 0, 0, 0, 0, 1);
    n.shelf.group.matrix.copy(shear);
  }
}

/** Every cube makes a quarter turn in a wave and each niche gets its neighbour's figure. */
function startFlip(axis, dir) {
  const step = axis === 'y' ? 1 : grid.cols;
  flip = { axis, dir, step, time: 0 };
  niches.forEach((n, i) => {
    const along = axis === 'y' ? n.col : n.row, across = axis === 'y' ? n.row : n.col;
    const span = (axis === 'y' ? grid.cols : grid.rows) - 1;
    n.delay = (dir > 0 ? span - along : along) * 0.09 + across * 0.035;
    setArt(n.shelf.holders[1], mod(i + wallOffset + dir * step, N));
  });
}

function stepFlip(dt) {
  flip.time += dt;
  let done = true;
  for (const n of niches) {
    const p = clamp((flip.time - n.delay) / 0.8, 0, 1);
    if (p < 1) done = false;
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    turnCube(n.shelf, flip.axis, flip.dir * e * 0.9999);
  }
  if (!done) return;
  wallOffset = mod(wallOffset + flip.dir * flip.step, N);
  niches.forEach((n, i) => {
    // The arriving figure becomes the resting one; the cube snaps back unseen.
    n.shelf.holders.reverse();
    n.shelf.holders[0].group.rotation.set(0, 0, 0);
    n.shelf.holders[0].group.visible = true;
    turnCube(n.shelf, flip.axis, 0);
    setArt(n.shelf.holders[0], mod(i + wallOffset, N));
  });
  flip = null;
}

/* ---------------------------- carousel view ---------------------------- */
const carouselView = new THREE.Group();
scene.add(carouselView);
const hero = makeShelf(R, true);
const heroLamp = displayLight(R, true);
heroLamp.userData.light.intensity = 7.5;
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

function dissolve(holder, d, dir) {
  // d: 0 = solid figure, 1 = fully turned to dust. A cut plane sweeps down the solid as the grains leave.
  const worldScale = R * 0.998 * 0.95;
  const baseY = holder.slot.getWorldPosition(new THREE.Vector3()).y;
  holder.plane.constant = d <= 0 ? 1e6 : baseY + (1 - 2 * d) * TOY_H * worldScale;
  holder.points.visible = d > 0 && d < 1;
  holder.points.material.uniforms.uD.value = d;
  holder.points.material.uniforms.uDir.value = dir;
  holder.points.material.uniforms.uSize.value = 0.016 * renderer.domElement.height / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}

function poseCarousel() {
  const [a, b] = hero.holders;
  let current;
  if (car.mode === 'cube') {
    const n = Math.round(car.t), frac = car.t - n;
    setArt(a, carArt(n));
    setArt(b, carArt(n + (frac >= 0 ? 1 : -1)));
    turnCube(hero, car.axis, frac);
    dissolve(a, 0, 1); dissolve(b, 0, 1);
    current = carArt(n);
  } else {
    const f = Math.floor(car.t + 1e-6), u = clamp(car.t - f, 0, 1);
    setArt(a, carArt(f));
    setArt(b, carArt(f + 1));
    turnCube(hero, car.axis, 0);
    b.group.rotation.set(0, 0, 0);
    b.group.visible = u > 0;
    b.group.children[0].visible = false;           // one plinth is enough when both stand in the same spot
    dissolve(a, u, 1);                             // leaving figure rises as dust
    dissolve(b, 1 - u, -1);                        // next figure gathers from below
    current = carArt(Math.round(car.t));
  }
  if (car.mode === 'cube') b.group.children[0].visible = true;
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
const cam = { dist: 10, zoom: 1, zoomT: 1, x: 0, y: 0, halfW: 1, halfH: 1 };

function refreshUI() {
  const wall = view === 'wall';
  wallView.visible = wall;
  carouselView.visible = !wall;
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
  cam.x += nx * cam.halfW * (1 / cam.zoom - 1 / next);
  cam.y += ny * cam.halfH * (1 / cam.zoom - 1 / next);
  cam.zoom = cam.zoomT = next;
  btnOption.innerHTML = next > 1.05 ? '<b>Zoom</b> Out' : '<b>Zoom</b> In';
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
    tilt.ty = (e.clientX / w - 0.5) * 2.2 * MAX_TILT;
    tilt.tx = (e.clientY / h - 0.5) * 2.2 * MAX_TILT * 0.7;
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
      cam.x -= dx * perPx;
      cam.y += dy * perPx;
    }
    if (!mouse && !drag.tiltOff) {
      tilt.ty += (dx / w) * 3.4 * MAX_TILT;
      tilt.tx += (dy / h) * 2.6 * MAX_TILT;
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
    tilt.tx = clamp(tilt.tx, -limX, limX);
    tilt.ty = clamp(tilt.ty, -limY, limY);
    // After a turn the wall swings back and ignores the push until it has been let go.
    if (tilt.hold && !flip && Math.abs(tilt.tx) < limX * 0.5 && Math.abs(tilt.ty) < limY * 0.5) tilt.hold = false;
    const ease = 1 - Math.exp(-dt * 7);
    tilt.x += ((tilt.hold ? 0 : tilt.tx) - tilt.x) * ease;
    tilt.y += ((tilt.hold ? 0 : tilt.ty) - tilt.y) * ease;
    if (!flip && !tilt.hold) {
      let go = null;
      if (Math.abs(tilt.y) > limY * FLIP_AT) go = ['y', tilt.y > 0 ? -1 : 1];
      else if (Math.abs(tilt.x) > limX * FLIP_AT) go = ['x', tilt.x > 0 ? -1 : 1];
      if (go) {
        startFlip(go[0], go[1]);
        tilt.hold = true;
        if (pointers.size) { drag.tiltOff = true; tilt.tx = tilt.ty = 0; }
      }
    }
    if (flip) stepFlip(dt);
    cam.zoom += (cam.zoomT - cam.zoom) * (1 - Math.exp(-dt * 9));
    poseWall(tilt.x, tilt.y);
  } else {
    if (!pointers.size) {
      car.t += (car.target - car.t) * (1 - Math.exp(-dt * 8));
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
