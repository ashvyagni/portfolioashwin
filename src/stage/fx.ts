import * as THREE from 'three'

// The cutscene's atmosphere, behind and around the eyes and hand:
//  - a backdrop: the warm fire-light behind the hand, slow smoke, and the
//    anime focus lines (shuchusen) that converge on a point for a hit,
//    redrawn on twos so they flicker like drawn frames;
//  - embers drifting up and away on the wind.

const quad = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const backdropFragment = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uGlow;
uniform vec2 uGlowAt;
uniform float uLines;
uniform vec2 uLinesAt;
uniform float uSigil;
uniform vec2 uSigilAt;
uniform float uSigilScale;
uniform float uFlare;

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
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float tri(vec2 p, float r, float rot) {
  float d = 1e3;
  for (int i = 0; i < 3; i++) {
    float a0 = rot + float(i) * 2.0943951;
    float a1 = a0 + 2.0943951;
    d = min(d, seg(p, r * vec2(cos(a0), sin(a0)), r * vec2(cos(a1), sin(a1))));
  }
  return d;
}

// The sigil behind the hand: a yantra drawn in light — rings, a ring of
// sixteen petals, ticks like a dial, two triangles up and two down — the
// outer rings turning one way, the triangles the other.
float sigil(vec2 q, float t) {
  float r = length(q);
  float a = atan(q.y, q.x);
  float px = fwidth(r) * 1.2;
  float line = 0.0;
  line += 1.0 - smoothstep(0.0, px, abs(r - 0.40));
  line += 1.0 - smoothstep(0.0, px, abs(r - 0.415));
  line += (1.0 - smoothstep(0.0, px, abs(r - 0.29))) * 0.8;
  float ao = a + t * 0.05;
  float petal = 0.33 + 0.065 * abs(sin(ao * 8.0));
  line += (1.0 - smoothstep(0.0, px, abs(r - petal))) * step(0.29, r) * 0.9;
  float tick = abs(fract(ao * 72.0 / 6.2831853) - 0.5);
  line += (1.0 - smoothstep(0.0, 0.08, tick)) * step(0.418, r) * step(r, 0.44) * 0.8;
  float ai = -t * 0.08;
  float d = min(min(tri(q, 0.27, ai + 1.5707963), tri(q, 0.21, ai + 1.5707963 + 0.35)),
                min(tri(q, 0.27, ai - 1.5707963), tri(q, 0.18, ai - 1.5707963 - 0.35)));
  line += (1.0 - smoothstep(0.0, px, d)) * 0.85;
  line += exp(-r * r / 0.0004) * 2.0;
  return line;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 col = vec3(0.0);

  // Smoke behind the hand, painted the way anime paints it: churning, but
  // posterised into hard cel tones — near-black, crimson, ember, a hot core.
  vec2 g = (p - uGlowAt) * vec2(0.75, 1.0);
  float d2 = dot(g, g);
  vec2 w = vec2(fbm(p * 2.0 + vec2(0.0, -uTime * 0.07)), fbm(p * 2.0 + vec2(5.2, -uTime * 0.05)));
  float smoke = fbm(p * 1.7 + w * 1.4 + vec2(uTime * 0.02, -uTime * 0.09));
  // It hugs the ground and the hand; above, where the eyes are, it thins to black.
  float rise = smoothstep(-0.15, 0.4, p.y - uGlowAt.y * 0.4);
  float v = (smoke * 0.95 + exp(-d2 * 3.0) * 0.75 - 0.5 - rise * 0.32) * uGlow;
  float aa = fwidth(v) + 0.002;
  vec3 smokeCol = vec3(0.0);
  smokeCol = mix(smokeCol, vec3(0.16, 0.02, 0.03), smoothstep(0.1 - aa, 0.1 + aa, v));
  smokeCol = mix(smokeCol, vec3(0.42, 0.05, 0.04), smoothstep(0.24 - aa, 0.24 + aa, v));
  smokeCol = mix(smokeCol, vec3(0.78, 0.22, 0.06), smoothstep(0.4 - aa, 0.4 + aa, v));
  smokeCol = mix(smokeCol, vec3(1.0, 0.66, 0.32), smoothstep(0.58 - aa, 0.58 + aa, v));
  col += smokeCol;

  // Shafts of light fanning up from behind the hand, slowly turning.
  vec2 q = p - uGlowAt;
  float ang = atan(q.y, q.x);
  float rays = pow(noise(vec2(ang * 7.0 + uTime * 0.05, 1.0)), 4.0) * smoothstep(-0.3, 0.6, q.y + 0.2);
  col += vec3(1.0, 0.45, 0.18) * rays * exp(-length(q) * 1.6) * 0.5 * uGlow;

  // The sigil, flaring on the hits.
  if (uSigil > 0.001) {
    vec2 sq = (p - uSigilAt) / uSigilScale;
    float s = sigil(sq, uTime);
    // It draws itself outward from its heart as it appears.
    float reveal = 1.0 - smoothstep(uSigil * 0.5 - 0.03, uSigil * 0.5, length(sq));
    col += vec3(1.0, 0.5, 0.2) * s * min(uSigil * 1.4, 1.0) * reveal * (0.35 + uFlare * 1.4);
  }

  // Focus lines: thin wedges converging on a point, redrawn twelve times a second.
  if (uLines > 0.001) {
    vec2 q = p - uLinesAt;
    float r = length(q);
    float a = atan(q.y, q.x) / 6.2831853 + 0.5;
    float frame = floor(uTime * 12.0);
    float sectors = 180.0;
    float id = floor(a * sectors);
    float f = fract(a * sectors) - 0.5;
    float on = step(0.45, hash(vec2(id, frame)));
    float width = 0.08 + 0.3 * hash(vec2(id + 7.0, frame));
    float inner = 0.28 + 0.35 * hash(vec2(id + 3.0, frame));
    float line = (1.0 - smoothstep(width * 0.6, width, abs(f))) * smoothstep(inner, inner + 0.15, r) * on;
    col = mix(col, vec3(1.0, 0.94, 0.86), line * uLines);
  }

  gl_FragColor = vec4(col, 1.0);
}
`

export function createFx({ small }: { small: boolean }) {
  const backdropUniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uGlowAt: { value: new THREE.Vector2(0, -0.35) },
    uLines: { value: 0 },
    uLinesAt: { value: new THREE.Vector2(0, 0) },
    uSigil: { value: 0 },
    uSigilAt: { value: new THREE.Vector2(0, -0.05) },
    uSigilScale: { value: 1 },
    uFlare: { value: 0 },
  }
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: quad, fragmentShader: backdropFragment, uniforms: backdropUniforms, depthTest: false, depthWrite: false }),
  )
  backdrop.frustumCulled = false
  backdrop.renderOrder = -1

  // Embers, in the camera's space (it sits at z = 6 looking down -z).
  const count = small ? 260 : 560
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5], i * 3)
    seed[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const emberUniforms = {
    uTime: { value: 0 },
    uAlpha: { value: 0 },
    uWind: { value: 0.15 },
    uRise: { value: 0.35 },
    uPixelRatio: { value: 1 },
    uMouse: { value: new THREE.Vector2(99, 99) },
  }
  const embers = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: emberUniforms,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uWind;
        uniform float uRise;
        uniform float uPixelRatio;
        uniform vec2 uMouse;
        varying float vSeed;
        varying float vFade;
        void main() {
          vec3 p = position;
          float speed = 0.5 + aSeed;
          p.y = mod(p.y + 3.0 + uTime * uRise * speed, 6.0) - 3.0;
          p.x = mod(p.x + 4.5 + uTime * uWind * speed + sin(uTime * 0.7 + aSeed * 30.0) * 0.15, 9.0) - 4.5;
          // Scattered by the cursor, like sparks off a hand passing through.
          vec2 away = p.xy - uMouse * (1.0 + p.z / 6.0);
          float near = exp(-dot(away, away) * 3.0);
          p.xy += normalize(away + 1e-4) * near * 0.55;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.2 + 3.5 * aSeed * aSeed) * uPixelRatio * (6.0 / -mv.z);
          vSeed = aSeed;
          vFade = smoothstep(3.0, 2.2, abs(p.y)) * smoothstep(4.5, 3.6, abs(p.x));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        uniform float uTime;
        varying float vSeed;
        varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float core = 1.0 - smoothstep(0.05, 0.5, d);
          float flicker = 0.55 + 0.45 * sin(uTime * (3.0 + vSeed * 6.0) + vSeed * 40.0);
          vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.35), vSeed * vSeed);
          gl_FragColor = vec4(c * core * flicker * vFade * uAlpha * 1.4, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  embers.frustumCulled = false
  embers.renderOrder = 3

  const group = new THREE.Group()
  group.add(backdrop, embers)

  function setLayout(buffer: THREE.Vector2, pixelRatio: number) {
    backdropUniforms.uRes.value.copy(buffer)
    emberUniforms.uPixelRatio.value = pixelRatio
  }

  // The cursor in scene units, carried onto the plane the embers drift in
  // (at z = 0 the visible height is about 3.78 units).
  function setPointer(p: THREE.Vector2) {
    emberUniforms.uMouse.value.set(p.x * 3.78, p.y * 3.78)
  }

  // What the timeline animates.
  const state = { glow: 0, lines: 0, embers: 0, wind: 0.15, rise: 0.35, sigil: 0, flare: 0 }

  function update(time: number) {
    backdropUniforms.uTime.value = time
    emberUniforms.uTime.value = time
    backdropUniforms.uGlow.value = state.glow
    backdropUniforms.uLines.value = state.lines
    backdropUniforms.uSigil.value = state.sigil
    backdropUniforms.uFlare.value = state.flare
    emberUniforms.uAlpha.value = state.embers
    emberUniforms.uWind.value = state.wind
    emberUniforms.uRise.value = state.rise
    backdrop.visible = state.glow > 0.001 || state.lines > 0.001 || state.sigil > 0.001
    embers.visible = emberUniforms.uAlpha.value > 0.001
  }

  return { group, state, setPointer, sigilAt: backdropUniforms.uSigilAt.value, sigilScale: backdropUniforms.uSigilScale, glowAt: backdropUniforms.uGlowAt.value, linesAt: backdropUniforms.uLinesAt.value, setLayout, update }
}
