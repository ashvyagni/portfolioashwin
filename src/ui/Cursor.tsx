import { useEffect, useRef } from 'react'

// The forge's cursor: an ink ring that eases after the pointer, a dot that
// does not, and embers that trail off it. Over anything that opens, the ring
// widens into a lens with the word in it. Hidden on touch screens.

export type CursorMode = 'default' | 'open' | 'hidden'
export const setCursor = (mode: CursorMode, label = 'open') => window.dispatchEvent(new CustomEvent('forge-cursor', { detail: { mode, label } }))

export function Cursor() {
  const ring = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const trail = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    document.documentElement.classList.add('has-cursor')
    const pos = { x: innerWidth / 2, y: innerHeight / 2 }
    const eased = { ...pos }
    let mode: CursorMode = 'default'
    const embers: { x: number; y: number; vx: number; vy: number; life: number }[] = []
    const c = trail.current!
    const g = c.getContext('2d')!
    const resize = () => {
      c.width = innerWidth * devicePixelRatio
      c.height = innerHeight * devicePixelRatio
    }
    resize()
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - pos.x
      const dy = e.clientY - pos.y
      pos.x = e.clientX
      pos.y = e.clientY
      const speed = Math.hypot(dx, dy)
      if (speed > 4 && embers.length < 80) embers.push({ x: pos.x, y: pos.y, vx: -dx * 0.05 + (Math.random() - 0.5), vy: -dy * 0.05 - Math.random() * 0.6, life: 1 })
      // Anything marked as opening widens the ring.
      const el = (e.target as HTMLElement).closest?.('[data-cursor]') as HTMLElement | null
      if (el && mode !== 'hidden') apply(el.dataset.cursor as CursorMode, el.dataset.cursorLabel ?? 'open')
      else if (!el && mode === 'open' && !external) apply('default')
    }
    let external = false
    const apply = (m: CursorMode, text = 'open') => {
      mode = m
      ring.current!.dataset.mode = m
      dot.current!.dataset.mode = m
      label.current!.textContent = text
    }
    const onExternal = (e: Event) => {
      const { mode: m, label: l } = (e as CustomEvent).detail
      external = m !== 'default'
      apply(m, l)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('forge-cursor', onExternal)
    window.addEventListener('resize', resize)
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      eased.x += (pos.x - eased.x) * 0.18
      eased.y += (pos.y - eased.y) * 0.18
      ring.current!.style.transform = `translate(${eased.x}px, ${eased.y}px)`
      dot.current!.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      g.clearRect(0, 0, innerWidth, innerHeight)
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i]
        p.x += p.vx
        p.y += p.vy
        p.vy -= 0.02
        p.life -= 0.025
        if (p.life <= 0) {
          embers.splice(i, 1)
          continue
        }
        g.fillStyle = `rgba(${p.life > 0.6 ? '242,178,74' : '212,36,28'}, ${p.life})`
        g.fillRect(p.x, p.y, 2, 2)
      }
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('forge-cursor', onExternal)
      window.removeEventListener('resize', resize)
      document.documentElement.classList.remove('has-cursor')
    }
  }, [])

  return (
    <>
      <canvas className="cursor-trail" ref={trail} aria-hidden="true" />
      <div className="cursor-ring" ref={ring} aria-hidden="true">
        <span ref={label}>open</span>
      </div>
      <div className="cursor-dot" ref={dot} aria-hidden="true" />
    </>
  )
}
