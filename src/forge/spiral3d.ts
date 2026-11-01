import * as THREE from 'three'
import { MILESTONES } from '../content/forge'
import { LEAVES } from '../content/story'
import { clamp01, easeInOut, smooth } from './ink'
import { sketchState } from './world'

// The spiral, as a thing: a nautilus lying on the open pothi, its outer wall
// tiger-striped, nacre inside, its chambers walled off by low septa. You
// start over the book, dive in, and fly the chambers down toward its eye —
// over each septum like a wall in a maze — past the milestones standing in
// the gilded chambers. Engineering lies about it on the leaf: gears, a
// compass. At its eye, the forge: an anvil, the bar on it glowing.
// Reality slips on the way (post: glitch, then the dark), and is the forge's.

const B = 0.3063 // a golden spiral: r = e^(bθ)
const TH_MAX = 8.2
const TH_MIN = -6.4
const R = (th: number) => Math.exp(B * th)

// A wall along a run of floor points: two faces and a top, each strip with
// its own vertices so the edges stay crisp (the ink finds them).
function wall(points: THREE.Vector3[], heights: number[], thick: number[], shade: (i: number, side: number) => THREE.Color) {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const strip = (corner: (i: number) => [THREE.Vector3, THREE.Vector3], side: number) => {
    const base = pos.length / 3
    points.forEach((_, i) => {
      const [a, b] = corner(i)
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
      const c = shade(i, side)
      // Growth lines: the shell laid down band by band, each a shade apart,
      // so the ink finds them as an engraver's lines. Darker toward the floor.
      const band = 0.82 + 0.1 * Math.sin(i * 1.9) + 0.08 * Math.sin(i * 0.53)
      col.push(c.r * 0.5 * band, c.g * 0.5 * band, c.b * 0.5 * band, c.r * band, c.g * band, c.b * band)
    })
    for (let i = 0; i < points.length - 1; i++) {
      const a = base + i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const normals = points.map((_, i) => {
    const q = points[Math.min(i + 1, points.length - 1)]
    const o = points[Math.max(i - 1, 0)]
    const t = q.clone().sub(o).normalize()
    return new THREE.Vector3(-t.z, 0, t.x)
  })
  // Ribs: the wall's face swells and dips along its length.
  const at = (i: number, side: number, up: boolean) => points[i].clone().addScaledVector(normals[i], (side * thick[i]) / 2 + side * thick[i] * 0.35 * Math.sin(i * 1.9)).setY(up ? heights[i] * (1 + 0.04 * Math.sin(i * 1.9)) : 0)
  strip((i) => [at(i, 1, false), at(i, 1, true)], 1)
  strip((i) => [at(i, -1, true), at(i, -1, false)], -1)
  strip((i) => [at(i, -1, true), at(i, 1, true)], 0)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function gearShape(r: number, teeth: number) {
  const s = new THREE.Shape()
  for (let k = 0; k <= teeth * 4; k++) {
    const a = (k / (teeth * 4)) * Math.PI * 2
    const rr = r * (k % 4 < 2 ? 1 : 0.86)
    if (k === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  const hole = new THREE.Path()
  hole.absarc(0, 0, r * 0.18, 0, Math.PI * 2, true)
  s.holes.push(hole)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const w = new THREE.Path()
    w.absarc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.16, 0, Math.PI * 2, true)
    s.holes.push(w)
  }
  return s
}

// The leaf's face: palm-leaf gold with fibres, the curiosity chapter written
// either side of where the shell lies.
function leafTexture() {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 512
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#EBD6A2')
  grd.addColorStop(0.5, '#E4CB90')
  grd.addColorStop(1, '#D6B97A')
  g.fillStyle = grd
  g.fillRect(0, 0, 2048, 512)
  g.strokeStyle = 'rgba(140, 100, 40, 0.07)'
  for (let y = 6; y < 512; y += 9) {
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(2048, y + Math.sin(y) * 2)
    g.stroke()
  }
  g.fillStyle = 'rgba(40, 24, 14, 0.85)'
  g.font = "34px 'Tiro Devanagari Sanskrit', serif"
  const lines = LEAVES.flatMap((l) => l.sanskrit)
  for (let i = 0; i < 7; i++) {
    const y = 90 + i * 52
    g.textAlign = 'left'
    g.fillText(lines[i % lines.length], 60, y, 560)
    g.textAlign = 'right'
    g.fillText(lines[(i + 4) % lines.length], 1988, y, 560)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function createSpiral() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#E9E1CF')
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 600)
  const sketch = sketchState()

  // Light: a warm sky, the sepia leaf below; a key from the upper left; a
  // lamp that travels with you.
  scene.add(new THREE.HemisphereLight('#FFF2DC', '#6E4A2A', 1.4))
  const key = new THREE.DirectionalLight('#FFE6C2', 2.2)
  key.position.set(-6, 10, 4)
  scene.add(key)
  const lamp = new THREE.PointLight('#FFE2B8', 0.35, 0, 1)
  scene.add(lamp)

  // ---- the pothi: boards, the leaf, the cord
  const boardMat = new THREE.MeshStandardMaterial({ color: '#6B3F22', roughness: 0.8 })
  const board = new THREE.Mesh(new THREE.BoxGeometry(96, 2, 30), boardMat)
  board.position.y = -1.6
  scene.add(board)
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(92, 0.5, 26), [
    new THREE.MeshStandardMaterial({ color: '#D9BC7E', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#D9BC7E', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#C8A866', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#D9BC7E', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#D9BC7E', roughness: 0.9 }),
  ])
  leaf.position.y = -0.26
  scene.add(leaf)
  for (const x of [-30, 30]) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 24), new THREE.MeshStandardMaterial({ color: '#3A2210' }))
    hole.position.set(x, -0.2, 0)
    scene.add(hole)
    const cord = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.2, 0), new THREE.Vector3(x + 2, 0.6, 6), new THREE.Vector3(x - 1, 0.3, 13), new THREE.Vector3(x + 3, 0.2, 19)]), 40, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: '#C4271F', roughness: 0.6 }),
    )
    scene.add(cord)
  }

  // ---- the shell
  const shell = new THREE.Group()
  scene.add(shell)
  const stripe = new THREE.Color('#A8552C')
  const ivory = new THREE.Color('#EEE3CC')
  const nacre = new THREE.Color('#E9D6CC')
  const outer: THREE.Vector3[] = []
  const hOuter: number[] = []
  const tOuter: number[] = []
  const stripes: boolean[] = []
  for (let th = TH_MIN - 2 * Math.PI; th <= TH_MAX; th += 0.04) {
    const r = R(th)
    const t = r * 0.07
    outer.push(new THREE.Vector3(Math.cos(th) * (r + t / 2), 0, Math.sin(th) * (r + t / 2)))
    hOuter.push(r * 0.42)
    tOuter.push(t)
    // Tiger stripes on the outside of the last turn and a half, flaring back.
    stripes.push(th > TH_MAX - 9 && Math.sin(th * 7 + Math.sin(th * 2) * 2) > 0.25)
  }
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })
  shell.add(new THREE.Mesh(wall(outer, hOuter, tOuter, (i, side) => (side === 1 && stripes[i] ? stripe : side === -1 ? nacre : ivory)), wallMat))
  // The septa, and the chamber floors (gilded where a milestone stands).
  const SEPT = 0.62
  const plaqueChambers = MILESTONES.map((_, i) => TH_MAX - 1.2 - i * ((TH_MAX - TH_MIN - 2.4) / MILESTONES.length))
  const floorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.0 })
  const floorPos: number[] = []
  const floorCol: number[] = []
  const gold = new THREE.Color('#E8B04A')
  const pale = new THREE.Color('#F1E6D2')
  for (let th = Math.ceil(TH_MIN / SEPT) * SEPT; th <= TH_MAX; th += SEPT) {
    const r1 = R(th)
    const r0 = R(th - 2 * Math.PI)
    const pts: THREE.Vector3[] = []
    const hs: number[] = []
    const ts: number[] = []
    for (let k = 0; k <= 10; k++) {
      const u = k / 10
      const a = th - Math.sin(u * Math.PI) * 0.42
      const r = r0 + (r1 - r0) * u
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
      hs.push(r * 0.12)
      ts.push(r * 0.03)
    }
    shell.add(new THREE.Mesh(wall(pts, hs, ts, () => nacre), wallMat))
    // The floor of the chamber ahead of this septum.
    const gilded = plaqueChambers.some((p) => Math.abs(p - (th + SEPT / 2)) < SEPT / 2)
    const c = gilded ? gold : pale
    for (let k = 0; k < 6; k++) {
      const a0 = th + (SEPT * k) / 6
      const a1 = th + (SEPT * (k + 1)) / 6
      const q = [
        [a0, R(a0 - 2 * Math.PI)],
        [a0, R(a0)],
        [a1, R(a1)],
        [a1, R(a1 - 2 * Math.PI)],
      ].map(([a, r]) => new THREE.Vector3(Math.cos(a) * r, 0.002 * r1, Math.sin(a) * r))
      for (const [i0, i1, i2] of [
        [0, 2, 1],
        [0, 3, 2],
      ]) {
        for (const v of [q[i0], q[i1], q[i2]]) {
          floorPos.push(v.x, v.y, v.z)
          floorCol.push(c.r, c.g, c.b)
        }
      }
    }
  }
  const floorGeo = new THREE.BufferGeometry()
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3))
  floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(floorCol, 3))
  floorGeo.computeVertexNormals()
  shell.add(new THREE.Mesh(floorGeo, floorMat))

  // ---- the milestones: paper plaques standing in their chambers, a seal on each
  const plaqueMat = new THREE.MeshStandardMaterial({ color: '#F6EEDD', roughness: 0.9 })
  const sealMat = new THREE.MeshStandardMaterial({ color: '#D4241C', roughness: 0.6 })
  const plaques = plaqueChambers.map((th, i) => {
    const a = th + SEPT / 2
    const r = R(a - 2 * Math.PI) + (R(a) - R(a - 2 * Math.PI)) * 0.78
    const size = r * 0.13
    const g = new THREE.Group()
    const p = new THREE.Mesh(new THREE.BoxGeometry(size * 1.6, size, size * 0.05), plaqueMat)
    p.position.y = size * 0.62
    const seal = new THREE.Mesh(new THREE.BoxGeometry(size * 0.24, size * 0.24, size * 0.07), sealMat)
    seal.position.set(size * 0.6, size * 0.95, 0)
    g.add(p, seal)
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    // Facing back up the corridor, toward whoever comes down it.
    g.lookAt(Math.cos(a + 0.6) * r * 1.2, size * 0.6, Math.sin(a + 0.6) * r * 1.2)
    shell.add(g)
    return { group: g, size, centre: new THREE.Vector3(Math.cos(a) * r, size * 0.62, Math.sin(a) * r), m: MILESTONES[i] }
  })

  // ---- engineering on the leaf: gears that turn, a compass
  const gearMat = new THREE.MeshStandardMaterial({ color: '#B98A4A', roughness: 0.5, metalness: 0.3 })
  const gears = [
    { x: -28, z: -5, r: 6, t: 18, dir: 1 },
    { x: -19.2, z: -2.6, r: 3.6, t: 11, dir: -1.64 },
    { x: 27, z: 6, r: 7, t: 20, dir: 0.7 },
    { x: 34, z: -6, r: 3.2, t: 10, dir: -1.5 },
  ].map((d) => {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(gearShape(d.r, d.t), { depth: 0.6, bevelEnabled: false }), gearMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(d.x, 0.05, d.z)
    scene.add(m)
    return { m, dir: d.dir }
  })
  const compass = new THREE.Group()
  const legMat = new THREE.MeshStandardMaterial({ color: '#8A6A44', metalness: 0.5, roughness: 0.4 })
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.04, 9, 8), legMat)
    leg.position.set(s * 1.8, 4.2, 0)
    leg.rotation.z = s * 0.42
    compass.add(leg)
  }
  compass.position.set(-36, 0, 7)
  compass.rotation.y = 0.6
  scene.add(compass)

  // ---- the forge at its eye: an anvil, the bar glowing on it, its light
  const forge = new THREE.Group()
  const anvilMat = new THREE.MeshStandardMaterial({ color: '#2A2420', roughness: 0.45, metalness: 0.6 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.42), anvilMat)
  body.position.y = 0.55
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 16), anvilMat)
  horn.rotation.z = Math.PI / 2
  horn.position.set(0.82, 0.6, 0)
  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.35, 0.3), anvilMat)
  waist.position.y = 0.2
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.5), anvilMat)
  foot.position.y = 0.06
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: '#FF7A2A', emissive: '#FF6A1A', emissiveIntensity: 0.9 }))
  bar.position.y = 0.76
  const fire = new THREE.PointLight('#FF7A2A', 3, 4, 1.5)
  fire.position.set(0, 1, 0.4)
  forge.add(body, horn, waist, foot, bar, fire)
  const forgeScale = R(TH_MIN + 0.6) * 0.35
  forge.scale.setScalar(forgeScale)
  fire.distance = 3 * forgeScale
  fire.intensity = 0.5
  forge.position.set(0, 0, 0)
  forge.rotation.y = 0.5
  scene.add(forge)

  // ---- the camera's way down
  const pos = new THREE.Vector3()
  const look = new THREE.Vector3()
  const overhead = new THREE.Vector3(0, 46, 34)
  const corridor = (th: number, out: THREE.Vector3, lift: number) => {
    const r = (R(th) + R(th - 2 * Math.PI)) / 2
    return out.set(Math.cos(th) * r, R(th) * lift, Math.sin(th) * r)
  }

  // u: 0 … 1 down the spiral.
  function update(u: number, time: number) {
    gears.forEach((g) => (g.m.rotation.z = time * 0.1 * g.dir))
    const dive = easeInOut(clamp01(u / 0.16))
    const fly = clamp01((u - 0.1) / 0.86)
    const th = TH_MAX - 0.4 - (TH_MAX - TH_MIN - 1.2) * Math.pow(fly, 0.9)
    // Circling down over the shell, a turn behind its eye, looking in:
    // the chambers spiral in below you, endlessly, toward the forge.
    corridor(th, pos, 1.05)
    corridor(th - 2.2, look, 0.0)
    look.multiplyScalar(0.45)
    // From over the book, down into the first chamber.
    if (dive < 1) {
      pos.lerpVectors(overhead, pos, dive)
      look.lerpVectors(new THREE.Vector3(0, 0, 0), look, dive)
    }
    const r = R(th)
    camera.near = Math.max(r * 0.01, 0.002)
    camera.far = 400
    camera.position.copy(pos)
    // A little sway in the flight, as if on foot.
    camera.position.y += Math.sin(time * 1.6) * r * 0.008
    camera.lookAt(look)
    camera.updateProjectionMatrix()
    lamp.position.copy(pos)
    lamp.distance = r * 3
    // The leaf's paper colour holds the world until the forge's dark takes it.
    sketch.colour = 1
    sketch.enlight = 0.15
    sketch.glitch = smooth(0.32, 0.6, u) * 0.38 * (1 - smooth(0.86, 0.96, u)) + 0.08 * smooth(0.9, 1, u)
    sketch.dark = smooth(0.62, 0.9, u)
    sketch.draw = smooth(0, 0.05, u) * 0.4 + 0.6
    bar.scale.y = 1 + 0.2 * Math.sin(time * 9)
  }

  return { scene, camera, sketch, update, plaques, overhead }
}
