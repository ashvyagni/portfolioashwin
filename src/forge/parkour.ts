import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { clamp01, easeInOut, mulberry32, smooth } from './ink'
import type { HeroMode } from './hero'

// The world past the debris: a sky of things adrift. A floating island with
// a ruined arch and a waterfall pouring off its lip into nothing; cubes of
// the forge's stone, runes lit in their faces, turning in the air; a crag;
// a great asteroid with its own ring of rubble; a rock with a bronze ring
// in it, high up; and a bank of real cloud. Ashwin crosses all of it in one
// line — sprint, leap, a sword driven into the asteroid's face to stop his
// fall, a rope fired at the ring and swung, a dive through the cloud — and
// lands on Matsya's back. This module builds that world and, for any moment
// of the run, says where he is, how he holds himself, and where the camera
// is: the whole cutscene is choreographed here, shot by shot.

// ---------- noise
const lattice = (x: number, y: number, z: number, s: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.3) * 43758.5453
  return n - Math.floor(n)
}
function noise3(x: number, y: number, z: number, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => lattice(xi + dx, yi + dy, zi + dz, s)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  ) * 2 - 1
}
const fbm = (x: number, y: number, z: number, s = 0, oct = 4) => {
  let a = 0.5, f = 1, t = 0
  for (let i = 0; i < oct; i++) {
    t += a * noise3(x * f, y * f, z * f, s + i * 7)
    a *= 0.5
    f *= 2.03
  }
  return t
}

// ---------- palette of the stone world
const C = {
  grass: new THREE.Color('#617B3C'),
  grass2: new THREE.Color('#8A9A4E'),
  dirt: new THREE.Color('#6A5236'),
  rock: new THREE.Color('#7A6E62'),
  rock2: new THREE.Color('#9C8F7E'),
  rock3: new THREE.Color('#4E463F'),
  moss: new THREE.Color('#4C5E34'),
  basalt: new THREE.Color('#34302E'),
  basalt2: new THREE.Color('#4A4440'),
}

function finish(g: THREE.BufferGeometry) {
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  const m = mergeVertices(g, 1e-4)
  m.computeVertexNormals()
  return m
}

// Rock strata, moss in the hollows, grass where it is flat and up.
function paint(g: THREE.BufferGeometry, seed: number, grassAbove = -1e9, basalt = false) {
  const p = g.attributes.position as THREE.BufferAttribute
  const n = g.attributes.normal as THREE.BufferAttribute
  const col = new Float32Array(p.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const ny = n.getY(i)
    const band = Math.sin(y * 1.4 + fbm(x * 0.2, y * 0.2, z * 0.2, seed) * 3)
    if (basalt) {
      c.copy(C.basalt).lerp(C.basalt2, band * 0.5 + 0.5)
      c.lerp(C.rock3, clamp01(fbm(x * 0.5, y * 0.5, z * 0.5, seed + 3) + 0.2))
    } else {
      c.copy(band > 0.3 ? C.rock2 : band < -0.4 ? C.rock3 : C.rock)
      c.lerp(C.moss, clamp01((fbm(x * 0.3, y * 0.3, z * 0.3, seed + 9) - 0.1) * 2) * 0.6)
      if (ny > 0.62 && y > grassAbove) {
        const g2 = clamp01((ny - 0.62) * 4)
        c.lerp(C.dirt, g2 * 0.6).lerp(C.grass, g2 * clamp01(0.6 + fbm(x * 0.4, 0, z * 0.4, seed) * 0.8))
        c.lerp(C.grass2, clamp01(fbm(x * 0.15, 0, z * 0.15, seed + 4)) * g2 * 0.7)
      }
    }
    // Small variation, so nothing is one flat colour.
    c.multiplyScalar(0.9 + lattice(Math.floor(x * 3), Math.floor(y * 3), Math.floor(z * 3), seed) * 0.2)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

// A floating island: a grassy table on an inverted crag, gnarled beneath.
function islandGeo(r: number, depth: number, seed: number) {
  const prof: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) prof.push(new THREE.Vector2(r * (i / 10) * 0.97, 0))
  prof.push(new THREE.Vector2(r * 1.0, -0.35), new THREE.Vector2(r * 0.99, -0.9))
  for (let j = 1; j <= 22; j++) {
    const t = j / 22
    prof.push(new THREE.Vector2(Math.max(r * Math.pow(1 - t, 1.35) * 0.96, 0.001), -0.9 - depth * t))
  }
  prof.reverse()
  const g = new THREE.LatheGeometry(prof, 96)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    if (y > -0.2) {
      // The top: gentle swells.
      p.setY(i, y + fbm(x * 0.12, 0, z * 0.12, seed) * 0.9 * clamp01(Math.hypot(x, z) / r + 0.3))
    } else {
      const k = clamp01(-y / depth)
      const d = 1 + fbm(x * 0.16, y * 0.16, z * 0.16, seed) * 0.55 + fbm(x * 0.6, y * 0.6, z * 0.6, seed + 2) * 0.12
      p.setX(i, x * d)
      p.setZ(i, z * d)
      p.setY(i, y + fbm(x * 0.2, 7, z * 0.2, seed + 5) * 2.2 * k)
    }
  }
  return paint(finish(g), seed, -1.2)
}

// The top of an island, measured the way it was shaped.
const islandTop = (x: number, z: number, r: number, seed: number) => fbm(x * 0.12, 0, z * 0.12, seed) * 0.9 * clamp01(Math.hypot(x, z) / r + 0.3)

// A crag or a stepping rock: lumpy, with a flattened, grassed top.
function rockGeo(r: number, seed: number, flatTop = true, detail = 4) {
  const g = new THREE.IcosahedronGeometry(r, detail)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = v.clone().normalize()
    const ridged = 1 - Math.abs(fbm(n.x * 2.2, n.y * 2.2, n.z * 2.2, seed))
    v.multiplyScalar(1 + fbm(n.x * 1.3, n.y * 1.3, n.z * 1.3, seed + 1) * 0.32 + ridged * 0.12)
    v.y *= 0.8
    if (flatTop && v.y > r * 0.42) v.y = r * 0.42 + (v.y - r * 0.42) * 0.12
    if (v.y < 0) v.y *= 1.35
    p.setXYZ(i, v.x, v.y, v.z)
  }
  return paint(finish(g), seed, flatTop ? r * 0.3 : 1e9)
}

