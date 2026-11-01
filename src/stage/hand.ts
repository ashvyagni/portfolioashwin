import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { loadHandRig, sampleSurface, skinPoints, type HandPose, type JointPose } from './handModel'
import { addAnatomy } from './handDetail'
import { bakeLighting } from './handLight'
import { FINGER_DELAY, HAND_MODEL, HAND_POSE, HAND_VIEW, RELAXED_POSE } from './handPose'

// The hand. A live rig: every dot is bound to the skeleton and skinned on the
// GPU, so the hand moves — it gathers out of dust as a relaxed hand, the
// fingers then find the sign (the middle lifting over the index), and it never
// quite stops breathing.
//
// Three layers share one skinning vertex shader:
//   dots      — the engraving: Poisson-spaced dots whose size carries the light
//   occluder  — an invisible surface that writes depth, so the far side never
//               shows through
//   painting  — the Renaissance hand under the veil: chiaroscuro flesh,
//               sanguine hatching in the shadows, craquelure like old panel

const HAND_HEIGHT = 2.5
const VISIBLE_HEIGHT = 2 * 6 * Math.tan(THREE.MathUtils.degToRad(17.5)) // camera at z = 6, fov 35
const KEY_LIGHT = new THREE.Vector3(-0.62, 0.48, 0.62).normalize()
const BONES = 25

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

function surfaceArea(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const index = geometry.index!
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  let area = 0
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i))
    b.fromBufferAttribute(pos, index.getX(i + 1))
    c.fromBufferAttribute(pos, index.getX(i + 2))
    area += b.sub(a).cross(c.sub(a)).length() * 0.5
  }
  return area
}

// Dart throwing over pre-sampled candidates: keep a candidate only if no kept
// point lies within `radius`. Candidates are already in random order.
function poissonFilter(positions: Float32Array, radius: number) {
  const count = positions.length / 3
  // A dense grid of cells one radius wide, each a linked list of kept
  // points (head per cell, next per point): array reads, not hashing.
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < count; i++) {
    x0 = Math.min(x0, positions[i * 3]); x1 = Math.max(x1, positions[i * 3])
    y0 = Math.min(y0, positions[i * 3 + 1]); y1 = Math.max(y1, positions[i * 3 + 1])
    z0 = Math.min(z0, positions[i * 3 + 2]); z1 = Math.max(z1, positions[i * 3 + 2])
  }
  const nx = Math.floor((x1 - x0) / radius) + 1
  const ny = Math.floor((y1 - y0) / radius) + 1
  const nz = Math.floor((z1 - z0) / radius) + 1
  const head = new Int32Array(nx * ny * nz).fill(-1)
  const next = new Int32Array(count).fill(-1)
  const kept: number[] = []
  const r2 = radius * radius
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    const gx = Math.floor((x - x0) / radius)
    const gy = Math.floor((y - y0) / radius)
    const gz = Math.floor((z - z0) / radius)
    let free = true
    search: for (let dz = Math.max(gz - 1, 0); dz <= Math.min(gz + 1, nz - 1); dz++) {
      for (let dy = Math.max(gy - 1, 0); dy <= Math.min(gy + 1, ny - 1); dy++) {
        for (let dx = Math.max(gx - 1, 0); dx <= Math.min(gx + 1, nx - 1); dx++) {
          for (let j = head[dx + nx * (dy + ny * dz)]; j >= 0; j = next[j]) {
            const ex = positions[j * 3] - x
            const ey = positions[j * 3 + 1] - y
            const ez = positions[j * 3 + 2] - z
            if (ex * ex + ey * ey + ez * ez < r2) {
              free = false
              break search
            }
          }
        }
      }
    }
    if (!free) continue
    kept.push(i)
    const c = gx + nx * (gy + ny * gz)
    next[i] = head[c]
    head[c] = i
  }
  return kept
}

// A loose sleeve: an open tube with soft folds and a ragged cuff, along +Y
// from the cuff (y = 0) to y = length.
function buildSleeve(radius: number, length: number) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 96, 48, true)
  geo.translate(0, length / 2, 0)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const h = v.y / length
    const th = Math.atan2(v.z, v.x)
    const folds =
      0.07 * Math.sin(5 * th + 14 * h) + 0.045 * Math.sin(9 * th - 19 * h + 1.3) + 0.03 * Math.sin(17 * th + 11 * h)
    const flare = 1 + 0.32 * h + 0.08 * (1 - Math.min(h * 8, 1))
    v.x *= flare * (1 + folds)
    v.z *= flare * (1 + folds)
    if (h < 0.02) v.y += radius * (0.12 * Math.sin(7 * th) + 0.07 * Math.sin(13 * th + 0.7) + 0.05 * Math.sin(23 * th))
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.deleteAttribute('uv')
  geo.deleteAttribute('normal')
  const merged = mergeVertices(geo, 1e-4)
  merged.computeVertexNormals()
  return merged
}

