import {
  ACT_LENGTH,
  BRUSH_AT,
  CHAPTERS,
  CHAPTER_AT,
  DEVA_AT,
  DROP_START,
  IMPACT_AT,
  SIDE_START,
  JIGYASA_AT,
  NOTES_AT,
  PAINT_AT,
  PAINT_LENGTH,
  VINES_AT,
  type createAct,
} from './act'

// The drawn layer over the act: everything a hand puts on the page that the
// render itself cannot — writing, notes in the margin, vines climbing out of
// the water, and the brush that paints the name. It is one 2D sheet, laid
// over the canvas with a multiply blend, so its ink and watercolour sit *in*
// the paper the post pass draws, not on a sheet of glass above it.
//
// All of it is a function of act time, like the act: scrub, skip or arrive
// and it is simply right. The lines boil on twos, as the act's do.

type Act = ReturnType<typeof createAct>
type Pt = { x: number; y: number }
type Path = { pts: Pt[]; cum: number[]; len: number }

export const NAME = 'Ashwin'
const NAME_DEVA = 'अश्विन'
const INK = '#24160e'
const GRAPHITE = 'rgba(52, 46, 42, 0.85)'
const HAND_DEVA = "'Kalam', 'Tiro Devanagari Sanskrit', serif"
const HAND = "'Reenie Beanie', 'Kalam', cursive"
const BRUSH_FONT = "'Zhi Mang Xing', 'Kalam', cursive"

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
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
function pathOf(pts: Pt[]): Path {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return { pts, cum, len: cum[cum.length - 1] }
}
// Where along a path, at a fraction of its length.
function pointAt(p: Path, u: number) {
  const d = clamp01(u) * p.len
  let i = 1
  while (i < p.pts.length - 1 && p.cum[i] < d) i++
  const a = p.pts[i - 1]
  const b = p.pts[i]
  const k = (d - p.cum[i - 1]) / Math.max(p.cum[i] - p.cum[i - 1], 1e-6)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

// ------------------------------------------------------------------ vines

type Leaf = { u: number; side: number; size: number }
type Flower = { u: number; kind: 'lotus' | 'blossom' | 'bud'; size: number; hue: number }
type Vine = { path: Path; start: number; grow: number; width: number; leaves: Leaf[]; flowers: Flower[]; tendril: Path | null; tendrilU: number }

function makeVines(W: number, H: number): Vine[] {
  const rng = mulberry32(31)
  const portrait = W < H
  const m = Math.min(W, H)
  // Out of the water at the foot of the frame, up the sides: never across the
  // middle, where the name and the story stand.
  const roots = portrait
    ? [
        { x: 0.03, h: 0.42, lean: 0.25 },
        { x: 0.11, h: 0.27, lean: -0.1 },
        { x: 0.97, h: 0.46, lean: -0.25 },
        { x: 0.89, h: 0.3, lean: 0.1 },
      ]
    : [
        { x: 0.025, h: 0.8, lean: 0.35 },
        { x: 0.075, h: 0.56, lean: -0.15 },
        { x: 0.14, h: 0.34, lean: 0.25 },
        { x: 0.975, h: 0.84, lean: -0.35 },
        { x: 0.925, h: 0.6, lean: 0.15 },
        { x: 0.86, h: 0.36, lean: -0.25 },
      ]
  return roots.map((r, i) => {
    const pts: Pt[] = []
    const len = r.h * H
    const steps = 70
    let x = r.x * W + (rng() - 0.5) * 12
    let y = H + 8
    const seed = rng() * 10
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      pts.push({ x, y })
      // Mostly up; a lean, a slow S, and the last stretch curling over.
      const curl = smooth(0.82, 1, u) * 2.4 * Math.sign(r.lean || 1)
      const a = -Math.PI / 2 + r.lean * u + 0.32 * Math.sin(u * Math.PI * 2.2 + seed) + curl
      x += Math.cos(a) * (len / steps)
      y += Math.sin(a) * (len / steps)
    }
    const path = pathOf(pts)
    const leaves: Leaf[] = []
    for (let u = 0.12 + rng() * 0.05; u < 0.84; u += 0.09 + rng() * 0.06) leaves.push({ u, side: leaves.length % 2 ? 1 : -1, size: m * (0.034 + rng() * 0.016) * (1 - 0.35 * u) })
    const tall = r.h > 0.5
    const flowers: Flower[] = [{ u: 0.8, kind: tall ? 'lotus' : 'blossom', size: m * (tall ? 0.065 : 0.04), hue: rng() }]
    if (tall) flowers.push({ u: 0.48 + rng() * 0.1, kind: 'blossom', size: m * 0.034, hue: rng() })
    flowers.push({ u: 0.3 + rng() * 0.1, kind: 'bud', size: m * 0.022, hue: rng() })
    // A tendril off one node, coiling.
    let tendril: Path | null = null
    const tendrilU = 0.4 + rng() * 0.25
    {
      const base = pointAt(path, tendrilU)
      const tp: Pt[] = []
      let a = base.angle + (r.lean > 0 ? 0.9 : -0.9)
      let tx = base.x
      let ty = base.y
      const n = 34
      for (let k = 0; k <= n; k++) {
        tp.push({ x: tx, y: ty })
        const step = m * 0.004 * (1 - (k / n) * 0.6)
        a += (r.lean > 0 ? 1 : -1) * (0.05 + 0.3 * Math.pow(k / n, 2))
        tx += Math.cos(a) * step * 1.6
        ty += Math.sin(a) * step * 1.6
      }
      tendril = pathOf(tp)
    }
    return { path, start: VINES_AT + i * 0.32, grow: 2.6 + rng() * 0.8, width: m * (0.0045 + 0.002 * r.h), leaves, flowers, tendril, tendrilU }
  })
}

