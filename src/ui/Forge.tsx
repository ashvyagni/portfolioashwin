import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDescent, EYE_CUT, EYE_LENGTH, SPIRAL_END } from '../forge/descent'
import { createSky } from '../forge/sky'
import { createFluid } from '../forge/fluid'
import { createWaves } from '../forge/waves'
import { createPortrait } from '../forge/portrait'
import { createOrbit } from '../forge/orbit'
import { loadReadme, loadRepos, type Repo } from '../forge/github'
import { labelOf, prettyName } from '../forge/names'
import { CONTACT, MILESTONES, TREE } from '../content/forge'
import { Cursor, setCursor } from './Cursor'
import { Brush, Decode, Rise } from './Reveal'
import { Matsya } from './Matsya'

// Phase two, as one scroll. Fixed layers draw whatever part you are in; the
// sections in the page only set how far along each part is.
//
//   descent  the spiral, the tree                 (descent.ts, 2D)
//            → the eye and its rays: a cutscene on its own clock, the scroll
//              held while it plays; the page is cut and handed to the sky
//   sky      the debris, Matsya, the fall         (sky.ts, 3D)
//            → the fluid: a cutscene too, in your own eyes (fluid.ts)
//   title    the forge's title card; your face in dots, the camera pulling back
//   orbit    the sword saint                       (orbit.ts, 3D)
//   list     everything, from GitHub; each opens to its own page
//   contact

type Props = { onBack: () => void; landing: HTMLCanvasElement | null }
type Stage = 'spiral' | 'tree' | 'eye' | 'sky' | 'ride' | 'fluid' | 'forge' | 'orbit' | 'list'

