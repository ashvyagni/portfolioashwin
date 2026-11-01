import * as THREE from 'three'
import type { Repo } from './github'
import { hash, smooth, easeInOut, clamp01 } from './ink'
import { P } from './palette'
import { prettyName } from './names'
import { projectArt } from './art'
import { createHero } from './hero'

// The library well. A round reading room sunk deep, its shelves climbing in
// tiers into the dark, lamps on the posts, books loose and flapping up the
// shaft. At the bottom, in a pool of red light, Ashwin stands in his long
// coat; the projects hang round him like blades held in the air — curved,
// tilted, each at its own height — and turn about him as you scroll. He
// looks at the one you point at. The camera drops in from high in the well,
// circles, and rises back up it. Hover lifts a blade; click opens it.

const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六']
const SANS = "'Inter Tight Variable', sans-serif"
const MONO = "'JetBrains Mono Variable', monospace"
const SERIF = "'Instrument Serif', serif"

function wrapLines(g: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const out: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w
    if (g.measureText(next).width > width && cur) {
      out.push(cur)
      cur = w
    } else cur = next
  }
  if (cur) out.push(cur)
  if (out.length > max) {
    out.length = max
    out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…'
  }
  return out
}

// A card, designed: a kanji numeral on a vermilion tab, the language and the
// year in mono, the name large, the description, and a halftone motif seeded
// by the name (so each project has a face of its own).
function cardTexture(repo: Repo, i: number) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 640
  const g = c.getContext('2d')!
  const dark = i % 3 === 1
  const bg = dark ? '#0F0E12' : '#ECE6DA'
  const fg = dark ? P.bone : '#141210'
  g.fillStyle = bg
  g.fillRect(0, 0, 1024, 640)
  // The motif: a field of dots swelling in a wave whose shape comes from the name.
  const seed = [...repo.name].reduce((s, ch) => s + ch.charCodeAt(0), 0)
  const fx = 0.01 + hash(seed) * 0.03
  const fy = 0.01 + hash(seed * 3) * 0.03
  for (let y = 40; y < 600; y += 16) {
    for (let x = 560; x < 1000; x += 16) {
      const v = 0.5 + 0.5 * Math.sin(x * fx + Math.cos(y * fy + seed) * 2.4) * Math.cos(y * fy * 1.3 - seed)
      const r = 1 + v * v * 7
      g.fillStyle = v > 0.82 ? P.vermilion : dark ? 'rgba(241,235,223,0.55)' : 'rgba(20,18,16,0.7)'
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
  }
  // A fade from the motif to the words.
  const fade = g.createLinearGradient(520, 0, 700, 0)
  fade.addColorStop(0, bg)
  fade.addColorStop(1, dark ? 'rgba(15,14,18,0)' : 'rgba(236,230,218,0)')
  g.fillStyle = fade
  g.fillRect(500, 0, 220, 640)
  // The tab.
  g.fillStyle = P.vermilion
  g.fillRect(0, 0, 112, 140)
  g.fillStyle = '#FFF4EC'
  g.font = `400 ${KANJI[i].length > 1 ? 52 : 72}px ${SERIF}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(KANJI[i] ?? String(i + 1), 56, 72)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillStyle = dark ? P.gold : P.vermilion
  g.font = `500 22px ${MONO}`
  g.fillText(`${String(i + 1).padStart(2, '0')}  ·  ${(repo.language ?? 'MIXED').toUpperCase()}  ·  ${new Date(repo.pushed_at).getFullYear()}`, 140, 62)
  g.fillStyle = fg
  let size = 92
  const name = prettyName(repo.name)
  g.font = `500 ${size}px ${SANS}`
  while (g.measureText(name).width > 820 && size > 40) {
    size -= 4
    g.font = `500 ${size}px ${SANS}`
  }
  g.fillText(name, 40, 250)
  g.font = `400 30px ${SANS}`
  g.fillStyle = dark ? 'rgba(241,235,223,0.7)' : 'rgba(20,18,16,0.72)'
  wrapLines(g, repo.description ?? 'Open to read its README.', 560, 3).forEach((l, k) => g.fillText(l, 40, 330 + k * 42))
  g.strokeStyle = dark ? 'rgba(241,235,223,0.25)' : 'rgba(20,18,16,0.25)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(40, 540)
  g.lineTo(984, 540)
  g.stroke()
  g.fillStyle = fg
  g.font = `500 22px ${MONO}`
  g.fillText('OPEN  ↗', 40, 590)
  g.textAlign = 'right'
  g.fillText(repo.fork ? 'FORK' : 'FROM GITHUB', 984, 590)
  g.strokeStyle = fg
  g.lineWidth = 6
  g.strokeRect(3, 3, 1018, 634)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return { t, c, g, bg }
}

// When the project's print is ready, it takes the card's right half.
function withArt(card: ReturnType<typeof cardTexture>, repo: Repo, ink: [string, string]) {
  projectArt(repo, ink, 160, 200).then((art) => {
    const { g, c, bg, t } = card
    g.save()
    g.beginPath()
    g.rect(560, 6, c.width - 566, 528)
    g.clip()
    g.fillStyle = '#0B0A0D'
    g.fillRect(560, 6, c.width - 566, 528)
    g.drawImage(art, 560, 6, c.width - 566, 528)
    const fade = g.createLinearGradient(560, 0, 700, 0)
    fade.addColorStop(0, bg)
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = fade
    g.fillRect(560, 6, 140, 528)
    g.restore()
    t.needsUpdate = true
  })
}

function cardBack() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const g = c.getContext('2d')!
  g.fillStyle = '#121014'
  g.fillRect(0, 0, 256, 160)
  g.strokeStyle = P.vermilion
  g.lineWidth = 4
  g.strokeRect(6, 6, 244, 148)
  g.fillStyle = 'rgba(212, 36, 28, 0.6)'
  g.font = `40px ${SERIF}`
  g.textAlign = 'center'
  g.fillText('鍛', 128, 94)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const floorVertex = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const floorFragment = /* glsl */ `
  uniform float uTime;
  uniform float uAlpha;
  uniform vec2 uShadow;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float light = exp(-r * r * 0.028);
    vec3 col = mix(vec3(0.16, 0.02, 0.02), vec3(0.93, 0.34, 0.26), light);
    // The figure's long shadow, falling away from the light above and behind.
    vec2 q = vP - uShadow * 0.5;
    vec2 dir = normalize(uShadow);
    float along = dot(q, dir);
    float across = dot(q, vec2(-dir.y, dir.x));
    float shadow = (1.0 - smoothstep(0.35, 0.65, abs(across) / (0.9 - 0.25 * clamp(along / 3.0, -1.0, 1.0)))) * (1.0 - smoothstep(2.6, 3.4, abs(along)));
    col *= 1.0 - 0.75 * shadow;
    // Ripples spreading slowly on the fluid.
    col *= 0.94 + 0.06 * sin(r * 3.0 - uTime * 0.8);
    float a = smoothstep(9.0, 2.0, r) * uAlpha;
    gl_FragColor = vec4(col * a, a);
  }
