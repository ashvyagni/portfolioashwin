import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { createMatsya } from '../forge/matsya'

// Matsya, as a companion: a small paper koi swimming in the corner of the
// forge, turning toward the cursor, and saying a short line as each part of
// the descent begins (written out letter by letter, like the pothi's).

export function Matsya({ line, hidden }: { line: string | null; hidden: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(220, 150, false)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 220 / 150, 0.1, 20)
    camera.position.set(0, 0.45, 1.9)
    camera.lookAt(0, 0, 0)
    const koi = createMatsya()
    koi.group.scale.setScalar(1.25)
    scene.add(koi.group)
    const pointer = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX / innerWidth - 0.15
      pointer.y = e.clientY / innerHeight - 0.85
    }
    window.addEventListener('pointermove', onMove)
    let raf = 0
    let last = performance.now()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = now / 1000
      koi.swim(dt, 0.4, 0.9)
      koi.group.rotation.y = -0.6 + Math.atan2(pointer.x, 1) * 0.8 + Math.sin(t * 0.7) * 0.15
      koi.group.rotation.z = Math.sin(t * 1.1) * 0.08 - pointer.y * 0.2
      koi.group.position.y = Math.sin(t * 1.4) * 0.06
      renderer.render(scene, camera)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    if (!line) return setTyped('')
    let i = 0
    setTyped('')
    const id = window.setInterval(() => {
      i++
      setTyped(line.slice(0, i))
      if (i >= line.length) window.clearInterval(id)
    }, 32)
    return () => window.clearInterval(id)
  }, [line])

  return (
    <div className={`matsya${hidden ? ' is-hidden' : ''}`} aria-live="polite">
      <canvas ref={canvas} width={220} height={150} aria-hidden="true" />
      {line && (
        <p className="matsya__line">
          <span className="matsya__name">मत्स्य</span>
          <span aria-hidden="true">{typed}</span>
          <span className="visually-hidden">{line}</span>
        </p>
      )}
    </div>
  )
}
