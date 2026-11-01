// The black fluid you land in, which stays as the forge's ground: a field of
// dots, each sized by the light on a slow wave surface beneath it, as if the
// fluid were seen through a halftone screen. Touch it and it rings: the cursor
// leaves ripples that run out across the dots and fade.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uDpr;
uniform float uAppear;
uniform vec4 uRipples[10]; // x, y (css px), start time, strength
uniform vec3 uLevels;      // the song now: bass, mids, highs (0 … 1)
uniform vec3 uPal0;        // its palette: deep, mid, light
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform float uGrad;       // how much of the gradient there is
out vec4 frag;

// The song's gradient: three soft lights drifting, swelling with the bass,
// laid down through an ordered dither and scanlines, as print, not glow.
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[i] / 16.0;
}
vec3 songGradient(vec2 uv, float t) {
  float b = uLevels.x;
  vec2 a1 = vec2(0.3 + 0.15 * sin(t * 0.21), 0.35 + 0.12 * cos(t * 0.17));
  vec2 a2 = vec2(0.72 + 0.12 * cos(t * 0.19), 0.62 + 0.15 * sin(t * 0.23));
  vec2 a3 = vec2(0.5 + 0.25 * sin(t * 0.13 + 2.0), 0.15 + 0.1 * sin(t * 0.29));
  float d1 = exp(-pow(length(uv - a1) / (0.32 + 0.22 * b), 2.0));
  float d2 = exp(-pow(length(uv - a2) / (0.28 + 0.18 * uLevels.y), 2.0));
  float d3 = exp(-pow(length(uv - a3) / (0.2 + 0.25 * b), 2.0));
  vec3 c = uPal0 * 0.55;
  c = mix(c, uPal1, d1 * (0.65 + 0.35 * b));
  c = mix(c, uPal2, d3 * (0.35 + 0.5 * b));
  c = mix(c, uPal1 * 0.8 + uPal2 * 0.2, d2 * (0.5 + 0.3 * uLevels.y));
  return c;
}

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// The fluid's surface: long folds, like heavy silk, bent by slow noise.
float surface(vec2 p) {
  float t = uTime;
  vec2 dir = normalize(vec2(0.94, 0.34));
  vec2 side = vec2(-dir.y, dir.x);
  float u = dot(p, dir);
  float v = dot(p, side);
  float bend = noise(vec2(v * 0.9, t * 0.05)) * 1.8 + 0.4 * sin(v * 1.4 + t * 0.2);
  float phase = u * 5.0 + bend - t * 0.4;
  float swell = 0.6 + 0.4 * noise(vec2(u * 0.5 + 3.0, v * 0.45 + t * 0.03));
  return (sin(phase) + 0.3 * sin(2.0 * phase + 1.3) + 0.15 * sin(u * 12.0 + bend * 1.9 - t * 0.9)) * swell;
}

float height(vec2 css) {
  vec2 p = (css - 0.5 * uRes / uDpr) / 420.0;
  float h = surface(p);
  for (int i = 0; i < 10; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0) continue;
    float d = length(css - r.xy);
    float front = age * 260.0;
    float ring = exp(-pow((d - front) / 40.0, 2.0)) * sin((d - front) * 0.09);
    h += ring * r.w * 1.6 * exp(-age * 0.9) * (1.0 / (1.0 + d * 0.004));
  }
  return h;
}

