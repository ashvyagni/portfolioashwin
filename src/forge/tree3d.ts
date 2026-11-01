import * as THREE from 'three'
import { TREE } from '../content/forge'
import { clamp01, easeInOut, mulberry32, smooth } from './ink'
import { sketchState } from './world'

// The tree of wisdom, grown: a real branching tree in a meadow at dusk. Its
// trunk flares into roots and is ridged with bark; its branches lean to the
// light; twigs thin to buds. As you scroll it grows — every ring of bark
// forms in order from the root up, so the branches extend rather than
// appear — buds swell and open into leaves (each unfolding along its
// midrib), and blossoms open after them. From a branch for each domain an
// ema hangs on a red cord, a paper slip beneath it. The camera climbs round
// it as it grows and ends looking up through the crown at the moon.

type Ring = { c: THREE.Vector3; r: number; birth: number }
type Spot = { p: THREE.Vector3; dir: THREE.Vector3; birth: number }
export type Tag = { group: THREE.Group; anchor: THREE.Vector3; birth: number; slip: THREE.Mesh; domain: (typeof TREE)[number]; swing: number }

const MAX_DEPTH = 5

export function createTree() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400)
  const sketch = sketchState()
  const rng = mulberry32(23)
  const grow = { value: 0 }
  const clock = { value: 0 }

  // ---- sky, light
  const skyGeo = new THREE.SphereGeometry(200, 32, 16)
  const skyCol: number[] = []
  const top = new THREE.Color('#4F72C0')
  const low = new THREE.Color('#F6CFA0')
  const p = skyGeo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const c = low.clone().lerp(top, smooth(-0.05, 0.6, p.getY(i) / 200))
    skyCol.push(c.r, c.g, c.b)
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3))
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })))
  scene.fog = new THREE.Fog('#E9D2B0', 40, 160)
  scene.add(new THREE.HemisphereLight('#FFE8C8', '#5B4A30', 1.2))
  const sun = new THREE.DirectionalLight('#FFD9A8', 2.6)
  sun.position.set(-18, 22, 14)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 })
  sun.shadow.bias = -0.0006
  scene.add(sun, sun.target)

  // ---- the meadow, the hills, the moon
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9AA66A', roughness: 1 }))
  ground.receiveShadow = true
  scene.add(ground)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng()
    const d = 70 + rng() * 40
    const hill = new THREE.Mesh(new THREE.SphereGeometry(18 + rng() * 22, 32, 16), new THREE.MeshStandardMaterial({ color: i % 2 ? '#8C9A64' : '#7E8A5C', roughness: 1 }))
    hill.scale.y = 0.18 + rng() * 0.12
    hill.position.set(Math.cos(a) * d, -4, Math.sin(a) * d)
    scene.add(hill)
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 48, 24), new THREE.MeshBasicMaterial({ color: '#FBF1D8', fog: false }))
  moon.position.set(-6, 46, -70)
  scene.add(moon)
  // Grass: thin blades about the tree, swaying.
  const blades = 6000
  const bladeGeo = new THREE.BufferGeometry()
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.012, 0, 0, 0.012, 0, 0, 0, 0.26, 0], 3))
  bladeGeo.computeVertexNormals()
  const grassMat = new THREE.MeshStandardMaterial({ color: '#A3B068', side: THREE.DoubleSide, roughness: 1 })
  grassMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = clock
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        transformed.x += sin(uTime * 1.3 + wp.x * 0.4 + wp.z * 0.3) * 0.12 * position.y;`)
  }
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, blades)
  const d = new THREE.Object3D()
  for (let i = 0; i < blades; i++) {
    const a = rng() * Math.PI * 2
    const r = 0.9 + Math.pow(rng(), 0.8) * 7
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    d.rotation.set(0, rng() * Math.PI, (rng() - 0.5) * 0.4)
    d.scale.setScalar(0.6 + rng() * 1.1)
    d.updateMatrix()
    grass.setMatrixAt(i, d.matrix)
  }
  scene.add(grass)

  // ---- the tree: branches as rings, grown in order
  const branches: Ring[][] = []
  const leafSpots: Spot[] = []
  const blossomSpots: Spot[] = []
  const anchors: { p: THREE.Vector3; birth: number; depth: number }[] = []
  const up = new THREE.Vector3(0, 1, 0)
  function branch(start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number, birth: number, dur: number) {
    const N = depth === 0 ? 22 : depth === 1 ? 14 : 9
    const rings: Ring[] = []
    const p0 = start.clone()
    const d0 = dir.clone().normalize()
    for (let k = 0; k <= N; k++) {
      const u = k / N
      rings.push({ c: p0.clone(), r: rad * (1 - u * (depth === 0 ? 0.55 : 0.7)) * (depth === 0 ? 1 + 1.4 * Math.pow(Math.max(0, 0.12 - u) / 0.12, 2) : 1), birth: birth + u * dur })
      // Lean to the light, droop with length on the thin ones, wander a little.
      d0.addScaledVector(up, depth === 0 ? 0.02 : 0.035 - depth * 0.012)
      d0.add(new THREE.Vector3((rng() - 0.5) * 0.12, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.12)).normalize()
      p0.addScaledVector(d0, len / N)
      if (depth >= 1 && k > 2) anchors.push({ p: rings[k].c.clone(), birth: rings[k].birth, depth })
      if (depth >= 3 && k >= 2) leafSpots.push({ p: rings[k].c.clone(), dir: d0.clone(), birth: rings[k].birth + 0.02 })
    }
    rings[N].r = Math.max(rad * 0.15, 0.008)
    branches.push(rings)
    if (depth >= MAX_DEPTH - 1) blossomSpots.push({ p: rings[N].c.clone(), dir: d0.clone(), birth: rings[N].birth + 0.08 })
    if (depth >= MAX_DEPTH) return
    const kids = depth === 0 ? 6 : depth === 1 ? 4 : 3
    for (let i = 0; i < kids; i++) {
      const at = depth === 0 ? 0.38 + (i / kids) * 0.6 : 0.3 + rng() * 0.65
      const k = Math.min(Math.round(at * N), N)
      const ring = rings[k]
      const around = (i / kids) * Math.PI * 2 + rng() * 1.2
      const spread = depth === 0 ? 0.85 + rng() * 0.25 : 0.55 + rng() * 0.4
      const side = new THREE.Vector3(Math.cos(around), 0, Math.sin(around))
      const cdir = dir.clone().normalize().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread)).normalize()
      branch(ring.c, cdir, len * (0.55 + rng() * 0.18) * (depth === 0 ? 1.15 - at * 0.5 : 1), ring.r * 0.72, depth + 1, ring.birth, dur * 0.72)
    }
    // Roots: from the trunk's foot, out and down into the ground.
    if (depth === 0) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng() * 0.4
        const rr: Ring[] = []
        const r0 = rad * 0.55
        for (let k = 0; k <= 8; k++) {
          const u = k / 8
          rr.push({ c: new THREE.Vector3(Math.cos(a) * (rad * 0.6 + u * rad * 5), 0.35 * rad * (1 - u) - u * u * 0.2, Math.sin(a) * (rad * 0.6 + u * rad * 5)), r: r0 * (1 - u * 0.85), birth: birth + u * 0.06 })
        }
        branches.push(rr)
      }
    }
  }
  branch(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0.04, 1, 0), 7.2, 0.46, 0, 0.0, 0.3)

  // One mesh for every branch: rings of bark, each vertex knowing its ring's
  // centre and when it forms.
  const wpos: number[] = []
  const nor: number[] = []
  const cen: number[] = []
  const prv: number[] = []
  const bir: number[] = []
  const idx: number[] = []
  const tmpN = new THREE.Vector3()
  branches.forEach((rings) => {
    const S = rings[0].r > 0.3 ? 18 : rings[0].r > 0.1 ? 10 : 6
    const base = wpos.length / 3
    rings.forEach((ring, k) => {
      const next = rings[Math.min(k + 1, rings.length - 1)].c
      const prev = rings[Math.max(k - 1, 0)].c
      const t = next.clone().sub(prev).normalize()
      const a = Math.abs(t.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0)
      const n1 = new THREE.Vector3().crossVectors(t, a).normalize()
      const n2 = new THREE.Vector3().crossVectors(t, n1).normalize()
      for (let j = 0; j <= S; j++) {
        const ang = (j / S) * Math.PI * 2
        // Bark: ridges running up the thick wood.
        const ridge = ring.r > 0.15 ? 1 + 0.07 * Math.sin(ang * 9 + k * 0.4) + 0.04 * Math.sin(ang * 23 + k) : 1
        tmpN.copy(n1).multiplyScalar(Math.cos(ang)).addScaledVector(n2, Math.sin(ang))
        const v = ring.c.clone().addScaledVector(tmpN, ring.r * ridge)
        wpos.push(v.x, v.y, v.z)
        nor.push(tmpN.x, tmpN.y, tmpN.z)
        cen.push(ring.c.x, ring.c.y, ring.c.z)
        const before = rings[Math.max(k - 1, 0)].c
        prv.push(before.x, before.y, before.z)
        bir.push(ring.birth)
      }
    })
    for (let k = 0; k < rings.length - 1; k++) {
      for (let j = 0; j < S; j++) {
        const a0 = base + k * (S + 1) + j
        const b0 = a0 + S + 1
        idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1)
      }
    }
  })
  const wood = new THREE.BufferGeometry()
  wood.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3))
  wood.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  wood.setAttribute('aCenter', new THREE.Float32BufferAttribute(cen, 3))
  wood.setAttribute('aBirth', new THREE.Float32BufferAttribute(bir, 1))
  wood.setAttribute('aPrev', new THREE.Float32BufferAttribute(prv, 3))
  wood.setIndex(idx)
  const growChunk = `#include <begin_vertex>
    // A ring not yet formed waits folded into the one before it, and grows
    // out of it: the branch lengthens from its tip.
    float gs = smoothstep(aBirth - 0.012, aBirth + 0.012, uGrow);
    transformed = mix(aPrev, aCenter, gs) + (transformed - aCenter) * mix(0.35, 1.0, gs) * step(aBirth - 0.012, uGrow);`
  const barkMat = new THREE.MeshStandardMaterial({ color: '#6A5038', roughness: 0.95 })
  const injectGrow = (m: THREE.Material, key: string) => {
    m.onBeforeCompile = (s) => {
      s.uniforms.uGrow = grow
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aCenter;\nattribute vec3 aPrev;\nattribute float aBirth;\nuniform float uGrow;').replace('#include <begin_vertex>', growChunk)
    }
    m.customProgramCacheKey = () => key
  }
  injectGrow(barkMat, 'tree-bark')
  const trunk = new THREE.Mesh(wood, barkMat)
  trunk.castShadow = true
  trunk.receiveShadow = true
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  injectGrow(depthMat, 'tree-bark-depth')
  trunk.customDepthMaterial = depthMat
  scene.add(trunk)

  // ---- leaves: buds that open, each blade unfolding along its midrib
  const leafGeo = (() => {
    const P: number[] = []
    const side: number[] = []
    const L = 0.34
    const W = 0.12
    const n = 6
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const u0 = i / n
        const u1 = (i + 1) / n
        const w0 = Math.sin(Math.PI * Math.pow(u0, 0.8)) * W * s
        const w1 = Math.sin(Math.PI * Math.pow(u1, 0.8)) * W * s
        P.push(0, 0, u0 * L, w0, 0.02 * Math.abs(w0) * 10, u0 * L, 0, 0, u1 * L)
        P.push(w0, 0.02 * Math.abs(w0) * 10, u0 * L, w1, 0.02 * Math.abs(w1) * 10, u1 * L, 0, 0, u1 * L)
        for (let k = 0; k < 6; k++) side.push(s)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
    g.computeVertexNormals()
    return g
  })()
  const leafBirth = new Float32Array(leafSpots.length)
  leafGeo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(leafBirth, 1))
  const leafMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 })
  leafMat.onBeforeCompile = (s) => {
    s.uniforms.uGrow = grow
    s.uniforms.uTime = clock
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBirth;\nattribute float aSide;\nuniform float uGrow;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float open = smoothstep(aBirth, aBirth + 0.06, uGrow);
        float bud = step(aBirth - 0.01, uGrow);
        // Folded along the midrib while a bud, opening flat.
        float fold = (1.0 - open) * 1.35 * aSide;
        float c = cos(fold), s2 = sin(fold);
        transformed.xy = vec2(transformed.x * c - transformed.y * s2, transformed.x * s2 + transformed.y * c);
        transformed *= bud * mix(0.18, 1.0, open);
        transformed.x += sin(uTime * 2.0 + aBirth * 50.0) * 0.015 * open;`,
      )
  }
  leafMat.customProgramCacheKey = () => 'tree-leaf'
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafSpots.length)
  const greens = ['#6F8F3E', '#7FA048', '#5E7F36', '#93AE55', '#A7B85A']
  leafSpots.forEach((s, i) => {
    d.position.copy(s.p)
    d.lookAt(s.p.clone().add(s.dir).add(new THREE.Vector3((rng() - 0.5) * 1.6, (rng() - 0.2) * 1.2, (rng() - 0.5) * 1.6)))
    d.rotateZ(rng() * Math.PI * 2)
    d.scale.setScalar(0.75 + rng() * 0.6)
    d.updateMatrix()
    leaves.setMatrixAt(i, d.matrix)
    leaves.setColorAt(i, new THREE.Color(greens[Math.floor(rng() * greens.length)]))
    leafBirth[i] = s.birth + rng() * 0.04
  })
  leaves.castShadow = true
  scene.add(leaves)

  // ---- blossoms at the tips, opening last
  const petalGeo = (() => {
    const P: number[] = []
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      const b = a + 0.5
      const c2 = a - 0.5
      const tip = [Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14]
      P.push(0, 0, 0, Math.cos(b) * 0.07, 0.03, Math.sin(b) * 0.07, ...tip)
      P.push(0, 0, 0, ...tip, Math.cos(c2) * 0.07, 0.03, Math.sin(c2) * 0.07)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.computeVertexNormals()
    return g
  })()
  const blossomBirth = new Float32Array(blossomSpots.length)
  petalGeo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(blossomBirth, 1))
  const blossomMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 })
  blossomMat.onBeforeCompile = (s) => {
    s.uniforms.uGrow = grow
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBirth;\nuniform float uGrow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float open = smoothstep(aBirth, aBirth + 0.07, uGrow);
        transformed.y *= mix(3.0, 1.0, open);
        transformed.xz *= mix(0.25, 1.0, open);
        transformed *= step(aBirth - 0.01, uGrow);`)
  }
  blossomMat.customProgramCacheKey = () => 'tree-blossom'
  const blossoms = new THREE.InstancedMesh(petalGeo, blossomMat, blossomSpots.length)
  blossomSpots.forEach((s, i) => {
    d.position.copy(s.p)
    d.rotation.set((rng() - 0.5) * 0.8, rng() * 6, (rng() - 0.5) * 0.8)
    d.scale.setScalar(0.9 + rng() * 0.7)
    d.updateMatrix()
    blossoms.setMatrixAt(i, d.matrix)
    blossoms.setColorAt(i, new THREE.Color(rng() < 0.6 ? '#F2B9C6' : '#FBEFF0'))
    blossomBirth[i] = s.birth
  })
  scene.add(blossoms)

  // ---- the ema: one for each domain, hung from branches up the tree
  const tagShape = new THREE.Shape()
  tagShape.moveTo(-0.5, 0)
  tagShape.lineTo(0.5, 0)
  tagShape.lineTo(0.5, 0.5)
  tagShape.lineTo(0, 0.68)
  tagShape.lineTo(-0.5, 0.5)
  tagShape.closePath()
  const tagGeo = new THREE.ExtrudeGeometry(tagShape, { depth: 0.05, bevelEnabled: false })
  tagGeo.translate(0, -0.68, -0.025)
  const tagMat = new THREE.MeshStandardMaterial({ color: '#D9AE70', roughness: 0.8 })
  const rimMat = new THREE.LineBasicMaterial({ color: '#C4271F' })
  const slipMat = new THREE.MeshStandardMaterial({ color: '#F5EFE2', roughness: 0.95, side: THREE.DoubleSide })
  const sorted = anchors.filter((a) => a.depth <= 2 && a.p.y > 2.4).sort((a, b) => a.p.y - b.p.y)
  const tags: Tag[] = TREE.map((domain, i) => {
    const pick = sorted[Math.floor(((i + 0.5) / TREE.length) * sorted.length)]
    const g = new THREE.Group()
    g.position.copy(pick.p)
    const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.5, 0)]), rimMat)
    const tag = new THREE.Mesh(tagGeo, tagMat)
    tag.position.y = -0.5
    tag.castShadow = true
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(tagGeo), rimMat)
    rim.position.y = -0.5
    const slip = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.3), slipMat)
    slip.position.y = -1.95
    g.add(cord, tag, rim, slip)
    g.scale.setScalar(0)
    scene.add(g)
    return { group: g, anchor: pick.p.clone(), birth: pick.birth + 0.03, slip, domain, swing: rng() * 6 }
  })

  // ---- the camera, climbing round as it grows (measured against the tree it grew)
  let treeTop = 0
  branches.forEach((rings) => rings.forEach((r) => (treeTop = Math.max(treeTop, r.c.y))))
  const pos = new THREE.Vector3()
  const look = new THREE.Vector3()
  const endPos = new THREE.Vector3(6, treeTop * 0.16, treeTop * 2.7)
  const endLook = new THREE.Vector3(0, treeTop * 0.68, 0)
  // The moon hangs just over the crown, as seen from where the climb ends.
  moon.position.copy(endPos).add(new THREE.Vector3(-0.6, treeTop * 1.12, 0).sub(endPos).normalize().multiplyScalar(110))

  // k: 0 … 1 through the tree's part of the scroll.
  function update(k: number, time: number) {
    clock.value = time
    grow.value = k * 1.08
    const climb = smooth(0.02, 0.85, k)
    const a = -0.5 + k * Math.PI * 1.7
    const rad = treeTop * (0.95 - 0.25 * Math.sin(k * Math.PI))
    const h = 1.2 + treeTop * 0.72 * climb
    pos.set(Math.sin(a) * rad, h, Math.cos(a) * rad)
    look.set(0, h * 0.92, 0)
    const end = easeInOut(clamp01((k - 0.88) / 0.12))
    pos.lerp(endPos, end)
    look.lerp(endLook, end)
    camera.position.copy(pos)
    camera.lookAt(look)
    tags.forEach((t, i) => {
      const s = smooth(t.birth, t.birth + 0.04, grow.value)
      t.group.scale.setScalar(s * 0.5)
      t.group.rotation.z = Math.sin(time * 1.2 + t.swing) * 0.08
      t.group.rotation.y = Math.sin(time * 0.6 + i) * 0.3 + Math.atan2(camera.position.x - t.anchor.x, camera.position.z - t.anchor.z)
    })
    // The world sketches itself in, then paint spreads up from its roots.
    sketch.draw = 0.3 + 0.7 * smooth(0, 0.1, k)
    sketch.colour = 0.15 + 0.85 * smooth(0.08, 0.6, k)
    sketch.enlight = 0.55
    sketch.dark = 0
    sketch.glitch = 0
  }

  return { scene, camera, sketch, update, tags, moon }
}