`

export function createOrbit(canvas: HTMLCanvasElement, onOpen: (repo: Repo) => void, onHover: (on: boolean) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 260)

  const floorUniforms = { uTime: { value: 0 }, uAlpha: { value: 1 }, uShadow: { value: new THREE.Vector2(0.6, 2.4) } }
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 96),
    new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: floorFragment, uniforms: floorUniforms, transparent: true, depthWrite: false }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // Ashwin, in the round: the same figure who ran the sky, inked.
  const hero = createHero({ toon: true })
  hero.group.scale.setScalar(1.55)
  scene.add(hero.group)
  const still = new THREE.Vector3()

  // Light: the red pool from below, lamp-gold from the shelves, a cold
  // shaft from far up the well.
  scene.add(new THREE.HemisphereLight('#3A3550', '#2A0806', 0.7))
  const pool = new THREE.PointLight('#FF4A2A', 40, 26, 1.6)
  pool.position.set(0, 0.4, 0)
  scene.add(pool)
  const shaft = new THREE.DirectionalLight('#BFD0FF', 0.9)
  shaft.position.set(2, 30, 3)
  scene.add(shaft)
  const warm = new THREE.PointLight('#FFB45A', 30, 40, 1.4)
  warm.position.set(0, 9, 0)
  scene.add(warm)
  scene.fog = new THREE.Fog('#070608', 18, 58)

  // The well: tiers of shelves round a drum, posts between the bays, a
  // gallery rail at each floor, and the floor itself, dark boards.
  const R = 16
  const TIER = 3.1
  const TIERS = 15
  const wood = new THREE.MeshStandardMaterial({ color: '#2B1A12', roughness: 0.85 })
  const well = new THREE.Group()
  scene.add(well)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 0.5, 96), new THREE.MeshStandardMaterial({ color: '#120C0A', roughness: 0.95 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  well.add(ground)
  // Brass rings set in the boards, a reading-room medallion round him.
  for (const [r, w] of [[2.4, 0.03], [2.6, 0.012], [6.2, 0.03], [9.4, 0.05], [9.7, 0.015]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r + w, 160, 1), new THREE.MeshStandardMaterial({ color: '#9A7A44', metalness: 0.7, roughness: 0.35 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.01
    well.add(ring)
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.6, TIER * TIERS + 4, 96, 1, true), new THREE.MeshStandardMaterial({ color: '#0D0907', roughness: 1, side: THREE.BackSide }))
  drum.position.y = (TIER * TIERS) / 2
  well.add(drum)
  const BAYS = 28
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, TIER * TIERS + 4, 0.5), wood, BAYS)
  const m4 = new THREE.Matrix4()
  const q4 = new THREE.Quaternion()
  const v4 = new THREE.Vector3()
  const s4 = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  for (let b = 0; b < BAYS; b++) {
    const a = (b / BAYS) * Math.PI * 2
    q4.setFromAxisAngle(up, a)
    m4.compose(v4.set(Math.sin(a) * (R - 0.1), (TIER * TIERS) / 2, Math.cos(a) * (R - 0.1)), q4, s4.set(1, 1, 1))
    posts.setMatrixAt(b, m4)
  }
  well.add(posts)
  for (let t = 0; t <= TIERS; t++) {
    // The shelf board under each row, and a gallery every third.
    const board = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.08, 96, 1, true), wood)
    board.position.y = t * TIER + 0.02
    well.add(board)
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R - 0.75, 0.05, 6, 120), wood)
    lip.rotation.x = Math.PI / 2
    lip.position.y = t * TIER
    well.add(lip)
    if (t % 3 === 0 && t > 0) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 1.3, 0.04, 6, 140), new THREE.MeshStandardMaterial({ color: '#8A6A3A', metalness: 0.6, roughness: 0.4 }))
      rail.rotation.x = Math.PI / 2
      rail.position.y = t * TIER + 1.05
      well.add(rail)
      const deck = new THREE.Mesh(new THREE.RingGeometry(R - 1.35, R, 120, 1), wood)
      deck.rotation.x = -Math.PI / 2
      deck.position.y = t * TIER + 0.01
      well.add(deck)
    }
  }
  // The books: spines inward, each its own height, width and lean; leather
  // in browns, oxbloods and inks, with now and then a vermilion or gilt spine.
  const leathers = ['#3B2016', '#4A2A1A', '#2A1B14', '#5A1E16', '#1E2430', '#2D2A22', '#5B3A1E', '#3A1414', '#22301F', '#6B4A2A']
  const books: { a: number; y: number; w: number; h: number; d: number; lean: number; c: string }[] = []
  for (let t = 0; t < TIERS; t++) {
    let a = 0
    let k = t * 1000
    while (a < Math.PI * 2 - 0.012) {
      k++
      const w = (0.09 + hash(k) * 0.14) / R
      // Gaps between the bays, and a gap now and then where a book was taken.
      const bay = (a / (Math.PI * 2)) * BAYS
      if (bay - Math.floor(bay) < 0.04 || hash(k * 1.7) < 0.03) {
        a += w * 1.8
        continue
      }
      const h = 1.6 + hash(k * 2.3) * 1.0
      const r = hash(k * 3.1)
      books.push({ a: a + w / 2, y: t * TIER + 0.06, w: w * R * 0.94, h, d: 0.7 + hash(k * 4.7) * 0.25, lean: hash(k * 5.9) < 0.05 ? 0.25 : 0, c: r > 0.97 ? P.vermilion : r > 0.94 ? '#B08A3E' : leathers[Math.floor(hash(k * 6.1) * leathers.length)] })
      a += w
    }
  }
  const bookMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), books.length)
  const col = new THREE.Color()
  books.forEach((bk, i) => {
    q4.setFromAxisAngle(up, bk.a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bk.lean))
    m4.compose(v4.set(Math.sin(bk.a) * (R - 0.45), bk.y, Math.cos(bk.a) * (R - 0.45)), q4, s4.set(bk.w, bk.h, bk.d))
    bookMesh.setMatrixAt(i, m4)
    bookMesh.setColorAt(i, col.set(bk.c).multiplyScalar(0.8 + hash(i * 9.3) * 0.4))
  })
  well.add(bookMesh)
  // Lamps on the posts, every other tier: a glass globe lit from within.
  const lampSpots: THREE.Vector3[] = []
  for (let b = 0; b < BAYS; b += 2) for (let t = 1; t < TIERS; t += 2) {
    const a = ((b + (t % 4 === 1 ? 0 : 1)) / BAYS) * Math.PI * 2
    lampSpots.push(new THREE.Vector3(Math.sin(a) * (R - 0.9), t * TIER + 2.2, Math.cos(a) * (R - 0.9)))
  }
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: '#FFD08A' }), lampSpots.length)
  const halo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshBasicMaterial({ color: '#FF9A3A', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }), lampSpots.length)
  lampSpots.forEach((p, i) => {
    m4.compose(p, q4.identity(), s4.set(1, 1, 1))
    lamps.setMatrixAt(i, m4)
    halo.setMatrixAt(i, m4)
  })
  well.add(lamps, halo)

  // Loose books, flapping up the well like birds, each on its own spiral.
  const flock = Array.from({ length: 22 }, (_, i) => {
    const g = new THREE.Group()
    const cover = new THREE.MeshStandardMaterial({ color: i % 5 === 0 ? P.vermilion : leathers[i % leathers.length], roughness: 0.6, side: THREE.DoubleSide })
    const paper = new THREE.MeshStandardMaterial({ color: '#E9DFC8', roughness: 0.9, side: THREE.DoubleSide })
    const wing = (s: number) => {
      const hinge = new THREE.Group()
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.7).translate(0.25, 0, 0), cover)
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.64).translate(0.24, 0.035, 0), paper)
      hinge.add(c, p)
      hinge.scale.x = s
      g.add(hinge)
      return hinge
    }
    const L = wing(-1)
    const Rw = wing(1)
    well.add(g)
    return { g, L, R: Rw, r: 5 + hash(i * 1.3) * 7, a: hash(i * 2.1) * Math.PI * 2, y: hash(i * 3.7) * 40 + 6, sp: 0.1 + hash(i * 4.4) * 0.12, flap: 5 + hash(i * 5.5) * 4 }
  })

  // Dust in the lamp light, rising slow.
  const emberCount = 320
  const emberPos = new Float32Array(emberCount * 3)
  for (let i = 0; i < emberCount; i++) emberPos.set([(hash(i) - 0.5) * 22, hash(i * 3) * 30, (hash(i * 7) - 0.5) * 22], i * 3)
  const emberGeo = new THREE.BufferGeometry()
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3))
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: P.gold, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false }))
  scene.add(embers)

  type Card = { repo: Repo; group: THREE.Group; angle: number; height: number; tilt: number; lean: number; radius: number; hover: number }
  let cards: Card[] = []
  const back = cardBack()
  const RING = 5.2
  const BEND = 4.2
  const ARC = 0.62

  function setRepos(repos: Repo[], ink: [string, string] = ['#D4241C', '#F2B24A']) {
    cards.forEach((c) => scene.remove(c.group))
    cards = repos.map((repo, i) => {
      // A curved blade: a slice of a cylinder, bulging toward its own front (+z).
      const geo = new THREE.CylinderGeometry(BEND, BEND, ARC * BEND * 0.625, 24, 1, true, -ARC / 2, ARC)
      geo.translate(0, 0, -BEND)
      const tex = cardTexture(repo, i)
      withArt(tex, repo, ink)
      const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex.t, side: THREE.FrontSide }))
      const behind = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide }))
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 40), new THREE.LineBasicMaterial({ color: '#0A0909' }))
      const group = new THREE.Group()
      group.add(front, behind, edges)
      front.userData.repo = repo
      behind.userData.repo = repo
      scene.add(group)
      return {
        repo,
        group,
        angle: (i / repos.length) * Math.PI * 2,
        height: 0.5 + hash(i * 3.3) * 3.6,
        tilt: (hash(i * 5.1) - 0.5) * 0.5,
        lean: (hash(i * 7.7) - 0.5) * 0.45,
        radius: RING * (0.9 + hash(i * 2.9) * 0.3),
        hover: 0,
      }
    })
  }

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2(9, 9)
  let hovered: Card | null = null
  let active = false
  const onMove = (e: PointerEvent) => {
    mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
  }
  const onClick = () => {
    if (active && hovered) onOpen(hovered.repo)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('click', onClick)

  function setSize(w: number, h: number) {
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w < h ? 62 : 42
    camera.updateProjectionMatrix()
  }

  // q: 0 … 1 through the orbit section.
  function render(q: number, time: number) {
    active = q > 0.08 && q < 0.9
    floorUniforms.uTime.value = time
    // The camera: down from straight above, round, and up and away.
    const drop = easeInOut(clamp01(q / 0.22))
    const away = easeInOut(clamp01((q - 0.82) / 0.18))
    const around = -0.6 + q * Math.PI * 0.9
    const dist = 12 - 3 * drop - 4 * away
    const height = 30 - 22 * drop + 29 * away
    camera.position.set(Math.sin(around) * dist * (0.05 + 0.95 * drop), height, Math.cos(around) * dist * (0.05 + 0.95 * drop) + 0.01)
    camera.lookAt(0, 2.2 * drop + 8 * away, 0)
    floorUniforms.uShadow.value.set(-Math.sin(around) * 2.4, -Math.cos(around) * 2.4)
    // The blades turn about him, each at its own height and tilt, always
    // turned to face you, bobbing and swaying on its own.
    const facing = new THREE.Vector3()
    cards.forEach((c, i) => {
      const a = c.angle + q * Math.PI * 2.2 + time * 0.03
      const y = c.height + Math.sin(time * 0.7 + i) * 0.12 + c.hover * 0.3
      c.group.position.set(Math.sin(a) * c.radius, y, Math.cos(a) * c.radius)
      facing.set(camera.position.x, y + (camera.position.y - y) * 0.35, camera.position.z)
      c.group.lookAt(facing)
      c.group.rotateZ(c.lean + Math.sin(time * 0.5 + i * 2) * 0.03)
      c.group.rotateX(c.tilt * 0.4)
      c.group.scale.setScalar(0.8 * (1 + c.hover * 0.1))
      c.hover += ((hovered === c ? 1 : 0) - c.hover) * 0.15
    })
    // Hover.
    if (active) {
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(cards.map((c) => c.group), true)
      const hit = hits.find((h) => h.object.userData.repo)
      const next = hit ? (cards.find((c) => c.repo === hit.object.userData.repo) ?? null) : null
      if (next !== hovered) {
        hovered = next
        onHover(!!hovered)
      }
    } else if (hovered) {
      hovered = null
      onHover(false)
    }
    // Ashwin: idle, his head turned to the blade you point at.
    hero.update(1 / 60, 'idle', 0, still, time, 6)
    let turn = 0
    if (hovered) {
      const p = hovered.group.position
      turn = Math.atan2(p.x, p.z)
    } else turn = Math.atan2(camera.position.x, camera.position.z) * 0.5
    const body = hero.group.rotation.y
    let dh = turn - body
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    hero.group.rotation.y += Math.max(-0.02, Math.min(0.02, dh * 0.02))
    const want = Math.max(-1, Math.min(1, dh))
    hero.head.rotation.y += (want - hero.head.rotation.y) * 0.08
    flock.forEach((b, i) => {
      const a = b.a + time * b.sp
      const y = (b.y + time * 0.6 * b.sp * 6) % 46 + 4
      b.g.position.set(Math.sin(a) * b.r, y, Math.cos(a) * b.r)
      b.g.rotation.set(0.25, a + Math.PI / 2, Math.sin(time + i) * 0.2)
      const f = Math.sin(time * b.flap + i) * 0.7 + 0.5
      b.L.rotation.z = f
      b.R.rotation.z = -f
    })
    const ep = emberGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < emberCount; i++) ep.setY(i, (hash(i * 3) * 30 + time * (0.2 + hash(i) * 0.4)) % 30)
    ep.needsUpdate = true
    floorUniforms.uAlpha.value = smooth(0, 0.15, q) * (1 - smooth(0.9, 1, q))
    renderer.render(scene, camera)
  }

  return {
    setSize,
    setRepos,
    render,
    dispose() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('click', onClick)
      renderer.dispose()
    },
  }
}
