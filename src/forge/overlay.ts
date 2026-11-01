import * as THREE from 'three'
import { Writer, clamp01, hash, smooth } from './ink'
import { P } from './palette'
import { onScreen } from './world'
import type { Tag } from './tree3d'
import type { Milestone } from '../content/forge'

// The hand over the drawing: everything written or struck onto the page
// rather than modelled — the milestones' words beside their plaques, each
// domain's name and tools beside its ema, the eye's rays, speed lines, and
// the black fluid running off your eyes when you stand up out of it.

const SERIF = "'Instrument Serif', serif"
const MONO = "'JetBrains Mono Variable', monospace"
const DEVA = "'Kalam', serif"
const HAND = "'Kalam', cursive"

// The eye, drawn into a canvas (it hangs in the sky as the moon's face):
// almond lids heavy with lashes, a layered red iris, the pupil tightening.
export function drawEyeArt(c: HTMLCanvasElement, open: number, pupil: number, glow: number) {
  const ctx = c.getContext('2d')!
  const S = c.width
  ctx.clearRect(0, 0, S, S)
  const x = S / 2
  const y = S / 2
  const ew = S * 0.86
  const eh = S * 0.42
  const o = Math.floor(open * 8) / 8
  const red = ctx.createRadialGradient(x, y, eh * 0.2, x, y, S * 0.5)
  red.addColorStop(0, `rgba(212, 36, 28, ${0.6 * glow})`)
  red.addColorStop(1, 'rgba(212, 36, 28, 0)')
  ctx.fillStyle = red
  ctx.fillRect(0, 0, S, S)
  // The moon's disc behind it, until it opens.
  ctx.fillStyle = `rgba(251, 241, 216, ${1 - o})`
  ctx.beginPath()
  ctx.arc(x, y, S * 0.24, 0, Math.PI * 2)
  ctx.fill()
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
    for (let k = 0; k < 110; k++) {
      const a = (k / 110) * Math.PI * 2
      const r0 = ir * (0.25 + hash(k) * 0.15)
      const r1 = ir * (0.7 + hash(k * 3) * 0.28)
      ctx.strokeStyle = k % 3 ? 'rgba(40, 0, 2, 0.5)' : 'rgba(255, 160, 110, 0.35)'
      ctx.lineWidth = 2
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
  if (o > 0.05) {
    ctx.lineWidth = eh * 0.018
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const u = (i / 40) * 1.8 - 0.9
      ctx.lineTo(x + u * ew * 0.5, lower(u))
    }
    ctx.stroke()
  }
}

