import * as THREE from 'three'
import { FONT, fontsReady } from './actText'
import { LEAVES } from '../content/story'

// The companion: a pothi, a palm-leaf manuscript. A stack of long leaves
// between two carved, lacquered boards, tied with a red cord that ends in a
// gold bead. It floats beside the visitor like a drone, bobbing and leaning
// towards the cursor. For each part of the story its top board lifts, the
// leaves fan open with the Sanskrit inked on the top one, and a beam of light
// rises off them to a projection that plays the same words in English, like a
// reel of text.
//
// It is drawn in its own small scene, over the finished world, with ordinary
// lights; `story` (0 … number of leaves) is how far down the page we are.

const LEAF_W = 1.0
const LEAF_H = 0.2
const LEAF_T = 0.0042
const BOARD_T = 0.024
const LEAF_COUNT = 22

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

// A flat slab in the XZ plane (thickness up +Y, from y = 0), its uvs spread
// over the face so a texture lands the right way up.
function slab(w: number, h: number, r: number, t: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), {
    depth: t,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  })
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h)
  g.rotateX(-Math.PI / 2)
  g.computeVertexNormals()
  return g
}

const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const srgb = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ------------------------------------------------------------------ textures

// A palm leaf: pale ochre, fibres running its length, darker at the rim,
// two binding holes; and, on the leaf that is read, lines of Sanskrit.
function paintLeaf(rng: () => number, lines: string[] = []) {
  const W = 2048
  const H = 410
  const c = canvasOf(W, H)
  const g = c.getContext('2d')!
  const base = g.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0, '#cdb27a')
  base.addColorStop(0.5, '#e2cb93')
  base.addColorStop(1, '#c4a46a')
  g.fillStyle = base
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 260; i++) {
    const y = rng() * H
    g.strokeStyle = `rgba(${rng() < 0.5 ? '120, 86, 40' : '250, 236, 200'}, ${0.05 + rng() * 0.12})`
    g.lineWidth = 0.6 + rng() * 1.8
    g.beginPath()
    g.moveTo(0, y)
    g.bezierCurveTo(W * 0.3, y + (rng() - 0.5) * 6, W * 0.7, y + (rng() - 0.5) * 6, W, y + (rng() - 0.5) * 4)
    g.stroke()
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(110, 70, 30, ${0.05 + rng() * 0.08})`
    g.beginPath()
    g.ellipse(rng() * W, rng() * H, 10 + rng() * 60, 4 + rng() * 14, 0, 0, Math.PI * 2)
    g.fill()
  }
  const rim = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.55)
  rim.addColorStop(0, 'rgba(0,0,0,0)')
  rim.addColorStop(1, 'rgba(90, 55, 20, 0.45)')
  g.fillStyle = rim
  g.fillRect(0, 0, W, H)
  for (const x of [W * 0.28, W * 0.72]) {
    g.fillStyle = '#3a2410'
    g.beginPath()
    g.arc(x, H / 2, 13, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(70, 40, 15, 0.5)'
    g.lineWidth = 6
    g.stroke()
  }
  if (lines.length) {
    // Ruled margins, the way scribes framed a leaf, and the text in iron-gall ink.
    g.strokeStyle = 'rgba(140, 40, 20, 0.55)'
    g.lineWidth = 3
    for (const x of [130, W - 130]) {
      g.beginPath()
      g.moveTo(x, 40)
      g.lineTo(x, H - 40)
      g.stroke()
    }
    g.fillStyle = '#2e1a0a'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const size = lines.length > 2 ? 78 : 92
    g.font = `400 ${size}px ${FONT.deva}`
    const step = size * 1.24
    // Towards the front of the leaf: the turned leaves stand over its back edge.
    const y0 = H * 0.6 - ((lines.length - 1) * step) / 2
    lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * step, W - 340))
  }
  return c
}

// A cover board: lacquered red-brown wood, a gold-leaf border of petals, and
// a lotus at its heart.
function paintBoard(rng: () => number) {
  const W = 2048
  const H = 492
  const c = canvasOf(W, H)
  const g = c.getContext('2d')!
  const base = g.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0, '#5a1d10')
  base.addColorStop(0.5, '#6e2614')
  base.addColorStop(1, '#4a160b')
  g.fillStyle = base
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 140; i++) {
    const y = rng() * H
    g.strokeStyle = `rgba(${rng() < 0.6 ? '30, 8, 4' : '150, 70, 40'}, ${0.08 + rng() * 0.12})`
    g.lineWidth = 1 + rng() * 3
    g.beginPath()
    g.moveTo(0, y)
    g.bezierCurveTo(W * 0.35, y + (rng() - 0.5) * 30, W * 0.65, y + (rng() - 0.5) * 30, W, y + (rng() - 0.5) * 18)
    g.stroke()
  }
  const gold = (a: number) => `rgba(222, 176, 82, ${a})`
  g.strokeStyle = gold(0.95)
  g.lineWidth = 6
  g.strokeRect(46, 40, W - 92, H - 80)
  g.lineWidth = 2
  g.strokeRect(66, 60, W - 132, H - 120)
  // A running border of small petals between the rules.
  g.fillStyle = gold(0.9)
  for (let x = 90; x < W - 80; x += 34) {
    for (const y of [50, H - 50]) {
      g.beginPath()
      g.ellipse(x, y, 10, 5, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  // The lotus at the heart: two rings of petals around a seed.
  const cx = W / 2
  const cy = H / 2
  for (const [count, len, wid, a0] of [
    [16, 120, 26, 0],
    [8, 80, 30, Math.PI / 8],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = a0 + (i / count) * Math.PI * 2
      g.save()
      g.translate(cx, cy)
      g.rotate(a)
      g.beginPath()
      g.moveTo(0, 0)
      g.quadraticCurveTo(wid, -len * 0.55, 0, -len)
      g.quadraticCurveTo(-wid, -len * 0.55, 0, 0)
      g.fillStyle = gold(count === 16 ? 0.55 : 0.9)
      g.fill()
      g.restore()
    }
  }
  g.fillStyle = '#4a160b'
  g.beginPath()
  g.arc(cx, cy, 26, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = gold(1)
  g.lineWidth = 4
  g.stroke()
  // Wear: the gold rubbed thin in places.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(60, 20, 10, ${rng() * 0.35})`
    g.fillRect(rng() * W, rng() * H, 2, 2)
  }
  return c
}

