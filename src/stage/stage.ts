import * as THREE from 'three'
import { gsap } from 'gsap'
import { createCosmos } from './cosmos'
import { createEyes } from './eyes'
import { createHand } from './hand'
import { createFx } from './fx'
import { createPost } from './post'
import { createGate } from './gate'
import { createVeil } from './veil'
import { createPothi } from './pothi'
import { ACT_BEATS, ACT_CUES, ACT_LENGTH, IMPACT, createAct } from './act'
import { fontsReady } from './actText'
import { createSketchLayer } from './sketchLayer'

export type IntroEvents = {
  onLanding?: () => void
  onCue?: (cue: string) => void
  // The story waits at each beat for the visitor to scroll on.
  onWait?: (waiting: boolean) => void
}

export type Stage = ReturnType<typeof createStage>

// When the cutscene hands over to the 3D act.
export const ACT_START = 17.6

export function createStage(canvas: HTMLCanvasElement) {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const pixelRatio = Math.min(window.devicePixelRatio, small ? 1.5 : 1.75)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 1)
  renderer.setPixelRatio(pixelRatio)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50)
  camera.position.set(0, 0, 6)

  const cosmos = createCosmos()
  const eyes = createEyes()
  const hand = createHand({ small })
  const fx = createFx({ small })
  scene.add(cosmos.mesh, fx.group, eyes.mesh, hand.group)
  const post = createPost(renderer, scene, camera)
  const P = post.uniforms
  const veil = createVeil()
  const act = createAct(renderer, { small })
  const pothi = createPothi()
  const sketchLayer = createSketchLayer(act)
  let talking = 0
  let pothiSpeaking = false
  let inAct = false
  // Point the lens at the 3D act, or back at the cutscene.
  function setAct(on: boolean) {
    inAct = on
    post.setView(on ? act.scene : scene, on ? act.camera : camera, on)
    // A drawn world wants little bloom: only the true lights glow.
    if (on) post.setBloom(0.16, 0.95)
    else post.setBloom(0.42, 0.86)
  }
  // While the gate waits for a choice, draw every phase of the act once off
  // screen so its shaders and textures are ready: no stall when the drop falls.
  let warmed = false
  fontsReady.then(() =>
    window.setTimeout(() => {
      if (inAct || warmed) return
      warmed = true
      void act.warm(() => inAct).then(() => renderer.compileAsync(pothi.scene, act.camera)).catch(() => {})
    }, 700),
  )
  const gate = createGate({ small })
  scene.add(gate.group)
  const G = gate.uniforms
  gsap.to(G.uAlpha, { value: 1, duration: 2.4, ease: 'power2.out', delay: 0.2 })

  const C = cosmos.uniforms
  const E = eyes.state
  const H = hand.uniforms
  const X = fx.state

  const buffer = new THREE.Vector2()
  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.getDrawingBufferSize(buffer)
    post.setSize(w, h, buffer)
    C.uRes.value.copy(buffer)
    C.uFit.value = w < h ? Math.min(1, (w / h) * 1.45) : 1
    eyes.setLayout(buffer, w / h, pixelRatio)
    veil.setSize(buffer, pixelRatio, h)
    hand.setLayout(w / h, pixelRatio, h, buffer)
    fx.setLayout(buffer, pixelRatio)
    gate.setLayout(buffer, w / h, pixelRatio)
    act.setSize(w, h)
    sketchLayer.resize(w, h)
  }
  resize()
  window.addEventListener('resize', resize)

  // Pointer in the cosmos shader's units (height-normalised, centred), eased.
  const pointer = new THREE.Vector2(0, 0)
  const pointerTarget = new THREE.Vector2(0, 0)
  function onPointer(e: PointerEvent) {
    pointerTarget.set((e.clientX - innerWidth / 2) / innerHeight, (innerHeight / 2 - e.clientY) / innerHeight)
  }
  window.addEventListener('pointermove', onPointer)

  const HOLD_TIME = 1.7
  let holding = false
  let onAwaken: (() => void) | null = null
  // Press (or release) the gate's ball; `awaken` runs once it is fully charged.
  function hold(on: boolean, awaken?: () => void) {
    holding = on && G.uAlpha.value > 0.05
    if (on && awaken) onAwaken = awaken
  }

  // Camera shake, as an amplitude the timeline animates; the offset itself is
  // redrawn on twos, like a shaken key frame.
  const shake = { amount: 0 }
  let shakeStep = -1

  const timer = new THREE.Timer()
  let frame = 0
  let afterRender: (() => void) | null = null
  function draw() {
    timer.update()
    const t = timer.getElapsed()
    const dt = timer.getDelta()
    C.uTime.value = t
    pointer.lerp(pointerTarget, 0.08)
    C.uMouse.value.copy(pointer)
    gate.update(t, dt, pointer)
    if (inAct) act.update(t, pointer)
    post.setZoomBlur(inAct ? act.speed() : 0)
    post.setPaper(0)
    post.setSketch(inAct ? act.sketch() : null)
    // Holding the gate's ball charges it; letting go lets it settle.
    if (holding || G.uCharge.value > 0) {
      G.uCharge.value = THREE.MathUtils.clamp(G.uCharge.value + (holding ? dt / HOLD_TIME : -dt * 1.4), 0, 1)
      if (holding && G.uCharge.value >= 1) {
        holding = false
        const done = onAwaken
        onAwaken = null
        done?.()
      }
    }
    const step = Math.floor(t * 12)
    if (step !== shakeStep) {
      shakeStep = step
      P.uShake.value.set((Math.random() - 0.5) * shake.amount, (Math.random() - 0.5) * shake.amount)
    }
    veil.update(renderer, dt, t)
    eyes.setVeil(veil.texture)
    hand.setVeil(veil.texture)
    eyes.setPointer(pointer)
    hand.setPointer(pointer)
    fx.setPointer(pointer)
    eyes.update(t)
    hand.update(t)
    fx.update(t)
    eyes.render(renderer)
    // The world dims a little while the companion talks, so its words read.
    talking += ((pothiSpeaking ? 1 : 0) - talking) * Math.min(dt * 2, 1)
    P.uDim.value = inAct ? talking * 0.32 : 0
    post.render(t)
    // The pothi, over the finished world, in its own light.
    if (inAct) {
      pothi.update(t, act.camera, pointer, camera.aspect < 1)
      if (pothi.scene.visible) {
        renderer.autoClear = false
        renderer.setRenderTarget(null)
        renderer.clearDepth()
        renderer.render(pothi.scene, act.camera)
        renderer.autoClear = true
      }
    }
    sketchLayer.draw(t, inAct)
    afterRender?.()
    afterRender = null
  }
  // Behind the forge the stage is hidden: it stops drawing until it is back.
  let paused = false
  function loop() {
    if (!paused) draw()
    frame = requestAnimationFrame(loop)
  }
  loop()

  let timeline: gsap.core.Timeline | null = null

  function reset() {
    timeline?.kill()
    timeline = null
    C.uStar.value = 0
    C.uHole.value = 0
    C.uGeo.value = 0
    C.uKaleido.value = 0
    C.uRot.value = 0
    C.uSettle.value = 0
    C.uLantern.value = 0
    eyes.uniforms.uAlpha.value = 0
    eyes.uniforms.uAppear.value = 0
    eyes.uniforms.uRipple.value = 1
    eyes.uniforms.uPull.value = 0
    Object.assign(E, { expression: 0, blink: 1, skin: 0.35, x: 0, y: 0, zoom: 1, twitch: 0, follow: 0 })
    veil.setEnabled(false)
    waiting = false
    hand.state.sign = 0
    hand.state.react = 0
    Object.assign(hand.state.frame, { x: 0, y: 0, scale: 1, yaw: 0 })
    H.uAlpha.value = 0
    H.uEmber.value = 0
    Object.assign(X, { glow: 0, lines: 0, embers: 0, wind: 0.15, rise: 0.35, sigil: 0, flare: 0 })
    P.uInvert.value = 0
    P.uBars.value = 0
    shake.amount = 0
    act.state.t = 0
    post.flash.value = 0
    setAct(false)
  }

  // The ball collapses to a point — the distant star the story opens on.
  function leaveGate() {
    // The gate may still be fading in; that tween must not fight the collapse.
    gsap.killTweensOf([G.uAlpha, G.uCollapse])
    return new Promise<void>((resolve) => {
      gsap
        .timeline({
          onComplete: () => {
            G.uAlpha.value = 0
            resolve()
          },
        })
        .to(G.uCollapse, { value: 1, duration: 1.1, ease: 'power3.in' })
        .to(G.uCharge, { value: 0, duration: 0.5, ease: 'power2.in' }, 0.4)
        .to(G.uAlpha, { value: 0, duration: 0.35, ease: 'power2.in' }, 0.85)
    })
  }

  function arrive() {
    introEvents.onWait?.(false)
    gsap.killTweensOf([G.uAlpha, G.uCollapse])
    G.uAlpha.value = 0
    reset()
    act.state.t = ACT_LENGTH
    setAct(true)
  }

  // The cutscene, shot by shot (seconds). It does not run straight through:
  // at each ◆ it stops and the scene idles, alive (lids breathing, the eyes
  // turning to the cursor, the hand following it, embers scattering from it,
  // the cursor's veil burning through the dots to the drawing beneath) until
  // the visitor scrolls on. There is no hurry: it waits as long as they like.
  //
  //   0.0  black; the letterbox bars close in; a distant star shines and goes
  //   3.7  SHOT 1  extreme close-up: an eye, shut, the dots catching. The lid
  //                flutters                                              ◆ 6.25
  //   6.3  SHOT 2  the hand, side on, lit by fire from behind; on twos, the
  //                fingers curl into the sign                            ◆ 9.15
  //   9.2  SHOT 3  back on the eye — it snaps open, a shockwave through the dots
  //  10.3  SHOT 4  impact frames: inverted, focus lines, the lens shaken
  //  10.6  SHOT 5  wide: both eyes over the hand, embers on the wind     ◆ 12.25
  //  12.3         a blink; then the brows come down                     ◆ 15.1
  //  15.2         the lens dives into the iris, faster and faster — white
  //  17.6         the 3D act: dawn, the lotus, जिज्ञासा                    ◆ act 19.6
  //               over the lotus and out over the crowded pond, the mind ◆ act 26.5
  //               the drop, the stillness, the world                    ◆ act 36.6
  //               the lotus rises with the name
  const BEATS = [6.25, 9.15, 12.25, 15.1, ...ACT_BEATS.map((b) => ACT_START + b)]
  let waiting = false
  let lastAdvance = 0
  let introEvents: IntroEvents = {}

  function wait(on: boolean) {
    waiting = on
    introEvents.onWait?.(on)
  }

  // Scroll on: carry the story to its next beat.
  function advance() {
    if (!timeline || !waiting) return
    const now = performance.now()
    if (now - lastAdvance < 600) return
    lastAdvance = now
    wait(false)
    timeline.play()
  }

  async function playIntro(events: IntroEvents = {}) {
    reset()
    introEvents = events
    await hand.ready
    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } })
    timeline = tl
    const cue = (name: string, at: number) => tl.call(() => events.onCue?.(name), [], at)
    const eye = eyes.irisOf(1)
    const frame = hand.state.frame
    const EU = eyes.uniforms

    tl.to(P.uBars, { value: 0.105, duration: 1.4, ease: 'power3.out' }, 0)
      .to(C.uStar, { value: 0.12, duration: 1.1, ease: 'sine.out' }, 0.3)
      .to(C.uStar, { value: 1, duration: 0.8, ease: 'power3.in' }, 1.6)
      .to(C.uStar, { value: 0, duration: 1.0, ease: 'power2.out' }, 2.45)

    // SHOT 1: the shut eye, close; the dots catch outward from the iris.
    cue('shot', 3.7)
    tl.set(EU.uAlpha, { value: 1 }, 3.7)
      .set(E, { x: eye.x + 0.02, y: eye.y + 0.05, zoom: 2.1, skin: 0.9, blink: 1, expression: 0, follow: 0 }, 3.7)
      .fromTo(EU.uAppear, { value: 0 }, { value: 1, duration: 2.2, ease: 'power1.out', immediateRender: false }, 3.7)
      .to(E, { zoom: 2.4, y: eye.y + 0.02, duration: 2.6, ease: 'sine.inOut' }, 3.7)
      .call(() => veil.setEnabled(true), [], 3.8)
      .set(X, { embers: 0.35, wind: 0.05, rise: 0.25 }, 3.7)
      .to(E, { twitch: 1, duration: 0.07, ease: 'power2.out', yoyo: true, repeat: 3 }, 4.9)
      .to(E, { twitch: 1, duration: 0.06, ease: 'power2.out', yoyo: true, repeat: 1 }, 5.75)
    cue('twitch', 4.9)
    cue('twitch', 5.75)

    // SHOT 2: the hand.
    cue('hand', 6.3)
    tl.set(EU.uAlpha, { value: 0 }, 6.3)
      .set(H.uAlpha, { value: 1 }, 6.3)
      .set(H.uEmber, { value: 0.45 }, 6.3)
      .set(frame, { x: 0.15, y: -0.25, scale: 1.3, yaw: -0.18 }, 6.3)
      .to(frame, { scale: 1.42, yaw: 0.06, y: -0.32, duration: 2.9, ease: 'sine.inOut' }, 6.3)
      .set(X, { glow: 1, embers: 0.8, wind: 0.12, rise: 0.45 }, 6.3)
      .set(fx.glowAt, { x: 0.25, y: -0.1 }, 6.3)
      .set(fx.sigilAt, { x: 0.25, y: 0.02 }, 6.3)
      .set(fx.sigilScale, { value: 1.25 }, 6.3)
      .to(X, { sigil: 0.75, duration: 2.0, ease: 'power2.out' }, 7.2)
      .to(hand.state, { sign: 1, duration: 2.3, ease: 'power2.inOut' }, 6.7)
      .to(H.uEmber, { value: 1, duration: 2.0, ease: 'sine.in' }, 6.8)
      .to(hand.state, { react: 1, duration: 0.6 }, 9.0)
    cue('sign', 6.7)

    // SHOT 3: the eye again — and it opens.
    cue('eye', 9.2)
    tl.set(H.uAlpha, { value: 0 }, 9.2)
      .set(hand.state, { react: 0 }, 9.2)
      .set(X, { glow: 0, embers: 0.45, sigil: 0 }, 9.2)
      .set(EU.uAlpha, { value: 1 }, 9.2)
      .set(E, { x: eye.x - 0.01, y: eye.y + 0.02, zoom: 2.6, skin: 0.9, blink: 1, expression: 1 }, 9.2)
      .to(E, { zoom: 2.8, duration: 1.1, ease: 'sine.out' }, 9.2)
      .to(E, { blink: 0, duration: 0.12, ease: 'expo.out' }, 9.6)
      .fromTo(EU.uRipple, { value: 0 }, { value: 1, duration: 1.2, ease: 'power2.out', immediateRender: false }, 9.6)
      .fromTo(shake, { amount: 0.012 }, { amount: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, 9.6)
    cue('snap', 9.6)

    // SHOT 4: impact frames.
    cue('hit', 10.3)
    tl.set(P.uInvert, { value: 1 }, 10.3)
      .set(X, { lines: 1 }, 10.3)
      .set(fx.linesAt, { x: 0, y: 0.05 }, 10.3)
      .set(P.uInvert, { value: 0 }, 10.38)
      .set(P.uInvert, { value: 1 }, 10.46)
      .set(P.uInvert, { value: 0 }, 10.55)
      .fromTo(shake, { amount: 0.03 }, { amount: 0, duration: 0.9, ease: 'power3.out', immediateRender: false }, 10.3)

    // SHOT 5: wide — and from here the eyes follow the cursor.
    cue('wide', 10.6)
    tl.set(E, { x: 0, y: 0, zoom: 1.12, skin: 0.4, expression: 1, follow: 1 }, 10.6)
      .to(E, { zoom: 1.0, duration: 1.6, ease: 'sine.out' }, 10.6)
      .set(H.uAlpha, { value: 1 }, 10.6)
      .set(H.uEmber, { value: 1 }, 10.6)
      .set(frame, { x: 0, y: 0, scale: 1, yaw: 0 }, 10.6)
      .set(hand.state, { react: 0.6 }, 10.6)
      .set(X, { glow: 0.85, embers: 1, wind: 0.35, rise: 0.6 }, 10.6)
      .set(fx.sigilAt, { x: 0, y: -0.06 }, 10.6)
      .set(fx.sigilScale, { value: 1.05 }, 10.6)
      .fromTo(X, { sigil: 0 }, { sigil: 1, duration: 1.4, ease: 'power2.out', immediateRender: false }, 10.6)
      .fromTo(X, { flare: 1 }, { flare: 0, duration: 1.2, ease: 'power2.out', immediateRender: false }, 10.6)
      .set(fx.glowAt, { x: 0, y: -0.4 }, 10.6)
      .to(X, { lines: 0, duration: 0.5, ease: 'power2.in' }, 10.6)
      .to(E, { blink: 1, duration: 0.07, ease: 'power2.in' }, 12.3)
      .to(E, { blink: 0, duration: 0.18, ease: 'power2.out' }, 12.37)
      .to(E, { expression: 2, duration: 0.5, ease: 'expo.out' }, 13.4)
      .to(E, { skin: 1, duration: 0.7, ease: 'power2.out' }, 13.4)
      .fromTo(EU.uRipple, { value: 0 }, { value: 1, duration: 1.4, ease: 'power2.out', immediateRender: false }, 13.4)
      .to(X, { wind: 0.9, duration: 0.8, ease: 'power2.out' }, 13.4)
      .fromTo(X, { flare: 1.2 }, { flare: 0.15, duration: 1.6, ease: 'power2.out', immediateRender: false }, 13.4)
      .fromTo(shake, { amount: 0.014 }, { amount: 0, duration: 1.2, ease: 'power2.out', immediateRender: false }, 13.4)
    cue('blink', 12.3)
    cue('menace', 13.4)

    // The dive into the iris.
    cue('dive', 15.2)
    tl.call(() => veil.setEnabled(false), [], 15.2)
      .set(E, { follow: 0 }, 15.2)
      .to(E, { x: eye.x, y: eye.y, duration: 1.6, ease: 'power2.inOut' }, 15.2)
      .to(E, { zoom: 14, duration: 2.0, ease: 'power4.in' }, 15.2)
      .to(EU.uPull, { value: 0.6, duration: 2.0, ease: 'power2.in' }, 15.4)
      .to(H.uAlpha, { value: 0, duration: 0.6, ease: 'power2.in' }, 15.3)
      .to(X, { glow: 0, sigil: 0, duration: 0.8 }, 15.3)
      .set(fx.linesAt, { x: 0, y: 0 }, 15.6)
      .to(X, { lines: 0.7, duration: 1.2, ease: 'power2.in' }, 15.6)
      .to(X, { embers: 0, duration: 1.0 }, 15.8)
      .to(shake, { amount: 0.01, duration: 1.6, ease: 'power2.in' }, 15.6)
      // White-out, and behind it the cut into the 3D act.
      .to(post.flash, { value: 1, duration: 0.4, ease: 'power3.in' }, 17.2)
      .set(shake, { amount: 0 }, 17.6)
      .set(X, { lines: 0 }, 17.6)
      .set(EU.uAlpha, { value: 0 }, 17.6)
      .call(() => setAct(true), [], ACT_START)
      .to(post.flash, { value: 0, duration: 0.9, ease: 'power2.out' }, ACT_START)
      .to(act.state, { t: ACT_LENGTH, duration: ACT_LENGTH, ease: 'none' }, ACT_START)
      .to(P.uBars, { value: 0, duration: 1.6, ease: 'power2.inOut' }, ACT_START + ACT_LENGTH - 1.4)
      .call(() => events.onLanding?.(), [], ACT_START + ACT_LENGTH - 0.5)
      // A breath of light as the drop lands.
      .to(post.flash, { value: 0.22, duration: 0.06, ease: 'power2.out' }, ACT_START + IMPACT)
      .to(post.flash, { value: 0, duration: 1.4, ease: 'power2.out' }, ACT_START + IMPACT + 0.06)
    cue('flash', 17.2)
    cue('act', ACT_START)
    for (const { t, cue: name } of ACT_CUES) cue(name, ACT_START + t)
    for (const at of BEATS) tl.addPause(at, () => wait(true))
    return tl
  }

  function dispose() {
    timeline?.kill()
    cancelAnimationFrame(frame)
    timer.dispose()
    window.removeEventListener('resize', resize)
    window.removeEventListener('pointermove', onPointer)
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    })
    post.dispose()
    sketchLayer.dispose()
    eyes.dispose()
    veil.dispose()
    renderer.dispose()
  }

  return {
    ready: hand.ready,
    leaveGate,
    hold,
    // The companion: show it, send it to a part of the story (or -1 to rest),
    // let it speak; `anchor` is where it is on screen (NDC).
    companion: {
      show: (on: boolean) => pothi.show(on),
      goTo: (i: number) => pothi.goTo(i),
      speak: (on: boolean) => {
        pothiSpeaking = on
        pothi.speak(on)
      },
      anchor: pothi.anchor,
    },
    // Debug: drive GSAP by hand when the page's frames are throttled.
    time: () => timeline?.time() ?? -1,
    tick: () => {
      gsap.ticker.tick()
      draw()
    },
    playIntro,
    advance,
    // The landing as it looks now, as one picture: the frame, and the drawn
    // layer multiplied into it (the forge tears it into debris).
    capture() {
      draw()
      const c = document.createElement('canvas')
      c.width = canvas.width
      c.height = canvas.height
      const g = c.getContext('2d')!
      g.drawImage(canvas, 0, 0)
      g.globalCompositeOperation = 'multiply'
      g.drawImage(sketchLayer.canvas, 0, 0, c.width, c.height)
      return c
    },
    setPaused(on: boolean) {
      paused = on
      sketchLayer.canvas.style.visibility = on ? 'hidden' : ''
    },
    arrive,
    dispose,
    // Debug aids: jump the intro to a moment, e.g. stage.seek(13.6), and
    // magnify a region of the canvas at device resolution: stage.loupe(x, y, w, h, zoom).
    seek: (t: number) => {
      timeline?.pause().seek(t)
      setAct(t >= ACT_START)
      draw()
    },
    debugHand: (on: boolean) => (H.uDebug.value = on ? 1 : 0),
    actScene: act.scene,
    post,
    scene,
    renderer,
    parts: { cosmos, eyes, hand, gate, fx, veil },
    debugAct: (t: number) => {
      timeline?.pause()
      post.flash.value = 0
      setAct(true)
      act.state.t = t
      draw()
    },
    debugGate: () => {
      gsap.killTweensOf(G.uAlpha)
      G.uAlpha.value = 1
      draw()
    },
    loupe(x: number, y: number, w: number, h: number, zoom = 1) {
      document.getElementById('loupe')?.remove()
      if (w === 0) return Promise.resolve('')
      return new Promise<string>((resolve) => {
        afterRender = () => {
          const crop = document.createElement('canvas')
          const ratio = renderer.getPixelRatio()
          crop.width = w * ratio
          crop.height = h * ratio
          crop.getContext('2d')!.drawImage(canvas, x * ratio, y * ratio, w * ratio, h * ratio, 0, 0, w * ratio, h * ratio)
          crop.id = 'loupe'
          Object.assign(crop.style, {
            position: 'fixed', inset: '0', zIndex: '99', imageRendering: 'pixelated', background: '#000',
            width: `${(w * ratio * zoom) / devicePixelRatio}px`, height: `${(h * ratio * zoom) / devicePixelRatio}px`,
          })
          document.body.appendChild(crop)
          resolve(`${crop.width}x${crop.height}`)
        }
      })
    },
  }
}
