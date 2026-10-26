import { useMemo, useState } from 'react'
import { t } from '@shared/i18n'
import { useStore } from '../store'
import { StillImage } from './StillImage'
import { buildExportInputs } from '../lib/frameOps'

export function Gallery(): JSX.Element {
  const rawFrames = useStore((s) => s.doc?.frames)
  const frames = useMemo(() => [...(rawFrames ?? [])].sort((a, b) => a.order - b.order), [rawFrames])
  const mode = useStore((s) => s.doc?.settings.gallerySort)
  const [selected, setSelected] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const chosen = frames.filter((frame) => selected.includes(frame.id))
  const add = (grouped: boolean): void => {
    useStore.getState().addShots(chosen.map((frame) => frame.id), grouped)
    useStore.getState().setWorkspace('storyboard')
  }
  const runExport = async (format: 'png' | 'jpg'): Promise<void> => {
    const s = useStore.getState()
    if (!s.projectFolder || !s.doc) return
    setExporting(true)
    try {
      const result = await window.sbr.exportNumbered({ projectName: s.doc.name, exportsRoot: `${s.projectFolder}/exports`, frames: await buildExportInputs(chosen.length ? chosen : frames) }, format)
      if (!result.ok) throw new Error(result.error)
      s.toast(t('Export complete.'), 'success')
    } catch (error) { s.toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error') }
    finally { setExporting(false) }
  }
  return <section className="gallery-workspace">
    <header className="section-header"><div><span className="eyebrow">02 / FRAME ARCHIVE</span><h1>{t('Frame gallery')}</h1><p>{t('Drag to arrange. Export in the order you see.')}</p></div><span className="big-count">{String(frames.length).padStart(3, '0')}</span></header>
    <div className="gallery-toolbar"><button className="btn" onClick={() => setSelected(chosen.length === frames.length ? [] : frames.map((frame) => frame.id))}>{t(chosen.length === frames.length && frames.length ? 'Deselect all' : 'Select all')}</button><span>{chosen.length} {t('selected')}</span><div className="spacer"/><span className="hint">{t(mode === 'time' ? 'Source time order' : 'Manual order')}</span><button className="btn" onClick={() => useStore.getState().sortGallery()}>{t('Sort by source time')}</button></div>
    <div className="gallery-grid">
      {!frames.length && <div className="empty-editor"><h2>{t('Your next observation starts here.')}</h2><p>{t('Capture a frame, then build your storyboard.')}</p><button className="btn primary" onClick={() => useStore.getState().setWorkspace('capture')}>{t('Capture')}</button></div>}
      {frames.map((frame, index) => <article className={`gallery-card ${selected.includes(frame.id) ? 'selected' : ''}`} key={frame.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/frame-id', frame.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/frame-id'); if (id) useStore.getState().reorderFrame(id, index) }}>
        <div className="gallery-image" onDoubleClick={() => { useStore.getState().selectFrame(frame.id); useStore.getState().setWorkspace('capture') }}><StillImage frame={frame}/><label className="gallery-check"><input type="checkbox" aria-label={`${t('Select')} ${index + 1}`} checked={selected.includes(frame.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, frame.id] : selected.filter((id) => id !== frame.id))}/></label><span className="image-index">{String(index + 1).padStart(3, '0')}</span></div>
        <div className="gallery-caption"><input aria-label={t('Label')} value={frame.label} onChange={(e) => useStore.getState().setFrameLabel(frame.id, e.target.value)}/><span>{frame.timeS.toFixed(2)} s</span></div>
        <div className="gallery-actions"><button className="btn small" disabled={!index} aria-label={t('Move up')} onClick={() => useStore.getState().reorderFrame(frame.id, index - 1)}>←</button><button className="btn small" disabled={index === frames.length - 1} aria-label={t('Move down')} onClick={() => useStore.getState().reorderFrame(frame.id, index + 1)}>→</button><div className="spacer"/><button className="btn small" onClick={() => { useStore.getState().selectFrame(frame.id); useStore.getState().setWorkspace('capture') }}>{t('Edit')}</button><button className="btn small danger" onClick={() => { if (window.confirm(t('Remove this frame? Storyboard copies will remain.'))) useStore.getState().removeFrame(frame.id) }}>{t('Remove')}</button></div>
      </article>)}
    </div>
    <footer className="gallery-footer"><button className="btn primary" disabled={!chosen.length} onClick={() => add(false)}>{t('One frame per shot')}</button><button className="btn" disabled={!chosen.length} onClick={() => add(true)}>{t('Combine into one shot')}</button><div className="spacer"/><span className="hint">{t(chosen.length ? 'Export selected' : 'Export all')}</span><button className="btn" disabled={!frames.length || exporting} onClick={() => void runExport('png')}>{t(exporting ? 'Exporting…' : 'Numbered PNG')}</button><button className="btn" disabled={!frames.length || exporting} onClick={() => void runExport('jpg')}>{t('Numbered JPG')}</button></footer>
  </section>
}