// --------------------------------------------------------------- shaders

const skinning = /* glsl */ `
uniform mat4 uBones[${BONES}];
uniform mat4 uToView;
attribute vec4 aSkinIndex;
attribute vec4 aSkinWeight;

mat4 skinMatrix() {
  return uBones[int(aSkinIndex.x)] * aSkinWeight.x
       + uBones[int(aSkinIndex.y)] * aSkinWeight.y
       + uBones[int(aSkinIndex.z)] * aSkinWeight.z
       + uBones[int(aSkinIndex.w)] * aSkinWeight.w;
}
`

const dotsVertex = /* glsl */ `
${skinning}
attribute vec3 aNormal;
attribute vec3 aStart;
attribute float aRand;
attribute float aHeight;
attribute vec4 aDetail;   // nail, knuckle, crease, sleeve
attribute vec2 aLight;    // baked ambient occlusion, key-light shadow

uniform float uTime;
uniform float uAssemble;
uniform float uCollapse;
uniform float uSize;
uniform float uPixelRatio;
uniform float uAlpha;
uniform float uEmber;
uniform float uFocus;
uniform float uDebug;
uniform float uAura;

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

vec3 swirl(float r) {
  return vec3(sin(r * 31.0), cos(r * 17.0) * 0.5, sin(r * 23.0 + 1.3));
}

void main() {
  float nail = aDetail.x;
  float knuckle = aDetail.y;
  float crease = aDetail.z;
  float sleeve = aDetail.w;

  // Skin the dot onto the moving hand (the sleeve is already in view space).
  mat4 sk = skinMatrix();
  vec3 target = sleeve > 0.5 ? position : (uToView * (sk * vec4(position, 1.0))).xyz;
  vec3 nrm = sleeve > 0.5 ? aNormal : normalize(mat3(uToView) * (mat3(sk) * aNormal));

  // Sleeve first, then the hand from the wrist up to the fingertips.
  float delay = clamp(aHeight, 0.0, 1.0) * 0.42 + aRand * 0.18;
  float t = clamp((uAssemble - delay) / 0.4, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - t, 4.0);
  vec3 pos = mix(aStart, target, e) + swirl(aRand) * sin(e * 3.14159) * 0.45;
  pos += 0.0025 * vec3(
    sin(uTime * 0.7 + aRand * 40.0),
    cos(uTime * 0.5 + aRand * 25.0),
    sin(uTime * 0.6 + aRand * 13.0)
  ) * (1.0 + sleeve * 3.0);

  vec4 world = modelMatrix * vec4(pos, 1.0);
  float c = clamp((uCollapse - aRand * 0.3) / 0.7, 0.0, 1.0);
  c = c * c;
  float ang = c * (3.0 + aRand * 4.0);
  world.xy = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * world.xy * (1.0 - c);
  world.z *= 1.0 - c;

  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;

  vec3 N = normalize(normalMatrix * nrm);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 key = normalize(vec3(-0.62, 0.48, 0.62));
  vec3 fill = normalize(vec3(0.6, -0.25, 0.5));
  vec3 back = normalize(vec3(0.75, 0.35, -0.55));
  float diffuse = max(dot(N, key), 0.0);
  float wrap = max(dot(N, key) * 0.5 + 0.5, 0.0);
  float facing = dot(N, V);
  float rim = pow(1.0 - max(facing, 0.0), 3.0);
  float backRim = rim * clamp(dot(N, back) + 0.4, 0.0, 1.0);
  float spec = pow(max(dot(reflect(-key, N), V), 0.0), 24.0);

  vec3 eyeL = normalize(vec3(-0.85, 0.35, 0.4));
  vec3 eyeR = normalize(vec3(0.85, 0.35, 0.4));
  float ember = (max(dot(N, eyeL), 0.0) + max(dot(N, eyeR), 0.0)) * (0.25 + rim) * uEmber;

  float ao = aLight.x;
  float lit = aLight.y;
  float skin = pow(diffuse, 1.4) * lit * 0.95 + (wrap * 0.06 + max(dot(N, fill), 0.0) * 0.08) * ao
             + backRim * 0.7 * mix(0.4, 1.0, ao);
  skin += (knuckle * 0.16 * wrap + nail * (0.08 + spec * 0.8) + spec * 0.15) * lit;
  skin *= mix(0.55, 1.0, ao);
  float cloth = (0.05 + diffuse * 0.16 * lit) * ao + backRim * 0.8;
  float tone = clamp(mix(skin, cloth, sleeve) + ember * 0.5, 0.0, 1.2);

  vec3 bone = vec3(0.95, 0.91, 0.84);
  vec3 emberCol = vec3(1.0, 0.46, 0.17);
  float emberMix = clamp(ember * mix(0.9, 1.4, sleeve), 0.0, 1.0);
  vec3 col = mix(bone, emberCol, emberMix) * (0.32 + 0.78 * tone);
  col = mix(col, emberCol * (0.5 + tone), step(0.992, aRand) * (1.0 - sleeve));
  // The violet aura, clinging to the edges of the fingers.
  float tips = smoothstep(0.45, 1.0, aHeight);
  col += vec3(0.56, 0.22, 1.0) * (rim * 1.4 + 0.15) * (0.35 + 0.65 * tips) * uAura * (1.0 - sleeve);
  if (uDebug > 0.5) col = vec3(0.3) + vec3(nail, knuckle, crease) * 0.9;
  vColor = col;

  float blur = clamp(abs(-mv.z - uFocus) * 1.1, 0.0, 1.0);
  float cuffFade = smoothstep(-1.05, -0.3, aHeight);
  float frontFacing = smoothstep(-0.15, 0.15, facing);
  vSoft = blur;
  vAlpha = uAlpha * e * (1.0 - c) * mix(1.0, 0.5, blur) * cuffFade * frontFacing;

  // Halftone: the dot's size is the tone. Creases close the dots down to a gap.
  float halftone = mix(0.16, 1.0, pow(tone, 0.6)) * (1.0 - 0.85 * crease);
  if (uDebug > 0.5) halftone = 1.0;
  float persp = 6.0 / -mv.z;
  gl_PointSize = max(uSize * halftone * uPixelRatio * persp * (1.0 + blur * 1.4), 0.0);
}
`

