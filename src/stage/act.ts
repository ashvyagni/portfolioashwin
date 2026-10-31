import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { createLotus, petalLight } from './lotus'
import { WAKES, createPond, padGeometry, padMaterial } from './pond'
import { constructionTexture } from './actText'
import type { SketchState } from './post'

// The grand entry, in real 3D. Everything is a function of one clock, `t`
// (seconds into the act), so the act can be scrubbed and skipped cleanly.
// The stage stops it at three beats (◆) and waits for a scroll:
//
//    0 –  7   before dawn over a lotus pond. Mist, fireflies, the hills still
//             violet; the sky warms and the sun comes up behind them. Across
//             the pond, small lotuses open one by one
//    5 – 19.6 the great white lotus rises out of the water and opens, slowly,
//             petal by petal on the golden-angle spiral, over the gold
//             construction that sets them; the chapters surface around it, and
//             from its last petal, जिज्ञासा                                    ◆
//   19.6 – 23 the camera rises over the flower and looks down into its heart
//   23 – 26.5 and pulls out, high over the whole pond: the mind. Crowded with
//             koi racing, weeds thrashing, the water choppy with their wakes,
//             cloud rolling over; the lotus folds shut and sinks              ◆
//   26.6 – 28 from above: a single clear drop — a thought — falls away from
//             us into the churn
//   28 – 30.4 beside it, all the way down, slowing as it nears the water
//   30.4 –    it strikes. A crown of droplets, a ring of wave; the koi scatter,
//             then settle to a slow glide. The storm clears to gold, paper and
//             bronze; in the water's reflection a world appears, then for real ◆
//   37 – 45   a lotus rises where the drop fell; the letters of the name come
//             up out of it one by one, a headline bar draws across their tops
//             as Devanagari hangs from its shirorekha, and अश्विन beneath

export const ACT_LENGTH = 45
export const IMPACT = 30.4
// Where the act waits for the visitor (act seconds).
export const ACT_BEATS = [19.6, 26.5, 36.6]
const LOTUS_Y = 0.02
const DROP_R = 0.2
const DROP_AT = 26.6
const DROP_TOP = 12.4
const SIDE_AT = 28.0

export const CHAPTERS = [
  { num: '२', hi: 'अन्वेषण', en: 'Exploration' },
  { num: '३', hi: 'धुन', en: 'Obsession' },
  { num: '४', hi: 'निर्माण', en: 'Building' },
  { num: '५', hi: 'विफलता', en: 'Failure' },
  { num: '६', hi: 'खोज', en: 'Discovery' },
  { num: '७', hi: 'विकास', en: 'Evolution' },
]
const BLOOM_AT = 7.6
export const CHAPTER_AT = (i: number) => 8.8 + i * 1.05
export const JIGYASA_AT = 15.4
export const RISE_AT = 37.0
// The vines and flowers climb out of the water; a brush comes up out of the
// lotus and paints the name (see sketchLayer.ts).
export const VINES_AT = 36.9
export const BRUSH_AT = 39.4
export const PAINT_AT = 40.3
export const PAINT_LENGTH = 3.0
export const DEVA_AT = 43.5
export const NOTES_AT = 24.5
export const DROP_START = 26.6
export const SIDE_START = 28.0
export const IMPACT_AT = 30.4

// Small lotuses that open across the pond in the first light: where, when, colour.
const COMPANIONS = [
  { x: -3.2, z: -1.6, at: 2.2, pink: false, size: 0.3 },
  { x: 2.7, z: -2.8, at: 3.4, pink: true, size: 0.26 },
  { x: -1.7, z: 2.1, at: 4.4, pink: true, size: 0.22 },
  { x: 4.1, z: 0.6, at: 5.3, pink: false, size: 0.28 },
  { x: -4.8, z: -4.2, at: 6.1, pink: true, size: 0.3 },
  { x: 1.6, z: 3.3, at: 7.0, pink: false, size: 0.2 },
  { x: -2.6, z: -5.6, at: 8.2, pink: false, size: 0.26 },
  { x: 5.4, z: -4.6, at: 9.1, pink: true, size: 0.32 },
]

// The moments the score answers to, in act time.
export const ACT_CUES: { t: number; cue: string }[] = [
  { t: 0.0, cue: 'dawn' },
  ...COMPANIONS.map((c) => ({ t: c.at + 0.4, cue: 'bud' })),
  { t: 5.2, cue: 'rise' },
  ...CHAPTERS.map((_, i) => ({ t: CHAPTER_AT(i), cue: 'petal' })),
  { t: JIGYASA_AT, cue: 'jigyasa' },
  { t: 19.65, cue: 'crane' },
  { t: 23.0, cue: 'mind' },
  { t: DROP_AT, cue: 'drop' },
  { t: SIDE_AT, cue: 'follow' },
  { t: IMPACT, cue: 'impact' },
  { t: RISE_AT, cue: 'lotus' },
  { t: BRUSH_AT, cue: 'letter' },
  { t: PAINT_AT, cue: 'name' },
]

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)

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

const NOISE = /* glsl */ `
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
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`

// ------------------------------------------------------------------ light

// What the petals and the drop reflect: a soft warm sky, a paper-white
// horizon, bronze earth below, and a low sun. No hard studio panels — they
// are what made the glass read as metal.
function warmEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene()
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 top = vec3(0.95, 0.78, 0.55);
          vec3 horizon = vec3(1.0, 0.9, 0.74);
          vec3 ground = vec3(0.22, 0.13, 0.06);
          vec3 c = d.y > 0.0 ? mix(horizon, top, pow(d.y, 0.6)) : mix(horizon, ground, pow(-d.y, 0.4));
          vec3 sun = normalize(vec3(0.0, 0.2, -1.0));
          c += vec3(1.0, 0.86, 0.66) * pow(max(dot(d, sun), 0.0), 64.0) * 2.2;
          c += vec3(1.0, 0.8, 0.7) * pow(max(dot(d, normalize(vec3(-0.6, 0.7, 0.5))), 0.0), 12.0) * 1.2;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    }),
  )
  scene.add(dome)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(scene, 0.02).texture
  pmrem.dispose()
  return env
}

