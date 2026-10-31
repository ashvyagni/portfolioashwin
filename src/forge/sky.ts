import * as THREE from 'three'
import { clamp01, easeInOut, mulberry32, smooth } from './ink'

// The sky after the cross cuts the page open: rocks hanging in the air, and
// pieces of the page drifting among them, all drawn — toon-shaded in a few
// tones, hatched where the light does not reach, outlined in ink. You run
// across the rocks in your own eyes, leap from one to the next, and at the
// last one drop: through the clouds, down into the dark.

const ROCKS = 8
const EYE = 1.55

const rockVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const rockFragment = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform vec3 uTint;
  uniform float uFog;
  uniform vec3 uFogColor;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorld;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec3 n = normalize(vNormal);
    float l = dot(n, normalize(uLight)) * 0.5 + 0.5;
    // Three tones, the steps softened: a cel's shading, painted.
    float tone = smoothstep(0.42, 0.48, l) * 0.45 + smoothstep(0.68, 0.74, l) * 0.55;
    vec3 col = mix(uTint * 0.62, uPaper, tone);
    // Grass-green on the tops, where you land.
    col = mix(col, mix(vec3(0.55, 0.62, 0.38), vec3(0.78, 0.82, 0.6), tone), smoothstep(0.75, 0.9, n.y) * 0.85);
    // Hatching in the shade, wobbling on twos.
    vec2 fc = gl_FragCoord.xy + (noise(gl_FragCoord.xy * 0.03 + floor(uTime * 8.0)) - 0.5) * 3.0;
    float s1 = abs(fract((fc.x + fc.y) / 6.0) - 0.5) * 2.0;
    float s2 = abs(fract((fc.x - fc.y) / 7.0) - 0.5) * 2.0;
    float dark = 1.0 - l;
    float hatch = (1.0 - smoothstep(0.0, 0.3, s1)) * smoothstep(0.45, 0.6, dark) + (1.0 - smoothstep(0.0, 0.25, s2)) * smoothstep(0.62, 0.78, dark);
    col = mix(col, uInk, clamp(hatch, 0.0, 1.0) * 0.55);
    float grain = 0.94 + 0.08 * noise(gl_FragCoord.xy * 0.4);
    col *= grain;
    float d = length(vWorld - cameraPosition);
    col = mix(col, uFogColor, 1.0 - exp(-d * uFog));
    gl_FragColor = vec4(col, 1.0);
  }
`
const hullVertex = /* glsl */ `
  uniform float uWidth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position * (1.0 + uWidth), 1.0);
    gl_Position = projectionMatrix * mv;
  }
`
const hullFragment = /* glsl */ `
  uniform vec3 uInk;
  uniform float uFog;
  uniform vec3 uFogColor;
  void main() {
    float d = gl_FragCoord.z / gl_FragCoord.w;
    gl_FragColor = vec4(mix(uInk, uFogColor, 1.0 - exp(-d * uFog)), 1.0);
  }
