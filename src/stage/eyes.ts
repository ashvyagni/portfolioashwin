import * as THREE from 'three'
import { eyeSourceFragment } from './eyeShader'

// The eyes. A drawn, lit eye is painted off-screen (eyeShader), then shown as
// a fine halftone: dots on a rotated grid whose size carries the light. The
// dots never resolve away — that is the look. They ignite outward from the
// irises as the eyes appear, shimmer like embers, and a shockwave runs
// through them on the final wide open. Under the cursor's veil the drawing
// itself shows through.
//
// Expression works like a sprite sheet of poses: keyframes (drowsy, open,
// menacing) tweened on `expression`, with blinks layered on top.

type Pose = {
  lidH: number
  lidFlat: number
  slant: number
  lowH: number
  browY: number
  browTilt: number
  browArch: number
  crease: number
  pupil: number
  menace: number
}

// Index 0 drowsy, 1 open, 2 menacing.
const POSES: Pose[] = [
  { lidH: 0.37, lidFlat: 0.42, slant: -0.1, lowH: 0.2, browY: 0.84, browTilt: -0.05, browArch: 0.06, crease: 0.17, pupil: 0.38, menace: 0 },
  { lidH: 0.37, lidFlat: 0.72, slant: 0, lowH: 0.21, browY: 0.8, browTilt: 0, browArch: 0.07, crease: 0.16, pupil: 0.33, menace: 0.2 },
  { lidH: 0.45, lidFlat: 0.5, slant: 0.24, lowH: 0.15, browY: 0.63, browTilt: 0.3, browArch: 0.02, crease: 0.12, pupil: 0.2, menace: 1 },
]

const quad = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const dotsFragment = /* glsl */ `
precision highp float;

uniform sampler2D tSource;
uniform sampler2D tVeil;
uniform vec2 uRes;
uniform float uTime;
uniform float uAlpha;
uniform float uCell;
uniform float uAppear;
uniform float uRipple;
uniform float uPull;
uniform vec4 uIrises;   // both iris centres, scene units

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 toScene(vec2 frag) { return (frag - 0.5 * uRes) / uRes.y; }
vec2 toUv(vec2 scene) { return (scene * uRes.y + 0.5 * uRes) / uRes; }

vec2 pullWarp(vec2 p) {
  float r = length(p);
  float k = uPull * 2.5 / (r + 0.15);
  float a = uPull * 2.2 / (r + 0.35);
  p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;
  return p * (1.0 + k);
}

void main() {
  vec2 frag = gl_FragCoord.xy;

  // A halftone screen at 30 degrees, like print.
  const float A = 0.5236;
  mat2 toGrid = mat2(cos(A), -sin(A), sin(A), cos(A));
  mat2 fromGrid = mat2(cos(A), sin(A), -sin(A), cos(A));
  vec2 g = toGrid * frag / uCell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 centre = fromGrid * ((id + 0.5) * uCell);

  vec2 sp = pullWarp(toScene(centre));
  vec3 s = texture2D(tSource, toUv(sp)).rgb;
  float lum = max(s.r, max(s.g, s.b));

  // Ignition: cells catch outward from the irises, each at its own moment.
  float dIris = min(distance(sp, uIrises.xy), distance(sp, uIrises.zw));
  float h = hash(id);
  float threshold = h * 0.5 + smoothstep(0.0, 0.45, dIris) * 0.5;
  float lit = smoothstep(threshold, threshold + 0.1, uAppear);

  // Shockwave on the final wide open, and embers that never quite settle.
  float ring = exp(-pow((dIris - uRipple * 0.75) / 0.03, 2.0)) * (1.0 - uRipple);
  float shimmer = 1.0 + 0.12 * sin(uTime * (2.0 + h * 3.0) + h * 40.0) * (1.0 - smoothstep(0.0, 0.15, dIris));

  float radius = 0.5 * sqrt(clamp(lum, 0.0, 1.4)) * 1.12 * lit * (1.0 + ring * 0.7) * shimmer;
  float aa = 1.0 / uCell;
  float dotMask = 1.0 - smoothstep(radius - aa, radius + aa * 0.5, length(f));
  vec3 hue = lum > 1e-3 ? s / lum : vec3(0.0);
  vec3 col = hue * dotMask * min(1.0, 0.55 + lum);

  // Under the veil, the drawing itself.
  float veil = smoothstep(0.0, 0.08, texture2D(tVeil, frag / uRes).r);
  if (veil > 0.001) {
    vec3 drawn = texture2D(tSource, toUv(pullWarp(toScene(frag)))).rgb;
    col = mix(col, drawn, veil);
  }

  gl_FragColor = vec4(col * uAlpha, 1.0);
}
`

