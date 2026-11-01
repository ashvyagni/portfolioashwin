import photo from '../assets/ashwin.webp'

// Ashwin, in dots: the photograph sampled on a fine grid, each dot as large
// as the light there (the white backdrop cut away, so only he remains), the
// edges sharpened first so the eyes, brows and the line of the jaw hold their
// detail. The dots gather in from a scatter; the cursor pushes them aside, and
// they drift back.

// The face and a little of the collar, out of the full photograph (fractions).
const CROP = { x: 150 / 1086, y: 220 / 1448, w: 786 / 1086, h: 980 / 1448 }

const VERT = `#version 300 es
in vec2 aHome;
in float aSize;
in float aSeed;
uniform vec2 uRes;
uniform vec2 uPointer;
uniform float uTime;
uniform float uGather;
uniform float uDpr;
uniform float uZoom;
uniform vec2 uFocus;
out float vTone;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  // The camera's pull: in close on the eyes, out to the whole face.
  vec2 p = uFocus + (aHome - uFocus) * uZoom;
  p += (uRes * 0.5 - uFocus) * smoothstep(1.0, 3.0, uZoom);
  // Gather in from a scatter.
  // Drawn in from either side of the screen, like the title's particles.
  float side = hash(aSeed + 5.0) > 0.5 ? 1.0 : -1.0;
  vec2 away = vec2(side * (uRes.x * 0.6 + hash(aSeed) * uRes.x * 0.5), (hash(aSeed + 3.1) - 0.5) * uRes.y * 0.9) - (aHome - uRes * 0.5) * vec2(1.0, 0.0);
  float g = smoothstep(0.0, 1.0, clamp(uGather * 1.4 - hash(aSeed + 7.7) * 0.4, 0.0, 1.0));
  p = mix(p + away, p, g);
  // Pushed aside by the cursor.
  vec2 d = p - uPointer;
  float dist = length(d);
  p += d / max(dist, 1.0) * 42.0 * exp(-dist * dist / 5200.0);
  // Breathing, barely.
  p += vec2(sin(uTime * 0.8 + aSeed), cos(uTime * 0.7 + aSeed * 1.3)) * 0.35;
  vec2 clip = (p / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = aSize * uDpr * mix(1.0, uZoom, 0.7);
  vTone = aSize;
}
`
const FRAG = `#version 300 es
precision highp float;
in float vTone;
uniform float uMax;
out vec4 frag;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.42, 0.5, d);
  float t = vTone / uMax;
  vec3 col = mix(vec3(0.72, 0.74, 0.72), vec3(0.97, 0.95, 0.9), t);
  col = mix(col, vec3(0.55, 0.98, 0.78), smoothstep(0.92, 1.0, t) * 0.35);
  frag = vec4(col * a, a);
}
`

export function createPortrait(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })
  if (!gl) return null
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  const U = (n: string) => gl.getUniformLocation(prog, n)
  const vao = gl.createVertexArray()
  const buf = gl.createBuffer()
  let count = 0
  let dpr = 1
  let W = 1
  let H = 1
  let maxSize = 1
  const focus = { x: 0, y: 0 }
  const image = new Image()
  image.src = photo
  const loaded = image.decode().catch(() => undefined)

  async function build() {
    await loaded
    if (!image.naturalWidth) return
    const portrait = W < H
    const boxH = H * (portrait ? 0.62 : 0.86)
    const boxW = boxH * ((CROP.w * image.naturalWidth) / (CROP.h * image.naturalHeight))
    const pitch = portrait ? 4.2 : 4.6
    const cols = Math.floor(boxW / pitch)
    const rows = Math.floor(boxH / pitch)
    const c = document.createElement('canvas')
    c.width = cols
    c.height = rows
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(image, CROP.x * image.naturalWidth, CROP.y * image.naturalHeight, CROP.w * image.naturalWidth, CROP.h * image.naturalHeight, 0, 0, cols, rows)
    const px = g.getImageData(0, 0, cols, rows).data
    const lum = new Float32Array(cols * rows)
    for (let i = 0; i < cols * rows; i++) lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255
    // Cut away the white backdrop: flood in from the border over near-white.
    const bg = new Uint8Array(cols * rows)
    const stack: number[] = []
    for (let x = 0; x < cols; x++) stack.push(x, (rows - 1) * cols + x)
    for (let y = 0; y < rows; y++) stack.push(y * cols, y * cols + cols - 1)
    while (stack.length) {
      const i = stack.pop()!
      if (bg[i] || lum[i] < 0.86) continue
      bg[i] = 1
      const x = i % cols
      const y = (i / cols) | 0
      if (x > 0) stack.push(i - 1)
      if (x < cols - 1) stack.push(i + 1)
      if (y > 0) stack.push(i - cols)
      if (y < rows - 1) stack.push(i + cols)
    }
    // Sharpen: each value pushed away from its neighbours' mean.
    const sharp = new Float32Array(cols * rows)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        let s = 0
        let n = 0
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
            s += lum[yy * cols + xx]
            n++
          }
        }
        sharp[i] = Math.min(Math.max(lum[i] + 0.9 * (lum[i] - s / n), 0), 1)
      }
    }
    const data: number[] = []
    const ox = (W - cols * pitch) / 2
    const oy = (H - rows * pitch) / 2
    // Between the eyes, in the crop.
    focus.x = ox + cols * pitch * 0.5
    focus.y = oy + rows * pitch * 0.44
    maxSize = pitch * 1.05
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        if (bg[i]) continue
        const t = Math.pow(sharp[i], 1.25)
        const size = maxSize * (0.12 + 0.88 * t)
        if (size < pitch * 0.18) continue
        data.push(ox + x * pitch + pitch / 2, oy + y * pitch + pitch / 2, size, i)
      }
    }
    count = data.length / 4
    gl!.bindVertexArray(vao)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buf)
    gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(data), gl!.STATIC_DRAW)
    const attr = (name: string, size: number, offset: number) => {
      const loc = gl!.getAttribLocation(prog, name)
      gl!.enableVertexAttribArray(loc)
      gl!.vertexAttribPointer(loc, size, gl!.FLOAT, false, 16, offset)
    }
    attr('aHome', 2, 0)
    attr('aSize', 1, 8)
    attr('aSeed', 1, 12)
  }

  function resize(w: number, h: number) {
    W = w
    H = h
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    gl!.viewport(0, 0, canvas.width, canvas.height)
    void build()
  }

  function render(time: number, pointer: { x: number; y: number }, gather: number, zoom = 1) {
    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    if (!count) return
    gl!.useProgram(prog)
    gl!.bindVertexArray(vao)
    gl!.uniform2f(U('uRes'), W, H)
    gl!.uniform2f(U('uPointer'), pointer.x, pointer.y)
    gl!.uniform1f(U('uTime'), time)
    gl!.uniform1f(U('uGather'), gather)
    gl!.uniform1f(U('uDpr'), dpr)
    gl!.uniform1f(U('uMax'), maxSize)
    gl!.uniform1f(U('uZoom'), zoom)
    gl!.uniform2f(U('uFocus'), focus.x, focus.y)
    gl!.drawArrays(gl!.POINTS, 0, count)
  }

  return { resize, render }
}