// ------------------------------------------------------------------ the layer

export function createSketchLayer(act: Act) {
  const canvas = document.createElement('canvas')
  canvas.className = 'sketch-layer'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  let W = 1
  let H = 1
  let dpr = 1
  let vines: Vine[] = []
  let boil = 0
  const textCache = new Map<string, HTMLCanvasElement>()
  let nameImage: HTMLCanvasElement | null = null
  let nameBox = { x: 0, y: 0, w: 0, h: 0, size: 0 }
  // Hands and the brush load late; until they do, nothing is cached in a stand-in face.
  let fontsLoaded = false
  Promise.all(
    ["700 40px 'Kalam'", "400 40px 'Kalam'", "40px 'Reenie Beanie'", "40px 'Zhi Mang Xing'"].map((f) => document.fonts.load(f, 'Aजि')),
  ).finally(() => {
    fontsLoaded = true
    textCache.clear()
    nameImage = null
  })

  function resize(w: number, h: number) {
    W = w
    H = h
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    vines = makeVines(W, H)
    textCache.clear()
    nameImage = null
  }

  // ---- marks a hand makes

  // A jitter that changes eight times a second: the line boils.
  const jit = (seed: number, amount: number) => (hash(seed * 13.7 + boil * 7.31) - 0.5) * amount

  // An ink line along a path, drawn up to `upto` (0 … 1), thick in the middle
  // and tapering at both ends, its pressure wavering.
  function inkPath(p: Path, upto: number, width: number, color = INK, wobble = 0.8) {
    if (upto <= 0) return
    const end = p.len * clamp01(upto)
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    for (let i = 1; i < p.pts.length; i++) {
      if (p.cum[i - 1] >= end) break
      const a = p.pts[i - 1]
      const b = p.pts[i]
      const k = Math.min(1, (end - p.cum[i - 1]) / Math.max(p.cum[i] - p.cum[i - 1], 1e-6))
      const u = p.cum[i] / p.len
      const taper = Math.pow(Math.sin(Math.PI * Math.min(u * 0.95 + 0.04, 1)), 0.5)
      ctx.lineWidth = Math.max(0.6, width * (0.3 + 0.7 * taper) * (0.85 + 0.3 * hash(i * 3.3)))
      ctx.beginPath()
      ctx.moveTo(a.x + jit(i, wobble), a.y + jit(i + 0.5, wobble))
      ctx.lineTo(a.x + (b.x - a.x) * k + jit(i + 1, wobble), a.y + (b.y - a.y) * k + jit(i + 1.5, wobble))
      ctx.stroke()
    }
  }

  // A loose loop scribbled round something (twice, not quite closing).
  function circleAround(x: number, y: number, r: number, upto: number, seed: number) {
    const pts: Pt[] = []
    const n = 48
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2.25 + seed
      const rr = r * (1 + 0.12 * Math.sin(a * 2 + seed) + 0.04 * (k / n))
      pts.push({ x: x + Math.cos(a) * rr * 1.25, y: y + Math.sin(a) * rr * 0.85 })
    }
    inkPath(pathOf(pts), upto, 1.6, GRAPHITE, 0.6)
  }

  // Text rendered once, at the device's resolution, to be revealed as written.
  function textImage(text: string, font: string, color: string) {
    const key = `${text}|${font}|${color}`
    let c = textCache.get(key)
    if (c) return c
    c = document.createElement('canvas')
    const g = c.getContext('2d')!
    g.font = font
    const m = g.measureText(text)
    const size = parseFloat(font.match(/(\d+(\.\d+)?)px/)?.[1] ?? '20')
    const w = Math.ceil(m.width + size * 0.6)
    const h = Math.ceil(size * 1.9)
    c.width = Math.ceil(w * dpr)
    c.height = Math.ceil(h * dpr)
    g.scale(dpr, dpr)
    g.font = font
    g.fillStyle = color
    g.textBaseline = 'middle'
    g.fillText(text, size * 0.3, h / 2)
    textCache.set(key, c)
    return c
  }

  // Draw an image revealed left to right up to `upto`, the front ragged like
  // the edge of a line still being written.
  function writeOn(img: HTMLCanvasElement, cx: number, cy: number, upto: number, alpha = 1, ragged = 0.06) {
    if (upto <= 0 || alpha <= 0) return
    const w = img.width / dpr
    const h = img.height / dpr
    const x0 = cx - w / 2
    const y0 = cy - h / 2
    const front = x0 + w * clamp01(upto) * 1.04
    ctx.save()
    ctx.globalAlpha = alpha
    if (upto < 1) {
      ctx.beginPath()
      ctx.moveTo(x0 - 2, y0)
      for (let y = 0; y <= h; y += 4) ctx.lineTo(front + (hash(y * 0.31 + 2.1) - 0.5) * h * ragged, y0 + y)
      ctx.lineTo(x0 - 2, y0 + h)
      ctx.closePath()
      ctx.clip()
    }
    ctx.drawImage(img, x0, y0, w, h)
    ctx.restore()
  }

  // A watercolour wash: the pigment pooled, a darker tide-line at its edge.
  function wash(path: () => void, color: string, amount: number, edge = 'rgba(0,0,0,0.12)') {
    if (amount <= 0) return
    ctx.save()
    ctx.globalAlpha = 0.62 * amount
    ctx.fillStyle = color
    path()
    ctx.fill()
    ctx.globalAlpha = amount
    ctx.strokeStyle = edge
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.restore()
  }

  function blot(x: number, y: number, rx: number, ry: number, seed: number) {
    ctx.beginPath()
    const n = 28
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2
      const r = 1 + 0.18 * (hash(seed + k * 1.7) - 0.5) + 0.1 * Math.sin(a * 3 + seed)
      const px = x + Math.cos(a) * rx * r
      const py = y + Math.sin(a) * ry * r
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }

  // ---- leaves and flowers

  function leafShape(x: number, y: number, angle: number, size: number) {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const P = (u: number, v: number) => ({ x: x + c * u - s * v, y: y + s * u + c * v })
    const tip = P(size, 0)
    const a1 = P(size * 0.35, size * 0.38)
    const a2 = P(size * 0.75, size * 0.2)
    const b1 = P(size * 0.75, -size * 0.2)
    const b2 = P(size * 0.35, -size * 0.38)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(a1.x, a1.y, a2.x, a2.y, tip.x, tip.y)
    ctx.bezierCurveTo(b1.x, b1.y, b2.x, b2.y, x, y)
    ctx.closePath()
    return { mid: P(size * 0.85, 0) }
  }

  function drawLeaf(x: number, y: number, angle: number, size: number, drawn: number, painted: number, seed: number) {
    if (drawn <= 0) return
    const sz = size * easeOut(drawn)
    wash(() => leafShape(x, y, angle, sz), hash(seed) > 0.5 ? '#7d9a4a' : '#5f8a45', painted)
    leafShape(x + jit(seed, 0.6), y + jit(seed + 1, 0.6), angle, sz)
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.2
    ctx.stroke()
    // The midrib.
    const m = leafShape(x, y, angle, sz).mid
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(m.x, m.y)
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  function petal(x: number, y: number, angle: number, len: number, wide: number) {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const P = (u: number, v: number) => ({ x: x + c * u - s * v, y: y + s * u + c * v })
    const tip = P(len, 0)
    const l1 = P(len * 0.3, wide)
    const l2 = P(len * 0.8, wide * 0.55)
    const r1 = P(len * 0.8, -wide * 0.55)
    const r2 = P(len * 0.3, -wide)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(l1.x, l1.y, l2.x, l2.y, tip.x, tip.y)
    ctx.bezierCurveTo(r1.x, r1.y, r2.x, r2.y, x, y)
    ctx.closePath()
  }

  const PINKS = ['#e79ab0', '#f0b7c4', '#e48aa6']
  const GOLDS = ['#f0c060', '#f3d27a', '#eaa64a']

  function drawFlower(f: Flower, x: number, y: number, up: number, open: number, painted: number, seed: number) {
    if (open <= 0) return
    const size = f.size * (0.35 + 0.65 * easeOut(open))
    const pink = PINKS[Math.floor(f.hue * PINKS.length)]
    const gold = GOLDS[Math.floor(f.hue * GOLDS.length)]
    if (f.kind === 'bud') {
      const a = up
      wash(() => petal(x, y, a, size * 1.5, size * 0.55), pink, painted)
      petal(x + jit(seed, 0.5), y, a, size * 1.5, size * 0.55)
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.1
      ctx.stroke()
      return
    }
    if (f.kind === 'lotus') {
      // Back petals, then the front ones, fanning wider as it opens.
      const rows = [
        { n: 6, spread: 1.25, len: 1.0, wide: 0.32, tone: pink },
        { n: 5, spread: 0.8, len: 0.85, wide: 0.3, tone: '#f6d0d8' },
        { n: 3, spread: 0.35, len: 0.7, wide: 0.26, tone: '#fbe4e8' },
      ]
      rows.forEach((r, ri) => {
        for (let k = 0; k < r.n; k++) {
          const off = r.n === 1 ? 0 : (k / (r.n - 1) - 0.5) * 2
          const a = up + off * r.spread * (0.35 + 0.65 * open)
          const len = size * r.len * (1 - 0.12 * Math.abs(off))
          wash(() => petal(x, y, a, len, size * r.wide), r.tone, painted, 'rgba(150,40,70,0.25)')
          petal(x + jit(seed + ri * 10 + k, 0.5), y + jit(seed + k, 0.5), a, len, size * r.wide)
          ctx.strokeStyle = INK
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
      })
      // The golden seed-pod showing at its heart.
      if (open > 0.6) {
        wash(() => blot(x + Math.cos(up) * size * 0.25, y + Math.sin(up) * size * 0.25, size * 0.16, size * 0.1, seed), gold, painted)
      }
      return
    }
    // A five-petalled blossom, face on, its centre gold.
    for (let k = 0; k < 5; k++) {
      const a = up + (k / 5) * Math.PI * 2 + seed
      wash(() => petal(x, y, a, size, size * 0.42), k % 2 ? '#fbf3e4' : '#f7ead0', painted, 'rgba(120,90,30,0.25)')
      petal(x + jit(seed + k, 0.5), y + jit(seed + k + 9, 0.5), a, size, size * 0.42)
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.1
      ctx.stroke()
    }
    wash(() => blot(x, y, size * 0.2, size * 0.2, seed), gold, painted)
    ctx.beginPath()
    ctx.arc(x, y, size * 0.18, 0, Math.PI * 2)
    ctx.strokeStyle = INK
    ctx.lineWidth = 1
    ctx.stroke()
  }

  function drawVines(t: number, time: number) {
    vines.forEach((v, vi) => {
      const k = easeOut((t - v.start) / v.grow)
      if (k <= 0) return
      // A slow sway once grown, the stem pivoting from where it leaves the water.
      const sway = Math.sin(time * 0.6 + vi * 1.7) * 0.01 * k
      ctx.save()
      const root = v.path.pts[0]
      ctx.translate(root.x, root.y)
      ctx.rotate(sway)
      ctx.translate(-root.x, -root.y)
      const paintedAt = (u: number) => smooth(0, 1.2, t - v.start - u * v.grow - 0.9)
      inkPath(v.path, k, v.width)
      // The stem's own wash, a green laid along it.
      ctx.save()
      ctx.globalAlpha = 0.35 * paintedAt(0.5)
      ctx.strokeStyle = '#6d8f45'
      ctx.lineWidth = v.width * 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      v.path.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
      ctx.restore()
      if (v.tendril && k > v.tendrilU) inkPath(v.tendril, (k - v.tendrilU) / (1 - v.tendrilU) * 1.4, v.width * 0.45)
      v.leaves.forEach((L, li) => {
        if (k < L.u) return
        const p = pointAt(v.path, L.u)
        const drawn = clamp01((k - L.u) / 0.12)
        drawLeaf(p.x, p.y, p.angle + L.side * 1.0 + Math.sin(time * 0.9 + li) * 0.04, L.size, drawn, paintedAt(L.u), vi * 50 + li)
      })
      v.flowers.forEach((f, fi) => {
        if (k < f.u) return
        const p = pointAt(v.path, f.u)
        const open = smooth(0, 1.3, t - v.start - f.u * v.grow - 0.15)
        const up = f.kind === 'blossom' ? 0 : -Math.PI / 2 + (p.angle + Math.PI / 2) * 0.4
        drawFlower(f, p.x, p.y, up, open, paintedAt(f.u + 0.1), vi * 30 + fi)
      })
      ctx.restore()
    })
  }

  // ---- the brush, and the name it paints

  function drawBrush(x: number, y: number, angle: number, scale: number, alpha: number) {
    if (alpha <= 0 || scale <= 0) return
    const L = Math.min(W, H) * 0.24 * scale
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(angle)
    // Along +x from the tip. The tuft, wet with vermilion at its point.
    const tuft = () => {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(L * 0.1, -L * 0.05, L * 0.26, -L * 0.055, L * 0.34, -L * 0.035)
      ctx.lineTo(L * 0.34, L * 0.035)
      ctx.bezierCurveTo(L * 0.26, L * 0.055, L * 0.1, L * 0.05, 0, 0)
      ctx.closePath()
    }
    const g = ctx.createLinearGradient(0, 0, L * 0.34, 0)
    g.addColorStop(0, '#9c1d16')
    g.addColorStop(0.45, '#7a2a1c')
    g.addColorStop(1, '#3a2a20')
    ctx.fillStyle = g
    ctx.globalAlpha = alpha * 0.85
    tuft()
    ctx.fill()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.3
    tuft()
    ctx.stroke()
    // Bristle lines.
    ctx.lineWidth = 0.6
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath()
      ctx.moveTo(L * 0.05, k * L * 0.006)
      ctx.quadraticCurveTo(L * 0.2, k * L * 0.014 + jit(k, 0.8), L * 0.33, k * L * 0.011)
      ctx.stroke()
    }
    // The brass ferrule, and the bamboo handle with its nodes.
    ctx.fillStyle = '#c99a4a'
    ctx.beginPath()
    ctx.rect(L * 0.34, -L * 0.036, L * 0.09, L * 0.072)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#b98a52'
    ctx.beginPath()
    ctx.moveTo(L * 0.43, -L * 0.03)
    ctx.lineTo(L, -L * 0.024)
    ctx.lineTo(L, L * 0.024)
    ctx.lineTo(L * 0.43, L * 0.03)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = 1.3
    ctx.stroke()
    ctx.lineWidth = 0.9
    for (const u of [0.6, 0.82]) {
      ctx.beginPath()
      ctx.moveTo(L * u, -L * 0.028)
      ctx.lineTo(L * u, L * 0.028)
      ctx.stroke()
    }
    ctx.restore()
  }

  // The name in pigment: a dry brush (the bristles drag gaps through it),
  // darker where the paint pooled at the edges of each stroke.
  function buildName() {
    const portrait = W < H
    const size = Math.round(Math.min(W * (portrait ? 0.27 : 0.15), H * 0.22))
    const font = `${size}px ${BRUSH_FONT}`
    const probe = ctx
    probe.font = font
    const w = Math.ceil(probe.measureText(NAME).width + size * 0.5)
    const h = Math.ceil(size * 1.5)
    const c = document.createElement('canvas')
    c.width = Math.ceil(w * dpr)
    c.height = Math.ceil(h * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.font = font
    g.textBaseline = 'middle'
    g.fillStyle = '#a3221a'
    g.fillText(NAME, size * 0.25, h * 0.52)
    // Pooled edges.
    g.globalCompositeOperation = 'source-atop'
    g.strokeStyle = 'rgba(70, 8, 6, 0.55)'
    g.lineWidth = size * 0.035
    g.strokeText(NAME, size * 0.25, h * 0.52)
    // Granulation.
    const rng = mulberry32(5)
    for (let i = 0; i < w * h * 0.02; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(60, 5, 5, 0.25)' : 'rgba(255, 220, 200, 0.18)'
      g.fillRect(rng() * w, rng() * h, 1.2, 1.2)
    }
    // Dry-brush gaps, dragged along the stroke.
    g.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 140; i++) {
      const y = rng() * h
      const x = rng() * w
      g.strokeStyle = `rgba(0,0,0,${0.25 + rng() * 0.55})`
      g.lineWidth = 0.5 + rng() * 1.4
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x + size * 0.4, y + (rng() - 0.5) * size * 0.2, x + size * (0.5 + rng()), y + (rng() - 0.5) * size * 0.3)
      g.stroke()
    }
    nameImage = c
    const cx = W / 2
    const cy = H * (portrait ? 0.3 : 0.27)
    nameBox = { x: cx - w / 2, y: cy - h / 2, w, h, size }
  }

  function drawName(t: number, time: number) {
    const risen = act.anchor('risen')
    if (t < BRUSH_AT) return
    if (!nameImage) buildName()
    const { x, y, w, h, size } = nameBox
    const k = clamp01((t - PAINT_AT) / PAINT_LENGTH)
    const left = x + size * 0.25
    const right = x + w - size * 0.2
    // The painted front sweeps across, easing in and out like a hand.
    const front = left + (right - left) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
    if (k > 0) {
      ctx.save()
      if (k < 1) {
        ctx.beginPath()
        ctx.moveTo(x - 4, y)
        for (let yy = 0; yy <= h; yy += 3) ctx.lineTo(front + (hash(yy * 0.37) - 0.5) * size * 0.14 + (hash(yy * 1.9 + 3) - 0.5) * size * 0.05, y + yy)
        ctx.lineTo(x - 4, y + h)
        ctx.closePath()
        ctx.clip()
      }
      ctx.drawImage(nameImage!, x, y, w, h)
      ctx.restore()
    }
    // The brush: up out of the lotus, across the name, and away.
    const rise = smooth(BRUSH_AT, PAINT_AT, t)
    const leave = smooth(PAINT_AT + PAINT_LENGTH, PAINT_AT + PAINT_LENGTH + 0.9, t)
    if (leave >= 1) return
    const fromX = risen.visible ? risen.x : W / 2
    const fromY = risen.visible ? risen.y : H * 0.7
    const startX = left - size * 0.05
    const startY = y + h * 0.5
    let bx: number
    let by: number
    if (k <= 0) {
      const e = easeOut(rise)
      bx = fromX + (startX - fromX) * e
      by = fromY + (startY - fromY) * e - Math.sin(Math.PI * e) * H * 0.06
    } else {
      // Down and up through each letter as it goes.
      bx = front
      by = y + h * 0.52 + Math.sin(front * 0.06) * h * 0.24 + Math.sin(time * 9) * 1.2
    }
    bx += leave * W * 0.12
    by -= leave * H * 0.18
    const angle = -Math.PI * 0.32 + Math.sin(k * 20) * 0.06 * (k > 0 && k < 1 ? 1 : 0) - leave * 0.4
    drawBrush(bx, by, angle, 0.4 + 0.6 * easeOut(rise), 1 - leave)
  }

  // ---- the jigyasa, the chapters, and the notes on the mind

  const anchor = { x: 0, y: 0, visible: false }

  function drawChapters(t: number) {
    const fade = 1 - smooth(19.7, 20.6, t)
    if (fade <= 0) return
    const m = Math.min(W, H)
    CHAPTERS.forEach((c, i) => {
      const k = clamp01((t - CHAPTER_AT(i)) / 0.9)
      if (k <= 0) return
      act.anchor('chapter', i, anchor)
      if (!anchor.visible) return
      const hi = textImage(`${c.num} ${c.hi}`, `400 ${Math.round(m * 0.034)}px ${HAND_DEVA}`, INK)
      const en = textImage(c.en.toLowerCase(), `${Math.round(m * 0.038)}px ${HAND}`, GRAPHITE)
      writeOn(hi, anchor.x, anchor.y, k, 0.9 * fade)
      writeOn(en, anchor.x, anchor.y + m * 0.04, clamp01(k * 1.3 - 0.3), 0.85 * fade)
    })
  }

  function drawJigyasa(t: number) {
    const fade = 1 - smooth(19.8, 20.8, t)
    const k = clamp01((t - JIGYASA_AT) / 1.6)
    if (k <= 0 || fade <= 0) return
    act.anchor('lotus', 0, anchor)
    const m = Math.min(W, H)
    const cx = W / 2
    const cy = H * (W < H ? 0.2 : 0.15)
    // A wash of gold laid under the word once it is written.
    const under = smooth(JIGYASA_AT + 1.2, JIGYASA_AT + 2.4, t) * fade
    if (under > 0) {
      ctx.save()
      ctx.globalAlpha = 0.45 * under
      ctx.fillStyle = '#efc46a'
      blot(cx, cy + m * 0.012, m * 0.15, m * 0.045, 4)
      ctx.fill()
      ctx.restore()
    }
    const word = textImage('जिज्ञासा', `700 ${Math.round(m * 0.1)}px ${HAND_DEVA}`, INK)
    writeOn(word, cx, cy, k, fade, 0.1)
    const gloss = textImage('१ · jigyasa · curiosity', `${Math.round(m * 0.036)}px ${HAND}`, GRAPHITE)
    writeOn(gloss, cx, cy + m * 0.085, clamp01((t - JIGYASA_AT - 1.1) / 1.0), fade)
  }

  const probe = { x: 0, y: 0, visible: false }
  function nearest(kind: 'koi' | 'fish' | 'weeds', x: number, y: number) {
    const count = kind === 'koi' ? 9 : kind === 'fish' ? 27 : 12
    let best = Infinity
    anchor.visible = false
    for (let i = 0; i < count; i++) {
      act.anchor(kind, i, probe)
      if (!probe.visible || probe.x < 0 || probe.x > W || probe.y < 0 || probe.y > H) continue
      const d = Math.hypot(probe.x - x, probe.y - y)
      if (d < best) {
        best = d
        Object.assign(anchor, probe)
      }
    }
  }

  const NOTES = [
    { what: 'koi' as const, text: 'koi — my thoughts', corner: [0.06, 0.16] },
    { what: 'fish' as const, text: 'the little fish — what I do with them', corner: [0.62, 0.12] },
    { what: 'weeds' as const, text: 'weeds — the bad ones', corner: [0.06, 0.84] },
    { what: 'ripples' as const, text: 'ripples — what follows', corner: [0.64, 0.86] },
  ]
  function drawNotes(t: number) {
    const fade = 1 - smooth(DROP_START - 0.1, DROP_START + 0.4, t)
    if (t < NOTES_AT || fade <= 0) return
    const m = Math.min(W, H)
    const portrait = W < H
    NOTES.forEach((n, i) => {
      const k = clamp01((t - NOTES_AT - i * 0.38) / 0.8)
      if (k <= 0) return
      const img = textImage(n.text, `${Math.round(m * (portrait ? 0.046 : 0.04))}px ${HAND}`, GRAPHITE)
      const tw = img.width / dpr
      const lx = Math.min(n.corner[0] * W + tw / 2, W - tw / 2 - 8)
      const ly = n.corner[1] * H
      // Point at the nearest one of its kind (ripples: the cursor's, if it is
      // on the water, else the wake of the nearest koi).
      if (n.what === 'ripples' && act.anchor('cursor', 0, anchor).visible && act.cursorOn()) {
        // the cursor's own ripples
      } else nearest(n.what === 'ripples' ? 'koi' : n.what, lx, ly)
      ctx.save()
      ctx.globalAlpha = fade
      // A pale paper slip under the words, so they read over a busy pond.
      ctx.globalAlpha = 0.5 * fade * k
      ctx.fillStyle = '#efe7d8'
      blot(lx, ly, tw * 0.55, m * 0.03, i * 9)
      ctx.fill()
      ctx.globalAlpha = fade
      writeOn(img, lx, ly, k)
      if (anchor.visible) {
        // The leader line, from the note to the thing it names.
        const lead = clamp01((k - 0.5) * 2)
        const fromY = ly + (anchor.y > ly ? m * 0.03 : -m * 0.03)
        const pts: Pt[] = []
        for (let s = 0; s <= 16; s++) {
          const u = s / 16
          pts.push({ x: lx + (anchor.x - lx) * u + Math.sin(u * Math.PI) * 14, y: fromY + (anchor.y - fromY) * u })
        }
        inkPath(pathOf(pts), lead, 1.4, GRAPHITE, 0.5)
        if (lead >= 1) circleAround(anchor.x, anchor.y, m * (n.what === 'weeds' ? 0.05 : 0.03), clamp01((k - 0.9) * 10), i)
      }
      ctx.restore()
    })
  }

  // The drop is the mind gathering itself: from above, focus lines close in
  // on it as on a face in a manga panel; beside it, speed lines stream past
  // as it falls, and the word for it is written at its side.
  function drawDrop(t: number) {
    act.anchor('drop', 0, anchor)
    if (!anchor.visible) return
    const m = Math.min(W, H)
    if (t < SIDE_START) {
      const k = smooth(DROP_START + 0.1, DROP_START + 0.6, t) * (1 - smooth(SIDE_START - 0.25, SIDE_START, t))
      if (k <= 0) return
      const n = 56
      ctx.save()
      ctx.globalAlpha = 0.55 * k
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash(i) * 0.08
        const inner = m * (0.12 + 0.1 * hash(i * 2.7 + boil)) * (1.3 - 0.3 * k)
        const outer = Math.hypot(W, H)
        const w = 0.6 + 2.6 * hash(i * 5.1)
        ctx.beginPath()
        ctx.moveTo(anchor.x + Math.cos(a - 0.004 * w) * outer, anchor.y + Math.sin(a - 0.004 * w) * outer)
        ctx.lineTo(anchor.x + Math.cos(a) * inner, anchor.y + Math.sin(a) * inner)
        ctx.lineTo(anchor.x + Math.cos(a + 0.004 * w) * outer, anchor.y + Math.sin(a + 0.004 * w) * outer)
        ctx.closePath()
        ctx.fillStyle = INK
        ctx.fill()
      }
      ctx.restore()
      return
    }
    const k = smooth(SIDE_START + 0.05, SIDE_START + 0.4, t) * (1 - smooth(IMPACT_AT - 0.35, IMPACT_AT, t))
    if (k <= 0) return
    // Speed lines above it, streaming up the frame as it falls (slowing as it nears).
    const fast = 1 - smooth(SIDE_START, IMPACT_AT, t) * 0.7
    ctx.save()
    ctx.globalAlpha = 0.5 * k
    ctx.strokeStyle = INK
    for (let i = 0; i < 22; i++) {
      const x = anchor.x + (hash(i * 3.1) - 0.5) * m * 0.34
      const y0 = anchor.y - m * (0.06 + 0.5 * hash(i * 7.7 + boil * 0.3))
      const len = m * (0.08 + 0.22 * hash(i * 1.3)) * fast
      ctx.lineWidth = 0.6 + 1.6 * hash(i * 9.1)
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.lineTo(x + jit(i, 1), y0 - len)
      ctx.stroke()
    }
    ctx.restore()
    const word = textImage('ध्यान', `700 ${Math.round(m * 0.06)}px ${HAND_DEVA}`, INK)
    const gloss = textImage('focus — one thought, held', `${Math.round(m * 0.036)}px ${HAND}`, GRAPHITE)
    const wx = Math.min(anchor.x + m * 0.32, W - m * 0.2)
    const w = clamp01((t - SIDE_START - 0.3) / 0.9)
    writeOn(word, wx, H * 0.3, w, k)
    writeOn(gloss, wx, H * 0.3 + m * 0.06, clamp01((t - SIDE_START - 0.9) / 0.9), k)
  }

  function drawDeva(t: number) {
    const k = clamp01((t - DEVA_AT) / 1.1)
    if (k <= 0 || !nameImage) return
    const m = Math.min(W, H)
    const img = textImage(NAME_DEVA, `400 ${Math.round(m * 0.05)}px ${HAND_DEVA}`, INK)
    writeOn(img, W / 2, nameBox.y + nameBox.h + m * 0.01, k, 0.9)
  }

  function draw(time: number, on: boolean) {
    const t = act.state.t
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!on || !fontsLoaded) return
    boil = Math.floor(time * 8)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (t > 8 && t < 21) drawChapters(t)
    if (t > JIGYASA_AT && t < 21) drawJigyasa(t)
    if (t > NOTES_AT && t < DROP_START + 0.5) drawNotes(t)
    if (t > DROP_START && t < IMPACT_AT) drawDrop(t)
    if (t > VINES_AT) drawVines(t, time)
    if (t > BRUSH_AT) drawName(t, time)
    if (t > DEVA_AT) drawDeva(t)
  }

  return {
    canvas,
    resize,
    draw,
    // The name's box on the page (CSS px), once painted.
    nameBox: () => (nameImage && act.state.t >= ACT_LENGTH - 2 ? nameBox : null),
    dispose() {
      canvas.remove()
    },
  }
}
