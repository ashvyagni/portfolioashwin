import * as THREE from 'three'
import { createPost, type SketchState } from '../stage/post'

// Phase two is drawn the way phase one is: every part of it is a real, lit 3D
// scene, and what you see is that scene read as a drawing — ink found from
// its forms, hatching laid into its shadows, watercolour bled into it — by
// the same pass the pond goes through (stage/post.ts). This is the one
// renderer every part of the descent shares.

export type Sketch = SketchState & { dark: number; glitch: number; mono: number }

export function sketchState(): Sketch {
  return {
    draw: 1,
    colour: 1,
    seed: new THREE.Vector3(0.5, 0.5, 0),
    seed2: new THREE.Vector3(0.5, 0.5, 0),
    despair: 0,
    enlight: 0,
    blood: 0,
    burst: 0,
    eye: 0,
    eyeAt: new THREE.Vector3(0.5, 0.5, 0.2),
    dark: 0,
    glitch: 0,
    mono: 0,
  }
}

export function createWorld(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  const ratio = Math.min(window.devicePixelRatio, Math.min(innerWidth, innerHeight) < 700 ? 1.5 : 1.75)
  renderer.setPixelRatio(ratio)
  renderer.setClearColor(0x000000, 1)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const blank = new THREE.Scene()
  const blankCam = new THREE.PerspectiveCamera()
  const post = createPost(renderer, blank, blankCam)
  // A drawn world wants little bloom: only true lights glow.
  post.setBloom(0.14, 0.95)
  const buffer = new THREE.Vector2()

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false)
    renderer.getDrawingBufferSize(buffer)
    post.setSize(w, h, buffer)
  }

  function render(scene: THREE.Scene, camera: THREE.Camera, sketch: Sketch, time: number, opts: { zoom?: number; flash?: number; shake?: number } = {}) {
    post.setView(scene, camera, true)
    post.setSketch(sketch)
    post.setZoomBlur(opts.zoom ?? 0)
    post.flash.value = opts.flash ?? 0
    const sh = opts.shake ?? 0
    post.uniforms.uShake.value.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh)
    post.render(time)
  }

  // What is on screen this instant, as a picture (call right after render).
  function capture() {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    c.getContext('2d')!.drawImage(canvas, 0, 0)
    return c
  }

  return {
    renderer,
    resize,
    render,
    capture,
    dispose() {
      post.dispose()
      renderer.dispose()
    },
  }
}

// Where a world point lands on screen, in CSS pixels; `visible` if in front.
const tmp = new THREE.Vector3()
export function onScreen(p: THREE.Vector3, camera: THREE.Camera, w: number, h: number, out = { x: 0, y: 0, visible: false, depth: 0 }) {
  tmp.copy(p).project(camera)
  out.x = (tmp.x * 0.5 + 0.5) * w
  out.y = (0.5 - tmp.y * 0.5) * h
  out.depth = tmp.z
  out.visible = tmp.z < 1 && tmp.z > -1 && out.x > -w * 0.2 && out.x < w * 1.2 && out.y > -h * 0.2 && out.y < h * 1.2
  return out
}