// The asteroid: basalt, pocked with craters.
function asteroidGeo(r: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, 5)
  const p = g.attributes.position as THREE.BufferAttribute
  const rand = mulberry32(seed)
  const craters = Array.from({ length: 14 }, () => ({ d: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), s: 0.12 + rand() * 0.28 }))
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = v.clone().normalize()
    let h = fbm(n.x * 1.6, n.y * 1.6, n.z * 1.6, seed) * 0.22 + fbm(n.x * 6, n.y * 6, n.z * 6, seed + 3) * 0.04
    for (const c of craters) {
      const a = Math.acos(Math.min(1, n.dot(c.d)))
      const t = a / c.s
      if (t < 1.3) h += t < 1 ? -0.09 * c.s * 3 * (1 - t * t) : 0.05 * c.s * 3 * Math.sin(((t - 1) / 0.3) * Math.PI)
    }
    v.multiplyScalar(1 + h)
    v.y *= 0.88
    p.setXYZ(i, v.x, v.y, v.z)
  }
  return paint(finish(g), seed, 1e9, true)
}

// A tree: a leaning, tapering trunk and a crown of lumpy clumps.
function treeGeo(seed: number, h: number) {
  const rand = mulberry32(seed)
  const lean = new THREE.Vector3((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8)
  const pts = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(lean.x * (i / 5) ** 2 * h * 0.3, (i / 5) * h, lean.z * (i / 5) ** 2 * h * 0.3))
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, h * 0.05, 10)
  const tp = trunk.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) / h
    const s = 1.6 - y * 0.9
    tp.setX(i, pts[0].x + (tp.getX(i) - lean.x * y * y * h * 0.3) * s + lean.x * y * y * h * 0.3)
    tp.setZ(i, (tp.getZ(i) - lean.z * y * y * h * 0.3) * s + lean.z * y * y * h * 0.3)
  }
  const bark = new THREE.Color('#3E2C20')
  const leafA = new THREE.Color('#3F5A2A')
  const leafB = new THREE.Color('#6C8540')
  const parts: THREE.BufferGeometry[] = []
  const colour = (g: THREE.BufferGeometry, f: (y: number, i: number) => THREE.Color) => {
    const n = g.attributes.position.count
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const cc = f(g.attributes.position.getY(i), i)
      c.set([cc.r, cc.g, cc.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv')
    return g
  }
  parts.push(colour(trunk, () => bark))
  const top = pts[5]
  const clumps = 6 + Math.floor(rand() * 4)
  for (let i = 0; i < clumps; i++) {
    const r = h * (0.18 + rand() * 0.14)
    const g = new THREE.IcosahedronGeometry(r, 3)
    const p = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k)
      const n = v.clone().normalize()
      v.multiplyScalar(1 + fbm(n.x * 2, n.y * 2, n.z * 2, seed + i) * 0.35)
      v.y *= 0.75
      p.setXYZ(k, v.x, v.y, v.z)
    }
    const a = rand() * Math.PI * 2
    const rr = i === 0 ? 0 : h * (0.18 + rand() * 0.2)
    g.translate(top.x + Math.cos(a) * rr, top.y - h * 0.08 + (rand() - 0.3) * h * 0.18, top.z + Math.sin(a) * rr)
    const c2 = new THREE.Color()
    parts.push(colour(g, (y) => c2.copy(leafA).lerp(leafB, clamp01((y - top.y + h * 0.2) / (h * 0.45)) * 0.9)))
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!
  merged.computeVertexNormals()
  return merged
}

// A fluted column, whole or broken.
function columnGeo(h: number, r: number, seed: number, broken: boolean) {
  const g = new THREE.CylinderGeometry(r * 0.92, r, h, 40, 24)
  g.translate(0, h / 2, 0)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const a = Math.atan2(z, x)
    const rr = Math.hypot(x, z)
    if (rr < 1e-3) continue
    const flute = 1 - 0.05 * Math.pow(Math.abs(Math.cos(a * 10)), 0.6)
    const wear = 1 + fbm(x * 0.8, y * 0.4, z * 0.8, seed) * 0.08
    p.setX(i, (x / rr) * rr * flute * wear)
    p.setZ(i, (z / rr) * rr * flute * wear)
    if (broken && y > h * 0.7) p.setY(i, y - (fbm(x * 1.5, 0, z * 1.5, seed + 2) * 0.5 + 0.5) * h * 0.25)
  }
  const out = finish(g)
  const c = new THREE.Color('#B4A894')
  const n = out.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const y = out.attributes.position.getY(i)
    const k = 0.82 + fbm(out.attributes.position.getX(i), y * 0.5, out.attributes.position.getZ(i), seed) * 0.25
    col.set([c.r * k, c.g * k * (1 - (y < 1.2 ? 0.15 : 0)), c.b * k * (1 - (y < 1.2 ? 0.25 : 0))], i * 3)
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

