import * as THREE from 'three'
import { CHAINS } from './handModel'

// Anatomical surface detail for the sampled hand, placed from the posed joint
// frames: knuckle bumps, tendon ridges across the back of the hand, nails with
// a cuticle arc, knuckle wrinkles and palm-side flexion creases.
//
// Works in the rig's own space (metres). Joint frames follow the WebXR
// convention: X lateral, +Y out of the back of the hand, -Z towards the tip.

type Segment = {
  chain: number
  index: number // 0 = metacarpal … last = distal phalanx
  last: boolean
  a: THREE.Vector3
  b: THREE.Vector3
  axis: THREE.Vector3
  len: number
  lateral: THREE.Vector3
  dorsal: THREE.Vector3
  radius: number
}

export type Detail = {
  positions: Float32Array
  normals: Float32Array
  nail: Float32Array
  knuckle: Float32Array
  crease: Float32Array
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1)
  return t * t * (3 - 2 * t)
}

// The back-of-finger direction is taken from the first joint's frame and then
// carried down the finger by parallel transport, so it follows the curl
// regardless of how the rig rolls its later joints.
function buildSegments(joints: Map<string, THREE.Matrix4>): Segment[] {
  const segments: Segment[] = []
  CHAINS.forEach((chain, c) => {
    let prevAxis: THREE.Vector3 | null = null
    let dorsal = new THREE.Vector3().setFromMatrixColumn(joints.get(chain[0])!, 1)
    for (let i = 0; i < chain.length - 1; i++) {
      const a = new THREE.Vector3().setFromMatrixPosition(joints.get(chain[i])!)
      const b = new THREE.Vector3().setFromMatrixPosition(joints.get(chain[i + 1])!)
      const axis = b.clone().sub(a)
      const len = axis.length()
      axis.normalize()
      if (prevAxis) dorsal = dorsal.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(prevAxis, axis))
      dorsal = dorsal.clone().addScaledVector(axis, -dorsal.dot(axis)).normalize()
      const lateral = new THREE.Vector3().crossVectors(dorsal, axis).normalize()
      segments.push({ chain: c, index: i, last: i === chain.length - 2, a, b, axis, len, lateral, dorsal, radius: 0 })
      prevAxis = axis
    }
  })
  return segments
}

