import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'

export function SearchControl({
  label,
  value,
  onChange,
  initiallyOpen = false
}: {
  label: string
  value: string
  onChange(value: string): void
  initiallyOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(initiallyOpen)
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  return (
    <div className={`search-control ${open ? 'expanded' : ''}`}>
      <button
        ref={button}
        className="icon-button"
        title={t(label)}
        aria-label={t(label)}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          if (open) onChange('')
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 6 6" />
        </svg>
      </button>
      <div className="search-input-wrap" aria-hidden={!open}>
        <input
          tabIndex={open ? 0 : -1}
          ref={input}
          aria-label={t(label)}
          placeholder={t(label)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              onChange('')
              setOpen(false)
              button.current?.focus()
            }
          }}
        />
      </div>
    </div>
  )
}
