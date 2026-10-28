import { useEffect, useId, useRef, useState } from 'react'

export function ArtComposition({
  variant = 'workspace'
}: {
  variant?: 'welcome' | 'workspace'
}): JSX.Element {
  const id = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const [control, setControl] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const activate = (event: Event): void => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        '.actions button, .section-header button, .gallery-toolbar button, .capture-bar button'
      )
      if (!target || !parent.contains(target)) {
        setControl(null)
        parent.removeAttribute('data-art-active')
        return
      }
      const box = target.getBoundingClientRect()
      const area = parent.getBoundingClientRect()
      setControl({
        x: box.left - area.left,
        y: box.top - area.top + parent.scrollTop,
        width: box.width,
        height: box.height
      })
      parent.setAttribute('data-art-active', 'true')
    }
    const clear = (): void => {
      setControl(null)
      parent.removeAttribute('data-art-active')
    }
    parent.addEventListener('pointerover', activate)
    parent.addEventListener('focusin', activate)
    parent.addEventListener('pointerleave', clear)
    parent.addEventListener('focusout', clear)
    return () => {
      parent.removeEventListener('pointerover', activate)
      parent.removeEventListener('focusin', activate)
      parent.removeEventListener('pointerleave', clear)
      parent.removeEventListener('focusout', clear)
      parent.removeAttribute('data-art-active')
    }
  }, [])
  return (
    <>
      <div ref={ref} className={`art-composition art-${variant}`} aria-hidden="true">
        <svg viewBox="0 0 800 620" fill="none" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id={`${id}-dots`} width="9" height="9" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.3" fill="currentColor" />
            </pattern>
            <pattern id={`${id}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" stroke="currentColor" strokeWidth=".5" />
            </pattern>
            <clipPath id={`${id}-clip`}>
              <path d="M280 90H715V490H280z" />
            </clipPath>
          </defs>
          <path className="art-paper" d="M215 135L650 58L736 491L301 568Z" fill="#fff" />
          <path d="M252 94H716V505H252z" fill={`url(#${id}-grid)`} />
          <path className="art-blue-plane" d="M330 120H710V330H330z" fill="#1737D1" />
          <path d="M180 356H560V534H180z" fill={`url(#${id}-dots)`} />
          <g clipPath={`url(#${id}-clip)`}>
            <circle cx="510" cy="330" r="190" stroke="#101113" strokeWidth="44" />
            <circle cx="510" cy="330" r="142" stroke="#F4F5F2" strokeWidth="2" />
            <path d="M250 450L735 165M250 466L735 181M250 482L735 197" stroke="#F4F5F2" strokeWidth="3" />
          </g>
          <g className="art-orbit" stroke="#1737D1">
            <ellipse cx="470" cy="310" rx="282" ry="94" transform="rotate(-33 470 310)" />
            <ellipse cx="470" cy="310" rx="247" ry="135" transform="rotate(37 470 310)" />
            <circle cx="470" cy="310" r="256" strokeDasharray="2 13" />
          </g>
          <g className="art-vectors" stroke="#101113" strokeWidth=".7">
            <path d="M18 506L734 112M47 553L734 112M95 601L734 112M17 450L734 112M217 618L734 112M738 14L124 542" />
            <path d="M125 44V558M78 501H755M690 43V570" />
            <path d="M112 208H138M125 195V221M677 420H703M690 407V433" strokeWidth="2" />
          </g>
          <path d="M116 146H310V164H116zM570 445H758V464H570z" fill="#101113" />
          <path className="art-signal" d="M107 173H248V193H107zM569 471H694V491H569z" fill="#1737D1" />
          <path d="M613 56H727V87H613z" fill="#F4F5F2" />
          <text x="621" y="77" fill="#101113" fontSize="12" fontFamily="monospace" letterSpacing="2">
            FRAME / 01
          </text>
          <path d="M267 544H457V587H267z" fill="#F4F5F2" />
          <text x="280" y="572" fill="#1737D1" fontSize="22" fontFamily="monospace" letterSpacing="5">
            FRAMEBOOK
          </text>
          <path d="M35 575H202" stroke="#1737D1" strokeWidth="8" />
          <circle className="art-marker" cx="734" cy="112" r="7" fill="#1737D1" />
          <path d="M49 250H99V300H49z" fill="#AFC8FF" />
          <path d="M64 260L83 279L64 298" stroke="#101113" strokeWidth="2" />
        </svg>
      </div>
      {control && (
        <svg className="art-composition art-link-layer" aria-hidden="true">
          <path
            className="control-connector"
            d={`M${control.x - 8} ${control.y + control.height + 7}h${control.width + 24}l24 -16h${variant === 'welcome' ? 160 : 48}`}
            fill="none"
            stroke="#1737D1"
            strokeWidth="1"
          />
          <path
            d={`M${control.x - 7} ${control.y - 7}h14m-7 -7v14M${control.x + control.width + 9} ${control.y + control.height - 3}v14m-7 -7h14`}
            stroke="#1737D1"
            strokeWidth="1"
          />
          <circle
            cx={control.x + control.width + (variant === 'welcome' ? 200 : 88)}
            cy={control.y + control.height - 9}
            r="3"
            fill="#1737D1"
          />
        </svg>
      )}
    </>
  )
}