// The sky the whole act stands in. Three moods blended by weight: a dawn glow
// behind the lotus; the storm over the churning water; and after the drop,
// gold — parchment at the horizon, bronze overhead, the low sun ringed with a
// draughtsman's construction (circles stepping by φ, a golden spiral), the
// whole sky with the fibre and foxing of old paper.
const skyShader = {
  uniforms: {
    uTime: { value: 0 },
    uDawn: { value: 1 },
    uStorm: { value: 0 },
    uSerene: { value: 0 },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uInk: { value: new THREE.Color('#8a5a26') },
    uSun: { value: new THREE.Vector3(0, 0.1, -1).normalize() },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime, uDawn, uStorm, uSerene;
    uniform vec3 uZenith, uHorizon, uGlow, uInk, uSun;
    varying vec3 vDir;
    ${NOISE}
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.62, h));
      vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(h, -1.0, 1.0)));
      float ang = acos(clamp(dot(d, uSun), -1.0, 1.0));

      // Dawn: the sun coming up, a great soft light around it, wider than tall.
      vec3 dd = d - uSun;
      float wide = length(vec2(dd.x * 0.6, dd.y));
      col += uGlow * (exp(-wide * wide * 26.0) * 0.55 + exp(-ang * 3.0) * 0.16) * uDawn;
      col += uGlow * 1.1 * (1.0 - smoothstep(0.02, 0.026, ang)) * uDawn;

      // Storm: low churning cloud.
      float cl = fbm(sp * vec2(2.6, 5.0) + vec2(uTime * 0.16, -uTime * 0.07));
      col = mix(col, col * (0.5 + 1.0 * cl) + vec3(0.05, 0.015, 0.0) * cl, uStorm);

      // Gold: the low sun, and the construction ringed around it.
      col += uGlow * (exp(-ang * ang * 60.0) * 0.07 + exp(-ang * 3.2) * 0.07) * uSerene;
      float fw = fwidth(ang) * 1.4;
      float lines = 0.0;
      for (int k = 0; k < 7; k++) {
        float rk = 0.07 * pow(1.6180339, float(k));
        lines += 1.0 - smoothstep(0.0, fw, abs(ang - rk));
      }
      vec3 ex = normalize(cross(vec3(0.0, 1.0, 0.0), uSun));
      vec3 ey = cross(uSun, ex);
      float phi = atan(dot(d, ey), dot(d, ex));
      float b = 0.30634896;   // ln φ / (π/2): the golden spiral
      float turns = (log(max(ang, 1e-4) / 0.02) / b - phi) / 6.2831853;
      float off = abs(fract(turns + 0.5) - 0.5) * 6.2831853 * b * ang;
      lines += (1.0 - smoothstep(0.0, fw, off)) * step(ang, 1.15);
      // and radial rays, every 30°
      float ray = abs(fract(phi / 0.5235988 + 0.5) - 0.5) * 0.5235988 * ang;
      lines += (1.0 - smoothstep(0.0, fw, ray)) * smoothstep(0.07, 0.12, ang) * step(ang, 0.29) * 0.6;
      col = mix(col, uInk, clamp(lines, 0.0, 1.0) * 0.3 * uSerene * smoothstep(-0.03, 0.04, h));

      // Paper.
      float fibre = fbm(sp * vec2(70.0, 140.0));
      float fox = smoothstep(0.6, 0.82, fbm(sp * vec2(4.0, 8.0) + 3.1));
      col *= mix(1.0, (0.92 + 0.12 * fibre) * (1.0 - 0.1 * fox), uSerene * 0.9 + uDawn * 0.12);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}


// ------------------------------------------------------------------ water

