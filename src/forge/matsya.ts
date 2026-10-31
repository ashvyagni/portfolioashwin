import * as THREE from 'three'

// Matsya (मत्स्य): the forge's companion, as phase one had the pothi. The
// fish who carried Manu through the flood, folded from paper: an origami
// koi, every face flat, every fold inked, kohaku red printed on its back and
// gold leaf on its fin edges. It swims (the bend runs down its body to the
// tail), and at the end of the sky it is big enough to stand on.

const PAPER = new THREE.Color('#F3EEE4')
const RED = new THREE.Color('#D4241C')
const GOLD = new THREE.Color('#F2B24A')
const INK = new THREE.Color('#1E140E')

type Tri = [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Color]

// The folded body, head at +x, unit length; flat faces, each its own colour.
function fold(): { tris: Tri[]; eye: THREE.Vector3 } {
  const tris: Tri[] = []
  const N = 12
  const ring: THREE.Vector3[][] = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const x = 0.5 - u * 0.86
    const s = Math.pow(Math.sin(Math.PI * Math.min(u * 0.92 + 0.06, 1)), 0.75)
    const w = 0.15 * s + 0.01
    const h = 0.13 * s + 0.01
    // A diamond section with a crease along the back: the back ridge, two
    // shoulders, two flanks, the belly keel.
    ring.push([
      new THREE.Vector3(x, h, 0),
      new THREE.Vector3(x, h * 0.45, w * 0.8),
      new THREE.Vector3(x, -h * 0.25, w),
      new THREE.Vector3(x, -h * 0.85, 0),
      new THREE.Vector3(x, -h * 0.25, -w),
      new THREE.Vector3(x, h * 0.45, -w * 0.8),
    ])
  }
  // Kohaku: red patches on the back facets of certain rings.
  const red = (i: number, k: number) => (k === 0 || k === 5) && ((i >= 2 && i <= 4) || (i >= 6 && i <= 8))
  const nose = new THREE.Vector3(0.58, 0.01, 0)
  for (let k = 0; k < 6; k++) tris.push([nose, ring[0][(k + 1) % 6], ring[0][k], k === 0 || k === 5 ? RED : PAPER])
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 6; k++) {
      const a = ring[i][k]
      const b = ring[i][(k + 1) % 6]
      const c = ring[i + 1][k]
      const d = ring[i + 1][(k + 1) % 6]
      const col = red(i, k) ? RED : PAPER
      tris.push([a, b, c, col], [b, d, c, col])
    }
  }
  // The tail: a forked fan of two folded blades, gold at the tips.
  const base = ring[N]
  const root = new THREE.Vector3(base[0].x, 0, 0)
  for (const side of [-1, 1]) {
    const tip = new THREE.Vector3(root.x - 0.36, 0.02, side * 0.24)
    const mid = new THREE.Vector3(root.x - 0.22, 0.05, side * 0.05)
    const edge = new THREE.Vector3(root.x - 0.3, -0.02, side * 0.32)
    tris.push([root, mid, tip, PAPER], [root, tip, edge, GOLD])
  }
  // Dorsal fin and pectorals, single folds.
  const dorsal = [ring[3][0], ring[6][0], new THREE.Vector3(ring[5][0].x - 0.04, ring[5][0].y + 0.1, 0)]
  tris.push([dorsal[0], dorsal[1], dorsal[2], RED])
  for (const side of [-1, 1]) {
    const at = ring[3][side > 0 ? 2 : 4]
    tris.push([at, ring[4][side > 0 ? 2 : 4], new THREE.Vector3(at.x - 0.16, at.y - 0.08, side * 0.3), GOLD])
  }
  return { tris, eye: new THREE.Vector3(0.42, 0.04, 0.085) }
}

const vertex = /* glsl */ `
  attribute vec3 color;
  uniform float uPhase;
  uniform float uAmp;
  varying vec3 vColor;
  varying vec3 vNormalV;
  varying vec3 vWorld;
  vec3 swim(vec3 p) {
    float w = smoothstep(0.35, -0.6, p.x);
    p.z += sin(uPhase - p.x * 6.0) * uAmp * (0.03 + 0.22 * w * w);
    return p;
  }
  void main() {
    vColor = color;
    vec3 p = swim(position);
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const fragment = /* glsl */ `
  uniform vec3 uLight;
  varying vec3 vColor;
  varying vec3 vNormalV;
  varying vec3 vWorld;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  void main() {
    // Flat faces from screen-space derivatives: every fold reads.
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float l = dot(n, normalize(uLight)) * 0.5 + 0.5;
    float tone = 0.62 + 0.24 * smoothstep(0.4, 0.46, l) + 0.14 * smoothstep(0.7, 0.75, l);
    vec3 col = vColor * tone;
    // Shadowed folds lean cool, as paper does in daylight.
    col = mix(col * vec3(0.86, 0.9, 1.05), col, smoothstep(0.35, 0.6, l));
    col *= 0.96 + 0.06 * hash(gl_FragCoord.xy * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
const lineVertex = /* glsl */ `
  uniform float uPhase;
  uniform float uAmp;
  void main() {
    vec3 p = position;
    float w = smoothstep(0.35, -0.6, p.x);
    p.z += sin(uPhase - p.x * 6.0) * uAmp * (0.03 + 0.22 * w * w);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export function createMatsya() {
  const { tris, eye } = fold()
  const pos: number[] = []
  const col: number[] = []
  for (const [a, b, c, k] of tris) {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.computeVertexNormals()
  const uniforms = { uPhase: { value: 0 }, uAmp: { value: 1 }, uLight: { value: new THREE.Vector3(0.4, 0.9, 0.35) } }
  const body = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, side: THREE.DoubleSide }))
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 1),
    new THREE.ShaderMaterial({ vertexShader: lineVertex, fragmentShader: `void main(){ gl_FragColor = vec4(${INK.r.toFixed(3)}, ${INK.g.toFixed(3)}, ${INK.b.toFixed(3)}, 1.0); }`, uniforms }),
  )
  const group = new THREE.Group()
  group.add(body, lines)
  // The eyes: ink, with a catch-light — the anime glint that makes it alive.
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), new THREE.MeshBasicMaterial({ color: INK }))
    e.position.set(eye.x, eye.y, eye.z * side)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    glint.position.set(0.012, 0.012, 0.018 * side)
    e.add(glint)
    group.add(e)
  }
  let phase = 0
  return {
    group,
    uniforms,
    // Swim: speed sets how fast the bend runs; amount how far it swings.
    swim(dt: number, speed = 1, amount = 1) {
      phase += dt * (3 + speed * 5)
      uniforms.uPhase.value = phase
      uniforms.uAmp.value = amount
    },
  }
}
