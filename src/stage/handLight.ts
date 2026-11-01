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
  // The voxels as a dense grid over the surface's bounds: a lookup is an
  // array read, not a hash, which is most of what this costs.
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < surface.length; i += 3) {
    x0 = Math.min(x0, surface[i]); x1 = Math.max(x1, surface[i])
    y0 = Math.min(y0, surface[i + 1]); y1 = Math.max(y1, surface[i + 1])
    z0 = Math.min(z0, surface[i + 2]); z1 = Math.max(z1, surface[i + 2])
  }
  const nx = Math.floor((x1 - x0) / VOXEL) + 1
  const ny = Math.floor((y1 - y0) / VOXEL) + 1
  const nz = Math.floor((z1 - z0) / VOXEL) + 1
  const grid = new Uint8Array(nx * ny * nz)
  for (let i = 0; i < surface.length; i += 3) {
    grid[Math.floor((surface[i] - x0) / VOXEL) + nx * (Math.floor((surface[i + 1] - y0) / VOXEL) + ny * Math.floor((surface[i + 2] - z0) / VOXEL))] = 1
  }
  const solid = {
    has(x: number, y: number, z: number) {
      const gx = Math.floor((x - x0) / VOXEL)
      const gy = Math.floor((y - y0) / VOXEL)
      const gz = Math.floor((z - z0) / VOXEL)
      if (gx < 0 || gy < 0 || gz < 0 || gx >= nx || gy >= ny || gz >= nz) return false
      return grid[gx + nx * (gy + ny * gz)] === 1
    },
  }

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
        if (solid.has(q.x, q.y, q.z)) {
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
          if (solid.has(q.x, q.y, q.z)) {
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