// ------------------------------------------------------------------ the pothi

export function createPothi() {
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x3a2412, 1.4))
  const key = new THREE.DirectionalLight(0xffe2c0, 2.4)
  key.position.set(-2, 3, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9ff5dc, 1.6)
  rim.position.set(2, 1.5, -2)
  scene.add(rim)

  const rng = mulberry32(41)
  const book = new THREE.Group()
  const body = new THREE.Group() // the book itself; `book` carries it about
  book.add(body)
  scene.add(book)

  const boardTex = srgb(paintBoard(rng))
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.45, metalness: 0.05 })
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x3a120a, roughness: 0.6 })
  const boardGeo = slab(LEAF_W * 1.06, LEAF_H * 1.2, 0.08, BOARD_T, 0.004)
  const bottom = new THREE.Mesh(boardGeo, [boardMat, sideMat])
  body.add(bottom)

  const leafGeo = slab(LEAF_W, LEAF_H, 0.09, LEAF_T)
  const leafTex = srgb(paintLeaf(rng))
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.75 })
  const leafSide = new THREE.MeshStandardMaterial({ color: 0x9c7c48, roughness: 0.8 })
  const readCanvas = paintLeaf(rng)
  const readTex = srgb(readCanvas)
  const readMat = new THREE.MeshStandardMaterial({ map: readTex, roughness: 0.75 })

  // The stack. The leaf that is read lies a few from the top; the leaves above
  // it sit in pivots at their back edge and swing back after the lid like
  // turned pages, leaving it open and flat.
  const READ = LEAF_COUNT - 5
  const pivots: { pivot: THREE.Group; open: number }[] = []
  let y = BOARD_T + 0.004
  for (let i = 0; i < LEAF_COUNT; i++) {
    const leaf = new THREE.Mesh(leafGeo, [i === READ ? readMat : leafMat, leafSide])
    if (i > READ) {
      const pivot = new THREE.Group()
      pivot.position.set(0, y, -LEAF_H / 2)
      leaf.position.set((rng() - 0.5) * 0.006, 0, LEAF_H / 2 + (rng() - 0.5) * 0.004)
      pivot.add(leaf)
      body.add(pivot)
      pivots.push({ pivot, open: 0.95 + (i - READ - 1) * 0.27 })
    } else {
      leaf.position.set((rng() - 0.5) * 0.008, y, (rng() - 0.5) * 0.006)
      leaf.rotation.y = (rng() - 0.5) * 0.01
      body.add(leaf)
    }
    y += LEAF_T + 0.0006
  }
  // The top board, hinged at its back edge.
  const lid = new THREE.Group()
  lid.position.set(0, y + 0.002, -LEAF_H * 0.6)
  const top = new THREE.Mesh(boardGeo, [boardMat, sideMat])
  top.position.z = LEAF_H * 0.6
  lid.add(top)
  body.add(lid)
  const height = y + BOARD_T

  // The cord: once round the bundle, its tail hanging off the front with a bead.
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x9e1f14, roughness: 0.6 })
  const loopPath = new THREE.CatmullRomCurve3(
    Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2
      return new THREE.Vector3(0.18, height / 2 + Math.sin(a) * (height / 2 + 0.006), Math.cos(a) * (LEAF_H * 0.62))
    }),
    true,
  )
  const loop = new THREE.Mesh(new THREE.TubeGeometry(loopPath, 64, 0.0045, 8, true), cordMat)
  body.add(loop)
  const tailPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.18, height / 2, LEAF_H * 0.62),
    new THREE.Vector3(0.2, height * 0.1, LEAF_H * 0.68),
    new THREE.Vector3(0.24, -0.06, LEAF_H * 0.7),
    new THREE.Vector3(0.27, -0.13, LEAF_H * 0.66),
  ])
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailPath, 32, 0.004, 8, false), cordMat)
  body.add(tail)
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 14), new THREE.MeshStandardMaterial({ color: 0xd9a748, metalness: 0.9, roughness: 0.25 }))
  bead.position.set(0.27, -0.14, LEAF_H * 0.66)
  body.add(bead)
  body.position.y = -height / 2

  // ---- the companion's life
  // Where it goes for each part of the story, in screen terms (x, y from -1
  // to 1): beside the name, by the painting, by the folio, over the lotus, by
  // the dancing celestial — and a corner to rest in when it has finished.
  const PLACES = [
    [0.5, 0.12],
    [-0.27, 0.6],
    [-0.62, -0.42],
    [0.05, -0.48],
    [0.4, 0.62],
  ]
  const REST = [0.8, -0.62]
  const DEPTH = 2.4
  let place = -2 // -2: not yet arrived; -1: resting
  let speaking = false
  let shown = false
  let open = 0
  let presence = 0
  let lastTime = 0
  let written = -1
  const cur = new THREE.Vector3(3.2, 0.4, -DEPTH) // camera space, off to the right
  const from = new THREE.Vector3()
  const ctrl = new THREE.Vector3()
  const to = new THREE.Vector3()
  let travelStart = -1
  let travelTime = 1.7
  let arrived = false
  const lean = new THREE.Vector2()
  const tmp = new THREE.Vector3()
  const ndc = new THREE.Vector3()
  const anchor = { x: 0, y: 0, topX: 0, topY: 0, visible: false, arrived: false }

  fontsReady.then(() => {
    if (written >= 0) writeLeaf(written)
  })
  function writeLeaf(i: number) {
    written = i
    const fresh = paintLeaf(mulberry32(100 + i), LEAVES[i].sanskrit)
    readCanvas.getContext('2d')!.drawImage(fresh, 0, 0)
    readTex.needsUpdate = true
  }

  function placeAt(xy: number[], camera: THREE.PerspectiveCamera, out: THREE.Vector3) {
    const halfH = DEPTH * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    return out.set(xy[0] * halfH * camera.aspect, xy[1] * halfH, -DEPTH)
  }

  // Fly to a part of the story (0 …), or to rest (-1).
  let pendingPlace: number | null = null
  function goTo(i: number) {
    pendingPlace = i
  }

  // Everything is computed here, from the clock and the camera.
  function update(time: number, camera: THREE.PerspectiveCamera, pointer: THREE.Vector2, portrait: boolean) {
    const dt = Math.min(Math.max(time - lastTime, 0), 0.1)
    lastTime = time
    presence += ((shown ? 1 : 0) - presence) * Math.min(dt * 2.5, 1)
    scene.visible = presence > 0.01 || shown

    // Start a flight: a curve from where it is, swinging up and towards the
    // visitor on the way, the way a bird or a drone would take it.
    if (pendingPlace !== null) {
      place = pendingPlace
      pendingPlace = null
      const xy = place >= 0 ? PLACES[place] : REST
      placeAt(portrait ? [xy[0] * 0.55, xy[1]] : xy, camera, to)
      from.copy(cur)
      ctrl.copy(from).add(to).multiplyScalar(0.5)
      ctrl.y += 0.35 + from.distanceTo(to) * 0.15
      ctrl.z += 0.6
      travelTime = 1.2 + Math.min(from.distanceTo(to), 2.5) * 0.35
      travelStart = time
      arrived = false
      if (place >= 0) writeLeaf(place)
    }
    let bank = 0
    if (travelStart >= 0) {
      const k = Math.min((time - travelStart) / travelTime, 1)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      const a = 1 - e
      cur.set(0, 0, 0).addScaledVector(from, a * a).addScaledVector(ctrl, 2 * a * e).addScaledVector(to, e * e)
      bank = Math.sin(k * Math.PI) * Math.sign(to.x - from.x) * 0.5
      if (k >= 1) {
        travelStart = -1
        arrived = true
      }
    }

    // Hovering in place, a little alive.
    tmp.copy(cur)
    tmp.y += Math.sin(time * 1.6) * 0.03
    tmp.x += Math.sin(time * 0.9) * 0.015
    book.position.copy(tmp.applyMatrix4(camera.matrixWorld))
    const s = (portrait ? 0.26 : 0.32) * (0.4 + 0.6 * presence)
    book.scale.setScalar(s)
    lean.lerp(pointer, Math.min(dt * 2, 1))
    book.quaternion.copy(camera.quaternion)
    book.rotateX(1.05 - lean.y * 0.3 + Math.sin(time * 1.1) * 0.05)
    book.rotateY(-0.25 + lean.x * 0.4)
    book.rotateZ(bank + Math.sin(time * 0.8) * 0.05)

    // It opens a little while it speaks.
    open += ((speaking && arrived ? 0.75 : 0) - open) * Math.min(dt * (speaking ? 2.4 : 4), 1)
    lid.rotation.x = -open * 2.05
    pivots.forEach((p, k) => (p.pivot.rotation.x = -open * p.open * smooth(k * 0.08, 0.55 + k * 0.08, open)))
    loop.visible = open < 0.05
    tail.visible = loop.visible
    bead.visible = loop.visible

    // Where it is on screen, for the speech beside it and the beam to it.
    body.updateWorldMatrix(true, false)
    ndc.set(0, height * 0.5, 0).applyMatrix4(body.matrixWorld).project(camera)
    anchor.x = ndc.x
    anchor.y = ndc.y
    ndc.set(0, height, 0).applyMatrix4(body.matrixWorld).project(camera)
    anchor.topX = ndc.x
    anchor.topY = ndc.y
    anchor.visible = presence > 0.5
    anchor.arrived = arrived
  }

  return {
    scene,
    update,
    anchor,
    show(on: boolean) {
      shown = on
      if (on && place === -2) goTo(0)
    },
    goTo,
    speak(on: boolean) {
      speaking = on
    },
  }
}
