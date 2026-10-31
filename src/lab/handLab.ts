import * as THREE from 'three'
import { loadPosedHand, type HandPose } from '../stage/handModel'
import { HAND_MODEL, HAND_POSE } from '../stage/handPose'

// Dev-only: /?lab=hand renders the posed hand as a solid mesh for tuning.
// window.lab.pose({...}) re-poses live; window.lab.view(yaw, pitch) turns it.

export async function mountHandLab() {
  document.body.style.overflow = 'hidden'
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111111)
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 10)
  camera.position.set(0, 0, 0.6)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2))
  const key = new THREE.DirectionalLight(0xffffff, 2)
  key.position.set(-1, 1, 2)
  scene.add(key)

  const pivot = new THREE.Group()
  scene.add(pivot)
  let current: THREE.Object3D | null = null

  async function pose(p: HandPose) {
    const { geometry, joints } = await loadPosedHand(HAND_MODEL, p)
    geometry.computeBoundingBox()
    const centre = geometry.boundingBox!.getCenter(new THREE.Vector3())
    geometry.translate(-centre.x, -centre.y, -centre.z)
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.6 })))
    joints.forEach((m, name) => {
      if (!name.endsWith('tip')) return
      const v = new THREE.Vector3().setFromMatrixPosition(m)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004), new THREE.MeshBasicMaterial({ color: name.startsWith('index') ? 0xff3300 : name.startsWith('middle') ? 0x00aaff : 0xffcc00 }))
      dot.position.copy(v).sub(centre)
      group.add(dot)
    })
    if (current) pivot.remove(current)
    current = group
    pivot.add(group)
  }

  function view(yaw: number, pitch = 0, roll = 0) {
    pivot.rotation.set(pitch, yaw, roll, 'YXZ')
  }

  ;(window as unknown as { lab: unknown }).lab = { pose, view, axes: () => pivot.add(new THREE.AxesHelper(0.1)) }
  await pose(HAND_POSE)
  renderer.setAnimationLoop(() => renderer.render(scene, camera))
}