// The forge's stone, with its runes cut and lit in every face.
function runeTexture(seed: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const rand = mulberry32(seed)
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = '#FFB547'
  g.lineCap = 'square'
  g.lineWidth = 5
  g.strokeRect(18, 18, 220, 220)
  g.lineWidth = 2
  g.strokeRect(30, 30, 196, 196)
  const glyphs = ['鍛', '火', '刃', '道', '空', '龍', 'ॐ', 'अ', '力', '心']
  g.fillStyle = '#FFB547'
  g.font = "110px 'Instrument Serif', serif"
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(glyphs[Math.floor(rand() * glyphs.length)], 128, 132)
  g.lineWidth = 3
  for (let i = 0; i < 6; i++) {
    const x = 40 + rand() * 176
    g.beginPath()
    g.moveTo(x, 30)
    g.lineTo(x, 30 + 8 + rand() * 18)
    g.moveTo(x, 226)
    g.lineTo(x, 226 - 8 - rand() * 18)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function puffTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const img = g.createImageData(128, 128)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const dx = x / 64 - 1, dy = y / 64 - 1
      const r = Math.hypot(dx, dy)
      const n = fbm(x * 0.05, y * 0.05, 0, 11) * 0.5 + 0.5
      const a = clamp01((1 - r) * 1.6) * (0.55 + n * 0.6)
      const i = (y * 128 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.min(255, a * a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const fallVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFog;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFog = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`
const fallFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vFog;
  float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    // Streaks of falling water, quick, breaking up as they go.
    float streak = n(vec2(vUv.x * 18.0, vUv.y * 3.0 + uTime * 2.6)) * 0.6 + n(vec2(vUv.x * 40.0, vUv.y * 6.0 + uTime * 4.1)) * 0.4;
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float body = smoothstep(0.35, 0.75, streak);
    vec3 col = mix(vec3(0.62, 0.74, 0.8), vec3(0.98, 0.99, 1.0), body);
    // It thins to spray and is gone a long way down.
    float a = edge * (0.55 + 0.45 * body) * smoothstep(0.0, 0.5, vUv.y) * (0.6 + 0.4 * smoothstep(0.85, 1.0, vUv.y));
    gl_FragColor = vec4(col, a * 0.9);
    #include <colorspace_fragment>
  }
`

export type Shot = { cam: THREE.Vector3; look: THREE.Vector3; roll: number; fov: number }
export type Moment = {
  feet: THREE.Vector3
  mode: HeroMode
  facing: THREE.Vector3
  pitch: number
  roll: number
  phase: number
  sword: 'back' | 'hand'
  rope: boolean
  shot: Shot
  white: number
  shake: number
  leap: number
  beat: string
  idx: number
  k: number
}

type Beat = { kind: string; dur: number; from: THREE.Vector3; to: THREE.Vector3; apex?: number; idx: number }

function paintStone(g: THREE.BufferGeometry) {
  const out = finish(g)
  const n = out.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const k = 0.78 + fbm(out.attributes.position.getX(i) * 0.6, out.attributes.position.getY(i) * 0.6, out.attributes.position.getZ(i) * 0.6, 4) * 0.3
    col.set([0.7 * k, 0.66 * k, 0.58 * k], i * 3)
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

// The heavy pieces, made once and kept: prepare() makes them a few at a
// time while the browser is idle, so the cut into the sky never stalls.
const made = new Map<string, unknown>()
function get<T>(key: string, make: () => T): T {
  if (!made.has(key)) made.set(key, make())
  return made.get(key) as T
}
const recipes: [string, () => unknown][] = [
  ['island', () => islandGeo(15, 26, 3)],
  ['asteroid', () => asteroidGeo(11, 41)],
  ['crag', () => rockGeo(5, 21)],
  ['ringRock', () => rockGeo(3.4, 70, false)],
  ['rubble', () => rockGeo(1, 60, false, 2)],
  ['tree0', () => treeGeo(5, 6.5)],
  ['tree1', () => treeGeo(8, 8)],
  ['tree2', () => treeGeo(13, 5.5)],
  ['colA', () => columnGeo(9, 0.75, 1, false)],
  ['colB', () => columnGeo(7, 0.75, 2, true)],
  ['far0', () => islandGeo(12, 22, 101)],
  ['far1', () => islandGeo(9, 26, 102)],
  ['far2', () => islandGeo(16, 18, 103)],
  ['farR0', () => rockGeo(4, 111, false, 3)],
  ['farR1', () => rockGeo(6, 112, true, 3)],
  ['arch', () => paintStone(new THREE.TorusGeometry(5.4, 0.62, 18, 64, Math.PI * 0.82))],
  ['cube', () => new RoundedBoxGeometry(1, 1, 1, 4, 0.06)],
  ...[0, 1, 2, 3].map((i): [string, () => unknown] => [`rune${i}`, () => runeTexture(30 + i)]),
]
export function prepareParkour() {
  const next = () => {
    const r = recipes.find(([k]) => !made.has(k))
    if (!r) return
    get(r[0], r[1])
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback
    if (ric) ric(next)
    else setTimeout(next, 30)
  }
  next()
}

export function createParkour(scene: THREE.Scene, haze: THREE.Color) {
  const root = new THREE.Group()
  scene.add(root)
  scene.fog = new THREE.Fog(haze, 90, 560)
  scene.fog.color = haze
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
  const fallUniforms = { uTime: { value: 0 } }

  // Frame: O, the top of the second slab; dir, the way he is going.
  const O = new THREE.Vector3()
  const dir = new THREE.Vector3(0, 0, -1)
  const side = new THREE.Vector3(1, 0, 0)
  const up = new THREE.Vector3(0, 1, 0)
  const W = (x: number, y: number, z: number, out = new THREE.Vector3()) => out.copy(O).addScaledVector(side, x).addScaledVector(up, y).addScaledVector(dir, z)

  const beats: Beat[] = []
  const route: THREE.Vector3[] = []
  let total = 0
  const blockers: THREE.Object3D[] = []
  const matsyaAt = new THREE.Vector3()
  const centre = new THREE.Vector3()

  // The objects that move.
  let asteroid: THREE.Mesh | null = null
  let rubble: THREE.InstancedMesh | null = null
  const rubbleSeed: { a: number; r: number; y: number; s: number; sp: number }[] = []
  const drifting: { m: THREE.Object3D; base: THREE.Vector3; spin: THREE.Vector3; bob: number }[] = []
  const anchor = new THREE.Vector3()
  const astPos = new THREE.Vector3()
  const swing = { pivot: new THREE.Vector3(), h: new THREE.Vector3(), L: 0, th0: 0, th1: 0 }
  const slide: { p: THREE.Vector3; n: THREE.Vector3 }[] = []
  const cloudCentre = new THREE.Vector3()
  const diveIn = new THREE.Vector3()
  const diveOut = new THREE.Vector3()
  let puffs: THREE.Points | null = null
  let puffHome: Float32Array | null = null

  // ---- effects: sparks off the blade, dust where he lands, cloud torn.
  const SPARKS = 360
  const sparkPos = new Float32Array(SPARKS * 3)
  const sparkVel = new Float32Array(SPARKS * 3)
  const sparkLife = new Float32Array(SPARKS)
  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: '#FFD27A', size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  sparks.frustumCulled = false
  root.add(sparks)
  let sparkNext = 0
  const DUST = 220
  const dustPos = new Float32Array(DUST * 3)
  const dustVel = new Float32Array(DUST * 3)
  const dustLife = new Float32Array(DUST)
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const puffTex = puffTexture()
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#D9CCB4', size: 1.1, map: puffTex, transparent: true, opacity: 0.55, depthWrite: false }))
  dust.frustumCulled = false
  root.add(dust)
  let dustNext = 0
  const emitSpark = (p: THREE.Vector3, v: THREE.Vector3, n: number) => {
    for (let i = 0; i < n; i++) {
      const k = sparkNext++ % SPARKS
      sparkPos.set([p.x, p.y, p.z], k * 3)
      sparkVel.set([v.x + (Math.random() - 0.5) * 5, v.y + Math.random() * 4, v.z + (Math.random() - 0.5) * 5], k * 3)
      sparkLife[k] = 0.4 + Math.random() * 0.5
    }
  }
  const emitDust = (p: THREE.Vector3, n: number, spread = 3) => {
    for (let i = 0; i < n; i++) {
      const k = dustNext++ % DUST
      const a = Math.random() * Math.PI * 2
      dustPos.set([p.x, p.y + 0.1, p.z], k * 3)
      dustVel.set([Math.cos(a) * spread * (0.4 + Math.random()), 0.4 + Math.random() * 1.2, Math.sin(a) * spread * (0.4 + Math.random())], k * 3)
      dustLife[k] = 0.8 + Math.random() * 0.8
    }
  }
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#2A1E16', roughness: 0.8 }))
  rope.frustumCulled = false
  root.add(rope)
  const hook = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 10), new THREE.MeshStandardMaterial({ color: '#B08A3E', metalness: 0.8, roughness: 0.3 }))
  root.add(hook)

  function build(a: THREE.Vector3, b: THREE.Vector3) {
    root.children.slice().forEach((c) => c !== sparks && c !== dust && c !== rope && c !== hook && root.remove(c))
    beats.length = 0
    drifting.length = 0
    blockers.length = 0
    O.copy(b)
    dir.subVectors(b, a).setY(0).normalize()
    side.set(-dir.z, 0, dir.x)
    const place = (o: THREE.Object3D, p: THREE.Vector3) => {
      o.position.copy(p)
      // Turn the object into the run's frame.
      o.rotation.y = Math.atan2(dir.x, dir.z)
      root.add(o)
      return o
    }

    // ---- the island, with its ruin and its waterfall
    const IR = 15
    const I1 = W(2, -3.4, 33)
    const island = new THREE.Mesh(get('island', () => islandGeo(IR, 26, 3)), rockMat)
    island.castShadow = island.receiveShadow = true
    place(island, I1)
    blockers.push(island)
    const local = (x: number, z: number) => {
      // A point on the island's top in the run's frame (x across, z along).
      const lx = x - 2, lz = z - 33
      // The island was turned with the frame, so its local axes are side/dir.
      const yTop = islandTop(-lx, lz, IR, 3)
      return W(x, -3.4 + yTop, z)
    }
    // Trees round the edge of the meadow, and grass.
    const treeGeos = [get('tree0', () => treeGeo(5, 6.5)), get('tree1', () => treeGeo(8, 8)), get('tree2', () => treeGeo(13, 5.5))]
    ;[[-9, 26], [11, 30], [-7, 41], [12, 42], [-11, 34], [8, 22]].forEach(([x, z], i) => {
      const t = new THREE.Mesh(treeGeos[i % 3], leafMat)
      t.castShadow = true
      place(t, local(x, z).add(new THREE.Vector3(0, -0.2, 0)))
      t.rotation.y += i * 1.7
    })
    const blade = new THREE.BufferGeometry()
    blade.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.035, 0, 0, 0.035, 0, 0, 0, 0.3, 0.03]), 3))
    blade.computeVertexNormals()
    const GRASS = 4200
    const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }), GRASS)
    const gd = new THREE.Object3D()
    const gc = new THREE.Color()
    const gr = mulberry32(77)
    for (let i = 0; i < GRASS; i++) {
      const ang = gr() * Math.PI * 2
      const rr = Math.sqrt(gr()) * (IR - 1.2)
      const x = 2 + Math.cos(ang) * rr
      const z = 33 + Math.sin(ang) * rr
      gd.position.copy(local(x, z))
      gd.rotation.set((gr() - 0.5) * 0.5, gr() * 6, (gr() - 0.5) * 0.5)
      gd.scale.setScalar(0.5 + gr() * 0.7)
      gd.updateMatrix()
      grass.setMatrixAt(i, gd.matrix)
      grass.setColorAt(i, gc.copy(C.grass).lerp(C.grass2, gr()).multiplyScalar(0.8 + gr() * 0.4))
    }
    root.add(grass)
    // The ruin: columns flanking the way, and an arch he runs under.
    const colA = get('colA', () => columnGeo(9, 0.75, 1, false))
    const colB = get('colB', () => columnGeo(7, 0.75, 2, true))
    ;[[-4.2, 24, 0], [5.2, 25, 1], [-4.6, 37, 1], [5.6, 38, 0], [9, 33, 1]].forEach(([x, z, br], i) => {
      const c = new THREE.Mesh(br ? colB : colA, stoneMat)
      c.castShadow = true
      place(c, local(x, z).add(new THREE.Vector3(0, -0.4, 0)))
      c.rotation.z = br ? (i % 2 ? 0.08 : -0.06) : 0
    })
    const arch = new THREE.Mesh(get('arch', () => paintStone(new THREE.TorusGeometry(5.4, 0.62, 18, 64, Math.PI * 0.82))), stoneMat)
    arch.castShadow = true
    place(arch, local(0.6, 31).add(new THREE.Vector3(0, 0.6, 0)))
    arch.rotateY(Math.PI / 2)
    arch.rotateZ(0.05)
    // Water off the lip: a curtain bending out and down, mist far below.
    const fallGeo = new THREE.PlaneGeometry(3.4, 60, 1, 40)
    const fp = fallGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i)
      const t = (30 - y) / 60
      fp.setZ(i, Math.sqrt(t) * 4.5)
      fp.setY(i, y - 30)
      fp.setX(i, fp.getX(i) * (1 + t * 1.6))
    }
    const water = new THREE.Mesh(fallGeo, new THREE.ShaderMaterial({ vertexShader: fallVertex, fragmentShader: fallFragment, uniforms: fallUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
    place(water, W(2 + IR * 0.98, -3.3, 31))
    water.rotation.y += Math.PI / 2
    // A stream across the meadow to it.
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 9, 1, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9FC4D0', roughness: 0.15, metalness: 0.3 }))
    place(stream, local(12.5, 31).add(new THREE.Vector3(0, 0.08, 0)))
    stream.rotation.y += Math.PI / 2

    // ---- the stepping cubes and their company
    const runeMats = Array.from({ length: 4 }, (_, i) => {
      const t = get(`rune${i}`, () => runeTexture(30 + i))
      return new THREE.MeshStandardMaterial({ color: '#3B3836', roughness: 0.75, emissive: '#FFC060', emissiveMap: t, emissiveIntensity: 3.2 })
    })
    const cubeGeo = get('cube', () => new RoundedBoxGeometry(1, 1, 1, 4, 0.06))
    const steps = [
      { p: W(7, -1.5, 55), s: 3.2 },
      { p: W(2.5, 1.6, 62.5), s: 2.6 },
      { p: W(8.5, 4.4, 69), s: 2.9 },
    ]
    const cubeTop = steps.map((c) => c.p.clone().add(new THREE.Vector3(0, c.s / 2, 0)))
    steps.forEach((c, i) => {
      const m = new THREE.Mesh(cubeGeo, runeMats[i % 4])
      m.scale.setScalar(c.s)
      m.castShadow = m.receiveShadow = true
      place(m, c.p)
      m.rotation.y += i * 0.4
    })
    const cr = mulberry32(5)
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(cubeGeo, runeMats[i % 4])
      const s = 1 + cr() * 5
      m.scale.setScalar(s)
      const p = W((cr() - 0.5) * 120, (cr() - 0.4) * 50, 30 + cr() * 140)
      if (Math.abs(p.clone().sub(O).dot(side)) < 18 && Math.abs(p.y - O.y) < 14) p.addScaledVector(side, (cr() > 0.5 ? 1 : -1) * 26)
      m.rotation.set(cr() * 6, cr() * 6, cr() * 6)
      root.add(m)
      m.position.copy(p)
      drifting.push({ m, base: p.clone(), spin: new THREE.Vector3(cr() - 0.5, cr() - 0.5, cr() - 0.5).multiplyScalar(0.2), bob: cr() * 6 })
    }

    // ---- the crag
    const R1 = W(4, 3, 80)
    const crag = new THREE.Mesh(get('crag', () => rockGeo(5, 21)), rockMat)
    crag.castShadow = crag.receiveShadow = true
    place(crag, R1)
    blockers.push(crag)
    const cragTop = R1.clone().add(new THREE.Vector3(0, 5 * 0.8 * 0.42 + 0.1, 0))

    // ---- the asteroid and its ring
    const AR = 11
    const A = W(-6, 15, 103)
    astPos.copy(A)
    asteroid = new THREE.Mesh(get('asteroid', () => asteroidGeo(AR, 41)), rockMat)
    asteroid.castShadow = asteroid.receiveShadow = true
    place(asteroid, A)
    asteroid.updateMatrixWorld(true)
    blockers.push(asteroid)
    rubbleSeed.length = 0
    const rr = mulberry32(9)
    const rubbleGeo = get('rubble', () => rockGeo(1, 60, false, 2))
    rubble = new THREE.InstancedMesh(rubbleGeo, rockMat, 140)
    for (let i = 0; i < 140; i++) rubbleSeed.push({ a: rr() * Math.PI * 2, r: AR * (1.5 + rr() * 0.9), y: (rr() - 0.5) * 3, s: 0.15 + rr() * rr() * 1.4, sp: 0.04 + rr() * 0.05 })
    rubble.position.copy(A)
    rubble.rotation.set(0.35, 0, 0.2)
    root.add(rubble)
    // Where the blade goes in: on the face toward him, found on the rock itself.
    const caster = new THREE.Raycaster()
    slide.length = 0
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      const nn = W(0.25 - t * 0.05, 0.42 - t * 0.75, -1).sub(O).normalize()
      caster.set(A.clone().addScaledVector(nn, AR * 3), nn.clone().negate())
      const hit = caster.intersectObject(asteroid, false)[0]
      if (hit) slide.push({ p: hit.point.clone(), n: hit.face!.normal.clone().transformDirection(asteroid.matrixWorld).normalize() })
    }

    // ---- the ring rock, high up, where the rope bites
    anchor.copy(W(17, 31, 101))
    const ringRock = new THREE.Mesh(get('ringRock', () => rockGeo(3.4, 70, false)), rockMat)
    place(ringRock, anchor.clone().add(new THREE.Vector3(0, 3.2, 0)))
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 12, 40), new THREE.MeshStandardMaterial({ color: '#B08A3E', metalness: 0.85, roughness: 0.3, emissive: '#5A3A10', emissiveIntensity: 0.4 }))
    ring.position.copy(anchor)
    root.add(ring)
    drifting.push({ m: ringRock, base: ringRock.position.clone(), spin: new THREE.Vector3(0, 0.02, 0), bob: 1 })

    // ---- the world beyond: islands and crags adrift to the horizon
    const farIsl = [get('far0', () => islandGeo(12, 22, 101)), get('far1', () => islandGeo(9, 26, 102)), get('far2', () => islandGeo(16, 18, 103))]
    const farRock = [get('farR0', () => rockGeo(4, 111, false, 3)), get('farR1', () => rockGeo(6, 112, true, 3))]
    const fr = mulberry32(17)
    for (let i = 0; i < 26; i++) {
      const isl = i < 14
      const m = new THREE.Mesh(isl ? farIsl[i % 3] : farRock[i % 2], rockMat)
      const ang = fr() * Math.PI * 2
      const dist = 110 + fr() * 300
      const p = O.clone().add(new THREE.Vector3(Math.cos(ang) * dist, (fr() - 0.55) * 90, Math.sin(ang) * dist)).addScaledVector(dir, 90)
      m.scale.setScalar(isl ? 0.8 + fr() * 2.2 : 1 + fr() * 3)
      m.rotation.y = fr() * 6
      m.position.copy(p)
      root.add(m)
      if (!isl) drifting.push({ m, base: p.clone(), spin: new THREE.Vector3(fr() - 0.5, fr() - 0.5, fr() - 0.5).multiplyScalar(0.06), bob: fr() * 6 })
    }

    // ---- the choreography
    const sA = a.clone().addScaledVector(dir, -2.2)
    const sA2 = a.clone().addScaledVector(dir, 2.2)
    const sB = b.clone().addScaledVector(dir, -1.6)
    const sB2 = b.clone().addScaledVector(dir, 2.4)
    const L1 = local(0.4, 19.5)
    const L2 = local(3.2, 45.5)
    const add = (kind: string, dur: number, from: THREE.Vector3, to: THREE.Vector3, apex = 0) => beats.push({ kind, dur, from: from.clone(), to: to.clone(), apex, idx: beats.length })
    add('run', 1.0, sA, sA2)
    add('leap', 0.9, sA2, sB, 1.8)
    add('run', 0.55, sB, sB2)
    add('reveal', 1.9, sB2, L1, 4.5)
    add('meadow', 2.4, L1, L2)
    add('hop', 1.0, L2, cubeTop[0], 3.2)
    add('hop2', 0.75, cubeTop[0], cubeTop[1], 2.6)
    add('hop3', 0.75, cubeTop[1], cubeTop[2], 2.4)
    add('crag', 1.0, cubeTop[2], cragTop.clone().addScaledVector(dir, -2.2), 3)
    add('sprint', 0.55, cragTop.clone().addScaledVector(dir, -2.2), cragTop.clone().addScaledVector(dir, 1.8))
    // The asteroid face: hang below the blade.
    const hang = (k: number, out: THREE.Vector3) => {
      const i = Math.min(Math.floor(k * (slide.length - 1)), slide.length - 2)
      const f = k * (slide.length - 1) - i
      out.lerpVectors(slide[i].p, slide[i + 1].p, f)
      const n = slide[i].n
      return out.addScaledVector(n, 0.55).add(new THREE.Vector3(0, -2.05, 0))
    }
    const hangTop = hang(0, new THREE.Vector3())
    const hangEnd = hang(1, new THREE.Vector3())
    add('strike', 1.0, cragTop.clone().addScaledVector(dir, 1.8), hangTop, 4.5)
    add('slide', 1.7, hangTop, hangEnd)
    // Kick off, flip, and fire the rope: the swing starts from here.
    const nEnd = slide[slide.length - 1].n.clone().setY(0).normalize()
    const kickTo = hangEnd.clone().addScaledVector(nEnd, 5).addScaledVector(side, 3.5).add(new THREE.Vector3(0, -1.5, 0))
    add('flip', 0.9, hangEnd, kickTo, 2.2)
    // The pendulum: pivot at the ring, through the kick point.
    swing.pivot.copy(anchor).add(new THREE.Vector3(0, -2.1, 0))
    const off = kickTo.clone().sub(swing.pivot)
    swing.L = off.length()
    swing.h.copy(off).setY(0).normalize().negate()
    swing.th0 = -Math.atan2(off.clone().setY(0).length(), -off.y)
    swing.th1 = -swing.th0 * 0.92
    const release = swingAt(1, new THREE.Vector3())
    add('swing', 2.3, kickTo, release)
    const apexP = release.clone().addScaledVector(swing.h, 9).add(new THREE.Vector3(0, 6, 0))
    add('soar', 0.95, release, apexP)
    cloudCentre.copy(apexP).addScaledVector(swing.h, 18).add(new THREE.Vector3(0, -10, 0))
    diveIn.copy(apexP)
    diveOut.copy(cloudCentre).addScaledVector(swing.h, 10).add(new THREE.Vector3(0, -10, 0))
    add('dive', 1.5, apexP, diveOut)
    matsyaAt.copy(diveOut).addScaledVector(swing.h, 5).add(new THREE.Vector3(0, -7, 0))
    add('drop', 1.0, diveOut, matsyaAt, 0.6)
    total = beats.reduce((s, x) => s + x.dur, 0)
    route.length = 0
    beats.forEach((x) => route.push(x.from, x.from.clone().lerp(x.to, 0.5), x.to))
    for (let k = 0; k <= 12; k++) route.push(swingAt(k / 12, new THREE.Vector3()))
    // Nothing adrift sits in his way, or in the camera's.
    drifting.forEach((o) => {
      if (o.m === ringRock) return
      const clear = o.m.scale.x * 1.2 + 9
      for (const r of route) {
        const away = o.base.clone().sub(r)
        const d = away.length()
        if (d < clear) o.base.copy(r).addScaledVector(away.normalize(), clear)
      }
    })
    centre.copy(matsyaAt).addScaledVector(dir, 20).add(new THREE.Vector3(0, -8, 0))

    // ---- the cloud he punches through: soft puffs, lit from above.
    const PUFFS = 520
    const pp = new Float32Array(PUFFS * 3)
    const pc = new Float32Array(PUFFS * 3)
    const pr = mulberry32(31)
    for (let i = 0; i < PUFFS; i++) {
      const u = new THREE.Vector3(pr() * 2 - 1, (pr() * 2 - 1) * 0.55, pr() * 2 - 1)
      if (u.length() > 1) u.normalize().multiplyScalar(pr())
      const p = cloudCentre.clone().addScaledVector(swing.h, u.z * 16).addScaledVector(new THREE.Vector3(-swing.h.z, 0, swing.h.x), u.x * 18).add(new THREE.Vector3(0, u.y * 9, 0))
      pp.set([p.x, p.y, p.z], i * 3)
      const shade = 0.72 + 0.28 * clamp01(u.y * 0.8 + 0.6)
      pc.set([shade, shade * 0.98, shade * 0.96], i * 3)
    }
    puffHome = pp.slice()
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3))
    pg.setAttribute('color', new THREE.BufferAttribute(pc, 3))
    puffs = new THREE.Points(pg, new THREE.PointsMaterial({ size: 9, map: puffTex, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }))
    puffs.frustumCulled = false
    root.add(puffs)
  }

  function swingAt(k: number, out: THREE.Vector3) {
    // Fast through the bottom, hanging at the ends, as a pendulum does.
    const e = 0.5 - 0.5 * Math.cos(k * Math.PI)
    const th = swing.th0 + (swing.th1 - swing.th0) * e
    return out.copy(swing.pivot).addScaledVector(swing.h, Math.sin(th) * swing.L).add(new THREE.Vector3(0, -Math.cos(th) * swing.L, 0))
  }

  // Slow in the air, quick at take-off and landing: the leap held.
  const hold = (k: number, amt = 0.6) => {
    const x = k * 2 - 1
    return 0.5 + 0.5 * ((1 - amt) * x + amt * x * x * x)
  }
  const arc = (b: Beat, k: number, out: THREE.Vector3) => out.lerpVectors(b.from, b.to, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * (b.apex ?? 0), 0))

  const feet = new THREE.Vector3()
  const prev = new THREE.Vector3()
  const facing = new THREE.Vector3(0, 0, 1)
  const vel = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const shot: Shot = { cam: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0, fov: 52 }
  const moment: Moment = { feet, mode: 'run', facing, pitch: 0, roll: 0, phase: 0, sword: 'back', rope: false, shot, white: 0, shake: 0, leap: 0, beat: '', idx: 0, k: 0 }
  let phase = 0
  let lastBeat = -1
  let lastT = -1

  // t: seconds into the run. hand: where his rope hand is (last frame).
  function at(t: number, dt: number, time: number, hand: THREE.Vector3, tip: THREE.Vector3): Moment {
    fallUniforms.uTime.value = time
    let acc = 0
    let b = beats[beats.length - 1]
    for (const x of beats) {
      if (t < acc + x.dur) {
        b = x
        break
      }
      acc += x.dur
    }
    const k = clamp01((t - acc) / b.dur)
    prev.copy(feet)
    moment.white = 0
    moment.shake = 0
    moment.leap = 0
    moment.pitch = 0
    moment.roll = 0
    moment.sword = 'back'
    moment.rope = false
    moment.beat = b.kind
    moment.idx = b.idx
    moment.k = k
    let mode: HeroMode = 'run'
    const air = (kk: number, landAt = 0.88) => {
      arc(b, kk, feet)
      mode = kk > landAt ? 'land' : 'jump'
      moment.leap = Math.sin(kk * Math.PI)
    }
    switch (b.kind) {
      case 'run':
      case 'meadow':
      case 'sprint':
        feet.lerpVectors(b.from, b.to, k)
        break
      case 'leap':
      case 'reveal':
      case 'hop':
      case 'hop2':
      case 'hop3':
      case 'crag':
        air(hold(k, b.kind === 'reveal' ? 0.75 : 0.55))
        break
      case 'strike': {
        // The leap falls short; the blade goes in.
        air(hold(k, 0.5), 2)
        moment.sword = k > 0.35 ? 'hand' : 'back'
        if (k > 0.82) mode = 'hang'
        break
      }
      case 'slide': {
        // Down the face on the blade, slowing, sparks pouring off it.
        const e = 1 - Math.pow(1 - k, 2)
        const i = Math.min(Math.floor(e * (slide.length - 1)), slide.length - 2)
        const f = e * (slide.length - 1) - i
        feet.lerpVectors(slide[i].p, slide[i + 1].p, f).addScaledVector(slide[i].n, 0.55).add(new THREE.Vector3(0, -2.05, 0))
        mode = 'hang'
        moment.sword = 'hand'
        moment.shake = (1 - k) * 0.8
        if (dt > 0) emitSpark(tip, tmp.copy(slide[i].n).multiplyScalar(3).add(new THREE.Vector3(0, 2, 0)), Math.round(14 * (1 - k * 0.7)))
        break
      }
      case 'flip': {
        air(k, 2)
        mode = 'tuck'
        moment.pitch = -k * Math.PI * 2
        moment.sword = k < 0.4 ? 'hand' : 'back'
        moment.rope = k > 0.75
        break
      }
      case 'swing': {
        swingAt(k, feet)
        mode = 'swing'
        moment.rope = true
        const e = 0.5 - 0.5 * Math.cos(k * Math.PI)
        const th = swing.th0 + (swing.th1 - swing.th0) * e
        moment.pitch = -th
        moment.leap = Math.sin(k * Math.PI) * 0.7
        break
      }
      case 'soar': {
        const e = Math.sin((k * Math.PI) / 2)
        feet.lerpVectors(b.from, b.to, e).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 1.5, 0))
        mode = 'jump'
        moment.pitch = 0.3 * k
        moment.leap = 1 - k * 0.5
        break
      }
      case 'dive': {
        // Head first, fist out, through the cloud.
        const e = k * k * (3 - 2 * k) * 0.3 + k * 0.7
        const mid = cloudCentre
        tmp.lerpVectors(b.from, mid, e).lerp(tmp.clone().lerpVectors(mid, b.to, e), e)
        feet.copy(tmp)
        mode = 'dive'
        moment.pitch = 1.2 + k * 0.5
        const inside = puffs ? Math.max(0, 1 - feet.distanceTo(cloudCentre) / 14) : 0
        moment.white = smooth(0.1, 0.5, inside) * 0.85
        moment.leap = 0.6
        break
      }
      case 'drop':
        air(k, 0.8)
        moment.pitch = (1 - k) * 1.2
        break
    }
    // Phase of the stride, from distance run.
    const step = feet.distanceTo(prev)
    if (step < 4) phase += step * 3.3
    if (dt > 0) vel.copy(feet).sub(prev).divideScalar(Math.max(dt, 1 / 120))
    if (vel.length() > 80) vel.set(0, 0, 0)
    // Facing: the way he is going, along the ground.
    tmp.copy(b.to).sub(b.from).setY(0)
    if (b.kind === 'slide' || (b.kind === 'strike' && k > 0.82)) tmp.copy(slide[0].n).negate().setY(0)
    if (b.kind === 'swing' || b.kind === 'soar' || b.kind === 'dive' || b.kind === 'drop') tmp.copy(swing.h)
    if (b.kind === 'flip') tmp.copy(slide[0].n).negate().setY(0)
    if (tmp.lengthSq() > 1e-6) facing.copy(tmp.normalize())
    moment.mode = mode
    moment.phase = phase

    // Landings raise dust; a new beat may start with an impact.
    if (b.idx !== lastBeat && lastBeat >= 0 && t > lastT) {
      const was = beats[lastBeat].kind
      if (['leap', 'reveal', 'hop', 'hop2', 'hop3', 'crag', 'drop'].includes(was)) {
        emitDust(beats[lastBeat].to, was === 'reveal' ? 40 : 22, was === 'reveal' ? 4 : 2.5)
        moment.shake = 1
      }
      if (b.kind === 'slide') emitSpark(tip, new THREE.Vector3(0, 3, 0), 60)
    }
    lastBeat = b.idx
    lastT = t

    // ---- the camera, shot by shot
    const H = tmp.copy(feet).add(new THREE.Vector3(0, 1.0, 0)).clone()
    const f = facing
    const sd = new THREE.Vector3(-f.z, 0, f.x)
    const cam = shot.cam
    const look = shot.look.copy(H)
    shot.roll = 0
    shot.fov = 52
    const U = (y: number) => new THREE.Vector3(0, y, 0)
    switch (b.kind) {
      case 'run':
        cam.copy(H).addScaledVector(f, -4.6).addScaledVector(sd, 1.1).add(U(0.9))
        look.addScaledVector(f, 2)
        break
      case 'leap': {
        cam.copy(H).addScaledVector(f, -4.6).addScaledVector(sd, 1.1).add(U(0.9))
        const off = cam.clone().sub(H).applyAxisAngle(up, Math.sin(k * Math.PI) * 1.5)
        cam.copy(H).add(off)
        look.addScaledVector(f, 1.5)
        break
      }
      case 'run2':
        break
      case 'reveal': {
        // Wide, from out to the side: the whole world opens up before him.
        const from = b.from.clone().addScaledVector(sd, -16).addScaledVector(f, 6).add(U(5))
        const to = b.from.clone().addScaledVector(sd, -11).addScaledVector(f, 16).add(U(1))
        cam.lerpVectors(from, to, easeInOut(k))
        look.lerp(b.to.clone().add(U(1)), 0.25 * (1 - k))
        shot.fov = 60
        break
      }
      case 'meadow':
        if (k < 0.55) {
          // Tracking alongside, low, the columns sliding past between.
          cam.copy(H).addScaledVector(sd, -3.6).addScaledVector(f, 0.6).add(U(0.2))
          look.addScaledVector(f, 1.2)
        } else {
          // Ahead of him, low, looking up as he comes under the arch.
          cam.copy(H).addScaledVector(f, 5).addScaledVector(sd, 1.2).add(U(-0.6))
          look.add(U(0.8))
          shot.roll = -0.06
        }
        break
      case 'hop':
        // Straight down past him into the drop.
        cam.copy(H).add(U(8)).addScaledVector(f, -2.5).addScaledVector(sd, 1)
        look.add(U(-4)).addScaledVector(f, 2.5)
        shot.fov = 60
        break
      case 'hop2':
        cam.copy(b.to).addScaledVector(sd, 5).add(U(-3.5))
        look.add(U(0.3))
        shot.roll = 0.12
        break
      case 'hop3':
        cam.copy(H).addScaledVector(f, -5).addScaledVector(sd, -1.4).add(U(1.2))
        look.addScaledVector(f, 2)
        shot.roll = 0.25
        break
      case 'crag':
        cam.copy(H).addScaledVector(f, -7).add(U(2.2)).addScaledVector(sd, 1.6)
        look.addScaledVector(f, 4)
        shot.fov = 58
        break
      case 'sprint':
        cam.copy(H).addScaledVector(f, 4).addScaledVector(sd, -1.6).add(U(-0.2))
        look.add(U(0.4))
        break
      case 'strike': {
        // Out over the drop, the asteroid filling the frame ahead of him.
        cam.copy(H).addScaledVector(f, -5).addScaledVector(sd, 3).add(U(-1.5))
        look.lerp(slide[0].p, 0.35)
        shot.fov = 56
        break
      }
      case 'slide': {
        const n = slide[0].n.clone().setY(0).normalize()
        const t2 = new THREE.Vector3(-n.z, 0, n.x)
        cam.copy(hand).addScaledVector(n, 4.2).addScaledVector(t2, 3.2).add(U(-1.4 - k * 0.6))
        look.copy(hand).add(U(-1))
        shot.fov = 50
        break
      }
      case 'flip': {
        const a2 = k * Math.PI * 1.2
        const off = new THREE.Vector3(Math.cos(a2) * 5.5, 0.8, Math.sin(a2) * 5.5)
        cam.copy(H).add(off)
        break
      }
      case 'swing': {
        const across = new THREE.Vector3(-swing.h.z, 0, swing.h.x)
        if (k < 0.55) {
          // Alongside, low, the world wheeling past behind him.
          // From the asteroid's side, so he is drawn against open sky.
          const away = astPos.clone().sub(swing.pivot).dot(across) > 0 ? 1 : -1
          cam.copy(H).addScaledVector(across, 8 * away).addScaledVector(swing.h, -2.5).add(U(-2))
          look.lerp(swing.pivot, 0.08)
          shot.fov = 58
        } else {
          // Ahead of him and low as he comes up the far side, the rope
          // climbing away behind him to the ring.
          cam.copy(H).addScaledVector(swing.h, 4.5).addScaledVector(across, 2.6).add(U(-1.6))
          look.add(U(1.6))
          shot.roll = 0.15
        }
        break
      }
      case 'soar': {
        // In front of him at the top, everything hanging still.
        const across = new THREE.Vector3(-swing.h.z, 0, swing.h.x)
        cam.copy(H).addScaledVector(swing.h, 5.5 - k * 1.5).addScaledVector(across, 2).add(U(0.8))
        shot.fov = 50
        break
      }
      case 'dive': {
        const d = vel.lengthSq() > 1 ? vel.clone().normalize() : swing.h
        cam.copy(H).addScaledVector(d, -5).add(U(1.6))
        look.addScaledVector(d, 6)
        shot.fov = 62
        break
      }
      case 'drop': {
        const across = new THREE.Vector3(-swing.h.z, 0, swing.h.x)
        cam.copy(b.to).addScaledVector(swing.h, 9).addScaledVector(across, 4).add(U(-0.5))
        look.lerp(b.to.clone().add(U(1)), 0.4)
        shot.fov = 56
        break
      }
    }
    return moment
  }

  // Rope and the world's slow motion, every frame.
  function tick(dt: number, time: number, hand: THREE.Vector3, ropeOn: boolean) {
    rope.visible = hook.visible = ropeOn
    if (ropeOn) {
      const d = anchor.clone().sub(hand)
      const len = d.length()
      rope.position.copy(hand)
      rope.quaternion.setFromUnitVectors(up, d.normalize())
      rope.scale.set(1, len, 1)
      hook.position.copy(anchor)
      hook.quaternion.copy(rope.quaternion)
    }
    if (asteroid) asteroid.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 0.05) * 0.02
    if (rubble) {
      const d = new THREE.Object3D()
      rubbleSeed.forEach((r, i) => {
        const a = r.a + time * r.sp
        d.position.set(Math.cos(a) * r.r, r.y + Math.sin(time * 0.3 + i) * 0.3, Math.sin(a) * r.r)
        d.rotation.set(time * r.sp * 3 + i, time * r.sp * 2, i)
        d.scale.setScalar(r.s)
        d.updateMatrix()
        rubble!.setMatrixAt(i, d.matrix)
      })
      rubble.instanceMatrix.needsUpdate = true
    }
    drifting.forEach((o) => {
      o.m.position.copy(o.base).add(new THREE.Vector3(0, Math.sin(time * 0.4 + o.bob) * 0.6, 0))
      o.m.rotation.x += o.spin.x * dt
      o.m.rotation.y += o.spin.y * dt
      o.m.rotation.z += o.spin.z * dt
    })
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) {
        sparkPos[i * 3 + 1] = -1e5
        continue
      }
      sparkLife[i] -= dt
      sparkVel[i * 3 + 1] -= 14 * dt
      for (let j = 0; j < 3; j++) sparkPos[i * 3 + j] += sparkVel[i * 3 + j] * dt
    }
    sparkGeo.attributes.position.needsUpdate = true
    for (let i = 0; i < DUST; i++) {
      if (dustLife[i] <= 0) {
        dustPos[i * 3 + 1] = -1e5
        continue
      }
      dustLife[i] -= dt
      for (let j = 0; j < 3; j++) {
        dustVel[i * 3 + j] *= 1 - 1.8 * dt
        dustPos[i * 3 + j] += dustVel[i * 3 + j] * dt
      }
    }
    dustGeo.attributes.position.needsUpdate = true
  }

  // The cloud, torn open along the line he dived: puffs pushed off it.
  function tear(from: THREE.Vector3, to: THREE.Vector3, amount: number, time: number) {
    if (!puffs || !puffHome) return
    const p = puffs.geometry.attributes.position as THREE.BufferAttribute
    const seg = to.clone().sub(from)
    const L2 = Math.max(seg.lengthSq(), 1e-6)
    const q = new THREE.Vector3()
    const c = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      q.set(puffHome[i * 3], puffHome[i * 3 + 1], puffHome[i * 3 + 2])
      const s = clamp01(q.clone().sub(from).dot(seg) / L2)
      c.copy(from).addScaledVector(seg, s)
      const away = q.clone().sub(c)
      const d = away.length()
      const push = amount * Math.max(0, 1 - d / 9) * 7
      q.addScaledVector(away.normalize(), push)
      q.y += Math.sin(time * 0.3 + i) * 0.15
      p.setXYZ(i, q.x, q.y, q.z)
    }
    p.needsUpdate = true
  }

  return {
    root,
    build,
    at,
    tick,
    tear,
    blockers,
    route,
    get total() {
      return total
    },
    matsyaAt,
    centre,
    dir,
    side,
    diveIn,
    cloudCentre,
  }
}
