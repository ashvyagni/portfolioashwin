// The score, generated live so it can follow the story beat for beat. Nothing
// here is a loop someone else made: every sound is synthesised.
//
// The cutscene
//   shot      the shut eye: a low D-minor pad, and a heartbeat far off
//   twitch    the lid flutters: a breath of air
//   hand      the hand in fire-light: the heart a little nearer
//   sign      the fingers find the sign: a low swell
//   eye       back on the eye: strings tremble in
//   snap      it opens: a rush of air; the heart jumps
//   hit       impact frames: sub boom and a crack of air
//   blink     a breath of air
//   menace    the brows come down: a second, darker boom and a dissonant chord
//   dive      into the iris: a riser climbing into the white-out — then silence
// The act
//   act/dawn  a tanpura in Raag Yaman, and bells as the pond's lotuses open
//   rise      the great lotus surfaces: a harp up the scale
//   petal     a bell for every chapter; jigyasa: a held, open chord
//   crane     up over the flower: wonder — a harp climbing, a warm major chord
//   mind      the crowded pond: plucked notes in a restless 7/8 from a cluster
//             that will not resolve, bells glinting at random, a low pulse,
//             bubbles, the strings trembling — looped while the story waits
//   drop      the drop let go: everything falls away to one held high note
//   follow    falling beside it: strings and a riser climbing
//   impact    a water drop, a deep boom — then nothing; then release: a warm
//             chord, and the tanpura and a bansuri returning (serene)
//   lotus     bubbles and a rising harp; letter: one note per letter; name: a chord

const D2 = 73.42
const note = (semitones: number) => D2 * Math.pow(2, semitones / 12)

// Raag Yaman, on D: S R G M# P D N.
const YAMAN = [0, 2, 4, 6, 7, 9, 11]
const yaman = (degree: number, octave = 2) => {
  const o = Math.floor(degree / 7)
  return note(YAMAN[((degree % 7) + 7) % 7] + 12 * (octave + o))
}

// A bansuri phrase: [scale degree, beats]. Rests are null.
const PHRASES: [number | null, number][][] = [
  [[4, 1.5], [5, 0.5], [6, 1], [7, 3], [null, 1], [6, 0.5], [5, 0.5], [4, 2], [3, 1], [2, 3]],
  [[2, 1], [3, 1], [4, 2], [6, 1], [5, 0.5], [4, 0.5], [3, 3], [null, 1], [2, 1], [0, 4]],
]

type Scene = 'void' | 'mc1' | 'mc2' | 'breath' | 'mc3' | 'mc4' | 'hand' | 'eyes' | 'wide' | 'collapse' | 'silence' | 'dawn' | 'wonder' | 'mind' | 'held' | 'fall' | 'serene'

export class Score {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private bus!: GainNode // dry + reverb
  private noiseBuf!: AudioBuffer
  private layers: Record<'pad' | 'strings' | 'tanpura' | 'air' | 'choir', GainNode> = {} as never
  // The entrance theme: drums, ostinato and brass on a 16th-note grid; `level`
  // is how far it has built (1 sparse … 4 menace).
  private mc = { on: false, level: 1, bpm: 96, step: 0, next: 0 }
  private padFilter!: BiquadFilterNode
  // A master tone control: wide open for the story, closed down to a warm,
  // broad sound on the landing, where people stay a while (no fatiguing top).
  private tone!: BiquadFilterNode
  private tremolo!: OscillatorNode
  private muted = true
  private scene: Scene = 'void'
  private timer = 0
  private heart = { bpm: 0, next: 0, amp: 0.3 }
  // The crowded mind: plucks on a 7/8 grid of eighths.
  private mind = { on: false, next: 0, step: 0 }
  private tanpura = { on: false, next: 0, string: 0 }
  private flute = { on: false, next: 0, phrase: 0 }
  private letter = 0
  private analyser: AnalyserNode | null = null
  private hum: { stop: () => void } | null = null

  // ------------------------------------------------------------ public

  setMuted(muted: boolean) {
    this.muted = muted
    if (!muted && !this.ctx) this.start()
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.ramp(this.master.gain, muted ? 0 : 0.6, muted ? 0.5 : 2.5)
  }

  get isMuted() {
    return this.muted
  }