`

function rockGeometry(rng: () => number) {
  const g = new THREE.IcosahedronGeometry(1, 3)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const seed = rng() * 100
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 0.7) * Math.sin(v.z * 3.3 + seed * 1.3)
    v.multiplyScalar(1 + 0.18 * n + 0.06 * Math.sin(v.x * 9 + v.z * 7 + seed))
    // A flat top to stand on; the underside hanging to a jagged point.
    if (v.y > 0.25) v.y = 0.25 + (v.y - 0.25) * 0.25
    else v.y = v.y * (1.6 + 1.2 * Math.max(-v.y, 0)) - Math.max(-v.y - 0.4, 0) * (0.6 + 0.8 * Math.abs(Math.sin(v.x * 5 + v.z * 4 + seed)))
    p.setXYZ(i, v.x * 1.25, v.y, v.z * 1.15)
  }
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  return flat
}

function cloudTexture(rng: () => number) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const puffs = Array.from({ length: 7 }, (_, i) => ({ x: 70 + i * 62 + (rng() - 0.5) * 20, y: 150 - Math.sin((i / 6) * Math.PI) * 50 + (rng() - 0.5) * 16, r: 44 + rng() * 30 }))
  // Only the outer silhouette inked: every puff drawn a little larger in ink,
  // then the paper laid over, so the seams between puffs vanish.
  const body = (grow: number, color: string) => {
    g.fillStyle = color
    puffs.forEach((p) => {
      g.beginPath()
      g.arc(p.x, p.y, p.r + grow, 0, Math.PI * 2)
      g.fill()
    })
    g.beginPath()
    g.roundRect(60 - grow, 150 - grow, 400 + grow * 2, 40 + grow * 2, 20)
    g.fill()
  }
  body(3, '#2a2420')
  body(0, '#f7f3ea')
  // A little shade under each puff, hatched.
  g.strokeStyle = 'rgba(42, 36, 32, 0.25)'
  g.lineWidth = 1.5
  for (let x = 90; x < 440; x += 9) {
    g.beginPath()
    g.moveTo(x, 186)
    g.lineTo(x + 10, 172)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function shardTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#efe7d8'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = '#2a2420'
  g.lineWidth = 6
  g.strokeRect(3, 3, 250, 250)
  g.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    g.beginPath()
    g.moveTo(28, 50 + i * 30)
    g.lineTo(28 + 60 + ((i * 53) % 140), 50 + i * 30)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createSky(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  const scene = new THREE.Scene()
  const paper = new THREE.Color('#ece6da')
  scene.background = paper.clone()
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400)
  const rng = mulberry32(42)

  const uniforms = {
    uLight: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uPaper: { value: new THREE.Color('#f2ece0') },
    uInk: { value: new THREE.Color('#2a2420') },
    uTint: { value: new THREE.Color('#9a8f86') },
    uFog: { value: 0.012 },
    uFogColor: { value: paper.clone() },
    uTime: { value: 0 },
  }
  const rockMat = new THREE.ShaderMaterial({ vertexShader: rockVertex, fragmentShader: rockFragment, uniforms })
  const hullMat = new THREE.ShaderMaterial({
    vertexShader: hullVertex,
    fragmentShader: hullFragment,
    uniforms: { uWidth: { value: 0.035 }, uInk: uniforms.uInk, uFog: uniforms.uFog, uFogColor: uniforms.uFogColor },
    side: THREE.BackSide,
  })

  // The path's rocks, then a scatter of others all about, near and far.
  type Rock = { mesh: THREE.Group; top: THREE.Vector3; r: number; spin: number; bob: number }
  const rocks: Rock[] = []
  const addRock = (x: number, y: number, z: number, s: number) => {
    const geo = rockGeometry(rng)
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geo, rockMat), new THREE.Mesh(geo, hullMat))
    group.position.set(x, y, z)
    group.scale.set(s, s * (0.8 + rng() * 0.4), s)
    group.rotation.y = rng() * Math.PI * 2
    scene.add(group)
    const rock = { mesh: group, top: new THREE.Vector3(x, y + 0.27 * group.scale.y, z), r: s * 1.1, spin: (rng() - 0.5) * 0.04, bob: rng() * 6 }
    rocks.push(rock)
    return rock
  }
  const path: Rock[] = []
  for (let i = 0; i < ROCKS; i++) {
    const x = Math.sin(i * 1.3) * 2.2 + (i % 2 ? 0.8 : -0.8)
    const y = Math.sin(i * 0.9) * 1.6 - i * 0.5
    path.push(addRock(x, y, -i * 7.2, 2.0 + rng() * 0.8))
  }
  for (let i = 0; i < 46; i++) {
    const z = -rng() * 70 + 12
    const side = rng() < 0.5 ? -1 : 1
    addRock(side * (6 + rng() * 26), (rng() - 0.45) * 26, z, 0.5 + rng() * 2.6)
  }

  // Clouds below and among the rocks (you fall through them at the end).
  const clouds: THREE.Sprite[] = []
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(rng), transparent: true, depthWrite: false, fog: false }))
    const below = i < 14
    s.position.set((rng() - 0.5) * 60, below ? -10 - rng() * 40 : (rng() - 0.5) * 20, -rng() * 60 - (below ? -10 : 5))
    const w = 8 + rng() * 14
    s.scale.set(w, w / 2, 1)
    scene.add(s)
    clouds.push(s)
  }

  // Pieces of the page, torn away and drifting.
  const shardMat = new THREE.MeshBasicMaterial({ map: shardTexture(), side: THREE.DoubleSide })
  const shards: { mesh: THREE.Mesh; spin: THREE.Vector3 }[] = []
  for (let i = 0; i < 34; i++) {
    const shape = new THREE.Shape()
    const n = 3 + Math.floor(rng() * 3)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng() * 0.6
      const r = 0.4 + rng() * 0.6
      if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    const geo = new THREE.ShapeGeometry(shape)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5 + 0.5, uv.getY(k) * 0.5 + 0.5)
    const m = new THREE.Mesh(geo, shardMat)
    m.position.set((rng() - 0.5) * 24, (rng() - 0.3) * 12, -rng() * 60 + 6)
    m.scale.setScalar(0.4 + rng() * 1.2)
    m.rotation.set(rng() * 6, rng() * 6, rng() * 6)
    scene.add(m)
    shards.push({ mesh: m, spin: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.6) })
  }

  const pos = new THREE.Vector3()
  const look = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const black = new THREE.Color('#050506')
  // How much the view is leaping (for the speed lines drawn over it).
  const state = { leap: 0, falling: 0, dark: 0 }

  function setSize(w: number, h: number) {
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w < h ? 82 : 70
    camera.updateProjectionMatrix()
  }

  // run: 0 … 1 across the rocks; fall: 0 … 1 from the last one down into the dark.
  function render(run: number, fall: number, time: number) {
    uniforms.uTime.value = time
    rocks.forEach((r) => {
      r.mesh.rotation.y += r.spin * 0.016
      r.mesh.position.y = r.top.y - 0.27 * r.mesh.scale.y + Math.sin(time * 0.5 + r.bob) * (path.includes(r) ? 0.02 : 0.12)
    })
    shards.forEach((s) => {
      s.mesh.rotation.x += s.spin.x * 0.016
      s.mesh.rotation.y += s.spin.y * 0.016
    })

    const seg = clamp01(run) * (ROCKS - 1)
    const i = Math.min(Math.floor(seg), ROCKS - 2)
    const f = seg - i
    const A = path[i]
    const B = path[i + 1]
    fwd.subVectors(B.top, A.top).setY(0).normalize()
    state.leap = 0
    if (f < 0.4) {
      // Running across the top of this rock, the step bobbing.
      const k = f / 0.4
      a.copy(A.top).addScaledVector(fwd, -A.r * 0.55)
      b.copy(A.top).addScaledVector(fwd, A.r * 0.7)
      pos.lerpVectors(a, b, k)
      pos.y += EYE + Math.abs(Math.sin(k * Math.PI * 4)) * 0.08
      look.copy(B.top).setY(B.top.y + EYE * 0.6)
    } else {
      // The leap: off the edge, an arc through the air, down onto the next.
      const k = easeInOut((f - 0.4) / 0.6)
      a.copy(A.top).addScaledVector(fwd, A.r * 0.7)
      b.copy(B.top).addScaledVector(fwd, -B.r * 0.55)
      pos.lerpVectors(a, b, k)
      pos.y += EYE + Math.sin(k * Math.PI) * (2.4 + Math.max(B.top.y - A.top.y, 0)) - Math.sin(k * Math.PI) * 0.2
      // A dip as the legs take the landing.
      pos.y -= smooth(0.85, 0.95, k) * (1 - smooth(0.95, 1, k)) * 0.35
      look.copy(B.top).addScaledVector(fwd, B.r * 2).setY(B.top.y + EYE * (0.3 + 0.5 * Math.sin(k * Math.PI)))
      state.leap = Math.sin(k * Math.PI)
    }
    // The drop: off the last rock, forward, then straight down, turning to look below.
    state.falling = fall
    if (fall > 0) {
      const last = path[ROCKS - 1]
      const out = smooth(0, 0.25, fall)
      const down = Math.pow(clamp01((fall - 0.1) / 0.9), 1.8)
      pos.copy(last.top).addScaledVector(fwd, last.r * 0.7 + out * 3).setY(last.top.y + EYE + Math.sin(out * Math.PI) * 1.2 - down * 90)
      const tilt = smooth(0.12, 0.45, fall)
      look.copy(pos).addScaledVector(fwd, 4 * (1 - tilt) + 0.01).setY(pos.y - 4 * tilt - 0.5)
      state.leap = 0.6 + 0.4 * smooth(0.1, 0.4, fall)
    }
    camera.position.copy(pos)
    camera.up.set(0, 1, 0)
    camera.lookAt(look)
    // Into the dark as the fall goes on.
    state.dark = smooth(0.55, 0.95, fall)
    ;(scene.background as THREE.Color).copy(paper).lerp(black, state.dark)
    uniforms.uFogColor.value.copy(scene.background as THREE.Color)
    uniforms.uFog.value = 0.012 + 0.05 * state.dark
    renderer.render(scene, camera)
  }

  return {
    setSize,
    render,
    state,
    dispose() {
      renderer.dispose()
    },
  }
}
