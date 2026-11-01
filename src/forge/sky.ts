import * as THREE from 'three'
import { clamp01, easeInOut, easeOut, mulberry32, smooth } from './ink'
import { createMatsya } from './matsya'
import { createHero, type HeroMode } from './hero'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { sketchState } from './world'
import { P } from './palette'

// What the cross cuts open. The page is a solid thing — a slab of paper with
// thickness — and the two rays burn it into four, their edges charred and
// glowing. The quarters drift apart and out into a sky, among pieces of the
// landing page torn away with them: that debris is the world you run across,
// leaping from piece to piece, until Matsya swims up under the last one. You
// ride it, and jump: down through the cloud sea, into the black.

const PAGE_W = 16
const EYE = 1.5
const KOI = 16

type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion }
type Piece = {
  group: THREE.Group
  start: Pose
  rest: Pose
  spin: THREE.Vector3
  bob: number
  top: number // half the thickness: where your feet are, above the piece's middle
  glow?: THREE.LineSegments
}

const slabVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
// The printed face: the page as it was, lit like paper in the sun (a soft
// cel step across it), the sky's haze over distance.
const faceFragment = /* glsl */ `
  uniform sampler2D tPage;
  uniform vec3 uLight;
  uniform vec3 uHaze;
  uniform float uHazeK;
  uniform float uLit;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    vec3 c = texture2D(tPage, vUv).rgb;
    float l = dot(normalize(vN), normalize(uLight)) * 0.5 + 0.5;
    c *= mix(1.0, 0.74 + 0.26 * smoothstep(0.45, 0.55, l), uLit);
    float d = length(vWorld - cameraPosition);
    c = mix(c, uHaze, (1.0 - exp(-d * uHazeK)) * 0.85);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`
// The paper's edge: layers of stock, cream with fine dark lines between.
const edgeFragment = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uHaze;
  uniform float uHazeK;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    float l = dot(normalize(vN), normalize(uLight)) * 0.5 + 0.5;
    float layers = 0.88 + 0.12 * step(0.5, fract(vUv.y * 9.0));
    vec3 c = vec3(0.86, 0.8, 0.68) * layers * (0.62 + 0.38 * smoothstep(0.4, 0.6, l));
    float d = length(vWorld - cameraPosition);
    c = mix(c, uHaze, (1.0 - exp(-d * uHazeK)) * 0.85);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`
const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform vec3 uSun;
  uniform float uDark;
  varying vec3 vDir;
  void main() {
    float y = vDir.y;
    vec3 c = mix(uLow, uMid, smoothstep(-0.05, 0.25, y));
    c = mix(c, uTop, smoothstep(0.2, 0.85, y));
    // Below the cloud sea the light goes, toward the dark of the fluid.
    c = mix(c, vec3(0.04, 0.04, 0.06), smoothstep(-0.02, -0.6, y));
    float s = max(dot(vDir, normalize(uSun)), 0.0);
    c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
    c = mix(c, vec3(0.02, 0.02, 0.03), uDark);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`

// Cut a polygon in two along a line (through p, along d).
function split(poly: THREE.Vector2[], p: THREE.Vector2, d: THREE.Vector2) {
  const n = new THREE.Vector2(-d.y, d.x)
  const side = (v: THREE.Vector2) => (v.x - p.x) * n.x + (v.y - p.y) * n.y
  const a: THREE.Vector2[] = []
  const b: THREE.Vector2[] = []
  for (let i = 0; i < poly.length; i++) {
    const u = poly[i]
    const v = poly[(i + 1) % poly.length]
    const su = side(u)
    const sv = side(v)
    ;(su >= 0 ? a : b).push(u)
    if (su >= 0 !== sv >= 0) {
      const x = u.clone().lerp(v, su / (su - sv))
      a.push(x)
      b.push(x.clone())
    }
  }
  return [a, b].filter((q) => q.length >= 3)
}
const area = (poly: THREE.Vector2[]) => Math.abs(poly.reduce((s, v, i) => s + v.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * v.y, 0) / 2)
const centre = (poly: THREE.Vector2[]) => poly.reduce((s, v) => s.add(v), new THREE.Vector2()).divideScalar(poly.length)