  // Story beats from the stage.
  cue(name: string) {
    if (!this.ctx) {
      // Nothing is playing; remember where we are for when sound is turned on.
      const scene = SCENE_OF[name]
      if (scene) this.scene = scene
      return
    }
    switch (name) {
      case 'hold':
        this.humStart()
        break
      case 'release':
        this.hum?.stop()
        this.hum = null
        break
      case 'shot':
        this.enter('mc1')
        break
      case 'twitch':
        this.whoosh(0.35, 0.07, false)
        break
      case 'hand':
        this.enter('mc2')
        break
      case 'sign':
        this.brass([note(12), note(15), note(19), note(24)], this.now(0.02), 2.4, 0.06, true)
        this.crash(this.now(1.9), 0.06, 2.5)
        break
      case 'eye':
        this.enter('breath', 0.35)
        break
      case 'snap':
        this.taiko(this.now(0), 0.9)
        this.taiko(this.now(0.09), 0.7)
        this.brass([note(0), note(12), note(15), note(19)], this.now(0), 0.9, 0.09, false)
        this.whoosh(0.9, 0.22, true)
        break
      case 'hit':
        this.enter('mc3', 0.2)
        this.boom(0.7, 2.6)
        this.crash(this.now(0), 0.16, 3.5)
        break
      case 'blink':
        this.reverseCymbal(0.6, 0.1)
        break
      case 'menace':
        this.enter('mc4', 0.4)
        this.boom(0.6, 3.2)
        this.brass([note(-2), note(5), note(10), note(13)], this.now(0), 1.6, 0.1, false)
        this.crash(this.now(0), 0.12, 3)
        break
      case 'dive':
        this.enter('collapse')
        this.riser(2.0, 0.42)
        this.roll(2.0)
        break
      case 'flash':
        this.enter('silence')
        break
      case 'act':
        this.letter = 0
        this.enter('dawn')
        break
      case 'bud':
        this.bell(yaman(7 + (this.letter++ % 5), 3), 0.025)
        break
      case 'rise':
        this.harp([0, 2, 4, 7, 9, 11, 14].map((d) => yaman(d, 2)), 0.16)
        this.letter = 0
        break
      case 'petal':
        this.bell(yaman(4 + (this.letter++ % 5), 2), 0.05)
        break
      case 'jigyasa':
        this.chord([yaman(0, 2), yaman(4, 2), yaman(7, 2), yaman(9, 2)], 5, 0.035, 'triangle', 2400)
        this.bell(yaman(7, 3), 0.08)
        break
      case 'crane':
        this.enter('wonder', 2)
        this.harp([0, 2, 4, 6, 7, 9, 11, 14, 16, 18].map((d) => yaman(d, 2)), 0.09)
        this.chord([yaman(0, 2), yaman(4, 2), yaman(7, 2), yaman(11, 2)], 6, 0.03, 'triangle', 2600)
        break
      case 'mind':
        this.enter('mind', 2.5)
        break
      case 'drop':
        this.enter('held', 0.35)
        this.held(note(43), 1.6)
        this.reverseCymbal(1.4, 0.08)
        break
      case 'follow':
        this.enter('fall', 0.6)
        this.riser(2.4, 0.5)
        break
      case 'impact':
        this.enter('silence', 0.05)
        this.plop()
        this.boom(0.55, 3.5)
        this.later(1.6, () => {
          this.enter('serene')
          this.chord([yaman(0, 2), yaman(4, 2), yaman(7, 2), yaman(9, 3)], 7, 0.022, 'triangle', 2000)
          this.bell(yaman(7, 3), 0.06)
        })
        break
      case 'lotus':
        this.bubbles()
        this.harp([0, 2, 4, 7, 9, 11, 14].map((d) => yaman(d, 2)), 0.11)
        this.letter = 0
        break
      case 'letter':
        this.bell(yaman([0, 2, 4, 6, 7, 9][this.letter++ % 6], 3), 0.06)
        break
      case 'name':
        this.chord([yaman(0, 2), yaman(4, 2), yaman(7, 2), yaman(11, 2)], 4.5, 0.03, 'triangle', 2200)
        break
      case 'arrive':
        this.enter('serene', 1.5)
        break
    }
  }

  // Output loudness right now, in dBFS (for checking the mix).
  level() {
    if (!this.analyser) return -Infinity
    const data = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(data)
    let sum = 0
    let peak = 0
    for (const v of data) {
      sum += v * v
      peak = Math.max(peak, Math.abs(v))
    }
    return { rms: 10 * Math.log10(sum / data.length + 1e-12), peak: 20 * Math.log10(peak + 1e-12) }
  }