export function addAnatomy(
  positions: Float32Array,
  normals: Float32Array,
  joints: Map<string, THREE.Matrix4>,
): Detail {
  const count = positions.length / 3
  const segments = buildSegments(joints)

  // Nearest segment for every sample, and each segment's typical radius.
  const owner = new Int16Array(count)
  const along = new Float32Array(count)
  const radial = new Float32Array(count)
  const sums = new Float32Array(segments.length)
  const hits = new Float32Array(segments.length)
  const p = new THREE.Vector3()
  const d = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    p.fromArray(positions, i * 3)
    let best = 1e9
    let bestS = 0
    let bestT = 0
    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s]
      const t = Math.min(Math.max(d.copy(p).sub(seg.a).dot(seg.axis), 0), seg.len)
      const dist = d.copy(seg.a).addScaledVector(seg.axis, t).distanceTo(p)
      if (dist < best) {
        best = dist
        bestS = s
        bestT = t
      }
    }
    owner[i] = bestS
    along[i] = bestT
    radial[i] = best
    const rel = bestT / segments[bestS].len
    if (rel > 0.2 && rel < 0.8) {
      sums[bestS] += best
      hits[bestS] += 1
    }
  }
  segments.forEach((s, i) => (s.radius = hits[i] > 0 ? sums[i] / hits[i] : 0.008))

  const nail = new Float32Array(count)
  const knuckle = new Float32Array(count)
  const crease = new Float32Array(count)
  const n = new THREE.Vector3()
  const rel = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    const seg = segments[owner[i]]
    p.fromArray(positions, i * 3)
    n.fromArray(normals, i * 3)
    const r = seg.radius
    const centre = d.copy(seg.a).addScaledVector(seg.axis, along[i])
    rel.copy(p).sub(centre)
    const x = rel.dot(seg.lateral)
    const y = rel.dot(seg.dorsal)
    const back = y / Math.max(radial[i], 1e-6) // -1 palm side … 1 back of the hand
    const isThumb = seg.chain === 0
    const metacarpal = seg.index === 0
    let raise = 0

    // Knuckle bumps: the joint at the start of this bone, and the one at its end.
    for (const [joint, size] of [
      [seg.a, metacarpal ? 0 : seg.index === 1 ? 1 : 0.6],
      [seg.b, metacarpal && !isThumb ? 1 : seg.index === 1 ? 0.6 : 0],
    ] as const) {
      if (size === 0) continue
      const top = d.copy(joint).addScaledVector(seg.dorsal, r)
      const k = Math.exp(-p.distanceToSquared(top) / (r * r * 0.6)) * size
      knuckle[i] = Math.max(knuckle[i], k)
      raise += k * 0.22 * r
    }

    // Tendons fanning from the wrist to each knuckle on the back of the hand.
    if (metacarpal && !isThumb && back > 0.2) {
      const t = along[i] / seg.len
      const band = 1 - smooth(0, 0.4 * r, Math.abs(x))
      const ridge = band * smooth(0.12, 0.35, t) * (1 - smooth(0.85, 1, t))
      raise += ridge * 0.1 * r
      knuckle[i] = Math.max(knuckle[i], ridge * 0.35)
    }

    // Wrinkles and creases at the finger joints (both ends of phalanges).
    if (!metacarpal) {
      for (const [joint, atStart] of [
        [seg.a, true],
        [seg.b, false],
      ] as const) {
        if (!atStart && seg.last) continue
        const s = d.copy(p).sub(joint).dot(seg.axis)
        if (Math.abs(s) > r * 0.7) continue
        const xr = x / r
        if (back > 0.25 && Math.abs(xr) < 0.75) {
          // Back of the joint: short curved wrinkles over the knuckle.
          const curved = s + 0.3 * r * xr * xr
          const pip = !isThumb && ((seg.index === 1 && !atStart) || (seg.index === 2 && atStart))
          const lines = pip ? [-0.32, 0, 0.32] : [-0.2, 0.2]
          for (const l of lines) {
            const w = 1 - smooth(0.07, 0.13, Math.abs(curved - l * r) / r)
            crease[i] = Math.max(crease[i], w * Math.min(1, (1 - Math.abs(xr) / 0.75) * 2.5))
          }
        } else if (back < -0.3) {
          // Palm side: deeper flexion creases, doubled at the middle joint.
          const lines = atStart && seg.index === 2 ? [-0.08, 0.08] : [0]
          for (const l of lines) {
            const w = 1 - smooth(0.05, 0.1, Math.abs(s - l * r) / r)
            crease[i] = Math.max(crease[i], w)
          }
          raise -= crease[i] * 0.05 * r
        }
      }
    }

    // Nails on the last bone of each finger and the thumb.
    if (seg.last && back > 0.3) {
      const fromTip = seg.len + seg.radius * 0.6 - along[i]
      const nailLen = seg.len * 0.62
      const half = r * 0.74
      const xn = Math.abs(x) / half
      const cuticle = r * 0.15 + nailLen - 0.22 * nailLen * xn * xn
      const inside = fromTip > r * 0.15 && fromTip < cuticle && xn < 1
      if (inside) {
        const edge = Math.min(fromTip - r * 0.15, cuticle - fromTip, (1 - xn) * half)
        const border = 1 - smooth(0.04 * r, 0.12 * r, edge)
        nail[i] = 1 - border
        crease[i] = Math.max(crease[i], border * 0.9)
        raise += 0.05 * r * (1 - border)
      }
    }

    p.addScaledVector(n, raise)
    p.toArray(positions, i * 3)
  }

  return { positions, normals, nail, knuckle, crease }
}
