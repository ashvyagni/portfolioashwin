import { useLayoutEffect, useRef, useState } from 'react'

// A label whose letter under the cursor becomes a dashed vector outline in a
// selection box, with corner handles and its size read out — as if picked up
// in a design tool.

type Props = { text: string; onSelect: () => void; autoFocus?: boolean }

export function TechText({ text, onSelect, autoFocus }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const [size, setSize] = useState('')
  const glyphs = useRef<(HTMLSpanElement | null)[]>([])

  useLayoutEffect(() => {
    if (active === null) return
    const box = glyphs.current[active]?.getBoundingClientRect()
    if (box) setSize(`${Math.round(box.width)} × ${Math.round(box.height)}`)
  }, [active])

  return (
    <button
      className="tech"
      onClick={onSelect}
      onPointerLeave={() => setActive(null)}
      onFocus={() => setActive(0)}
      onBlur={() => setActive(null)}
      autoFocus={autoFocus}
      aria-label={text}
    >
      {[...text].map((ch, i) => (
        <span
          key={i}
          className={`tech__ch${i === active ? ' is-active' : ''}`}
          onPointerEnter={() => ch !== ' ' && setActive(i)}
          aria-hidden="true"
        >
          <span className="tech__glyph" ref={(el) => {
              glyphs.current[i] = el
            }}>
            {ch === ' ' ? ' ' : ch}
          </span>
          {i === active && (
            <span className="tech__box">
              <span className="tech__label">
                {ch} {size}
              </span>
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
      ))}
    </button>
  )
}
