import { useEffect, useId, useRef, useState } from 'react'
import { AnatomyPlate } from './AnatomyPlate'

export function WorkspaceGlyph({ index }: { index: number }): JSX.Element {
  const paths = ['M12 18v-6h7m10 0h7v6m0 12v6h-7m-10 0h-7v-6', 'M14 12h19v24H14zM10 16v23h19m-12-9 6-8 7 8z', 'M12 16h24v17H12zM20 16v17M28 16v17M15 12h18M15 37h18', 'M13 15h22M13 24h22M13 33h22M18 10v28', 'M15 11h13l7 7v19H15zM28 11v7h7M20 24h10M20 29h10', 'm24 12 12 21H12zM24 12v21']
  return <svg className="workspace-glyph" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="20" stroke="currentColor" strokeDasharray="70 12 15 29" /><path d={paths[index]} stroke="currentColor" /><path d="M24 0v6M42 24h6M24 42v6M0 24h6" stroke="currentColor" />{index === 0 && <circle cx="24" cy="24" r="5" fill="currentColor" />}</svg>
}

export function ArtComposition({ variant = 'workspace' }: { variant?: 'welcome' | 'workspace' }): JSX.Element {
  const id = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    const art = ref.current!
    let tick = 0, pulseTimer = 0, inputTimer = 0
    let typing = false
    const active = (): void => { host.dataset.artPaused = String(typing || document.hidden || !document.hasFocus() || [...host.querySelectorAll('video')].some(video => !video.paused)) }
    const activate = (event: Event): void => {
      const control = (event.target as HTMLElement).closest<HTMLElement>('button:not(:disabled), [role="button"], input, textarea, select')
      if (!control || !host.contains(control)) { setAnchor(null); host.dataset.artActive = 'false'; return }
      const a = control.getBoundingClientRect(), b = host.getBoundingClientRect()
      setAnchor({ x: a.left - b.left, y: a.top - b.top, width: a.width, height: a.height })
      host.dataset.artActive = 'true'
      art.style.setProperty('--attention-x', String((a.left + a.width / 2) / innerWidth))
      art.style.setProperty('--attention-y', String((a.top + a.height / 2) / innerHeight))
    }
    const scroll = (event: Event): void => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !host.contains(target) || target.closest('.workspace-page.inactive, .libtv-canvas-container')) return
      cancelAnimationFrame(tick)
      tick = requestAnimationFrame(() => {
        const extent = target.scrollHeight - target.clientHeight
        if (extent > 0) art.style.setProperty('--scroll-progress', String(Math.max(0, Math.min(1, target.scrollTop / extent))))
      })
    }
    const click = (): void => {
      host.dataset.artPulse = 'false'
      requestAnimationFrame(() => { host.dataset.artPulse = 'true' })
      clearTimeout(pulseTimer)
      pulseTimer = window.setTimeout(() => { host.dataset.artPulse = 'false' }, 420)
    }
    const clear = (): void => { setAnchor(null); host.dataset.artActive = 'false' }
    const input = (): void => { typing = true; active(); clearTimeout(inputTimer); inputTimer = window.setTimeout(() => { typing = false; active() }, 1400) }
    host.addEventListener('pointerover', activate); host.addEventListener('focusin', activate)
    host.addEventListener('pointerleave', clear); host.addEventListener('click', click); host.addEventListener('input', input)
    host.addEventListener('play', active, true); host.addEventListener('pause', active, true)
    document.addEventListener('scroll', scroll, true); document.addEventListener('visibilitychange', active)
    window.addEventListener('blur', active); window.addEventListener('focus', active)
    active()
    return () => {
      cancelAnimationFrame(tick); clearTimeout(pulseTimer); clearTimeout(inputTimer)
      host.removeEventListener('pointerover', activate); host.removeEventListener('focusin', activate)
      host.removeEventListener('pointerleave', clear); host.removeEventListener('click', click); host.removeEventListener('input', input)
      host.removeEventListener('play', active, true); host.removeEventListener('pause', active, true)
      document.removeEventListener('scroll', scroll, true); document.removeEventListener('visibilitychange', active)
      window.removeEventListener('blur', active); window.removeEventListener('focus', active)
    }
  }, [])
  return <div ref={ref} className={`art-composition art-${variant}`} aria-hidden="true">
    <svg className="anatomy-scene" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id={`${id}-dots`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="currentColor" /></pattern>
        <pattern id={`${id}-hatch`} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10 10 0" stroke="currentColor" strokeWidth=".7" /></pattern>
      </defs>
      <g className="scene-geometry">
        <path className="scene-blue" d="M710 155H902V255H1012V416H940V588H975V756H750V842H664V624H609V411H661V258H710Z" fill="currentColor" opacity=".13" />
        <path d="M515 292h144v242H515zM906 570h145v136H906z" fill={`url(#${id}-dots)`} opacity=".5" />
        <path d="M904 395h210v95H904z" fill={`url(#${id}-hatch)`} opacity=".45" />
      </g>
      <g className="scene-body"><AnatomyPlate /></g>
      <g className="scene-axis" fill="none" stroke="currentColor" strokeWidth=".7">
        <path d="M410 360H1240M455 780H1260M660 110V879M1096 164V850M460 875 1138 168" opacity=".3" />
        <path className="scene-orbit" d="M500 680C614 855 1020 819 1152 541" />
        <path d="M505 770h18m-9-9v18m568-541h18m-9-9v18" />
      </g>
      <g className="scene-type" fill="currentColor">
        <text x="566" y="923" className="scene-micro">F / B — ANATOMY OF THE MOVING IMAGE</text>
        <text x="1112" y="510" className="scene-micro" transform="rotate(90 1112 510)">OBSERVE / ARRANGE / CREATE</text>
      </g>
    </svg>
    {anchor && <svg className="art-link-layer" aria-hidden="true"><path d={`M${anchor.x} ${anchor.y + anchor.height - 1}h${anchor.width}`} fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
  </div>
}