export function createOverlay(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const writer = new Writer(ctx, 1)
  let W = 1
  let H = 1
  let m = 1
  let dpr = 1
  const probe = { x: 0, y: 0, visible: false, depth: 0 }
  const probe2 = { x: 0, y: 0, visible: false, depth: 0 }
  const tmp = new THREE.Vector3()

  function resize(w: number, h: number) {
    W = w
    H = h
    m = Math.min(w, h)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    writer.dpr = dpr
    writer.clear()
  }
  function begin(time: number) {
    void time
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, W, H)
  }

  // ---- the milestones, written beside their plaques as you come up to them
  function milestones(plaques: { centre: THREE.Vector3; size: number; m: Milestone }[], camera: THREE.Camera, dark: number) {
    plaques.forEach((pl, i) => {
      onScreen(pl.centre, camera, W, H, probe)
      if (!probe.visible) return
      tmp.copy(pl.centre).y += pl.size
      onScreen(tmp, camera, W, H, probe2)
      const px = Math.abs(probe2.y - probe.y)
      const k = smooth(m * 0.05, m * 0.12, px) * (1 - smooth(m * 0.5, m * 0.8, px))
      if (k <= 0.01) return
      const write = smooth(m * 0.06, m * 0.2, px)
      const ink = dark > 0.5 ? P.bone : P.sepia
      const red = dark > 0.5 ? P.gold : P.vermilion
      const size = Math.min(Math.max(px * 0.35, 18), 64)
      const x = probe.x + px * 0.95
      const y = probe.y - px * 0.25
      ctx.save()
      ctx.globalAlpha = k
      writer.write(writer.image(`MILESTONE ${String(i + 1).padStart(2, '0')} · ${pl.m.year.toUpperCase()}`, `${Math.round(size * 0.32)}px ${MONO}`, red), x, y - size * 0.9, write, 1, 0)
      writer.write(writer.image(pl.m.title, `italic ${Math.round(size)}px ${SERIF}`, ink), x, y, write, 1, 0)
      writer.write(writer.image(pl.m.note, `${Math.round(size * 0.42)}px ${HAND}`, ink), x, y + size * 0.85, clamp01(write * 1.2 - 0.2), 0.9, 0)
      // A pencil line from the words to the plaque.
      ctx.strokeStyle = ink
      ctx.globalAlpha = k * 0.6
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x - 6, y)
      ctx.quadraticCurveTo((x + probe.x) / 2, y + 10, probe.x + px * 0.3, probe.y)
      ctx.stroke()
      ctx.restore()
    })
  }

  // ---- the domains: name and tools beside each ema, for the nearest few
  function tags(list: Tag[], camera: THREE.Camera) {
    const near = list
      .map((t) => {
        onScreen(t.slip.getWorldPosition(tmp), camera, W, H, probe)
        return { t, x: probe.x, y: probe.y, visible: probe.visible && t.group.scale.x > 0.6, dist: camera.position.distanceTo(tmp) }
      })
      .filter((t) => t.visible && t.y > H * 0.08 && t.y < H * 0.92 && t.x > W * 0.05 && t.x < W * 0.95)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
    near.forEach(({ t, x, y }, i) => {
      // The nearest to one side, the next to the other, never on top of each other.
      const right = i === 0 ? x < W * 0.6 : !(near[0].x < W * 0.6)
      const tx = right ? x + 46 : x - 46
      const align = right ? 0 : 1
      const fade = 1 - i * 0.28
      ctx.save()
      ctx.globalAlpha = fade
      ctx.strokeStyle = P.sepia
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + (right ? 14 : -14), y - 40)
      ctx.lineTo(tx + (right ? -6 : 6), y - 40)
      ctx.stroke()
      writer.write(writer.image(t.domain.name, `italic ${Math.round(m * 0.036)}px ${SERIF}`, P.sepia), tx, y - 48, 1, 1, align)
      writer.write(writer.image(t.domain.hi, `700 ${Math.round(m * 0.026)}px ${DEVA}`, P.vermilion), tx, y - 18, 1, 1, align)
      t.domain.leaves.forEach((leaf, j) => writer.write(writer.image(leaf, `${Math.round(m * 0.017)}px ${MONO}`, 'rgba(42,29,20,0.85)'), tx, y + 8 + j * m * 0.024, 1, 1, align))
      ctx.restore()
    })
  }

  // ---- the eye's rays
  function rays(x: number, y: number, vW: number, hW: number, alpha: number, time: number) {
    ray(true, x, vW, alpha, time)
    ray(false, y, hW, alpha, time)
  }
  function ray(vertical: boolean, at: number, width: number, alpha: number, time: number) {
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
  // The light drawn into the pupil before it fires.
  function gather(x: number, y: number, k: number) {
    if (k <= 0 || k >= 1) return
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.85)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 46; i++) {
      const a = hash(i) * Math.PI * 2
      const r = m * (0.6 - 0.5 * ((k + hash(i * 3)) % 1))
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      ctx.lineTo(x + Math.cos(a) * (r + m * 0.06), y + Math.sin(a) * (r + m * 0.06))
      ctx.stroke()
    }
  }
  // An impact frame: the whole frame struck to red and black.
  function impact() {
    ctx.globalCompositeOperation = 'difference'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = P.vermilion
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'
  }

  // ---- speed lines: only as many as the speed calls for, at the edges
  function speed(amount: number, time: number) {
    if (amount <= 0.08) return
    const k = Math.min(amount, 1)
    const n = Math.round(6 + 22 * k)
    const f = Math.floor(time * 12)
    ctx.save()
    ctx.strokeStyle = 'rgba(30, 22, 16, 0.55)'
    ctx.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const a = hash(i * 7.3 + f) * Math.PI * 2
      const r0 = Math.hypot(W, H) * (0.36 + 0.12 * hash(i * 3 + f))
      const len = m * (0.06 + 0.16 * k) * (0.5 + hash(i * 5 + f))
      ctx.globalAlpha = 0.25 + 0.5 * k * hash(i * 9 + f)
      ctx.lineWidth = 0.8 + 1.6 * hash(i * 11)
      ctx.beginPath()
      ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0)
      ctx.lineTo(W / 2 + Math.cos(a) * (r0 + len), H / 2 + Math.sin(a) * (r0 + len))
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---- the air, wrapping round you as you go faster than the world allows:
  // curved streams sweeping past the edges of sight, soft at their ends.
  function air(amount: number, time: number, light: boolean) {
    if (amount <= 0.02) return
    const n = 16
    ctx.save()
    ctx.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const life = (time * (0.55 + hash(i) * 0.5) + hash(i * 3.1)) % 1
      const side = i % 2 ? 1 : -1
      const rx = W * (0.42 + 0.3 * life + 0.08 * hash(i * 5))
      const ry = H * (0.4 + 0.3 * life + 0.1 * hash(i * 7))
      // Each stream curls round from ahead of you to behind, along an ellipse.
      const a0 = (side > 0 ? 0 : Math.PI) + (hash(i * 9) - 0.5) * 1.6 - side * life * 0.9
      const span = 0.35 + 0.5 * hash(i * 13)
      const alpha = Math.sin(Math.PI * life) * amount * (0.18 + 0.3 * hash(i * 17))
      const steps = 18
      for (let k = 0; k < steps; k++) {
        const u0 = k / steps
        const u1 = (k + 1) / steps
        const t0 = a0 + side * span * u0
        const t1 = a0 + side * span * u1
        const fadeEnds = Math.sin(Math.PI * u0)
        const width = (2 + 7 * hash(i * 19)) * fadeEnds * (0.6 + amount)
        // An inked edge, then the white of the moving air inside it.
        ctx.beginPath()
        ctx.moveTo(W / 2 + Math.cos(t0) * rx, H / 2 + Math.sin(t0) * ry)
        ctx.lineTo(W / 2 + Math.cos(t1) * rx, H / 2 + Math.sin(t1) * ry)
        ctx.strokeStyle = `rgba(40, 30, 22, ${alpha * fadeEnds * 0.9})`
        ctx.lineWidth = width + 2
        ctx.stroke()
        ctx.strokeStyle = light ? `rgba(40, 30, 22, ${alpha})` : `rgba(255, 255, 255, ${Math.min(1, alpha * 2.2) * fadeEnds})`
        ctx.lineWidth = width
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // ---- the beat drops: one frame of the song's colour, falling away
  function drop(e: number, accent: string) {
    if (e <= 0 || e >= 1) return
    ctx.save()
    ctx.globalAlpha = Math.pow(1 - e, 2.2) * 0.85
    ctx.fillStyle = accent
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  return { resize, begin, milestones, tags, rays, gather, impact, speed, air, drop, size: () => ({ W, H, m }) }
}
