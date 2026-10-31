import * as THREE from 'three'

// Saraswati's lotus: a white padma, its petals blushing pink at the tips and
// gold at the heart. The petals are not set in rings but on the sunflower's
// spiral — each one turned 137.5° (the golden angle) from the last, the
// outermost largest and opening first, the innermost last — so the flower is
// built on the same construction the act draws behind it.

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

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

// One petal of unit length: pointed, cupped across its width, a midrib
// running up its centre, the edges faintly waved, its tip curling outward.
// Its inner face looks towards +z; uv runs across (x) and along (y).
function petalGeometry(width: number, cup: number, curl: number) {
  const segU = 56
  const segV = 28
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segU; i++) {
    const u = i / segU
    const w = width * Math.pow(Math.max(Math.sin(Math.PI * Math.pow(u, 0.7)), 0), 0.8)
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * 2 - 1
      const av = Math.abs(v)
      const rib = 0.014 * (1 - Math.min(av / 0.22, 1)) ** 2 * Math.sin(Math.PI * Math.min(u * 1.1, 1))
      const wave = 0.006 * Math.sin(u * 17 + v * 2) * av ** 3
      pos.push(v * w, u, -cup * (1 - v * v) * (w / width) - curl * u * u - rib + wave)
      uv.push(v * 0.5 + 0.5, u)
    }
  }
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j
      const b = a + segV + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// The petal's skin: gold-green at the base, white through the body, pink at
// the tip and along the edges, fine veins running its length and branching
// towards the rim. In uv space the veins are nearly straight; the petal's
// shape draws them together at base and tip. A second canvas carries the
// veins alone, as relief.
function petalTextures() {
  const W = 512
  const H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const along = g.createLinearGradient(0, H, 0, 0)
  along.addColorStop(0, '#c9b062')
  along.addColorStop(0.08, '#efe0b6')
  along.addColorStop(0.28, '#fffaf2')
  along.addColorStop(0.62, '#fdf0f2')
  along.addColorStop(0.86, '#f6c2cf')
  along.addColorStop(1, '#e98fab')
  g.fillStyle = along
  g.fillRect(0, 0, W, H)
  const across = g.createLinearGradient(0, 0, W, 0)
  across.addColorStop(0, 'rgba(232,140,170,0.5)')
  across.addColorStop(0.2, 'rgba(255,255,255,0)')
  across.addColorStop(0.8, 'rgba(255,255,255,0)')
  across.addColorStop(1, 'rgba(232,140,170,0.5)')
  g.fillStyle = across
  g.fillRect(0, 0, W, H)

  const bump = document.createElement('canvas')
  bump.width = W
  bump.height = H
  const b = bump.getContext('2d')!
  b.fillStyle = '#808080'
  b.fillRect(0, 0, W, H)

  const rng = mulberry32(31)
  const veins = 46
  for (let k = 0; k <= veins; k++) {
    const x0 = W / 2 + (k / veins - 0.5) * W * 0.94
    const mid = k === veins / 2
    const alpha = mid ? 0.3 : 0.08 + rng() * 0.1
    const lw = mid ? 3 : 1 + rng() * 0.8
    const path = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath()
      ctx.moveTo(x0, H)
      for (let y = H; y >= 0; y -= 12) ctx.lineTo(x0 + Math.sin(y * 0.018 + k) * 1.5, y)
      ctx.stroke()
      // Branches towards the rim in the upper half.
      if (!mid && rng() < 0.6) {
        const y0 = H * (0.2 + rng() * 0.4)
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.quadraticCurveTo(x0 + (x0 < W / 2 ? -1 : 1) * 14, y0 - 40, x0 + (x0 < W / 2 ? -1 : 1) * 26, y0 - 110)
        ctx.stroke()
      }
    }
    g.strokeStyle = mid ? `rgba(200,150,96,${alpha})` : `rgba(200,120,146,${alpha})`
    g.lineWidth = lw
    path(g)
    b.strokeStyle = `rgba(160,160,160,${mid ? 0.9 : 0.55})`
    b.lineWidth = lw * 1.6
    path(b)
  }
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(200,120,140,0.06)'
    g.fillRect(rng() * W, rng() * H, 1.5, 1.5)
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const relief = new THREE.CanvasTexture(bump)
  relief.anisotropy = 8
  return { map, relief }
}

// Light through the petals: where the sun is behind a petal, it glows,
// the way thin petals do. One direction for every lotus (in view space,
// set each frame by the act).
export const petalLight = { uSunView: { value: new THREE.Vector3(0, 0, -1) }, uTranslucency: { value: 0.75 } }

let sharedPetal: { map: THREE.CanvasTexture; relief: THREE.CanvasTexture } | null = null

export type LotusOptions = {
  count: number // petals
  size: number // world scale
  spread: number // seconds between the first petal opening and the last
  duration: number // seconds each petal takes to open
  seed?: number
  tint?: THREE.Color // multiplies the petals' colour (white lotus by default)
}

