import * as THREE from 'three'
import { GOLDEN_ANGLE } from './lotus'

// Everything the act writes: chapter names, the drifting thoughts, the gold
// construction drawn behind the lotus, and the gold-leaf letters of the name.
// All of it is painted onto canvases once the webfonts are in.

export const FONT = {
  deva: '"Tiro Devanagari Sanskrit"',
  cinzel: '"Cinzel"',
  mono: '"JetBrains Mono Variable"',
  serif: '"Instrument Serif"',
  rozha: '"Rozha One"',
}

export const fontsReady = Promise.all(
  [
    `400 64px ${FONT.deva}`,
    `600 64px ${FONT.cinzel}`,
    `400 64px ${FONT.mono}`,
    `400 64px ${FONT.serif}`,
    `400 64px ${FONT.rozha}`,
  ].map((f) => document.fonts.load(f, 'Aa जि')),
).then(
  () => undefined,
  () => undefined,
)

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

const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

const srgb = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// ------------------------------------------------------------------ labels

export type Line = {
  text: string
  font: string // family, e.g. FONT.deva
  weight?: number
  size: number // px
  color: string
  spacing?: number // px of letter-spacing
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string }

// Stacked, centred lines of text with a soft glow, on a transparent canvas.
function paintLines(lines: Line[], glow: string, blur: number) {
  const pad = blur * 2 + 12
  const probe = canvasOf(4, 4).getContext('2d') as Ctx
  const fontOf = (l: Line) => `${l.weight ?? 400} ${l.size}px ${l.font}`
  const widths = lines.map((l) => {
    probe.font = fontOf(l)
    probe.letterSpacing = `${l.spacing ?? 0}px`
    return probe.measureText(l.text).width
  })
  const heights = lines.map((l) => l.size * 1.32)
  const c = canvasOf(Math.max(...widths) + pad * 2, heights.reduce((a, b) => a + b, 0) + pad * 2)
  const g = c.getContext('2d') as Ctx
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = glow
  g.shadowBlur = blur
  let y = pad
  lines.forEach((l, i) => {
    g.font = fontOf(l)
    g.letterSpacing = `${l.spacing ?? 0}px`
    g.fillStyle = l.color
    g.fillText(l.text, c.width / 2, y + heights[i] / 2)
    y += heights[i]
  })
  return c
}

// A camera-facing label `height` world units tall, painted once fonts are ready.
export function labelSprite(lines: Line[], height: number, { glow = 'rgba(255,196,120,0.55)', blur = 18 } = {}) {
  const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.0001, 0.0001, 1)
  fontsReady.then(() => {
    const c = paintLines(lines, glow, blur)
    material.map = srgb(c)
    material.needsUpdate = true
    sprite.scale.set((height * c.width) / c.height, height, 1)
  })
  return sprite
}

// ------------------------------------------------------------------ the construction

