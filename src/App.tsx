import { useCallback, useEffect, useRef, useState } from 'react'
import { createStage, type Stage, type IntroEvents } from './stage/stage'
import { Score } from './audio/score'
import { Gate } from './ui/Gate'
import { Landing } from './ui/Landing'
import { Forge } from './ui/Forge'

type Phase = 'gate' | 'intro' | 'landing' | 'forge'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const audioRef = useRef(new Score())
  const [phase, setPhase] = useState<Phase>('gate')
  const [muted, setMuted] = useState(true)
  const [waiting, setWaiting] = useState(false)

  useEffect(() => {
    const stage = createStage(canvasRef.current!)
    stageRef.current = stage
    if (import.meta.env.DEV) {
      const w = window as unknown as { stage: Stage; toLanding: () => void; toForge: () => void; score: Score }
      w.stage = stage
      w.score = audioRef.current
      w.toLanding = () => {
        stage.arrive()
        setPhase('landing')
      }
      w.toForge = () => {
        stage.arrive()
        setLandingShot(stage.capture())
        setPhase('forge')
      }
    }
    return () => stage.dispose()
  }, [])

  useEffect(() => () => audioRef.current.dispose(), [])

  const play = useCallback(() => {
    const audio = audioRef.current
    const events: IntroEvents = {
      onCue: (cue) => audio.cue(cue),
      onWait: (on) => setWaiting(on),
      onLanding: () => setPhase('landing'),
    }
    if (reducedMotion()) {
      audio.cue('arrive')
      stageRef.current?.arrive()
      setPhase('landing')
      return
    }
    setPhase('intro')
    stageRef.current?.playIntro(events)
  }, [])

  const [leaving, setLeaving] = useState(false)
  const enter = async (withSound: boolean) => {
    if (leaving) return
    setMuted(!withSound)
    setLeaving(true)
    if (!reducedMotion()) await stageRef.current?.leaveGate()
    setLeaving(false)
    play()
  }

  // Holding the ball: sound (if chosen) starts with the press itself, and the
  // story begins once the ball is fully charged.
  const hold = (on: boolean, withSound: boolean) => {
    const audio = audioRef.current
    if (on) {
      audio.setMuted(!withSound)
      audio.cue('hold')
    } else audio.cue('release')
    stageRef.current?.hold(on, () => {
      audio.cue('release')
      enter(withSound)
    })
  }

  const skip = useCallback(() => {
    setWaiting(false)
    audioRef.current.cue('arrive')
    stageRef.current?.arrive()
    setPhase('landing')
  }, [])

  // The intro moves on beat by beat: a scroll, a swipe up, or a key.
  useEffect(() => {
    if (phase !== 'intro') return
    const stage = () => stageRef.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
      else if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) stage()?.advance()
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 8) stage()?.advance()
    }
    let touchY = 0
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY)
    const onTouchEnd = (e: TouchEvent) => {
      if (touchY - e.changedTouches[0].clientY > 40) stage()?.advance()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [phase, skip])

  // Down from the landing into the forge (and back up out of it).
  const [landingShot, setLandingShot] = useState<HTMLCanvasElement | null>(null)
  const descend = useCallback(() => {
    setLandingShot(stageRef.current?.capture() ?? null)
    setPhase('forge')
    window.setTimeout(() => stageRef.current?.setPaused(true), 1400)
  }, [])
  const ascend = useCallback(() => {
    stageRef.current?.setPaused(false)
    setPhase('landing')
  }, [])
  useEffect(() => {
    if (phase !== 'landing') return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 30) descend()
    }
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown'].includes(e.key)) descend()
    }
    let touchY = 0
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY)
    const onTouchEnd = (e: TouchEvent) => {
      if (touchY - e.changedTouches[0].clientY > 60) descend()
    }
    // A moment first, so the scroll that finished the intro does not carry on down.
    const arm = window.setTimeout(() => {
      window.addEventListener('wheel', onWheel, { passive: true })
      window.addEventListener('keydown', onKey)
      window.addEventListener('touchstart', onTouchStart, { passive: true })
      window.addEventListener('touchend', onTouchEnd, { passive: true })
    }, 2500)
    return () => {
      window.clearTimeout(arm)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [phase, descend])

  const toggleSound = () => {
    audioRef.current.setMuted(!muted)
    setMuted(!muted)
  }

  return (
    <>
      <canvas ref={canvasRef} className="stage" aria-hidden="true" />
      {phase === 'gate' && <Gate onHold={hold} leaving={leaving} />}
      {phase === 'intro' && (
        <button className={`beat${waiting ? ' is-waiting' : ''}`} onClick={() => stageRef.current?.advance()} aria-label="Continue" tabIndex={waiting ? 0 : -1}>
          <span />
          <em>scroll</em>
        </button>
      )}
      {phase === 'intro' && (
        <button className="skip" onClick={skip}>
          Skip intro <span aria-hidden="true">→</span>
        </button>
      )}
      {phase === 'landing' && stageRef.current && <Landing muted={muted} onToggleSound={toggleSound} companion={stageRef.current.companion} onDescend={descend} />}
      {phase === 'forge' && <Forge onBack={ascend} landing={landingShot} />}
    </>
  )
}
