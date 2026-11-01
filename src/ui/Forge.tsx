import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createWorld, onScreen } from '../forge/world'
import { createSpiral } from '../forge/spiral3d'
import { createTree } from '../forge/tree3d'
import { createSky } from '../forge/sky'
import { createLevels, pickSong, type Song } from '../audio/songs'
import { projectArt } from '../forge/art'
import type { Score } from '../audio/score'
import { createOverlay, drawEyeArt } from '../forge/overlay'
import { createWaves } from '../forge/waves'
import { createPortrait } from '../forge/portrait'
import { createOrbit } from '../forge/orbit'
import { prepareParkour } from '../forge/parkour'
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
//            → the rift: off Matsya's back a tear opens in the sky and pulls
//              you through (a cutscene); out the other side, the song
//   title    the forge's title card; your face in dots, the camera pulling back
//   orbit    the sword saint                       (orbit.ts, 3D)
//   list     everything, from GitHub; each opens to its own page
//   contact

type Props = { onBack: () => void; landing: HTMLCanvasElement | null; score: Score }
type Stage = 'spiral' | 'tree' | 'eye' | 'sky' | 'ride' | 'rift' | 'forge' | 'orbit' | 'list'

const LINES: Record<Stage, string | null> = {
  spiral: 'Down the spiral. Each seal on the way is something he did.',
  tree: 'His tree. Every tag a field he works in; the slips, his tools.',
  eye: 'Look up.',
  sky: 'Run. I’ll be under the last piece.',
  ride: 'On my back — now jump!',
  rift: null,
  forge: 'The forge. What he pushes to GitHub ends up here.',
  orbit: 'Pick a blade.',
  list: 'All of them. Open any.',
}
const SEGMENTS: { stage: Stage[]; name: string }[] = [
  { stage: ['spiral'], name: 'Spiral' },
  { stage: ['tree', 'eye'], name: 'Tree' },
  { stage: ['sky', 'ride', 'rift'], name: 'Sky' },
  { stage: ['forge', 'orbit'], name: 'Forge' },
  { stage: ['list'], name: 'Work' },
]
const ORBIT_COUNT = 14
const SPIRAL_END = 0.5
const EYE_CUT = 3.3
const EYE_LENGTH = 4.4
// After the eye cuts the page, the sky is one cutscene on its own clock:
// a run across the debris, a ride on Matsya, the leap, and the long fall —
// as long as the song's run-up, which starts from its first second as you
// leave Matsya — glitching more and more, until the world holds still, the
// pattern waves spiral in, and on the drop you are in the forge.
// The run across the world: as long as the course in parkour.ts.
const RUN = 20.2
const RIDE = 5
const LEAP = 1.4
const STILL = 1.4
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// The story's beats, for the score to build on before the rift.
const CUES: Partial<Record<Stage, string>> = { spiral: 'forge-spiral', tree: 'forge-tree', eye: 'forge-eye', sky: 'forge-sky', ride: 'forge-ride' }
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const easeOut01 = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const ease = (x: number) => {
  const t = clamp01(x)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function Forge({ onBack, landing, score }: Props) {
  // A luck charm: one of the two songs, chosen afresh each visit.
  const [song] = useState(pickSong)
  const scroller = useRef<HTMLDivElement>(null)
  const descentSec = useRef<HTMLElement>(null)
  const titleSec = useRef<HTMLElement>(null)
  const orbitSec = useRef<HTMLElement>(null)
  const wavesCv = useRef<HTMLCanvasElement>(null)
  const orbitCv = useRef<HTMLCanvasElement>(null)
  const portraitCv = useRef<HTMLCanvasElement>(null)
  const worldCv = useRef<HTMLCanvasElement>(null)
  const overlayCv = useRef<HTMLCanvasElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const titleCardRef = useRef<HTMLDivElement>(null)
  const skipRef = useRef(-1)
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [stage, setStage] = useState<Stage>('spiral')
  const [open, setOpen] = useState<number | null>(null)
  const [clock, setClock] = useState('')
  const orbitApi = useRef<ReturnType<typeof createOrbit> | null>(null)

  useEffect(() => {
    loadRepos().then(setRepos, () => setRepos([]))
  }, [])
  const orbitRepos = useMemo(() => (repos ?? []).filter((r) => !r.fork).slice(0, ORBIT_COUNT), [repos])
  useEffect(() => orbitApi.current?.setRepos(orbitRepos, [song.palette[1], song.palette[2]]), [orbitRepos, song])

  // The time in Vellore, for the corner.
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date()))
    tick()
    const id = window.setInterval(tick, 20000)
    return () => window.clearInterval(id)
  }, [])

  // The list's preview: the hovered project's print, following the cursor.
  const peekRef = useRef<HTMLDivElement>(null)
  const peeking = useRef<string | null>(null)
  const peek = useCallback(
    (r: Repo | null) => {
      const el = peekRef.current
      if (!el) return
      peeking.current = r?.name ?? null
      if (!r) return el.classList.remove('is-on')
      projectArt(r, [song.palette[1], song.palette[2]]).then((c) => {
        if (peeking.current !== r.name) return
        el.replaceChildren(c)
        el.classList.add('is-on')
      })
    },
    [song],
  )
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (peekRef.current) peekRef.current.style.transform = `translate(${e.clientX + 28}px, ${e.clientY - 90}px)`
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
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
    const world = createWorld(worldCv.current!)
    const overlay = createOverlay(overlayCv.current!)
    const spiral = createSpiral()
    const tree = createTree()
    const sky = createSky()
    // The sky's world is heavy to make: make it now, in idle moments.
    prepareParkour()
    const levels = createLevels()
    let analyser: AnalyserNode | null = null
    let audio: HTMLAudioElement | null = null
    const waves = createWaves(wavesCv.current!)
    waves?.setPalette(song.palette)
    const portrait = createPortrait(portraitCv.current!)
    const orbit = createOrbit(orbitCv.current!, (r) => openRef.current(r), (on) => setCursor(on ? 'open' : 'default'))
    orbitApi.current = orbit
    // The eye hangs in the tree's sky, over the moon, until it opens.
    const eyeCanvas = document.createElement('canvas')
    eyeCanvas.width = eyeCanvas.height = 1024
    const eyeTex = new THREE.CanvasTexture(eyeCanvas)
    eyeTex.colorSpace = THREE.SRGBColorSpace
    const eyePlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, depthWrite: false, fog: false }))
    eyePlane.position.copy(tree.moon.position)
    eyePlane.visible = false
    tree.scene.add(eyePlane)
    const cams = [spiral.camera, tree.camera, sky.camera]
    const resize = () => {
      const w = innerWidth
      const h = innerHeight
      world.resize(w, h)
      overlay.resize(w, h)
      cams.forEach((c) => {
        c.aspect = w / h
        c.updateProjectionMatrix()
      })
      sky.setSize(w, h)
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
    let skyAt = -1
    let runBeat = ''
    let heard = 0
    let songAt = -1
    let skipTo = -1
    let landedAt = -1
    let assembling: ReturnType<typeof overlay.prepareAssembly> | null = null
    let current: Stage = 'spiral'
    const eyeOnScreen = { x: 0, y: 0, visible: false, depth: 0 }
    const probe = { x: 0, y: 0, visible: false, depth: 0 }
    const probeV = new THREE.Vector3()
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
      const tP = progress(titleSec.current!)
      const oP = progress(orbitSec.current!)
      const titleTop = titleSec.current!.offsetTop
      const orbitEl = orbitSec.current!
      overlay.begin(time)
      if (skipRef.current >= 0) {
        skipTo = RUN + RIDE + song.from - 0.6
        skipRef.current = -1
      }
      // Dev only: hold any moment of a scene, e.g. forgeDebug = { fluid: 6 }.
      const dbg = import.meta.env.DEV ? (window as unknown as { forgeDebug?: { tree?: number; spiral?: number; sky?: [number, number, number, number] } }).forgeDebug : undefined
      if (dbg) {
        show(worldCv.current, true)
        show(overlayCv.current, true)
        if (dbg.sky) {
          if (cutAt < 0) {
            const c = document.createElement('canvas')
            c.width = c.height = 64
            sky.build(c, landing, { x: 0.5, y: 0.4, w: 0.07 })
            cutAt = time - 10
          }
          sky.update(10, dbg.sky[0], dbg.sky[1], dbg.sky[2], time, dbg.sky[3])
          world.render(sky.scene, sky.camera, sky.sketch, time)
        } else if (dbg.tree !== undefined) {
          tree.update(dbg.tree, time)
          world.render(tree.scene, tree.camera, tree.sketch, time)
        } else if (dbg.spiral !== undefined) {
          spiral.update(dbg.spiral, time)
          world.render(spiral.scene, spiral.camera, spiral.sketch, time)
        }
        return
      }

      // ---- the eye's cutscene, at the end of the tree
      if (!eyeDone && eyeAt < 0 && dP >= 0.999) {
        eyeAt = time
        hold(true)
      }
      const eyeT = eyeAt < 0 ? -1 : time - eyeAt
      if (eyeT >= EYE_LENGTH && !eyeDone) {
        eyeDone = true
        hold(false)
      }
      const inDescent = top < titleTop - vh * 0.5
      const eyePlaying = eyeAt >= 0 && !eyeDone
      // The song: fetched once the tree begins, so it is there for the fall.
      if (!audio && dP >= SPIRAL_END) {
        audio = new Audio(song.src)
        audio.preload = 'auto'
        audio.loop = true
        if (import.meta.env.DEV) (window as unknown as { forgeSong: HTMLAudioElement | null }).forgeSong = audio
      }
      // ---- the sky's cutscene, straight on from the eye's
      const G = song.from
      if (eyeDone && skyAt < 0 && landedAt < 0 && cutAt >= 0) {
        skyAt = time
        hold(true)
      }
      if (skipTo >= 0 && skyAt >= 0) {
        skyAt = time - skipTo
        if (audio && songAt < 0) {
          analyser = score.playSong(audio, Math.max(G - 0.6, 0))
          songAt = time
        } else if (audio) audio.currentTime = Math.max(G - 0.6, 0)
        skipTo = -1
      }
      const skyT = skyAt < 0 ? -1 : time - skyAt
      const skyOn = skyAt >= 0 && landedAt < 0
      const run = clamp01(skyT / RUN)
      const ride = clamp01((skyT - RUN) / RIDE)
      const fallT = skyT - RUN - RIDE
      const leap = clamp01(fallT / LEAP)
      const descend = clamp01(fallT / G)
      // The song, from its first second, as you leave Matsya's back.
      if (skyOn && fallT >= 0 && songAt < 0) {
        songAt = time
        if (audio) analyser = score.playSong(audio, 0)
      }
      // The drop: you are in the forge.
      if (skyOn && fallT >= G) {
        landedAt = time
        el.scrollTop = titleTop
        window.setTimeout(() => hold(false), 300)
      }
      // Past it all some other way (a jump to the end): the forge is simply there.
      if (landedAt < 0 && top >= titleTop - vh * 0.5) {
        landedAt = time
        eyeDone = true
        hold(false)
        if (audio && songAt < 0) analyser = score.playSong(audio, song.from)
      }
      const since = landedAt < 0 ? -1 : time - landedAt

      // ---- which world, and draw it
      let worldOn = true
      if (worldCv.current && !(skyOn && fallT > 0)) worldCv.current.style.opacity = '1'
      if (skyOn && !eyePlaying) {
        const still = smooth(G - STILL - 0.1, G - STILL, fallT)
        // Hold still at the breaking point (the camera freezes where it is).
        const d = fallT >= 0 ? Math.min(descend, (G - STILL) / G) : 0
        sky.update(Math.max(time - cutAt, 0), run, ride, leap, time, d)
        const sk = sky.sketch
        if (fallT >= 0) {
          // The glitching builds with the song's run-up.
          const f = descend
          sk.mono = 0.9 * smooth(0.04, 0.85, f) + 0.1 * still
          sk.glitch = (0.03 + 0.25 * smooth(0.25, 0.92, f)) * (1 - still)
          // Reality gives, in its second half: a monochrome frame, or its
          // negative, at most about twice a second.
          if (!reduceMotion() && f > 0.45 && still < 0.5) {
            const beat = Math.floor(fallT / 0.55)
            if (fallT % 0.55 < 0.09 && hash01(beat) > 0.25) {
              sk.mono = 1
              sk.dark = beat % 2 ? 1 : 0
            }
          }
        }
        const rush = fallT >= 0 ? smooth(0.06, 0.8, descend) * (1 - still) : 0
        world.render(sky.scene, sky.camera, sk, time, { zoom: 0.25 * sky.state.leap + 0.45 * rush, shake: 0.004 * sky.state.shake + 0.005 * rush, flash: sky.state.white })
        if (fallT < 0) overlay.speed(Math.max(sky.state.speed - 9, 0) / 12, time)
        // The score follows the run beat by beat, and hears the cloud.
        if (sky.state.beat !== runBeat) {
          runBeat = sky.state.beat
          if (runBeat && fallT < 0) score.cue('run-' + runBeat)
        }
        if (Math.abs(sky.state.white - heard) > 0.02 || (heard > 0 && sky.state.white === 0)) {
          heard = sky.state.white
          score.muffle(heard)
        }
        overlay.air(rush, time, false)
        // The new world comes in under the frozen one: the drawing fades as
        // the pattern waves spiral in.
        if (worldCv.current) worldCv.current.style.opacity = String(1 - smooth(G - STILL, G - 0.1, fallT))
      } else if (eyePlaying || (inDescent && dP >= SPIRAL_END)) {
        // ---- the tree (and, at its end, the eye)
        const k = clamp01((dP - SPIRAL_END) / (1 - SPIRAL_END))
        tree.update(k, time)
        if (eyePlaying) {
          const crack = smooth(0.1, 0.6, eyeT)
          const open = smooth(0.65, 1.3, eyeT)
          const gathered = smooth(1.3, 1.9, eyeT)
          eyePlane.visible = true
          eyePlane.lookAt(tree.camera.position)
          drawEyeArt(eyeCanvas, open, 1 - gathered, smooth(0.4, 1.4, eyeT))
          eyeTex.needsUpdate = true
          tree.sketch.glitch = 0.35 * crack * (1 - open) + 0.15 * smooth(1.9, 2.4, eyeT)
          const shake = (eyeT > 1.95 && eyeT < 2.3) || (eyeT > 2.4 && eyeT < 2.75) ? 0.006 : 0
          if (eyeT < EYE_CUT) world.render(tree.scene, tree.camera, tree.sketch, time, { shake })
          onScreen(eyePlane.position, tree.camera, innerWidth, innerHeight, eyeOnScreen)
          if (eyeT >= EYE_CUT && cutAt < 0) {
            // The page, as it is the instant the rays cut it, becomes the slab.
            world.render(tree.scene, tree.camera, tree.sketch, time)
            sky.build(world.capture(), landing, { x: eyeOnScreen.x / innerWidth, y: eyeOnScreen.y / innerHeight, w: (Math.min(innerWidth, innerHeight) * 0.07) / innerWidth })
            cutAt = time
            score.cue('forge-cut')
          }
          if (eyeT >= EYE_CUT) {
            sky.update(time - cutAt, 0, 0, 0, time)
            world.render(sky.scene, sky.camera, sky.sketch, time)
          }
          overlay.gather(eyeOnScreen.x, eyeOnScreen.y, gathered < 1 ? gathered : 0)
          const m = Math.min(innerWidth, innerHeight) * 0.07
          const vW = m * easeOut01((eyeT - 1.95) / 0.18)
          const hW = m * easeOut01((eyeT - 2.4) / 0.18)
          const fade = 1 - smooth(EYE_CUT, EYE_LENGTH, eyeT)
          overlay.rays(eyeOnScreen.x, eyeOnScreen.y, vW * (1 + 0.6 * (1 - fade)), hW * (1 + 0.6 * (1 - fade)), fade, time)
          if ((eyeT > 1.95 && eyeT < 2.02) || (eyeT > 2.4 && eyeT < 2.47)) overlay.impact()
        } else {
          eyePlane.visible = false
          world.render(tree.scene, tree.camera, tree.sketch, time, { flash: 1 - smooth(SPIRAL_END, SPIRAL_END + 0.03, dP) })
          // Each branch, as it grows, on its own card: the domain and its tools.
          const n = tree.tags.length
          const f = clamp01((k - 0.08) / 0.84) * n
          const i = Math.min(Math.floor(f), n - 1)
          const local = f - i
          const tag = tree.tags[i]
          onScreen(tag.slip.getWorldPosition(probeV), tree.camera, innerWidth, innerHeight, probe)
          overlay.card(
            smooth(0, 0.12, local) * (1 - smooth(0.88, 1, local)) * (k > 0.08 && k < 0.96 ? 1 : 0),
            i % 2 ? 'right' : 'left',
            `BRANCH ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')} — THE TREE OF WISDOM`,
            tag.domain.name,
            tag.domain.hi,
            tag.domain.leaves,
            tag.group.scale.x > 0.2 ? probe : null,
            i + 1,
          )
        }
      } else if (inDescent) {
        // ---- the spiral
        const u = clamp01(dP / SPIRAL_END)
        spiral.update(u, time)
        world.render(spiral.scene, spiral.camera, spiral.sketch, time, { flash: smooth(SPIRAL_END - 0.03, SPIRAL_END, dP) })
        // Each milestone, as you come down past it, on its own card.
        {
          const n = spiral.plaques.length
          const f = clamp01((u - 0.1) / 0.78) * n
          const i = Math.min(Math.floor(f), n - 1)
          const local = f - i
          const pl = spiral.plaques[i]
          onScreen(pl.centre, spiral.camera, innerWidth, innerHeight, probe)
          overlay.card(
            smooth(0, 0.14, local) * (1 - smooth(0.86, 1, local)) * (u > 0.1 && u < 0.9 ? 1 : 0),
            i % 2 ? 'right' : 'left',
            `MILESTONE ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')} · ${pl.m.year.toUpperCase()}`,
            pl.m.title,
            '',
            [pl.m.note],
            probe,
            i + 1,
            spiral.sketch.dark > 0.5,
          )
        }
      } else worldOn = false
      show(worldCv.current, worldOn)
      show(overlayCv.current, worldOn)

      // The new world: the pattern waves spiral in under the frozen sky
      // just before the drop, and the song's gradient comes up on it.
      const spiralIn = skyOn && fallT >= G - STILL
      const wavesOn = spiralIn || (landedAt >= 0 && top > titleTop - vh)
      show(wavesCv.current, wavesOn)
      if (wavesOn && waves) waves.render(time, spiralIn ? smooth(G - STILL, G, fallT) : 1, levels.read(analyser, time), landedAt < 0 ? 0 : clamp01(since / 1.2))
      // On the drop: a burst of cells living and dying in the song's colours
      // (Game of Life), and out of it your face and the title come together
      // from particles drawn in from either side.
      const arriving = since >= 0 && since < 3.2 && top < titleTop + vh * 0.5
      if (arriving) {
        show(overlayCv.current, true)
        overlay.drop(since / 0.5, song.accent)
        overlay.life(since, song.palette, song.accent)
        if (!assembling) assembling = overlay.prepareAssembly(titleCardRef.current)
        overlay.assemble(assembling, clamp01((since - 0.6) / 2.2))
      }
      titleCardRef.current?.classList.toggle('is-waiting', landedAt >= 0 ? since < 2.8 : true)
      const portraitOn = landedAt >= 0 && top > titleTop - vh * 0.5 && tP < 1
      show(portraitCv.current, portraitOn)
      if (portraitOn && portrait) portrait.render(time, pointer, Math.max(clamp01((since - 0.5) / 2.4), clamp01(tP / 0.15)), 2.2 - 1.2 * ease((tP - 0.05) / 0.6))
      const orbitOn = top > orbitEl.offsetTop - vh && top < orbitEl.offsetTop + orbitEl.offsetHeight
      show(orbitCv.current, orbitOn)
      if (orbitOn) orbit.render(oP, time)

      // ---- where we are
      let next: Stage
      if (eyePlaying) next = 'eye'
      else if (skyOn) next = fallT >= 0 ? 'rift' : ride > 0 ? 'ride' : 'sky'
      else if (inDescent) next = dP < SPIRAL_END ? 'spiral' : 'tree'
      else if (top < orbitEl.offsetTop - vh * 0.3) next = 'forge'
      else if (top < orbitEl.offsetTop + orbitEl.offsetHeight - vh) next = 'orbit'
      else next = 'list'
      if (next !== current) {
        current = next
        setStage(next)
        if (landedAt < 0 && CUES[next]) score.cue(CUES[next]!)
      }
      if (pctRef.current) pctRef.current.textContent = String(Math.round((top / Math.max(el.scrollHeight - vh, 1)) * 100)).padStart(3, '0')
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('wheel', onWheel)
      world.dispose()
      orbit.dispose()
      score.stopSong()
      orbitApi.current = null
    }
  }, [onBack, landing, score, song])

  const seg = Math.max(
    SEGMENTS.findIndex((s) => s.stage.includes(stage)),
    0,
  )
  const all = repos ?? []
  const tone = stage === 'spiral' ? 'paper' : 'dark'

  return (
    <div className="forge" ref={scroller} data-song={song.id} style={{ '--f-accent': song.accent } as React.CSSProperties}>
      <div className="forge__layers" aria-hidden="true">
        <canvas ref={wavesCv} />
        <canvas ref={orbitCv} />
        <canvas ref={portraitCv} />
        <canvas ref={worldCv} />
        <canvas ref={overlayCv} />
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

      <section className="sec sec--title" ref={titleSec} aria-labelledby="forge-title">
        <div className="title-card" ref={titleCardRef}>
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
                <button className="row" onClick={() => setOpen(i)} onPointerEnter={() => peek(r)} onPointerLeave={() => peek(null)} data-cursor="open" data-cursor-label="open">
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
      <div className="peek" ref={peekRef} aria-hidden="true" />
      {(stage === 'sky' || stage === 'ride' || stage === 'rift') && (
        <button className="skip" onClick={() => (skipRef.current = 1)} data-cursor="open" data-cursor-label="skip">
          Skip to the forge <span aria-hidden="true">→</span>
        </button>
      )}
      <Matsya line={LINES[stage]} hidden={stage === 'ride' || stage === 'rift' || open !== null} />
      {open !== null && all[open] && <Project repos={all} index={open} onGo={setOpen} onClose={() => setOpen(null)} song={song} />}
      <Cursor />
    </div>
  )
}