export function createLotus({ count, size, spread, duration, seed = 3, tint }: LotusOptions) {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  const flower = new THREE.Group()
  flower.scale.setScalar(size)
  group.add(flower)

  sharedPetal ??= petalTextures()
  const sharedPetalMap = sharedPetal.map
  const petalMaterial = new THREE.MeshPhysicalMaterial({
    map: sharedPetalMap,
    // A little under white, so a petal in full light still has somewhere to go.
    color: new THREE.Color(0.8, 0.78, 0.77).multiply(tint ?? new THREE.Color(1, 1, 1)),
    roughness: 0.62,
    metalness: 0,
    sheen: 0.7,
    sheenColor: new THREE.Color(1, 0.8, 0.86),
    sheenRoughness: 0.6,
    specularIntensity: 0.4,
    emissive: 0xffffff,
    emissiveMap: sharedPetalMap,
    emissiveIntensity: 0.06,
    bumpMap: sharedPetal.relief,
    bumpScale: 0.6,
    side: THREE.DoubleSide,
  })
  petalMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, petalLight)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunView;\nuniform float uTranslucency;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Sun behind the petal (relative to the face we see): it glows through.
        float through = max(dot(-normal, uSunView), 0.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.84, 0.82) * pow(through, 1.4) * uTranslucency;`,
      )
  }
  petalMaterial.customProgramCacheKey = () => 'petal-translucent'
  const geometry = petalGeometry(0.44, 0.15, 0.07)

  type Petal = { mesh: THREE.Mesh; open: number; delay: number; phase: number }
  const petals: Petal[] = []
  for (let n = 0; n < count; n++) {
    const f = n / (count - 1)
    const holder = new THREE.Group()
    holder.rotation.y = n * GOLDEN_ANGLE
    const mesh = new THREE.Mesh(geometry, petalMaterial)
    mesh.castShadow = true
    mesh.receiveShadow = true
    const length = mix(1.12, 0.5, Math.pow(f, 0.9))
    const width = mix(1, 0.62, f) * (0.92 + rng() * 0.16)
    mesh.scale.set(width, length, length)
    mesh.position.set(0, f * 0.05, -mix(0.2, 0.05, f))
    holder.add(mesh)
    flower.add(holder)
    petals.push({ mesh, open: mix(1.5, 0.14, Math.pow(f, 0.75)), delay: f * spread, phase: rng() * 6.28 })
  }

  // The heart: a gold seed pod, its seeds set on the same spiral, ringed by stamens.
  const gold = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.86, 0.62, 0.26),
    metalness: 0.45,
    roughness: 0.42,
    sheen: 0.6,
    sheenColor: new THREE.Color(1, 0.86, 0.5),
    emissive: new THREE.Color(0.5, 0.3, 0.08),
    emissiveIntensity: 0.25,
  })
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.09, 0.13, 64, 4), gold)
  pod.position.y = 0.065
  pod.castShadow = true
  pod.receiveShadow = true
  flower.add(pod)
  const seedMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.36, 0.12), roughness: 0.6 })
  for (let n = 1; n <= 13; n++) {
    const r = 0.034 * Math.sqrt(n)
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), seedMaterial)
    s.position.set(Math.cos(n * GOLDEN_ANGLE) * r, 0.13, Math.sin(n * GOLDEN_ANGLE) * r)
    s.scale.y = 0.5
    flower.add(s)
  }
  const stamenCount = 84
  const filaments = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0035, 0.005, 1, 5).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 0.9, 0.62), roughness: 0.5, emissive: new THREE.Color(0.4, 0.3, 0.1) }),
    stamenCount,
  )
  const anthers = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.011, 8, 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 0.78, 0.25), roughness: 0.4, emissive: new THREE.Color(0.7, 0.45, 0.08), emissiveIntensity: 0.6 }),
    stamenCount,
  )
  const stamens = Array.from({ length: stamenCount }, (_, i) => ({
    angle: i * GOLDEN_ANGLE,
    radius: 0.15 + rng() * 0.04,
    length: 0.14 + rng() * 0.08,
    lean: 0.25 + rng() * 0.35,
  }))
  flower.add(filaments, anthers)
  const dummy = new THREE.Object3D()
  const tip = new THREE.Vector3()

  // Bloom at local time `local` (seconds since the first petal began to open);
  // `fold` closes it again.
  function update(local: number, fold = 0, time = 0) {
    for (const p of petals) {
      const x = Math.min(Math.max((local - p.delay) / duration, 0), 1)
      const bloom = 1 - Math.pow(1 - x, 3)
      const breathe = Math.sin(time * 0.7 + p.phase) * 0.018 * bloom
      p.mesh.rotation.x = -(0.06 + (p.open - 0.06) * bloom * (1 - fold) + breathe)
    }
    const heart = smooth(spread * 0.55, spread + duration * 0.6, local) * (1 - fold)
    stamens.forEach((s, i) => {
      const lean = s.lean * heart
      dummy.position.set(Math.cos(s.angle) * s.radius, 0.06, Math.sin(s.angle) * s.radius)
      dummy.rotation.set(Math.sin(s.angle) * lean, 0, -Math.cos(s.angle) * lean)
      dummy.scale.set(1, s.length * (0.25 + 0.75 * heart), 1)
      dummy.updateMatrix()
      filaments.setMatrixAt(i, dummy.matrix)
      tip.set(0, 1, 0).applyMatrix4(dummy.matrix)
      dummy.position.copy(tip)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(0.3 + 0.7 * heart)
      dummy.updateMatrix()
      anthers.setMatrixAt(i, dummy.matrix)
    })
    filaments.instanceMatrix.needsUpdate = true
    anthers.instanceMatrix.needsUpdate = true
  }
  update(0)

  return { group, update, petalMaterial }
}
