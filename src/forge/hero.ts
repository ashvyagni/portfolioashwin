import * as THREE from 'three'

// Ashwin, as a figure: swept black hair, a long black coat whose tails fly
// out behind him, black trousers, boots, and a long vermilion scarf that
// streams in the wind (simulated, link by link). A hand-built rig — hips,
// spine, chest, head; shoulders, elbows; hips, knees — posed by blending
// toward a pose each frame: standing, running, leaping, crouched (riding),
// falling. Drawn either through the sketch pass (lit) or as a cel (toon,
// with an inked outline), so he belongs to whichever world he is in.

export type HeroMode = 'idle' | 'run' | 'jump' | 'ride' | 'fall' | 'land' | 'hang' | 'swing' | 'dive' | 'tuck'

const SKIN = '#C08A68'
const HAIR = '#0B0A0D'
const COAT = '#1A181F'
const CLOTH = '#222027'
const BOOT = '#0F0E12'
const SCARF = '#C8231B'

type J = {
  hipsY: number
  lean: number
  twist: number
  headYaw: number
  headPitch: number
  shL: number
  shR: number
  shOutL: number
  shOutR: number
  elL: number
  elR: number
  thL: number
  thR: number
  thOutL: number
  thOutR: number
  knL: number
  knR: number
}
const keys: (keyof J)[] = ['hipsY', 'lean', 'twist', 'headYaw', 'headPitch', 'shL', 'shR', 'shOutL', 'shOutR', 'elL', 'elR', 'thL', 'thR', 'thOutL', 'thOutR', 'knL', 'knR']
const zero = (): J => Object.fromEntries(keys.map((k) => [k, 0])) as J