export function createSky() {
  const scene = new THREE.Scene()
  const sketch = sketchState()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 900)
  const rng = mulberry32(42)
  const haze = new THREE.Color(P.skyLow)
  const shared = { uLight: { value: new THREE.Vector3(0.45, 0.85, 0.3) }, uHaze: { value: haze }, uHazeK: { value: 0.006 } }
  const skyUniforms = {
    uTop: { value: new THREE.Color(P.skyTop) },
    uMid: { value: new THREE.Color(P.skyMid) },
    uLow: { value: new THREE.Color(P.skyLow) },
    uSun: { value: new THREE.Vector3(0.6, 0.35, -1) },
    uDark: { value: 0 },
  }
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false })))

  // Clouds: real cumulus, heaped spheres flattened at the base, lit from
  // above — the drawing pass inks their billows. Great ones among the
  // debris, and a sea of them far below.
  scene.add(new THREE.HemisphereLight('#FFF4E2', '#8C93B8', 1.3))
  const sunLight = new THREE.DirectionalLight('#FFE9C8', 2.4)
  sunLight.position.set(30, 40, -20)
  scene.add(sunLight)
  const cloudGeo = (seed: number) => {
    const r2 = mulberry32(seed)
    const parts: THREE.BufferGeometry[] = []
    const n = 9 + Math.floor(r2() * 6)
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1)
      const rr = 1.2 + Math.sin(u * Math.PI) * 1.6 + r2() * 0.8
      const g = new THREE.SphereGeometry(rr, 28, 18)
      g.translate((u - 0.5) * 9 + (r2() - 0.5), Math.sin(u * Math.PI) * 1.4 + r2() * 0.8, (r2() - 0.5) * 2.4)
      parts.push(g)
    }
    const merged = mergeGeometries(parts)!
    const pp = merged.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pp.count; i++) if (pp.getY(i) < -0.3) pp.setY(i, -0.3 + (pp.getY(i) + 0.3) * 0.15)
    merged.computeVertexNormals()
    return merged
  }
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, flatShading: false })
  const clouds: THREE.Mesh[] = []
  const ray = new THREE.Raycaster()
  const blockers: THREE.Object3D[] = []
  const glideClouds: THREE.Mesh[] = []
  const routeCentre = new THREE.Vector3()
  const shapes = Array.from({ length: 6 }, (_, i) => cloudGeo(100 + i))
  for (let i = 0; i < 46; i++) {
    const sea = i >= 16
    const c = new THREE.Mesh(shapes[i % shapes.length], cloudMat)
    const s2 = sea ? 4 + rng() * 4 : 1.4 + rng() * 2.2
    c.scale.set(s2, s2 * (0.8 + rng() * 0.3), s2)
    c.rotation.y = rng() * 6
    c.position.set((rng() - 0.5) * (sea ? 420 : 170), sea ? -44 - rng() * 10 : (rng() - 0.6) * 30 - 6, -rng() * 240 + (sea ? 60 : -10))
    scene.add(c)
    clouds.push(c)
  }

  // Paper scraps on the wind.
  const scraps = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.1), new THREE.MeshBasicMaterial({ color: '#efe6d4', side: THREE.DoubleSide }), 260)
  const scrapSeed = Array.from({ length: 260 }, () => ({ p: new THREE.Vector3((rng() - 0.5) * 60, (rng() - 0.5) * 24, -rng() * 110 + 8), s: rng() * 10, v: 0.2 + rng() * 0.6 }))
  scene.add(scraps)
  const d = new THREE.Object3D()

  const hero = createHero()
  hero.group.visible = false
  scene.add(hero.group)
  const heroFeet = new THREE.Vector3()
  const lastFeet = new THREE.Vector3()
  const heroVel = new THREE.Vector3()
  let runPhase = 0
  const matsya = createMatsya()
  matsya.group.scale.setScalar(KOI)
  scene.add(matsya.group)

  const pieces: Piece[] = []
  const pageGroup = new THREE.Group()
  scene.add(pageGroup)
  blockers.push(pageGroup, ...clouds.slice(0, 16))
  let path: Piece[] = []
  let aspect = 16 / 9
  const pageCam = new THREE.Vector3()

  function materials(tex: THREE.Texture) {
    return [
      new THREE.ShaderMaterial({ vertexShader: slabVertex, fragmentShader: faceFragment, uniforms: { ...shared, tPage: { value: tex }, uLit: { value: 1 } } }),
      new THREE.ShaderMaterial({ vertexShader: slabVertex, fragmentShader: edgeFragment, uniforms: shared }),
    ]
  }

  // A slab from a polygon of the page (page units, centred), its face showing
  // that part of the page, its folds inked, its burnt edges glowing.
  function slab(poly: THREE.Vector2[], mats: THREE.Material[], w: number, h: number, depth: number, charred: THREE.Vector2[][] = []) {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(poly), { depth, bevelEnabled: false })
    geo.translate(0, 0, -depth / 2)
    const p = geo.attributes.position as THREE.BufferAttribute
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const n = geo.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getZ(i)) > 0.9) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5)
      else uv.setXY(i, (p.getX(i) + p.getY(i)) * 0.5, (p.getZ(i) + depth / 2) / depth)
    }
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geo, mats))
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: '#1e140e' })))
    let glow: THREE.LineSegments | undefined
    if (charred.length) {
      const pts: number[] = []
      charred.forEach((line) => {
        for (let i = 0; i < line.length - 1; i++) pts.push(line[i].x, line[i].y, depth / 2 + 0.003, line[i + 1].x, line[i + 1].y, depth / 2 + 0.003)
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      glow = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: P.ember, transparent: true }))
      group.add(glow)
    }
    return { group, glow }
  }

  // ---- the world, from the two pages

  // cutPage: the page the rays went through; cross: where they crossed
  // (fractions of width and height) and their width (fraction of the width).
  function build(cutPage: HTMLCanvasElement, landing: HTMLCanvasElement | null, cross: { x: number; y: number; w: number }) {
    pieces.forEach((p) => pageGroup.remove(p.group))
    pieces.length = 0
    const W = PAGE_W
    const H = W / aspect
    const depth = W * 0.012
    const cutTex = new THREE.CanvasTexture(cutPage)
    cutTex.colorSpace = THREE.SRGBColorSpace
    const cutMats = materials(cutTex)
    const cx = (cross.x - 0.5) * W
    const cy = (0.5 - cross.y) * H
    const half = (cross.w * W) / 2
    // A burnt, ragged edge along a ray.
    const jag = (from: number, to: number, along: 'x' | 'y', at: number, sign: number) => {
      const pts: THREE.Vector2[] = []
      const n = 30
      for (let i = 0; i <= n; i++) {
        const t = from + ((to - from) * i) / n
        const off = at + sign * (half + Math.abs(Math.sin(t * 9.1)) * 0.05 + rng() * 0.07)
        pts.push(along === 'x' ? new THREE.Vector2(t, off) : new THREE.Vector2(off, t))
      }
      return pts
    }
    const L = -W / 2
    const R = W / 2
    const T = H / 2
    const B = -H / 2
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    const route = [
      new THREE.Vector3(0, -2, -12),
      new THREE.Vector3(4.5, -1.2, -26),
      new THREE.Vector3(-3, -0.4, -40),
      new THREE.Vector3(3.8, -1.6, -54),
      new THREE.Vector3(-2.5, -0.8, -68),
      new THREE.Vector3(2.4, -2.2, -82),
      new THREE.Vector3(-1.5, -1.0, -96),
    ]
    const corners = [
      { sx: -1, sy: 1 },
      { sx: 1, sy: 1 },
      { sx: -1, sy: -1 },
      { sx: 1, sy: -1 },
    ]
    corners.forEach(({ sx, sy }, i) => {
      const xEdge = sx < 0 ? L : R
      const yEdge = sy > 0 ? T : B
      const horiz = jag(cx, xEdge, 'x', cy, sy)
      const vert = jag(cy, yEdge, 'y', cx, sx)
      // Bounded by the page's corner and the two burnt cuts; wound consistently.
      let poly = [horiz[0], ...horiz.slice(1), new THREE.Vector2(xEdge, yEdge), ...vert.slice().reverse()]
      if (THREE.ShapeUtils.isClockWise(poly)) poly = poly.reverse()
      const s = slab(poly, cutMats, W, H, depth, [horiz, vert])
      const mid = centre(poly)
      const q = flat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rng() - 0.5) * 0.5))
      const at = route[[0, 1, 3, 5][i]].clone()
      s.group.userData.mid = new THREE.Vector3(mid.x, mid.y, 0)
      s.group.userData.corner = { sx, sy }
      pieces.push({
        group: s.group,
        start: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
        rest: { pos: at.sub(new THREE.Vector3(mid.x, mid.y, 0).applyQuaternion(q)), quat: q },
        spin: new THREE.Vector3(),
        bob: rng() * 6,
        top: depth / 2,
        glow: s.glow,
      })
      pageGroup.add(s.group)
    })
    // The landing page, torn into pieces with it.
    if (landing) {
      const tex = new THREE.CanvasTexture(landing)
      tex.colorSpace = THREE.SRGBColorSpace
      const mats = materials(tex)
      let polys = [[new THREE.Vector2(L, B), new THREE.Vector2(R, B), new THREE.Vector2(R, T), new THREE.Vector2(L, T)]]
      for (let k = 0; k < 60 && polys.length < 12; k++) {
        polys.sort((x, y) => area(y) - area(x))
        const big = polys.shift()!
        const a = rng() * Math.PI
        polys.push(...split(big, centre(big).add(new THREE.Vector2((rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2)), new THREE.Vector2(Math.cos(a), Math.sin(a))))
      }
      polys = polys.map((p) => (THREE.ShapeUtils.isClockWise(p) ? p.reverse() : p))
      polys.forEach((poly, i) => {
        const s = slab(poly, mats, W, H, depth)
        const mid = centre(poly)
        const onRoute = i < 3
        const at = onRoute ? route[[2, 4, 6][i]].clone() : new THREE.Vector3((rng() < 0.5 ? -1 : 1) * (8 + rng() * 24), (rng() - 0.5) * 20, -rng() * 120 + 2)
        const q = onRoute
          ? flat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rng() * 6))
          : new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6, rng() * 6, rng() * 6))
        s.group.userData.mid = new THREE.Vector3(mid.x, mid.y, 0)
        const rest = at.clone().sub(new THREE.Vector3(mid.x, mid.y, 0).applyQuaternion(q))
        pieces.push({
          group: s.group,
          start: { pos: rest.clone().add(new THREE.Vector3(0, -40, 10)), quat: q.clone() },
          rest: { pos: rest, quat: q },
          spin: onRoute ? new THREE.Vector3() : new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.12),
          bob: rng() * 6,
          top: depth / 2,
        })
        pageGroup.add(s.group)
      })
    }
    // The route, in the order you cross it.
    path = [0, 1, 4, 2, 5, 3, 6].map((i) => pieces[i]).filter(Boolean)
    routeCentre.set(0, 0, 0)
    path.forEach((p) => routeCentre.add(p.rest.pos))
    routeCentre.divideScalar(path.length)
    // No cloud sits on the route: he must be seen running it.
    const along: THREE.Vector3[] = []
    path.forEach((p, i) => {
      along.push(p.rest.pos)
      if (path[i + 1]) along.push(p.rest.pos.clone().lerp(path[i + 1].rest.pos, 0.5))
    })
    clouds.slice(0, 16).forEach((c) => {
      const clear = c.scale.x * 3 + 5
      for (const a of along) {
        const away = c.position.clone().sub(a)
        const d = away.length()
        if (d < clear) c.position.copy(a).addScaledVector(away.normalize(), clear)
      }
    })
    // A corridor of clouds along the glide after the leap, passing either
    // side of you (never in the way), so the speed has something to show on.
    glideClouds.forEach((c) => scene.remove(c))
    glideClouds.length = 0
    const g0 = swimPath(1, new THREE.Vector3())
    const g1 = swimPath(1.02, new THREE.Vector3())
    const ahead = g1.clone().sub(g0).setY(0).normalize()
    const side = new THREE.Vector3(-ahead.z, 0, ahead.x)
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Mesh(shapes[i % shapes.length], cloudMat)
      const sgn = i % 2 ? 1 : -1
      c.position.copy(g0).addScaledVector(ahead, 6 + i * 2.4).addScaledVector(side, sgn * (10 + rng() * 8)).add(new THREE.Vector3(0, 4 + rng() * 14, 0))
      c.scale.setScalar(0.45 + rng() * 0.35)
      c.rotation.y = rng() * 6
      scene.add(c)
      glideClouds.push(c)
    }
    // The assembled page exactly fills the view from here.
    pageCam.set(0, 0, H / 2 / Math.tan((camera.fov * Math.PI) / 360))
  }

  function topOf(p: Piece, out: THREE.Vector3) {
    return out.copy(p.group.userData.mid as THREE.Vector3).setZ(p.top).applyQuaternion(p.group.quaternion).add(p.group.position)
  }

  const pos = new THREE.Vector3()
  const look = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const axis = new THREE.Vector3()
  const state = { leap: 0, dark: 0, shake: 0, riding: 0, landed: 0, speed: 0 }
  const lastPos = new THREE.Vector3()
  let lastTime = 0

  function setSize(w: number, h: number) {
    aspect = w / h
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }

  // Where Matsya swims, u: 0 … 1.
  const swimPath = (u: number, out: THREE.Vector3) => {
    topOf(path[path.length - 1], out)
    return out.set(out.x + Math.sin(u * 2.4) * 16, out.y - 4 + Math.sin(u * 3.1) * 2 - u * 14, out.z - 10 - u * 70)
  }

  // cut: seconds since the page was cut; run: 0 … 1 across the debris;
  // ride: 0 … 1 on Matsya; fall: 0 … 1 down into the dark.
  function update(cut: number, run: number, ride: number, fall: number, time: number, descend = 0) {
    const dt = Math.min(Math.max(time - lastTime, 0), 0.05)
    lastTime = time
    if (!pieces.length) return
    const apart = easeOut(clamp01((cut - 0.1) / 1.0))
    const fly = easeInOut(clamp01((cut - 1.0) / 2.6))
    pieces.forEach((p, i) => {
      if (i < 4) {
        const { sx, sy } = p.group.userData.corner
        const spread = new THREE.Vector3(sx * 0.9, sy * 0.55, -0.6).multiplyScalar(apart)
        const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(-sy * 0.14 * apart, sx * 0.18 * apart, sx * sy * 0.05 * apart))
        p.group.position.copy(spread).lerp(p.rest.pos, fly)
        p.group.quaternion.copy(turn).slerp(p.rest.quat, fly)
        if (p.glow) (p.glow.material as THREE.LineBasicMaterial).opacity = 1 - smooth(2, 7, cut)
      } else {
        p.group.position.copy(p.start.pos).lerp(p.rest.pos, easeOut(clamp01((cut - 1.2) / 2.4)))
        p.group.quaternion.copy(p.rest.quat)
        if (p.spin.lengthSq()) p.group.rotateOnWorldAxis(axis.copy(p.spin).normalize(), time * p.spin.length())
      }
      p.group.position.y += Math.sin(time * 0.6 + p.bob) * (path.includes(p) ? 0.04 : 0.25) * fly
    })
    scrapSeed.forEach((s, i) => {
      d.position.set(s.p.x + Math.sin(time * 0.3 + s.s) * 2, s.p.y + Math.sin(time * s.v + s.s) * 0.6, s.p.z)
      d.rotation.set(time * s.v + s.s, time * 0.7 + s.s, s.s)
      d.scale.setScalar(fly)
      d.updateMatrix()
      scraps.setMatrixAt(i, d.matrix)
    })
    scraps.instanceMatrix.needsUpdate = true

    // ---- the camera: across the debris
    state.leap = 0
    state.riding = 0
    state.shake = 0
    const n = path.length
    const seg = clamp01(run) * (n - 1)
    const i = Math.min(Math.floor(seg), n - 2)
    // Time is bent: the sprint across each piece is quick, the leap from it
    // long — slow motion in the air, as the camera whips round him.
    const u = seg - i
    const f = u < 0.3 ? (u / 0.3) * 0.42 : 0.42 + ((u - 0.3) / 0.7) * 0.58
    topOf(path[i], a)
    topOf(path[i + 1], b)
    fwd.subVectors(b, a).setY(0).normalize()
    if (f < 0.42) {
      const k = f / 0.42
      pos.lerpVectors(a.clone().addScaledVector(fwd, -2.2), a.clone().addScaledVector(fwd, 2.6), k)
      pos.y += EYE + Math.abs(Math.sin(k * Math.PI * 5)) * 0.07 - smooth(0.8, 1, k) * 0.35
      look.copy(b).setY(b.y + EYE * 0.7)
    } else {
      const k = easeInOut((f - 0.42) / 0.58)
      pos.lerpVectors(a.clone().addScaledVector(fwd, 2.6), b.clone().addScaledVector(fwd, -2.2), k)
      pos.y += EYE + Math.sin(k * Math.PI) * (2.6 + Math.max(b.y - a.y, 0)) - 0.35 * (1 - smooth(0, 0.15, k))
      pos.y -= smooth(0.86, 0.95, k) * (1 - smooth(0.95, 1, k)) * 0.45
      look.copy(b).addScaledVector(fwd, 6).setY(b.y + EYE * (0.2 + 0.6 * Math.sin(k * Math.PI)))
      state.leap = Math.sin(k * Math.PI)
      state.shake = smooth(0.9, 0.95, k) * (1 - smooth(0.95, 1, k))
    }
    // Before the run: from the assembled page out to the first piece.
    if (run <= 0.0001 && ride <= 0 && fall <= 0) {
      const k = easeInOut(clamp01((cut - 1.6) / 2.4))
      topOf(path[0], a)
      topOf(path[1], b)
      fwd.subVectors(b, a).setY(0).normalize()
      const start = a.clone().addScaledVector(fwd, -2.2).setY(a.y + EYE)
      pos.copy(pageCam).lerp(start, k)
      look.set(0, 0, 0).lerp(b.clone().setY(b.y + EYE * 0.7), k)
    }

    // Matsya swims up under the last piece; you ride it; you leap.
    const swimU = ride > 0 ? ride + descend * 0.8 : Math.max(run - 0.82, 0) * 0.5
    swimPath(swimU, matsya.group.position)
    swimPath(swimU + 0.01, b)
    if (descend > 0) matsya.group.position.y -= descend * 10
    matsya.group.lookAt(b)
    matsya.group.rotateY(-Math.PI / 2)
    matsya.swim(dt, 0.6 + ride, 1)
    matsya.group.visible = run > 0.6 || ride > 0 || fall > 0
    if (ride > 0) {
      state.riding = 1
      swimPath(ride, a)
      swimPath(ride + 0.02, b)
      const onto = smooth(0, 0.2, ride)
      const back = new THREE.Vector3(0, KOI * 0.13 + EYE * 0.9, 0)
      const ahead = b.clone().sub(a).normalize()
      pos.lerp(a.clone().add(back).addScaledVector(ahead, -KOI * 0.1), onto)
      look.lerp(b.clone().add(back).addScaledVector(ahead, 10), onto)
      state.leap = 0.3
    }
    state.dark = 0
    if (fall > 0) {
      // Off Matsya's back and up into the open sky…
      swimPath(1, a)
      swimPath(1.02, b)
      const ahead = b.clone().sub(a).setY(0).normalize()
      const off = easeOut(fall)
      const leapPos = a.clone().add(new THREE.Vector3(0, KOI * 0.13 + EYE + Math.sin((Math.min(off, 0.7) / 0.7) * Math.PI * 0.5) * 4, 0)).addScaledVector(ahead, off * 14)
      const leapLook = leapPos.clone().addScaledVector(ahead, 20).add(new THREE.Vector3(0, 1.5 * off, 0))
      pos.copy(leapPos)
      look.copy(leapLook)
      if (descend > 0) {
        // …and then the long fall: a slow orbit down round the whole debris
        // world, watching it as reality comes apart around it.
        const r0 = Math.hypot(leapPos.x - routeCentre.x, leapPos.z - routeCentre.z)
        const th0 = Math.atan2(leapPos.z - routeCentre.z, leapPos.x - routeCentre.x)
        const e = easeInOut(descend)
        const th = th0 + descend * Math.PI * 1.5
        const R = r0 + (26 - r0) * e
        const y = leapPos.y + (routeCentre.y - 2 - leapPos.y) * e + Math.sin(descend * Math.PI) * 7
        const orbit = new THREE.Vector3(routeCentre.x + Math.cos(th) * R, y, routeCentre.z + Math.sin(th) * R)
        const blend = easeInOut(Math.min(descend / 0.12, 1))
        pos.lerpVectors(leapPos, orbit, blend)
        look.lerpVectors(leapLook, routeCentre.clone().add(new THREE.Vector3(0, Math.sin(descend * Math.PI * 2) * 2, 0)), blend)
      }
      state.leap = 0.3 * (1 - off)
    }
    // ---- third person: Ashwin where the eye was, and the camera on him
    const inScene = run > 0 || ride > 0 || fall > 0
    hero.group.visible = inScene
    if (inScene) {
      const facing = look.clone().sub(pos).setY(0)
      if (facing.lengthSq() < 1e-6) facing.copy(fwd)
      facing.normalize()
      const side = new THREE.Vector3(-facing.z, 0, facing.x)
      let mode: HeroMode = 'run'
      heroFeet.copy(pos)
      heroFeet.y -= EYE
      if (fall > 0 && descend > 0) mode = 'fall'
      else if (fall > 0) mode = 'jump'
      else if (ride > 0) {
        mode = ride < 0.08 ? 'land' : 'ride'
        heroFeet.y += EYE * 0.1
      } else if (f >= 0.42) {
        const k = (f - 0.42) / 0.58
        mode = k > 0.88 ? 'land' : 'jump'
      }
      const step = heroFeet.distanceTo(lastFeet)
      if (step < 3) runPhase += step * 3.4
      heroVel.copy(heroFeet).sub(lastFeet).divideScalar(Math.max(dt, 1 / 120))
      if (heroVel.length() > 60) heroVel.set(0, 0, 0)
      lastFeet.copy(heroFeet)
      hero.group.position.copy(heroFeet)
      hero.group.rotation.order = 'YXZ'
      hero.group.rotation.set(mode === 'fall' ? 1.1 + Math.sin(time * 0.6) * 0.15 : 0, Math.atan2(facing.x, facing.z), mode === 'fall' ? Math.sin(time * 0.4) * 0.3 : 0)
      hero.update(dt, mode, runPhase, heroVel, time, mode === 'run' ? 16 : 9)

      // The camera, cutting from shot to shot like an anime sequence.
      const H = heroFeet.clone().add(new THREE.Vector3(0, 1.0, 0))
      const cam = new THREE.Vector3()
      const at = H.clone()
      let roll = 0
      if (fall > 0 && descend > 0) {
        // Falling: round him, close; now and then a cut wide, to see how far.
        const shot = Math.floor(descend * 7) % 3
        const ang = time * 0.35
        if (shot === 0) cam.copy(H).add(new THREE.Vector3(Math.cos(ang) * 5.5, 1.8 + Math.sin(time * 0.3) * 1.2, Math.sin(ang) * 5.5))
        else if (shot === 1) cam.copy(H).add(new THREE.Vector3(Math.cos(ang) * 3, -9, Math.sin(ang) * 3))
        else cam.copy(H).add(new THREE.Vector3(Math.cos(ang + 2) * 12, 10, Math.sin(ang + 2) * 12))
        roll = Math.sin(time * 0.5) * 0.12
      } else if (fall > 0) {
        // The leap off Matsya, seen from under him against the sky.
        cam.copy(H).addScaledVector(facing, -4).add(new THREE.Vector3(0, -2.2, 0)).addScaledVector(side, 1.5)
      } else if (ride > 0) {
        // Round them both as Matsya swims.
        const ang = ride * Math.PI * 1.3 + 0.6
        cam.copy(H).add(new THREE.Vector3(Math.cos(ang) * 8, 2.5 + Math.sin(ride * Math.PI) * 2, Math.sin(ang) * 8))
        at.add(new THREE.Vector3(0, -0.6, 0))
      } else {
        const shot = i % 5
        if (shot === 0) cam.copy(H).addScaledVector(facing, -4.6).addScaledVector(side, 1.1).add(new THREE.Vector3(0, 0.9, 0))
        else if (shot === 1) cam.copy(H).addScaledVector(side, 5.2).addScaledVector(facing, -0.5).add(new THREE.Vector3(0, 0.4, 0))
        else if (shot === 2) cam.copy(H).addScaledVector(facing, 5.5).addScaledVector(side, 1.4).add(new THREE.Vector3(0, 0.6, 0))
        else if (shot === 3) cam.copy(H).addScaledVector(facing, -2.2).addScaledVector(side, 1).add(new THREE.Vector3(0, 4, 0))
        else {
          cam.copy(H).addScaledVector(side, -4.2).addScaledVector(facing, 1.2).add(new THREE.Vector3(0, -0.8, 0))
          roll = 0.22
        }
        if (shot !== 2) at.addScaledVector(facing, 1.5)
        // Mid-leap the camera whips round him, pulling in.
        if (f >= 0.42) {
          const k = (f - 0.42) / 0.58
          const whip = Math.sin(k * Math.PI) * 1.4
          const off = cam.clone().sub(H)
          off.applyAxisAngle(new THREE.Vector3(0, 1, 0), whip).multiplyScalar(1 - 0.3 * Math.sin(k * Math.PI))
          cam.copy(H).add(off)
        }
      }
      // Nothing between the lens and him: pull in in front of any slab or cloud.
      const toCam = cam.clone().sub(H)
      const reach = toCam.length()
      ray.set(H, toCam.normalize())
      ray.far = reach
      const hit = ray.intersectObjects(blockers, true)[0]
      if (hit) cam.copy(H).addScaledVector(toCam, Math.max(hit.distance - 0.5, 1.4))
      pos.copy(cam)
      look.copy(at)
      camera.up.set(Math.sin(roll), Math.cos(roll), 0)
    }
    // A cut is not speed: only real motion counts.
    const moved = lastPos.distanceTo(pos)
    state.speed = moved > 2.5 ? 0 : moved / Math.max(dt, 1 / 120)
    lastPos.copy(pos)
    camera.position.copy(pos)
    if (state.shake > 0) camera.position.y += (Math.random() - 0.5) * 0.14 * state.shake
    if (!inScene) camera.up.set(0, 1, 0)
    camera.lookAt(look)
    camera.fov = 52 + 10 * state.leap * (run > 0 || fall > 0 || ride > 0 ? 1 : 0)
    camera.updateProjectionMatrix()
    skyUniforms.uDark.value = state.dark
    shared.uHazeK.value = 0.006 + 0.02 * state.dark
    haze.set(P.skyLow).lerp(new THREE.Color('#050506'), state.dark)
    // Into the dark, the drawing turns to the forge's: gold ink on black.
    sketch.colour = 1
    sketch.enlight = 0.45
    sketch.draw = 1
    sketch.dark = 0
    sketch.glitch = 0
    sketch.mono = 0
  }

  return { scene, camera, sketch, setSize, build, update, state }
}