const waterShader = {
  name: 'PondWater',
  uniforms: {
    color: { value: new THREE.Color(0x000000) },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uActTime: { value: 0 },
    uImpact: { value: IMPACT },
    uImpact2: { value: 99 },
    uStrength: { value: 0 },
    uChaos: { value: 0 },
    uPresence: { value: 0 },
    uHorizon: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0.3, 0.1, -1).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uDeep: { value: new THREE.Color(0.05, 0.07, 0.04) },
    uFish: { value: new Float32Array(WAKES * 4) },
    uCursor: { value: new THREE.Vector3(99, 99, 0) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime, uActTime, uImpact, uImpact2, uStrength, uChaos, uPresence;
    uniform vec3 uHorizon, uSun, uSunColor, uDeep;
    uniform vec4 uFish[${WAKES}];
    uniform vec3 uCursor;
    varying vec4 vUv;
    varying vec3 vWorld;
    ${NOISE}

    // Rings from an impact: a travelling wave packet that spreads and calms.
    float rings(vec2 p, float since, float amp) {
      if (since <= 0.0) return 0.0;
      float r = length(p);
      float front = since * 1.05;
      float packet = exp(-pow((r - front) / (0.4 + since * 0.28), 2.0));
      float wave = sin((r - front) * 22.0 - since * 3.0);
      return amp * wave * packet * exp(-since * 0.55) / (1.0 + r * 1.1);
    }
    // A restless mind: the whole pond choppy, swirling round its middle.
    float churn(vec2 p) {
      float r = length(p);
      float a = uTime * 0.6 / (0.6 + r * 0.5);
      vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
      return noise(q * 2.4 + uTime * 0.9) * 0.55 + noise(q * 5.5 - uTime * 1.6) * 0.3 + noise(q * 12.0 + uTime * 2.4) * 0.15;
    }
    // Every koi near the surface trails a little ring of ripples; the cursor too.
    float wakes(vec2 p) {
      float h = 0.0;
      for (int i = 0; i < ${WAKES}; i++) {
        vec4 f = uFish[i];
        float d = length(p - f.xy);
        h += f.z * 0.02 * sin(d * 26.0 - uTime * 9.0 + float(i)) * exp(-d * 6.0);
      }
      float dc = length(p - uCursor.xy);
      h += uCursor.z * 0.05 * sin(dc * 22.0 - uTime * 8.0) * exp(-dc * 3.5);
      return h;
    }
    float height(vec2 p) {
      return rings(p, uActTime - uImpact, 1.0) + rings(p, uActTime - uImpact2, 0.35) + churn(p) * uChaos * 0.32 + wakes(p);
    }

    void main() {
      vec2 p = vWorld.xz;
      float e = 0.01;
      float h = height(p);
      vec2 grad = vec2(height(p + vec2(e, 0.0)) - h, height(p + vec2(0.0, e)) - h) / e;
      // Fine wind-ruffle, always, so the surface never looks like glass.
      grad += (vec2(noise(p * 3.0 + uTime * 0.2), noise(p * 3.0 - uTime * 0.17)) - 0.5) * 0.05;
      grad += (vec2(noise(p * 11.0 + uTime * 0.7), noise(p * 11.0 - uTime * 0.6)) - 0.5) * (0.04 + 0.08 * uChaos);

      // Water is never steep: the slopes bend the reflection, but gently.
      vec2 slope = grad / (1.0 + length(grad) * 0.12);
      vec4 uv = vUv;
      uv.xy += slope * 0.012 * uv.w * (0.5 + uStrength + uChaos * 1.4);
      // Water gives back a little less than the sky it mirrors.
      vec3 reflected = texture2DProj(tDiffuse, uv).rgb * 0.8;

      vec3 view = normalize(cameraPosition - vWorld);
      vec3 N = normalize(vec3(-slope.x * 0.1, 1.0, -slope.y * 0.1));
      float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(view, N), 0.0), 5.0);

      // Looking down, you see into it: murky green, darker with depth and
      // when the mind is stirred. Glancing, it is a mirror.
      vec3 body = mix(color, uDeep, 0.5);
      // The surface catches the light by its slope, so ripples read even
      // looking straight down, where it reflects almost nothing.
      float lit = 0.8 + 0.45 * dot(N, normalize(vec3(uSun.x, 0.9, uSun.z)));
      vec3 col = mix(body * lit, reflected, fresnel);
      float clarity = (1.0 - fresnel) * (0.8 - 0.15 * uChaos);

      // The sun on the crests: a glitter path towards it.
      float glint = pow(max(dot(reflect(-uSun, N), view), 0.0), 220.0);
      float sparkle = step(0.82, noise(p * 40.0 + uTime * 3.0));
      float crest = smoothstep(0.15, 0.6, abs(h) * 8.0);
      float since = uActTime - uImpact;
      // (Kept modest: on calm water the sun's reflection is a wide patch, and
      // at full strength it blooms into a white blot.)
      col += uSunColor * glint * (0.12 + 0.6 * sparkle) * (0.4 + 0.6 * crest + 0.4 * exp(-max(since, 0.0) * 0.8));

      // Far off, the water meets the sky.
      float far = smoothstep(9.0, 24.0, length(p));
      col = mix(col, uHorizon, far);
      clarity *= 1.0 - far;
      gl_FragColor = vec4(mix(uHorizon, col, uPresence), 1.0 - clarity);
    }
  `,
}

// ------------------------------------------------------------------ the world

// Every world material has the same reveal logic: alpha comes up in the mirror
// first (uMirror is 1 while the water is rendering its reflection), then for real.
const revealUniforms = () => ({
  uMirror: { value: 0 },
  uRevealMirror: { value: 0 },
  uRevealDirect: { value: 0 },
  uTime: { value: 0 },
})

const worldVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const worldCommon = /* glsl */ `
uniform float uMirror;
uniform float uRevealMirror;
uniform float uRevealDirect;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
${NOISE}
float reveal() { return mix(uRevealDirect, uRevealMirror, uMirror); }
// Authored as display colour; the act is lit in linear light and encoded at the end.
vec3 linear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
// A cut-paper edge: the border of the sheet eaten into by noise.
float deckle(vec2 uv, float width) {
  vec2 d = min(uv, 1.0 - uv);
  float edge = min(d.x, d.y);
  float n = noise(uv * 60.0) * 0.6 + noise(uv * 13.0) * 0.4;
  return smoothstep(0.0, width, edge - n * width * 0.8);
}
`

// The painting, in late gold light, hazed a little into the parchment sky.
const paintingFragment = /* glsl */ `
uniform sampler2D tMap;
${worldCommon}
void main() {
  vec3 c = texture2D(tMap, vUv).rgb;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 col = mix(vec3(l), c, 0.72) * vec3(1.05, 0.95, 0.78);
  col = mix(col, vec3(0.95, 0.86, 0.68), 0.42);
  vec2 v = vUv - 0.5;
  col *= 1.0 - 0.35 * smoothstep(0.2, 0.7, length(v * vec2(1.0, 1.3)));
  float a = deckle(vUv, 0.025) * reveal();
  gl_FragColor = vec4(linear(col), a);
}
`

// Cut-out figures: lit warm from below by the water, rimmed in gold, floating.
const figureFragment = /* glsl */ `
uniform sampler2D tMap;
${worldCommon}
void main() {
  vec4 t = texture2D(tMap, vUv);
  vec3 col = t.rgb;
  float under = 1.0 - smoothstep(0.0, 0.7, vUv.y);
  col *= 0.95 + 0.25 * under * vec3(1.0, 0.8, 0.55);
  float rimSample = texture2D(tMap, vUv + vec2(0.006, -0.004)).a;
  col += vec3(1.0, 0.78, 0.4) * clamp(t.a - rimSample, 0.0, 1.0) * 0.8;
  gl_FragColor = vec4(linear(col), t.a * reveal());
}
`

const folioFragment = /* glsl */ `
uniform sampler2D tMap;
${worldCommon}
void main() {
  vec3 col = texture2D(tMap, vUv).rgb * 0.95;
  float a = deckle(vUv, 0.03) * reveal();
  gl_FragColor = vec4(linear(col), a);
}
`

// The Sri Yantra, in bronze-gold hairlines: nine interlocking triangles (four
// up, five down), two lotus rings and the gated square around them. It stands
// behind the name like an aureole.
const yantraFragment = /* glsl */ `
${worldCommon}
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float tri(vec2 p, float apexY, float baseY, float halfW) {
  vec2 a = vec2(0.0, apexY);
  vec2 b = vec2(-halfW, baseY);
  vec2 c = vec2(halfW, baseY);
  return min(min(seg(p, a, b), seg(p, b, c)), seg(p, c, a));
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float px = fwidth(p.x) * 1.2;
  float d = 1e3;
  d = min(d, tri(p, 0.62, -0.32, 0.56));
  d = min(d, tri(p, 0.42, -0.42, 0.5));
  d = min(d, tri(p, 0.3, -0.22, 0.32));
  d = min(d, tri(p, 0.16, -0.08, 0.16));
  d = min(d, tri(p, -0.62, 0.32, 0.56));
  d = min(d, tri(p, -0.5, 0.46, 0.46));
  d = min(d, tri(p, -0.38, 0.22, 0.38));
  d = min(d, tri(p, -0.24, 0.12, 0.24));
  d = min(d, tri(p, -0.12, 0.04, 0.1));
  float lines = 1.0 - smoothstep(0.0, px * 1.5, d - 0.002);
  float r = length(p);
  float ring = (1.0 - smoothstep(0.0, px * 1.5, abs(r - 0.68) - 0.002))
             + (1.0 - smoothstep(0.0, px * 1.5, abs(r - 0.72) - 0.002));
  float a8 = atan(p.y, p.x);
  float petals8 = 1.0 - smoothstep(0.0, px * 1.5, abs(r - (0.72 + 0.07 * abs(sin(a8 * 4.0)))) - 0.002);
  float petals16 = 1.0 - smoothstep(0.0, px * 1.5, abs(r - (0.8 + 0.05 * abs(sin(a8 * 8.0)))) - 0.002);
  vec2 q = abs(p);
  float sq = 1.0 - smoothstep(0.0, px * 1.5, abs(max(q.x, q.y) - 0.94) - 0.002);
  float gate = step(q.x, 0.14) * step(0.86, q.y) + step(q.y, 0.14) * step(0.86, q.x);
  sq *= 1.0 - gate;
  float ink = clamp(lines + ring * 0.7 + petals8 * 0.6 + petals16 * 0.5 + sq * 0.6, 0.0, 1.0);
  float breathe = 0.85 + 0.15 * sin(uTime * 0.8);
  vec3 bronze = vec3(0.62, 0.42, 0.18);
  gl_FragColor = vec4(linear(bronze), ink * 0.7 * breathe * reveal());
}
`

// The construction behind the blooming lotus, swept in like a compass arm.
const constructionFragment = /* glsl */ `
uniform sampler2D tMap;
uniform float uProgress;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tMap, vUv);
  vec2 p = vUv - 0.5;
  float a = fract(atan(p.y, p.x) / 6.2831853 + 0.25);
  float sweep = smoothstep(a, a + 0.035, uProgress * 1.04);
  float front = exp(-pow((a - uProgress) * 30.0, 2.0)) * step(uProgress, 0.999);
  gl_FragColor = vec4(t.rgb * t.a * (sweep + front * 1.5) * uAlpha * 1.3, 1.0);
}
`

// A soft round light (for glows carried by things).
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,240,210,1)')
  grad.addColorStop(0.25, 'rgba(255,200,130,0.45)')
  grad.addColorStop(1, 'rgba(255,160,80,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ------------------------------------------------------------------ the act

// The light over the act, keyframed: a sky that goes from before-dawn indigo
// through rose to gold as the sun comes up, the storm's bronze murk, and the
// paper-and-gold of the stillness after. `light` scales the lamps.
const SKY = [
  { t: 0, zenith: '#0d0c21', horizon: '#382848', glow: '#ff8f6a', glowK: 0.25, sunY: -0.1, light: 0.4 },
  { t: 5, zenith: '#211d45', horizon: '#9c5c68', glow: '#ffaa82', glowK: 0.5, sunY: -0.04, light: 0.62 },
  { t: 10, zenith: '#433f6e', horizon: '#e39a7a', glow: '#ffcc9c', glowK: 0.5, sunY: 0.03, light: 0.85 },
  { t: 16, zenith: '#7a6d8c', horizon: '#f2c294', glow: '#ffeccc', glowK: 0.45, sunY: 0.09, light: 1.0 },
  { t: 21, zenith: '#827590', horizon: '#f4c89a', glow: '#fff0d4', glowK: 0.45, sunY: 0.11, light: 1.0 },
  { t: 22.6, zenith: '#827590', horizon: '#f4c89a', glow: '#fff0d4', glowK: 0.45, sunY: 0.11, light: 1.0 },
  { t: 25.2, zenith: '#2e2724', horizon: '#6a5444', glow: '#ffb070', glowK: 0.15, sunY: 0.11, light: 0.55 },
  { t: IMPACT, zenith: '#2b2421', horizon: '#5e4a3a', glow: '#ffb070', glowK: 0.1, sunY: 0.11, light: 0.5 },
  { t: IMPACT + 2.5, zenith: '#c69a5e', horizon: '#f2dcb2', glow: '#fff2d8', glowK: 0.7, sunY: 0.1, light: 1.0 },
  { t: ACT_LENGTH, zenith: '#c69a5e', horizon: '#f2dcb2', glow: '#fff2d8', glowK: 0.7, sunY: 0.1, light: 1.0 },
].map((k) => ({ ...k, zenith: new THREE.Color(k.zenith), horizon: new THREE.Color(k.horizon), glow: new THREE.Color(k.glow).multiplyScalar(k.glowK) }))

// Far hills, cut from paper: a ridge line of noise, the near ones darker.
const hillFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRim;
uniform float uSeed;
uniform float uHeight;
varying vec2 vUv;
${NOISE}
void main() {
  float ridge = uHeight * (0.55 + 0.35 * fbm(vec2(vUv.x * 5.0 + uSeed, uSeed)) + 0.1 * noise(vec2(vUv.x * 40.0, uSeed)));
  float aa = fwidth(vUv.y) * 1.5;
  float a = 1.0 - smoothstep(ridge - aa, ridge + aa, vUv.y);
  if (a < 0.01) discard;
  float rim = smoothstep(ridge - 0.012, ridge, vUv.y);
  gl_FragColor = vec4(uColor + uRim * rim, a);
}
`