  dispose() {
    clearInterval(this.timer)
    void this.ctx?.close()
    this.ctx = null
  }

  // ------------------------------------------------------------ the scenes

  private enter(scene: Scene, fade = 1.2) {
    this.scene = scene
    if (!this.ctx) return
    const L = this.layers
    const set = (pad: number, strings: number, tanpura: number, air: number, f = fade) => {
      this.ramp(L.pad.gain, pad, f)
      this.ramp(L.strings.gain, strings, f)
      this.ramp(L.tanpura.gain, tanpura, f)
      this.ramp(L.air.gain, air, f)
    }
    this.heart.bpm = 0
    this.mind.on = false
    this.tanpura.on = false
    this.flute.on = false
    if (scene !== 'serene') this.ramp(this.tone.frequency, 16000, fade)
    let choir = 0
    const mc = (level: number, bpm: number) => {
      if (!this.mc.on) {
        this.mc.step = 0
        this.mc.next = this.ctx!.currentTime + 0.05
      }
      this.mc.on = true
      this.mc.level = level
      this.mc.bpm = bpm
    }
    this.mc.on = false
    switch (scene) {
      // The entrance, building beat by beat.
      case 'mc1':
        set(0.4, 0, 0, 0.7, 2.5)
        this.ramp(this.padFilter.frequency, 380, 2)
        choir = 0.14
        mc(1, 96)
        break
      case 'mc2':
        set(0.4, 0, 0, 0.6, 1.5)
        this.ramp(this.padFilter.frequency, 520, 2)
        choir = 0.24
        mc(2, 96)
        break
      case 'breath':
        // The inhale before the eye opens: almost nothing.
        set(0.06, 0.12, 0, 0.25, fade)
        this.ramp(this.tremolo.frequency, 9, 0.3)
        break
      case 'mc3':
        set(0.35, 0, 0, 0.5, fade)
        this.ramp(this.padFilter.frequency, 700, 1)
        choir = 0.42
        mc(3, 100)
        break
      case 'mc4':
        set(0.45, 0.25, 0, 0.6, fade)
        this.ramp(this.padFilter.frequency, 900, 1)
        this.ramp(this.tremolo.frequency, 11, 1)
        choir = 0.55
        mc(4, 100)
        break
      case 'void':
        set(0.5, 0, 0, 0.6, 4)
        this.ramp(this.padFilter.frequency, 420, 4)
        break
      case 'hand':
        set(0.45, 0, 0, 0.6, 3)
        this.ramp(this.padFilter.frequency, 650, 4)
        this.heart.bpm = 54
        this.heart.amp = 0.22
        break
      case 'eyes':
        set(0.5, 0.3, 0, 0.8, 3)
        this.ramp(this.tremolo.frequency, 4, 2)
        this.heart.bpm = 66
        this.heart.amp = 0.3
        break
      case 'wide':
        set(0.7, 0.55, 0, 0.6, 0.3)
        this.ramp(this.padFilter.frequency, 1100, 0.6)
        this.ramp(this.tremolo.frequency, 2.5, 1.5)
        break
      case 'collapse':
        set(0.6, 1.0, 0, 1.4, 1.2)
        this.ramp(this.tremolo.frequency, 14, 1.2)
        break
      case 'silence':
        set(0, 0, 0, 0, fade === 1.2 ? 0.25 : fade)
        break
      case 'dawn':
        set(0.1, 0, 0.5, 0.2, 1.5)
        this.ramp(this.padFilter.frequency, 520, 1)
        this.tanpura.on = true
        this.tanpura.next = this.ctx.currentTime + 0.3
        break
      case 'wonder':
        set(0.14, 0, 0.4, 0.25, fade)
        this.ramp(this.padFilter.frequency, 700, 2)
        this.tanpura.on = true
        break
      case 'mind':
        set(0.32, 0.75, 0, 1.2, fade)
        this.ramp(this.padFilter.frequency, 420, 2)
        this.ramp(this.tremolo.frequency, 7, 2)
        this.mind.on = true
        this.mind.next = this.ctx.currentTime + 0.1
        break
      case 'held':
        set(0.04, 0.06, 0, 0.3, fade)
        break
      case 'fall':
        set(0.25, 1.1, 0, 1.3, fade)
        this.ramp(this.tremolo.frequency, 12, 2)
        break
      case 'serene':
        set(0.24, 0, 0.6, 0.04, 3)
        this.ramp(this.tone.frequency, 2200, 4)
        this.ramp(this.padFilter.frequency, 480, 2)
        this.tanpura.on = true
        this.tanpura.next = Math.max(this.tanpura.next, this.ctx.currentTime + 0.1)
        this.flute.on = true
        this.flute.next = Math.max(this.flute.next, this.ctx.currentTime + 1.4)
        break
    }
    this.ramp(L.choir.gain, choir, fade)
  }

