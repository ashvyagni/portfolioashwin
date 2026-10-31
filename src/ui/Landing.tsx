import type { Stage } from '../stage/stage'
import { LEAVES } from '../content/story'
import { Companion } from './Companion'

// After the act, the world is the page: the name stands in it, in gold. Stay
// a moment and the companion — a little pothi — flies in and tells the
// Curiosity chapter, going from place to place in the world as it does. The
// words are also in the page, for anyone not seeing the canvas. Over it all,
// a way to turn the sound off (or on).

type Props = { muted: boolean; onToggleSound: () => void; companion: Stage['companion']; onDescend: () => void }

export function Landing({ muted, onToggleSound, companion, onDescend }: Props) {
  return (
    <div className="landing">
      <h1 className="visually-hidden">Ashwin</h1>
      <section className="visually-hidden" aria-label="जिज्ञासा · Curiosity">
        {LEAVES.map((leaf) => (
          <div key={leaf.title}>
            <h2 lang="sa">
              {leaf.num} {leaf.title} — {leaf.gloss}
            </h2>
            <p lang="sa">{leaf.sanskrit.join(' ')}</p>
            <p>{leaf.english.join(' ')}</p>
          </div>
        ))}
      </section>
      <Companion api={companion} />
      <button className="landing__descend" onClick={onDescend}>
        into the forge
        <span aria-hidden="true" />
      </button>
      <button className="landing__sound" onClick={onToggleSound} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
        <span className={`wave${muted ? '' : ' is-on'}`} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        {muted ? 'off' : 'on'}
      </button>
    </div>
  )
}
