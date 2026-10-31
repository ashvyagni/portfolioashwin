import { MILESTONES, TREE } from '../content/forge'
import { Ink, Writer, clamp01, easeInOut, easeOut, hash, mulberry32, pathOf, pointAt, smooth, type Pt } from './ink'
import { createSky } from './sky'

// The descent, as one drawing that moves with the scroll (p: 0 … 1).
//
//   0    – .05  the pothi open on the page; a spiral drawn on its leaf
//   .03  – .30  down the spiral — a nautilus, chamber after chamber, with the
//               milestones riding its arm. Behind it, Renaissance engineering
//               (gears, a wing, a compass); and reality glitching through it in
//               slices, to a forge in the dark behind — until the dark is all
//   .30  – .52  the spiral unwinds into a tree of wisdom: each branch a domain,
//               its leaves the things worked with
//   .52  – .60  the eye opens behind the tree; a cross of light cuts out of
//               it, and the page shatters
//   .60  – .86  the sky behind: rocks in the air; you run and leap across them
//   .86  – .97  off the last one, down through the clouds into the dark
//   .97  – 1    black fluid. You land; you look down at your feet (a short
//               cutscene, played on its own clock); the forge begins.

export const SEG = { spiralEnd: 0.3, treeEnd: 0.52, eyeEnd: 0.6, runEnd: 0.86, fallEnd: 0.97 }

const PAPER = '#ece6da'
const INK = '#2a1d14'
const DARK = '#07080c'
const CHALK = '#d6e6ff'
const CYAN = '#6fe3ff'
const RED = '#e0262b'
const B = 0.3063 // a golden spiral: r = e^(bθ)
const SERIF = "'Instrument Serif', serif"
const MONO = "'JetBrains Mono Variable', monospace"
const HANDDEVA = "'Kalam', serif"

type Card = { z: number; m: (typeof MILESTONES)[number] }

