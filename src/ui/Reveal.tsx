import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

// Text that arrives the way the rest of phase two does.
//
// <Brush>: each character comes up out of a clip, staggered, as if inked in
// one sweep. <Decode>: mono labels that flicker through glyphs and settle,
// like a readout finding its signal.

function useSeen<T extends Element>(once = true) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          if (once) io.disconnect()
        } else if (!once) setSeen(false)
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once])
  return [ref, seen] as const
}

export function Brush({ text, as: Tag = 'span', className = '', delay = 0 }: { text: string; as?: ElementType; className?: string; delay?: number }) {
  const [ref, seen] = useSeen<HTMLElement>()
  return (
    <Tag ref={ref} className={`brush ${seen ? 'is-in' : ''} ${className}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ transitionDelay: `${delay + i * 0.035}s` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </Tag>
  )
}

const GLYPHS = '鍛冶場アイウエオ01#%/<>=+▮▯'

export function Decode({ text, className = '' }: { text: string; className?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>()
  const [shown, setShown] = useState(text.replace(/\S/g, ' '))
  useEffect(() => {
    if (!seen) return
    let frame = 0
    const id = window.setInterval(() => {
      frame++
      const settled = Math.floor(frame / 2)
      setShown([...text].map((ch, i) => (i < settled || ch === ' ' ? ch : GLYPHS[(i * 7 + frame) % GLYPHS.length])).join(''))
      if (settled >= text.length) window.clearInterval(id)
    }, 28)
    return () => window.clearInterval(id)
  }, [seen, text])
  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  )
}

export function Rise({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>()
  return (
    <div ref={ref} className={`rise ${seen ? 'is-in' : ''} ${className}`}>
      {children}
    </div>
  )
}
