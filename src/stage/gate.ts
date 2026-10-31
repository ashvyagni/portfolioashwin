import * as THREE from 'three'

// The threshold before the story: a glass ball with a crackling rim, full of
// glowing dust that has settled to the bottom and swirls up when the cursor
// stirs it, floating over a field of flux lines — contour lines of a slowly
// churning field that the cursor reveals and curls. The ball is warm (rose and
// ember, the eyes' family); the lines are its complement (mint to teal). Seen
// through the glass, the lines are inverted, as a solid sphere would show them.
//
// To enter, the visitor presses and holds the ball: an arc traces round it,
// the lines draw in towards it and burn brighter, the rim crackles harder,
// the dust lifts and swirls. Let go too soon and it all settles again. At
// full charge the ball collapses to a point: the distant star that opens the
// story.

const quad = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fieldFragment = /* glsl */ `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uReveal;     // how present the cursor is (fades when still)
uniform vec3 uBall;        // centre xy, radius — scene units
uniform float uCollapse;
uniform float uAlpha;
uniform float uCharge;     // 0..1 while the ball is held

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return v;
}

// Flux lines: contours of a churning, domain-warped field, curled by the cursor.
vec3 flux(vec2 p, float dim) {
  float t = uTime;
  vec2 d = p - uMouse;
  float swirl = exp(-dot(d, d) / 0.06) * 2.4 * uReveal;
  p = uMouse + mat2(cos(swirl), sin(swirl), -sin(swirl), cos(swirl)) * d;

  vec2 q = p * 1.5;
  vec2 warp = vec2(fbm(q + vec2(0.0, t * 0.05)), fbm(q + vec2(5.2, 1.3) - t * 0.04));
  float f = fbm(q + 2.2 * warp + vec2(t * 0.02, 0.0));
  float v = f * 9.0;
  float band = abs(fract(v) - 0.5);
  float w = fwidth(v);

  float thin = 1.0 - smoothstep(0.0, w * 1.3, band);
  float glow = exp(-pow(band / 0.09, 2.0));
  // Only some contours burn; the rest are hairlines, sparse in places.
  float hot = smoothstep(0.55, 0.85, noise(p * 1.1 + floor(v) * 3.7 + t * 0.03));
  float present = smoothstep(0.25, 0.6, noise(p * 0.7 + floor(v) * 1.3 - t * 0.02));
  float near = exp(-dot(d, d) / 0.09) * uReveal;

  float lum = (thin * (0.3 + 0.5 * near) + glow * hot * (1.1 + 0.8 * near)) * (present * 0.85 + near) * dim;
  vec3 deep = vec3(0.04, 0.3, 0.27);
  vec3 mint = vec3(0.62, 1.0, 0.84);
  vec3 col = mix(deep, mint, clamp(lum * 1.2 + 0.2 * f, 0.0, 1.0)) * lum;
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float R = uBall.z * pow(1.0 - uCollapse, 1.6);
  vec2 bp = p - uBall.xy;
  float r = length(bp) / max(R, 1e-4);
  float ang = atan(bp.y, bp.x);

  vec3 col = vec3(0.0);
  float fieldFade = 1.0 - smoothstep(0.0, 0.6, uCollapse);

  // Through the glass: the field inverted and drawn in towards the centre.
  if (r < 1.0) {
    vec2 refracted = uBall.xy - bp * mix(1.6, 0.75, r * r);
    col += flux(refracted, 0.55) * fieldFade;
    col *= 0.6 + 0.4 * r * r;
    col += vec3(0.5, 0.15, 0.3) * 0.05 * pow(r, 5.0);
  } else {
    // Held, the field draws in towards the ball and burns brighter.
    vec2 drawn = uBall.xy + bp * (1.0 + uCharge * 0.55 / (1.0 + length(bp) * 2.0));
    col += flux(drawn, 1.0 + uCharge * 1.3 * exp(-length(bp) * 2.8)) * fieldFade;
  }

  // The rim: a bright line that crackles — its radius jitters with electric
  // noise, and now and then a filament arcs off it.
  float crackle = ((fbm(vec2(ang * 2.5, uTime * 1.8)) - 0.5) * 0.06
                + (noise(vec2(ang * 26.0, uTime * 11.0)) - 0.5) * 0.025) * (1.0 + uCharge * 2.2);
  float rr = (r - 1.0 - crackle) * R;
  float core = exp(-pow(rr / 0.0018, 2.0));
  float halo = exp(-abs(rr) * 120.0) * 0.6 + exp(-abs(rr) * 28.0) * 0.18;
  float filament = smoothstep(0.86, 0.96, noise(vec2(ang * 34.0, uTime * 14.0)))
                 * exp(-max(rr, 0.0) * 160.0) * step(0.0, rr) * 0.8;
  vec3 rose = vec3(1.0, 0.42, 0.62);
  vec3 ember = vec3(1.0, 0.62, 0.32);
  vec3 rimCol = mix(rose, ember, 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.6));
  float flare = 1.0 + 6.0 * smoothstep(0.6, 1.0, uCollapse) + uCharge * 1.6;
  col += rimCol * (core * 1.3 + halo + filament) * flare;
  col += vec3(1.0, 0.95, 0.97) * core * 0.6;

  // The charge, traced clockwise from the top around the ball.
  if (uCharge > 0.001) {
    float da = abs(length(bp) - uBall.z * 1.24);
    float a01 = fract(0.25 - ang / 6.2831853);
    float arc = (1.0 - smoothstep(0.0011, 0.0024, da)) * step(a01, uCharge);
    float tick = (1.0 - smoothstep(0.0, 0.006, abs(a01 - uCharge))) * exp(-da * 400.0);
    col += mix(rose, vec3(1.0, 0.88, 0.62), a01) * (arc * 1.3 + tick * 2.0) * (1.0 - uCollapse);
  }

  // A soft window of light on the glass.
  float spec = exp(-dot(bp / max(R, 1e-4) - vec2(-0.38, 0.42), bp / max(R, 1e-4) - vec2(-0.38, 0.42)) / 0.018);
  col += vec3(1.0, 0.92, 0.95) * spec * 0.12 * step(r, 1.0);

  gl_FragColor = vec4(col * uAlpha, 1.0);
}
`

