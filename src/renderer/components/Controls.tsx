import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@shared/i18n'

export function usePreference<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[]
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key) as T
      return allowed.includes(saved) ? saved : fallback
    } catch {
      return fallback
    }
  })
  return [
    value,
    (next) => {
      setValue(next)
      localStorage.setItem(key, next)
    }
  ]
}

export function Menu({
  label,
  children,
  className = '',
  disabled = false
}: {
  label: string
  children: ReactNode
  className?: string
  disabled?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const anchor = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return
    const rect = anchor.current.getBoundingClientRect()
    const height = panel.current.offsetHeight
    const width = panel.current.offsetWidth
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top:
        rect.bottom + height + 8 <= window.innerHeight
          ? rect.bottom + 6
          : Math.max(8, rect.top - height - 6)
    })
    const focusable = panel.current.querySelector<HTMLElement>(
      'input, button:not(:disabled), select'
    )
    focusable?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent): void => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !anchor.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    const close = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        anchor.current?.focus({ preventScroll: true })
      }
      if (event.key === 'Tab') setOpen(false)
      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        panel.current?.contains(document.activeElement)
      ) {
        const items = [
          ...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')
        ]
        const index = items.indexOf(document.activeElement as HTMLElement)
        event.preventDefault()
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }
    }
    const scroll = (event: Event): void => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', close, true)
    const resize = (): void => setOpen(false)
    window.addEventListener('resize', resize)
    document.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', close, true)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', resize)
    }
  }, [open])
  return (
    <>
      <button
        ref={anchor}
        className={`btn menu-trigger ${className}`}
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        {label}
        <span aria-hidden="true">⌄</span>
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={panel}
            className="floating-menu"
            style={position}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button[data-close]')) {
                setOpen(false)
                anchor.current?.focus({ preventScroll: true })
              }
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}

export function MenuItem({
  children,
  onClick,
  disabled = false,
  danger = false
}: {
  children: ReactNode
  onClick(): void
  disabled?: boolean
  danger?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      data-close
      className={danger ? 'danger' : ''}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  modeless = false
}: {
  title: string
  children: ReactNode
  onClose(): void
  modeless?: boolean
  wide?: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const id = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = modeless ? null : document.querySelector<HTMLElement>('#root')
    if (root) root.inert = true
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    const key = (event: KeyboardEvent): void => {
      if (
        event.key === 'Escape' &&
        (event.target as HTMLElement).closest('.search-control.expanded')
      )
        return
      if (
        Array.from(document.querySelectorAll('[role=dialog]'))
          .filter((element) => !element.closest('.dialog-exit'))
          .at(-1) !== ref.current
      )
        return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
      if (event.key === 'Tab' && !modeless) {
        const nodes = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea, select, [tabindex="0"]'
          ) ?? [])
        ]
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', key, true)
    return () => {
      if (root)
        root.inert = !!Array.from(document.querySelectorAll('[role=dialog][aria-modal=true]')).find(
          (element) => element !== ref.current && !element.closest('.dialog-exit')
        )
      document.removeEventListener('keydown', key, true)
      previous?.focus({ preventScroll: true })
    }
  }, [])
  useLayoutEffect(() => {
    const backdrop = ref.current?.closest('.modal-backdrop')
    return () => {
      if (!backdrop || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const ghost = backdrop.cloneNode(true) as HTMLElement
      ghost.classList.add('dialog-exit')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.inert = true
      ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
      document.body.append(ghost)
      setTimeout(() => ghost.remove(), 160)
    }
  }, [])
  return createPortal(
    <div
      className={`modal-backdrop ${modeless ? 'modeless-backdrop' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide-dialog' : ''}`}
        role="dialog"
        aria-modal={!modeless}
        aria-labelledby={id}
      >
        <header className="dialog-header">
          <h2 id={id}>{title}</h2>
          <button className="icon-button" aria-label={t('Close')} onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body
  )
}
