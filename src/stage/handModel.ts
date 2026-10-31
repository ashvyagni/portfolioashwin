import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The rigged WebXR generic hand (MIT, see public/models/LICENSE-hand.md), as a
// live rig: its bind-pose surface (smoothed by subdivision, with skin weights)
// and a function that turns a pose into one skinning matrix per bone, so the
// hand can move every frame on the GPU.
//
// The rig's joints are siblings rather than a hierarchy, so finger chains are
// posed here with explicit forward kinematics. WebXR joint convention: local
// -Z runs along the bone towards the tip, +Y points out of the back of the
// hand, so flexing towards the palm is a rotation about local X.

export type JointPose = { curl?: number; spread?: number; twist?: number }
export type HandPose = Partial<Record<string, JointPose>>

export const CHAINS = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
]

export type HandRig = Awaited<ReturnType<typeof loadHandRig>>

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()

function jointRotation(p: JointPose | undefined, out: THREE.Matrix4) {
  if (!p) return out.identity()
  _e.set(-(p.curl ?? 0), p.spread ?? 0, p.twist ?? 0, 'YXZ')
  return out.makeRotationFromQuaternion(_q.setFromEuler(_e))
}

// Keep the four largest of a set of (bone, weight) pairs, renormalised.
function topFour(pairs: Map<number, number>, outIndex: number[], outWeight: number[]) {
  const sorted = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const total = sorted.reduce((s, [, w]) => s + w, 0) || 1
  for (let k = 0; k < 4; k++) {
    outIndex.push(sorted[k]?.[0] ?? 0)
    outWeight.push((sorted[k]?.[1] ?? 0) / total)
  }
}

