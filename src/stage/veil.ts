import * as THREE from 'three'

// The veil: a grid of small cells the cursor burns through. Each cell keeps a
// charge (1 when the cursor passes, draining over its own lifetime), so once
// the cursor moves on the cells knit back one by one, each at its own moment.
// Consumers read the red channel at their fragment: > 0 means revealed.

const CELL = 4 // device pixels per cell

const vertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
precision highp float;

uniform sampler2D tPrev;
uniform vec2 uSize;        // mask size in cells
uniform float uCell;       // device pixels per cell
uniform vec2 uMouse;       // device pixels, origin bottom-left
uniform vec2 uPrevMouse;
uniform float uRadius;     // device pixels
uniform float uActive;
uniform float uDt;
uniform float uTime;

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

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  float charge = texture2D(tPrev, gl_FragCoord.xy / uSize).r;

  // Each cell lingers for its own time, so the veil knits back cell by cell.
  float life = 0.55 + 0.9 * hash(cell);
  charge = max(charge - uDt / life, 0.0);

  // The brush: everything near the cursor's path this frame, with a ragged,
  // moving edge — denser in the middle, dithering out at the rim.
  vec2 p = (cell + 0.5) * uCell;
  vec2 ab = uMouse - uPrevMouse;
  float h = clamp(dot(p - uPrevMouse, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
  float d = length(p - uPrevMouse - ab * h) / uRadius;
  float rim = 0.7 + 0.3 * noise(cell * 0.12 + uTime * 1.5);
  float density = 1.0 - smoothstep(rim * 0.55, rim, d);
  float inside = step(d, rim) * step(hash(cell + floor(uTime * 20.0)), density + 0.15);
  charge = max(charge, inside * uActive);

  gl_FragColor = vec4(charge, 0.0, 0.0, 1.0);
}
`

export function createVeil() {
  const options = {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  }
  let read = new THREE.WebGLRenderTarget(1, 1, options)
  let write = new THREE.WebGLRenderTarget(1, 1, options)

  const uniforms = {
    tPrev: { value: read.texture as THREE.Texture },
    uSize: { value: new THREE.Vector2(1, 1) },
    uCell: { value: CELL },
    uMouse: { value: new THREE.Vector2(-1e4, -1e4) },
    uPrevMouse: { value: new THREE.Vector2(-1e4, -1e4) },
    uRadius: { value: 200 },
    uActive: { value: 0 },
    uDt: { value: 0 },
    uTime: { value: 0 },
  }
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera()
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false }),
  )
  quad.frustumCulled = false
  scene.add(quad)

  const pointer = new THREE.Vector2(-1e4, -1e4)
  let pixelRatio = 1
  let height = 1
  let enabled = false

  function onMove(e: PointerEvent) {
    pointer.set(e.clientX * pixelRatio, (height - e.clientY) * pixelRatio)
  }
  function onLeave() {
    pointer.set(-1e4, -1e4)
  }
  window.addEventListener('pointermove', onMove)
  document.addEventListener('pointerleave', onLeave)

  function setSize(buffer: THREE.Vector2, ratio: number, cssHeight: number) {
    pixelRatio = ratio
    height = cssHeight
    const w = Math.ceil(buffer.x / CELL)
    const h = Math.ceil(buffer.y / CELL)
    read.setSize(w, h)
    write.setSize(w, h)
    uniforms.uSize.value.set(w, h)
    uniforms.uRadius.value = 115 * ratio
  }

  function update(renderer: THREE.WebGLRenderer, dt: number, time: number) {
    const u = uniforms
    // This frame's stroke runs from where the cursor was to where it is.
    u.uPrevMouse.value.copy(u.uMouse.value.x < -1e3 ? pointer : u.uMouse.value)
    u.uMouse.value.copy(pointer)
    u.uActive.value = enabled && pointer.x > -1e3 ? 1 : 0
    u.uDt.value = Math.min(dt, 0.1)
    u.uTime.value = time
    u.tPrev.value = read.texture
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(write)
    renderer.render(scene, camera)
    renderer.setRenderTarget(previous)
    ;[read, write] = [write, read]
  }

  return {
    get texture() {
      return read.texture
    },
    setEnabled(on: boolean) {
      enabled = on
    },
    setSize,
    update,
    dispose() {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      read.dispose()
      write.dispose()
      quad.geometry.dispose()
      ;(quad.material as THREE.Material).dispose()
    },
  }
}
