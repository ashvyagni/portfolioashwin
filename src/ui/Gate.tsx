import { useState } from 'react'
import { TechText } from './TechText'

// The threshold: press and hold the glass ball to wake the story. The ball
// itself is drawn on the canvas; this is the hand-hold over it, the prompt
// beneath, and the choice of sound.

type Props = { onHold: (on: boolean, withSound: boolean) => void; leaving: boolean }

export function Gate({ onHold, leaving }: Props) {
  const [sound, setSound] = useState(true)
  const [held, setHeld] = useState(false)
  // Every press and release is passed on, so a release the browser missed
  // can never leave the gate thinking it is still held.
  const press = (on: boolean) => {
    setHeld(on)
    onHold(on, sound)
  }
  const isKey = (key: string) => key === ' ' || key === 'Enter'

  return (
    <div className={`gate${leaving ? ' is-leaving' : ''}`}>
      <button
        className="gate__orb"
        aria-label="Press and hold to begin"
        autoFocus
        onPointerDown={(e) => {
          // Keep the hold even if the finger slides off the ball. (Capture can
          // fail for a pointer the browser no longer tracks; the hold still counts.)
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
          press(true)
        }}
        onPointerUp={() => press(false)}
        onPointerCancel={() => press(false)}
        onKeyDown={(e) => {
          if (isKey(e.key) && !e.repeat) {
            e.preventDefault()
            press(true)
          }
        }}
        onKeyUp={(e) => isKey(e.key) && press(false)}
        onContextMenu={(e) => e.preventDefault()}
      />
      <p className={`gate__hold${held ? ' is-held' : ''}`} aria-hidden="true">
        Hold to awaken
      </p>
      <div className="gate__sound" role="group" aria-label="Sound">
        <span className={sound ? 'is-chosen' : undefined}>
          <TechText text="With sound" onSelect={() => setSound(true)} />
        </span>
        <span className="gate__or" aria-hidden="true">
          /
        </span>
        <span className={sound ? undefined : 'is-chosen'}>
          <TechText text="In silence" onSelect={() => setSound(false)} />
        </span>
      </div>
    </div>
  )
}