const dustVertex = /* glsl */ `
attribute vec3 aSeed;
attribute float aRand;

uniform float uTime;
uniform float uStir;
uniform float uCollapse;
uniform float uPixelRatio;
uniform float uAspect;
uniform vec3 uBall;
uniform vec2 uPull;     // where the cursor is, relative to the ball (radius units)

varying float vBright;
varying float vRand;

void main() {
  vec3 p = aSeed;

  // Stirred: the dust lifts off the bottom and turns, more for the light grains.
  float lift = uStir * (0.35 + 0.65 * aRand);
  p.y += lift * (0.8 + 0.4 * sin(uTime * 1.3 + aRand * 20.0));
  float turn = uTime * (0.06 + 0.12 * aRand) + uStir * (1.5 + aRand * 2.0);
  p.xz = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * p.xz;
  p += vec3(sin(uTime * 0.9 + aRand * 30.0), cos(uTime * 0.7 + aRand * 17.0), sin(uTime * 0.8 + aRand * 11.0))
     * (0.025 + 0.12 * uStir);
  p.xy += uPull * 0.12 * uStir * aRand;

  // Keep it inside the glass.
  float l = length(p);
  if (l > 0.95) p *= 0.95 / l;
  p *= 1.0 - uCollapse;

  vec2 scene = uBall.xy + p.xy * uBall.z;
  gl_Position = vec4(scene.x * 2.0 / uAspect, scene.y * 2.0, 0.0, 1.0);

  float depth = p.z * 0.5 + 0.5;
  vBright = (0.35 + 0.65 * depth) * (0.6 + 0.4 * aRand);
  vRand = aRand;
  gl_PointSize = (0.9 + 1.9 * aRand * aRand) * uPixelRatio * (0.7 + 0.5 * depth);
}
`

