import { MILESTONES, TREE } from '../content/forge'
import { LEAVES } from '../content/story'
import { Ink, Writer, clamp01, easeInOut, easeOut, hash, mulberry32, smooth, type Pt } from './ink'
import { P } from './palette'

// The descent, drawn: a function of the scroll (p, 0 … 1), and then of a
// clock for the cutscene where the eye opens and the rays cut the page.
//
//   spiral (p 0 … .55)  the pothi on the page, the spiral inked on its leaf;
//                       down into it — a nautilus, chamber by chamber,
//                       hatched and gilded, the milestones riding its arm,
//                       Renaissance engineering plates behind. Reality slips:
//                       smeared, channel-split slices of a forge in the dark
//                       show through, more and more, until the dark is all.
//                       The spiral's eye becomes the moon.
//   tree (p .55 … 1)    night. The tree of wisdom grows up past the moon:
//                       a branch per domain, an ema tag hanging from each,
//                       a paper slip under it naming what grows there.
//   the eye (clock)     the moon cracks and opens: an eye. It gathers the
//                       light; a ray falls through the page, then another
//                       across it. The page burns along the cross — and the
//                       sky (sky.ts) takes it from there.

export const SPIRAL_END = 0.55
export const EYE_CUT = 3.3 // seconds into the cutscene when the page comes apart
export const EYE_LENGTH = 4.4

const B = 0.3063 // a golden spiral, r = e^(bθ): it grows by φ every quarter turn
const Z_MAX = 9.2
const SERIF = "'Instrument Serif', serif"
const SANS = "'Inter Tight Variable', sans-serif"
const MONO = "'JetBrains Mono Variable', monospace"
const DEVA = "'Kalam', serif"
const TIRO = "'Tiro Devanagari Sanskrit', serif"

type Leaf = { x: number; y: number; a: number; s: number; tone: number }
type Branch = { pts: Pt[]; width: number; node: Pt; side: number; leaves: Leaf[]; name: string; hi: string; techs: string[] }