const LINES: Record<Stage, string | null> = {
  spiral: 'Down the spiral. Each seal on the way is something he did.',
  tree: 'His tree. Every tag a field he works in; the slips, his tools.',
  eye: 'Look up.',
  sky: 'Run. I’ll be under the last piece.',
  ride: 'On my back — now jump!',
  fluid: null,
  forge: 'The forge. What he pushes to GitHub ends up here.',
  orbit: 'Pick a blade.',
  list: 'All of them. Open any.',
}
const SEGMENTS: { stage: Stage[]; name: string }[] = [
  { stage: ['spiral'], name: 'Spiral' },
  { stage: ['tree', 'eye'], name: 'Tree' },
  { stage: ['sky', 'ride', 'fluid'], name: 'Sky' },
  { stage: ['forge', 'orbit'], name: 'Forge' },
  { stage: ['list'], name: 'Work' },
]
const ORBIT_COUNT = 14
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const ease = (x: number) => {
  const t = clamp01(x)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function Forge({ onBack, landing }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const descentSec = useRef<HTMLElement>(null)
  const skySec = useRef<HTMLElement>(null)
  const titleSec = useRef<HTMLElement>(null)
  const orbitSec = useRef<HTMLElement>(null)
  const wavesCv = useRef<HTMLCanvasElement>(null)
  const orbitCv = useRef<HTMLCanvasElement>(null)
  const portraitCv = useRef<HTMLCanvasElement>(null)
  const skyCv = useRef<HTMLCanvasElement>(null)
  const descentCv = useRef<HTMLCanvasElement>(null)
  const fluidCv = useRef<HTMLCanvasElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [stage, setStage] = useState<Stage>('spiral')
  const [open, setOpen] = useState<number | null>(null)
  const [clock, setClock] = useState('')
  const orbitApi = useRef<ReturnType<typeof createOrbit> | null>(null)

  useEffect(() => {
    loadRepos().then(setRepos, () => setRepos([]))
  }, [])
  const orbitRepos = useMemo(() => (repos ?? []).filter((r) => !r.fork).slice(0, ORBIT_COUNT), [repos])
  useEffect(() => orbitApi.current?.setRepos(orbitRepos), [orbitRepos])

  // The time in Vellore, for the corner.
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date()))
    tick()
    const id = window.setInterval(tick, 20000)
    return () => window.clearInterval(id)
  }, [])

  const openRepo = useCallback(
    (r: Repo) => {
      const i = (repos ?? []).indexOf(r)
      if (i >= 0) setOpen(i)
    },
    [repos],
  )
  const openRef = useRef(openRepo)
  useEffect(() => {
    openRef.current = openRepo
  }, [openRepo])

  useEffect(() => {
    const el = scroller.current!
    const descent = createDescent(descentCv.current!)
    const sky = createSky(skyCv.current!)
    const fluid = createFluid(fluidCv.current!)
    const waves = createWaves(wavesCv.current!)
    const portrait = createPortrait(portraitCv.current!)
    const orbit = createOrbit(orbitCv.current!, (r) => openRef.current(r), (on) => setCursor(on ? 'open' : 'default'))
    orbitApi.current = orbit
    const resize = () => {
      const w = innerWidth
      const h = innerHeight
      descent.resize(w, h)
      sky.setSize(w, h)
      fluid.resize(w, h)
      waves?.resize(w, h)
      portrait?.resize(w, h)
      orbit.setSize(w, h)
    }
    resize()
    window.addEventListener('resize', resize)
    const pointer = { x: -9999, y: -9999 }
    const start = performance.now() / 1000
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

    let eyeAt = -1
    let cutAt = -1
    let eyeDone = false
    let fluidAt = -1
    let fluidDone = false
    let landedAt = -1
    let current: Stage = 'spiral'
    const hold = (on: boolean) => (el.style.overflowY = on ? 'hidden' : '')
    const show = (c: HTMLCanvasElement | null, on: boolean) => {
      if (c) c.style.visibility = on ? 'visible' : 'hidden'
    }
    const progress = (sec: HTMLElement) => clamp01((el.scrollTop - sec.offsetTop) / Math.max(sec.offsetHeight - innerHeight, 1))

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const time = performance.now() / 1000 - start
      const vh = innerHeight
      const top = el.scrollTop
      const dP = progress(descentSec.current!)
      const sP = progress(skySec.current!)
      const tP = progress(titleSec.current!)
      const oP = progress(orbitSec.current!)
      const skyTop = skySec.current!.offsetTop
      const titleTop = titleSec.current!.offsetTop
      const orbitEl = orbitSec.current!

      // ---- the descent, and the eye's cutscene at its end
      if (!eyeDone && eyeAt < 0 && dP >= 0.999) {
        eyeAt = time
        hold(true)
      }
      const eyeT = eyeAt < 0 ? -1 : time - eyeAt
      if (eyeT >= EYE_CUT && cutAt < 0) {
        const snap = descent.snapshot(time)
        sky.build(snap.canvas, landing, snap.cross)
        cutAt = time
      }
      if (eyeT >= EYE_LENGTH && !eyeDone) {
        eyeDone = true
        hold(false)
      }
      const inDescent = top < skyTop - vh * 0.02
      const eyePlaying = eyeAt >= 0 && !eyeDone
      // ---- the sky
      const run = clamp01(sP / 0.72)
      const ride = clamp01((sP - 0.72) / 0.16)
      const fall = clamp01((sP - 0.88) / 0.12)
      const skyOn = cutAt >= 0 && top < titleTop && (eyeT >= EYE_CUT || !inDescent || dP >= 0.999)
      // ---- the fluid
      if (!fluidDone && fluidAt < 0 && fall >= 0.999) {
        fluidAt = time
        hold(true)
      }
      let fluidOn = false
      if (fluidAt >= 0 && !fluidDone) {
        fluidOn = fluid.render(time - fluidAt, time)
        if (!fluidOn) {
          fluidDone = true
          landedAt = time
          hold(false)
          el.scrollTo({ top: titleTop, behavior: 'smooth' })
        }
      }
      // Past it all some other way (a jump to the end): the forge is simply there.
      if (landedAt < 0 && top >= titleTop - vh * 0.5) {
        landedAt = time
        fluidDone = true
        eyeDone = true
        hold(false)
      }

      // ---- drawing
      const drawDescent = (inDescent && !(eyeDone && dP >= 0.999)) || eyePlaying
      show(descentCv.current, drawDescent)
      if (eyePlaying) descent.renderEye(eyeT, time)
      else if (drawDescent) descent.render(dP, time)
      show(skyCv.current, skyOn && !fluidOn)
      if (skyOn && !fluidOn) sky.render(Math.max(time - cutAt, 0), run, ride, fall, time)
      // Speed lines over the leaps and the fall.
      const lines = skyOn && !fluidOn ? Math.max(sky.state.leap - 0.35, 0) * 1.6 + fall * 0.8 : 0
      if (!fluidOn) fluid.speed(lines, fall, time)
      show(fluidCv.current, fluidOn || lines > 0.05)
      const wavesOn = landedAt >= 0 && top > titleTop - vh
      show(wavesCv.current, wavesOn)
      if (wavesOn && waves) waves.render(time, clamp01((time - landedAt) / 2.5))
      // The title card alone on the fluid first; then the dots gather, close
      // on the eyes, and the camera pulls back to the whole face.
      const portraitOn = tP > 0.1 && tP < 1
      show(portraitCv.current, portraitOn)
      if (portraitOn && portrait) portrait.render(time, pointer, clamp01((tP - 0.1) / 0.22), 5 - 4 * ease((tP - 0.34) / 0.5))
      const orbitOn = top > orbitEl.offsetTop - vh && top < orbitEl.offsetTop + orbitEl.offsetHeight
      show(orbitCv.current, orbitOn)
      if (orbitOn) orbit.render(oP, time)

      // ---- where we are
      let next: Stage
      if (eyePlaying) next = 'eye'
      else if (inDescent) next = dP < SPIRAL_END ? 'spiral' : 'tree'
      else if (top < titleTop - vh * 0.5) next = fluidOn ? 'fluid' : ride > 0 || fall > 0 ? 'ride' : 'sky'
      else if (top < orbitEl.offsetTop - vh * 0.3) next = 'forge'
      else if (top < orbitEl.offsetTop + orbitEl.offsetHeight - vh) next = 'orbit'
      else next = 'list'
      if (next !== current) {
        current = next
        setStage(next)
      }
      if (pctRef.current) pctRef.current.textContent = String(Math.round((top / Math.max(el.scrollHeight - vh, 1)) * 100)).padStart(3, '0')
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('wheel', onWheel)
      sky.dispose()
      orbit.dispose()
      orbitApi.current = null
    }
  }, [onBack, landing])

  const seg = Math.max(
    SEGMENTS.findIndex((s) => s.stage.includes(stage)),
    0,
  )
  const all = repos ?? []
  const tone = stage === 'spiral' ? 'paper' : 'dark'

  return (
    <div className="forge" ref={scroller}>
      <div className="forge__layers" aria-hidden="true">
        <canvas ref={wavesCv} />
        <canvas ref={orbitCv} />
        <canvas ref={portraitCv} />
        <canvas ref={skyCv} />
        <canvas ref={descentCv} />
        <canvas ref={fluidCv} />
      </div>

      <header className={`hud hud--${tone}`}>
        <span className="hud__name">
          Ashwin <i>·</i> 鍛冶場
        </span>
        <ol className="hud__segments" aria-label="Where you are">
          {SEGMENTS.map((s, i) => (
            <li key={s.name} className={i < seg ? 'is-past' : i === seg ? 'is-now' : ''}>
              <span className="visually-hidden">{s.name}</span>
            </li>
          ))}
        </ol>
        <span className="hud__pct">
          <span ref={pctRef}>000</span> ↓
        </span>
      </header>
      <footer className={`hud hud--bottom hud--${tone}`}>
        <span>
          02.{seg + 1} / {SEGMENTS[seg].name}
        </span>
        <span>{clock} IST · Vellore</span>
      </footer>

      <section className="sec sec--descent" ref={descentSec} aria-label="The descent">
        <div className="visually-hidden">
          <h2>Milestones</h2>
          <ul>
            {MILESTONES.map((m) => (
              <li key={m.title}>
                {m.year} — {m.title}: {m.note}
              </li>
            ))}
          </ul>
          <h2>The tree of wisdom</h2>
          <ul>
            {TREE.map((b) => (
              <li key={b.name}>
                {b.name}: {b.leaves.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="sec sec--sky" ref={skySec} aria-label="The fall" />

      <section className="sec sec--title" ref={titleSec} aria-labelledby="forge-title">
        <div className="title-card">
          <Decode className="title-card__chapter" text="第二章 · CHAPTER II" />
          <h2 id="forge-title" className="title-card__kanji" lang="ja">
            <Brush text="鍛冶場" />
          </h2>
          <Brush as="p" className="title-card__name" text="The Forge" delay={0.3} />
        </div>
      </section>

      <section className="sec sec--orbit" ref={orbitSec} aria-label="Projects">
        <div className="orbit-ui">
          <p className="orbit-ui__vertical" lang="ja">
            作品 <span>· WORKS</span>
          </p>
          <Decode className="orbit-ui__hint" text={`${orbitRepos.length} BLADES · SCROLL TO TURN · CLICK TO DRAW`} />
        </div>
        <ul className="visually-hidden">
          {orbitRepos.map((r) => (
            <li key={r.name}>
              <button onClick={() => openRepo(r)}>{prettyName(r.name)}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="sec sec--list" aria-labelledby="built-title">
        <div className="marquee" aria-hidden="true">
          <div>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i}>
                鍛冶場 · SELECTED WORK <b>▶▶▶</b>
              </span>
            ))}
          </div>
        </div>
        <div className="list">
          <Decode className="list__eyebrow" text="■ 02 — EVERYTHING ON GITHUB" />
          <h2 id="built-title" className="list__title">
            <Brush text="Things I’ve" /> <em>built</em>
            <sup>({String(all.length).padStart(2, '0')})</sup>
          </h2>
          {repos === null && <p className="list__loading">pulling from github…</p>}
          <ol className="rows">
            {all.map((r, i) => (
              <li key={r.name}>
                <button className="row" onClick={() => setOpen(i)} data-cursor="open" data-cursor-label="open">
                  <span className="row__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row__name">{prettyName(r.name)}</span>
                  <span className="row__meta">{labelOf(r)}</span>
                  <span className="row__year">{new Date(r.pushed_at).getFullYear()}</span>
                  <span className="row__arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="sec sec--contact">
        <Decode className="list__eyebrow" text="■ 03 — WRITE TO ME" />
        <a className="contact__mail" href={`mailto:${CONTACT.email}`} data-cursor="open" data-cursor-label="write">
          {CONTACT.email}
        </a>
        <div className="contact__row">
          <a href={CONTACT.github} target="_blank" rel="noopener noreferrer" data-cursor="open" data-cursor-label="github">
            github.com/{CONTACT.githubUser} ↗
          </a>
          <span>Ashwin Dandotiya · B.Tech CSE (AI/ML), VIT Vellore</span>
        </div>
      </footer>

      <a className={`hello${stage === 'list' ? ' is-on' : ''}`} href={`mailto:${CONTACT.email}`} data-cursor="open" data-cursor-label="write">
        Say hello
      </a>
      <Matsya line={LINES[stage]} hidden={stage === 'ride' || stage === 'fluid' || open !== null} />
      {open !== null && all[open] && <Project repos={all} index={open} onGo={setOpen} onClose={() => setOpen(null)} />}
      <Cursor />
    </div>
  )
}

// A project's own page: its name large, what it is in a line, the facts in
// a row, the README in full, and the next one.
function Project({ repos, index, onGo, onClose }: { repos: Repo[]; index: number; onGo: (i: number) => void; onClose: () => void }) {
  const repo = repos[index]
  const nextIndex = (index + 1) % repos.length
  const [html, setHtml] = useState<string | null | undefined>(undefined)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    panel.current?.scrollTo({ top: 0 })
    loadReadme(repo).then((h) => alive && setHtml(h))
    return () => {
      alive = false
      setHtml(undefined)
    }
  }, [repo])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    setCursor('default')
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const created = new Date(repo.created_at).getFullYear()
  const pushed = new Date(repo.pushed_at).getFullYear()
  return (
    <div className="project" role="dialog" aria-modal="true" aria-labelledby="project-title" ref={panel} tabIndex={-1}>
      <button className="project__back" onClick={onClose} data-cursor="open" data-cursor-label="back">
        ← All work
      </button>
      <p className="project__eyebrow">
        ■ {String(index + 1).padStart(2, '0')} — {labelOf(repo)}
      </p>
      <h3 id="project-title" className="project__title" key={repo.name}>
        <Brush text={prettyName(repo.name)} />
      </h3>
      {repo.description && <p className="project__lede">{repo.description}</p>}
      <dl className="project__facts">
        <div>
          <dt>Repository</dt>
          <dd>{repo.name}</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>{created === pushed ? created : `${created} – ${pushed}`}</dd>
        </div>
        <div>
          <dt>Stack</dt>
          <dd>{[repo.language, ...(repo.topics ?? [])].filter(Boolean).join(' · ') || '—'}</dd>
        </div>
        <div>
          <dt>Links</dt>
          <dd>
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer" data-cursor="open" data-cursor-label="source">
              Source ↗
            </a>
            {repo.homepage && (
              <a href={repo.homepage} target="_blank" rel="noopener noreferrer" data-cursor="open" data-cursor-label="live">
                Live ↗
              </a>
            )}
          </dd>
        </div>
      </dl>
      <Rise className="project__readme">
        {html === undefined && <p className="list__loading">reading the README…</p>}
        {html === null && <p className="list__loading">No README in this one yet.</p>}
        {html && <article dangerouslySetInnerHTML={{ __html: html }} />}
      </Rise>
      <button className="project__next" onClick={() => onGo(nextIndex)} data-cursor="open" data-cursor-label="next">
        <span>Next project / {String(nextIndex + 1).padStart(2, '0')}</span>
        <strong>{prettyName(repos[nextIndex].name)}</strong>
      </button>
    </div>
  )
}
