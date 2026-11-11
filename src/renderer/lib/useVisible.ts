import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

const leases = new Map<symbol, { bytes: number; release(): void }>()
const budget = 256 * 1024 ** 2
export function useVisible<T extends HTMLElement>(bytes = 720 * 720 * 4): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const token = useRef(Symbol())
  const [visible, setVisible] = useState(false)
  const workspace = useStore(state => state.workspace)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const key = token.current
    const release = (): void => { leases.delete(key); setVisible(false) }
    const observer = new IntersectionObserver(entries => {
      const eligible = entries[0]?.isIntersecting && !element.closest('[aria-hidden="true"]')
      if (!eligible) { release(); return }
      if (!leases.has(key)) leases.set(key, { bytes, release })
      let used = [...leases.values()].reduce((sum, value) => sum + value.bytes, 0)
      for (const [id, lease] of leases) { if (used <= budget) break; if (id === key) continue; used -= lease.bytes; lease.release() }
      setVisible(true)
    }, { rootMargin: '160px' })
    observer.observe(element)
    return () => { observer.disconnect(); leases.delete(key); setVisible(false) }
  }, [workspace, bytes])
  return [ref, visible]
}
