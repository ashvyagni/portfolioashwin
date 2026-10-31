// Marks a hand makes, for the 2D drawings of the descent: lines that taper
// and waver, boiling on twos; text that is written on; loose scribbled loops.

export type Pt = { x: number; y: number }
export type Path = { pts: Pt[]; cum: number[]; len: number }

export const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
export const easeInOut = (x: number) => {
  const t = clamp01(x)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function pathOf(pts: Pt[]): Path {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return { pts, cum, len: cum[cum.length - 1] || 1 }
}
export function pointAt(p: Path, u: number) {
  const d = clamp01(u) * p.len
  let i = 1
  while (i < p.pts.length - 1 && p.cum[i] < d) i++
  const a = p.pts[i - 1]
  const b = p.pts[i]
  const k = (d - p.cum[i - 1]) / Math.max(p.cum[i] - p.cum[i - 1], 1e-6)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

export class Ink {
  boil = 0
  ctx: CanvasRenderingContext2D
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  jit(seed: number, amount: number) {
    return (hash(seed * 13.7 + this.boil * 7.31) - 0.5) * amount
  }

  // An ink line along a path up to `upto`, tapering at both ends.
  path(p: Path, upto: number, width: number, color: string, wobble = 0.8) {
    if (upto <= 0) return
    const ctx = this.ctx
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
      ctx.lineWidth = Math.max(0.5, width * (0.3 + 0.7 * taper) * (0.85 + 0.3 * hash(i * 3.3)))
      ctx.beginPath()
      ctx.moveTo(a.x + this.jit(i, wobble), a.y + this.jit(i + 0.5, wobble))
      ctx.lineTo(a.x + (b.x - a.x) * k + this.jit(i + 1, wobble), a.y + (b.y - a.y) * k + this.jit(i + 1.5, wobble))
      ctx.stroke()
    }
  }

  // A straight-ish hand line from a to b.
  line(ax: number, ay: number, bx: number, by: number, width: number, color: string, upto = 1, seed = 0) {
    const pts: Pt[] = []
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 24))
    for (let i = 0; i <= n; i++) {
      const u = i / n
      const bow = Math.sin(u * Math.PI) * (hash(seed + 3.1) - 0.5) * 6
      pts.push({ x: ax + (bx - ax) * u - (by - ay) * bow * 0.01, y: ay + (by - ay) * u + (bx - ax) * bow * 0.01 })
    }
    this.path(pathOf(pts), upto, width, color, 0.6)
  }

  circle(x: number, y: number, r: number, width: number, color: string, upto = 1, seed = 0, turns = 1.08) {
    const pts: Pt[] = []
    const n = Math.max(24, Math.ceil(r * 0.4))
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2 * turns + seed
      const rr = r * (1 + 0.015 * Math.sin(a * 3 + seed))
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr })
    }
    this.path(pathOf(pts), upto, width, color, 0.7)
  }
}

// Text rendered once, then written on left to right with a ragged front.
export class Writer {
  private cache = new Map<string, HTMLCanvasElement>()
  ctx: CanvasRenderingContext2D
  dpr: number
  constructor(ctx: CanvasRenderingContext2D, dpr: number) {
    this.ctx = ctx
    this.dpr = dpr
  }
  clear() {
    this.cache.clear()
  }
  image(text: string, font: string, color: string) {
    const key = `${text}|${font}|${color}`
    let c = this.cache.get(key)
    if (c) return c
    c = document.createElement('canvas')
    const g = c.getContext('2d')!
    g.font = font
    const size = parseFloat(font.match(/(\d+(\.\d+)?)px/)?.[1] ?? '20')
    const w = Math.ceil(g.measureText(text).width + size * 0.6)
    const h = Math.ceil(size * 1.8)
    c.width = Math.ceil(w * this.dpr)
    c.height = Math.ceil(h * this.dpr)
    g.scale(this.dpr, this.dpr)
    g.font = font
    g.fillStyle = color
    g.textBaseline = 'middle'
    g.fillText(text, size * 0.3, h / 2)
    this.cache.set(key, c)
    return c
  }
  width(img: HTMLCanvasElement) {
    return img.width / this.dpr
  }
  // Centre at (cx, cy); `align` 0 left edge at cx, 0.5 centred.
  write(img: HTMLCanvasElement, cx: number, cy: number, upto: number, alpha = 1, align = 0.5) {
    if (upto <= 0 || alpha <= 0) return
    const ctx = this.ctx
    const w = img.width / this.dpr
    const h = img.height / this.dpr
    const x0 = cx - w * align
    const y0 = cy - h / 2
    const front = x0 + w * clamp01(upto) * 1.04
    ctx.save()
    ctx.globalAlpha *= alpha
    if (upto < 1) {
      ctx.beginPath()
      ctx.moveTo(x0 - 2, y0)
      for (let y = 0; y <= h; y += 4) ctx.lineTo(front + (hash(y * 0.31 + 2.1) - 0.5) * h * 0.08, y0 + y)
      ctx.lineTo(x0 - 2, y0 + h)
      ctx.closePath()
      ctx.clip()
    }
    ctx.drawImage(img, x0, y0, w, h)
    ctx.restore()
  }
}
