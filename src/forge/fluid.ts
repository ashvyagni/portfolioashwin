import { clamp01, easeInOut, easeOut, hash, smooth } from './ink'
import { P } from './palette'

// The landing, in your own eyes, on its own clock (FLUID_LENGTH s):
//
//   0   – 0.9   under the black: bubbles rushing up past you, the surface a
//               wavering light far above
//   0.9 – 2.6   you stand up out of it. It streams off your eyes in heavy
//               sheets, the meniscus catching the light, rivulets left
//               behind, a few drops clinging to the lens and sliding
//   2.6 – 3.4   you look down
//   3.4 – 6.0   at your feet: in the fluid to the ankle, it sliding off your
//               shins and dripping from the hems, from your toes, from your
//               fingertips at your sides; rings spreading where it falls
//   6.0 – 7.0   you look up — and the fluid at your feet is the forge's ground

export const FLUID_LENGTH = 7

const SKIN = '#C08A68'
const SKIN_SHADE = '#8E5F45'
const SKIN_LIGHT = '#DDAA86'
const LINE = '#2A140C'
const BLACK = '#060507'

export function createFluid(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  let W = 1
  let H = 1
  let m = 1
  let dpr = 1

  function resize(w: number, h: number) {
    W = w
    H = h
    m = Math.min(w, h)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }

  // A line that boils on twos, as the rest of the drawing does.
  let boil = 0
  const j = (seed: number, a = 1) => (hash(seed * 7.3 + boil * 3.1) - 0.5) * a

  // ---- under

  function under(t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#1A2230')
    g.addColorStop(0.25, '#0A0D14')
    g.addColorStop(1, '#020203')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    // The surface, far up, light wavering through it.
    const rise = easeInOut(t / 0.9)
    const sy = H * (0.06 + 0.5 * rise) - H * 0.5 * (1 - rise)
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, sy + Math.sin(x * 0.02 + t * 6) * 6)
    ctx.stroke()
    // Bubbles: rings with a catch-light, rushing up.
    for (let i = 0; i < 70; i++) {
      const r = 2 + hash(i) * 9
      const x = hash(i * 3.1) * W + Math.sin(t * 5 + i) * 6
      const y = H - ((hash(i * 7.7) * H + t * (500 + hash(i * 2) * 700)) % (H + 40))
      ctx.strokeStyle = 'rgba(241, 235, 223, 0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.beginPath()
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ---- the world above: a black pool to a low horizon, the dark beyond it

  function world(tilt: number) {
    // tilt: 0 looking ahead … 1 looking down at your feet.
    const horizon = H * (0.42 - tilt * 0.9)
    const sky = ctx.createLinearGradient(0, horizon - H * 0.5, 0, horizon)
    sky.addColorStop(0, '#000')
    sky.addColorStop(1, '#14131A')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, Math.max(horizon, 0))
    const pool = ctx.createLinearGradient(0, horizon, 0, H)
    pool.addColorStop(0, '#1B1A20')
    pool.addColorStop(0.12, '#08080B')
    pool.addColorStop(1, '#030304')
    ctx.fillStyle = pool
    ctx.fillRect(0, Math.max(horizon, 0), W, H)
    // The far edge of the fluid catches the last light.
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, horizon)
    ctx.lineTo(W, horizon)
    ctx.stroke()
    // Long glints on the surface.
    for (let i = 0; i < 26; i++) {
      const y = horizon + Math.pow(hash(i), 1.8) * (H - horizon)
      const x = hash(i * 3) * W
      const w = 20 + hash(i * 5) * 120 * (1 + (y - horizon) / H)
      ctx.fillStyle = `rgba(241, 235, 223, ${0.05 + hash(i * 9) * 0.12})`
      ctx.fillRect(x - w / 2, y, w, 1.2)
    }
  }

  // ---- the fluid running off your eyes

  function draining(k: number, time: number) {
    // k: 0 covered … 1 clear. The sheet's top edge slides down — slowly
    // undulating, faster in some places than others — and leaves thin
    // trails above it where the fluid clings, each ending in a bead.
    const edge = (x: number) => {
      const u = x / W
      const lag = 0.12 * Math.sin(u * 5.3 + 1.1) + 0.07 * Math.sin(u * 11.7 + 2.3) + 0.04 * Math.sin(u * 23.1)
      return -H * 0.08 + Math.pow(clamp01(k * 1.12 - lag * 0.6), 1.6) * H * 1.2 + lag * H * 0.12
    }
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, H + 10)
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, edge(x))
    ctx.lineTo(W, H + 10)
    ctx.closePath()
    const sheet = ctx.createLinearGradient(0, 0, W * 0.3, H)
    sheet.addColorStop(0, '#0D0C10')
    sheet.addColorStop(0.5, BLACK)
    sheet.addColorStop(1, '#121014')
    ctx.fillStyle = sheet
    ctx.fill()
    ctx.restore()
    // The meniscus: a thin bright line along the edge, thicker where it bulges.
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.55)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, edge(x) + 2)
    ctx.stroke()
    // Light running down inside the sheet, like light in thick oil.
    for (let i = 0; i < 18; i++) {
      const x = hash(i * 4.1) * W
      const y0 = edge(x) + 30 + hash(i) * 60
      ctx.strokeStyle = `rgba(241, 235, 223, ${0.06 + hash(i * 3) * 0.12})`
      ctx.lineWidth = 2 + hash(i) * 6
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.bezierCurveTo(x + 6, y0 + H * 0.15, x - 6, y0 + H * 0.3, x + 3, y0 + H * 0.55)
      ctx.stroke()
    }
    // Trails clinging above the edge, a bead at each one's foot.
    for (let i = 0; i < 16; i++) {
      const x = hash(i * 13) * W
      const bottom = edge(x)
      const len = (0.15 + hash(i * 2) * 0.5) * Math.max(bottom, 0)
      if (len < 4) continue
      const w = 1.5 + hash(i * 5) * 3
      ctx.fillStyle = BLACK
      ctx.beginPath()
      ctx.moveTo(x - w * 0.3, bottom - len)
      ctx.quadraticCurveTo(x - w, bottom - len * 0.3, x - w * 1.6, bottom)
      ctx.lineTo(x + w * 1.6, bottom)
      ctx.quadraticCurveTo(x + w, bottom - len * 0.3, x + w * 0.3, bottom - len)
      ctx.closePath()
      ctx.fill()
      const bead = bottom - len * (0.3 + 0.2 * Math.sin(time * 2 + i))
      ctx.beginPath()
      ctx.arc(x, bead, w * 1.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(241, 235, 223, 0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, bead, w * 1.2, Math.PI * 1.1, Math.PI * 1.7)
      ctx.stroke()
    }
    // Drops on the lens, sliding.
    for (let i = 0; i < 9; i++) {
      const r = m * (0.01 + hash(i * 5) * 0.02)
      const x = hash(i * 17) * W
      const y = hash(i * 23) * H * 0.7 + k * H * 0.25 * hash(i * 2) + Math.sin(time + i) * 2
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
      g.addColorStop(0, 'rgba(30, 28, 34, 0.9)')
      g.addColorStop(1, 'rgba(4, 4, 5, 0.95)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.beginPath()
      ctx.ellipse(x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ---- your feet

  // One foot, seen from above, toes pointing away (up the screen). side −1
  // for the left foot (big toe on its right), +1 for the right.
  function foot(cx: number, ankleY: number, L: number, side: number, t: number) {
    const s = -side // mirror so the big toe is always on the inside
    const X = (u: number) => cx + u * L * s
    const Y = (v: number) => ankleY - v * L
    ctx.save()
    ctx.lineJoin = 'round'
    const outline = () => {
      ctx.beginPath()
      ctx.moveTo(X(-0.2), Y(0))
      // The outer edge, up to the little toe.
      ctx.bezierCurveTo(X(-0.26), Y(0.25), X(-0.3), Y(0.55), X(-0.26), Y(0.76))
      // The ball of the foot, to the big toe's root.
      ctx.bezierCurveTo(X(-0.12), Y(0.86), X(0.1), Y(0.9), X(0.2), Y(0.84))
      // The inner edge, the arch, back to the ankle.
      ctx.bezierCurveTo(X(0.25), Y(0.6), X(0.2), Y(0.32), X(0.17), Y(0))
      ctx.closePath()
    }
    // Body of the foot: skin, shaded to the outer side, lit along the ridge.
    outline()
    const g = ctx.createLinearGradient(X(-0.3), 0, X(0.25), 0)
    g.addColorStop(0, SKIN_SHADE)
    g.addColorStop(0.45, SKIN)
    g.addColorStop(0.75, SKIN_LIGHT)
    g.addColorStop(1, SKIN)
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = LINE
    ctx.lineWidth = 2
    ctx.stroke()
    // Tendons fanning from the ankle toward the toes, lit on their crests.
    ctx.strokeStyle = 'rgba(240, 190, 150, 0.55)'
    ctx.lineWidth = 1.4
    for (let k = 0; k < 4; k++) {
      const u = 0.12 - k * 0.09
      ctx.beginPath()
      ctx.moveTo(X(0.0 + j(k, 0.004)), Y(0.12))
      ctx.quadraticCurveTo(X(u * 0.8), Y(0.45), X(u), Y(0.74))
      ctx.stroke()
    }
    // The toes: the big one inside, the rest smaller along a curve; nails lit.
    const toes = [
      { u: 0.13, v: 0.9, r: 0.085, len: 0.18 },
      { u: -0.0, v: 0.92, r: 0.058, len: 0.15 },
      { u: -0.1, v: 0.89, r: 0.052, len: 0.13 },
      { u: -0.18, v: 0.84, r: 0.048, len: 0.11 },
      { u: -0.25, v: 0.77, r: 0.042, len: 0.09 },
    ]
    toes.forEach((toe, i) => {
      const x = X(toe.u)
      const y = Y(toe.v + toe.len * 0.5)
      const rx = toe.r * L
      const ry = toe.len * L * 0.62
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, s * -0.08 * i, 0, Math.PI * 2)
      const tg = ctx.createLinearGradient(x - rx, 0, x + rx, 0)
      tg.addColorStop(0, s > 0 ? SKIN_SHADE : SKIN_LIGHT)
      tg.addColorStop(1, s > 0 ? SKIN_LIGHT : SKIN_SHADE)
      ctx.fillStyle = tg
      ctx.fill()
      ctx.strokeStyle = LINE
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(x, y - ry * 0.35, rx * 0.55, ry * 0.32, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#E8C2A6'
      ctx.fill()
      ctx.strokeStyle = 'rgba(42, 20, 12, 0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.beginPath()
      ctx.ellipse(x - rx * 0.15, y - ry * 0.45, rx * 0.18, ry * 0.08, 0, 0, Math.PI * 2)
      ctx.fill()
    })
    // The ankle bone, and the fluid's line where the foot goes under.
    ctx.strokeStyle = 'rgba(42, 20, 12, 0.5)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(X(-0.22), Y(0.08), L * 0.05, Math.PI * 0.4, Math.PI * 1.3)
    ctx.stroke()
    // The black fluid still on the skin: a sheet from the ankle thinning
    // toward the toes as it slides off, glossy at its edge; beads left behind.
    const slide = clamp01(t * 0.35)
    const reach = 0.55 - slide * 0.3
    ctx.beginPath()
    ctx.moveTo(X(-0.22), Y(0))
    ctx.bezierCurveTo(X(-0.24), Y(reach * 0.5), X(-0.12), Y(reach + 0.05), X(-0.02), Y(reach))
    ctx.bezierCurveTo(X(0.06), Y(reach - 0.06), X(0.04), Y(reach * 0.75), X(0.12), Y(reach * 0.6))
    ctx.bezierCurveTo(X(0.18), Y(reach * 0.45), X(0.17), Y(0.1), X(0.17), Y(0))
    ctx.closePath()
    const sheet = ctx.createLinearGradient(X(-0.2), 0, X(0.2), 0)
    sheet.addColorStop(0, 'rgba(6, 5, 7, 0.95)')
    sheet.addColorStop(0.5, 'rgba(18, 16, 22, 0.92)')
    sheet.addColorStop(1, 'rgba(6, 5, 7, 0.95)')
    ctx.fillStyle = sheet
    ctx.fill()
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.55)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(X(-0.12), Y(reach + 0.02))
    ctx.bezierCurveTo(X(-0.04), Y(reach + 0.04), X(0.04), Y(reach - 0.02), X(0.1), Y(reach * 0.62))
    ctx.stroke()
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.25)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(X(-0.1), Y(0.05))
    ctx.quadraticCurveTo(X(-0.12), Y(reach * 0.4), X(-0.06), Y(reach * 0.75))
    ctx.stroke()
    for (let k = 0; k < 4; k++) {
      const bx = X(-0.15 + k * 0.09)
      const by = Y(reach + 0.06 + hash(k * 3 + side) * 0.18)
      const r = L * (0.012 + hash(k + side * 7) * 0.012)
      ctx.fillStyle = BLACK
      ctx.beginPath()
      ctx.ellipse(bx, by, r, r * 1.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.beginPath()
      ctx.arc(bx - r * 0.35, by - r * 0.4, r * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // A trouser leg from the foot of the screen up to its hem; black cloth,
  // its folds lit faintly, the fluid streaming down it in glossy bands.
  function leg(hemX: number, hemY: number, hemW: number, side: number, t: number) {
    const botX = hemX + side * W * 0.06
    const botW = hemW * 1.9
    ctx.beginPath()
    ctx.moveTo(botX - botW / 2, H + 4)
    ctx.bezierCurveTo(botX - botW / 2, H * 0.85, hemX - hemW / 2 - 4, hemY + 40, hemX - hemW / 2, hemY)
    ctx.quadraticCurveTo(hemX, hemY - hemW * 0.12, hemX + hemW / 2, hemY)
    ctx.bezierCurveTo(hemX + hemW / 2 + 4, hemY + 40, botX + botW / 2, H * 0.85, botX + botW / 2, H + 4)
    ctx.closePath()
    const cloth = ctx.createLinearGradient(botX - botW / 2, 0, botX + botW / 2, 0)
    cloth.addColorStop(0, '#0C0B0E')
    cloth.addColorStop(side < 0 ? 0.7 : 0.3, '#24222A')
    cloth.addColorStop(1, '#0C0B0E')
    ctx.fillStyle = cloth
    ctx.fill()
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Folds.
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.12)'
    ctx.lineWidth = 1.2
    for (let k = 0; k < 5; k++) {
      const y = hemY + 30 + k * (H - hemY) * 0.17
      ctx.beginPath()
      ctx.moveTo(hemX - hemW * 0.3 + side * k * 8, y)
      ctx.quadraticCurveTo(hemX + side * k * 10, y + 14, hemX + hemW * 0.35 + side * k * 8, y - 4)
      ctx.stroke()
    }
    // The fluid's gloss, sliding down (toward the hem: away from you).
    for (let k = 0; k < 3; k++) {
      const y = H - ((t * 120 + k * 140) % (H - hemY))
      ctx.strokeStyle = 'rgba(241, 235, 223, 0.25)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(hemX - hemW * 0.2 + k * 10, y)
      ctx.lineTo(hemX - hemW * 0.15 + k * 10, y - 30)
      ctx.stroke()
    }
    // The hem, turned up; drops hanging from it and falling.
    ctx.fillStyle = '#18161C'
    ctx.fillRect(hemX - hemW / 2, hemY - 3, hemW, 9)
    for (let k = 0; k < 3; k++) {
      const x = hemX - hemW * 0.3 + k * hemW * 0.3
      const f = (t * 1.8 + k * 0.37 + (side > 0 ? 0.2 : 0)) % 1
      const y = hemY + 6 - f * f * m * 0.18
      drop(x, y, 4 + k)
    }
  }

  // A falling drop of the black fluid, a catch-light on it.
  function drop(x: number, y: number, r: number) {
    ctx.fillStyle = BLACK
    ctx.beginPath()
    ctx.moveTo(x, y - r * 2)
    ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r * 0.6)
    ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(241, 235, 223, 0.7)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Rings spreading where drops land, flattened by the angle you look at them.
  function rings(x: number, y: number, t: number, seed: number, scale: number) {
    for (let k = 0; k < 3; k++) {
      const f = (t * 0.9 + k * 0.33 + seed) % 1
      ctx.strokeStyle = `rgba(241, 235, 223, ${0.45 * (1 - f)})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.ellipse(x, y, f * scale, f * scale * 0.55, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // A hand at your side, at the edge of the view: fingers, the fluid on them, dripping.
  function hand(side: number, t: number) {
    const x0 = side < 0 ? 0 : W
    const s = side < 0 ? 1 : -1
    const y0 = H * 0.66
    const L = m * 0.2
    for (let f = 0; f < 4; f++) {
      const y = y0 + f * L * 0.18
      const len = L * (0.55 + (f === 1 || f === 2 ? 0.15 : 0))
      ctx.beginPath()
      ctx.moveTo(x0, y - L * 0.07)
      ctx.quadraticCurveTo(x0 + s * len * 0.6, y - L * 0.09, x0 + s * len, y + L * 0.02)
      ctx.quadraticCurveTo(x0 + s * len * 1.04, y + L * 0.07, x0 + s * len * 0.92, y + L * 0.09)
      ctx.quadraticCurveTo(x0 + s * len * 0.5, y + L * 0.07, x0, y + L * 0.06)
      ctx.closePath()
      const g = ctx.createLinearGradient(0, y - L * 0.08, 0, y + L * 0.08)
      g.addColorStop(0, SKIN_LIGHT)
      g.addColorStop(1, SKIN_SHADE)
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = LINE
      ctx.lineWidth = 1.6
      ctx.stroke()
      // Fluid coating the fingertip, and a drop leaving it.
      ctx.fillStyle = BLACK
      ctx.beginPath()
      ctx.ellipse(x0 + s * len * 0.85, y + L * 0.04, L * 0.07, L * 0.05, 0, 0, Math.PI * 2)
      ctx.fill()
      const fall = (t * 1.4 + f * 0.27) % 1
      drop(x0 + s * len * 0.9, y + L * 0.1 + fall * fall * m * 0.3, 3.5)
    }
  }

  function feet(t: number, time: number, shift: number) {
    ctx.save()
    ctx.translate(0, shift)
    world(1)
    const cx = W / 2
    const L = m * 0.34
    const ankleY = H * 0.6
    // Rings where the drops land, around each foot.
    for (const side of [-1, 1]) {
      const fx = cx + side * L * 0.42
      rings(fx, ankleY - L * 0.3, t, side > 0 ? 0.4 : 0, L * 0.9)
      rings(fx + side * L * 0.3, ankleY + L * 0.1, t * 1.2, 0.2, L * 0.4)
    }
    for (const side of [-1, 1]) {
      const fx = cx + side * L * 0.42
      foot(fx, ankleY, L, side, t)
      // Where the foot meets the fluid, a wet dark line and a glint.
      ctx.strokeStyle = 'rgba(241, 235, 223, 0.4)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.ellipse(fx, ankleY - L * 0.45, L * 0.33, L * 0.55, 0, Math.PI * 0.15, Math.PI * 0.85)
      ctx.stroke()
      leg(fx, ankleY + L * 0.02, L * 0.42, side, t)
    }
    hand(-1, t)
    hand(1, t)
    ctx.restore()
    void time
  }

  // Draw frame t (seconds into the cutscene). Returns false once it is over.
  function render(t: number, time: number) {
    boil = Math.floor(time * 12)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (t >= FLUID_LENGTH) return false
    if (t < 0.9) {
      under(t)
      return true
    }
    const drain = clamp01((t - 0.95) / 1.65)
    const down = easeInOut(clamp01((t - 2.6) / 0.8))
    const up = easeInOut(clamp01((t - 6.0) / 1.0))
    if (down < 1) {
      ctx.save()
      ctx.translate(0, -down * H)
      world(0)
      ctx.restore()
    }
    if (down > 0) feet(t - 2.6, time, (1 - down) * H - up * H * 1.1)
    if (drain < 1) draining(drain, time)
    // The first moment out: the flash of air and light.
    const flash = 1 - smooth(0.9, 1.25, t)
    if (flash > 0) {
      ctx.fillStyle = `rgba(241, 235, 223, ${flash * 0.6})`
      ctx.fillRect(0, 0, W, H)
    }
    // Looking up: the view fades to the ground the forge stands on.
    if (up > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${easeOut(up)})`
      ctx.fillRect(0, 0, W, H)
    }
    void P
    return true
  }

  // Speed lines over the sky: radial on a leap, streaming upward in a fall.
  function speed(amount: number, falling: number, time: number) {
    boil = Math.floor(time * 12)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (amount <= 0.05) return
    ctx.save()
    ctx.globalAlpha = Math.min(amount, 1) * 0.75
    const dark = falling > 0.5
    ctx.fillStyle = dark ? 'rgba(241, 235, 223, 0.9)' : 'rgba(20, 16, 14, 0.9)'
    const n = 64
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (hash(i + boil) - 0.5) * 0.08
      const inner = m * (0.38 + 0.25 * hash(i * 3 + boil)) * (1.15 - amount * 0.3)
      const outer = Math.hypot(W, H)
      const w = 0.004 + 0.012 * hash(i * 5.1)
      ctx.beginPath()
      ctx.moveTo(W / 2 + Math.cos(a) * inner, H / 2 + Math.sin(a) * inner)
      ctx.lineTo(W / 2 + Math.cos(a - w) * outer, H / 2 + Math.sin(a - w) * outer)
      ctx.lineTo(W / 2 + Math.cos(a + w) * outer, H / 2 + Math.sin(a + w) * outer)
      ctx.closePath()
      ctx.fill()
    }
    // Falling: streaks rushing up past you.
    if (falling > 0) {
      ctx.globalAlpha = falling * 0.6
      for (let i = 0; i < 50; i++) {
        const x = hash(i * 7.7) * W
        const y = H - ((hash(i * 3.3) * H + time * (1400 + hash(i) * 900)) % (H * 1.4))
        ctx.fillRect(x, y, 1 + hash(i * 2) * 2, m * (0.08 + hash(i * 9) * 0.2))
      }
    }
    ctx.restore()
  }

  return { resize, render, speed }
}