// Drawn behind the lotus as it blooms, in gold hairline: the golden-angle
// spiral the petals are set on (Vogel's sunflower, r = c√n, θ = n · 137.5°),
// the logarithmic golden spiral, circles stepping down by φ, the golden-angle
// wedge measured off a protractor ring — and around it all, Saraswati's mantra.
export function constructionTexture(size: number) {
  const c = canvasOf(size, size)
  const texture = srgb(c)
  fontsReady.then(() => {
    const g = c.getContext('2d') as Ctx
    const S = size / 2048
    const cx = size / 2
    const cy = size / 2
    const R = 860 * S
    const PHI = (1 + Math.sqrt(5)) / 2
    const ink = (a: number) => `rgba(240, 200, 120, ${a})`
    g.lineCap = 'round'

    // Circles in the ratio φ.
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = ink(k === 0 ? 0.7 : 0.4)
      g.lineWidth = (k === 0 ? 2.6 : 1.6) * S
      g.beginPath()
      g.arc(cx, cy, R * Math.pow(PHI, -k), 0, Math.PI * 2)
      g.stroke()
    }
    // A protractor ring: ticks every degree, longer every ten.
    for (let d = 0; d < 360; d++) {
      const a = (d * Math.PI) / 180
      const long = d % 10 === 0
      const r0 = R * (long ? 0.955 : 0.975)
      g.strokeStyle = ink(long ? 0.6 : 0.3)
      g.lineWidth = 1.3 * S
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      g.stroke()
    }
    // The golden-angle wedge.
    const wedge = (137.507764 * Math.PI) / 180
    g.strokeStyle = ink(0.75)
    g.lineWidth = 2 * S
    g.beginPath()
    g.moveTo(cx + R * 0.95, cy)
    g.lineTo(cx, cy)
    g.lineTo(cx + Math.cos(-wedge) * R * 0.95, cy + Math.sin(-wedge) * R * 0.95)
    g.stroke()
    g.beginPath()
    g.arc(cx, cy, R * 0.3, -wedge, 0)
    g.stroke()
    // The golden spiral: r grows by φ every quarter turn.
    g.strokeStyle = ink(0.65)
    g.lineWidth = 2.2 * S
    g.beginPath()
    const b = Math.log(PHI) / (Math.PI / 2)
    for (let th = 0; th < Math.PI * 9; th += 0.02) {
      const r = R * 0.004 * Math.exp(b * th)
      if (r > R) break
      const x = cx + Math.cos(th + 1.1) * r
      const y = cy + Math.sin(th + 1.1) * r
      if (th === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
    // Vogel's sunflower.
    const N = 520
    for (let n = 1; n <= N; n++) {
      const r = R * 0.6 * Math.sqrt(n / N)
      const a = n * GOLDEN_ANGLE
      g.fillStyle = ink(0.28 + 0.4 * (n / N))
      g.beginPath()
      g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, (1.2 + 2.6 * Math.sqrt(n / N)) * S, 0, Math.PI * 2)
      g.fill()
    }

    // The mantra around the outside, word by word so the conjuncts hold.
    const mantra = 'ॐ ऐं सरस्वत्यै नमः ॥ या कुन्देन्दुतुषारहारधवला या शुभ्रवस्त्रावृता ॥'.split(' ')
    g.font = `400 ${46 * S}px ${FONT.deva}`
    g.fillStyle = ink(0.8)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const ring = R * 1.06
    let angle = -Math.PI / 2
    const words: { w: string; width: number }[] = mantra.map((w) => ({ w, width: g.measureText(w).width }))
    const gap = 38 * S
    const total = words.reduce((s, w) => s + w.width + gap, 0)
    const scale = (Math.PI * 2 * ring) / total
    for (const { w, width } of words) {
      const span = ((width + gap) * scale) / ring
      const mid = angle + ((width / 2) * scale) / ring
      g.save()
      g.translate(cx + Math.cos(mid) * ring, cy + Math.sin(mid) * ring)
      g.rotate(mid + Math.PI / 2)
      g.fillText(w, 0, 0)
      g.restore()
      angle += span
    }

    // Annotations, like a draughtsman's.
    g.font = `400 ${30 * S}px ${FONT.mono}`
    g.fillStyle = ink(0.8)
    g.textAlign = 'left'
    g.fillText('θ = 137.507764°', cx + R * 0.33, cy - R * 0.16)
    g.fillText('r = c·√n', cx - R * 0.95, cy + R * 0.72)
    g.fillText('φ = 1.6180339887…', cx + R * 0.48, cy + R * 0.8)
    g.fillText('1 · 1 · 2 · 3 · 5 · 8 · 13 · 21 · 34 · 55', cx - R * 0.95, cy - R * 0.86)
    g.font = `400 ${40 * S}px ${FONT.deva}`
    g.fillText('पद्म', cx - R * 0.95, cy + R * 0.82)
    texture.needsUpdate = true
  })
  return texture
}

// ------------------------------------------------------------------ the name, in gold leaf

