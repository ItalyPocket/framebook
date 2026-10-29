import { useEffect, useLayoutEffect } from 'react'
import { t } from '@shared/i18n'
import { useSettings } from '../settings'

export function shouldShowIntro(): boolean {
  const settings = useSettings.getState().value
  if (settings?.introMode === 'off') return false
  return settings?.introMode !== 'daily' || localStorage.getItem('framebook.intro.date') !== new Date().toLocaleDateString('en-CA')
}

export function LaunchIntro({ onComplete }: { onComplete(): void }): JSX.Element {
  const settings = useSettings((state) => state.value)
  const reduced = settings?.simplifyAnimations || matchMedia('(prefers-reduced-motion: reduce)').matches
  const duration = reduced ? 400 : settings?.introDuration === 'short' ? 800 : 3100
  useLayoutEffect(() => {
    localStorage.setItem('framebook.intro.date', new Date().toLocaleDateString('en-CA'))
  }, [])
  useEffect(() => {
    const timer = setTimeout(onComplete, duration)
    const skip = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onComplete()
      }
    }
    window.addEventListener('keydown', skip, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip, true)
    }
  }, [duration, onComplete])
  return (
    <button
      className={`launch-intro ${settings?.introDuration === 'short' ? 'short' : 'full'}`}
      aria-label={t('Skip introduction')}
      onClick={onComplete}
    >
      <span className="intro-plane" />
      <span className="intro-axis" />
      <span className="intro-axis cross" />
      <span className="intro-mark"><i /><i /><i /></span>
      <span className="intro-title">帧册<small>FRAMEBOOK / IMAGES IN SEQUENCE</small></span>
      <span className="intro-skip">ESC / SKIP</span>
    </button>
  )
}
