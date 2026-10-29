import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../settings'

export function LaunchIntro(): JSX.Element | null {
  const settings = useSettings((state) => state.value)
  const started = useRef(false)
  const [visible, show] = useState(false)
  useEffect(() => {
    if (!settings || started.current) return
    started.current = true
    const date = new Date().toLocaleDateString('en-CA')
    if (
      settings.introMode === 'off' ||
      (settings.introMode === 'daily' && localStorage.getItem('framebook.intro.date') === date)
    )
      return
    localStorage.setItem('framebook.intro.date', date)
    show(true)
  }, [settings])
  useEffect(() => {
    if (!visible) return
    const reduced =
      settings?.simplifyAnimations || matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(
      () => show(false),
      reduced ? 400 : settings?.introDuration === 'short' ? 800 : 3100
    )
    const skip = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') show(false)
    }
    window.addEventListener('keydown', skip)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip)
    }
  }, [visible])
  if (!visible) return null
  return (
    <button
      className={`launch-intro ${settings?.introDuration === 'short' ? 'short' : 'full'}`}
      aria-label="Skip introduction"
      onClick={() => show(false)}
    >
      <span className="intro-axis" />
      <span className="intro-axis cross" />
      <span className="intro-mark">
        <i />
        <i />
        <i />
      </span>
      <span className="intro-title">
        帧册<small>FRAMEBOOK / IMAGES IN SEQUENCE</small>
      </span>
      <span className="intro-skip">ESC / SKIP</span>
    </button>
  )
}