const dotsFragment = /* glsl */ `
precision highp float;
uniform sampler2D tVeil;
uniform vec2 uRes;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  // Where the veil is burnt through, the painting shows instead.
  if (texture2D(tVeil, gl_FragCoord.xy / uRes).r > 0.04) discard;
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(mix(0.3, 0.1, vSoft), 0.5, d);
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`

const surfaceVertex = /* glsl */ `
${skinning}
attribute vec4 aDetail;
attribute vec2 aLight;
uniform float uShrink;

varying vec3 vNormal;
varying vec3 vBind;
varying vec4 vDetail;
varying vec2 vLight;

void main() {
  mat4 sk = skinMatrix();
  vec3 n = normalize(mat3(uToView) * (mat3(sk) * normal));
  vec3 p = (uToView * (sk * vec4(position, 1.0))).xyz - n * uShrink;
  vNormal = normalize(normalMatrix * n);
  vBind = position;
  vDetail = aDetail;
  vLight = aLight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const paintingFragment = /* glsl */ `
precision highp float;
uniform sampler2D tVeil;
uniform vec2 uRes;
uniform float uEmber;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vBind;
varying vec4 vDetail;
varying vec2 vLight;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.103, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Distance to the nearest crack of a cellular pattern: craquelure.
float cracks(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + hash33(i + o) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}

void main() {
  float reveal = texture2D(tVeil, gl_FragCoord.xy / uRes).r;
  if (reveal <= 0.04) discard;

  vec3 N = normalize(vNormal);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 key = normalize(vec3(-0.62, 0.48, 0.62));
  vec3 back = normalize(vec3(0.75, 0.35, -0.55));
  float ao = vLight.x;
  float lit = vLight.y;
  float diffuse = max(dot(N, key), 0.0) * lit;
  float wrap = max(dot(N, key) * 0.5 + 0.5, 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * clamp(dot(N, back) + 0.4, 0.0, 1.0);

  // Chiaroscuro: one value, mapped through an old master's flesh palette.
  float value = clamp(pow(diffuse, 0.85) * 1.08 + wrap * 0.1 * ao + rim * 0.3, 0.0, 1.0) * mix(0.55, 1.0, ao);
  vec3 umber = vec3(0.07, 0.035, 0.022);
  vec3 shadow = vec3(0.3, 0.14, 0.09);
  vec3 mid = vec3(0.74, 0.47, 0.34);
  vec3 light = vec3(0.96, 0.83, 0.68);
  vec3 col = mix(umber, shadow, smoothstep(0.0, 0.22, value));
  col = mix(col, mid, smoothstep(0.18, 0.45, value));
  col = mix(col, light, smoothstep(0.42, 0.85, value));
  col = mix(col, vec3(1.0, 0.95, 0.86), smoothstep(0.85, 1.0, value) * 0.6);
  // Warm blood at the terminator, cooler half-tones beside it.
  col += vec3(0.25, 0.04, 0.0) * (1.0 - smoothstep(0.0, 0.18, abs(value - 0.3)));
  col = mix(col, col * vec3(0.92, 0.96, 1.02), smoothstep(0.35, 0.5, value) * (1.0 - smoothstep(0.5, 0.7, value)));

  // Nails pale and glossy. (Fine creases live on the dots; on this coarser
  // surface they would smear into blotches, so the painting reads form from light.)
  col = mix(col, vec3(0.93, 0.78, 0.7) * (0.45 + 0.6 * value), smoothstep(0.4, 0.9, vDetail.x) * 0.7);
  col += vec3(1.0, 0.95, 0.88) * pow(max(dot(reflect(-key, N), V), 0.0), 30.0) * (0.12 + vDetail.x * 0.5) * lit;

  // Sanguine hatching laid into the shadows, crossed in the deepest ones.
  vec2 fc = gl_FragCoord.xy;
  float h1 = 1.0 - smoothstep(0.15, 0.32, abs(fract((fc.x + fc.y) / 5.0) - 0.5));
  float h2 = 1.0 - smoothstep(0.15, 0.32, abs(fract((fc.x - fc.y) / 6.0) - 0.5));
  float dark = 1.0 - smoothstep(0.15, 0.5, value);
  col = mix(col, vec3(0.42, 0.13, 0.06), h1 * dark * 0.5 + h2 * smoothstep(0.75, 1.0, dark) * 0.4);

  // Craquelure, and the warm yellow of old varnish over everything.
  float crack = cracks(vBind * 320.0);
  col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.025, crack)) * smoothstep(0.2, 0.6, value);
  col = mix(col, col * vec3(1.05, 0.98, 0.82), 0.6);

  // Ember from the eyes catching the edges, as on the dots.
  col += vec3(1.0, 0.45, 0.15) * rim * uEmber * 0.6;

  gl_FragColor = vec4(col, 1.0);
}
`

// The hand as an anime key frame: three hard cel tones of warm skin under a
// front light, crease and knuckle ink, a hard white highlight, and the orange
// rim of the fire behind it. An inverted hull draws the ink outline.
const celFragment = /* glsl */ `
precision highp float;
uniform float uAlpha;
uniform float uEmber;