export function createEyes() {
  const source = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  blank.needsUpdate = true

  const sourceUniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uEyeSep: { value: 0.53 },
    uEyeY: { value: 0.12 },
    uEyeSize: { value: 0.3 },
    uLook: { value: new THREE.Vector2() },
    uSkin: { value: 0.4 },
    uOpen: { value: 0 },
    uLidH: { value: 0.37 },
    uLidFlat: { value: 0.72 },
    uSlant: { value: 0 },
    uLowH: { value: 0.2 },
    uBrowY: { value: 0.8 },
    uBrowTilt: { value: 0 },
    uBrowArch: { value: 0.06 },
    uCrease: { value: 0.16 },
    uPupil: { value: 0.35 },
    uMenace: { value: 0 },
    uFrame: { value: new THREE.Vector3(0, 0, 1) },
  }
  const sourceScene = new THREE.Scene()
  const sourceCamera = new THREE.OrthographicCamera()
  const sourceQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: quad, fragmentShader: eyeSourceFragment, uniforms: sourceUniforms, depthTest: false, depthWrite: false }),
  )
  sourceQuad.frustumCulled = false
  sourceScene.add(sourceQuad)

  const uniforms = {
    tSource: { value: source.texture as THREE.Texture },
    tVeil: { value: blank as THREE.Texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAlpha: { value: 0 },
    uCell: { value: 4 },
    uAppear: { value: 0 },
    uRipple: { value: 1 },
    uPull: { value: 0 },
    uIrises: { value: new THREE.Vector4() },
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: quad,
      fragmentShader: dotsFragment,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  mesh.frustumCulled = false
  mesh.renderOrder = 1

  // What the timeline animates: which pose, how shut, how much face; the lens
  // (x, y in scene units, zoom); a flutter of the shut lid; and how much the
  // eyes follow the cursor instead of glancing about.
  const state = { expression: 0, blink: 1, skin: 0.35, x: 0, y: 0, zoom: 1, twitch: 0, follow: 0 }
  const pointer = new THREE.Vector2()

  const gaze = new THREE.Vector2()
  let nextGlance = 0

  function setLayout(buffer: THREE.Vector2, aspect: number, pixelRatio: number) {
    uniforms.uRes.value.copy(buffer)
    source.setSize(Math.round(buffer.x * 0.75), Math.round(buffer.y * 0.75))
    sourceUniforms.uRes.value.set(source.width, source.height)
    const halfW = aspect * 0.5
    const portrait = aspect < 1
    const size = Math.min(0.28, halfW * (portrait ? 0.34 : 0.36))
    sep = Math.min(0.55, halfW * (portrait ? 0.54 : 0.56))
    eyeY = portrait ? 0.17 : 0.12
    sourceUniforms.uEyeSize.value = size
    sourceUniforms.uEyeSep.value = sep
    sourceUniforms.uEyeY.value = eyeY
    uniforms.uCell.value = 2.2 * pixelRatio
  }
  let sep = 0.55
  let eyeY = 0.12

  // Where an eye's iris sits in scene units, for pushing the lens into it.
  function irisOf(side: 1 | -1) {
    return { x: side * sep, y: eyeY - 0.01 }
  }

  function applyPose() {
    const e = THREE.MathUtils.clamp(state.expression, 0, POSES.length - 1)
    const i = Math.min(Math.floor(e), POSES.length - 2)
    const t = THREE.MathUtils.smootherstep(e - i, 0, 1)
    const a = POSES[i]
    const b = POSES[i + 1]
    const u = sourceUniforms
    const lerp = (k: keyof Pose) => a[k] + (b[k] - a[k]) * t
    u.uLidH.value = lerp('lidH')
    u.uLidFlat.value = lerp('lidFlat')
    u.uSlant.value = lerp('slant')
    u.uLowH.value = lerp('lowH')
    u.uBrowTilt.value = lerp('browTilt')
    u.uBrowArch.value = lerp('browArch')
    u.uCrease.value = lerp('crease')
    u.uPupil.value = lerp('pupil')
    u.uMenace.value = lerp('menace')
    // A blink shuts the lids and lets the brows dip a little with them; a
    // twitch flutters the lid while it is still closed.
    u.uOpen.value = 1 - state.blink + state.twitch * 0.08
    u.uBrowY.value = lerp('browY') - 0.03 * state.blink
    u.uSkin.value = state.skin
    // The lens breathes a little, so a held shot never sits dead still.
    u.uFrame.value.set(state.x, state.y, state.zoom * (1 + 0.006 * Math.sin(uniforms.uTime.value * 0.8)))
    // The irises on screen, through the lens (ignition and ripple start there).
    uniforms.uIrises.value.set((-sep - state.x) * state.zoom, (eyeY - 0.01 - state.y) * state.zoom, (sep - state.x) * state.zoom, (eyeY - 0.01 - state.y) * state.zoom)
  }

  function update(time: number) {
    uniforms.uTime.value = time
    sourceUniforms.uTime.value = time
    applyPose()
    if (time > nextGlance) {
      // Small, unhurried glances; once the menace arrives, a dead-still stare.
      const calm = 1 - THREE.MathUtils.clamp(state.expression - 1, 0, 1) * 0.9
      gaze.set((Math.random() - 0.5) * 0.16 * calm, (Math.random() - 0.5) * 0.07 * calm)
      nextGlance = time + 1.2 + Math.random() * 1.8
    }
    // Following the cursor: the eyes turn to where it is.
    const target = gaze.clone().lerp(pointer.clone().multiply(new THREE.Vector2(0.22, 0.12)), state.follow)
    sourceUniforms.uLook.value.lerp(target, 0.07)
    mesh.visible = uniforms.uAlpha.value > 0.001
  }

  // Paint the drawing before the main render.
  function render(renderer: THREE.WebGLRenderer) {
    if (!mesh.visible) return
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(source)
    renderer.render(sourceScene, sourceCamera)
    renderer.setRenderTarget(previous)
  }

  function setVeil(texture: THREE.Texture) {
    uniforms.tVeil.value = texture
  }

  function dispose() {
    source.dispose()
    blank.dispose()
    sourceQuad.geometry.dispose()
    ;(sourceQuad.material as THREE.Material).dispose()
  }

  // The cursor, in scene units (centred, height-normalised).
  function setPointer(p: THREE.Vector2) {
    pointer.copy(p)
  }

  return { mesh, uniforms, state, setLayout, irisOf, update, render, setVeil, setPointer, dispose }
}
