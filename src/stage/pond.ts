import * as THREE from 'three'

// The pond is the mind, and each thing in it means something:
//   koi       thoughts. A few, large, bright; they wander, crowd and race when
//             the mind is restless, scatter when the drop lands, then glide.
//   fish      small, plain, following the koi: the actions those thoughts
//             reap. Where a thought goes, its actions go after it.
//   weeds     bad thoughts, rooted in the mud: they grow and thrash as the
//             mind sours, and wither once it is calm.
//   ripples   consequences: every fish leaves a wake (see `wakes`), so a
//             crowded mind is a choppy one.
// The koi are curious, too: hold the cursor still over the water and they
// come to look; move it and they dart away.

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
const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export const FLOOR_Y = -0.98
export const WAKES = 16

// ------------------------------------------------------------------ koi

// A koi of unit length along +x (head at +x): a laterally flattened body,
// a forked tail, a dorsal fin and two pectorals. `aU` runs head (0) to tail
// tip (~1.3) and drives the swimming bend; `aFin` marks fin vertices.
function koiGeometry() {
  const pos: number[] = []
  const us: number[] = []
  const fins: number[] = []
  const idx: number[] = []
  const NU = 30
  const NV = 16
  for (let i = 0; i <= NU; i++) {
    const u = i / NU
    const x = 0.5 - u
    // Seen from above (as a pond is), a koi is broad-backed: wide, not tall.
    const r0 = 0.11 * Math.pow(Math.sin(Math.PI * Math.min(u * 1.04 + 0.04, 1)), 0.75) + 0.012
    const h = r0 * 0.72
    const w = r0 * 0.95
    for (let j = 0; j <= NV; j++) {
      const a = (j / NV) * Math.PI * 2
      let y = Math.sin(a) * h
      if (y < 0) y *= 0.82
      pos.push(x, y, Math.cos(a) * w)
      us.push(u)
      fins.push(0)
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j
      const b = a + NV + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  // Flat fins: a grid of (s across 0..1, t along 0..1) mapped by `at`.
  const fin = (at: (s: number, t: number) => [number, number, number, number], ns: number, nt: number, flag: number) => {
    const base = pos.length / 3
    for (let i = 0; i <= nt; i++) {
      for (let j = 0; j <= ns; j++) {
        const [x, y, z, u] = at(j / ns, i / nt)
        pos.push(x, y, z)
        us.push(u)
        fins.push(flag)
      }
    }
    for (let i = 0; i < nt; i++) {
      for (let j = 0; j < ns; j++) {
        const a = base + i * (ns + 1) + j
        const b = a + ns + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b, a, a + 1, b + 1, b)
      }
    }
  }
  // Tail: a flowing forked fan, laid out flat the way koi are painted, so
  // it reads from above and sweeps as the fish swims.
  fin((s, t) => {
    const spread = (s - 0.5) * 2
    const len = 0.3 - 0.1 * (1 - Math.abs(spread))
    return [-0.47 - t * len, 0.005 * t, spread * (0.03 + t * 0.2), 1 + t * 0.35]
  }, 10, 8, 1)
  // Dorsal fin along the back.
  fin((s, t) => {
    const u = 0.3 + s * 0.32
    const x = 0.5 - u
    const h = (0.11 * Math.pow(Math.sin(Math.PI * (u * 1.04 + 0.04)), 0.75) + 0.012) * 0.72
    return [x - t * 0.04, h + t * 0.05 * Math.sin(Math.PI * s), 0, u]
  }, 8, 2, 0.6)
  // Pectorals, angled down and out.
  for (const side of [-1, 1]) {
    fin((s, t) => [0.3 - t * 0.11 - s * 0.03, -0.02 - t * 0.015, side * (0.07 + t * 0.12 + s * 0.02), 0.2], 4, 4, 0.8)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1))
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(fins, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ------------------------------------------------------------------ pads

// A lily pad: a disc with the notch cut out, cupped slightly, its rim turned
// up and waved.
export function padGeometry() {
  const R = 1
  const rings = 10
  const segs = 72
  const notch = 0.42
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  pos.push(0, 0.006, 0)
  uv.push(0.5, 0.5)
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * R
    for (let j = 0; j <= segs; j++) {
      const a = notch / 2 + (j / segs) * (Math.PI * 2 - notch)
      const lift = 0.04 * Math.pow(Math.max(r - 0.8, 0) / 0.2, 2) + 0.008 * Math.sin(a * 7) * r ** 3 - 0.01 * r * r
      pos.push(Math.cos(a) * r, 0.006 + lift, Math.sin(a) * r)
      uv.push(0.5 + Math.cos(a) * r * 0.5, 0.5 + Math.sin(a) * r * 0.5)
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j + 1, 1 + j)
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + (i - 1) * (segs + 1) + j
      const b = a + segs + 1
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// The pad's skin: deep green, paler and yellowing to the rim, radial veins
// from the centre, the waxy speckle of the leaf. And its veins as relief.
export function padMaterial() {
  const N = 1024
  const c = canvasOf(N, N)
  const g = c.getContext('2d')!
  const rng = mulberry32(77)
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2)
  grad.addColorStop(0, '#5d7a3a')
  grad.addColorStop(0.6, '#4a6b30')
  grad.addColorStop(0.9, '#6f8a3c')
  grad.addColorStop(1, '#a39a48')
  g.fillStyle = grad
  g.fillRect(0, 0, N, N)
  const bump = canvasOf(N, N)
  const b = bump.getContext('2d')!
  b.fillStyle = '#808080'
  b.fillRect(0, 0, N, N)
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2 + (rng() - 0.5) * 0.04
    const draw = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath()
      ctx.moveTo(N / 2, N / 2)
      const steps = 12
      for (let i = 1; i <= steps; i++) {
        const r = (i / steps) * N * 0.49
        ctx.lineTo(N / 2 + Math.cos(a + Math.sin(i * 0.7 + k) * 0.015) * r, N / 2 + Math.sin(a + Math.sin(i * 0.7 + k) * 0.015) * r)
      }
      ctx.stroke()
    }
    g.strokeStyle = `rgba(150, 175, 90, ${0.18 + rng() * 0.12})`
    g.lineWidth = 2
    draw(g)
    b.strokeStyle = 'rgba(190,190,190,0.8)'
    b.lineWidth = 3
    draw(b)
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rng() < 0.6 ? 'rgba(20, 40, 10, 0.12)' : 'rgba(200, 220, 140, 0.1)'
    g.fillRect(rng() * N, rng() * N, 2, 2)
  }
  // A few browned spots and a nibbled patch.
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(110, 80, 30, ${0.15 + rng() * 0.2})`
    g.beginPath()
    g.arc(N * (0.2 + rng() * 0.6), N * (0.2 + rng() * 0.6), 6 + rng() * 26, 0, Math.PI * 2)
    g.fill()
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const relief = new THREE.CanvasTexture(bump)
  // Waxy, but a leaf, not a mirror: a low sun on a glossier pad blooms into a white blot.
  return new THREE.MeshStandardMaterial({ map, bumpMap: relief, bumpScale: 1.2, roughness: 0.66, metalness: 0, envMapIntensity: 0.7, side: THREE.DoubleSide })
}

// ------------------------------------------------------------------ the pond

type Fish = { x: number; z: number; heading: number; turn: number; speed: number; depth: number; size: number; phase: number }

export function createPond({ small }: { small: boolean }) {
  const group = new THREE.Group()
  const rng = mulberry32(13)
  const time = { value: 0 }
  const stir = { value: 0 }
  const grow = { value: 0.6 }

  // ---- the floor: dark mud, pebbles
  {
    const N = 1024
    const c = canvasOf(N, N)
    const g = c.getContext('2d')!
    g.fillStyle = '#2a2414'
    g.fillRect(0, 0, N, N)
    for (let i = 0; i < 2600; i++) {
      const r = 2 + rng() * (rng() < 0.08 ? 16 : 5)
      g.fillStyle = `rgba(${90 + rng() * 60}, ${80 + rng() * 50}, ${50 + rng() * 40}, ${0.12 + rng() * 0.3})`
      g.beginPath()
      g.ellipse(rng() * N, rng() * N, r, r * (0.6 + rng() * 0.4), rng() * 3, 0, Math.PI * 2)
      g.fill()
    }
    const map = new THREE.CanvasTexture(c)
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.repeat.set(6, 6)
    const floorMat = new THREE.MeshStandardMaterial({ map, roughness: 1, color: 0xd8c898 })
    // Caustics: the sun focused by the moving surface into bright wandering lines.
    floorMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time
      shader.uniforms.uStir = stir
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFloor;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloor = (modelMatrix * vec4(position, 1.0)).xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uStir;
          varying vec2 vFloor;
          float caustic(vec2 p) {
            vec2 q = p;
            float c = 0.0;
            for (int i = 0; i < 3; i++) {
              q = vec2(q.x + sin(q.y * 1.7 + uTime * (0.6 + uStir)) * 0.45, q.y + cos(q.x * 1.5 - uTime * (0.5 + uStir)) * 0.45);
              c += 0.08 / (abs(sin(q.x * 3.1) * sin(q.y * 2.9)) + 0.05);
            }
            return clamp(c * 0.14 - 0.25, 0.0, 1.5);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.85, 0.95, 0.7) * caustic(vFloor * 1.6) * 0.32 * diffuseColor.rgb;',
        )
    }
    floorMat.customProgramCacheKey = () => 'pond-floor'
    const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64).rotateX(-Math.PI / 2), floorMat)
    floor.position.y = FLOOR_Y
    floor.receiveShadow = true
    group.add(floor)
  }

  // ---- weeds: blades in clumps, swaying (more when the water is stirred)
  const weedClumps: THREE.Vector3[] = []
  {
    const clumps = small ? 8 : 12
    const per = small ? 14 : 22
    const count = clumps * per
    const weeds = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.045, 1, 1, 12).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x3f5a22, roughness: 0.8, side: THREE.DoubleSide }),
      count,
    )
    const phase = new Float32Array(count)
    const d = new THREE.Object3D()
    let n = 0
    for (let c = 0; c < clumps; c++) {
      const a = rng() * Math.PI * 2
      const r = 2.2 + rng() * 5.5
      const cx = Math.cos(a) * r
      const cz = Math.sin(a) * r
      weedClumps.push(new THREE.Vector3(cx, FLOOR_Y + 0.4, cz))
      for (let k = 0; k < per; k++) {
        d.position.set(cx + (rng() - 0.5) * 0.7, FLOOR_Y, cz + (rng() - 0.5) * 0.7)
        d.rotation.set(0, rng() * Math.PI, 0)
        d.scale.set(0.8 + rng() * 0.8, 0.55 + rng() * 0.38, 1)
        d.updateMatrix()
        weeds.setMatrixAt(n, d.matrix)
        weeds.setColorAt(n, new THREE.Color().setHSL(0.22 + rng() * 0.06, 0.45, 0.18 + rng() * 0.12))
        phase[n] = rng() * 6.28
        n++
      }
    }
    weeds.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    const mat = weeds.material as THREE.MeshStandardMaterial
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time
      shader.uniforms.uStir = stir
      shader.uniforms.uGrow = grow
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;\nuniform float uStir;\nuniform float uGrow;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // Bad thoughts grow as the mind sours (each blade a little differently).
          transformed.y *= uGrow * (0.7 + 0.6 * fract(aPhase * 3.7));
          float h = transformed.y;
          float k = h * h * (0.12 + 0.22 * uStir);
          transformed.x += sin(uTime * (1.1 + uStir * 2.0) + aPhase + h * 2.6) * k;
          transformed.z += cos(uTime * (0.8 + uStir * 1.6) + aPhase * 1.3 + h * 2.1) * k * 0.7;`,
        )
    }
    mat.customProgramCacheKey = () => 'pond-weed'
    group.add(weeds)
  }

  // ---- koi, and the small fish that follow each one
  const koiCount = small ? 6 : 9
  const FOLLOW = 3
  const count = koiCount * (1 + FOLLOW)
  const koi = new THREE.InstancedMesh(koiGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide }), count)
  koi.frustumCulled = false
  koi.castShadow = true
  const swim = new Float32Array(count * 2) // phase, amplitude
  const seeds = new Float32Array(count)
  const swimAttr = new THREE.InstancedBufferAttribute(swim, 2)
  swimAttr.setUsage(THREE.DynamicDrawUsage)
  koi.geometry.setAttribute('aSwim', swimAttr)
  koi.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
  const fish: Fish[] = []
  // Kohaku (red on white), yamabuki (gold), showa (black and red on white), chagoi (bronze).
  const patches = [0xd8401c, 0xe36a1a, 0xc8321a, 0x1a1410, 0xe3a020]
  const bases = [0xf2eee6, 0xf2eee6, 0xefe8da, 0xe8b444, 0x9a6a3a]
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    const r = 1.2 + rng() * 4.8
    const isKoi = i < koiCount
    fish.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, heading: rng() * Math.PI * 2, turn: 0, speed: 0.3, depth: isKoi ? 0.12 + rng() * 0.2 : 0.18 + rng() * 0.2, size: isKoi ? 0.62 + rng() * 0.28 : 0.17 + rng() * 0.07, phase: rng() * 6.28 })
    if (isKoi) {
      const kind = Math.floor(rng() * patches.length)
      koi.setColorAt(i, new THREE.Color(patches[kind]))
      seeds[i] = kind + rng() * 0.9
    } else {
      // Plain little fish, bronze all over: no pattern of their own.
      koi.setColorAt(i, new THREE.Color(0x9a6a3a))
      seeds[i] = 4 + 0.95
    }
  }
  // Each small fish keeps to its koi, at its own place behind it.
  const leader = (i: number) => (i < koiCount ? -1 : (i - koiCount) % koiCount)
  const baseColors = bases.map((c) => new THREE.Color(c))
  const kmat = koi.material as THREE.MeshStandardMaterial
  kmat.onBeforeCompile = (shader) => {
    shader.uniforms.uBases = { value: baseColors }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aU;
        attribute float aFin;
        attribute vec2 aSwim;
        attribute float aSeed;
        varying vec3 vKoi;
        varying float vSeed;
        varying float vFin;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vKoi = position;
        vSeed = aSeed;
        vFin = aFin;
        // The swimming bend: a wave down the body, growing towards the tail.
        float s = aU;
        transformed.z += sin(aSwim.x - s * 5.0) * (0.015 + 0.07 * s * s) * aSwim.y;
        transformed.z += aFin * sin(aSwim.x * 1.7 + s * 8.0) * 0.02;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uBases[5];
        varying vec3 vKoi;
        varying float vSeed;
        varying float vFin;
        float kh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float kn(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(kh(i), kh(i + vec2(1.0, 0.0)), u.x), mix(kh(i + vec2(0.0, 1.0)), kh(i + vec2(1.0, 1.0)), u.x), u.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // The koi's pattern: its base colour, with patches of its patch colour
        // (vColor) laid over the back, never on the belly.
        int kind = int(floor(vSeed));
        vec3 base = uBases[0];
        for (int i = 1; i < 5; i++) if (i == kind) base = uBases[i];
        float n = kn(vKoi.xy * vec2(8.0, 16.0) + fract(vSeed) * 37.0) * 0.7 + kn(vKoi.xz * 22.0 + fract(vSeed) * 11.0) * 0.3;
        float back = smoothstep(-0.02, 0.05, vKoi.y);
        float spots = smoothstep(0.5, 0.56, n) * back;
        vec3 koiCol = mix(base, vColor.rgb, spots);
        // Fins: paler and thinner.
        koiCol = mix(koiCol, mix(base, vec3(1.0), 0.4), vFin * 0.6);
        diffuseColor.rgb = koiCol;
        diffuseColor.a = 1.0 - vFin * 0.25;`,
      )
  }
  kmat.customProgramCacheKey = () => 'pond-koi'
  group.add(koi)

  // ---- behaviour
  const wakes = new Float32Array(WAKES * 4)
  const d = new THREE.Object3D()
  let lastTime = -1

  // chaos: 0 calm … 1 a crowded, racing mind. calm: after the drop (0 … 1).
  // cursor: on the water (x, z) and how much it is moving. impact: seconds
  // since the drop landed (negative before).
  function update(now: number, chaos: number, calm: number, cursor: { x: number; z: number; strength: number; on: boolean }, impact: number, sour = 0) {
    // Never a negative step (the act is sometimes drawn out of order to warm it up).
    const dt = lastTime < 0 ? 0 : Math.min(Math.max(now - lastTime, 0), 0.05)
    lastTime = now
    time.value = now
    stir.value = Math.max(chaos, impact > 0 && impact < 2 ? 1 - impact / 2 : 0)
    grow.value = (0.55 + 1.0 * sour) * (1 - 0.65 * calm)
    const contain = 6.2 - chaos * 1.8
    const cruise = 0.22 + chaos * 0.85 - calm * 0.1
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i]
      // Wander.
      f.turn += (Math.random() - 0.5) * dt * (2.5 + chaos * 9)
      f.turn *= 1 - Math.min(dt * 1.5, 1)
      let steer = f.turn
      const r = Math.hypot(f.x, f.z)
      // Stay in the pond, and out of the lotus.
      if (r > contain) steer += wrap(Math.atan2(-f.z, -f.x) - f.heading) * 1.6
      if (r < 0.9) steer += wrap(Math.atan2(f.z, f.x) - f.heading) * 2.4
      // Keep a little apart.
      for (let j = 0; j < fish.length; j++) {
        if (j === i) continue
        const o = fish[j]
        const dx = f.x - o.x
        const dz = f.z - o.z
        const d2 = dx * dx + dz * dz
        if (d2 < 0.12 && d2 > 1e-6) steer += wrap(Math.atan2(dz, dx) - f.heading) * 0.8 * (1 - d2 / 0.12)
      }
      let target = cruise
      const lead = leader(i)
      if (lead >= 0) {
        // Follow the koi, at a place of its own a little behind it.
        const L = fish[lead]
        const slot = Math.floor((i - koiCount) / koiCount)
        const back = 0.32 + slot * 0.18
        const side = (slot - 1) * 0.16
        const tx = L.x - Math.cos(L.heading) * back - Math.sin(L.heading) * side
        const tz = L.z - Math.sin(L.heading) * back + Math.cos(L.heading) * side
        const dd = Math.hypot(tx - f.x, tz - f.z)
        steer = f.turn * 0.4 + wrap(Math.atan2(tz - f.z, tx - f.x) - f.heading) * 5
        target = L.speed * (0.8 + Math.min(dd, 1.5))
      }
      // The cursor: still, the koi come close to look; moving, everything darts off.
      const cx = f.x - cursor.x
      const cz = f.z - cursor.z
      const cd = Math.hypot(cx, cz)
      if (cursor.strength > 0.06 && cd < 1.4) {
        steer += wrap(Math.atan2(cz, cx) - f.heading) * 4 * (1 - cd / 1.4)
        target += 1.2 * (1 - cd / 1.4)
      } else if (cursor.on && lead < 0 && cd < 2.6 && cd > 0.35 && chaos < 0.5) {
        steer += wrap(Math.atan2(-cz, -cx) - f.heading) * 1.4 * (1 - cd / 2.6)
        target *= 0.7
      }
      // Scatter from the drop.
      if (impact > 0 && impact < 1.6) {
        const push = 1 - impact / 1.6
        steer += wrap(Math.atan2(f.z, f.x) - f.heading) * 5 * push
        target += 2.2 * push * Math.exp(-r * 0.25)
      }
      f.heading += steer * dt
      // A fish that has somehow left the pond comes back in from its edge.
      if (r > 9) {
        const a = Math.atan2(f.z, f.x)
        f.x = Math.cos(a) * 5
        f.z = Math.sin(a) * 5
        f.heading = a + Math.PI
      }
      f.speed += (target - f.speed) * Math.min(dt * 2, 1)
      f.x += Math.cos(f.heading) * f.speed * dt
      f.z += Math.sin(f.heading) * f.speed * dt
      f.phase += dt * (2.6 + f.speed * 13)
      swim[i * 2] = f.phase
      swim[i * 2 + 1] = 0.6 + Math.min(f.speed, 1.2) * 0.45
      d.position.set(f.x, -f.depth, f.z)
      d.rotation.set(0, -f.heading, 0)
      d.scale.setScalar(f.size)
      d.updateMatrix()
      koi.setMatrixAt(i, d.matrix)
      if (i < WAKES) wakes.set([f.x, f.z, f.speed * (0.35 + 0.65 * (1 - f.depth / 0.45)), 0], i * 4)
    }
    koi.instanceMatrix.needsUpdate = true
    swimAttr.needsUpdate = true
  }
  update(0, 0, 0, { x: 99, z: 99, strength: 0, on: false }, -1)

  // Where things are, for the notes drawn on the page beside them.
  const at = {
    koi: (i: number, out: THREE.Vector3) => out.set(fish[i % koiCount].x, -fish[i % koiCount].depth, fish[i % koiCount].z),
    follower: (i: number, out: THREE.Vector3) => {
      const f = fish[koiCount + (i % (count - koiCount))]
      return out.set(f.x, -f.depth, f.z)
    },
    weeds: weedClumps,
  }

  return { group, update, wakes, at }
}
