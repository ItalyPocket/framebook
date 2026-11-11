import { useRef, useState } from 'react'

export function useItemSelection(ids: string[], selected: string[], setSelected: (ids: string[]) => void) {
  const anchor = useRef('')
  const [rectangle, setRectangle] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const click = (id: string, event: React.MouseEvent): void => {
    if (event.shiftKey && ids.includes(anchor.current)) {
      const bounds = [ids.indexOf(anchor.current), ids.indexOf(id)].sort((a, b) => a - b)
      const range = ids.slice(bounds[0], bounds[1]! + 1)
      setSelected(event.metaKey || event.ctrlKey ? [...new Set([...selected, ...range])] : range)
    } else {
      setSelected(event.metaKey || event.ctrlKey ? selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] : [id])
      anchor.current = id
    }
  }
  const keyDown = (event: React.KeyboardEvent): void => {
    if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); event.stopPropagation(); setSelected(ids) }
    if (event.key === 'Escape') setSelected([])
  }
  const pointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-select-id],button,input,select,textarea')) return
    event.currentTarget.focus({ preventScroll: true })
    event.preventDefault()
    const element = event.currentTarget, bounds = element.getBoundingClientRect()
    const start = { x: event.clientX, y: event.clientY }, initial = event.metaKey || event.ctrlKey ? selected : []
    element.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent): void => {
      const left = Math.min(start.x, next.clientX), top = Math.min(start.y, next.clientY)
      const right = Math.max(start.x, next.clientX), bottom = Math.max(start.y, next.clientY)
      setRectangle({ left: left - bounds.left + element.scrollLeft, top: top - bounds.top + element.scrollTop, width: right - left, height: bottom - top })
      const hits = [...element.querySelectorAll<HTMLElement>('[data-select-id]')].filter(item => { const rect = item.getBoundingClientRect(); return rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top }).map(item => item.dataset.selectId!)
      setSelected([...new Set([...initial, ...hits])])
    }
    const end = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); setRectangle(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
    window.addEventListener('pointercancel', end, { once: true })
    setSelected(initial)
  }
  return { click, keyDown, pointerDown, rectangle }
}
