import * as THREE from 'three'
import type { Repo } from './github'
import { hash, smooth, easeInOut, clamp01 } from './ink'
import { P } from './palette'
import { prettyName } from './names'
import { projectArt } from './art'

// The sword saint. A lone figure in a long black coat stands in a pool of
// red light on the black fluid; the projects hang round him like blades
// held in the air — curved, tilted, each at its own height — and turn about
// him as you scroll. The camera drops in from straight above, circles, and
// pulls away. Hover lifts a blade; click draws it (opens the project).

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

// The figure, from behind and above: hair, a long coat with its centre slit,
// arms hanging, the red of the floor catching every lower edge. Redrawn on
// twos so the coat's hem stirs.
function drawFigure(g: CanvasRenderingContext2D, time: number) {
  const W = 512
  const H = 1024
  g.clearRect(0, 0, W, H)
  const sway = Math.sin(Math.floor(time * 8) / 8 * 1.6) * 6
  const cx = W / 2
  g.lineJoin = 'round'
  g.lineCap = 'round'
  // Legs, under the coat.
  g.fillStyle = '#0B0A0D'
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(cx + s * 22, 700)
    g.lineTo(cx + s * 52, 700)
    g.lineTo(cx + s * 58, 960)
    g.lineTo(cx + s * 24, 960)
    g.closePath()
    g.fill()
    // Shoes.
    g.beginPath()
    g.ellipse(cx + s * 42, 968, 30, 14, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = P.ember
    g.lineWidth = 3
    g.beginPath()
    g.ellipse(cx + s * 42, 968, 30, 14, 0, 0.1, Math.PI - 0.1)
    g.stroke()
  }
  // The coat: shoulders, a long body flaring to the hem, the slit up the back.
  const coat = () => {
    g.beginPath()
    g.moveTo(cx - 92, 250)
    g.quadraticCurveTo(cx, 220, cx + 92, 250)
    g.lineTo(cx + 104, 420)
    g.quadraticCurveTo(cx + 120 + sway, 640, cx + 136 + sway * 1.6, 800)
    g.lineTo(cx + 8 + sway, 790)
    g.lineTo(cx, 610)
    g.lineTo(cx - 8 + sway, 790)
    g.lineTo(cx - 136 + sway * 1.6, 800)
    g.quadraticCurveTo(cx - 120 + sway, 640, cx - 104, 420)
    g.closePath()
  }
  coat()
  const cg = g.createLinearGradient(0, 230, 0, 800)
  cg.addColorStop(0, '#1C1A20')
  cg.addColorStop(0.5, '#0E0D11')
  cg.addColorStop(1, '#2A0E0C')
  g.fillStyle = cg
  g.fill()
  g.strokeStyle = '#000'
  g.lineWidth = 3
  g.stroke()
  // Folds in the coat.
  g.strokeStyle = 'rgba(241, 235, 223, 0.12)'
  g.lineWidth = 2
  for (const [x0, x1] of [
    [-60, -90],
    [-25, -40],
    [30, 46],
    [62, 96],
  ]) {
    g.beginPath()
    g.moveTo(cx + x0, 300)
    g.quadraticCurveTo(cx + x0 * 1.1, 560, cx + x1 + sway, 780)
    g.stroke()
  }
  // Red light from the floor along the hem and the flanks.
  g.strokeStyle = P.vermilion
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(cx - 136 + sway * 1.6, 800)
  g.lineTo(cx - 8 + sway, 790)
  g.moveTo(cx + 8 + sway, 790)
  g.lineTo(cx + 136 + sway * 1.6, 800)
  g.stroke()
  g.lineWidth = 3
  g.strokeStyle = 'rgba(255, 106, 43, 0.7)'
  g.beginPath()
  g.moveTo(cx + 104, 420)
  g.quadraticCurveTo(cx + 120 + sway, 640, cx + 136 + sway * 1.6, 800)
  g.stroke()
  // Arms hanging, sleeves, hands.
  for (const s of [-1, 1]) {
    g.fillStyle = '#121116'
    g.beginPath()
    g.moveTo(cx + s * 86, 258)
    g.quadraticCurveTo(cx + s * 128, 400, cx + s * 130, 540)
    g.lineTo(cx + s * 100, 545)
    g.quadraticCurveTo(cx + s * 98, 400, cx + s * 70, 300)
    g.closePath()
    g.fill()
    g.strokeStyle = '#000'
    g.lineWidth = 2.5
    g.stroke()
    g.fillStyle = '#B9846A'
    g.beginPath()
    g.ellipse(cx + s * 116, 566, 15, 26, s * 0.1, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#2A140C'
    g.lineWidth = 2
    g.stroke()
    g.strokeStyle = 'rgba(255, 106, 43, 0.8)'
    g.lineWidth = 2.5
    g.beginPath()
    g.ellipse(cx + s * 116, 566, 15, 26, s * 0.1, 0.2, Math.PI - 0.2)
    g.stroke()
  }
  // Collar and neck.
  g.fillStyle = '#9E6E56'
  g.fillRect(cx - 20, 196, 40, 46)
  g.fillStyle = '#16141A'
  g.beginPath()
  g.moveTo(cx - 48, 238)
  g.lineTo(cx, 214)
  g.lineTo(cx + 48, 238)
  g.lineTo(cx + 40, 262)
  g.lineTo(cx - 40, 262)
  g.closePath()
  g.fill()
  // The head from behind: thick dark hair, swept, strands catching cool light.
  g.fillStyle = '#0A090C'
  g.beginPath()
  g.ellipse(cx, 150, 64, 76, 0, 0, Math.PI * 2)
  g.fill()
  for (let k = 0; k < 14; k++) {
    const a = -Math.PI + (k / 13) * Math.PI
    const x = cx + Math.cos(a) * 60
    const y = 150 + Math.sin(a) * 70
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a) * 16 + sway * 0.3, y + 20, x + Math.cos(a) * 8, y + 46 + (k % 3) * 8)
    g.lineTo(x - Math.cos(a) * 6, y + 10)
    g.closePath()
    g.fill()
  }
  g.strokeStyle = 'rgba(160, 175, 210, 0.45)'
  g.lineWidth = 2
  for (let k = 0; k < 7; k++) {
    g.beginPath()
    g.moveTo(cx - 40 + k * 12, 92 + Math.abs(k - 3) * 4)
    g.quadraticCurveTo(cx - 30 + k * 12, 140, cx - 44 + k * 14, 196)
    g.stroke()
  }
  // Ears, catching the red.
  for (const s of [-1, 1]) {
    g.fillStyle = '#A5735A'
    g.beginPath()
    g.ellipse(cx + s * 62, 160, 9, 17, 0, 0, Math.PI * 2)
    g.fill()
  }
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
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)

  const floorUniforms = { uTime: { value: 0 }, uAlpha: { value: 1 }, uShadow: { value: new THREE.Vector2(0.6, 2.4) } }
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 96),
    new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: floorFragment, uniforms: floorUniforms, transparent: true, depthWrite: false }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // The figure: a drawing on a card that always faces you.
  const figCanvas = document.createElement('canvas')
  figCanvas.width = 512
  figCanvas.height = 1024
  const figCtx = figCanvas.getContext('2d')!
  const figTex = new THREE.CanvasTexture(figCanvas)
  figTex.colorSpace = THREE.SRGBColorSpace
  const figure = new THREE.Sprite(new THREE.SpriteMaterial({ map: figTex, transparent: true }))
  figure.scale.set(1.6, 3.2, 1)
  figure.center.set(0.5, 0.03)
  scene.add(figure)

  // Embers rising off the fluid.
  const emberCount = 160
  const emberPos = new Float32Array(emberCount * 3)
  for (let i = 0; i < emberCount; i++) emberPos.set([(hash(i) - 0.5) * 16, hash(i * 3) * 8, (hash(i * 7) - 0.5) * 16], i * 3)
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

  let lastFig = -1
  // q: 0 … 1 through the orbit section.
  function render(q: number, time: number) {
    active = q > 0.08 && q < 0.9
    floorUniforms.uTime.value = time
    // The camera: down from straight above, round, and up and away.
    const drop = easeInOut(clamp01(q / 0.22))
    const away = easeInOut(clamp01((q - 0.82) / 0.18))
    const around = -0.6 + q * Math.PI * 0.9
    const dist = 14 - 4 * drop + 10 * away
    const height = 26 - 15 * drop + 18 * away
    camera.position.set(Math.sin(around) * dist * (0.05 + 0.95 * drop), height, Math.cos(around) * dist * (0.05 + 0.95 * drop) + 0.01)
    camera.lookAt(0, 1.4 * drop, 0)
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
    // The figure, redrawn on twos.
    const frame = Math.floor(time * 8)
    if (frame !== lastFig) {
      lastFig = frame
      drawFigure(figCtx, time)
      figTex.needsUpdate = true
    }
    const ep = emberGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < emberCount; i++) ep.setY(i, (hash(i * 3) * 8 + time * (0.2 + hash(i) * 0.4)) % 8)
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
