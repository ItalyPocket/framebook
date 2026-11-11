import { useEffect, useRef } from 'react'
export function SelectionCheckbox({ checked, mixed = false, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange(event: React.ChangeEvent<HTMLInputElement>): void }): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  return <input ref={ref} className="selection-checkbox" type="checkbox" aria-label={label} checked={checked} onChange={onChange} />
}