export function createDescent(flat: HTMLCanvasElement) {
  const ctx = flat.getContext('2d')!
  const ink = new Ink(ctx)
  const writer = new Writer(ctx, 1)
  let W = 1
  let H = 1
  let m = 1
  let dpr = 1
  let paperArt: HTMLCanvasElement | null = null
  let futureArt: HTMLCanvasElement | null = null
  let nightArt: HTMLCanvasElement | null = null
  let trunk: { left: Pt[]; right: Pt[] } | null = null
  let roots: { pts: Pt[]; w: number }[] = []
  let branches: Branch[] = []
  let crown: Leaf[] = []
  let treeHeight = 1
  let baseY = 1
  const sparks = Array.from({ length: 90 }, (_, i) => i)

  function resize(w: number, h: number) {
    W = w
    H = h
    m = Math.min(w, h)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    flat.width = Math.round(w * dpr)
    flat.height = Math.round(h * dpr)
    writer.dpr = dpr
    writer.clear()
    paperArt = plates()
    futureArt = forgeBackdrop()
    nightArt = nightSky()
    growTree()
  }

  const offscreen = () => {
    const c = document.createElement('canvas')
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    return { c, g, pen: new Ink(g) }
  }

  // ---------------------------------------------------------------- the paper

  // Aged paper, and engineering plates after the notebooks: a gear train,
  // an ornithopter's wing, a compass at work, the spiral's maths in the margin.
  function plates() {
    const { c, g, pen } = offscreen()
    const rng = mulberry32(3)
    g.fillStyle = P.paper
    g.fillRect(0, 0, W, H)
    const edge = g.createRadialGradient(W / 2, H / 2, m * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62)
    edge.addColorStop(0, 'rgba(160, 120, 60, 0)')
    edge.addColorStop(1, 'rgba(150, 105, 50, 0.32)')
    g.fillStyle = edge
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(150, 100, 45, ${0.03 + rng() * 0.05})`
      g.beginPath()
      g.arc(rng() * W, rng() * H, 4 + rng() * 26, 0, Math.PI * 2)
      g.fill()
    }
    for (let i = 0; i < W * H * 0.006; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(110, 80, 40, 0.07)' : 'rgba(255, 255, 255, 0.1)'
      g.fillRect(rng() * W, rng() * H, 1.3, 1.3)
    }
    const line = 'rgba(52, 36, 24, 0.42)'
    const faint = 'rgba(52, 36, 24, 0.2)'
    // A gear, its teeth shaded on the side away from the light.
    const gear = (x: number, y: number, r: number, teeth: number, rot: number) => {
      g.save()
      g.translate(x, y)
      g.rotate(rot)
      g.beginPath()
      for (let k = 0; k <= teeth * 4; k++) {
        const a = (k / (teeth * 4)) * Math.PI * 2
        const rr = r * (k % 4 < 2 ? 1 : 0.87)
        if (k === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.closePath()
      g.fillStyle = 'rgba(120, 90, 50, 0.07)'
      g.fill()
      g.strokeStyle = line
      g.lineWidth = 1.3
      g.stroke()
      g.save()
      g.clip()
      g.strokeStyle = faint
      g.lineWidth = 0.8
      for (let s = -r; s < r; s += 5) {
        g.beginPath()
        g.moveTo(s, 0)
        g.lineTo(s + r * 0.6, r)
        g.stroke()
      }
      g.restore()
      g.restore()
      pen.circle(x, y, r * 0.6, 1, faint, 1, x)
      pen.circle(x, y, r * 0.14, 1.3, line, 1, y)
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rot
        pen.line(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, 1.4, faint, 1, k)
      }
    }
    gear(W * 0.12, H * 0.22, m * 0.12, 18, 0.1)
    gear(W * 0.12 + m * 0.195, H * 0.22 + m * 0.055, m * 0.08, 12, 0.3)
    gear(W * 0.88, H * 0.8, m * 0.14, 20, 0.2)
    // The wing: a spar and its ribs.
    const wx = W * 0.84
    const wy = H * 0.17
    for (let k = 0; k < 10; k++) {
      const a = -0.18 - k * 0.12
      const len = m * (0.32 - k * 0.018)
      g.strokeStyle = k % 3 ? faint : line
      g.lineWidth = k % 3 ? 0.9 : 1.4
      g.beginPath()
      for (let s = 0; s <= 14; s++) {
        const u = s / 14
        const x = wx - Math.cos(a) * len * u
        const y = wy - Math.sin(a) * len * u + Math.sin(u * Math.PI) * m * 0.022
        if (s) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.stroke()
    }
    // The compass, describing a circle.
    const cx = W * 0.17
    const cy = H * 0.78
    pen.circle(cx, cy, m * 0.15, 1.1, line, 1, 2)
    g.strokeStyle = line
    g.lineWidth = 1.2
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + m * 0.07, cy - m * 0.24)
    g.lineTo(cx + m * 0.15, cy)
    g.stroke()
    pen.circle(cx + m * 0.07, cy - m * 0.24, 4, 1.2, line, 1, 0)
    // The spiral's maths, in the margins.
    g.fillStyle = 'rgba(52, 36, 24, 0.55)'
    g.font = `italic ${Math.round(m * 0.026)}px ${SERIF}`
    g.fillText('r = e^{bθ},  b = ln φ / (π/2)', W * 0.62, H * 0.42)
    g.fillText('φ = 1.6180…', W * 0.66, H * 0.47)
    g.font = `${Math.round(m * 0.024)}px ${DEVA}`
    g.fillText('स्वर्णानुपातः', W * 0.66, H * 0.52)
    g.font = `${Math.round(m * 0.016)}px ${MONO}`
    g.fillStyle = 'rgba(160, 30, 20, 0.6)'
    g.fillText('FIG. II — THE DESCENT', W * 0.06, H * 0.95)
    return c
  }

  // The forge behind reality: black, a floor grid running to a horizon, a
  // vertical title; the anvil is drawn live.
  function forgeBackdrop() {
    const { c, g } = offscreen()
    g.fillStyle = P.forge
    g.fillRect(0, 0, W, H)
    const glow = g.createRadialGradient(W / 2, H * 0.82, 0, W / 2, H * 0.82, m * 0.8)
    glow.addColorStop(0, 'rgba(255, 106, 43, 0.25)')
    glow.addColorStop(1, 'rgba(255, 106, 43, 0)')
    g.fillStyle = glow
    g.fillRect(0, 0, W, H)
    const horizon = H * 0.62
    g.strokeStyle = 'rgba(242, 178, 74, 0.16)'
    g.lineWidth = 1
    for (let i = -20; i <= 20; i++) {
      g.beginPath()
      g.moveTo(W / 2 + i * W * 0.02, horizon)
      g.lineTo(W / 2 + i * W * 0.22, H)
      g.stroke()
    }
    for (let k = 1; k < 14; k++) {
      const y = horizon + (H - horizon) * Math.pow(k / 14, 2)
      g.globalAlpha = 0.25 + 0.6 * (k / 14)
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y)
      g.stroke()
    }
    g.globalAlpha = 1
    g.fillStyle = 'rgba(212, 36, 28, 0.9)'
    g.font = `${Math.round(m * 0.032)}px ${SERIF}`
    ;['鍛', '冶', '場'].forEach((ch, i) => g.fillText(ch, W - m * 0.07, H * 0.14 + i * m * 0.042))
    g.font = `${Math.round(m * 0.015)}px ${MONO}`
    g.fillStyle = 'rgba(241, 235, 223, 0.45)'
    g.fillText('02 — THE FORGE', m * 0.05, H - m * 0.05)
    return c
  }

  // Night: deep indigo, stars, thin cloud lit by the moon from beneath.
  function nightSky() {
    const { c, g } = offscreen()
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#05060D')
    sky.addColorStop(0.6, P.night)
    sky.addColorStop(1, P.indigo)
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    const rng = mulberry32(11)
    for (let i = 0; i < 260; i++) {
      const s = rng()
      g.fillStyle = `rgba(241, 235, 223, ${0.2 + s * 0.6})`
      g.fillRect(rng() * W, rng() * H * 0.85, s > 0.92 ? 2 : 1, s > 0.92 ? 2 : 1)
    }
    g.strokeStyle = 'rgba(180, 190, 230, 0.12)'
    for (let i = 0; i < 9; i++) {
      const y = H * (0.2 + rng() * 0.45)
      g.lineWidth = 2 + rng() * 5
      g.beginPath()
      g.moveTo(rng() * W * 0.4, y)
      g.bezierCurveTo(W * 0.4, y - 8, W * 0.6, y + 8, W * (0.6 + rng() * 0.4), y)
      g.stroke()
    }
    return c
  }

  // ---------------------------------------------------------------- the pothi

  // Palm leaf between two wooden boards, a red cord through it, the
  // curiosity chapter written across it, the spiral inked in its middle.
  function drawPothi(k: number) {
    const cx = W / 2
    const cy = H / 2
    const lw = m * 1.35 * k
    const lh = m * 0.3 * k
    if (lw > W * 40) return
    ctx.save()
    // Past it, into the spiral, the book falls away.
    ctx.globalAlpha = 1 - smooth(2.5, 7, k)
    if (ctx.globalAlpha <= 0) return ctx.restore()
    for (const dy of [lh * 0.18, -lh * 0.12]) {
      ctx.fillStyle = dy > 0 ? '#6B3F22' : '#7A4A28'
      ctx.beginPath()
      ctx.roundRect(cx - lw * 0.52, cy - lh * 0.55 + dy, lw * 1.04, lh * 1.1, lh * 0.4)
      ctx.fill()
      ctx.strokeStyle = P.sepia
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    const leaf = ctx.createLinearGradient(0, cy - lh / 2, 0, cy + lh / 2)
    leaf.addColorStop(0, '#EED9A6')
    leaf.addColorStop(0.5, '#E7CF96')
    leaf.addColorStop(1, '#D9BC7E')
    ctx.fillStyle = leaf
    ctx.beginPath()
    ctx.roundRect(cx - lw / 2, cy - lh / 2, lw, lh, lh * 0.45)
    ctx.fill()
    ctx.strokeStyle = P.sepia
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.strokeStyle = 'rgba(140, 100, 40, 0.18)'
    ctx.lineWidth = 0.8
    for (let i = 0; i < 26; i++) {
      const y = cy - lh * 0.45 + (lh * 0.9 * i) / 25
      ctx.beginPath()
      ctx.moveTo(cx - lw * 0.47, y)
      ctx.lineTo(cx + lw * 0.47, y + Math.sin(i) * 1.5)
      ctx.stroke()
    }
    if (k < 6) {
      const lines = LEAVES.slice(0, 3).flatMap((l) => l.sanskrit)
      ctx.fillStyle = 'rgba(40, 24, 14, 0.82)'
      ctx.font = `${Math.max(5, lh * 0.068)}px ${TIRO}`
      ctx.textBaseline = 'middle'
      for (let i = 0; i < 6; i++) {
        const y = cy - lh * 0.32 + (lh * 0.64 * i) / 5
        ctx.textAlign = 'right'
        ctx.fillText(lines[i % lines.length], cx - lw * 0.14, y, lw * 0.3)
        ctx.textAlign = 'left'
        ctx.fillText(lines[(i + 3) % lines.length], cx + lw * 0.14, y, lw * 0.3)
      }
      ctx.textBaseline = 'alphabetic'
    }
    for (const sx of [-0.33, 0.33]) {
      ctx.fillStyle = '#5A3418'
      ctx.beginPath()
      ctx.arc(cx + lw * sx, cy, lh * 0.06, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = P.vermilion
      ctx.lineWidth = Math.max(1.5, lh * 0.025)
      ctx.beginPath()
      ctx.moveTo(cx + lw * sx, cy)
      ctx.quadraticCurveTo(cx + lw * sx + lh * 0.2, cy + lh * 0.7, cx + lw * sx - lh * 0.1, cy + lh * 1.1)
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---------------------------------------------------------------- the spiral

  function spiralScale(sp: number) {
    const z = Z_MAX * easeInOut(clamp01(sp / 0.92))
    return { z, s: m * 0.035 * Math.exp(z), rot: -(z / B) * 0.55 }
  }

  // The shell: each chamber filled and hatched (deeper toward the inner
  // wall), the outer wall a heavy tapering line, the septa swept back, the
  // siphuncle threading them, gold leaf in some chambers.
  function drawShell(sp: number, dark: boolean) {
    const { s, rot } = spiralScale(sp)
    const cx = W / 2
    const cy = H / 2
    const diag = Math.hypot(W, H)
    const leaf = m * 0.13 * (s / (m * 0.035)) * (1 + 40 * smooth(0.04, 0.14, sp))
    const thLo = Math.log(1.2 / s) / B
    const thHi = Math.min(Math.log((diag * 1.2) / s) / B + 2 * Math.PI, Math.log(leaf / s) / B)
    const R = (th: number) => Math.exp(B * th) * s
    const at = (th: number, r: number) => ({ x: cx + Math.cos(th + rot) * r, y: cy + Math.sin(th + rot) * r })
    const lineCol = dark ? P.bone : P.sepia
    const SEPT = 0.62
    for (let th = Math.floor(thLo / SEPT) * SEPT; th < thHi; th += SEPT) {
      const r1 = R(th + SEPT)
      if (r1 < 2 || R(th - 2 * Math.PI) > diag) continue
      const poly: Pt[] = []
      for (let k = 0; k <= 6; k++) poly.push(at(th + (SEPT * k) / 6, R(th + (SEPT * k) / 6)))
      for (let k = 6; k >= 0; k--) poly.push(at(th + (SEPT * k) / 6, R(th + (SEPT * k) / 6 - 2 * Math.PI)))
      const idx = Math.round(th / SEPT)
      const gilded = !dark && ((idx % 7) + 7) % 7 === 3
      ctx.beginPath()
      poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      if (dark) ctx.fillStyle = idx % 2 ? 'rgba(242, 178, 74, 0.07)' : 'rgba(241, 235, 223, 0.03)'
      else if (gilded) {
        const gd = ctx.createLinearGradient(poly[0].x, poly[0].y, poly[9].x, poly[9].y)
        gd.addColorStop(0, '#F6CF7A')
        gd.addColorStop(0.5, '#D8A045')
        gd.addColorStop(1, '#F2C060')
        ctx.fillStyle = gd
      } else ctx.fillStyle = idx % 2 ? 'rgba(214, 192, 150, 0.5)' : 'rgba(232, 214, 176, 0.5)'
      ctx.fill()
      if (r1 > 24 && r1 < diag * 1.4) {
        ctx.save()
        ctx.clip()
        ctx.strokeStyle = dark ? 'rgba(241, 235, 223, 0.12)' : gilded ? 'rgba(120, 70, 20, 0.35)' : 'rgba(52, 36, 24, 0.22)'
        ctx.lineWidth = Math.min(0.6 + r1 * 0.002, 2)
        for (let k = 1; k < 9; k++) {
          const u = Math.pow(k / 9, 1.6)
          ctx.beginPath()
          for (let j = 0; j <= 8; j++) {
            const t = th + (SEPT * j) / 8
            const p = at(t, R(t - 2 * Math.PI) + (R(t) - R(t - 2 * Math.PI)) * u)
            if (j) ctx.lineTo(p.x, p.y)
            else ctx.moveTo(p.x, p.y)
          }
          ctx.stroke()
        }
        ctx.restore()
      }
      // The septum, swept back in a deep curve.
      const a0 = at(th, R(th - 2 * Math.PI))
      const a1 = at(th, R(th))
      const mid = at(th - 0.5, (R(th) + R(th - 2 * Math.PI)) / 2)
      ctx.strokeStyle = lineCol
      ctx.lineWidth = Math.min(0.6 + r1 * 0.006, 4)
      ctx.beginPath()
      ctx.moveTo(a0.x + ink.jit(idx, 0.6), a0.y)
      ctx.quadraticCurveTo(mid.x, mid.y, a1.x, a1.y)
      ctx.stroke()
      // The siphuncle, a bead in each chamber.
      const t2 = th + SEPT / 2
      const sip = at(t2, R(t2 - 2 * Math.PI) + (R(t2) - R(t2 - 2 * Math.PI)) * 0.3)
      ctx.beginPath()
      ctx.arc(sip.x, sip.y, Math.max(1, r1 * 0.012), 0, Math.PI * 2)
      ctx.fillStyle = dark ? P.gold : P.vermilion
      ctx.fill()
    }
    // The outer wall, its channels split in the dark.
    let prev: Pt | null = null
    ctx.lineCap = 'round'
    for (let th = thLo; th <= thHi; th += 0.035) {
      const r = R(th)
      const p = at(th, r)
      if (prev) {
        ctx.lineWidth = Math.min(0.8 + r * 0.016, 12)
        if (dark) {
          ctx.strokeStyle = 'rgba(255, 46, 99, 0.6)'
          ctx.beginPath()
          ctx.moveTo(prev.x + 3, prev.y)
          ctx.lineTo(p.x + 3, p.y)
          ctx.stroke()
          ctx.strokeStyle = 'rgba(95, 225, 255, 0.6)'
          ctx.beginPath()
          ctx.moveTo(prev.x - 3, prev.y)
          ctx.lineTo(p.x - 3, p.y)
          ctx.stroke()
        }
        ctx.strokeStyle = lineCol
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
      prev = p
    }
  }

  // The milestones, each a cartouche on the arm: deckled paper, a gold rule,
  // a vermilion seal with its number, written on as it nears.
  function drawCartouches(sp: number, dark: boolean) {
    const { s, rot } = spiralScale(sp)
    const n = MILESTONES.length
    MILESTONES.forEach((ms, i) => {
      const zi = 1.7 + (i / Math.max(n - 1, 1)) * (Z_MAX - 3.4)
      const th = (Math.log(0.36 / 0.035) - zi) / B
      const r = Math.exp(B * th) * s
      const size = r * 0.5
      const k = smooth(m * 0.05, m * 0.14, size) * (1 - smooth(m * 0.6, m * 1.05, size))
      if (k <= 0.01) return
      const rm = ((Math.exp(B * th) + Math.exp(B * (th - 2 * Math.PI))) / 2) * s
      const a = th + rot - 0.25
      const x = W / 2 + Math.cos(a) * rm
      const y = H / 2 + Math.sin(a) * rm
      const w = size * 2.2
      const h = size * 1.0
      const write = smooth(m * 0.08, m * 0.22, size)
      ctx.save()
      ctx.globalAlpha = k
      ctx.translate(x, y)
      ctx.rotate(Math.sin(i * 1.7) * 0.05)
      ctx.fillStyle = 'rgba(30, 18, 10, 0.25)'
      ctx.fillRect(-w / 2 + size * 0.04, -h / 2 + size * 0.05, w, h)
      ctx.beginPath()
      for (let j = 0; j <= 24; j++) ctx.lineTo(-w / 2 + (w * j) / 24, -h / 2 + (hash(j + i * 31) - 0.5) * size * 0.02)
      for (let j = 0; j <= 10; j++) ctx.lineTo(w / 2 + (hash(j * 3 + i) - 0.5) * size * 0.02, -h / 2 + (h * j) / 10)
      for (let j = 24; j >= 0; j--) ctx.lineTo(-w / 2 + (w * j) / 24, h / 2 + (hash(j * 7 + i) - 0.5) * size * 0.02)
      ctx.closePath()
      ctx.fillStyle = dark ? '#121016' : '#F6EFDF'
      ctx.fill()
      ctx.strokeStyle = dark ? P.gold : P.sepia
      ctx.lineWidth = Math.max(1, size * 0.008)
      ctx.stroke()
      ctx.strokeStyle = P.gold
      ctx.lineWidth = Math.max(1, size * 0.012)
      ctx.beginPath()
      ctx.moveTo(-w / 2 + size * 0.1, -h / 2 + size * 0.2)
      ctx.lineTo(w / 2 - size * 0.1, -h / 2 + size * 0.2)
      ctx.stroke()
      const sealX = w / 2 - size * 0.3
      const sealY = -h / 2 + size * 0.36
      ctx.fillStyle = P.vermilion
      ctx.beginPath()
      ctx.roundRect(sealX - size * 0.13, sealY - size * 0.13, size * 0.26, size * 0.26, size * 0.03)
      ctx.fill()
      ctx.fillStyle = '#FCEFE6'
      ctx.font = `${Math.round(size * 0.13)}px ${MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1).padStart(2, '0'), sealX, sealY + size * 0.005)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.beginPath()
      ctx.rect(-w / 2, -h / 2, w * write, h)
      ctx.clip()
      ctx.fillStyle = dark ? P.gold : P.vermilion
      ctx.font = `${Math.round(size * 0.075)}px ${MONO}`
      ctx.fillText(`MILESTONE · ${ms.year.toUpperCase()}`, -w / 2 + size * 0.1, -h / 2 + size * 0.14)
      ctx.fillStyle = dark ? P.bone : P.sepia
      ctx.font = `italic ${Math.round(size * 0.3)}px ${SERIF}`
      ctx.fillText(ms.title, -w / 2 + size * 0.1, -h / 2 + size * 0.52)
      ctx.font = `${Math.round(size * 0.085)}px ${SANS}`
      ctx.fillStyle = dark ? 'rgba(241,235,223,0.7)' : 'rgba(42,29,20,0.78)'
      wrap(ms.note, w - size * 0.25).forEach((ln, li) => ctx.fillText(ln, -w / 2 + size * 0.1, -h / 2 + size * 0.7 + li * size * 0.11))
      ctx.restore()
    })
  }

  function wrap(text: string, width: number) {
    const lines: string[] = []
    let cur = ''
    for (const w of text.split(' ')) {
      const next = cur ? `${cur} ${w}` : w
      if (ctx.measureText(next).width > width && cur) {
        lines.push(cur)
        cur = w
      } else cur = next
    }
    if (cur) lines.push(cur)
    return lines.slice(0, 3)
  }

  // The anvil in the forge: a bar on it glowing, a hammer rising and
  // striking, sparks thrown off the blow.
  function drawAnvil(time: number) {
    const x = W * 0.5
    const y = H * 0.8
    const s = m * 0.24
    ctx.save()
    const body = () => {
      ctx.beginPath()
      ctx.moveTo(x - s, y - s * 0.32)
      ctx.lineTo(x + s * 0.7, y - s * 0.32)
      ctx.quadraticCurveTo(x + s * 1.3, y - s * 0.3, x + s * 1.4, y - s * 0.1)
      ctx.quadraticCurveTo(x + s * 0.9, y - s * 0.12, x + s * 0.55, y - s * 0.04)
      ctx.lineTo(x + s * 0.4, y + s * 0.26)
      ctx.lineTo(x + s * 0.68, y + s * 0.42)
      ctx.lineTo(x - s * 0.68, y + s * 0.42)
      ctx.lineTo(x - s * 0.4, y + s * 0.26)
      ctx.lineTo(x - s * 0.55, y - s * 0.04)
      ctx.quadraticCurveTo(x - s, y - s * 0.12, x - s, y - s * 0.32)
    }
    const g = ctx.createLinearGradient(0, y - s * 0.35, 0, y + s * 0.4)
    g.addColorStop(0, '#2B2420')
    g.addColorStop(0.1, '#141012')
    g.addColorStop(1, '#0A0809')
    ctx.fillStyle = g
    body()
    ctx.fill()
    ctx.strokeStyle = 'rgba(242, 178, 74, 0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.strokeStyle = P.gold
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - s, y - s * 0.32)
    ctx.lineTo(x + s * 0.7, y - s * 0.32)
    ctx.quadraticCurveTo(x + s * 1.3, y - s * 0.3, x + s * 1.4, y - s * 0.1)
    ctx.stroke()
    const bar = ctx.createLinearGradient(x - s * 0.5, 0, x + s * 0.5, 0)
    bar.addColorStop(0, '#7A1A08')
    bar.addColorStop(0.5, '#FFD27A')
    bar.addColorStop(1, '#C2410C')
    ctx.fillStyle = bar
    ctx.shadowColor = P.ember
    ctx.shadowBlur = 30
    ctx.fillRect(x - s * 0.55, y - s * 0.4, s * 1.1, s * 0.07)
    ctx.shadowBlur = 0
    const beat = (time % 1.4) / 1.4
    const lift = beat < 0.72 ? easeOut(beat / 0.72) : 1 - easeOut((beat - 0.72) / 0.08)
    const hx = x + s * 0.05
    const hy = y - s * 0.45 - lift * s * 0.7
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(-0.5 * lift)
    ctx.fillStyle = '#4A2E1A'
    ctx.fillRect(-s * 0.03, -s * 0.12, s * 0.06, -s * 0.8)
    ctx.fillStyle = '#16120F'
    ctx.strokeStyle = P.gold
    ctx.lineWidth = 1.5
    ctx.fillRect(-s * 0.18, -s * 0.12, s * 0.36, s * 0.18)
    ctx.strokeRect(-s * 0.18, -s * 0.12, s * 0.36, s * 0.18)
    ctx.restore()
    const since = beat > 0.8 ? (beat - 0.8) / 0.2 : 1 + beat
    ctx.lineCap = 'round'
    sparks.forEach((i) => {
      const k = since * 0.9 + hash(i * 1.7) * 0.25
      if (k > 1) return
      const a = -Math.PI / 2 + (hash(i) - 0.5) * 2.8
      const v = s * (0.8 + hash(i * 2.1) * 1.8)
      const px = hx + Math.cos(a) * v * k
      const py = y - s * 0.4 + Math.sin(a) * v * k + k * k * s * 1.3
      ctx.strokeStyle = hash(i * 5.3) > 0.4 ? '#FFD27A' : P.ember
      ctx.globalAlpha = 1 - k
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px - Math.cos(a) * 9, py - Math.sin(a) * 9 + 3)
      ctx.stroke()
    })
    ctx.restore()
  }

  // Slices of the other reality: shifted, a strip of it smeared sideways,
  // its channels pulled apart at the seams.
  function glitch(g: number, time: number, other: () => void) {
    const n = Math.floor(3 + g * 16)
    const tick = Math.floor(time * 12)
    for (let i = 0; i < n; i++) {
      if (hash(i * 3.7 + tick * 1.3) > 0.3 + g * 0.65) continue
      const y = hash(i * 9.1 + tick * 0.7) * H
      const h = (0.008 + 0.07 * hash(i * 2.3 + tick)) * H * (0.4 + g)
      const dx = (hash(i * 5.5 + tick) - 0.5) * 40 * g
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, y, W, h)
      ctx.clip()
      ctx.translate(dx, 0)
      other()
      ctx.restore()
      if (hash(i * 7.7 + tick) > 0.7) {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 0.6
        ctx.drawImage(flat, 0, Math.floor((y + h / 2) * dpr), flat.width, 2, Math.floor(dx * dpr), Math.floor(y * dpr), flat.width, Math.ceil(h * dpr))
        ctx.restore()
      }
      ctx.fillStyle = 'rgba(255, 46, 99, 0.55)'
      ctx.fillRect(0, y, W, 1.5)
      ctx.fillStyle = 'rgba(95, 225, 255, 0.55)'
      ctx.fillRect(0, y + h - 1.5, W, 1.5)
    }
  }

  // ---------------------------------------------------------------- the tree

  const moon = () => ({ x: W / 2, y: H * 0.3, r: m * 0.15 })

  function growTree() {
    const rng = mulberry32(17)
    const n = TREE.length
    const portrait = W < H
    const step = Math.max(H * 0.36, 240)
    treeHeight = step * (n + 0.9)
    baseY = H * 0.92
    const cx = W / 2
    const left: Pt[] = []
    const right: Pt[] = []
    for (let i = 0; i <= 50; i++) {
      const u = i / 50
      const x = cx + Math.sin(u * 6.3) * m * 0.018 * (1 - u * 0.4)
      const w = m * (0.07 * Math.pow(1 - u, 1.4) + 0.012) * (1 + 0.7 * Math.pow(1 - u, 8))
      left.push({ x: x - w, y: baseY - treeHeight * u })
      right.push({ x: x + w, y: baseY - treeHeight * u })
    }
    trunk = { left, right }
    roots = Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI * (0.06 + (i / 8) * 0.88)
      const len = m * (0.18 + rng() * 0.14)
      const pts: Pt[] = []
      for (let s = 0; s <= 16; s++) {
        const u = s / 16
        pts.push({ x: cx + Math.cos(a) * len * u + Math.sin(u * 5 + i) * 4, y: baseY + Math.sin(a) * m * 0.035 * u + u * u * 6 })
      }
      return { pts, w: m * (0.012 + rng() * 0.012) }
    })
    const reach = portrait ? W * 0.2 : Math.min(W * 0.2, 300)
    branches = TREE.map((b, i) => {
      const side = i % 2 ? 1 : -1
      const fromY = baseY - step * (i + 0.8)
      const node = { x: cx + side * reach, y: fromY - step * 0.3 }
      const pts: Pt[] = []
      for (let s = 0; s <= 18; s++) {
        const u = s / 18
        pts.push({ x: cx + (node.x - cx) * easeOut(u), y: fromY + (node.y - fromY) * u * u - Math.sin(u * Math.PI) * 6 })
      }
      const leaves: Leaf[] = Array.from({ length: 26 }, () => {
        const a = rng() * Math.PI * 2
        const r = Math.sqrt(rng()) * m * 0.075
        return { x: node.x + Math.cos(a) * r * 1.4, y: node.y - m * 0.03 + Math.sin(a) * r * 0.8, a: rng() * Math.PI * 2, s: m * (0.012 + rng() * 0.01), tone: rng() }
      })
      return { pts, width: m * 0.016, node, side, leaves, name: b.name, hi: b.hi, techs: b.leaves }
    })
    const top = { x: cx, y: baseY - treeHeight }
    crown = Array.from({ length: 140 }, () => {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * m * 0.22
      return { x: top.x + Math.cos(a) * r * 1.6, y: top.y + Math.sin(a) * r * 0.7, a: rng() * Math.PI * 2, s: m * (0.013 + rng() * 0.012), tone: rng() }
    })
  }

  function leafShape(l: Leaf, sway: number) {
    const a = l.a + sway
    const c = Math.cos(a)
    const s = Math.sin(a)
    const tip = { x: l.x + c * l.s * 2, y: l.y + s * l.s * 2 }
    ctx.beginPath()
    ctx.moveTo(l.x, l.y)
    ctx.quadraticCurveTo(l.x + c * l.s - s * l.s * 0.7, l.y + s * l.s + c * l.s * 0.7, tip.x, tip.y)
    ctx.quadraticCurveTo(l.x + c * l.s + s * l.s * 0.7, l.y + s * l.s - c * l.s * 0.7, l.x, l.y)
  }

  function drawLeaves(list: Leaf[], grown: number, time: number) {
    const step = Math.floor(time * 6) / 6
    list.forEach((l, i) => {
      if (hash(i * 1.3) > grown) return
      leafShape(l, Math.sin(step * 1.4 + l.x * 0.02) * 0.12)
      // Moonlit from above: the upper leaves pale gold, the lower ones in shadow.
      ctx.fillStyle = l.tone > 0.6 ? 'rgba(242, 178, 74, 0.92)' : l.tone > 0.25 ? 'rgba(185, 128, 42, 0.9)' : 'rgba(90, 60, 30, 0.9)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(10, 8, 12, 0.85)'
      ctx.lineWidth = 0.8
      ctx.stroke()
    })
  }

  // An ema: the wooden prayer tag, hung on a red cord, swinging. The domain
  // is written on it; under it a paper slip naming what grows there.
  function drawTag(b: Branch, k: number, time: number) {
    if (k <= 0) return
    const portrait = W < H
    const tw = portrait ? 118 : 150
    const th = portrait ? 66 : 76
    const swing = Math.sin(time * 1.3 + b.node.x * 0.01) * 0.05
    ctx.save()
    ctx.translate(b.node.x + b.side * m * 0.04, b.node.y + m * 0.01)
    ctx.rotate(swing + (1 - easeOut(k)) * 0.6 * b.side)
    ctx.globalAlpha = smooth(0, 0.3, k)
    ctx.strokeStyle = P.vermilion
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 26)
    ctx.stroke()
    ctx.translate(0, 26)
    ctx.beginPath()
    ctx.moveTo(-tw / 2, th * 0.2)
    ctx.lineTo(0, 0)
    ctx.lineTo(tw / 2, th * 0.2)
    ctx.lineTo(tw / 2, th)
    ctx.lineTo(-tw / 2, th)
    ctx.closePath()
    const wood = ctx.createLinearGradient(0, 0, 0, th)
    wood.addColorStop(0, '#E8C98E')
    wood.addColorStop(1, '#C99A5A')
    ctx.fillStyle = wood
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = 'rgba(120, 70, 30, 0.22)'
    ctx.lineWidth = 1
    for (let y = 6; y < th; y += 6) {
      ctx.beginPath()
      ctx.moveTo(-tw / 2, y)
      ctx.bezierCurveTo(-tw / 4, y + 3, tw / 4, y - 3, tw / 2, y + 1)
      ctx.stroke()
    }
    ctx.restore()
    ctx.strokeStyle = P.vermilion
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#2A1408'
    ctx.textAlign = 'center'
    ctx.font = `600 ${portrait ? 14 : 16}px ${SANS}`
    ctx.fillText(b.name, 0, th * 0.58)
    ctx.fillStyle = P.vermilion
    ctx.font = `700 ${portrait ? 15 : 17}px ${DEVA}`
    ctx.fillText(b.hi, 0, th * 0.86)
    const lh = portrait ? 16 : 17
    const sh = (b.techs.length * lh + 18) * smooth(0.3, 1, k)
    const sw = portrait ? 108 : 132
    ctx.translate(0, th + 4)
    ctx.fillStyle = '#F4EEE2'
    ctx.beginPath()
    ctx.moveTo(-sw / 2, 0)
    ctx.lineTo(sw / 2, 0)
    ctx.lineTo(sw / 2, sh)
    ctx.lineTo(0, sh + 6)
    ctx.lineTo(-sw / 2, sh)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(42, 29, 20, 0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = P.sepia
    ctx.font = `${portrait ? 10.5 : 11.5}px ${MONO}`
    b.techs.forEach((t, i) => ctx.fillText(t, 0, 16 + i * lh))
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.restore()
  }

  // The night, the moon, and the tree growing up past it (k 0 … 1).
  function drawNight(k: number, time: number, moonCrack = 0) {
    ctx.drawImage(nightArt!, 0, 0, W, H)
    const mo = moon()
    const halo = ctx.createRadialGradient(mo.x, mo.y, mo.r * 0.8, mo.x, mo.y, mo.r * 3.2)
    halo.addColorStop(0, 'rgba(244, 235, 211, 0.35)')
    halo.addColorStop(1, 'rgba(244, 235, 211, 0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, W, H)
    const disc = ctx.createRadialGradient(mo.x - mo.r * 0.3, mo.y - mo.r * 0.3, mo.r * 0.1, mo.x, mo.y, mo.r)
    disc.addColorStop(0, '#FBF4E2')
    disc.addColorStop(1, '#D9CDAE')
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(mo.x, mo.y, mo.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(150, 135, 110, 0.25)'
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      ctx.ellipse(mo.x + (hash(i) - 0.5) * mo.r, mo.y + (hash(i * 3) - 0.5) * mo.r, mo.r * (0.08 + hash(i * 5) * 0.18), mo.r * (0.06 + hash(i * 7) * 0.12), hash(i * 9) * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    if (moonCrack > 0) {
      // Cracks run across it before it opens.
      ctx.strokeStyle = `rgba(212, 36, 28, ${moonCrack})`
      ctx.lineWidth = 2
      for (let c = 0; c < 6; c++) {
        let x = mo.x + (hash(c) - 0.5) * mo.r * 0.4
        let y = mo.y + (hash(c + 9) - 0.5) * mo.r * 0.4
        ctx.beginPath()
        ctx.moveTo(x, y)
        const a = hash(c * 5) * Math.PI * 2
        for (let s = 0; s < 8 * moonCrack; s++) {
          x += Math.cos(a + (hash(c * 13 + s) - 0.5) * 1.4) * mo.r * 0.12
          y += Math.sin(a + (hash(c * 17 + s) - 0.5) * 1.4) * mo.r * 0.12
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    if (!trunk) return
    // The view rides the growing tip (a third of the way down the screen),
    // and at the end settles with the crown under the moon.
    const grown = clamp01((k - 0.02) / 0.9)
    const tipY = baseY - treeHeight * grown
    const target = H * (0.3 + 0.36 * smooth(0.9, 1, k))
    const climb = Math.max(0, target - tipY)
    ctx.save()
    ctx.translate(0, climb)
    ctx.fillStyle = '#07080F'
    ctx.beginPath()
    ctx.ellipse(W / 2, baseY + m * 0.12, W * 0.7, m * 0.14, 0, Math.PI, 0)
    ctx.fill()
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
    roots.forEach((r) => {
      ctx.strokeStyle = '#1A1210'
      ctx.lineCap = 'round'
      for (let i = 1; i < r.pts.length; i++) {
        ctx.lineWidth = r.w * (1 - i / r.pts.length)
        ctx.beginPath()
        ctx.moveTo(r.pts[i - 1].x, r.pts[i - 1].y)
        ctx.lineTo(r.pts[i].x, r.pts[i].y)
        ctx.stroke()
      }
    })
    // The trunk, as far as it has grown: dark bark, moonlit along one edge.
    const upto = Math.max(2, Math.floor(trunk.left.length * grown))
    ctx.beginPath()
    for (let i = 0; i < upto; i++) ctx.lineTo(trunk.left[i].x, trunk.left[i].y)
    for (let i = upto - 1; i >= 0; i--) ctx.lineTo(trunk.right[i].x, trunk.right[i].y)
    ctx.closePath()
    const bark = ctx.createLinearGradient(W / 2 - m * 0.07, 0, W / 2 + m * 0.07, 0)
    bark.addColorStop(0, '#2E211A')
    bark.addColorStop(0.55, '#16100D')
    bark.addColorStop(1, '#0B0807')
    ctx.fillStyle = bark
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.lineWidth = 1.4
    for (let i = 0; i < 90; i++) {
      const y = baseY - treeHeight * hash(i * 2.3) * grown
      const x = W / 2 + (hash(i * 5.1) - 0.5) * m * 0.1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + 4, y - m * 0.02, x - 2, y - m * 0.045)
      ctx.stroke()
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < upto; i++) ctx.lineTo(trunk.left[i].x + 1.5, trunk.left[i].y)
    ctx.stroke()
    const n = branches.length
    branches.forEach((b, i) => {
      const at = (i + 0.8) / (n + 0.9)
      const bk = smooth(at - 0.01, at + 0.03, grown)
      if (bk <= 0) return
      const cnt = Math.max(2, Math.floor(b.pts.length * bk))
      ctx.strokeStyle = '#1A1210'
      ctx.lineCap = 'round'
      for (let j = 1; j < cnt; j++) {
        ctx.lineWidth = b.width * (1 - (j / b.pts.length) * 0.75)
        ctx.beginPath()
        ctx.moveTo(b.pts[j - 1].x, b.pts[j - 1].y)
        ctx.lineTo(b.pts[j].x, b.pts[j].y)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(241, 235, 223, 0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let j = 0; j < cnt; j++) ctx.lineTo(b.pts[j].x, b.pts[j].y - b.width * 0.4)
      ctx.stroke()
      drawLeaves(b.leaves, smooth(at + 0.01, at + 0.05, grown), time)
      drawTag(b, smooth(at + 0.02, at + 0.07, grown), time)
    })
    drawLeaves(crown, smooth(0.95, 1, grown), time)
    ctx.restore()
    for (let i = 0; i < 40; i++) {
      const x = (((hash(i) * W + Math.sin(time * 0.4 + i) * 30) % W) + W) % W
      const y = (((hash(i * 3) * H + Math.cos(time * 0.3 + i * 2) * 20) % H) + H) % H
      const a = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(time * 2 + i * 7), 3)
      ctx.fillStyle = `rgba(242, 178, 74, ${a * 0.8})`
      ctx.beginPath()
      ctx.arc(x, y, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    const fade = 1 - smooth(0.12, 0.22, k)
    if (fade > 0) {
      const title = writer.image('The tree of wisdom', `italic ${Math.round(m * 0.06)}px ${SERIF}`, P.bone)
      const sub = writer.image('ज्ञानवृक्ष  ·  DOMAINS AND THEIR TOOLS', `${Math.round(m * 0.02)}px ${MONO}`, 'rgba(241,235,223,0.6)')
      writer.write(title, W / 2, H * 0.85, smooth(0, 0.06, k), fade)
      writer.write(sub, W / 2, H * 0.91, smooth(0.03, 0.09, k), fade)
    }
  }

  // ---------------------------------------------------------------- the eye

  // The eye that opens in the moon: almond lids heavy with lashes, the iris
  // in layers of red, fibres, a limbal ring, the pupil tightening as it
  // gathers the light, two catch-lights. Opened on twos.
  function drawEye(open: number, pupil: number, glow: number) {
    const mo = moon()
    const ew = mo.r * 2.6
    const eh = mo.r * 1.25
    const o = Math.floor(open * 8) / 8
    const x = mo.x
    const y = mo.y
    ctx.save()
    const red = ctx.createRadialGradient(x, y, eh * 0.3, x, y, ew * 1.6)
    red.addColorStop(0, `rgba(212, 36, 28, ${0.55 * glow})`)
    red.addColorStop(1, 'rgba(212, 36, 28, 0)')
    ctx.fillStyle = red
    ctx.fillRect(0, 0, W, H)
    const upper = (u: number) => y - eh * 0.5 * Math.pow(Math.max(1 - u * u, 0), 0.75) * o + eh * 0.05 * (1 - o)
    const lower = (u: number) => y + eh * 0.36 * Math.pow(Math.max(1 - u * u, 0), 0.9) * o
    if (o > 0.01) {
      ctx.beginPath()
      for (let i = 0; i <= 40; i++) ctx.lineTo(x + ((i / 40) * 2 - 1) * ew * 0.5, upper((i / 40) * 2 - 1))
      for (let i = 40; i >= 0; i--) ctx.lineTo(x + ((i / 40) * 2 - 1) * ew * 0.5, lower((i / 40) * 2 - 1))
      ctx.closePath()
      const sclera = ctx.createLinearGradient(0, y - eh / 2, 0, y + eh / 2)
      sclera.addColorStop(0, '#B8AC9C')
      sclera.addColorStop(0.35, '#F1EADF')
      sclera.addColorStop(1, '#E2D9CB')
      ctx.fillStyle = sclera
      ctx.fill()
      ctx.save()
      ctx.clip()
      const ir = eh * 0.46
      const g = ctx.createRadialGradient(x, y, ir * 0.1, x, y, ir)
      g.addColorStop(0, '#FF6A2B')
      g.addColorStop(0.35, '#D4241C')
      g.addColorStop(0.8, '#7A0B0E')
      g.addColorStop(1, '#1A0204')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, ir, 0, Math.PI * 2)
      ctx.fill()
      for (let k2 = 0; k2 < 90; k2++) {
        const a = (k2 / 90) * Math.PI * 2
        const r0 = ir * (0.25 + hash(k2) * 0.15)
        const r1 = ir * (0.7 + hash(k2 * 3) * 0.28)
        ctx.strokeStyle = k2 % 3 ? 'rgba(40, 0, 2, 0.5)' : 'rgba(255, 160, 110, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
        ctx.lineTo(x + Math.cos(a + 0.03) * r1, y + Math.sin(a + 0.03) * r1)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(20, 0, 2, 0.8)'
      ctx.lineWidth = ir * 0.06
      ctx.beginPath()
      ctx.arc(x, y, ir * 0.97, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255, 200, 150, 0.35)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(x, y, ir * 0.62, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#050304'
      ctx.beginPath()
      ctx.ellipse(x, y, ir * (0.12 + 0.2 * pupil), ir * (0.3 + 0.08 * pupil), 0, 0, Math.PI * 2)
      ctx.fill()
      const sh = ctx.createLinearGradient(0, y - eh / 2, 0, y)
      sh.addColorStop(0, 'rgba(20, 8, 6, 0.75)')
      sh.addColorStop(1, 'rgba(20, 8, 6, 0)')
      ctx.fillStyle = sh
      ctx.fillRect(x - ew / 2, y - eh / 2, ew, eh / 2)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.ellipse(x - ir * 0.32, y - ir * 0.34, ir * 0.16, ir * 0.11, -0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x + ir * 0.3, y + ir * 0.28, ir * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    // The lids: the upper heavy and tapering, lashes clumped at its outer
    // corner, a crease above; the lower fine.
    ctx.strokeStyle = '#0B0506'
    ctx.lineCap = 'round'
    for (let i = 1; i <= 40; i++) {
      const u0 = ((i - 1) / 40) * 2 - 1
      const u1 = (i / 40) * 2 - 1
      ctx.lineWidth = eh * (0.035 + 0.06 * smooth(-0.8, 0.9, u1))
      ctx.beginPath()
      ctx.moveTo(x + u0 * ew * 0.5, upper(u0))
      ctx.lineTo(x + u1 * ew * 0.5, upper(u1))
      ctx.stroke()
    }
    for (let l = 0; l < 7; l++) {
      const u = 0.45 + l * 0.08
      const bx = x + u * ew * 0.5
      const by = upper(u)
      const len = eh * (0.12 + l * 0.025)
      const a = -0.6 - l * 0.12
      ctx.lineWidth = eh * 0.03
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.3, bx + Math.cos(a) * len, by + Math.sin(a) * len)
      ctx.stroke()
    }
    ctx.lineWidth = eh * 0.02
    ctx.beginPath()
    for (let i = 0; i <= 30; i++) {
      const u = (i / 30) * 1.6 - 0.8
      ctx.lineTo(x + u * ew * 0.5, upper(u) - eh * 0.2 * o - eh * 0.05)
    }
    ctx.stroke()
    if (o > 0.05) {
      ctx.lineWidth = eh * 0.018
      ctx.beginPath()
      for (let i = 0; i <= 40; i++) {
        const u = (i / 40) * 1.8 - 0.9
        ctx.lineTo(x + u * ew * 0.5, lower(u))
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  // A ray: a white core, a pale haze, edges that burn red, torn and
  // flickering frame to frame; sparks thrown off along it.
  function drawRay(vertical: boolean, at: number, width: number, alpha: number, time: number) {
    if (width <= 0 || alpha <= 0) return
    const len = vertical ? H : W
    const frame = Math.floor(time * 24)
    ctx.save()
    ctx.globalAlpha = alpha
    const haze = vertical ? ctx.createLinearGradient(at - width * 3, 0, at + width * 3, 0) : ctx.createLinearGradient(0, at - width * 3, 0, at + width * 3)
    haze.addColorStop(0, 'rgba(200, 230, 255, 0)')
    haze.addColorStop(0.5, 'rgba(220, 240, 255, 0.55)')
    haze.addColorStop(1, 'rgba(200, 230, 255, 0)')
    ctx.fillStyle = haze
    if (vertical) ctx.fillRect(at - width * 3, 0, width * 6, H)
    else ctx.fillRect(0, at - width * 3, W, width * 6)
    ctx.fillStyle = '#FBFDFF'
    if (vertical) ctx.fillRect(at - width / 2, 0, width, H)
    else ctx.fillRect(0, at - width / 2, W, width)
    for (let pass = 0; pass < 4; pass++) {
      ctx.strokeStyle = pass < 2 ? P.vermilion : '#8A0A0C'
      ctx.lineWidth = 2.2 + pass * 1.8
      ctx.globalAlpha = alpha * (0.95 - pass * 0.18)
      for (const side of [-1, 1]) {
        ctx.beginPath()
        for (let t = 0; t <= len; t += 9) {
          const off = side * (width / 2 + 2 + pass * 2.4) + (hash(t * 0.13 + pass * 3 + frame) - 0.5) * (4 + pass * 3)
          if (vertical) ctx.lineTo(at + off, t)
          else ctx.lineTo(t, at + off)
        }
        ctx.stroke()
      }
    }
    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#FFD27A'
    ctx.lineWidth = 1.4
    for (let i = 0; i < 40; i++) {
      const t = hash(i + frame * 0.37) * len
      const side = hash(i * 3 + frame) > 0.5 ? 1 : -1
      const l = 8 + hash(i * 7 + frame) * 30
      const s0 = side * (width / 2 + 4)
      ctx.beginPath()
      if (vertical) {
        ctx.moveTo(at + s0, t)
        ctx.lineTo(at + s0 + side * l, t + (hash(i * 9) - 0.5) * l)
      } else {
        ctx.moveTo(t, at + s0)
        ctx.lineTo(t + (hash(i * 9) - 0.5) * l, at + s0 + side * l)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  // Burn along the cuts: the page browned and blackened back from the edges, embers in it.
  function drawChar(vx: number, hy: number, width: number, k: number) {
    if (k <= 0) return
    const band = width / 2 + m * 0.05 * k
    for (const vertical of [true, false]) {
      const c0 = vertical ? vx : hy
      const g = vertical ? ctx.createLinearGradient(c0 - band, 0, c0 + band, 0) : ctx.createLinearGradient(0, c0 - band, 0, c0 + band)
      g.addColorStop(0, 'rgba(40, 18, 8, 0)')
      g.addColorStop(0.4, `rgba(30, 12, 6, ${0.85 * k})`)
      g.addColorStop(0.6, `rgba(30, 12, 6, ${0.85 * k})`)
      g.addColorStop(1, 'rgba(40, 18, 8, 0)')
      ctx.fillStyle = g
      if (vertical) ctx.fillRect(c0 - band, 0, band * 2, H)
      else ctx.fillRect(0, c0 - band, W, band * 2)
    }
    for (let i = 0; i < 160; i++) {
      const along = hash(i) * (i % 2 ? H : W)
      const off = (hash(i * 3) - 0.5) * band * 2
      ctx.fillStyle = `rgba(255, ${100 + hash(i * 5) * 100}, 40, ${k * hash(i * 7)})`
      if (i % 2) ctx.fillRect(vx + off, along, 2, 2)
      else ctx.fillRect(along, hy + off, 2, 2)
    }
  }

  const rayWidth = () => m * 0.07

  // ---------------------------------------------------------------- frames

  function begin(time: number) {
    ink.boil = Math.floor(time * 8)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, W, H)
  }

  // The scrolled part.
  function render(p: number, time: number) {
    begin(time)
    if (p < SPIRAL_END) {
      const sp = p / SPIRAL_END
      const g = smooth(0.3, 0.86, sp)
      const paperScene = () => {
        ctx.drawImage(paperArt!, 0, 0, W, H)
        drawPothi(spiralScale(sp).s / (m * 0.035))
        drawShell(sp, false)
        drawCartouches(sp, false)
      }
      const darkScene = () => {
        ctx.drawImage(futureArt!, 0, 0, W, H)
        drawAnvil(time)
        drawShell(sp, true)
        drawCartouches(sp, true)
      }
      if (g < 0.97) {
        paperScene()
        if (g > 0) glitch(g, time, darkScene)
      } else {
        darkScene()
        glitch(0.04, time, paperScene)
      }
      // The night comes up behind the spiral's eye, which becomes the moon.
      const night = smooth(0.9, 1, sp)
      if (night > 0) {
        ctx.globalAlpha = night
        drawNight(0, time)
        ctx.globalAlpha = 1
      }
      return
    }
    drawNight((p - SPIRAL_END) / (1 - SPIRAL_END), time)
  }

  // The cutscene, t seconds in.
  function renderEye(t: number, time: number) {
    begin(time)
    const mo = moon()
    const crack = smooth(0.1, 0.6, t)
    const open = smooth(0.65, 1.3, t)
    const gather = smooth(1.3, 1.9, t)
    const vW = rayWidth() * easeOut(clamp01((t - 1.95) / 0.18))
    const hW = rayWidth() * easeOut(clamp01((t - 2.4) / 0.18))
    if (t < EYE_CUT) {
      const shake = (t > 1.95 && t < 2.3) || (t > 2.4 && t < 2.75) ? 6 : t < 0.6 ? 2 * crack : 0
      ctx.save()
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
      drawNight(1, time, crack * (1 - open))
      drawEye(open, 1 - gather, smooth(0.6, 1.4, t))
      // The light, drawn in to the pupil.
      if (gather > 0 && t < 2.1) {
        ctx.strokeStyle = 'rgba(255, 240, 220, 0.8)'
        ctx.lineWidth = 1.5
        for (let i = 0; i < 46; i++) {
          const a = hash(i) * Math.PI * 2
          const r = m * (0.6 - 0.5 * ((gather + hash(i * 3)) % 1))
          ctx.beginPath()
          ctx.moveTo(mo.x + Math.cos(a) * r, mo.y + Math.sin(a) * r)
          ctx.lineTo(mo.x + Math.cos(a) * (r + m * 0.06), mo.y + Math.sin(a) * (r + m * 0.06))
          ctx.stroke()
        }
      }
      drawChar(mo.x, mo.y, vW, smooth(2.6, 3.2, t))
      drawRay(true, mo.x, vW, 1, time)
      drawRay(false, mo.y, hW, 1, time)
      // An impact frame as each ray lands: the frame struck to red and black.
      if ((t > 1.95 && t < 2.02) || (t > 2.4 && t < 2.47)) {
        ctx.globalCompositeOperation = 'difference'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(-10, -10, W + 20, H + 20)
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = P.vermilion
        ctx.fillRect(-10, -10, W + 20, H + 20)
        ctx.globalCompositeOperation = 'source-over'
      }
      ctx.restore()
    } else {
      // The page is in the sky's hands now: only the rays, fading, over it.
      const fade = 1 - smooth(EYE_CUT, EYE_LENGTH, t)
      drawRay(true, mo.x, rayWidth() * (1 + 0.6 * (1 - fade)), fade, time)
      drawRay(false, mo.y, rayWidth() * (1 + 0.6 * (1 - fade)), fade, time)
    }
  }

  // The page the instant it is cut — burnt along the cross — for the sky to
  // build the slab from.
  function snapshot(time: number) {
    begin(time)
    drawNight(1, time)
    drawEye(1, 0, 1)
    const mo = moon()
    drawChar(mo.x, mo.y, rayWidth(), 1)
    const c = document.createElement('canvas')
    c.width = flat.width
    c.height = flat.height
    c.getContext('2d')!.drawImage(flat, 0, 0)
    return { canvas: c, cross: { x: mo.x / W, y: mo.y / H, w: rayWidth() / W } }
  }

  return { resize, render, renderEye, snapshot }
}