export function createDescent(flat: HTMLCanvasElement, gl: HTMLCanvasElement) {
  const ctx = flat.getContext('2d')!
  const ink = new Ink(ctx)
  let dpr = 1
  const writer = new Writer(ctx, 1)
  const sky = createSky(gl)
  let W = 1
  let H = 1
  let m = 1
  let paperArt: HTMLCanvasElement | null = null
  let darkArt: HTMLCanvasElement | null = null
  let snap: HTMLCanvasElement | null = null
  let tree: ReturnType<typeof growTree> | null = null
  let shards: { pts: Pt[]; dir: Pt; spin: number; c: Pt }[] = []
  const Z_MAX = 9.5
  // The milestones, spaced down the spiral's zoom.
  const cards: Card[] = MILESTONES.map((ms, i) => ({ z: 1.6 + (i / Math.max(MILESTONES.length - 1, 1)) * (Z_MAX - 3.2), m: ms }))
  const sparks = Array.from({ length: 70 }, (_, i) => ({ seed: i, life: hash(i * 3.1) }))

  function resize(w: number, h: number) {
    W = w
    H = h
    m = Math.min(w, h)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    flat.width = Math.round(w * dpr)
    flat.height = Math.round(h * dpr)
    writer.dpr = dpr
    writer.clear()
    sky.setSize(w, h)
    paperArt = engineering(false)
    darkArt = engineering(true)
    snap = document.createElement('canvas')
    snap.width = flat.width
    snap.height = flat.height
    tree = growTree()
    shards = shatter()
  }

  // ---- Renaissance engineering behind the spiral (and its dark twin: the forge)

  function engineering(dark: boolean) {
    const c = document.createElement('canvas')
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    const pen = new Ink(g)
    const line = dark ? 'rgba(111, 227, 255, 0.5)' : 'rgba(60, 44, 30, 0.38)'
    const faint = dark ? 'rgba(111, 227, 255, 0.22)' : 'rgba(60, 44, 30, 0.18)'
    if (dark) {
      g.fillStyle = DARK
      g.fillRect(0, 0, W, H)
      // A blueprint grid.
      g.strokeStyle = 'rgba(111, 227, 255, 0.06)'
      g.lineWidth = 1
      for (let x = 0; x < W; x += 32) {
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, H)
        g.stroke()
      }
      for (let y = 0; y < H; y += 32) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(W, y)
        g.stroke()
      }
    } else {
      g.fillStyle = PAPER
      g.fillRect(0, 0, W, H)
      const rng = mulberry32(3)
      for (let i = 0; i < W * H * 0.004; i++) {
        g.fillStyle = rng() < 0.5 ? 'rgba(120,100,70,0.06)' : 'rgba(255,255,255,0.08)'
        g.fillRect(rng() * W, rng() * H, 1.5, 1.5)
      }
    }
    const gear = (x: number, y: number, r: number, teeth: number) => {
      g.strokeStyle = line
      g.lineWidth = 1.4
      g.beginPath()
      for (let k = 0; k <= teeth * 4; k++) {
        const a = (k / (teeth * 4)) * Math.PI * 2
        const rr = r * (k % 4 < 2 ? 1 : 0.86)
        if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      }
      g.stroke()
      pen.circle(x, y, r * 0.55, 1, faint, 1, x)
      pen.circle(x, y, r * 0.12, 1.2, line, 1, y)
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        pen.line(x + Math.cos(a) * r * 0.14, y + Math.sin(a) * r * 0.14, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, 1, faint, 1, k)
      }
    }
    gear(W * 0.14, H * 0.24, m * 0.13, 16)
    gear(W * 0.14 + m * 0.21, H * 0.24 + m * 0.06, m * 0.09, 11)
    gear(W * 0.86, H * 0.78, m * 0.15, 18)
    // A wing, after the ornithopter studies: ribs fanning from a spar.
    const wx = W * 0.8
    const wy = H * 0.2
    for (let k = 0; k < 9; k++) {
      const a = -0.2 - k * 0.13
      const len = m * (0.3 - k * 0.018)
      const pts: Pt[] = []
      for (let s = 0; s <= 12; s++) {
        const u = s / 12
        pts.push({ x: wx - Math.cos(a) * len * u, y: wy - Math.sin(a) * len * u + Math.sin(u * Math.PI) * m * 0.02 })
      }
      pen.path(pathOf(pts), 1, 1.2, k % 3 ? faint : line, 0.5)
    }
    // A compass construction, the circle squared.
    const cx = W * 0.2
    const cy = H * 0.76
    pen.circle(cx, cy, m * 0.16, 1.1, line, 1, 2)
    g.strokeStyle = line
    g.strokeRect(cx - m * 0.14, cy - m * 0.14, m * 0.28, m * 0.28)
    pen.line(cx - m * 0.2, cy, cx + m * 0.2, cy, 1, faint, 1, 5)
    pen.line(cx, cy - m * 0.2, cx, cy + m * 0.2, 1, faint, 1, 6)
    // Notes in a mirrored hand: just their rhythm, not words.
    const rng = mulberry32(dark ? 8 : 9)
    for (let k = 0; k < 14; k++) {
      const x = W * (0.55 + rng() * 0.35)
      const y = H * (0.38 + k * 0.025)
      const len = W * (0.04 + rng() * 0.12)
      const pts: Pt[] = []
      for (let s = 0; s <= 20; s++) pts.push({ x: x + (len * s) / 20, y: y + Math.sin(s * 2.3 + k) * 2 })
      pen.path(pathOf(pts), 1, 0.9, faint, 0.4)
    }
    if (dark) {
      // HUD brackets in the corners: the future reading the past.
      g.strokeStyle = 'rgba(111, 227, 255, 0.5)'
      g.lineWidth = 1.5
      for (const [x, y, sx, sy] of [
        [24, 24, 1, 1],
        [W - 24, 24, -1, 1],
        [24, H - 24, 1, -1],
        [W - 24, H - 24, -1, -1],
      ]) {
        g.beginPath()
        g.moveTo(x, y + sy * 28)
        g.lineTo(x, y)
        g.lineTo(x + sx * 28, y)
        g.stroke()
      }
      g.font = `11px ${MONO}`
      g.fillStyle = 'rgba(111, 227, 255, 0.6)'
      g.fillText('FORGE // DESCENT', 40, 42)
      g.fillText('REALITY  0x2A  UNSTABLE', W - 230, H - 36)
    }
    return c
  }

  // The forge: an anvil in the dark, a hammer over it, sparks off the strike.
  function drawForge(alpha: number, time: number) {
    if (alpha <= 0) return
    const x = W * 0.5
    const y = H * 0.86
    const s = m * 0.22
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(x - s, y - s * 0.32)
    ctx.lineTo(x + s * 0.7, y - s * 0.32)
    ctx.quadraticCurveTo(x + s * 1.25, y - s * 0.3, x + s * 1.35, y - s * 0.12)
    ctx.quadraticCurveTo(x + s * 0.9, y - s * 0.12, x + s * 0.55, y - s * 0.05)
    ctx.lineTo(x + s * 0.4, y + s * 0.25)
    ctx.lineTo(x + s * 0.65, y + s * 0.4)
    ctx.lineTo(x - s * 0.65, y + s * 0.4)
    ctx.lineTo(x - s * 0.4, y + s * 0.25)
    ctx.lineTo(x - s * 0.55, y - s * 0.05)
    ctx.quadraticCurveTo(x - s, y - s * 0.12, x - s, y - s * 0.32)
    ctx.stroke()
    // The strike, every 1.6 s.
    const beat = (time % 1.6) / 1.6
    const lift = beat < 0.7 ? easeOut(beat / 0.7) : 1 - easeOut((beat - 0.7) / 0.1)
    const hx = x - s * 0.1
    const hy = y - s * 0.4 - lift * s * 0.6
    ctx.beginPath()
    ctx.moveTo(hx, hy)
    ctx.lineTo(hx + s * 0.75, hy - s * 0.45)
    ctx.stroke()
    ctx.strokeRect(hx - s * 0.16, hy - s * 0.1, s * 0.32, s * 0.16)
    const sinceStrike = beat > 0.8 ? (beat - 0.8) / 0.2 : 1 + beat
    sparks.forEach((sp) => {
      const k = sinceStrike * 0.9 + sp.life * 0.2
      if (k > 1) return
      const a = -Math.PI / 2 + (hash(sp.seed) - 0.5) * 2.6
      const v = s * (0.8 + hash(sp.seed * 2.1) * 1.6)
      const px = hx + Math.cos(a) * v * k
      const py = y - s * 0.34 + Math.sin(a) * v * k + k * k * s * 1.2
      ctx.strokeStyle = hash(sp.seed * 5.3) > 0.5 ? '#ffd27a' : CYAN
      ctx.globalAlpha = alpha * (1 - k)
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px - Math.cos(a) * 6, py - Math.sin(a) * 6)
      ctx.stroke()
    })
    ctx.restore()
  }

  // ---- the spiral

  function spiralScale(p: number) {
    const z = Z_MAX * easeInOut(clamp01((p - 0.02) / (SEG.spiralEnd - 0.02)))
    return { z, s: (m * 0.035) * Math.exp(z), rot: -(z / B) * 0.55 }
  }

  function drawSpiral(p: number, dark: boolean, alpha: number) {
    const { s, rot } = spiralScale(p)
    const cx = W / 2
    const cy = H / 2
    const diag = Math.hypot(W, H)
    const thLo = Math.log(1.5 / s) / B
    // At first the spiral is drawn on the leaf, within it; it grows out past it as we go down.
    const leaf = m * 0.13 * (s / (m * 0.035)) * (1 + 30 * smooth(0.03, 0.09, p))
    const thHi = Math.min(Math.log(diag / s) / B + 2 * Math.PI, Math.log(leaf / s) / B)
    const col = dark ? CHALK : INK
    ctx.save()
    ctx.globalAlpha = alpha
    // The shell's line, drawn outward, thicker as it nears.
    const pts: Pt[] = []
    const step = 0.04
    for (let th = thLo; th <= thHi; th += step) {
      const r = Math.exp(B * th) * s
      pts.push({ x: cx + Math.cos(th + rot) * r, y: cy + Math.sin(th + rot) * r })
    }
    ctx.lineCap = 'round'
    for (let i = 1; i < pts.length; i++) {
      const th = thLo + i * step
      const r = Math.exp(B * th) * s
      ctx.lineWidth = Math.min(0.6 + r * 0.012, 9)
      if (dark) {
        ctx.strokeStyle = 'rgba(224, 38, 43, 0.55)'
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x + 2, pts[i - 1].y)
        ctx.lineTo(pts[i].x + 2, pts[i].y)
        ctx.stroke()
      }
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.moveTo(pts[i - 1].x + ink.jit(i, 0.8), pts[i - 1].y + ink.jit(i + 0.3, 0.8))
      ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }
    // The chambers' walls: curved septa from one turn to the last.
    for (let th = Math.ceil(thLo / 0.62) * 0.62; th <= thHi; th += 0.62) {
      const r1 = Math.exp(B * th) * s
      const r0 = Math.exp(B * (th - 2 * Math.PI)) * s
      if (r1 < 3 || r0 > diag) continue
      const a = th + rot
      // Septa sweep back in a deep curve, as a nautilus's do.
      const bend = 0.55
      ctx.lineWidth = Math.min(0.5 + r1 * 0.006, 4)
      ctx.strokeStyle = dark ? 'rgba(214,230,255,0.6)' : 'rgba(42,29,20,0.6)'
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
      ctx.quadraticCurveTo(cx + Math.cos(a - bend) * (r0 + r1) / 2, cy + Math.sin(a - bend) * (r0 + r1) / 2, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      ctx.stroke()
      // Hatching in each chamber, lighter outward.
      if (!dark && r1 > 30 && r1 < diag) {
        ctx.lineWidth = 0.6
        ctx.strokeStyle = 'rgba(42,29,20,0.18)'
        for (let k = 1; k < 4; k++) {
          const rr = r0 + (r1 - r0) * (k / 4)
          ctx.beginPath()
          ctx.arc(cx, cy, rr, a, a + 0.38)
          ctx.stroke()
        }
      }
    }
    ctx.restore()
  }

  function drawCards(p: number, dark: boolean, alpha: number) {
    const { s, rot } = spiralScale(p)
    const cx = W / 2
    const cy = H / 2
    cards.forEach((c, i) => {
      // Each card rides the arm at the angle where it is life-size at its moment.
      const th = (Math.log((0.36 * m) / (m * 0.035)) - c.z) / B
      const r = Math.exp(B * th) * s
      const size = r * 0.5
      const k = smooth(m * 0.06, m * 0.16, size) * (1 - smooth(m * 0.55, m * 0.95, size))
      if (k <= 0.01) return
      const between = (Math.exp(B * th) + Math.exp(B * (th - 2 * Math.PI))) / 2 * s
      const a = th + rot - 0.21
      const x = cx + Math.cos(a) * between
      const y = cy + Math.sin(a) * between
      const w = size * 2.1
      const h = size * 0.95
      ctx.save()
      ctx.globalAlpha = alpha * k
      ctx.translate(x, y)
      ctx.rotate(Math.sin(i * 1.7) * 0.06)
      ctx.fillStyle = dark ? 'rgba(10, 16, 24, 0.92)' : '#f6f0e3'
      ctx.strokeStyle = dark ? CYAN : INK
      ctx.lineWidth = Math.max(1, size * 0.012)
      ctx.beginPath()
      ctx.rect(-w / 2, -h / 2, w, h)
      ctx.fill()
      ctx.stroke()
      const fg = dark ? CHALK : INK
      ctx.fillStyle = dark ? CYAN : '#9c2a1c'
      ctx.font = `${Math.round(size * 0.09)}px ${MONO}`
      ctx.textBaseline = 'top'
      ctx.fillText(`${String(i + 1).padStart(2, '0')} · ${c.m.year}`, -w / 2 + size * 0.1, -h / 2 + size * 0.1)
      ctx.fillStyle = fg
      ctx.font = `italic ${Math.round(size * 0.3)}px ${SERIF}`
      ctx.fillText(c.m.title, -w / 2 + size * 0.1, -h / 2 + size * 0.24)
      ctx.font = `${Math.round(size * 0.1)}px ${dark ? MONO : HANDDEVA}`
      wrap(c.m.note, w - size * 0.2).forEach((ln, li) => ctx.fillText(ln, -w / 2 + size * 0.1, -h / 2 + size * 0.6 + li * size * 0.13))
      ctx.restore()
    })
  }

  function wrap(text: string, width: number) {
    const words = text.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (ctx.measureText(next).width > width && cur) {
        lines.push(cur)
        cur = w
      } else cur = next
    }
    if (cur) lines.push(cur)
    return lines.slice(0, 3)
  }

  // The pothi, open, the spiral drawn on its leaf; zoomed with the spiral.
  function drawBook(p: number) {
    const { s } = spiralScale(p)
    const k = s / (m * 0.035)
    if (k > 40) return
    const cx = W / 2
    const cy = H / 2
    const lw = m * 1.3 * k
    const lh = m * 0.3 * k
    ctx.save()
    ctx.fillStyle = '#e9d7a8'
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.roundRect(cx - lw / 2, cy - lh / 2, lw, lh, lh * 0.45)
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(80, 50, 20, 0.35)'
    for (let i = 1; i < 7; i++) {
      const y = cy - lh / 2 + (lh * i) / 7
      ctx.beginPath()
      ctx.moveTo(cx - lw * 0.42, y)
      ctx.lineTo(cx - lw * 0.12, y)
      ctx.moveTo(cx + lw * 0.12, y)
      ctx.lineTo(cx + lw * 0.42, y)
      ctx.stroke()
    }
    // The string holes, and the cord through them.
    for (const sx of [-0.3, 0.3]) {
      ctx.beginPath()
      ctx.arc(cx + lw * sx, cy, lh * 0.05, 0, Math.PI * 2)
      ctx.strokeStyle = INK
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---- the tree

  // The tree is tall — taller than the screen — and the view climbs it as it
  // grows: a branch for each domain, alternating sides, its leaves hanging in
  // a column off the twig. World units are screen pixels, y up from the base.
  const TREE_STEP = () => Math.max(H * 0.3, 190)
  function growTree() {
    const step = TREE_STEP()
    const n = TREE.length
    const height = step * (n + 0.6)
    const cx = W / 2
    const baseY = H * 0.82
    const trunkPts: Pt[] = []
    for (let i = 0; i <= 60; i++) {
      const u = i / 60
      trunkPts.push({ x: cx + Math.sin(u * 7.3) * m * 0.012 * (1 - u * 0.5), y: baseY - height * u })
    }
    const roots = Array.from({ length: 7 }, (_, i) => {
      const a = Math.PI * (0.1 + (i / 6) * 0.8)
      const pts: Pt[] = []
      for (let s = 0; s <= 14; s++) {
        const u = s / 14
        pts.push({ x: cx + Math.cos(a) * m * 0.24 * u + Math.sin(u * 5 + i) * 4, y: baseY + Math.sin(a) * m * 0.05 * u + u * u * 10 })
      }
      return pathOf(pts)
    })
    const portrait = W < H
    const reach = portrait ? W * 0.16 : Math.min(W * 0.17, 260)
    const branches = TREE.map((b, i) => {
      const side = i % 2 ? 1 : -1
      const fromY = baseY - step * (i + 0.7)
      const from = { x: cx, y: fromY }
      const node = { x: cx + side * reach, y: fromY - step * 0.32 }
      const pts: Pt[] = []
      for (let s = 0; s <= 20; s++) {
        const u = s / 20
        pts.push({ x: from.x + (node.x - from.x) * easeOut(u), y: from.y + (node.y - from.y) * u * u })
      }
      const line = portrait ? 17 : 19
      const twigs = b.leaves.map((label, li) => {
        const at = { x: node.x + side * (portrait ? 14 : 22), y: node.y + 26 + li * line }
        const tp: Pt[] = []
        for (let s = 0; s <= 6; s++) {
          const u = s / 6
          tp.push({ x: node.x + (at.x - node.x) * u, y: node.y + (at.y - node.y) * u })
        }
        return { path: pathOf(tp), label, at, side }
      })
      return { path: pathOf(pts), node, twigs, b, side }
    })
    return { trunk: pathOf(trunkPts), roots, branches, height, baseY }
  }

  function drawTree(k: number, glitch: number, time: number) {
    if (!tree) return
    const portrait = W < H
    const n = tree.branches.length
    // The view climbs with the growing tip, then holds on the crown.
    const climb = Math.max(0, tree.height * smooth(0.04, 0.92, k) - H * 0.45)
    ctx.save()
    ctx.translate(0, climb)
    const trunkK = smooth(0.02, 0.95, k)
    ink.path(tree.trunk, trunkK, m * 0.02, CHALK, 1)
    // Bark: short strokes along the grown trunk.
    for (let i = 0; i < 70; i++) {
      const u = hash(i)
      if (u > trunkK) continue
      const p = pointAt(tree.trunk, u)
      ctx.globalAlpha = 0.45
      ink.line(p.x - m * 0.012, p.y, p.x - m * 0.003, p.y - m * 0.022, 1, CHALK, 1, i)
    }
    ctx.globalAlpha = 1
    tree.roots.forEach((r, i) => ink.path(r, smooth(0.0 + i * 0.008, 0.08, k), m * 0.008, CHALK, 0.8))
    tree.branches.forEach((br, i) => {
      const at = (i + 0.7) / (n + 0.6) * 0.93
      const bk = smooth(at, at + 0.05, k)
      if (bk <= 0) return
      ink.path(br.path, bk, m * 0.009, CHALK, 0.8)
      const lk = smooth(at + 0.03, at + 0.07, k)
      if (lk <= 0) return
      const align = br.side > 0 ? 0 : 1
      const dx = br.side > 0 ? 10 : -10
      const hi = writer.image(br.b.hi, `700 ${Math.round(portrait ? 22 : 26)}px ${HANDDEVA}`, '#ffd27a')
      const en = writer.image(br.b.name, `italic ${Math.round(portrait ? 24 : 30)}px ${SERIF}`, CHALK)
      writer.write(en, br.node.x + dx, br.node.y - 30, lk, 1, align)
      writer.write(hi, br.node.x + dx + (br.side > 0 ? writer.width(en) : -writer.width(en)), br.node.y - 30, lk, 0.95, align)
      ctx.fillStyle = '#ffd27a'
      ctx.beginPath()
      ctx.arc(br.node.x, br.node.y, 4, 0, Math.PI * 2)
      ctx.fill()
      br.twigs.forEach((tw, li) => {
        const tk = clamp01((lk - li * 0.06) * 2)
        if (tk <= 0) return
        ink.path(tw.path, tk, 1, 'rgba(214,230,255,0.45)', 0.4)
        const font = `${portrait ? 12 : 13}px ${MONO}`
        // Now and then a leaf slips: a frame of it in cyan, shifted.
        if (glitch > 0 && hash(li * 7 + i * 13 + Math.floor(time * 6)) > 0.97) writer.write(writer.image(tw.label, font, CYAN), tw.at.x + (tw.side > 0 ? 9 : -9), tw.at.y, tk, 0.8, tw.side > 0 ? 0 : 1)
        writer.write(writer.image(tw.label, font, CHALK), tw.at.x + (tw.side > 0 ? 5 : -5), tw.at.y, tk, 0.9, tw.side > 0 ? 0 : 1)
      })
    })
    ctx.restore()
    // The tree's name, at the foot of the screen while it grows.
    const title = writer.image('the tree of wisdom', `italic ${Math.round(m * 0.05)}px ${SERIF}`, CHALK)
    const sub = writer.image('ज्ञान वृक्ष  ·  what I work with', `${Math.round(m * 0.022)}px ${MONO}`, 'rgba(214,230,255,0.6)')
    const fade = 1 - smooth(0.15, 0.25, k)
    writer.write(title, W / 2, H * 0.92, smooth(0.0, 0.06, k), fade)
    writer.write(sub, W / 2, H * 0.965, smooth(0.03, 0.09, k), fade)
  }

  // ---- the eye, the cross, the shattering

  function drawEye(x: number, y: number, size: number, open: number, alpha: number) {
    if (alpha <= 0) return
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    const lid = (sign: number, h: number) => {
      ctx.beginPath()
      for (let i = 0; i <= 40; i++) {
        const u = i / 40
        const px = (u * 2 - 1) * size
        const py = sign * h * Math.pow(1 - (u * 2 - 1) ** 2, 0.8) * size
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
    }
    const up = 0.46 * open + 0.02
    const lo = 0.3 * open + 0.02
    // The white of it, then the iris, clipped to the lids.
    ctx.save()
    lid(-1, up)
    for (let i = 40; i >= 0; i--) {
      const u = i / 40
      ctx.lineTo((u * 2 - 1) * size, lo * Math.pow(1 - (u * 2 - 1) ** 2, 0.9) * size)
    }
    ctx.closePath()
    ctx.fillStyle = '#f2ece2'
    ctx.fill()
    ctx.clip()
    const g = ctx.createRadialGradient(0, 0, size * 0.05, 0, 0, size * 0.34)
    g.addColorStop(0, '#2a0405')
    g.addColorStop(0.3, '#b3141a')
    g.addColorStop(0.85, '#e0262b')
    g.addColorStop(1, '#3a0507')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40, 0, 0, 0.6)'
    ctx.lineWidth = 1
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * size * 0.13, Math.sin(a) * size * 0.13)
      ctx.lineTo(Math.cos(a) * size * 0.33, Math.sin(a) * size * 0.33)
      ctx.stroke()
    }
    ctx.fillStyle = '#050505'
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(-size * 0.1, -size * 0.12, size * 0.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = '#050505'
    ctx.lineWidth = size * 0.05
    ctx.lineCap = 'round'
    lid(-1, up)
    ctx.stroke()
    ctx.lineWidth = size * 0.015
    lid(1, lo)
    ctx.stroke()
    ctx.restore()
  }

  function drawCross(x: number, y: number, k: number) {
    if (k <= 0) return
    const wv = m * 0.13 * easeOut(k) + 2
    const diag = Math.hypot(W, H)
    // The glow first, then the bars, then their red, torn edges.
    const glow = ctx.createRadialGradient(x, y, 0, x, y, diag * 0.6)
    glow.addColorStop(0, `rgba(255,255,255,${0.9 * k})`)
    glow.addColorStop(0.25, `rgba(210,235,255,${0.25 * k})`)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#f7fbff'
    ctx.fillRect(x - wv / 2, 0, wv, H)
    ctx.fillRect(0, y - wv / 2, W, wv)
    ctx.strokeStyle = RED
    ctx.lineCap = 'round'
    for (let pass = 0; pass < 4; pass++) {
      ctx.lineWidth = 2 + pass * 1.6
      ctx.globalAlpha = 0.9 - pass * 0.18
      for (const side of [-1, 1]) {
        // Vertical edges.
        ctx.beginPath()
        for (let yy = 0; yy <= H; yy += 10) {
          const xx = x + side * (wv / 2 + 2 + pass * 2.2) + (hash(yy * 0.13 + pass * 3 + ink.boil) - 0.5) * (3 + pass * 2)
          if (yy === 0) ctx.moveTo(xx, yy)
          else ctx.lineTo(xx, yy)
        }
        ctx.stroke()
        ctx.beginPath()
        for (let xx = 0; xx <= W; xx += 10) {
          const yy = y + side * (wv / 2 + 2 + pass * 2.2) + (hash(xx * 0.17 + pass * 5 + ink.boil) - 0.5) * (3 + pass * 2)
          if (xx === 0) ctx.moveTo(xx, yy)
          else ctx.lineTo(xx, yy)
        }
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    // The white core is solid where the bars cross.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x - wv / 2, y - wv / 2, wv, wv)
  }

  function shatter() {
    const rng = mulberry32(77)
    const cx = W / 2
    const cy = H * 0.4
    const rays = 16
    const angles = Array.from({ length: rays }, (_, i) => (i / rays) * Math.PI * 2 + (rng() - 0.5) * 0.25)
    const diag = Math.hypot(W, H)
    const rings = [0, 0.08, 0.2, 0.42, 0.75, 1.3].map((r) => r * diag)
    const out: { pts: Pt[]; dir: Pt; spin: number; c: Pt }[] = []
    const at = (i: number, j: number) => {
      const a = angles[i % rays]
      const r = rings[j] * (j === 0 ? 0 : 0.9 + 0.2 * hash(i * 7 + j * 13))
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
    }
    for (let i = 0; i < rays; i++) {
      for (let j = 0; j < rings.length - 1; j++) {
        const pts = j === 0 ? [at(i, 0), at(i, 1), at(i + 1, 1)] : [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)]
        const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
        const d = Math.hypot(c.x - cx, c.y - cy) || 1
        out.push({ pts, dir: { x: (c.x - cx) / d, y: (c.y - cy) / d }, spin: (rng() - 0.5) * 1.6, c })
      }
    }
    return out
  }

  // ---- the landing: the fluid, and a look down at your feet

  function drawFeet(t: number) {
    // t: 0 … 1 over the cutscene. White ink on black, on twos.
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const appear = smooth(0, 0.12, t)
    const lookUp = smooth(0.78, 1, t)
    ctx.save()
    ctx.globalAlpha = appear * (1 - lookUp)
    ctx.translate(0, -lookUp * H * 0.5)
    const s = m * 0.5
    const cx = W / 2
    const ground = H * 0.78
    // Ripples from where you stand.
    for (let k = 0; k < 4; k++) {
      const r = ((t * 1.4 + k * 0.25) % 1) * s * 1.4
      ctx.strokeStyle = `rgba(214,230,255,${0.4 * (1 - r / (s * 1.4))})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.ellipse(cx, ground, r * 1.6, r * 0.35, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    // Two shins coming down from the bottom of your view, feet in the fluid.
    for (const side of [-1, 1]) {
      const fx = cx + side * s * 0.22
      const legs: Pt[][] = [
        [
          { x: fx - side * s * 0.02 - s * 0.13, y: -10 },
          { x: fx - s * 0.12, y: ground * 0.45 },
          { x: fx - s * 0.07, y: ground - s * 0.18 },
        ],
        [
          { x: fx + s * 0.15, y: -10 },
          { x: fx + s * 0.12, y: ground * 0.5 },
          { x: fx + s * 0.07, y: ground - s * 0.18 },
        ],
      ]
      ctx.strokeStyle = CHALK
      ctx.lineWidth = 2.2
      legs.forEach((l, li) => {
        ctx.beginPath()
        ctx.moveTo(l[0].x + ink.jit(li + side, 1.5), l[0].y)
        ctx.quadraticCurveTo(l[1].x + ink.jit(li + side + 2, 1.5), l[1].y, l[2].x, l[2].y)
        ctx.stroke()
      })
      // The foot, top-down: the arch, the toes.
      ctx.beginPath()
      ctx.moveTo(fx - s * 0.08, ground - s * 0.18)
      ctx.quadraticCurveTo(fx - s * 0.13, ground + s * 0.05, fx - s * 0.06, ground + s * 0.16)
      ctx.quadraticCurveTo(fx + side * s * 0.02, ground + s * 0.22, fx + s * 0.08, ground + s * 0.14)
      ctx.quadraticCurveTo(fx + s * 0.12, ground + s * 0.02, fx + s * 0.08, ground - s * 0.18)
      ctx.stroke()
      for (let k = 0; k < 5; k++) {
        const tx = fx - s * 0.055 + k * s * 0.03
        ctx.beginPath()
        ctx.arc(tx, ground + s * (0.165 - Math.abs(k - 1.2) * 0.01), s * (0.016 - k * 0.0015), Math.PI, 0)
        ctx.stroke()
      }
      // The black fluid on the skin: sliding down in sheets, dripping off.
      ctx.fillStyle = '#000'
      ctx.strokeStyle = 'rgba(214,230,255,0.85)'
      ctx.lineWidth = 1.2
      for (let k = 0; k < 4; k++) {
        const slide = clamp01(t * 1.5 - k * 0.12)
        const top = ground * (0.2 + k * 0.14) + slide * ground * 0.25
        const x0 = fx - s * 0.11 + k * s * 0.04
        ctx.beginPath()
        ctx.moveTo(x0, top - s * 0.15)
        ctx.quadraticCurveTo(x0 + s * 0.02, top, x0 + s * 0.01, top + s * 0.06)
        ctx.arc(x0 + s * 0.01, top + s * 0.06, s * 0.012, 0, Math.PI)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      // Drops falling from the heel to the surface.
      for (let k = 0; k < 3; k++) {
        const f = (t * 2.2 + k * 0.33 + (side > 0 ? 0.15 : 0)) % 1
        const dx = fx + s * (0.09 + k * 0.01)
        const dy = ground - s * 0.05 + f * s * 0.25
        ctx.beginPath()
        ctx.ellipse(dx, dy, s * 0.008, s * 0.014, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    // The surface line of the fluid, catching light.
    ctx.strokeStyle = 'rgba(214,230,255,0.5)'
    ctx.beginPath()
    ctx.moveTo(0, ground + s * 0.2)
    ctx.lineTo(W, ground + s * 0.2)
    ctx.stroke()
    ctx.restore()
  }

  // ---- composition

  function glitchBands(g: number, time: number, draw: () => void) {
    // Horizontal slices where the other reality shows through, shifted.
    const n = Math.floor(2 + g * 14)
    const tick = Math.floor(time * 10)
    for (let i = 0; i < n; i++) {
      const on = hash(i * 3.7 + tick * 1.3) < 0.35 + g * 0.6
      if (!on) continue
      const y = hash(i * 9.1 + tick * 0.7) * H
      const h = (0.01 + 0.08 * hash(i * 2.3 + tick)) * H * (0.4 + g)
      const dx = (hash(i * 5.5 + tick) - 0.5) * 30 * g
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, y, W, h)
      ctx.clip()
      ctx.translate(dx, 0)
      draw()
      ctx.restore()
    }
  }

  let footStart = -1
  let landed = false

  function render(p: number, time: number) {
    ink.boil = Math.floor(time * 8)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.globalAlpha = 1
    // Landed: the drawing gives way to the fluid behind it.
    if (landed && p >= SEG.fallEnd) {
      gl.style.visibility = 'hidden'
      return
    }

    if (p < SEG.treeEnd + 0.02) {
      // Spiral and tree: the paper world and the dark one, glitching into each other.
      const g = smooth(0.08, 0.27, p)
      const paperScene = () => {
        ctx.drawImage(paperArt!, 0, 0, W, H)
        drawBook(p)
        drawSpiral(p, false, 1 - smooth(0.28, 0.31, p))
        drawCards(p, false, 1)
      }
      const darkScene = () => {
        ctx.drawImage(darkArt!, 0, 0, W, H)
        drawForge(1 - smooth(0.3, 0.34, p), time)
        drawSpiral(p, true, 1 - smooth(0.28, 0.31, p))
        drawCards(p, true, 1)
        if (p > SEG.spiralEnd - 0.01) drawTree((p - SEG.spiralEnd + 0.01) / (SEG.treeEnd - SEG.spiralEnd), 1, time)
      }
      if (g < 0.98) {
        paperScene()
        if (g > 0) glitchBands(g, time, darkScene)
      } else {
        darkScene()
        // Even in the dark, the old page flickers back through now and then.
        if (p < SEG.spiralEnd) glitchBands(0.05, time, paperScene)
      }
    }

    if (p >= SEG.treeEnd - 0.005 && p < SEG.eyeEnd) {
      const k = clamp01((p - SEG.treeEnd) / (SEG.eyeEnd - SEG.treeEnd))
      const ex = W / 2
      const ey = H * 0.4
      const open = smooth(0.08, 0.3, k)
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(darkArt!, 0, 0, W, H)
      drawEye(ex, ey, m * 0.42, open, smooth(0, 0.08, k) * 0.85)
      drawTree(1, 1, time)
      if (k < 0.55) {
        // Reality strains: the bands come thick and fast, the eye through them.
        glitchBands(smooth(0.2, 0.5, k), time, () => {
          ctx.fillStyle = 'rgba(224,38,43,0.15)'
          ctx.fillRect(0, 0, W, H)
          drawEye(ex + 6, ey, m * 0.42, open, 1)
        })
        drawCross(ex, ey, smooth(0.38, 0.55, k))
      } else {
        // The page as it was at the cut, in pieces flying out past us; the sky behind.
        drawCross(ex, ey, 1)
        const g = snap!.getContext('2d')!
        g.setTransform(1, 0, 0, 1, 0, 0)
        g.clearRect(0, 0, snap!.width, snap!.height)
        g.drawImage(flat, 0, 0)
        ctx.clearRect(0, 0, W, H)
        const f = easeOut((k - 0.55) / 0.45)
        const diag = Math.hypot(W, H)
        shards.forEach((sh, i) => {
          const d = f * diag * (0.4 + 0.6 * hash(i))
          const sc = 1 + f * 0.6
          ctx.save()
          ctx.globalAlpha = 1 - smooth(0.6, 1, f)
          ctx.translate(sh.c.x + sh.dir.x * d, sh.c.y + sh.dir.y * d)
          ctx.rotate(sh.spin * f)
          ctx.scale(sc, sc)
          ctx.translate(-sh.c.x, -sh.c.y)
          ctx.beginPath()
          sh.pts.forEach((pt, j) => (j ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)))
          ctx.closePath()
          ctx.save()
          ctx.clip()
          ctx.drawImage(snap!, 0, 0, W, H)
          // The glass's tint, darker at its depth.
          ctx.fillStyle = 'rgba(20, 40, 70, 0.25)'
          ctx.fill()
          ctx.restore()
          ctx.strokeStyle = 'rgba(180, 225, 255, 0.95)'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.restore()
        })
        drawCross(ex, ey, 1 - smooth(0.2, 0.7, f))
      }
    }

    // The sky (its own canvas, under this one).
    const run = clamp01((p - SEG.eyeEnd) / (SEG.runEnd - SEG.eyeEnd))
    const fall = clamp01((p - SEG.runEnd) / (SEG.fallEnd - SEG.runEnd))
    const inSky = p > SEG.eyeEnd - 0.04 && p < SEG.fallEnd + 0.01
    gl.style.visibility = inSky ? 'visible' : 'hidden'
    if (inSky) {
      sky.render(run, fall, time)
      // Speed lines on the leaps and the fall.
      const lines = sky.state.leap * (p > SEG.eyeEnd ? 1 : 0)
      if (lines > 0.2) {
        ctx.save()
        ctx.globalAlpha = (lines - 0.2) * 0.7
        ctx.strokeStyle = sky.state.dark > 0.5 ? CHALK : INK
        const n = 44
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + hash(i + ink.boil) * 0.1
          const r0 = m * (0.42 + 0.2 * hash(i * 3 + ink.boil))
          const r1 = Math.hypot(W, H)
          ctx.lineWidth = 0.6 + hash(i * 7) * 2
          ctx.beginPath()
          ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0)
          ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1)
          ctx.stroke()
        }
        ctx.restore()
      }
    }

    // The splash into the fluid, and the look at your feet.
    if (p >= SEG.fallEnd) {
      const k = clamp01((p - SEG.fallEnd) / (1 - SEG.fallEnd))
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      if (footStart < 0) {
        // A crown of black fluid, rimmed in light.
        ctx.strokeStyle = CHALK
        ctx.lineWidth = 1.6
        const r = m * 0.5 * easeOut(k * 1.6)
        for (let i = 0; i < 22; i++) {
          const a = Math.PI + (i / 21) * Math.PI
          const len = m * (0.08 + 0.12 * hash(i)) * Math.sin(Math.PI * clamp01(k * 1.6))
          const x = W / 2 + Math.cos(a) * r * 1.4
          const y = H * 0.7 + Math.sin(a) * r * 0.2
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y - len * 0.8, x + Math.cos(a) * len, y - len)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x + Math.cos(a) * len, y - len - 4, 2.4, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.ellipse(W / 2, H * 0.7, r * 1.4, r * 0.2, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (k > 0.6 && footStart < 0 && !landed) footStart = time
    }
    if (footStart >= 0) {
      const ft = (time - footStart) / 2.4
      if (ft < 1) drawFeet(ft)
      else if (!landed) {
        landed = true
        onLanded?.()
      }
    }
  }

  let onLanded: (() => void) | null = null
  return {
    resize,
    render,
    // Called once, when the landing cutscene ends.
    onLanded(fn: () => void) {
      onLanded = fn
    },
    playing: () => footStart >= 0 && !landed,
    reset() {
      footStart = -1
      landed = false
    },
    dispose() {
      sky.dispose()
    },
  }
}