// One level of subdivision: every triangle into four, new edge points pulled
// onto the smooth surface the vertex normals imply (Phong tessellation), skin
// weights blended from the edge's ends.
function subdivide(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const si = geo.attributes.skinIndex as THREE.BufferAttribute
  const sw = geo.attributes.skinWeight as THREE.BufferAttribute
  const index = geo.index!

  const P: number[] = []
  const N: number[] = []
  const I: number[] = []
  const W: number[] = []
  for (let i = 0; i < pos.count; i++) {
    P.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    N.push(nor.getX(i), nor.getY(i), nor.getZ(i))
    I.push(si.getX(i), si.getY(i), si.getZ(i), si.getW(i))
    W.push(sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i))
  }

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const na = new THREE.Vector3()
  const nb = new THREE.Vector3()
  const m = new THREE.Vector3()
  const pa = new THREE.Vector3()
  const pb = new THREE.Vector3()
  const mids = new Map<string, number>()
  const midpoint = (i: number, j: number) => {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`
    const known = mids.get(key)
    if (known !== undefined) return known
    a.fromArray(P, i * 3)
    b.fromArray(P, j * 3)
    na.fromArray(N, i * 3)
    nb.fromArray(N, j * 3)
    m.copy(a).add(b).multiplyScalar(0.5)
    pa.copy(m).addScaledVector(na, -m.clone().sub(a).dot(na))
    pb.copy(m).addScaledVector(nb, -m.clone().sub(b).dot(nb))
    m.lerp(pa.add(pb).multiplyScalar(0.5), 0.75)
    const id = P.length / 3
    P.push(m.x, m.y, m.z)
    const n = na.clone().add(nb).normalize()
    N.push(n.x, n.y, n.z)
    const pairs = new Map<number, number>()
    for (const v of [i, j]) {
      for (let k = 0; k < 4; k++) {
        const bone = I[v * 4 + k]
        pairs.set(bone, (pairs.get(bone) ?? 0) + W[v * 4 + k] * 0.5)
      }
    }
    topFour(pairs, I, W)
    mids.set(key, id)
    return id
  }

  const tris: number[] = []
  for (let t = 0; t < index.count; t += 3) {
    const v0 = index.getX(t)
    const v1 = index.getX(t + 1)
    const v2 = index.getX(t + 2)
    const m01 = midpoint(v0, v1)
    const m12 = midpoint(v1, v2)
    const m20 = midpoint(v2, v0)
    tris.push(v0, m01, m20, v1, m12, m01, v2, m20, m12, m01, m12, m20)
  }

  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(I, 4))
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(W, 4))
  out.setIndex(tris)
  out.computeVertexNormals()
  return out
}

export async function loadHandRig(url: string) {
  const gltf = await new GLTFLoader().loadAsync(url)
  gltf.scene.updateMatrixWorld(true)

  let skinned: THREE.SkinnedMesh | undefined
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh
  })
  if (!skinned) throw new Error('hand model has no skinned mesh')
  const mesh = skinned
  const bones = mesh.skeleton.bones
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]))
  const bindWorld = bones.map((b) => b.matrixWorld.clone())
  const bindInverse = bindWorld.map((m) => m.clone().invert())

  // Skinning from bind-pose world space: A_k = C · posed_k · bind_k⁻¹ · C⁻¹,
  // where C carries the mesh's own placement (mesh world · bind matrix⁻¹).
  const C = mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse)
  const Cinv = C.clone().invert()

  // The bind-pose surface in rig world space, merged across UV seams and
  // subdivided twice.
  const src = mesh.geometry
  const v = new THREE.Vector3()
  const bindPos = new Float32Array(src.attributes.position.count * 3)
  for (let i = 0; i < src.attributes.position.count; i++) {
    v.fromBufferAttribute(src.attributes.position as THREE.BufferAttribute, i)
    mesh.applyBoneTransform(i, v)
    v.applyMatrix4(mesh.matrixWorld).toArray(bindPos, i * 3)
  }
  let geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(bindPos, 3))
  geometry.setAttribute('skinIndex', src.attributes.skinIndex.clone())
  geometry.setAttribute('skinWeight', src.attributes.skinWeight.clone())
  geometry.setIndex(src.index)
  geometry = mergeVertices(geometry, 1e-5)
  geometry.computeVertexNormals()
  geometry = subdivide(subdivide(geometry))

  const rot = new THREE.Matrix4()
  const posedJoints = new Map<string, THREE.Matrix4>()
  const skin = bones.map(() => new THREE.Matrix4())

  // posed_k = D_k · bind_k · R_k,  D_{k+1} = posed_k · bind_k⁻¹
  function pose(p: HandPose) {
    const w = boneIndex.get('wrist')!
    const wrist = bindWorld[w].clone().multiply(jointRotation(p['wrist'], rot))
    posedJoints.set('wrist', wrist)
    const wristDelta = wrist.clone().multiply(bindInverse[w])
    for (const chain of CHAINS) {
      const delta = wristDelta.clone()
      for (const name of chain) {
        const k = boneIndex.get(name)!
        const world = delta.clone().multiply(bindWorld[k]).multiply(jointRotation(p[name], rot))
        posedJoints.set(name, world)
        delta.copy(world).multiply(bindInverse[k])
      }
    }
    bones.forEach((b, k) => {
      const posed = posedJoints.get(b.name) ?? bindWorld[k]
      skin[k].copy(C).multiply(posed).multiply(bindInverse[k]).multiply(Cinv)
    })
    return { joints: posedJoints, skin }
  }

  const bindJoints = new Map(bones.map((b, k) => [b.name, bindWorld[k]]))
  return { geometry, bindJoints, pose }
}

// Linear blend skinning on the CPU, for placing and baking the dots.
export function skinPoints(
  positions: Float32Array,
  skinIndex: ArrayLike<number>,
  skinWeight: ArrayLike<number>,
  skin: THREE.Matrix4[],
  normals?: Float32Array,
) {
  const count = positions.length / 3
  const outP = new Float32Array(positions.length)
  const outN = normals ? new Float32Array(normals.length) : undefined
  const p = new THREE.Vector3()
  const acc = new THREE.Vector3()
  const t = new THREE.Vector3()
  const n = new THREE.Vector3()
  const accN = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    p.fromArray(positions, i * 3)
    acc.set(0, 0, 0)
    accN.set(0, 0, 0)
    if (normals) n.fromArray(normals, i * 3)
    for (let k = 0; k < 4; k++) {
      const w = skinWeight[i * 4 + k]
      if (w === 0) continue
      const m = skin[skinIndex[i * 4 + k]]
      acc.addScaledVector(t.copy(p).applyMatrix4(m), w)
      if (normals) accN.addScaledVector(t.copy(n).transformDirection(m), w)
    }
    acc.toArray(outP, i * 3)
    if (outN) accN.normalize().toArray(outN, i * 3)
  }
  return { positions: outP, normals: outN }
}

// Area-weighted surface samples with their skin weights. Positions use Phong
// tessellation so the surface reads smooth rather than faceted.
export function sampleSurface(geometry: THREE.BufferGeometry, count: number, rng: () => number) {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const nor = geometry.attributes.normal as THREE.BufferAttribute
  const si = geometry.attributes.skinIndex as THREE.BufferAttribute | undefined
  const sw = geometry.attributes.skinWeight as THREE.BufferAttribute | undefined
  const index = geometry.index!
  const triCount = index.count / 3

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const cdf = new Float32Array(triCount)
  let total = 0
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, index.getX(t * 3))
    b.fromBufferAttribute(pos, index.getX(t * 3 + 1))
    c.fromBufferAttribute(pos, index.getX(t * 3 + 2))
    total += b.sub(a).cross(c.sub(a)).length() * 0.5
    cdf[t] = total
  }

  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const skinIndex: number[] = []
  const skinWeight: number[] = []
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const N = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const p = new THREE.Vector3()
  const proj = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const n = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    const target = rng() * total
    let lo = 0
    let hi = triCount - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cdf[mid] < target) lo = mid + 1
      else hi = mid
    }
    const verts = [index.getX(lo * 3), index.getX(lo * 3 + 1), index.getX(lo * 3 + 2)]
    for (let k = 0; k < 3; k++) {
      P[k].fromBufferAttribute(pos, verts[k])
      N[k].fromBufferAttribute(nor, verts[k])
    }
    let u = rng()
    let w = rng()
    if (u + w > 1) {
      u = 1 - u
      w = 1 - w
    }
    const bary = [1 - u - w, u, w]

    p.set(0, 0, 0)
    n.set(0, 0, 0)
    for (let k = 0; k < 3; k++) {
      p.addScaledVector(P[k], bary[k])
      n.addScaledVector(N[k], bary[k])
    }
    proj.set(0, 0, 0)
    for (let k = 0; k < 3; k++) {
      const offset = tmp.copy(p).sub(P[k]).dot(N[k])
      proj.addScaledVector(tmp.copy(p).addScaledVector(N[k], -offset), bary[k])
    }
    p.lerp(proj, 0.75)
    n.normalize()
    p.toArray(positions, i * 3)
    n.toArray(normals, i * 3)

    if (si && sw) {
      const pairs = new Map<number, number>()
      for (let k = 0; k < 3; k++) {
        for (let j = 0; j < 4; j++) {
          const bone = si.getComponent(verts[k], j)
          pairs.set(bone, (pairs.get(bone) ?? 0) + sw.getComponent(verts[k], j) * bary[k])
        }
      }
      topFour(pairs, skinIndex, skinWeight)
    }
  }
  return { positions, normals, skinIndex: new Uint16Array(skinIndex), skinWeight: new Float32Array(skinWeight) }
}

// A posed, static copy of the surface (used by the pose lab).
export async function loadPosedHand(url: string, p: HandPose) {
  const rig = await loadHandRig(url)
  const { joints, skin } = rig.pose(p)
  const g = rig.geometry
  const posed = skinPoints(
    g.attributes.position.array as Float32Array,
    g.attributes.skinIndex.array,
    g.attributes.skinWeight.array,
    skin,
  )
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(posed.positions, 3))
  geometry.setIndex(g.index)
  geometry.computeVertexNormals()
  return { geometry, joints: new Map(joints) }
}
