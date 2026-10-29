import { useState, type ReactNode } from 'react'
import { t } from '@shared/i18n'

export function DockLayout({ name, panels }: { name: string; panels: { id: string; title: string; content: ReactNode }[] }): JSX.Element {
  const defaults = { order: panels.map((p) => p.id), hidden: [] as string[], left: 230, right: 290, bottom: 210 }
  const [layout, setLayout] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(`dock-${name}`) ?? '{}') } as typeof defaults } catch { return defaults }
  })
  const two = panels.length === 2
  const [side, setSide] = useState(() => localStorage.getItem(`dock-side-${name}`) === 'yes')
  const [drag, setDrag] = useState<string | null>(null)
  const update = (next: typeof defaults): void => { setLayout(next); localStorage.setItem(`dock-${name}`, JSON.stringify(next)) }
  const resize = (event: React.PointerEvent, key: 'left' | 'right' | 'bottom'): void => {
    event.preventDefault()
    const start = key === 'bottom' ? event.clientY : event.clientX
    const value = layout[key]
    const move = (e: PointerEvent): void => {
      const delta = (key === 'bottom' ? e.clientY : e.clientX) - start
      update({ ...layout, [key]: Math.max(140, Math.min(key === 'bottom' ? window.innerHeight * .5 : window.innerWidth * .32, value + delta * (key === 'left' || (two && !side) ? 1 : -1))) })
    }
    const end = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true })
  }
  return <div className={`dock-layout dock-${name}`}>
    <div className="dock-tools">{two && <button className="text-button" onClick={() => {setSide(!side);localStorage.setItem(`dock-side-${name}`,side?'no':'yes')}}>{t(side?'Stack vertically':'Arrange side by side')}</button>}{panels.map((panel) => <button key={panel.id} className="text-button" aria-pressed={!layout.hidden.includes(panel.id)} onClick={() => update({ ...layout, hidden: layout.hidden.includes(panel.id) ? layout.hidden.filter((id) => id !== panel.id) : [...layout.hidden, panel.id] })}>{t(panel.title)}</button>)}<button className="text-button" onClick={() => update(defaults)}>{t('Reset layout')}</button></div>
    <div className="dock-grid" style={two ? {gridTemplateColumns: side ? `${layout.hidden.includes(layout.order[0]!) ? 0 : layout.left}px 6px minmax(0,1fr)` : 'minmax(0,1fr)',gridTemplateRows: side ? 'minmax(0,1fr)' : `${layout.hidden.includes(layout.order[0]!) ? 0 : layout.bottom}px 6px minmax(0,1fr)`} : {gridTemplateColumns:`${layout.hidden.includes(layout.order[0]!) ? 0 : layout.left}px 6px minmax(0,1fr) 6px ${layout.hidden.includes(layout.order[2]!) ? 0 : layout.right}px`,gridTemplateRows:`minmax(0,1fr) 6px ${layout.hidden.includes(layout.order[3]!) ? 0 : layout.bottom}px`}}>
      {layout.order.map((id, index) => {
        const panel = panels.find((p) => p.id === id)
        if(!panel) return null
        return <section key={id} className={`dock-slot ${drag && drag !== id ? 'dock-target' : ''}`} style={{gridColumn:two ? (side ? index*2+1 : 1) : index === 3 ? '1 / -1' : index * 2 + 1,gridRow:two ? (side?1:index*2+1) : index === 3 ? 3 : 1,display:layout.hidden.includes(id)?'none':undefined}} onDragOver={(e) => { if(drag) e.preventDefault() }} onDrop={(e) => { e.preventDefault(); if(!drag) return; const order = [...layout.order]; const from = order.indexOf(drag); [order[from],order[index]]=[order[index]!,order[from]!]; update({...layout,order}); setDrag(null) }}>
          <header className="dock-title" draggable onDragStart={() => setDrag(id)} onDragEnd={() => setDrag(null)}>{t(panel.title)}<button aria-label={t('Collapse')} onClick={() => update({...layout,hidden:[...layout.hidden,id]})}>−</button></header>
          <div className="dock-content">{panel.content}</div>
        </section>
      })}
      {(two ? (side ? ['left'] as const : ['bottom'] as const) : ['left','right','bottom'] as const).map((key,index) => <div key={key} role="separator" aria-label={t('Resize panel')} className={`dock-resizer ${key}`} style={key === 'bottom'?{gridColumn:'1 / -1',gridRow:2}:{gridColumn:index * 2 + 2,gridRow:1}} onPointerDown={(e) => resize(e,key)} />)}
    </div>
  </div>
}