export function createHero({ toon = false }: { toon?: boolean } = {}) {
  const ramp = (() => {
    const t = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]), 3, 1)
    t.minFilter = t.magFilter = THREE.NearestFilter
    t.needsUpdate = true
    return t
  })()
  const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    toon ? new THREE.MeshToonMaterial({ color, gradientMap: ramp }) : new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra })
  const inkMat = new THREE.MeshBasicMaterial({ color: '#050405', side: THREE.BackSide })
  const outlined: THREE.Mesh[] = []
  // A part, and (for the cel look) its inked hull.
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, at: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(...at)
    mesh.castShadow = true
    parent.add(mesh)
    if (toon) {
      const hull = new THREE.Mesh(geo, inkMat)
      hull.scale.setScalar(1.08)
      mesh.add(hull)
      outlined.push(hull)
    }
    return mesh
  }
  const joint = (parent: THREE.Object3D, at: [number, number, number]) => {
    const g = new THREE.Group()
    g.position.set(...at)
    parent.add(g)
    return g
  }

  const root = new THREE.Group()
  const hips = joint(root, [0, 0.95, 0])
  const spine = joint(hips, [0, 0.05, 0])
  const chest = joint(spine, [0, 0.3, 0])
  const neck = joint(chest, [0, 0.24, 0])
  const head = joint(neck, [0, 0.08, 0])
  const coatM = mat(COAT)
  const clothM = mat(CLOTH)
  const skinM = mat(SKIN)
  const hairM = mat(HAIR, { roughness: 0.4 })
  // Torso: the coat over the chest and belly, broad at the shoulders.
  part(new THREE.CapsuleGeometry(0.16, 0.26, 6, 14).scale(1.25, 1, 0.8), coatM, spine, [0, 0.2, 0])
  part(new THREE.CapsuleGeometry(0.17, 0.12, 6, 14).scale(1.35, 1, 0.82), coatM, chest, [0, 0.06, 0])
  // The coat's collar, turned up.
  part(new THREE.CylinderGeometry(0.11, 0.14, 0.12, 16, 1, true), coatM, chest, [0, 0.21, 0])
  // Neck, head.
  part(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skinM, neck, [0, 0.0, 0])
  part(new THREE.SphereGeometry(0.115, 20, 16).scale(0.92, 1.08, 1), skinM, head, [0, 0.1, 0.01])
  // Hair: a swept mass, spikes falling back and a fringe over the brow.
  part(new THREE.SphereGeometry(0.125, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.02, 1.08), hairM, head, [0, 0.13, -0.008])
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.4
    const spike = part(new THREE.ConeGeometry(0.04, 0.17, 8), hairM, head, [Math.sin(a) * 0.09, 0.17 - Math.abs(a) * 0.02, -Math.cos(a) * 0.07])
    spike.rotation.set(-2.2 + Math.abs(a) * 0.1, 0, -a * 0.35)
  }
  for (let i = 0; i < 4; i++) {
    const f = part(new THREE.ConeGeometry(0.03, 0.12, 6), hairM, head, [-0.06 + i * 0.04, 0.17, 0.09])
    f.rotation.set(0.5 + (i % 2) * 0.2, 0, 0.3 - i * 0.2)
  }
  // Arms.
  const arm = (side: number) => {
    const sh = joint(chest, [side * 0.22, 0.13, 0])
    part(new THREE.CapsuleGeometry(0.055, 0.22, 4, 10), coatM, sh, [0, -0.15, 0])
    const el = joint(sh, [0, -0.3, 0])
    part(new THREE.CapsuleGeometry(0.048, 0.2, 4, 10), coatM, el, [0, -0.13, 0])
    part(new THREE.SphereGeometry(0.05, 10, 8).scale(0.8, 1.1, 0.6), skinM, el, [0, -0.3, 0.01])
    const hand = joint(el, [0, -0.31, 0.01])
    return { sh, el, hand }
  }
  const L = arm(1)
  const R = arm(-1)
  // Legs.
  const leg = (side: number) => {
    const th = joint(hips, [side * 0.1, 0, 0])
    part(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), clothM, th, [0, -0.22, 0])
    const kn = joint(th, [0, -0.45, 0])
    part(new THREE.CapsuleGeometry(0.06, 0.32, 4, 10), clothM, kn, [0, -0.2, 0])
    // A boot: a rounded toe cap on a heel, not a brick.
    part(new THREE.CapsuleGeometry(0.052, 0.14, 6, 12).rotateX(Math.PI / 2).scale(1, 0.8, 1), mat(BOOT), kn, [0, -0.43, 0.06])
    part(new THREE.CylinderGeometry(0.058, 0.062, 0.1, 12), mat(BOOT), kn, [0, -0.39, 0])
    return { th, kn }
  }
  const LL = leg(1)
  const LR = leg(-1)
  // The coat's skirt, hanging from the waist to the knee, open at the front;
  // and two tails behind that the wind lifts.
  part(new THREE.CylinderGeometry(0.2, 0.27, 0.42, 18, 1, true, Math.PI * 0.18, Math.PI * 1.64).scale(1, 1, 0.82), mat(COAT, { side: THREE.DoubleSide }), hips, [0, -0.18, 0])
  const tails = [-1, 1].map((side) => {
    const hinge = joint(hips, [side * 0.09, 0.02, -0.17])
    const g = new THREE.PlaneGeometry(0.17, 0.62, 1, 6).translate(0, -0.31, 0)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(-p.getY(i) / 0.62, 2) * 0.06)
    g.computeVertexNormals()
    part(g, mat(COAT, { side: THREE.DoubleSide }), hinge)
    return hinge
  })

  // The scarf: a chain of links from the back of the neck, simulated.
  const LINKS = 16
  const LINK = 0.085
  const links = Array.from({ length: LINKS }, () => ({ p: new THREE.Vector3(), prev: new THREE.Vector3() }))
  const scarfGeo = new THREE.BufferGeometry()
  const scarfPos = new Float32Array(LINKS * 2 * 3)
  scarfGeo.setAttribute('position', new THREE.BufferAttribute(scarfPos, 3))
  const idx: number[] = []
  for (let i = 0; i < LINKS - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  scarfGeo.setIndex(idx)
  const scarfMat = toon ? new THREE.MeshToonMaterial({ color: SCARF, gradientMap: ramp, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: SCARF, roughness: 0.8, side: THREE.DoubleSide })
  const scarf = new THREE.Mesh(scarfGeo, scarfMat)
  scarf.frustumCulled = false
  scarf.castShadow = true
  // The wrap round the neck.
  part(new THREE.TorusGeometry(0.085, 0.035, 8, 20).rotateX(Math.PI / 2), scarfMat, chest, [0, 0.2, 0])
  let scarfReady = false

  // The sword: a katana in a black scabbard across his back, drawn when
  // he needs it. Built along +y from the grip: handle, guard, blade.
  const sword = new THREE.Group()
  const steel = toon ? new THREE.MeshToonMaterial({ color: '#D6DBE2', gradientMap: ramp, emissive: '#FF6A1A', emissiveIntensity: 0 }) : new THREE.MeshStandardMaterial({ color: '#D6DBE2', metalness: 0.9, roughness: 0.22, emissive: '#FF6A1A', emissiveIntensity: 0 })
  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(-0.014, 0)
  bladeShape.quadraticCurveTo(-0.02, 0.4, -0.006, 0.78)
  bladeShape.lineTo(0.016, 0.72)
  bladeShape.quadraticCurveTo(0.018, 0.36, 0.014, 0)
  bladeShape.closePath()
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 16 })
  bladeGeo.translate(0, 0.13, -0.003)
  part(bladeGeo, steel, sword)
  part(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 20), mat('#B08A3E', { metalness: 0.8, roughness: 0.3 }), sword, [0, 0.125, 0])
  part(new THREE.CylinderGeometry(0.017, 0.019, 0.24, 10), mat('#2A0E0C'), sword, [0, 0.0, 0])
  const swordTip = new THREE.Object3D()
  swordTip.position.set(0, 0.9, 0)
  sword.add(swordTip)
  const backMount = joint(chest, [-0.15, 0.2, -0.17])
  backMount.rotation.set(0, 0, -2.62)
  part(new THREE.CylinderGeometry(0.026, 0.02, 0.8, 10), mat('#121014'), backMount, [0, 0.53, 0])
  const handMount = joint(R.hand, [0, -0.02, 0])
  handMount.rotation.set(Math.PI, 0, 0)
  backMount.add(sword)
  function setSword(where: 'back' | 'hand', heat = 0) {
    const to = where === 'hand' ? handMount : backMount
    if (sword.parent !== to) to.add(sword)
    steel.emissiveIntensity = heat
  }

  const cur = zero()
  const tgt = zero()
  const anchor = new THREE.Vector3()
  const wind = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const side = new THREE.Vector3()

  function target(mode: HeroMode, phase: number, t: number) {
    Object.assign(tgt, zero())
    const s = Math.sin(phase)
    const c = Math.cos(phase)
    if (mode === 'idle') {
      tgt.hipsY = Math.sin(t * 1.6) * 0.006
      tgt.shOutL = 0.12
      tgt.shOutR = -0.12
      tgt.elL = tgt.elR = 0.15
      tgt.headYaw = Math.sin(t * 0.4) * 0.3
      tgt.headPitch = Math.sin(t * 0.3) * 0.06
      tgt.lean = Math.sin(t * 1.6) * 0.01
    } else if (mode === 'run') {
      // Sprinting: leaning in, arms pumping, knees driving.
      tgt.lean = 0.42
      tgt.hipsY = -0.04 + Math.abs(s) * 0.06
      tgt.twist = s * 0.18
      tgt.thL = s * 1.0 - 0.15
      tgt.thR = -s * 1.0 - 0.15
      tgt.knL = Math.max(0, -c) * 1.6 + 0.2
      tgt.knR = Math.max(0, c) * 1.6 + 0.2
      tgt.shL = -s * 1.1
      tgt.shR = s * 1.1
      tgt.elL = 1.4
      tgt.elR = 1.4
      tgt.shOutL = 0.1
      tgt.shOutR = -0.1
      tgt.headPitch = -0.3
    } else if (mode === 'jump') {
      // Airborne: knees tucked, one arm flung forward, the other back.
      tgt.lean = 0.25
      tgt.thL = -1.4
      tgt.thR = -0.6
      tgt.knL = 1.9
      tgt.knR = 1.2
      tgt.shL = -2.2
      tgt.shR = 1.0
      tgt.elL = 0.3
      tgt.elR = 0.6
      tgt.shOutL = 0.3
      tgt.shOutR = -0.5
      tgt.headPitch = -0.2
    } else if (mode === 'land') {
      tgt.hipsY = -0.32
      tgt.lean = 0.55
      tgt.thL = tgt.thR = -1.2
      tgt.knL = tgt.knR = 1.9
      tgt.shL = -0.4
      tgt.shR = 0.6
      tgt.shOutL = 0.6
      tgt.shOutR = -0.6
      tgt.elL = tgt.elR = 0.5
    } else if (mode === 'ride') {
      // Crouched on Matsya's back, one hand down to its paper.
      tgt.hipsY = -0.36
      tgt.lean = 0.5
      tgt.thL = -1.3
      tgt.thR = -0.9
      tgt.thOutL = 0.2
      tgt.thOutR = -0.2
      tgt.knL = 2.0
      tgt.knR = 1.6
      tgt.shL = -0.9
      tgt.shR = 0.2
      tgt.shOutL = 0.2
      tgt.shOutR = -0.9
      tgt.elL = 0.3
      tgt.elR = 0.4
      tgt.headPitch = -0.15
      tgt.twist = Math.sin(t * 2) * 0.05
    } else if (mode === 'hang') {
      // Hanging off the blade driven in above him: sword arm up, the other
      // out for balance, a boot braced against the rock.
      tgt.shR = -2.75
      tgt.elR = 0.15
      tgt.shL = -0.9
      tgt.shOutL = 0.7
      tgt.elL = 0.6
      tgt.thL = -1.0
      tgt.knL = 1.5
      tgt.thR = -0.35
      tgt.knR = 0.7
      tgt.lean = -0.1
      tgt.headPitch = 0.45
      tgt.twist = -0.15
    } else if (mode === 'swing') {
      // Both hands on the rope above, legs driving the swing.
      tgt.shL = tgt.shR = -2.95
      tgt.elL = tgt.elR = 0.12
      tgt.thL = -0.55 + Math.sin(t * 3) * 0.25
      tgt.thR = -0.35 + Math.sin(t * 3 + 0.6) * 0.25
      tgt.knL = 0.6
      tgt.knR = 0.9
      tgt.headPitch = 0.1
    } else if (mode === 'dive') {
      // Head first, a fist driven ahead, the other arm swept back.
      tgt.shR = -3.0
      tgt.elR = 0
      tgt.shL = 0.5
      tgt.shOutL = 0.25
      tgt.elL = 0.2
      tgt.thL = 0.1
      tgt.thR = -0.15
      tgt.knL = 0.2
      tgt.knR = 0.5
      tgt.headPitch = -0.5
    } else if (mode === 'tuck') {
      tgt.thL = tgt.thR = -2.1
      tgt.knL = tgt.knR = 2.4
      tgt.shL = tgt.shR = -1.1
      tgt.elL = tgt.elR = 1.7
      tgt.lean = 0.55
      tgt.headPitch = -0.3
    } else if (mode === 'fall') {
      // Falling: spread, slowly turning, everything lifting.
      tgt.lean = -0.25 + Math.sin(t * 0.7) * 0.1
      tgt.shOutL = 1.6 + Math.sin(t * 1.3) * 0.15
      tgt.shOutR = -1.6 - Math.sin(t * 1.1) * 0.15
      tgt.shL = -0.3
      tgt.shR = -0.3
      tgt.elL = tgt.elR = 0.4
      tgt.thOutL = 0.35
      tgt.thOutR = -0.35
      tgt.thL = -0.3 + Math.sin(t * 0.9) * 0.15
      tgt.thR = 0.2 - Math.sin(t * 0.9) * 0.15
      tgt.knL = 0.8
      tgt.knR = 0.4
      tgt.headPitch = 0.3
    }
  }

  function apply() {
    hips.position.y = 0.95 + cur.hipsY
    spine.rotation.set(cur.lean, cur.twist, 0)
    chest.rotation.set(cur.lean * 0.3, cur.twist, 0)
    head.rotation.set(cur.headPitch - cur.lean * 0.6, cur.headYaw - cur.twist * 1.2, 0)
    L.sh.rotation.set(cur.shL, 0, cur.shOutL)
    R.sh.rotation.set(cur.shR, 0, cur.shOutR)
    L.el.rotation.set(-cur.elL, 0, 0)
    R.el.rotation.set(-cur.elR, 0, 0)
    LL.th.rotation.set(cur.thL, 0, cur.thOutL)
    LR.th.rotation.set(cur.thR, 0, cur.thOutR)
    LL.kn.rotation.set(cur.knL, 0, 0)
    LR.kn.rotation.set(cur.knR, 0, 0)
  }

  // Each frame: mode and run phase; velocity in world units/s (for the wind
  // in the coat and scarf); dt.
  function update(dt: number, mode: HeroMode, phase: number, velocity: THREE.Vector3, time: number, blend = 10) {
    target(mode, phase, time)
    const k = 1 - Math.exp(-dt * blend)
    for (const key of keys) cur[key] += (tgt[key] - cur[key]) * k
    apply()
    root.updateMatrixWorld(true)
    // The wind the body feels: its own speed, and a gust.
    wind.copy(velocity).multiplyScalar(-1)
    const speed = wind.length()
    const gust = Math.sin(time * 7.3) * 0.5 + Math.sin(time * 13.1) * 0.3
    tails.forEach((h, i) => {
      h.rotation.x = -Math.min(0.2 + speed * 0.09 + (mode === 'fall' ? 1.2 : 0) + gust * 0.12 * Math.min(speed, 4) / 4, 1.5) - i * 0.05
      h.rotation.z = (i ? 1 : -1) * (0.1 + gust * 0.05)
    })
    // The scarf: verlet links, pinned at the back of the neck.
    chest.localToWorld(anchor.set(0, 0.2, -0.09))
    // A cut or a teleport: the scarf starts again rather than stretch across.
    if (anchor.distanceTo(links[0].p) > 1.2) scarfReady = false
    if (!scarfReady) {
      links.forEach((l, i) => {
        l.p.copy(anchor).add(tmp.set(0, -i * LINK, -0.01 * i))
        l.prev.copy(l.p)
      })
      scarfReady = true
    }
    const step = Math.min(dt, 1 / 30)
    const grav = mode === 'fall' ? 0.6 : 3.2
    links.forEach((l, i) => {
      if (i === 0) {
        l.p.copy(anchor)
        l.prev.copy(anchor)
        return
      }
      const v = tmp.copy(l.p).sub(l.prev).multiplyScalar(0.97)
      l.prev.copy(l.p)
      l.p.add(v)
      l.p.y -= grav * step * step
      // Blown back by the speed, fluttering along its length.
      l.p.addScaledVector(wind, step * step * 6)
      l.p.x += Math.sin(time * 9 + i * 0.7) * step * 0.04 * (1 + speed * 0.3)
      l.p.y += Math.cos(time * 11 + i * 0.9) * step * 0.04 * (1 + speed * 0.3)
    })
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < LINKS; i++) {
        const a = links[i - 1].p
        const b = links[i].p
        const d = tmp.copy(b).sub(a)
        const len = d.length() || 1e-5
        b.copy(a).addScaledVector(d, LINK / len)
      }
    }
    // As a ribbon: each link's two edges, the width across its run.
    root.updateMatrixWorld()
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    for (let i = 0; i < LINKS; i++) {
      const a = links[Math.max(i - 1, 0)].p
      const b = links[Math.min(i + 1, LINKS - 1)].p
      const dir = tmp.copy(b).sub(a).normalize()
      side.set(0, 1, 0).cross(dir)
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
      side.normalize().multiplyScalar(0.07 * (1 - (i / LINKS) * 0.3))
      const p0 = links[i].p.clone().add(side).applyMatrix4(inv)
      const p1 = links[i].p.clone().sub(side).applyMatrix4(inv)
      scarfPos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], i * 6)
    }
    ;(scarfGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    scarfGeo.computeVertexNormals()
  }
  root.add(scarf)

  const handWorld = (out: THREE.Vector3) => R.hand.getWorldPosition(out)
  const tipWorld = (out: THREE.Vector3) => swordTip.getWorldPosition(out)
  return { group: root, update, head, resetScarf: () => (scarfReady = false), setSword, handWorld, tipWorld }
}
