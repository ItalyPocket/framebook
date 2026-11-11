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
          <path className="art-paper" d="M205 112H638L728 202V524H205Z" fill="#fff" />
          <path d="M166 68H656V520H166z" fill={`url(#${id}-grid)`} />
          <path className="art-blue-plane" d="M286 92H654L738 176V330H286Z" fill="#1737D1" />
          <path d="M166 354H560V544H166z" fill={`url(#${id}-dots)`} />
          <path d="M220 238H506V498H220Z" fill="#F4F5F2" stroke="#101113" strokeWidth="2" />
          <path d="M234 224H520V484H234Z" fill="#fff" stroke="#1737D1" strokeWidth="2" />
          <path d="M248 210H534V470H248Z" fill="#1737D1" />
          <path d="M248 210H534V250H248Z" fill="#101113" />
          <path d="M264 270H518V454H264Z" fill="#F4F5F2" />
          <path d="M264 454L518 270V454Z" fill="#1737D1" />
          <path d="M264 400L452 270H518L264 454Z" fill="#101113" />
          <g className="art-orbit" stroke="#1737D1" strokeWidth="1">
            <path d="M74 149H760M74 546H760M122 46V584M678 46V584M76 584L760 74" />
            <path d="M108 149H136M122 135V163M664 546H692M678 532V560" strokeWidth="3" />
          </g>
          <path d="M514 378H742V396H514zM514 410H672V416H514z" fill="#101113" />
          <path className="art-signal" d="M514 432H716V448H514z" fill="#1737D1" />
          <path d="M112 84H272V116H112z" fill="#F4F5F2" />
          <text x="124" y="106" fill="#1737D1" fontSize="14" fontFamily="monospace" letterSpacing="3">FRAME / 01</text>
          <path d="M256 542H554V590H256z" fill="#F4F5F2" />
          <text x="270" y="574" fill="#101113" fontSize="26" fontFamily="monospace" letterSpacing="5">FRAMEBOOK</text>
          <path d="M35 576H204" stroke="#1737D1" strokeWidth="8" />
          <path d="M648 92H680V124H648z" fill="#F4F5F2" />

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