void main() {
  float pitch = 7.0 * uDpr;
  vec2 cell = floor(gl_FragCoord.xy / pitch);
  vec2 center = (cell + 0.5) * pitch;
  vec2 css = center / uDpr;
  float e = 6.0;
  float h = height(css);
  float hx = height(css + vec2(e, 0.0)) - height(css - vec2(e, 0.0));
  float hy = height(css + vec2(0.0, e)) - height(css - vec2(0.0, e));
  vec3 n = normalize(vec3(-hx * 2.4, -hy * 2.4, 1.0));
  vec3 light = normalize(vec3(-0.5, 0.55, 0.65));
  float diffuse = max(dot(n, light), 0.0);
  float spec = pow(max(dot(n, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);
  // Lit folds bright, the troughs between them nearly gone.
  float tone = clamp((diffuse - 0.62) * 4.0 + 0.3 + spec * 0.9 + h * 0.06, 0.0, 1.0);
  tone = tone * tone;
  // The dots come up from the middle outward as the fluid settles.
  vec2 c = css / (uRes / uDpr) - 0.5;
  float appear = smoothstep(length(c) * 1.4 - 0.1, length(c) * 1.4 + 0.25, uAppear * 1.6);
  float r = (0.06 + 0.36 * tone) * pitch * appear;
  float d = length(gl_FragCoord.xy - center);
  float dot_ = 1.0 - smoothstep(r - 0.8, r + 0.8, d);
  // Bone-white dots; the brightest crests catch a little mint.
  vec3 col = mix(vec3(0.42, 0.44, 0.43), vec3(0.93, 0.92, 0.88), tone);
  col = mix(col, vec3(0.56, 0.95, 0.77), smoothstep(0.88, 1.0, tone) * smoothstep(0.2, 0.6, spec) * 0.8);
  float fade = 1.0 - smoothstep(0.35, 0.75, length(c * vec2(1.0, 1.3)));
  vec3 dots = col * dot_ * (0.3 + 0.7 * fade) * (0.25 + 0.75 * tone);
  // The dots catch the song's light on their crests; the highs make them shimmer.
  dots = mix(dots, dots * (uPal2 * 1.1 + 0.15), uGrad * 0.5 * tone);
  dots *= 1.0 + uLevels.z * 0.6 * uGrad;
  vec2 uvs = gl_FragCoord.xy / uRes;
  vec3 gcol = songGradient(uvs, uTime);
  float lum = dot(gcol, vec3(0.3, 0.59, 0.11));
  float steps = 6.0;
  vec3 dithered = floor(gcol * steps + bayer(gl_FragCoord.xy / max(uDpr, 1.0) / 2.0)) / steps;
  float scan = 0.82 + 0.18 * step(1.5, mod(gl_FragCoord.y / uDpr, 3.0));
  vec3 bg = dithered * scan * uGrad * (0.28 + 0.3 * lum) * (0.8 + 0.4 * uLevels.x);
  frag = vec4(bg * (1.0 - dot_ * 0.6) + dots, 1.0);
}
`

export function createWaves(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
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
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const U = (n: string) => gl.getUniformLocation(prog, n)
  const uRes = U('uRes')
  const uTime = U('uTime')
  const uDpr = U('uDpr')
  const uAppear = U('uAppear')
  const uRipples = U('uRipples')
  const uLevels = U('uLevels')
  const uPal = [U('uPal0'), U('uPal1'), U('uPal2')]
  const uGrad = U('uGrad')
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
  let palette = [hex('#101015'), hex('#2A2A30'), hex('#D8D2C8')]
  const ripples = new Float32Array(40)
  let next = 0
  let dpr = 1
  let lastAdd = 0
  let lastX = -1
  let lastY = -1

  function resize(w: number, h: number) {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    gl!.viewport(0, 0, canvas.width, canvas.height)
  }

  // The cursor, moving over the fluid: a ripple every so often, stronger the faster it goes.
  function touch(x: number, y: number, time: number, strength?: number) {
    const moved = lastX < 0 ? 0 : Math.hypot(x - lastX, y - lastY)
    lastX = x
    lastY = y
    if (strength === undefined && (time - lastAdd < 0.12 || moved < 6)) return
    lastAdd = time
    // In GL's frame (y up), in CSS px.
    ripples.set([x, canvas.height / dpr - y, time, strength ?? Math.min(0.25 + moved * 0.012, 1)], next * 4)
    next = (next + 1) % 10
  }

  function setPalette(p: [string, string, string]) {
    palette = p.map(hex)
  }

  function render(time: number, appear: number, levels = { bass: 0, mid: 0, high: 0 }, grad = 0) {
    gl!.uniform3f(uLevels, levels.bass, levels.mid, levels.high)
    palette.forEach((c, i) => gl!.uniform3f(uPal[i], c[0], c[1], c[2]))
    gl!.uniform1f(uGrad, grad)
    gl!.uniform2f(uRes, canvas.width, canvas.height)
    gl!.uniform1f(uTime, time)
    gl!.uniform1f(uDpr, dpr)
    gl!.uniform1f(uAppear, appear)
    gl!.uniform4fv(uRipples, ripples)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  return { resize, render, touch, setPalette }
}
