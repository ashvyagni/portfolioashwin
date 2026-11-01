import { loadReadme, type Repo } from './github'

// A project's picture, the way the forge prints it: the README's first image
// redrawn in vertical lines — each column a stroke whose width follows the
// light, as an engraver or an old screen would — in the song's colours.
// When there is no image, a motif seeded by the project's name, drawn the
// same way, stands in.

const cache = new Map<string, Promise<HTMLCanvasElement>>()

function firstImage(html: string | null) {
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const img = [...doc.querySelectorAll('img')].find((i) => {
    const src = i.getAttribute('src') ?? ''
    // Badges and shields are not pictures of the work.
    return src && !/shields\.io|badge|badgen|img\.shields|\.svg(\?|$)/i.test(src)
  })
  return img?.getAttribute('src') ?? null
}

function load(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Luminance (0 … 1) on a grid, from an image or from the name's motif.
function lightOf(img: HTMLImageElement | null, cols: number, rows: number, seed: number) {
  const out = new Float32Array(cols * rows)
  if (img) {
    const c = document.createElement('canvas')
    c.width = cols
    c.height = rows
    const g = c.getContext('2d', { willReadFrequently: true })!
    // Cover, centred.
    const s = Math.max(cols / img.naturalWidth, rows / img.naturalHeight)
    const w = img.naturalWidth * s
    const h = img.naturalHeight * s
    g.drawImage(img, (cols - w) / 2, (rows - h) / 2, w, h)
    try {
      const d = g.getImageData(0, 0, cols, rows).data
      for (let i = 0; i < cols * rows; i++) out[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255
      return out
    } catch {
      // A picture we may not read (no CORS): fall back to the motif.
    }
  }
  const fx = 0.02 + hash(seed) * 0.05
  const fy = 0.03 + hash(seed * 3) * 0.05
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = 0.5 + 0.5 * Math.sin(x * fx + Math.cos(y * fy + seed) * 2.6) * Math.cos(y * fy * 1.4 - seed * 0.7)
      const r = Math.hypot(x / cols - 0.62, y / rows - 0.5)
      out[y * cols + x] = Math.min(1, v * v * 0.9 + Math.max(0, 0.35 - r) * 1.2)
    }
  }
  return out
}

// Draw the light as vertical lines on a dark ground, tinted from deep to light.
export function printLines(light: Float32Array, cols: number, rows: number, scale: number, ink: [string, string], ground = '#0B0A0D') {
  const c = document.createElement('canvas')
  c.width = cols * scale
  c.height = rows * scale
  const g = c.getContext('2d')!
  g.fillStyle = ground
  g.fillRect(0, 0, c.width, c.height)
  const grad = g.createLinearGradient(0, 0, 0, c.height)
  grad.addColorStop(0, ink[1])
  grad.addColorStop(1, ink[0])
  g.fillStyle = grad
  const pitch = 3
  for (let x = 0; x < cols; x += pitch) {
    for (let y = 0; y < rows; y++) {
      // Contrast lifted, so the picture reads at a glance.
      const l = Math.min(1, Math.max(0, (light[y * cols + x] - 0.12) * 1.35))
      const w = l * pitch * scale * 0.95
      if (w < 0.35) continue
      g.fillRect(x * scale + (pitch * scale - w) / 2, y * scale, w, scale)
    }
  }
  // Fine scanlines over all of it.
  g.fillStyle = 'rgba(0, 0, 0, 0.22)'
  for (let y = 0; y < c.height; y += 3) g.fillRect(0, y, c.width, 1)
  return c
}

// The project's print, cached. `ink`: [deep, light] colours.
export function projectArt(repo: Repo, ink: [string, string], cols = 240, rows = 135) {
  const key = `${repo.name}|${ink.join()}|${cols}`
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        const src = firstImage(await loadReadme(repo))
        const img = src ? await load(src) : null
        const seed = [...repo.name].reduce((s, ch) => s + ch.charCodeAt(0), 0)
        return printLines(lightOf(img, cols, rows, seed), cols, rows, 4, ink)
      })(),
    )
  }
  return cache.get(key)!
}