  // Choir: the scene's chord sung on 'ah' — saws through two formant bands.
  private buildChoir() {
    const ctx = this.ctx!
    const f1 = ctx.createBiquadFilter()
    f1.type = 'bandpass'
    f1.frequency.value = 650
    f1.Q.value = 4
    const f2 = ctx.createBiquadFilter()
    f2.type = 'bandpass'
    f2.frequency.value = 1080
    f2.Q.value = 5
    const sum = ctx.createGain()
    sum.gain.value = 0.9
    f1.connect(sum)
    f2.connect(sum)
    sum.connect(this.layers.choir)
    const vib = ctx.createOscillator()
    vib.frequency.value = 4.6
    const vibDepth = ctx.createGain()
    vibDepth.gain.value = 9
    vib.connect(vibDepth)
    vib.start()
    ;[note(12), note(15), note(19), note(24), note(27)].forEach((f) => {
      for (const detune of [-11, 0, 12]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = detune
        vibDepth.connect(o.detune)
        const g = ctx.createGain()
        g.gain.value = 0.02
        o.connect(g)
        g.connect(f1)
        g.connect(f2)
        o.start()
      }
    })
  }

  // ------------------------------------------------------------ setup

  private start() {
    const ctx = new AudioContext()
    this.ctx = ctx
    this.noiseBuf = this.makeNoise(3)

    this.master = ctx.createGain()
    this.master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3
    this.tone = ctx.createBiquadFilter()
    this.tone.type = 'lowpass'
    this.tone.frequency.value = 16000
    this.tone.Q.value = 0.4
    this.master.connect(this.tone).connect(comp)
    // `?silent` (for checking the mix by meter): everything runs, nothing
    // reaches the speakers.
    if (!new URLSearchParams(location.search).has('silent')) comp.connect(ctx.destination)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    comp.connect(this.analyser)

    const reverb = ctx.createConvolver()
    reverb.buffer = this.impulse(5)
    const wet = ctx.createGain()
    wet.gain.value = 0.5
    reverb.connect(wet).connect(this.master)
    this.bus = ctx.createGain()
    this.bus.connect(this.master)
    this.bus.connect(reverb)

    for (const k of ['pad', 'strings', 'tanpura', 'air', 'choir'] as const) {
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(this.bus)
      this.layers[k] = g
    }

    // Pad: D minor, warm and low.
    this.padFilter = ctx.createBiquadFilter()
    this.padFilter.type = 'lowpass'
    this.padFilter.frequency.value = 420
    this.padFilter.Q.value = 0.5
    this.padFilter.connect(this.layers.pad)
    ;[note(0), note(7), note(12), note(15), note(19)].forEach((f, i) => {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator()
        o.type = i === 0 ? 'sine' : 'triangle'
        o.frequency.value = f
        o.detune.value = detune
        const g = ctx.createGain()
        g.gain.value = (i === 0 ? 0.2 : 0.06) / 2
        o.connect(g).connect(this.padFilter)
        o.start()
      }
    })

    // Strings: a dark, trembling cluster (D, E♭, A, E♭) — the eyes' Phrygian.
    const strFilter = ctx.createBiquadFilter()
    strFilter.type = 'lowpass'
    strFilter.frequency.value = 1100
    const trem = ctx.createGain()
    trem.gain.value = 0.6
    this.tremolo = ctx.createOscillator()
    this.tremolo.frequency.value = 3
    const tremDepth = ctx.createGain()
    tremDepth.gain.value = 0.4
    this.tremolo.connect(tremDepth).connect(trem.gain)
    this.tremolo.start()
    strFilter.connect(trem).connect(this.layers.strings)
    ;[note(0), note(1), note(7), note(13), note(19)].forEach((f) => {
      for (const detune of [-9, 0, 9]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = detune
        const g = ctx.createGain()
        g.gain.value = 0.022
        o.connect(g).connect(strFilter)
        o.start()
      }
    })