// One glyph in gold leaf: a burnished gradient, a bevel (light on the upper
// left edge, bronze on the lower right), the cracks and specks of beaten leaf,
// and a dark bronze thickness under it.
function paintGlyph(ch: string, px: number, rng: () => number, family: string) {
  const font = `400 ${px}px ${family}`
  const probe = canvasOf(4, 4).getContext('2d')!
  probe.font = font
  const advance = probe.measureText(ch).width
  const pad = px * 0.2
  const w = advance + pad * 2
  const h = px * 1.3 + pad * 2
  const base = pad + px
  const shape = canvasOf(w, h)
  const s = shape.getContext('2d')!
  s.font = font
  s.fillStyle = '#fff'
  s.fillText(ch, pad, base)

  const tinted = (color: string, dx = 0, dy = 0, cut?: [number, number]) => {
    const c = canvasOf(w, h)
    const g = c.getContext('2d')!
    g.drawImage(shape, dx, dy)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, w, h)
    if (cut) {
      g.globalCompositeOperation = 'destination-out'
      g.drawImage(shape, cut[0], cut[1])
    }
    return c
  }

  const out = canvasOf(w, h)
  const o = out.getContext('2d')!
  const depth = px * 0.022
  o.drawImage(tinted('#3a220b', 0, depth * 1.6), 0, 0)
  o.drawImage(tinted('#6b4416', 0, depth * 0.8), 0, 0)

  const leaf = canvasOf(w, h)
  const l = leaf.getContext('2d')!
  const grad = l.createLinearGradient(0, base - px * 0.78, 0, base + px * 0.12)
  grad.addColorStop(0, '#fff3cc')
  grad.addColorStop(0.3, '#ecc46c')
  grad.addColorStop(0.52, '#a8722c')
  grad.addColorStop(0.62, '#c99442')
  grad.addColorStop(0.85, '#f4d88e')
  grad.addColorStop(1, '#b07a30')
  l.fillStyle = grad
  l.fillRect(0, 0, w, h)
  // Beaten leaf: cracks and specks.
  for (let i = 0; i < 46; i++) {
    l.strokeStyle = `rgba(110, 70, 22, ${0.15 + rng() * 0.25})`
    l.lineWidth = 0.6 + rng() * 0.9
    l.beginPath()
    let x = rng() * w
    let y = rng() * h
    l.moveTo(x, y)
    for (let k = 0; k < 4; k++) {
      x += (rng() - 0.5) * px * 0.12
      y += (rng() - 0.5) * px * 0.12
      l.lineTo(x, y)
    }
    l.stroke()
  }
  for (let i = 0; i < 900; i++) {
    l.fillStyle = rng() < 0.5 ? 'rgba(255, 246, 214, 0.35)' : 'rgba(90, 54, 14, 0.2)'
    l.fillRect(rng() * w, rng() * h, 1.4, 1.4)
  }
  const d = Math.max(1.5, px * 0.012)
  l.drawImage(tinted('rgba(255, 250, 225, 0.85)', 0, 0, [d, d]), 0, 0)
  l.drawImage(tinted('rgba(70, 40, 10, 0.7)', 0, 0, [-d, -d]), 0, 0)
  l.globalCompositeOperation = 'destination-in'
  l.drawImage(shape, 0, 0)
  o.drawImage(leaf, 0, 0)
  return { canvas: out, advance, pad, base }
}

const letterVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const letterFragment = /* glsl */ `
uniform sampler2D tMap;
uniform float uAlpha;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tMap, vUv);
  // A slow burnish of light passing across the leaf.
  float x = vUv.x * 0.8 + vUv.y * 0.5 - (fract(uTime * 0.07 + uSeed) * 3.0 - 0.8);
  float sheen = exp(-x * x * 18.0);
  vec3 col = t.rgb * (1.0 + sheen * 0.9);
  gl_FragColor = vec4(col, t.a * uAlpha);
}
`

export type Letter = { mesh: THREE.Mesh; rest: THREE.Vector3; size: THREE.Vector3; uniforms: { uAlpha: { value: number }; uTime: { value: number }; uSeed: { value: number } } }