varying vec3 vNormal;
varying vec3 vBind;
varying vec4 vDetail;
varying vec2 vLight;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 key = normalize(vec3(-0.62, 0.48, 0.62));
  vec3 back = normalize(vec3(0.75, 0.25, -0.6));
  float ao = vLight.x;
  float lit = vLight.y;
  // Baked shadow and occlusion only nudge the tone: at full weight their
  // per-vertex noise breaks the cel bands into blotches.
  float value = dot(N, key) * mix(0.62, 1.0, smoothstep(0.2, 0.7, lit)) - (1.0 - ao) * 0.18;
  float aa = fwidth(value) * 0.75 + 0.002;

  vec3 deep = vec3(0.24, 0.08, 0.05);
  vec3 shade = vec3(0.6, 0.27, 0.17);
  vec3 mid = vec3(0.86, 0.5, 0.36);
  vec3 light = vec3(0.97, 0.76, 0.6);
  vec3 col = deep;
  col = mix(col, shade, smoothstep(-0.3 - aa, -0.3 + aa, value));
  col = mix(col, mid, smoothstep(0.1 - aa, 0.1 + aa, value));
  col = mix(col, light, smoothstep(0.5 - aa, 0.5 + aa, value));

  // Nails a shade paler; a hard highlight where the light glances off.
  col = mix(col, col * vec3(1.05, 0.98, 0.98) + 0.06, smoothstep(0.5, 0.8, vDetail.x));
  float spec = pow(max(dot(reflect(-key, N), V), 0.0), 36.0) * lit;
  col = mix(col, vec3(1.0, 0.97, 0.92), smoothstep(0.55, 0.6, spec) * 0.85);

  // Ink in the creases and over the knuckles.
  float crease = smoothstep(0.5, 0.72, vDetail.z);
  float knuckle = smoothstep(0.55, 0.8, vDetail.y) * smoothstep(0.0, 0.2, -value + 0.3);
  col = mix(col, vec3(0.16, 0.05, 0.03), max(crease * 0.9, knuckle * 0.6));

  // The fire behind: a hard orange rim on the far edges.
  float fres = 1.0 - max(dot(N, V), 0.0);
  float rim = smoothstep(0.52, 0.58, fres) * smoothstep(-0.25, 0.25, dot(N, back) + 0.2);
  col = mix(col, vec3(1.0, 0.55, 0.22) * 1.15, rim * uEmber);
  col += vec3(1.0, 0.35, 0.1) * pow(fres, 3.0) * 0.12 * uEmber;

  gl_FragColor = vec4(col * uAlpha, 1.0);
}
`

const inkFragment = /* glsl */ `
uniform float uAlpha;
void main() { gl_FragColor = vec4(vec3(0.015, 0.006, 0.004) * uAlpha, 1.0); }
`

const sleeveVertex = /* glsl */ `
uniform float uGrow;
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uGrow, 1.0);
}
`

// The sleeve: near-black cloth, its folds catching a hard red rim.
const sleeveFragment = /* glsl */ `
precision highp float;
uniform float uAlpha;
uniform float uEmber;
varying vec3 vNormal;
void main() {
  vec3 N = normalize(vNormal);
  vec3 key = normalize(vec3(-0.62, 0.48, 0.62));
  float v = dot(N, key);
  float aa = fwidth(v) * 0.75 + 0.002;
  vec3 col = mix(vec3(0.03, 0.015, 0.018), vec3(0.13, 0.05, 0.05), smoothstep(0.25 - aa, 0.25 + aa, v));
  float fres = 1.0 - abs(N.z);
  float rim = smoothstep(0.6, 0.66, fres) * smoothstep(-0.2, 0.3, N.x);
  col = mix(col, vec3(0.95, 0.2, 0.08), rim * 0.85 * uEmber);
  gl_FragColor = vec4(col * uAlpha, 1.0);
}
`

// --------------------------------------------------------------- the hand

function fingerOf(joint: string) {
  return joint.split('-')[0]
}

export function createHand({ small }: { small: boolean }) {
  // Spacing between dots, in hand units before the on-screen scale.
  const spacing = small ? 0.016 : 0.0118

  const bones = Array.from({ length: BONES }, () => new THREE.Matrix4())
  const toView = new THREE.Matrix4()
  const shared = {
    uBones: { value: bones },
    uToView: { value: toView },
  }
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  blank.needsUpdate = true

  const uniforms = {
    ...shared,
    tVeil: { value: blank as THREE.Texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAssemble: { value: 0 },
    uCollapse: { value: 0 },
    uSize: { value: 2 },
    uPixelRatio: { value: 1 },
    uAlpha: { value: 0 },
    uEmber: { value: 0 },
    uFocus: { value: 6 },
    uDebug: { value: 0 },
    uAura: { value: 0 },
  }

  const geometry = new THREE.BufferGeometry()
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: dotsVertex,
      fragmentShader: dotsFragment,
      uniforms,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }),
  )
  points.frustumCulled = false
  points.renderOrder = 2
  points.visible = false

  const surface = new THREE.BufferGeometry()
  const occluder = new THREE.Mesh(
    surface,
    new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      uniforms: { ...shared, uShrink: { value: 0.012 } },
      colorWrite: false,
    }),
  )
  occluder.frustumCulled = false
  occluder.renderOrder = 1
  occluder.visible = false

  const painting = new THREE.Mesh(
    surface,
    new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: paintingFragment,
      uniforms: {
        ...shared,
        uShrink: { value: 0 },
        tVeil: uniforms.tVeil,
        uRes: uniforms.uRes,
        uEmber: uniforms.uEmber,
        uTime: uniforms.uTime,
      },
    }),
  )
  painting.frustumCulled = false
  painting.renderOrder = 2
  painting.visible = false
  // Under the cursor's veil the cel hand gives way to the painted one, drawn
  // over it on the same surface.
  const paintingMaterial = painting.material as THREE.ShaderMaterial
  paintingMaterial.polygonOffset = true
  paintingMaterial.polygonOffsetFactor = -1
  paintingMaterial.polygonOffsetUnits = -4

  const sleeveOccluder = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false }))
  sleeveOccluder.frustumCulled = false
  sleeveOccluder.renderOrder = 1
  sleeveOccluder.visible = false

  // The cel hand and its ink outline (an inverted hull: the back faces, pushed out).
  const celMesh = new THREE.Mesh(
    surface,
    new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: celFragment,
      uniforms: { ...shared, uShrink: { value: 0 }, uAlpha: uniforms.uAlpha, uEmber: uniforms.uEmber },
    }),
  )
  const outline = new THREE.Mesh(
    surface,
    new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: inkFragment,
      uniforms: { ...shared, uShrink: { value: -0.011 }, uAlpha: uniforms.uAlpha },
      side: THREE.BackSide,
    }),
  )
  const sleeveMesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      vertexShader: sleeveVertex,
      fragmentShader: sleeveFragment,
      uniforms: { uGrow: { value: 0 }, uAlpha: uniforms.uAlpha, uEmber: uniforms.uEmber },
      side: THREE.DoubleSide,
    }),
  )
  const sleeveOutline = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      vertexShader: sleeveVertex,
      fragmentShader: inkFragment,
      uniforms: { uGrow: { value: 0.016 }, uAlpha: uniforms.uAlpha },
      side: THREE.BackSide,
    }),
  )
  for (const m of [celMesh, outline, sleeveMesh, sleeveOutline]) {
    m.frustumCulled = false
    m.visible = false
  }

  const group = new THREE.Group()
  group.add(occluder, sleeveOccluder, painting, points, outline, celMesh, sleeveOutline, sleeveMesh)

  // What the timeline animates: how far into the sign the fingers are.
  // `frame` moves the hand for each shot: offset (in its layout's units),
  // scale, and a turn about the vertical.
  // `react` is how much it turns towards the cursor while the story waits.
  const state = { sign: 0, react: 0, frame: { x: 0, y: 0, scale: 1, yaw: 0 } }
  const pointer = new THREE.Vector2()
  const lean = new THREE.Vector2()
  const base = { y: -1.86, scale: 0.98 }
  let rig: Awaited<ReturnType<typeof loadHandRig>> | null = null
  const jointNames = [...new Set([...Object.keys(HAND_POSE), ...Object.keys(RELAXED_POSE)])]
  const phases = new Map(jointNames.map((n, i) => [n, i * 1.731]))

  // Relaxed → sign, finger by finger; the middle lifts over the index on its
  // way across; and a little life in every joint, always.
  function currentPose(time: number): HandPose {
    const out: HandPose = {}
    for (const name of jointNames) {
      const a = RELAXED_POSE[name] ?? {}
      const b = HAND_POSE[name] ?? {}
      const delay = FINGER_DELAY[fingerOf(name)] ?? 0
      const k = THREE.MathUtils.smootherstep((state.sign - delay) / (1 - delay), 0, 1)
      const lerp = (key: keyof JointPose) => (a[key] ?? 0) + ((b[key] ?? 0) - (a[key] ?? 0)) * k
      let curl = lerp('curl')
      const arc = Math.sin(Math.PI * k)
      if (name === 'middle-finger-phalanx-proximal') curl -= 0.42 * arc
      if (name === 'index-finger-phalanx-proximal') curl += 0.22 * arc
      const ph = phases.get(name) ?? 0
      curl += 0.028 * Math.sin(time * 0.9 + ph) + 0.012 * Math.sin(time * 2.3 + ph * 2.0)
      out[name] = { curl, spread: lerp('spread') + 0.01 * Math.sin(time * 0.7 + ph), twist: lerp('twist') }
    }
    return out
  }

  // The bake is heavy: it gives the page back between its stages, so the
  // gate never freezes while it runs.
  const pause = () => new Promise<void>((r) => setTimeout(r, 0))
  const ready = loadHandRig(HAND_MODEL).then(async (loaded) => {
    rig = loaded
    const rng = mulberry32(11)
    const signSkin = rig.pose(HAND_POSE).skin.map((m) => m.clone())
    const g = rig.geometry
    const gPos = g.attributes.position.array as Float32Array
    const gIdx = g.attributes.skinIndex.array
    const gW = g.attributes.skinWeight.array

    // The view: rotate the sign pose, stand its wrist on y = 0, scale to height.
    const rot = new THREE.Matrix4().makeRotationFromEuler(HAND_VIEW)
    const signSurface = skinPoints(gPos, gIdx, gW, signSkin)
    const box = new THREE.Box3()
    const v = new THREE.Vector3()
    for (let i = 0; i < signSurface.positions.length / 3; i++) box.expandByPoint(v.fromArray(signSurface.positions, i * 3).applyMatrix4(rot))
    const scale = HAND_HEIGHT / (box.max.y - box.min.y)
    const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
    toView.makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(offset)).multiply(rot)

    // Candidates on the bind-pose surface, with anatomy, then spaced evenly
    // where they will be seen: on the sign pose, in view space.
    const viewSurface = new THREE.BufferGeometry()
    viewSurface.setAttribute('position', new THREE.BufferAttribute(signSurface.positions.slice(), 3))
    viewSurface.setIndex(g.index)
    viewSurface.applyMatrix4(toView)
    const expected = (0.75 * surfaceArea(viewSurface)) / (spacing * spacing)
    await pause()
    const raw = sampleSurface(g, Math.round(expected * 3.2), rng)
    const detail = addAnatomy(raw.positions, raw.normals, rig.bindJoints)
    const signDots = skinPoints(detail.positions, raw.skinIndex, raw.skinWeight, signSkin, detail.normals)
    const viewPos = new Float32Array(signDots.positions.length)
    for (let i = 0; i < viewPos.length / 3; i++) v.fromArray(signDots.positions, i * 3).applyMatrix4(toView).toArray(viewPos, i * 3)
    await pause()
    const kept = poissonFilter(viewPos, spacing)

    const out = {
      bind: [] as number[],
      view: [] as number[],
      nor: [] as number[],
      viewNor: [] as number[],
      skinIndex: [] as number[],
      skinWeight: [] as number[],
      det: [] as number[],
    }
    const n = new THREE.Vector3()
    for (const i of kept) {
      out.bind.push(detail.positions[i * 3], detail.positions[i * 3 + 1], detail.positions[i * 3 + 2])
      out.view.push(viewPos[i * 3], viewPos[i * 3 + 1], viewPos[i * 3 + 2])
      out.nor.push(detail.normals[i * 3], detail.normals[i * 3 + 1], detail.normals[i * 3 + 2])
      n.fromArray(signDots.normals!, i * 3).transformDirection(rot)
      out.viewNor.push(n.x, n.y, n.z)
      for (let k = 0; k < 4; k++) {
        out.skinIndex.push(raw.skinIndex[i * 4 + k])
        out.skinWeight.push(raw.skinWeight[i * 4 + k])
      }
      out.det.push(detail.nail[i], detail.knuckle[i], detail.crease[i], 0)
    }

    await pause()
    // The sleeve, its cuff just past the wrist joint, falling away down the forearm.
    const signJoints = rig.pose(HAND_POSE).joints
    const wristM = signJoints.get('wrist')!
    const wrist = new THREE.Vector3().setFromMatrixPosition(wristM).applyMatrix4(toView)
    const forearm = new THREE.Vector3().setFromMatrixColumn(wristM, 2).transformDirection(rot)
    let wristRadius = 0
    let hits = 0
    for (let i = 0; i < out.view.length / 3; i++) {
      v.fromArray(out.view, i * 3).sub(wrist)
      if (Math.abs(v.dot(forearm)) > 0.06) continue
      wristRadius += v.projectOnPlane(forearm).length()
      hits++
    }
    wristRadius = hits ? wristRadius / hits : 0.3
    const sleeve = buildSleeve(wristRadius * 1.28, HAND_HEIGHT * 1.1)
    sleeve.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), forearm))
    const cuff = wrist.clone().addScaledVector(forearm, 0.12)
    sleeve.translate(cuff.x, cuff.y, cuff.z)
    sleeve.computeVertexNormals()
    sleeveMesh.geometry = sleeve
    sleeveOutline.geometry = sleeve
    const sleeveSpacing = spacing * 1.35
    const cloth = sampleSurface(sleeve, Math.round(((0.75 * surfaceArea(sleeve)) / sleeveSpacing ** 2) * 2.5), rng)
    const handCount = out.bind.length / 3
    for (const i of poissonFilter(cloth.positions, sleeveSpacing)) {
      for (const arr of [out.bind, out.view]) arr.push(cloth.positions[i * 3], cloth.positions[i * 3 + 1], cloth.positions[i * 3 + 2])
      for (const arr of [out.nor, out.viewNor]) arr.push(cloth.normals[i * 3], cloth.normals[i * 3 + 1], cloth.normals[i * 3 + 2])
      out.skinIndex.push(0, 0, 0, 0)
      out.skinWeight.push(1, 0, 0, 0)
      out.det.push(0, 0, 0, 1)
    }

    await pause()
    // Bake light on the sign pose: what each dot sees once the gesture is made.
    const count = out.bind.length / 3
    const view = new Float32Array(out.view)
    const voxels = new Float32Array(viewPos.length + cloth.positions.length)
    voxels.set(viewPos)
    voxels.set(cloth.positions, viewPos.length)
    const { ao, shadow } = bakeLighting(view, new Float32Array(out.viewNor), voxels, KEY_LIGHT)
    const light = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      light[i * 2] = ao[i]
      light[i * 2 + 1] = shadow[i]
    }

    await pause()
    const starts = new Float32Array(count * 3)
    const rands = new Float32Array(count)
    const heights = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const y = view[i * 3 + 1]
      heights[i] = y / HAND_HEIGHT
      starts[i * 3] = view[i * 3] + (rng() - 0.5) * 2.4
      starts[i * 3 + 1] = y - 2.6 - rng() * 2.2
      starts[i * 3 + 2] = view[i * 3 + 2] + (rng() - 0.5) * 2.4 - 0.6
      rands[i] = rng()
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.bind, 3))
    geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(out.nor, 3))
    geometry.setAttribute('aSkinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4))
    geometry.setAttribute('aSkinWeight', new THREE.Float32BufferAttribute(out.skinWeight, 4))
    geometry.setAttribute('aDetail', new THREE.Float32BufferAttribute(out.det, 4))
    geometry.setAttribute('aLight', new THREE.BufferAttribute(light, 2))
    geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3))
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 1))
    geometry.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1))

    await pause()
    // The continuous surface (occluder and painting): the same anatomy on its
    // vertices, lit on the sign pose too.
    const sPos = new Float32Array(gPos)
    const sNor = new Float32Array(g.attributes.normal.array as Float32Array)
    const sDetail = addAnatomy(sPos, sNor, rig.bindJoints)
    surface.setAttribute('position', new THREE.BufferAttribute(sDetail.positions, 3))
    surface.setIndex(g.index)
    surface.computeVertexNormals()
    surface.setAttribute('aSkinIndex', new THREE.Uint16BufferAttribute(Array.from(gIdx), 4))
    surface.setAttribute('aSkinWeight', new THREE.Float32BufferAttribute(Array.from(gW), 4))
    const sDet = new Float32Array(sDetail.nail.length * 4)
    for (let i = 0; i < sDetail.nail.length; i++) sDet.set([sDetail.nail[i], sDetail.knuckle[i], sDetail.crease[i], 0], i * 4)
    surface.setAttribute('aDetail', new THREE.BufferAttribute(sDet, 4))
    const sSign = skinPoints(sDetail.positions, gIdx, gW, signSkin, surface.attributes.normal.array as Float32Array)
    const sView = new Float32Array(sSign.positions.length)
    const sViewNor = new Float32Array(sSign.normals!.length)
    for (let i = 0; i < sView.length / 3; i++) {
      v.fromArray(sSign.positions, i * 3).applyMatrix4(toView).toArray(sView, i * 3)
      n.fromArray(sSign.normals!, i * 3).transformDirection(rot).toArray(sViewNor, i * 3)
    }
    await pause()
    const sLight = bakeLighting(sView, sViewNor, voxels, KEY_LIGHT)
    const sLit = new Float32Array((sView.length / 3) * 2)
    for (let i = 0; i < sLit.length / 2; i++) {
      sLit[i * 2] = sLight.ao[i]
      sLit[i * 2 + 1] = sLight.shadow[i]
    }
    // Relax the baked light across neighbouring vertices so the painting's
    // tones flow instead of mottling.
    const tri = g.index!.array
    for (let pass = 0; pass < 3; pass++) {
      const sum = new Float32Array(sLit.length)
      const hits = new Float32Array(sLit.length / 2)
      for (let t = 0; t < tri.length; t += 3) {
        for (let e = 0; e < 3; e++) {
          const a = tri[t + e]
          for (let f = 0; f < 3; f++) {
            const b = tri[t + f]
            sum[a * 2] += sLit[b * 2]
            sum[a * 2 + 1] += sLit[b * 2 + 1]
            hits[a]++
          }
        }
      }
      for (let i = 0; i < hits.length; i++) {
        if (!hits[i]) continue
        sLit[i * 2] = sum[i * 2] / hits[i]
        sLit[i * 2 + 1] = sum[i * 2 + 1] / hits[i]
      }
    }
    surface.setAttribute('aLight', new THREE.BufferAttribute(sLit, 2))

    const shrunkSleeve = sleeve.clone()
    const sp = shrunkSleeve.attributes.position as THREE.BufferAttribute
    const sn = shrunkSleeve.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < sp.count; i++) {
      sp.setXYZ(i, sp.getX(i) - sn.getX(i) * 0.02, sp.getY(i) - sn.getY(i) * 0.02, sp.getZ(i) - sn.getZ(i) * 0.02)
    }
    sleeveOccluder.geometry = shrunkSleeve

    return { points: count, hand: handCount }
  })

  function setLayout(aspect: number, pixelRatio: number, viewportHeight: number, buffer: THREE.Vector2) {
    uniforms.uPixelRatio.value = pixelRatio
    uniforms.uRes.value.copy(buffer)
    const portrait = aspect < 1
    const s = portrait ? 0.68 : 0.98
    base.scale = s
    base.y = portrait ? -1.4 : -1.86
    // A full-tone dot just fills its share of the spacing on screen.
    uniforms.uSize.value = spacing * s * (viewportHeight / VISIBLE_HEIGHT) * 1.05
  }

  // Animated on twos, the way anime is: the pose (and the drift of the hand)
  // only changes twelve times a second.
  let held = -1
  function update(time: number) {
    uniforms.uTime.value = time
    const step = Math.floor(time * 12)
    const t = step / 12
    const f = state.frame
    group.scale.setScalar(base.scale * f.scale)
    group.position.set(f.x, base.y + f.y, 0)
    // Leaning after the cursor (eased, so it reads as weight, not tracking).
    lean.lerp(pointer, 0.06)
    const r = state.react
    group.rotation.set(Math.sin(t * 0.21) * 0.025 - lean.y * 0.35 * r, f.yaw + Math.sin(t * 0.17) * 0.07 + lean.x * 0.45 * r, Math.sin(t * 0.13) * 0.012 - lean.x * 0.08 * r)
    if (rig && step !== held) {
      held = step
      const { skin } = rig.pose(currentPose(t))
      skin.forEach((m, k) => bones[k].copy(m))
    }
    const loaded = surface.hasAttribute('aLight')
    const shown = loaded && uniforms.uAlpha.value > 0.001
    points.visible = false
    occluder.visible = false
    sleeveOccluder.visible = false
    painting.visible = shown
    celMesh.visible = shown
    outline.visible = shown
    sleeveMesh.visible = shown
    sleeveOutline.visible = shown
  }

  function setVeil(texture: THREE.Texture) {
    uniforms.tVeil.value = texture
  }

  // The cursor, in scene units (centred, height-normalised).
  function setPointer(p: THREE.Vector2) {
    pointer.copy(p)
  }

  return { group, uniforms, state, ready, setLayout, update, setVeil, setPointer }
}
