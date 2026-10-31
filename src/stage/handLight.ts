import * as THREE from 'three'

// Baked lighting for the dot hand: ambient occlusion (how enclosed each dot is)
// and a hard-ish shadow from the key light, both traced through a voxelised
// copy of the surface. Computed once, after the dots are placed.

const VOXEL = 0.025
const JITTER = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, -0.04, 0.02), new THREE.Vector3(-0.05, 0.05, -0.02)]

export function bakeLighting(
  dots: Float32Array,
  normals: Float32Array,
  surface: Float32Array,
  light: THREE.Vector3,
) {
  const key = (x: number, y: number, z: number) =>
    (Math.floor(x / VOXEL) * 73856093) ^ (Math.floor(y / VOXEL) * 19349663) ^ (Math.floor(z / VOXEL) * 83492791)
  const solid = new Set<number>()
  for (let i = 0; i < surface.length; i += 3) solid.add(key(surface[i], surface[i + 1], surface[i + 2]))

  // A fixed fan of hemisphere directions around +Z, rotated onto each normal.
  const fan: THREE.Vector3[] = []
  for (let i = 0; i < 14; i++) {
    const u = (i + 0.5) / 14
    const phi = i * 2.399963
    const r = Math.sqrt(u)
    fan.push(new THREE.Vector3(r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)))
  }
  const reach = [0.035, 0.07, 0.12, 0.19, 0.28]

  const count = dots.length / 3
  const ao = new Float32Array(count)
  const shadow = new Float32Array(count)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const q = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const align = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 0, 1)

  for (let i = 0; i < count; i++) {
    p.fromArray(dots, i * 3)
    n.fromArray(normals, i * 3)
    align.setFromUnitVectors(up, n)

    let blocked = 0
    for (const f of fan) {
      dir.copy(f).applyQuaternion(align)
      for (let s = 0; s < reach.length; s++) {
        q.copy(p).addScaledVector(n, 0.055).addScaledVector(dir, reach[s])
        if (solid.has(key(q.x, q.y, q.z))) {
          blocked += 1 - s / reach.length
          break
        }
      }
    }
    ao[i] = 1 - Math.min(blocked / (fan.length * 0.6), 1)

    // Three rays a little apart towards the key light give soft-edged shadows.
    // They start clear of the surface's own voxels so nothing shadows itself.
    let lit = 0
    for (const jitter of JITTER) {
      dir.copy(light).add(jitter).normalize()
      let ray = 1
      if (n.dot(dir) > -0.1) {
        for (let d = 0.07; d < 1.4; d += 0.02) {
          q.copy(p).addScaledVector(n, 0.06).addScaledVector(dir, d)
          if (solid.has(key(q.x, q.y, q.z))) {
            ray = 0.22
            break
          }
        }
      }
      lit += ray / JITTER.length
    }
    shadow[i] = lit
  }
  return { ao, shadow }
}