// A project's own page, printed for the forge: its name large in a classical
// serif, striped and slipping like a signal (after Son Daven); its picture
// redrawn in lines, resolving scanline by scanline; what it is, set as a
// prologue; the facts; the README; and down the edge a ruler, as Zero's
// timeline, reading how far through it you are.
function Project({ repos, index, onGo, onClose, song }: { repos: Repo[]; index: number; onGo: (i: number) => void; onClose: () => void; song: Song }) {
  const repo = repos[index]
  const nextIndex = (index + 1) % repos.length
  const [html, setHtml] = useState<string | null | undefined>(undefined)
  const [read, setRead] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const artRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    panel.current?.scrollTo({ top: 0 })
    loadReadme(repo).then((h) => alive && setHtml(h))
    projectArt(repo, [song.palette[1], song.palette[2]]).then((c) => {
      if (!alive || !artRef.current) return
      artRef.current.replaceChildren(c)
      artRef.current.classList.remove('is-in')
      void artRef.current.offsetWidth
      artRef.current.classList.add('is-in')
    })
    return () => {
      alive = false
      setHtml(undefined)
    }
  }, [repo, song])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    setCursor('default')
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const created = new Date(repo.created_at).getFullYear()
  const pushed = new Date(repo.pushed_at).getFullYear()
  const name = prettyName(repo.name)
  return (
    <div
      className="project"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-title"
      ref={panel}
      tabIndex={-1}
      onScroll={(e) => {
        const t = e.currentTarget
        setRead(Math.round((t.scrollTop / Math.max(t.scrollHeight - t.clientHeight, 1)) * 100))
      }}
    >
      <aside className="project__ruler" aria-hidden="true">
        <span className="project__ruler-mark" style={{ top: `${read}%` }} />
        <b>{String(read).padStart(3, '0')}</b>
      </aside>
      <header className="project__top">
        <button className="project__back" onClick={onClose} data-cursor="open" data-cursor-label="back">
          ← All work
        </button>
        <span>
          Project {String(index + 1).padStart(2, '0')} / {String(repos.length).padStart(2, '0')}
        </span>
      </header>
      <p className="project__eyebrow">■ {labelOf(repo)}</p>
      <h3 id="project-title" className="project__title" data-text={name} key={repo.name}>
        {name}
      </h3>
      <div className="project__art" ref={artRef} aria-hidden="true" />
      {repo.description && (
        <blockquote className="project__prologue">
          <span>Prologue</span>
          {repo.description}
        </blockquote>
      )}
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
        <strong data-text={prettyName(repos[nextIndex].name)}>{prettyName(repos[nextIndex].name)}</strong>
      </button>
    </div>
  )
}