    // Air: breath of noise, high and quiet.
    const air = ctx.createBufferSource()
    air.buffer = this.noiseBuf
    air.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1500
    band.Q.value = 0.6
    const airGain = ctx.createGain()
    airGain.gain.value = 0.02
    air.connect(band).connect(airGain).connect(this.layers.air)
    air.start()

    this.buildChoir()

    // The scheduler: heartbeats, drums, tanpura plucks, flute phrases.
    this.timer = window.setInterval(() => this.schedule(), 30)
    this.enter(this.scene, 2)
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx) return
    const horizon = ctx.currentTime + 0.15
    if (this.mc.on) {
      while (this.mc.next < horizon) {
        this.mcStep(this.mc.step++, this.mc.next)
        this.mc.next += 60 / this.mc.bpm / 4
      }
    }
    if (this.heart.bpm > 0) {
      if (this.heart.next < ctx.currentTime) this.heart.next = ctx.currentTime + 0.05
      while (this.heart.next < horizon) {
        this.thump(this.heart.next, this.heart.amp)
        this.thump(this.heart.next + 0.24, this.heart.amp * 0.64)
        this.heart.next += 60 / this.heart.bpm
      }
    }
    if (this.mind.on) {
      while (this.mind.next < horizon) {
        this.mindStep(this.mind.step++, this.mind.next)
        this.mind.next += 60 / 138 / 2
      }
    }
    if (this.tanpura.on) {
      // Pa, Sa', Sa', Sa — the tanpura's cycle.
      const strings = [note(-5) * 2, note(12), note(12), note(0)]
      while (this.tanpura.next < horizon) {
        this.pluck(strings[this.tanpura.string++ % 4], this.tanpura.next)
        this.tanpura.next += this.tanpura.string % 4 === 0 ? 1.6 : 0.85
      }
    }
    if (this.flute.on && this.flute.next < horizon) {
      const length = this.bansuri(PHRASES[this.flute.phrase++ % PHRASES.length], this.flute.next, 0.62)
      this.flute.next += length + 5 + (this.flute.phrase % 2) * 3
    }
  }

  // ------------------------------------------------------------ the entrance theme

  // One 16th of the entrance theme. D minor; from level 3 the bars walk
  // i – VI – iv – V (Dm, B♭, Gm, A), and every four bars the brass sings the
  // theme over it.
  private mcStep(step: number, t: number) {
    const L = this.mc.level
    const s = step % 16
    const bar = Math.floor(step / 16)
    const roots = [0, -4, -7, -5] // D, B♭, G, A (semitones from D)
    const root = L >= 3 ? roots[bar % 4] : 0
    const third = L >= 3 && bar % 4 === 3 ? 4 : bar % 4 === 1 ? 4 : 3
    // Taiko.
    if (L === 1 && s === 0 && bar % 2 === 0) this.taiko(t, 0.55)
    if (L === 1 && s === 3 && bar % 2 === 0) this.taiko(t, 0.25)
    if (L === 2 && (s === 0 || s === 10)) this.taiko(t, s === 0 ? 0.6 : 0.4)
    if (L === 2 && (s === 4 || s === 12)) this.shime(t, 0.12)
    if (L >= 3 && [0, 3, 8, 11, 14].includes(s)) this.taiko(t, s === 0 ? 0.75 : 0.45)
    if (L >= 3 && s % 2 === 1) this.shime(t, s === 7 || s === 15 ? 0.16 : 0.07)
    if (L === 4 && [6, 13].includes(s)) this.taiko(t, 0.5)
    // Ostinato: low strings driving underneath.
    if (L === 2 && s % 2 === 0) this.ost(note(root + [0, 0, 7, 12, 15, 12, 7, 12][s / 2]), t, 0.035, 900 + (step % 64) * 18)
    if (L >= 3) this.ost(note(12 + root + [0, 7, 12, 7, third + 12, 7, 12, 7][s % 8]), t, 0.03, 1700)
    // Brass: stabs on the bar in the menace; the theme every four bars.
    if (L === 4 && s === 0) this.brass([note(root - 12), note(root), note(root + third), note(root + 7)], t, 0.7, 0.07, false)
    if (L >= 3 && s === 0 && bar % 4 === 0) this.theme(t, L === 4 ? 1 : 0)
  }

  // The theme: a rising call, a fall, an answer (in beats at the tempo).
  private theme(t0: number, darker: number) {
    const beat = 60 / this.mc.bpm
    const line: [number, number][] = darker
      ? [[12, 1.5], [19, 0.5], [22, 1], [24, 2], [25, 1], [24, 1], [22, 1], [19, 1], [24, 4]]
      : [[12, 1.5], [19, 0.5], [22, 1], [24, 2], [27, 1], [26, 1], [24, 1], [22, 1], [19, 4]]
    let t = t0
    for (const [n, beats] of line) {
      this.brass([note(n + 12)], t, beats * beat * 0.95, 0.05, true)
      t += beats * beat
    }
  }

  // One eighth of the crowded mind: 7/8, grouped 3 + 2 + 2, plucked from
  // a cluster (D, E♭, G, A♭, C, D♭) that never settles; whole-tone bells
  // glinting at random; a soft pulse on each bar; now and then a bubble.
  private mindStep(step: number, t: number) {
    const s = step % 7
    const bar = Math.floor(step / 7)
    const accent = s === 0 || s === 3 || s === 5
    const cluster = [12, 13, 17, 18, 22, 23]
    this.ost(note(cluster[(s * 3 + bar * 2) % 6] + (bar % 4 === 3 ? 12 : 0)), t, accent ? 0.085 : 0.045, 2400)
    if (s === 0) this.taiko(t, 0.28)
    if (Math.random() < 0.3) this.bell(note(38 + 2 * Math.floor(Math.random() * 6)), 0.011, t + Math.random() * 0.1)
    if (Math.random() < 0.06) this.bubbleAt(t)
  }

  // ------------------------------------------------------------ instruments

  // One high note, held: the breath before the fall.
  private held(f: number, dur: number) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.4)
    g.gain.setValueAtTime(0.035, t + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.bus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private bubbleAt(t: number) {
    const ctx = this.ctx!
    const f = 500 + Math.random() * 700
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.07)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.04, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(g).connect(this.bus)
    o.start(t)
    o.stop(t + 0.1)
  }

  private now(after: number) {
    return this.ctx!.currentTime + after
  }

  // A taiko: a deep skin, the thud of air, a crack of stick.
  private taiko(t: number, amp: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(110, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.22)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp * 0.8, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    o.connect(g).connect(this.bus)
    o.start(t)
    o.stop(t + 0.75)
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 520
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(amp * 0.6, t)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    n.connect(lp).connect(ng).connect(this.bus)
    n.start(t, Math.random() * 2, 0.2)
  }

  // A shime: the small, tight drum that keeps time.
  private shime(t: number, amp: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(420, t)
    o.frequency.exponentialRampToValueAtTime(260, t + 0.05)
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(g).connect(this.bus)
    o.start(t)
    o.stop(t + 0.1)
    this.tick(t, amp * 0.5)
  }

  private crash(t: number, amp: number, dur: number) {
    const ctx = this.ctx!
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    n.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 4200
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    n.connect(hp).connect(g).connect(this.bus)
    n.start(t)
    n.stop(t + dur + 0.05)
  }

  private reverseCymbal(dur: number, amp: number) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3800
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(amp, t + dur)
    g.gain.linearRampToValueAtTime(0, t + dur + 0.03)
    n.connect(hp).connect(g).connect(this.bus)
    n.start(t, Math.random(), dur + 0.05)
  }

  // A snare roll, quickening, for the dive.
  private roll(dur: number) {
    const t0 = this.ctx!.currentTime
    let t = 0
    let gap = 0.12
    while (t < dur) {
      this.shime(t0 + t, 0.05 + 0.12 * (t / dur))
      t += gap
      gap = Math.max(0.028, gap * 0.93)
    }
  }

  // Brass: saws through a filter that blooms open, for stabs and the theme.
  private brass(freqs: number[], t: number, dur: number, amp: number, swell: boolean) {
    const ctx = this.ctx!
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 1.2
    lp.frequency.setValueAtTime(swell ? 300 : 900, t)
    lp.frequency.exponentialRampToValueAtTime(3200, t + (swell ? dur * 0.6 : 0.05))
    lp.frequency.exponentialRampToValueAtTime(1100, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(amp, t + (swell ? dur * 0.5 : 0.025))
    g.gain.setValueAtTime(amp, t + dur * 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25)
    lp.connect(g).connect(this.bus)
    for (const f of freqs) {
      for (const detune of [-8, 8]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = detune
        o.connect(lp)
        o.start(t)
        o.stop(t + dur + 0.3)
      }
    }
  }

  // One note of the string ostinato: a short bowed saw.
  private ost(f: number, t: number, amp: number, cutoff: number) {
    const ctx = this.ctx!
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(amp, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    lp.connect(g).connect(this.bus)
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = detune
      o.connect(lp)
      o.start(t)
      o.stop(t + 0.18)
    }
  }

  // The ball charging while it is held: a low hum that climbs and opens up.
  private humStart() {
    if (!this.ctx || this.hum) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(200, t)
    lp.frequency.exponentialRampToValueAtTime(2400, t + 1.8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 1.7)
    lp.connect(g).connect(this.bus)
    const oscs = [note(0), note(7), note(12)].map((f, i) => {
      const o = ctx.createOscillator()
      o.type = i === 0 ? 'sawtooth' : 'triangle'
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * 2, t + 1.8)
      o.connect(lp)
      o.start(t)
      return o
    })
    this.hum = {
      stop: () => {
        const now = ctx.currentTime
        g.gain.cancelScheduledValues(now)
        g.gain.setValueAtTime(g.gain.value, now)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
        oscs.forEach((o) => o.stop(now + 0.65))
      },
    }
  }

  private thump(t: number, amp: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(62, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp * 0.5, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.32)
  }


  private tick(t: number, amp: number) {
    const ctx = this.ctx!
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 5000
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    n.connect(hp).connect(g).connect(this.bus)
    n.start(t, Math.random() * 2, 0.06)
  }

  // A tanpura string: a bright pluck with the jawari's buzz sweeping through it.
  private pluck(f: number, t: number) {
    const ctx = this.ctx!
    const out = ctx.createGain()
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(0.09, t + 0.02)
    out.gain.exponentialRampToValueAtTime(0.0001, t + 4.2)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(3200, t)
    lp.frequency.exponentialRampToValueAtTime(700, t + 3)
    const buzz = ctx.createBiquadFilter()
    buzz.type = 'peaking'
    buzz.Q.value = 6
    buzz.gain.value = 9
    buzz.frequency.setValueAtTime(900, t)
    buzz.frequency.exponentialRampToValueAtTime(3200, t + 2.5)
    for (const detune of [0, 4]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = detune
      o.connect(lp)
      o.start(t)
      o.stop(t + 4.3)
    }
    lp.connect(buzz).connect(out).connect(this.layers.tanpura)
  }

  // A bansuri: a breathy sine with vibrato that blooms after each note's onset.
  private bansuri(phrase: [number | null, number][], t0: number, beat: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    o2.type = 'triangle'
    const amp = ctx.createGain()
    amp.gain.value = 0
    const h = ctx.createGain()
    h.gain.value = 0.07
    const vib = ctx.createOscillator()
    vib.frequency.value = 5.2
    const vibDepth = ctx.createGain()
    vibDepth.gain.value = 0
    vib.connect(vibDepth)
    vibDepth.connect(o.detune)
    vibDepth.connect(o2.detune)
    const breath = ctx.createBufferSource()
    breath.buffer = this.noiseBuf
    breath.loop = true
    const bf = ctx.createBiquadFilter()
    bf.type = 'bandpass'
    bf.frequency.value = 1100
    bf.Q.value = 1.2
    const bg = ctx.createGain()
    bg.gain.value = 0.07
    breath.connect(bf).connect(bg).connect(amp)
    o.connect(amp)
    o2.connect(h).connect(amp)
    amp.connect(this.bus)
    let t = t0
    for (const [deg, beats] of phrase) {
      const d = beats * beat
      if (deg === null) {
        amp.gain.setTargetAtTime(0, t, 0.08)
      } else {
        const f = yaman(deg, 3)
        o.frequency.setTargetAtTime(f, t, 0.03)
        o2.frequency.setTargetAtTime(f * 2, t, 0.03)
        amp.gain.setTargetAtTime(0.07, t, 0.06)
        vibDepth.gain.setValueAtTime(0, t)
        vibDepth.gain.linearRampToValueAtTime(d > 0.6 ? 14 : 4, t + Math.min(d, 1.2))
      }
      t += d
    }
    amp.gain.setTargetAtTime(0, t, 0.3)
    const end = t + 2
    for (const n of [o, o2, vib, breath]) {
      n.start(t0)
      n.stop(end)
    }
    return t - t0
  }

  // A small bell (or santoor stroke): inharmonic partials, a long shimmer.
  private bell(f: number, amp: number, t = this.ctx!.currentTime) {
    const ctx = this.ctx!
    ;[1, 2.01, 3.02, 4.17, 5.43].forEach((p, i) => {
      const o = ctx.createOscillator()
      o.frequency.value = f * p
      const g = ctx.createGain()
      const a = amp / (1 + i * 1.6)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(a, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 / (1 + i * 0.5))
      o.connect(g).connect(this.bus)
      o.start(t)
      o.stop(t + 3.3)
    })
  }

  private chord(freqs: number[], dur: number, amp: number, type: OscillatorType, cutoff: number) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp, t + 0.6)
    g.gain.setValueAtTime(amp, t + dur * 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    lp.connect(g).connect(this.bus)
    for (const f of freqs) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator()
        o.type = type
        o.frequency.value = f
        o.detune.value = detune
        o.connect(lp)
        o.start(t)
        o.stop(t + dur + 0.1)
      }
    }
  }

  private harp(freqs: number[], step: number) {
    const t = this.ctx!.currentTime
    freqs.forEach((f, i) => this.bell(f, 0.045, t + i * step))
  }


  // Air rushing past; `bright` adds a high glassy ring.
  private whoosh(dur: number, amp: number, bright: boolean) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    bp.frequency.setValueAtTime(300, t)
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.45)
    bp.frequency.exponentialRampToValueAtTime(500, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp, t + dur * 0.45)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    n.connect(bp).connect(g).connect(this.bus)
    n.start(t, Math.random(), dur + 0.1)
    if (bright) [note(37), note(44)].forEach((f) => this.bell(f, 0.012, t + dur * 0.3))
  }

  private boom(amp: number, dur: number) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(70, t)
    o.frequency.exponentialRampToValueAtTime(32, t + dur * 0.6)
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.1)
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 400
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(amp * 0.5, t)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
    n.connect(lp).connect(ng).connect(this.bus)
    n.start(t, 0, 1)
  }

  private riser(dur: number, amp = 0.16) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    const hp = ctx.createBiquadFilter()
    hp.type = 'bandpass'
    hp.Q.value = 2
    hp.frequency.setValueAtTime(400, t)
    hp.frequency.exponentialRampToValueAtTime(6000, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(amp, t + dur)
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04)
    n.connect(hp).connect(g).connect(this.bus)
    n.start(t, Math.random(), dur + 0.1)
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(note(12), t)
    o.frequency.exponentialRampToValueAtTime(note(36), t + dur)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(amp * 0.3, t + dur)
    og.gain.linearRampToValueAtTime(0, t + dur + 0.04)
    o.connect(og).connect(this.bus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }


  // A drop striking still water: the click of contact and the bubble's ring.
  private plop() {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(1300, t)
    o.frequency.exponentialRampToValueAtTime(320, t + 0.06)
    o.frequency.exponentialRampToValueAtTime(520, t + 0.16)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.35, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    o.connect(g).connect(this.bus)
    o.start(t)
    o.stop(t + 0.25)
    this.tick(t, 0.12)
  }

  private bubbles() {
    const ctx = this.ctx!
    for (let i = 0; i < 9; i++) {
      const t = ctx.currentTime + i * 0.13 + Math.random() * 0.08
      const f = 500 + Math.random() * 700
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.07)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.05, t + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
      o.connect(g).connect(this.bus)
      o.start(t)
      o.stop(t + 0.1)
    }
  }

  // ------------------------------------------------------------ plumbing

  private ramp(param: AudioParam, value: number, seconds: number) {
    const t = this.ctx!.currentTime
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
    param.linearRampToValueAtTime(value, t + Math.max(seconds, 0.01))
  }

  private later(seconds: number, fn: () => void) {
    window.setTimeout(fn, seconds * 1000)
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!
    const len = ctx.sampleRate * seconds
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    }
    return buf
  }
}

// Where in the story each cue leaves the music, if sound is turned on later.
const SCENE_OF: Record<string, Scene> = {
  shot: 'mc1',
  hand: 'mc2',
  eye: 'breath',
  hit: 'mc3',
  menace: 'mc4',
  dive: 'collapse',
  flash: 'silence',
  act: 'dawn',
  crane: 'wonder',
  mind: 'mind',
  drop: 'held',
  follow: 'fall',
  impact: 'serene',
  arrive: 'serene',
}