const dustFragment = /* glsl */ `
precision highp float;
uniform float uAlpha;
uniform float uTime;
varying float vBright;
varying float vRand;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.15, 0.5, d);
  vec3 rose = vec3(1.0, 0.45, 0.68);
  vec3 ember = vec3(1.0, 0.68, 0.38);
  vec3 col = mix(rose, ember, step(0.8, vRand)) * vBright;
  col += vec3(1.0) * step(0.97, vRand) * 0.5;
  float twinkle = 0.75 + 0.25 * sin(uTime * (2.0 + vRand * 5.0) + vRand * 50.0);
  gl_FragColor = vec4(col * a * twinkle * uAlpha, 1.0);
}
`

export function createGate({ small }: { small: boolean }) {
  const ball = new THREE.Vector3(0, 0.16, 0.15)

  const fieldUniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, -2) },
    uReveal: { value: 0 },
    uBall: { value: ball },
    uCollapse: { value: 0 },
    uAlpha: { value: 0 },
    uCharge: { value: 0 },
  }
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: quad,
      fragmentShader: fieldFragment,
      uniforms: fieldUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  field.frustumCulled = false
  field.renderOrder = 3

  // Dust settled in the bottom of the glass: denser low, thinning upwards.
  const count = small ? 4500 : 11000
  const seeds = new Float32Array(count * 3)
  const rands = new Float32Array(count)
  for (let i = 0; i < count; ) {
    const x = Math.random() * 2 - 1
    const y = Math.random() * 2 - 1
    const z = Math.random() * 2 - 1
    if (x * x + y * y + z * z > 0.9) continue
    const keep = 0.035 + 0.965 * THREE.MathUtils.smoothstep(-y, -0.15, 0.75) ** 2
    if (Math.random() > keep) continue
    seeds.set([x, y, z], i * 3)
    rands[i] = Math.random()
    i++
  }
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3))
  dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  dustGeometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 1))
  const dustUniforms = {
    uTime: fieldUniforms.uTime,
    uStir: { value: 0 },
    uCollapse: fieldUniforms.uCollapse,
    uPixelRatio: { value: 1 },
    uAspect: { value: 1 },
    uBall: fieldUniforms.uBall,
    uPull: { value: new THREE.Vector2() },
    uAlpha: fieldUniforms.uAlpha,
  }
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: dustUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  dust.frustumCulled = false
  dust.renderOrder = 4

  const group = new THREE.Group()
  group.add(field, dust)

  let lastMouse: THREE.Vector2 | null = null
  let stir = 0
  let reveal = 0

  function setLayout(buffer: THREE.Vector2, aspect: number, pixelRatio: number) {
    fieldUniforms.uRes.value.copy(buffer)
    dustUniforms.uPixelRatio.value = pixelRatio
    dustUniforms.uAspect.value = aspect
  }

  // The cursor stirs the dust when it moves near the glass, and wakes the
  // lines wherever it goes; both settle again when it rests.
  function update(time: number, dt: number, mouse: THREE.Vector2) {
    fieldUniforms.uTime.value = time
    // Speed in scene units per second; the first frame has no history.
    const speed = lastMouse ? Math.min(mouse.distanceTo(lastMouse) / Math.max(dt, 1 / 120), 4) : 0
    lastMouse = (lastMouse ?? new THREE.Vector2()).copy(mouse)
    const toBall = mouse.clone().sub(new THREE.Vector2(ball.x, ball.y))
    const near = Math.exp(-Math.max(toBall.length() - ball.z, 0) * 6)
    stir = Math.min(1.4, stir * Math.exp(-dt * 0.9) + speed * near * dt * 1.2)
    reveal = Math.min(1, reveal * Math.exp(-dt * 0.6) + speed * dt * 2)
    dustUniforms.uStir.value = Math.min(1.6, stir + fieldUniforms.uCharge.value * 1.2)
    dustUniforms.uPull.value.copy(toBall).divideScalar(ball.z)
    fieldUniforms.uMouse.value.copy(mouse)
    fieldUniforms.uReveal.value = reveal
    group.visible = fieldUniforms.uAlpha.value > 0.001
  }

  return { group, uniforms: fieldUniforms, setLayout, update }
}