export function createAct(renderer: THREE.WebGLRenderer, { small }: { small: boolean }) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 140)
  scene.environment = warmEnvironment(renderer)
  // Only the drop refracts, and it is small on screen: a smaller buffer is plenty.
  renderer.transmissionResolutionScale = 0.6
  // Real shadows from the sun, soft-edged; and air between us and the hills.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  scene.fog = new THREE.FogExp2(0x000000, 0.026)
  const rng = mulberry32(5)
  const glow = glowTexture()

  // ---- sky
  const skyMaterial = new THREE.ShaderMaterial({ ...skyShader, uniforms: THREE.UniformsUtils.clone(skyShader.uniforms), side: THREE.BackSide, depthWrite: false })
  const S = skyMaterial.uniforms
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 64, 32), skyMaterial)
  sky.renderOrder = -10
  scene.add(sky)

  // ---- hills on the far shore
  const hills = [
    { z: -34, height: 0.42, seed: 1.3, depth: 0.32 },
    { z: -25, height: 0.36, seed: 7.1, depth: 0.52 },
    { z: -17, height: 0.27, seed: 3.7, depth: 0.7 },
  ].map((h) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 8),
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: hillFragment,
        uniforms: { uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uSeed: { value: h.seed }, uHeight: { value: h.height } },
        transparent: true,
      }),
    )
    m.position.set(0, 3, h.z)
    m.renderOrder = -9
    scene.add(m)
    return { mesh: m, depth: h.depth }
  })

  // ---- light
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a3a1e, 1)
  // The sun: low, behind and to the right, so the lotus is rimmed and its
  // petals glow through; it casts the shadows. A soft fill from our side.
  const key = new THREE.DirectionalLight(0xffe6c8, 1)
  key.castShadow = true
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048)
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 })
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.025
  key.shadow.radius = 4
  const back = new THREE.DirectionalLight(0xfff0e0, 1)
  back.position.set(-3, 4, 6)
  scene.add(hemi, key, key.target, back)

  // ---- the pond: lily pads, and lotuses opening across it at first light
  const padCount = small ? 34 : 52
  const pads = new THREE.InstancedMesh(padGeometry(), padMaterial(), padCount + COMPANIONS.length)
  pads.receiveShadow = true
  pads.castShadow = true
  // Where each pad rests, so it can bob and jostle on a restless pond.
  const padRest: { x: number; z: number; s: number; rot: number; phase: number }[] = []
  {
    const d = new THREE.Object3D()
    const c = new THREE.Color()
    let n = 0
    const place = (x: number, z: number, s: number) => {
      const rot = rng() * Math.PI * 2
      d.position.set(x, 0.012, z)
      d.rotation.set(0, rot, 0)
      d.scale.setScalar(s)
      d.updateMatrix()
      pads.setMatrixAt(n, d.matrix)
      pads.setColorAt(n, c.setRGB(0.82 + rng() * 0.18, 0.86 + rng() * 0.14, 0.78 + rng() * 0.18))
      padRest.push({ x, z, s, rot, phase: rng() * 6.28 })
      n++
    }
    for (const comp of COMPANIONS) place(comp.x, comp.z, comp.size * 2.2)
    while (n < padCount + COMPANIONS.length) {
      const a = rng() * Math.PI * 2
      const r = 1.9 + Math.pow(rng(), 0.7) * 8.5
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r * 0.9
      if (z > 7.5 || (Math.abs(x) < 0.9 && z > 2)) continue
      place(x, z, 0.22 + rng() * 0.4)
    }
    pads.instanceMatrix.needsUpdate = true
  }
  scene.add(pads)
  const companions = COMPANIONS.map((c, i) => {
    const l = createLotus({ count: small ? 14 : 18, size: c.size, spread: 1.6, duration: 1.9, seed: 20 + i, tint: c.pink ? new THREE.Color(1.0, 0.8, 0.88) : undefined })
    l.group.position.set(c.x, 0.02, c.z)
    l.group.rotation.y = rng() * 6.28
    l.group.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh))
    scene.add(l.group)
    return { ...c, lotus: l }
  })

  // Mist lying on the water before the sun, and fireflies over it.
  const mist = Array.from({ length: 12 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
    s.position.set((rng() - 0.5) * 18, 0.25 + rng() * 0.3, -rng() * 14 + 3)
    s.scale.set(6 + rng() * 5, 1.1 + rng() * 0.6, 1)
    s.userData.drift = 0.05 + rng() * 0.08
    scene.add(s)
    return s
  })
  const flyCount = small ? 50 : 90
  const flyPos = new Float32Array(flyCount * 3)
  const flySeed = new Float32Array(flyCount)
  for (let i = 0; i < flyCount; i++) {
    flyPos.set([(rng() - 0.5) * 14, 0.15 + rng() * 1.6, -rng() * 10 + 4], i * 3)
    flySeed[i] = rng()
  }
  const flyGeo = new THREE.BufferGeometry()
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3))
  flyGeo.setAttribute('aSeed', new THREE.BufferAttribute(flySeed, 1))
  const flyMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vSeed;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * (0.3 + aSeed * 0.4) + aSeed * 20.0) * 0.4;
        p.y += sin(uTime * (0.5 + aSeed * 0.5) + aSeed * 11.0) * 0.15;
        p.z += cos(uTime * (0.25 + aSeed * 0.3) + aSeed * 7.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + 2.5 * aSeed) * uPixelRatio * (5.0 / -mv.z);
        vSeed = aSeed;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      uniform float uTime;
      varying float vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = 1.0 - smoothstep(0.05, 0.5, d);
        float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.2 + vSeed * 2.0) + vSeed * 40.0), 3.0);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.45) * a * pulse * uAlpha, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  scene.add(new THREE.Points(flyGeo, flyMaterial))

  // ---- the great lotus
  const lotus = createLotus({ count: small ? 44 : 56, size: 1.15, spread: 6.6, duration: 2.8, seed: 3 })
  scene.add(lotus.group)
  const heartLight = new THREE.PointLight(0xffc27a, 0, 4, 1.6)
  heartLight.position.set(0, 0.25, 0)
  lotus.group.add(heartLight)

  // The light behind it, and the construction that sets its petals.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0 } },
      vertexShader: worldVertex,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          vec3 c = mix(vec3(1.0, 0.62, 0.42), vec3(1.0, 0.93, 0.82), exp(-r * r * 20.0));
          gl_FragColor = vec4(c * exp(-r * r * 3.5) * 0.18 * uAlpha, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.position.set(0, 1.0, -2.8)
  scene.add(halo)
  const construction = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 6.2),
    new THREE.ShaderMaterial({
      uniforms: { tMap: { value: constructionTexture(small ? 1536 : 2048) }, uProgress: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: worldVertex,
      fragmentShader: constructionFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  construction.position.set(0, 1.05, -2.0)
  scene.add(construction)
  const CU = (construction.material as THREE.ShaderMaterial).uniforms

  // ---- the drop: clear water, nothing in it but what it bends
  const dropMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0,
    transmission: 1,
    thickness: 0.35,
    ior: 1.333,
    dispersion: 0.15,
    attenuationColor: new THREE.Color(0.96, 0.99, 1.0),
    attenuationDistance: 4,
    // Drawn, the glass keeps only a little shine: strong glints ring in ink.
    specularIntensity: 0.3,
    envMapIntensity: 0.6,
  })
  const drop = new THREE.Mesh(new THREE.SphereGeometry(DROP_R, 64, 40), dropMaterial)
  drop.castShadow = true
  // The thought it carries: a small warm light at its heart.
  const dropCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, fog: false }))
  dropCore.scale.setScalar(DROP_R * 1.1)
  drop.add(dropCore)
  // A bright rim, so the drop holds its shape against the busy pond below.
  const dropRim = new THREE.Mesh(
    new THREE.SphereGeometry(DROP_R * 1.02, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * rim * 0.9 * uAlpha, 1.0);
        }
      `,
      uniforms: { uAlpha: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  drop.add(dropRim)
  scene.add(drop)

  // ---- the mind under the surface: koi, weeds, the floor
  const pond = createPond({ small })
  scene.add(pond.group)
  const raycaster = new THREE.Raycaster()
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const cursor = { x: 99, z: 99, strength: 0, on: false }
  const lastCursor = new THREE.Vector2(99, 99)

  // ---- the splash: a crown of droplets and the jet that rebounds
  const crownCount = 56
  const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 14, 10), dropMaterial, crownCount)
  crown.frustumCulled = false
  const crownSeeds = Array.from({ length: crownCount }, (_, i) => ({
    angle: (i / crownCount) * Math.PI * 2 + rng() * 0.08,
    speed: 0.6 + rng() * 0.7,
    lift: 1.4 + rng() * 1.2,
    size: 0.6 + rng() * 0.9,
  }))
  scene.add(crown)
  const jet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 32, 20), dropMaterial)
  scene.add(jet)

  // ---- the water
  const water = new Reflector(new THREE.CircleGeometry(60, 96), {
    color: 0x000000,
    textureWidth: small ? 512 : 1024,
    textureHeight: small ? 512 : 1024,
    clipBias: 0.003,
    shader: waterShader,
  })
  water.rotation.x = -Math.PI / 2
  scene.add(water)
  const waterMaterial = water.material as THREE.ShaderMaterial
  // See-through looking down, a mirror glancing: the koi show beneath.
  waterMaterial.transparent = true
  const W = waterMaterial.uniforms
  W.uPresence.value = 1
  W.uFish.value = pond.wakes

  // ---- the lotus that rises from the water, and the name above it
  const risen = createLotus({ count: small ? 34 : 42, size: 0.5, spread: 1.4, duration: 1.3, seed: 9 })
  scene.add(risen.group)
  const risenLight = new THREE.PointLight(0xffc27a, 0, 3, 1.6)
  risenLight.position.set(0, 0.2, 0)
  risen.group.add(risenLight)

  // ---- the world above the water
  const loader = new THREE.TextureLoader()
  const texture = (url: string) => {
    const t = loader.load(url)
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = 4
    return t
  }
  const worldMaterials: THREE.ShaderMaterial[] = []
  const worldMaterial = (fragmentShader: string, map?: THREE.Texture) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: worldVertex,
      fragmentShader,
      uniforms: { ...revealUniforms(), tMap: { value: map ?? null } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    worldMaterials.push(m)
    return m
  }
  const world = new THREE.Group()
  scene.add(world)

  const painting = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 8.8), worldMaterial(paintingFragment, texture('/art/yamuna.jpg')))
  painting.position.set(0.6, 4.3, -13)
  painting.renderOrder = -2
  world.add(painting)

  const yantra = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), worldMaterial(yantraFragment))
  yantra.position.set(0, 1.55, -4.2)
  yantra.renderOrder = -1
  world.add(yantra)

  const gandharva = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 3.5), worldMaterial(figureFragment, texture('/art/gandharva.png')))
  world.add(gandharva)

  const attendant = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 2.3), worldMaterial(figureFragment, texture('/art/attendant.png')))
  world.add(attendant)

  const folio = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.99), worldMaterial(folioFragment, texture('/art/kalpasutra.jpg')))
  folio.rotation.set(-0.08, 0.42, -0.04)
  world.add(folio)

  // Gold dust in the low sun.
  const moteCount = small ? 140 : 300
  const motePos = new Float32Array(moteCount * 3)
  const moteSeed = new Float32Array(moteCount)
  for (let i = 0; i < moteCount; i++) {
    motePos.set([(rng() - 0.5) * 12, rng() * 5, -rng() * 8 + 2], i * 3)
    moteSeed[i] = rng()
  }
  const moteGeo = new THREE.BufferGeometry()
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3))
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1))
  const motes = new THREE.Points(
    moteGeo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vSeed;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.04 + 0.08 * aSeed), 5.0);
          p.x += sin(uTime * 0.4 + aSeed * 40.0) * 0.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.5 + 2.5 * aSeed) * uPixelRatio * (4.0 / -mv.z);
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        uniform float uTime;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.1, 0.5, d);
          float flicker = 0.6 + 0.4 * sin(uTime * (1.5 + vSeed * 3.0) + vSeed * 30.0);
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * a * flicker * uAlpha * 0.7, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  world.add(motes)

  // In the reflection the drop and its splash wear a cheap stand-in: glass
  // inside a mirror would mean a second refraction pass for a few pixels.
  const mirrorDrop = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.85, 0.9, 0.95), roughness: 0.05, metalness: 0.2 })
  const glassy = [drop, crown, jet] as THREE.Mesh[]
  dropRim.layers.set(0)
  const mirrorRender = water.onBeforeRender
  water.onBeforeRender = function (...args: Parameters<typeof mirrorRender>) {
    worldMaterials.forEach((m) => (m.uniforms.uMirror.value = 1))
    glassy.forEach((m) => (m.material = mirrorDrop))
    mirrorRender.apply(this, args)
    glassy.forEach((m) => (m.material = dropMaterial))
    worldMaterials.forEach((m) => (m.uniforms.uMirror.value = 0))
  }

  // ---- the camera's path, as keyframes in act time (with the drop's shots
  // taking over between DROP_AT and the impact)
  type Shot = { t: number; pos: THREE.Vector3; look: THREE.Vector3 }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const TOP = V(0.2, 13.2, 0.75) // high over the pond, looking straight down
  const shots: Shot[] = [
    { t: 0, pos: V(0, 0.85, 10.5), look: V(0, 0.75, 0) },
    { t: 5, pos: V(0.2, 0.9, 9.4), look: V(0, 0.6, 0) },
    { t: 12, pos: V(0.55, 1.2, 6.4), look: V(0, 0.75, 0) },
    { t: 19.6, pos: V(0.75, 1.45, 4.8), look: V(0, 0.95, 0) },
    // Up over the flower, and down into its heart…
    { t: 21.7, pos: V(0.35, 2.9, 1.7), look: V(0, 0.35, 0) },
    { t: 23.3, pos: V(0.06, 4.3, 0.35), look: V(0, 0, 0) },
    // …and out, high above the whole pond.
    { t: 26.5, pos: TOP, look: V(0, 0, 0) },
    { t: DROP_AT, pos: TOP, look: V(0, 0, 0) },
    { t: IMPACT, pos: V(1.25, 0.42, 1.0), look: V(0, 0.02, 0) },
    { t: IMPACT + 2, pos: V(0.3, 0.8, 3.0), look: V(0, 0.1, -0.2) },
    { t: 34.2, pos: V(0, 0.48, 4.4), look: V(0, 0.75, -2) },
    { t: 36.6, pos: V(0, 0.5, 4.5), look: V(0, 0.76, -2) },
    { t: 41.0, pos: V(0, 0.95, 5.6), look: V(0, 1.15, -1.5) },
    { t: ACT_LENGTH, pos: V(0, 1.1, 6.1), look: V(0, 1.25, -1.2) },
  ]
  const camPos = new THREE.Vector3()
  const camLook = new THREE.Vector3()
  function shotAt(t: number) {
    let i = 0
    while (i < shots.length - 2 && t > shots[i + 1].t) i++
    const a = shots[i]
    const b = shots[i + 1]
    const k = smooth(a.t, b.t, t)
    camPos.lerpVectors(a.pos, b.pos, k)
    camLook.lerpVectors(a.look, b.look, k)
  }

  const state = { t: 0 }
  const pointer = new THREE.Vector2()
  let aspect = 1

  let viewW = 1
  let viewH = 1
  function setSize(w: number, h: number) {
    viewW = w
    viewH = h
    aspect = w / h
    camera.aspect = aspect
    // Keep things framed on narrow screens by widening the lens.
    camera.fov = aspect < 1 ? 58 : 38
    camera.updateProjectionMatrix()
  }

  const dummy = new THREE.Object3D()
  const tmp = new THREE.Vector3()
  const mood = { dawn: 1, storm: 0, serene: 0, light: 1 }
  const sun = new THREE.Vector3()
  const keyDir = new THREE.Vector3()
  const c1 = new THREE.Color()
  const c2 = new THREE.Color()
  const ndc = new THREE.Vector2()

  function skyAt(t: number) {
    let i = 0
    while (i < SKY.length - 2 && t > SKY[i + 1].t) i++
    const a = SKY[i]
    const b = SKY[i + 1]
    const k = smooth(a.t, b.t, t)
    S.uZenith.value.copy(a.zenith).lerp(b.zenith, k)
    S.uHorizon.value.copy(a.horizon).lerp(b.horizon, k)
    S.uGlow.value.copy(a.glow).lerp(b.glow, k)
    // Off to the right of the lotus, so the flower and its name are not lost in the glare.
    sun.set(0.32, a.sunY + (b.sunY - a.sunY) * k, -1).normalize()
    S.uSun.value.copy(sun)
    mood.light = a.light + (b.light - a.light) * k
  }

  // The drop: from high above, falling fast past the top shot, then — beside
  // it — slowing as it nears the water, the way slow motion would show it.
  function dropY(t: number) {
    if (t < SIDE_AT) return DROP_TOP - (DROP_TOP - 6) * Math.pow(clamp01((t - DROP_AT) / (SIDE_AT - DROP_AT)), 1.7)
    return 6 - (6 - DROP_R) * easeOutCubic((t - SIDE_AT) / (IMPACT - SIDE_AT))
  }

  // Everything below is a pure function of act time t (plus the clock for
  // things that are simply alive, and the cursor).
  function update(time: number, mouse: THREE.Vector2) {
    const t = state.t
    const portrait = aspect < 1

    // ---- light
    skyAt(t)
    mood.storm = smooth(22.6, 25.2, t) * (1 - smooth(IMPACT, IMPACT + 2.2, t))
    mood.serene = smooth(IMPACT, IMPACT + 2.5, t)
    mood.dawn = 1 - smooth(22.6, 25.2, t)
    const chaos = smooth(23.0, 25.6, t) * (1 - smooth(IMPACT, IMPACT + 1.6, t))
    S.uTime.value = time
    S.uDawn.value = mood.dawn
    S.uStorm.value = mood.storm
    S.uSerene.value = mood.serene
    W.uHorizon.value.copy(S.uHorizon.value)
    W.color.value.copy(S.uHorizon.value).multiplyScalar(0.16).lerp(c1.set('#4a3520'), mood.serene)
    W.uDeep.value.set('#4a6a48').lerp(c1.set('#2c4434'), chaos)
    ;(scene.fog as THREE.FogExp2).color.copy(S.uHorizon.value)
    ;(scene.fog as THREE.FogExp2).density = 0.022 + 0.012 * mood.storm
    hemi.color.copy(S.uHorizon.value).lerp(c1.set(0xfff1dc), 0.5)
    hemi.intensity = 0.9 * mood.light
    // The sun's light comes from its place in the sky, lifted a little so
    // the shadows it casts are long but not endless.
    keyDir.copy(sun)
    keyDir.y = Math.max(keyDir.y, 0.32)
    keyDir.normalize()
    key.position.copy(keyDir).multiplyScalar(14)
    key.color.copy(S.uGlow.value).lerp(c1.set(0xffe6c8), 0.55)
    key.intensity = 2.0 * mood.light
    back.intensity = 0.55 * mood.light
    scene.environmentIntensity = 0.6 * mood.light
    W.uSun.value.copy(sun)
    W.uSunColor.value.copy(key.color).multiplyScalar(mood.light)
    petalLight.uSunView.value.copy(keyDir).transformDirection(camera.matrixWorldInverse)
    hills.forEach(({ mesh, depth }) => {
      const u = (mesh.material as THREE.ShaderMaterial).uniforms
      c2.copy(S.uZenith.value).multiplyScalar(0.35)
      u.uColor.value.copy(S.uHorizon.value).lerp(c2, depth)
      u.uRim.value.copy(S.uGlow.value).multiplyScalar(0.35 * (1 - depth * 0.6))
    })

    // ---- the pond at first light, and jostling when the mind is restless
    companions.forEach((c, i) => {
      c.lotus.update(t - c.at, 0, time)
      c.lotus.group.position.y = 0.02 + Math.sin(time * 1.4 + i) * 0.012 * (0.3 + chaos * 2)
      c.lotus.group.rotation.z = Math.sin(time * 1.1 + i * 2) * 0.05 * chaos
    })
    padRest.forEach((r, i) => {
      dummy.position.set(r.x, 0.012 + Math.sin(time * 1.3 + r.phase) * 0.006 * (0.4 + chaos * 2.5), r.z)
      dummy.rotation.set(Math.sin(time * 1.7 + r.phase) * 0.04 * chaos, r.rot + Math.sin(time * 0.4 + r.phase) * 0.05 * (0.3 + chaos), Math.cos(time * 1.5 + r.phase) * 0.04 * chaos)
      dummy.scale.setScalar(r.s)
      dummy.updateMatrix()
      pads.setMatrixAt(i, dummy.matrix)
    })
    pads.instanceMatrix.needsUpdate = true
    const mistK = 1 - smooth(5, 15, t)
    mist.forEach((m, i) => {
      m.material.opacity = 0.1 * mistK
      m.material.color.copy(S.uHorizon.value)
      m.visible = mistK > 0.01
      m.position.x = ((i * 3.1 + time * (m.userData.drift as number) + 9) % 18) - 9
    })
    flyMaterial.uniforms.uTime.value = time
    flyMaterial.uniforms.uAlpha.value = 1 - smooth(4, 11, t)

    // ---- the great lotus: rises, opens, holds; then, as the mind crowds,
    // folds shut and sinks
    const rise = easeOutCubic((t - 5.2) / 2.2)
    const sink = smooth(24.6, 26.4, t)
    lotus.group.position.set(0, -0.6 + (LOTUS_Y + 0.6) * rise - 1.0 * sink, 0)
    lotus.group.rotation.y = 0.05 * t + 0.4 * smooth(23.4, 26.4, t)
    const fold = smooth(23.4, 25.4, t)
    lotus.update(t - BLOOM_AT, fold, time)
    lotus.group.visible = t > 5.1 && sink < 0.999
    // Dimmed as the camera comes over the flower, or its heart burns out the frame.
    heartLight.intensity = 0.6 * (0.9 + 0.9 * smooth(14.6, 15.6, t)) * (1 - fold) * (1 - 0.85 * smooth(19.8, 22.0, t))
    ;(halo.material as THREE.ShaderMaterial).uniforms.uAlpha.value = smooth(6, 10, t) * (1 - smooth(19.8, 21.2, t))
    halo.lookAt(camera.position)
    CU.uProgress.value = smooth(8.0, 16.0, t)
    CU.uAlpha.value = smooth(7.5, 9.0, t) * (1 - smooth(19.7, 21.0, t))
    construction.lookAt(camera.position)

    // ---- the drop
    const born = smooth(DROP_AT - 0.05, DROP_AT + 0.15, t)
    drop.visible = born > 0.001 && t < IMPACT + 0.02
    const y = dropY(t)
    // On the line from the overhead camera to where it will land, so from
    // above it falls straight away from us down the middle of the frame.
    drop.position.set((TOP.x * y) / TOP.y, y, (TOP.z * y) / TOP.y)
    const fast = t < SIDE_AT ? clamp01((t - DROP_AT) / (SIDE_AT - DROP_AT)) : 1 - clamp01((t - SIDE_AT) / (IMPACT - SIDE_AT))
    const stretch = 1 + 0.3 * fast * fast
    drop.scale.set(born / Math.sqrt(stretch), born * stretch, born / Math.sqrt(stretch))

    // ---- the splash, in slow motion
    const since = t - IMPACT
    const slow = Math.max(since, 0) * 0.55
    crown.visible = since > 0 && since < 2.2
    if (crown.visible) {
      crownSeeds.forEach((c, i) => {
        const r = 0.18 + c.speed * slow
        const cy = c.lift * slow - 2.2 * slow * slow
        dummy.position.set(Math.cos(c.angle) * r, Math.max(cy, -0.05), Math.sin(c.angle) * r)
        dummy.rotation.set(0, 0, 0)
        const life = 1 - smooth(0.75, 1.05, slow)
        dummy.scale.setScalar(c.size * life * (cy < 0 ? 0 : 1))
        dummy.updateMatrix()
        crown.setMatrixAt(i, dummy.matrix)
      })
      crown.instanceMatrix.needsUpdate = true
    }
    const jetT = Math.max(since - 0.14, 0) * 0.55
    const jetY = 1.9 * jetT - 3.4 * jetT * jetT
    jet.visible = since > 0.14 && jetY > 0
    jet.position.set(0, jetY, 0)
    jet.scale.set(1, 1 + 2.5 * Math.max(0.5 - jetT, 0), 1)

    // ---- the cursor on the water: where it is, and how much it is moving
    ndc.set((mouse.x * 2) / aspect, mouse.y * 2)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.ray.intersectPlane(waterPlane, tmp)
    if (hit && t > 19.6) {
      const moved = Math.hypot(hit.x - lastCursor.x, hit.z - lastCursor.y)
      lastCursor.set(hit.x, hit.z)
      cursor.x = hit.x
      cursor.z = hit.z
      cursor.strength = Math.min(1, cursor.strength * 0.94 + moved * 2.5)
      cursor.on = true
    } else {
      cursor.strength *= 0.94
      cursor.on = false
    }
    W.uCursor.value.set(cursor.x, cursor.z, cursor.strength)

    // ---- the mind beneath: koi, weeds; and the water they stir
    pond.update(time, chaos, smooth(IMPACT, IMPACT + 3, t), cursor, since, smooth(22.8, 25.4, t) * (1 - smooth(IMPACT, IMPACT + 2, t)))
    W.uTime.value = time
    W.uActTime.value = t
    W.uImpact.value = IMPACT
    W.uImpact2.value = RISE_AT + 0.15
    W.uStrength.value = since > 0 ? Math.exp(-since * 0.7) : 0
    W.uChaos.value = chaos

    // ---- the world: in the mirror first, then for real
    const mirror = smooth(33.0, 34.4, t)
    const direct = smooth(34.2, 35.8, t)
    for (const m of worldMaterials) {
      m.uniforms.uRevealMirror.value = mirror
      m.uniforms.uRevealDirect.value = direct
      m.uniforms.uTime.value = time
    }
    ;(motes.material as THREE.ShaderMaterial).uniforms.uAlpha.value = Math.max(mirror * 0.6, direct)
    ;(motes.material as THREE.ShaderMaterial).uniforms.uTime.value = time
    world.visible = mirror > 0.001
    // The celestials float either side of the name, reaching in towards it.
    const spreadX = portrait ? 0.62 : 1
    const liftUp = portrait ? 0.9 : 0
    gandharva.position.set(-2.7 * spreadX, 2.25 + liftUp + Math.sin(time * 0.6) * 0.06, -2.6)
    gandharva.rotation.set(0, 0.35, -0.16 + Math.sin(time * 0.4) * 0.02)
    attendant.position.set(2.9 * spreadX, 2.45 + liftUp + Math.sin(time * 0.55 + 1.3) * 0.07, -2.4)
    attendant.rotation.set(0, -0.35, 0.32 + Math.sin(time * 0.45 + 0.7) * 0.02)
    folio.position.set(-3.0 * spreadX, 0.42 + Math.sin(time * 0.5 + 2.0) * 0.03, -0.9)

    // ---- the lotus rising where the drop fell, and the name out of it
    const riseB = easeOutCubic((t - RISE_AT) / 1.4)
    risen.group.visible = t > RISE_AT - 0.05
    risen.group.position.set(0, -0.42 + 0.44 * riseB + Math.sin(time * 0.7) * 0.008 * riseB, 0)
    risen.group.rotation.y = 0.4 + 0.05 * t
    risen.update(t - RISE_AT - 0.6, 0, time)
    risenLight.intensity = 0.6 * smooth(RISE_AT + 0.8, RISE_AT + 2.0, t)

    // ---- camera
    shotAt(t)
    if (t >= DROP_AT && t < SIDE_AT) {
      // From above: hold, the faintest drift down after it.
      camPos.copy(TOP).y -= 0.25 * smooth(DROP_AT, SIDE_AT, t)
      camLook.set(0, 0, 0)
    } else if (t >= SIDE_AT && t < IMPACT) {
      // Beside it, falling with it, easing down to the water.
      const k = clamp01((t - SIDE_AT) / (IMPACT - SIDE_AT))
      camPos.set(1.45 - 0.2 * k, y + 0.22, 1.1 - 0.1 * k)
      camLook.set(0, y - 0.18, 0)
    }
    pointer.lerp(mouse, 0.05)
    // Once arrived (and while the story waits), a little sway towards the cursor.
    const settled = smooth(ACT_LENGTH - 0.8, ACT_LENGTH, t)
    camPos.x += pointer.x * 0.4 * settled
    camPos.y += pointer.y * 0.2 * settled
    const riding = t >= SIDE_AT && t < IMPACT
    if (portrait && !riding && t < DROP_AT) camPos.z += 1.2 * (1 - smooth(19.6, 22.5, t))
    if (portrait && t >= IMPACT) camPos.z += 1.2 * smooth(IMPACT + 1, IMPACT + 3, t)
    camera.position.copy(camPos)
    camera.up.set(0, 1, 0)
    // Looking straight down needs a different up, or the view spins.
    if (Math.abs(camPos.x - camLook.x) < 0.5 && Math.abs(camPos.z - camLook.z) < 1.0 && camPos.y - camLook.y > 3) camera.up.set(0, 0, -1)
    camera.lookAt(camLook)
  }

  // How much speed the lens should feel (for the post pass's zoom blur).
  function speed() {
    const t = state.t
    return 0.18 * smooth(DROP_AT + 0.4, DROP_AT + 1.0, t) * (1 - smooth(SIDE_AT - 0.2, SIDE_AT, t)) + 0.4 * smooth(SIDE_AT, SIDE_AT + 0.4, t) * (1 - smooth(IMPACT - 1.2, IMPACT - 0.2, t))
  }

  // The sketch world (for the post pass). The act is drawn, then painted, as
  // the story goes:
  //   0 – 5     the world sketches itself in — pencil, ink, hatching — no colour
  //   7.6 – 19  colour seeps out from the lotus as it blooms
  //   19.6 – 23 over the flower, the whole page painted, warm
  //   23 – 30.4 despair: the palette drains to bruise and slate, the ink
  //             grows heavy, red stains seep in and fade (hard thoughts), and
  //             the drawing is struck to red and black now and then
  //   30.4      the drop lands — an eye opens in the water, and closes
  //   31 –      colour floods out from where it fell, lifted to gold: enlightened
  // Impact frames are single and at least 0.9 s apart (well under three
  // flashes a second), and skipped for anyone who asks for less motion.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const STRIKES = [23.4, 24.3, 25.2]
  const lotusHeart = new THREE.Vector3()
  const impactPoint = new THREE.Vector3(0, 0, 0)
  const projected = new THREE.Vector3()
  const sketchState: SketchState = {
    draw: 0,
    colour: 0,
    seed: new THREE.Vector3(),
    seed2: new THREE.Vector3(),
    despair: 0,
    enlight: 0,
    blood: 0,
    burst: 0,
    eye: 0,
    eyeAt: new THREE.Vector3(),
  }
  // A world point on screen, in uv (0 … 1, y up); z > 1 when behind the lens.
  function toUv(v: THREE.Vector3, out: THREE.Vector3) {
    projected.copy(v).project(camera)
    return out.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5, projected.z)
  }
  function sketch() {
    const t = state.t
    const s = sketchState
    s.draw = smooth(0.15, 5.2, t)
    s.despair = smooth(22.8, 25.2, t) * (1 - smooth(IMPACT + 0.4, IMPACT + 3, t))
    s.enlight = smooth(IMPACT + 1, IMPACT + 4.5, t)
    s.blood = smooth(23.3, 25.4, t) * (1 - smooth(IMPACT - 0.3, IMPACT + 0.9, t))
    s.colour = 0.22 * smooth(9, 18.5, t) + 0.78 * smooth(19.6, 22.6, t)
    s.colour = Math.max(s.colour, smooth(IMPACT + 1.2, IMPACT + 6, t))
    // From the lotus as it blooms.
    lotusHeart.set(0, lotus.group.position.y + 0.35, 0)
    toUv(lotusHeart, s.seed)
    const bloom = (0.07 + 0.45 * smooth(BLOOM_AT, 18.5, t)) * (1 - smooth(22.4, 24.4, t))
    s.seed.z = t > 5.4 && s.seed.z < 1 ? bloom : 0
    // From where the drop fell.
    toUv(impactPoint, s.seed2)
    const flood = 2.4 * Math.pow(smooth(IMPACT + 0.9, IMPACT + 5.5, t), 1.4)
    s.seed2.z = t > IMPACT && s.seed2.z < 1 ? flood : 0
    s.seed2.z = Math.max(s.seed2.z, 0)
    s.burst = 0
    if (!reduceMotion) {
      for (const at of STRIKES) if (t >= at && t < at + 0.09) s.burst = 1
      if (t >= IMPACT && t < IMPACT + 0.1) s.burst = 1
    }
    s.eye = clamp01((t - IMPACT - 0.3) / 2.4)
    if (s.eye >= 1) s.eye = 0
    toUv(impactPoint, s.eyeAt)
    s.eyeAt.z = aspect < 1 ? 0.13 : 0.2
    return s
  }

  // Where things are on screen (CSS pixels), for the drawn layer over the act.
  const anchorTmp = new THREE.Vector3()
  const anchorOut = new THREE.Vector3()
  type AnchorName = 'lotus' | 'risen' | 'koi' | 'fish' | 'weeds' | 'cursor' | 'impact' | 'chapter' | 'drop'
  function anchor(which: AnchorName, i = 0, out = { x: 0, y: 0, visible: false }) {
    const v = anchorTmp
    if (which === 'lotus') v.set(0, lotus.group.position.y + 0.35, 0)
    else if (which === 'risen') v.set(0, risen.group.position.y + 0.3, 0)
    else if (which === 'koi') pond.at.koi(i, v)
    else if (which === 'fish') pond.at.follower(i, v)
    else if (which === 'weeds') v.copy(pond.at.weeds[i % pond.at.weeds.length])
    else if (which === 'cursor') v.set(cursor.x, 0, cursor.z)
    else if (which === 'impact') v.set(0, 0, 0)
    else if (which === 'drop') v.copy(drop.position)
    else if (which === 'chapter') {
      const left = i < 3
      const k = left ? i : i - 3
      const angle = left ? Math.PI * (0.94 - k * 0.16) : Math.PI * (0.38 - k * 0.16)
      const ring = aspect < 1 ? 0.56 : 1
      v.set(Math.cos(angle) * 1.85 * ring, 0.95 + Math.sin(angle) * 0.62, -0.25)
    }
    toUv(v, anchorOut)
    out.x = anchorOut.x * viewW
    out.y = (1 - anchorOut.y) * viewH
    out.visible = anchorOut.z < 1 && anchorOut.x > -0.2 && anchorOut.x < 1.2 && anchorOut.y > -0.2 && anchorOut.y < 1.2
    return out
  }

  // Compile every material and draw each phase once, off screen, so nothing
  // stalls the first time it appears (the glass drop above all).
  function warm() {
    const target = new THREE.WebGLRenderTarget(64, 64)
    const previous = renderer.getRenderTarget()
    const keep = state.t
    renderer.setRenderTarget(target)
    for (const t of [3, 16, 22, 26, 27.2, 29.5, IMPACT + 0.4, 36, ACT_LENGTH]) {
      state.t = t
      update(t, pointer)
      renderer.render(scene, camera)
    }
    renderer.setRenderTarget(previous)
    target.dispose()
    state.t = keep
  }

  return { scene, camera, state, update, setSize, speed, sketch, anchor, cursorOn: () => cursor.on, warm }
}
