import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../stage/stage'
import { LEAVES } from '../content/story'

// The pothi's voice. The book itself flies about in the 3D world; this is
// what it says — a small projection beside it, joined to it by a beam of
// light, the words resolving out of noise like a reel of text — and the
// pacing of the story: arrive, speak, let it be read, fly on to the next
// place. Clicking the book hurries it along, or, once it has finished and
// gone to rest, has it tell the story again.

type Api = Stage['companion']
type Phase = 'away' | 'flying' | 'speaking' | 'holding' | 'resting'

const ARRIVE_AFTER = 5500 // ms on the main screen before it comes
const RATE = 34 // characters a second
const NOISE = 'アイウエオカキクケコ01#%&*+=<>/\\|∆∑∞ॐ०१२३४५६७८९'
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Companion({ api }: { api: Api }) {
  const panel = useRef<HTMLDivElement>(null)
  const beam = useRef<HTMLDivElement>(null)
  const hit = useRef<HTMLButtonElement>(null)
  const [index, setIndex] = useState(0)
  const [text, setText] = useState<string[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [done, setDone] = useState(false)
  const [clock, setClock] = useState('00:00:00:00')
  const phase = useRef<Phase>('away')
  const target = useRef(0)
  const startedAt = useRef(0)
  const holdUntil = useRef(0)

  useEffect(() => {
    const begun = performance.now()
    let raf = 0
    let lastHead = -1

    const flyTo = (i: number) => {
      api.speak(false)
      setSpeaking(false)
      api.goTo(i)
      phase.current = i < 0 ? 'resting' : 'flying'
    }
    const next = () => {
      if (target.current < LEAVES.length - 1) {
        target.current++
        flyTo(target.current)
      } else flyTo(-1)
    }
    // Hurry it along; or, at rest, start again.
    const poke = () => {
      const now = performance.now()
      if (phase.current === 'speaking') startedAt.current = now - 60_000
      else if (phase.current === 'holding') holdUntil.current = now
      else if (phase.current === 'resting') {
        target.current = 0
        flyTo(0)
      }
    }
    const button = hit.current
    button?.addEventListener('click', poke)

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const a = api.anchor
      const w = window.innerWidth
      const h = window.innerHeight
      const toPx = (x: number, y: number) => [(x * 0.5 + 0.5) * w, (0.5 - y * 0.5) * h]

      if (phase.current === 'away' && now - begun > ARRIVE_AFTER) {
        api.show(true)
        target.current = 0
        phase.current = 'flying'
      }
      if (phase.current === 'flying' && a.arrived) {
        phase.current = 'speaking'
        startedAt.current = now + 450 // let the book open first
        lastHead = -1
        setIndex(target.current)
        setDone(false)
        setText([])
        setSpeaking(true)
        api.speak(true)
      }

      // The words, resolving.
      if (phase.current === 'speaking' || phase.current === 'holding') {
        const lines = LEAVES[target.current].english
        const total = lines.reduce((n, l) => n + l.length, 0)
        const elapsed = Math.max(now - startedAt.current, 0) / 1000
        const head = reduced() ? total + 3 : Math.floor(elapsed * RATE)
        if (head !== lastHead && phase.current === 'speaking') {
          lastHead = head
          let left = head
          setText(
            lines.map((line) => {
              const n = Math.max(0, Math.min(line.length, left))
              left -= line.length
              let out = line.slice(0, n)
              if (n > 0 && n < line.length) {
                for (let k = 0; k < 3 && n + k < line.length; k++) out += line[n + k] === ' ' ? ' ' : NOISE[(Math.random() * NOISE.length) | 0]
              }
              return out
            }),
          )
          const s = Math.floor(Math.min(elapsed, 99))
          const f = Math.floor((elapsed % 1) * 24)
          setClock(`00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`)
          if (head >= total + 3) {
            phase.current = 'holding'
            holdUntil.current = now + 2200 + total * 40
            setText(lines)
            setDone(true)
          }
        }
        if (phase.current === 'holding' && now > holdUntil.current) next()
      }

      // Follow the book: the hit area over it, the projection beside it on
      // whichever side has room, the beam between them.
      const [bx, by] = toPx(a.x, a.y)
      const [tx, ty] = toPx(a.topX, a.topY)
      if (button) {
        button.style.transform = `translate(${bx - 44}px, ${by - 44}px)`
        button.style.visibility = a.visible ? 'visible' : 'hidden'
      }
      const el = panel.current
      if (el) {
        const pw = el.offsetWidth
        const ph = el.offsetHeight
        const leftSide = a.x > 0
        let px = leftSide ? tx - pw - 54 : tx + 54
        let py = ty - ph - 26
        px = Math.min(Math.max(px, 16), w - pw - 16)
        py = Math.min(Math.max(py, 16), h - ph - 16)
        el.style.transform = `translate(${px}px, ${py}px)`
        const ex = leftSide ? px + pw * 0.78 : px + pw * 0.22
        const ey = py + ph
        const b = beam.current
        if (b) {
          const dx = ex - tx
          const dy = ey - ty
          b.style.width = `${Math.hypot(dx, dy)}px`
          b.style.transform = `translate(${tx}px, ${ty}px) rotate(${Math.atan2(dy, dx)}rad)`
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      button?.removeEventListener('click', poke)
      api.speak(false)
      api.show(false)
    }
  }, [api])

  const leaf = LEAVES[index]
  // The caret rides the line still being written; when all are, the last.
  const typing = text.findIndex((t, k) => t.length < leaf.english[k].length)
  const caretLine = typing >= 0 ? typing : done ? text.length - 1 : -1
  return (
    <>
      <button ref={hit} className="companion__hit" aria-label="The companion: click to hurry it along, or to hear it again" />
      <div ref={beam} className={`companion__beam${speaking ? ' is-on' : ''}`} aria-hidden="true" />
      <div ref={panel} className={`companion__speech${speaking ? ' is-on' : ''}${done ? ' is-done' : ''}`} aria-hidden="true">
        <div className="companion__meta">
          <span className="companion__rec" />
          <span>{clock}</span>
          <span className="companion__title" lang="sa">
            {leaf.num} {leaf.title}
          </span>
        </div>
        <p className="companion__text">
          {(text.length ? text : ['']).map((l, i) => (
            <span key={i} className="companion__line">
              {l}
              {i === caretLine && <i className="companion__caret" />}
            </span>
          ))}
        </p>
      </div>
    </>
  )
}
