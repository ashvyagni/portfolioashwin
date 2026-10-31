import { useEffect, useMemo, useRef, useState } from 'react'
import { createDescent } from '../forge/descent'
import { createWaves } from '../forge/waves'
import { createPortrait } from '../forge/portrait'
import { loadReadme, loadRepos, type Repo } from '../forge/github'
import { CONTACT, MILESTONES, TREE } from '../content/forge'

// Phase two, as one long scroll: the descent (spiral, tree, the eye, the sky,
// the fall), the landing in the black fluid, and the forge on it — the
// portrait in dots, the projects circling a figure on a red disc, then all of
// them in a list, each opening onto its README. Then a way to write.

type Props = { onBack: () => void }

const ORBIT_COUNT = 14

export function Forge({ onBack }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const descentRef = useRef<HTMLElement>(null)
  const flatRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<HTMLCanvasElement>(null)
  const wavesRef = useRef<HTMLCanvasElement>(null)
  const portraitRef = useRef<HTMLCanvasElement>(null)
  const portraitSection = useRef<HTMLElement>(null)
  const orbitSection = useRef<HTMLElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLParagraphElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [landed, setLanded] = useState(false)
  const [open, setOpen] = useState<Repo | null>(null)

  useEffect(() => {
    loadRepos().then(setRepos, () => setRepos([]))
  }, [])

  const orbit = useMemo(() => (repos ?? []).filter((r) => !r.fork).slice(0, ORBIT_COUNT), [repos])

  useEffect(() => {
    const el = scroller.current!
    const descent = createDescent(flatRef.current!, glRef.current!)
    const waves = createWaves(wavesRef.current!)
    const portrait = createPortrait(portraitRef.current!)
    let landedAt = -1
    descent.onLanded(() => {
      landedAt = performance.now() / 1000
      setLanded(true)
      el.style.overflowY = ''
    })
    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      descent.resize(w, h)
      waves?.resize(w, h)
      portrait?.resize(w, h)
    }
    resize()
    window.addEventListener('resize', resize)
    const pointer = { x: -9999, y: -9999 }
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      waves?.touch(e.clientX, e.clientY, performance.now() / 1000 - start)
    }
    window.addEventListener('pointermove', onMove)
    const onWheel = (e: WheelEvent) => {
      if (el.scrollTop <= 0 && e.deltaY < -40) onBack()
    }
    el.addEventListener('wheel', onWheel, { passive: true })

    const start = performance.now() / 1000
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const time = performance.now() / 1000 - start
      const vh = window.innerHeight
      const top = el.scrollTop
      const dEl = descentRef.current!
      const span = dEl.offsetHeight - vh
      const p = Math.min(Math.max(top / span, 0), 1)
      if (top < dEl.offsetHeight) descent.render(p, time)
      if (hintRef.current) hintRef.current.style.opacity = p < 0.02 ? '' : '0'
      // Hold the scroll while the landing cutscene plays.
      if (descent.playing()) el.style.overflowY = 'hidden'
      // Past the descent by some other way (a jump to the end): the fluid is there all the same.
      if (landedAt < 0 && top > dEl.offsetHeight - vh * 0.5 && !descent.playing() && p >= 1) {
        landedAt = performance.now() / 1000
        setLanded(true)
      }
      // The fluid: up as soon as you are in it.
      const sinceLand = landedAt < 0 ? 0 : performance.now() / 1000 - landedAt
      const appear = Math.min(sinceLand / 2.5, 1)
      if (landedAt >= 0 && waves) waves.render(time, appear)
      // The portrait gathers as its section comes in.
      const ps = portraitSection.current!
      const pr = ps.getBoundingClientRect()
      const gather = Math.min(Math.max(1 - pr.top / vh, 0), 1)
      if (portrait && pr.top < vh && pr.bottom > 0) portrait.render(time, pointer, gather)
      // The orbit.
      const os = orbitSection.current!
      const orr = os.getBoundingClientRect()
      const q = Math.min(Math.max(-orr.top / (os.offsetHeight - vh), 0), 1)
      const ring = ringRef.current
      if (ring && orr.top < vh && orr.bottom > 0) {
        const n = cardRefs.current.length
        const small = window.innerWidth < 700
        const R = small ? 230 : 460
        // In through the middle, round, and out again to the list.
        const into = Math.min(q / 0.15, 1)
        const outro = Math.max((q - 0.85) / 0.15, 0)
        const scale = (1.9 - 0.9 * easeOut(into)) * (1 - 0.55 * easeOut(outro))
        ring.style.transform = `translate(-50%, -50%) scale(${scale}) rotateX(-9deg)`
        ring.style.opacity = String(1 - outro)
        cardRefs.current.forEach((card, i) => {
          if (!card) return
          const a = (i / Math.max(n, 1)) * Math.PI * 2 - q * Math.PI * 3.2
          const y = (i - (n - 1) / 2) * (small ? 26 : 40) - (q - 0.5) * (small ? 160 : 260)
          const facing = Math.cos(a)
          card.style.transform = `translate(-50%, -50%) rotateY(${(a * 180) / Math.PI}deg) translateZ(${R}px) translateY(${y}px)`
          card.style.opacity = String(facing > 0 ? 0.3 + 0.7 * facing : 0.14 + 0.16 * (1 + facing))
          card.style.zIndex = String(Math.round(100 + facing * 100))
          card.tabIndex = facing > 0.3 ? 0 : -1
        })
      }
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('wheel', onWheel)
      descent.dispose()
    }
  }, [onBack])

  return (
    <div className="forge" ref={scroller}>
      <canvas className="forge__waves" ref={wavesRef} aria-hidden="true" style={{ opacity: landed ? 1 : 0 }} />

      <section className="descent" ref={descentRef} aria-label="The descent">
        <div className="descent__view">
          <canvas className="descent__sky" ref={glRef} aria-hidden="true" />
          <canvas className="descent__flat" ref={flatRef} aria-hidden="true" />
          <p className="descent__hint" aria-hidden="true" ref={hintRef}>
            scroll — down the spiral
          </p>
        </div>
        {/* What the drawing shows, for anyone not seeing it. */}
        <div className="visually-hidden">
          <h2>Milestones</h2>
          <ul>
            {MILESTONES.map((m) => (
              <li key={m.title}>
                {m.year} — {m.title}: {m.note}
              </li>
            ))}
          </ul>
          <h2>The tree of wisdom — what I work with</h2>
          <ul>
            {TREE.map((b) => (
              <li key={b.name}>
                {b.name}: {b.leaves.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="forge__portrait" ref={portraitSection} aria-labelledby="forge-title">
        <canvas className="forge__portrait-dots" ref={portraitRef} aria-hidden="true" />
        <div className="forge__intro">
          <p className="forge__eyebrow">(02) — the forge</p>
          <h2 id="forge-title">
            Where the things
            <br />I build <em>rest</em>.
          </h2>
          <p className="forge__lede">
            Everything I have put on GitHub lands here on its own — research models, engines, simulations, tools, and the odd game. Scroll, and they come round.
          </p>
        </div>
      </section>

      <section className="forge__orbit" ref={orbitSection} aria-label="Projects, circling">
        <div className="orbit__stage">
          <div className="orbit__ring" ref={ringRef}>
            <Figure />
            {orbit.map((r, i) => (
              <button key={r.name} className="orbit__card" ref={(el) => void (cardRefs.current[i] = el)} onClick={() => setOpen(r)}>
                <span className="orbit__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="orbit__name">{r.name}</span>
                <span className="orbit__desc">{r.description ?? 'no description yet — open it to read the README'}</span>
                <span className="orbit__meta">
                  {r.language ?? '—'} · {new Date(r.pushed_at).getFullYear()}
                </span>
              </button>
            ))}
          </div>
          <p className="orbit__vertical" aria-hidden="true">
            鍛冶場 · THE FORGE
          </p>
        </div>
      </section>

      <section className="forge__list" aria-labelledby="built-title">
        <header className="list__head">
          <h2 id="built-title">
            Things I&rsquo;ve <em>built</em>
          </h2>
          <span className="list__count">({repos ? String(repos.length).padStart(2, '0') : '··'})</span>
        </header>
        {repos === null && <p className="list__loading">pulling from github…</p>}
        <ol className="list__rows">
          {(repos ?? []).map((r, i) => (
            <li key={r.name}>
              <button className="row" onClick={() => setOpen(r)}>
                <span className="row__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="row__name">{r.name}</span>
                <span className="row__meta">
                  {[r.language, ...(r.topics ?? []).slice(0, 2), r.fork ? 'fork' : null].filter(Boolean).join(' · ') || '—'}
                </span>
                <span className="row__year">{new Date(r.pushed_at).getFullYear()}</span>
                <span className="row__arrow" aria-hidden="true">
                  →
                </span>
                <span className="row__open" aria-hidden="true">
                  open
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <footer className="forge__contact">
        <p className="forge__eyebrow">(03) — write to me</p>
        <a className="contact__mail" href={`mailto:${CONTACT.email}`}>
          {CONTACT.email}
        </a>
        <div className="contact__row">
          <a href={CONTACT.github} target="_blank" rel="noopener noreferrer">
            github.com/{CONTACT.githubUser}
          </a>
          <span>Ashwin Dandotiya · VIT Vellore</span>
        </div>
      </footer>

      {open && <Readme repo={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3)

// The figure at the centre of the orbit: drawn in white ink, standing on a red disc.
function Figure() {
  return (
    <svg className="orbit__figure" viewBox="0 0 200 320" aria-hidden="true">
      <defs>
        <filter id="boil">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1">
            <animate attributeName="seed" values="1;2;3;4" dur="0.5s" calcMode="discrete" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </defs>
      <ellipse cx="100" cy="292" rx="88" ry="20" fill="#d4241c" />
      <ellipse cx="100" cy="292" rx="88" ry="20" fill="none" stroke="#1a0a08" strokeWidth="1.5" />
      <g filter="url(#boil)" fill="none" stroke="#f1ece2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Head, from behind: hair. */}
        <path d="M86 52 C84 30 116 28 115 50 C116 64 106 72 100 72 C93 72 87 64 86 52 Z" fill="#0a0a0a" />
        <path d="M88 40 C94 34 104 33 112 40 M90 46 C98 42 106 42 113 47" strokeWidth="1.2" />
        {/* Shoulders and back. */}
        <path d="M100 72 L100 80 M72 92 C80 82 120 82 128 92 L132 150 C130 160 124 168 122 176 L78 176 C76 168 70 160 68 150 Z" fill="#0a0a0a" />
        <path d="M100 86 L100 170" strokeWidth="1" />
        {/* Arms hanging. */}
        <path d="M72 94 C64 120 64 146 66 172 M128 94 C136 120 136 146 134 172" />
        {/* Legs. */}
        <path d="M80 176 C82 210 84 246 86 286 M120 176 C118 210 116 246 114 286 M100 186 L100 200" />
        <path d="M84 286 L94 288 M106 288 L116 286" />
      </g>
    </svg>
  )
}

function Readme({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const [html, setHtml] = useState<string | null | undefined>(undefined)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    setHtml(undefined)
    loadReadme(repo).then((h) => alive && setHtml(h))
    return () => {
      alive = false
    }
  }, [repo])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="readme" role="dialog" aria-modal="true" aria-labelledby="readme-title" onClick={onClose}>
      <div className="readme__panel" ref={panel} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="readme__head">
          <p className="forge__eyebrow">
            {repo.language ?? '—'} · updated {new Date(repo.pushed_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            {repo.stargazers_count > 0 ? ` · ★ ${repo.stargazers_count}` : ''}
          </p>
          <h3 id="readme-title">{repo.name}</h3>
          {repo.description && <p className="readme__desc">{repo.description}</p>}
          <div className="readme__links">
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
              view on github ↗
            </a>
            {repo.homepage && (
              <a href={repo.homepage} target="_blank" rel="noopener noreferrer">
                live ↗
              </a>
            )}
          </div>
          <button className="readme__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <article className="readme__body">
          {html === undefined && <p className="list__loading">reading the README…</p>}
          {html === null && <p className="list__loading">This one has no README yet.</p>}
          {html && <div dangerouslySetInnerHTML={{ __html: html }} />}
        </article>
      </div>
    </div>
  )
}