const leafMaterial = (seed: number) => {
  const uniforms = { tMap: { value: null as THREE.Texture | null }, uAlpha: { value: 0 }, uTime: { value: 0 }, uSeed: { value: seed } }
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: letterVertex, fragmentShader: letterFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  return { material, uniforms }
}

// The bar itself, beaten from the same leaf.
function paintBar(w: number, h: number, rng: () => number) {
  const c = canvasOf(w, h)
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#fff2c6')
  grad.addColorStop(0.35, '#e6bc62')
  grad.addColorStop(0.7, '#a26c28')
  grad.addColorStop(1, '#5a3810')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(255, 246, 214, 0.35)' : 'rgba(90, 54, 14, 0.25)'
    g.fillRect(rng() * w, rng() * h, 1.5, 1.5)
  }
  // Rounded, slightly flared ends, like a brushed headline.
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = '#000' // the mask must be opaque, or the whole bar turns faint
  g.beginPath()
  g.moveTo(h * 0.2, 0)
  g.lineTo(w - h * 0.2, 0)
  g.quadraticCurveTo(w, 0, w, h * 0.5)
  g.quadraticCurveTo(w, h, w - h * 0.4, h)
  g.lineTo(h * 0.4, h)
  g.quadraticCurveTo(0, h, 0, h * 0.5)
  g.quadraticCurveTo(0, 0, h * 0.2, 0)
  g.fill()
  return c
}

// The name in gold leaf, set the way Devanagari is: the letters hang from a
// single shirorekha, a headline bar running across their tops at the
// x-height (the capital rises above it like a matra), with the Devanagari
// spelling beneath. Each letter knows where it comes to rest relative to the
// word's centre on its baseline; `height` is the em height.
export function goldName(word: string, deva: string, height: number) {
  const group = new THREE.Group()
  const letters: Letter[] = []
  const px = 420
  const k = height / px
  const rng = mulberry32(17)
  const family = FONT.deva
  for (let i = 0; i < word.length; i++) {
    const { material, uniforms } = leafMaterial(i * 0.17)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    mesh.visible = false
    group.add(mesh)
    letters.push({ mesh, rest: new THREE.Vector3(), size: new THREE.Vector3(1, 1, 1), uniforms })
  }
  const barLeaf = leafMaterial(0.9)
  // Anchored at its left end, so it can draw itself across.
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), barLeaf.material)
  bar.visible = false
  group.add(bar)
  const devanagari = labelSprite([{ text: deva, font: FONT.deva, size: 150, color: '#f1d49c' }], height * 0.62, {
    glow: 'rgba(120, 70, 20, 0.6)',
    blur: 14,
  })
  group.add(devanagari)
  // Filled in once the font is in: the bar's span and height, in world units.
  const metrics = { width: 0, xHeight: 0, barHeight: 0 }

  fontsReady.then(() => {
    const probe = canvasOf(4, 4).getContext('2d')!
    probe.font = `400 ${px}px ${family}`
    const total = probe.measureText(word).width
    const xh = probe.measureText('x').actualBoundingBoxAscent || px * 0.46
    letters.forEach((L, i) => {
      const glyph = paintGlyph(word[i], px, rng, family)
      const start = probe.measureText(word.slice(0, i)).width
      const { width: w, height: h } = glyph.canvas
      ;(L.mesh.material as THREE.ShaderMaterial).uniforms.tMap.value = srgb(glyph.canvas)
      L.size.set(w * k, h * k, 1)
      L.rest.set((start - glyph.pad + w / 2 - total / 2) * k, (glyph.base - h / 2) * k, 0)
    })
    metrics.width = total * k * 1.06
    metrics.xHeight = xh * k
    metrics.barHeight = px * 0.075 * k
    barLeaf.uniforms.tMap.value = srgb(paintBar(Math.round(total * 1.06), Math.round(px * 0.075), rng))
    barLeaf.material.uniforms.tMap.value = barLeaf.uniforms.tMap.value
  })
  return { group, letters, bar, barUniforms: barLeaf.uniforms, devanagari, metrics }
}
