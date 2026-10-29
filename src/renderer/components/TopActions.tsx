import type { ReactNode } from 'react'
import { t } from '@shared/i18n'

export type ActionIcon =
  | 'home'
  | 'undo'
  | 'redo'
  | 'library'
  | 'save'
  | 'settings'
  | 'help'
  | 'language'
  | 'search'
export function ActionSymbol({ icon }: { icon: ActionIcon }): JSX.Element {
  const paths: Record<ActionIcon, ReactNode> = {
    home: <path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-8h6v8" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6.5" />
        <path d="m15 15 6 6" />
      </>
    ),
    undo: (
      <>
        <path d="M10 8H5v-5M5 8c3-5 12-3 12 3v5" />
        <path d="M11 18h9" />
      </>
    ),
    redo: (
      <>
        <path d="M14 8h5v-5M19 8C16 3 7 5 7 11v5" />
        <path d="M4 18h9" />
      </>
    ),
    library: (
      <>
        <path d="M3 6h7l2 3h9v11H3z" />
        <path d="M6 3h13v3M7 13h10M7 16h6" />
      </>
    ),
    save: (
      <>
        <path d="M4 3h13l4 4v14H4z" />
        <path d="M8 3v6h9V3M8 21v-8h9v8" />
      </>
    ),
    settings: (
      <>
        <path d="M3 6h18M3 12h18M3 18h18" />
        <path d="M8 3v6M16 9v6M10 15v6" />
        <rect x="6" y="4" width="4" height="4" fill="currentColor" />
        <rect x="14" y="10" width="4" height="4" fill="currentColor" />
        <rect x="8" y="16" width="4" height="4" fill="currentColor" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 16v1" />
      </>
    ),
    language: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18M5 6h14M5 18h14" />
      </>
    )
  }
  return (
    <svg
      className="action-symbol"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path className="icon-register" d="M0 5V0h5M19 24h5v-5" />
      {paths[icon]}
    </svg>
  )
}
export function ActionLabel({ icon, label }: { icon: ActionIcon; label: string }): JSX.Element {
  return (
    <>
      <ActionSymbol icon={icon} />
      <span className="action-caption">{t(label)}</span>
    </>
  )
}
export function TopAction({
  icon,
  label,
  onClick,
  disabled = false
}: {
  icon: ActionIcon
  label: string
  onClick(): void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      className={`top-action ${icon === 'settings' ? 'settings-action' : ''}`}
      aria-label={t(label)}
      disabled={disabled}
      onClick={onClick}
    >
      <ActionLabel icon={icon} label={label} />
    </button>
  )
}
