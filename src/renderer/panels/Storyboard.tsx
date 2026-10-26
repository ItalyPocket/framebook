import { useState } from 'react'
import { STORY_FIELDS, type StoryShot, type StoryField } from '@shared/types'
import { t, type Language } from '@shared/i18n'
import { useStore } from '../store'
import { StillImage } from './StillImage'
import { buildExportInputs } from '../lib/frameOps'

export function StoryboardEditor(): JSX.Element | null {
  const doc = useStore((s) => s.doc)
  const folder = useStore((s) => s.projectFolder)
  const [selected, setSelected] = useState('')
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [picker, setPicker] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [language, setLanguage] = useState<Language>('zh-CN')
  const [layout, setLayout] = useState<'table' | 'cards'>('table')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape')
  if (!doc) return null
  const board = doc.storyboard
  const shot = board.shots.find((item) => item.id === selected) ?? board.shots[0]
  const update = (patch: Partial<StoryShot>): void => { if (shot) useStore.getState().updateShot(shot.id, patch) }
  const runExport = async (kind: 'pdf' | 'csv'): Promise<void> => {
    if (!folder || !board.shots.length) return
    setExporting(true)
    try {
      const shots = []
      for (const item of board.shots) shots.push({ ...item, rendered: await buildExportInputs(item.images.map((image) => image.frame)) })
      const result = await window.sbr.exportStoryboard({ title: board.title, description: board.description, exportsRoot: `${folder}/exports`, shots, language, layout, orientation, kind })
      if (!result.ok) throw new Error(result.error)
      useStore.getState().toast(t('Export complete.'), 'success')
    } catch (error) {
      useStore.getState().toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error')
    } finally { setExporting(false) }
  }
  const setTime = (key: 'startS' | 'endS', value: string): void => {
    if (!shot) return
    const number = value === '' ? null : Number(value)
    if (number !== null && (!Number.isFinite(number) || number < 0)) return
    update({ [key]: number })
  }
  const timeValid = !shot || shot.startS === null || shot.endS === null || shot.endS >= shot.startS
  return <section className="storyboard-workspace">
    <header className="section-header">
      <div><span className="eyebrow">03 / STORYBOARD</span><h1>{t('Storyboard editor')}</h1></div>
      <div className="toolbar">
        <button className={`btn ${view === 'table' ? 'primary' : ''}`} onClick={() => setView('table')}>{t('Table')}</button>
        <button className={`btn ${view === 'cards' ? 'primary' : ''}`} onClick={() => setView('cards')}>{t('Cards')}</button>
        <button className="btn" onClick={() => setSelected(useStore.getState().addShots([], false))}>{t('New shot')}</button>
      </div>
    </header>
    <div className="storyboard-body">
      <div className="storyboard-list">
        <div className="storyboard-heading">
          <input aria-label={t('Storyboard title')} value={board.title} onChange={(e) => useStore.getState().mutate('field:board:title', (next) => { next.storyboard.title = e.target.value })} />
          <textarea aria-label={t('Synopsis')} placeholder={t('Synopsis')} value={board.description} onChange={(e) => useStore.getState().mutate('field:board:description', (next) => { next.storyboard.description = e.target.value })} />
        </div>
        {!board.shots.length && <div className="empty-editor"><b>01 — 02 — 03</b><h2>{t('Every shot starts with a frame.')}</h2><p>{t('Add selected gallery frames or create a blank shot.')}</p><button className="btn primary" onClick={() => useStore.getState().setWorkspace('gallery')}>{t('Open gallery')}</button></div>}
        <div className={`shot-list ${view}`}>
          {board.shots.map((item, index) => <article key={item.id} className={`shot-card ${item.id === shot?.id ? 'selected' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/shot-id', item.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); useStore.getState().reorderShot(e.dataTransfer.getData('text/shot-id'), index) }} onClick={() => setSelected(item.id)}>
            <span className="shot-number">{String(index + 1).padStart(3, '0')}</span>
            <div className="shot-preview">{item.images[0] ? <StillImage frame={item.images[0].frame} /> : <span>＋</span>}<small>{item.images.length} {t('images')}</small></div>
            <div className="shot-summary"><span className="eyebrow">{item.sceneNo || '—'} / {item.shotSize ? t(item.shotSize) : '—'}</span><h3>{item.title || t('(untitled)')}</h3><p>{item.description || item.notes || t('Write your shot analysis.')}</p><small>{item.images[0]?.frame.timeS.toFixed(2) ?? '—'} s · {t(item.movement)}</small></div>
            <div className="shot-actions"><button className="btn small" aria-label={t('Move up')} disabled={index === 0} onClick={(e) => { e.stopPropagation(); useStore.getState().reorderShot(item.id, index - 1) }}>↑</button><button className="btn small" aria-label={t('Move down')} disabled={index === board.shots.length - 1} onClick={(e) => { e.stopPropagation(); useStore.getState().reorderShot(item.id, index + 1) }}>↓</button></div>
          </article>)}
        </div>
      </div>
      <aside className="shot-inspector">
        {shot ? <>
          <div className="inspector-heading"><h2>{t('Shot details')}</h2><button className="btn small" onClick={() => useStore.getState().duplicateShot(shot.id)}>{t('Duplicate')}</button><button className="btn small danger" onClick={() => { if (window.confirm(t('Remove this shot? You can undo this action.'))) useStore.getState().removeShot(shot.id) }}>{t('Remove')}</button></div>
          <div className="shot-images">{shot.images.map((image, index) => <div className="shot-image" key={image.frame.id}>
            <StillImage frame={image.frame} />
            <div className="shot-image-controls"><select aria-label={t('Frame role')} value={image.role} onChange={(e) => update({ images: shot.images.map((entry, i) => i === index ? { ...entry, role: e.target.value } : entry) })}>{['Start', 'Middle', 'End', 'Reference'].map((role) => <option key={role} value={role}>{t(role)}</option>)}</select><button className="btn small" aria-label={t('Move up')} disabled={index === 0} onClick={() => { const images = [...shot.images]; [images[index - 1], images[index]] = [images[index]!, images[index - 1]!]; update({ images }) }}>←</button><button className="btn small" aria-label={t('Remove image')} onClick={() => update({ images: shot.images.filter((_, i) => i !== index) })}>×</button></div>
            <button className="source-link" onClick={() => { useStore.getState().selectMedia(image.frame.mediaId); useStore.getState().setWorkspace('capture'); useStore.setState({ seekTime: image.frame.timeS }) }}>{t('Source')} {image.frame.timeS.toFixed(2)}s ↗</button>
          </div>)}</div>
          <button className="btn block" onClick={() => { setChosen([]); setPicker(true) }}>{t('Add images from gallery')}</button>
          <div className="shot-fields">{(Object.entries(STORY_FIELDS) as [StoryField, string][]).map(([key, label]) => <label className={`field ${['description', 'composition', 'lighting', 'dialogue', 'sound', 'notes'].includes(key) ? 'wide' : ''}`} key={key}><span>{t(label)}</span>{['description', 'composition', 'lighting', 'dialogue', 'sound', 'notes'].includes(key) ? <textarea value={shot[key]} onChange={(e) => update({ [key]: e.target.value })} /> : <input value={shot[key]} onChange={(e) => update({ [key]: e.target.value })} />}</label>)}</div>
          <div className="time-fields"><label className="field">{t('Start time (s)')}<input type="number" min="0" step="0.01" value={shot.startS ?? ''} onChange={(e) => setTime('startS', e.target.value)} /></label><label className="field">{t('End time (s)')}<input type="number" min="0" step="0.01" value={shot.endS ?? ''} onChange={(e) => setTime('endS', e.target.value)} /></label></div>
          <p className={timeValid ? 'hint' : 'err-text'}>{!timeValid ? t('End time must follow start time.') : `${t('Shot duration')}: ${shot.startS !== null && shot.endS !== null ? (shot.endS - shot.startS).toFixed(2) + ' s' : '—'}`}</p>
        </> : <p className="hint">{t('Select a shot to edit.')}</p>}
      </aside>
    </div>
    <footer className="storyboard-export"><span>{board.shots.length} {t('shots')}</span><div className="spacer" /><select aria-label={t('Export language')} value={language} onChange={(e) => setLanguage(e.target.value as Language)}><option value="zh-CN">简体中文</option><option value="en">English</option></select><select aria-label={t('PDF layout')} value={layout} onChange={(e) => setLayout(e.target.value as typeof layout)}><option value="table">{t('Table')}</option><option value="cards">{t('Cards')}</option></select><select aria-label={t('Page orientation')} value={orientation} onChange={(e) => setOrientation(e.target.value as typeof orientation)}><option value="landscape">{t('Landscape')}</option><option value="portrait">{t('Portrait')}</option></select><button className="btn" disabled={exporting || !board.shots.length} onClick={() => void runExport('csv')}>{t('Shot list (CSV)')}</button><button className="btn primary" disabled={exporting || !board.shots.length} onClick={() => void runExport('pdf')}>{t(exporting ? 'Exporting…' : 'PDF storyboard')}</button></footer>
    {picker && shot && <div className="modal-backdrop"><div className="modal image-picker"><h2>{t('Add images from gallery')}</h2><div className="picker-grid">{[...doc.frames].sort((a, b) => a.order - b.order).map((frame) => <label key={frame.id}><StillImage frame={frame} /><input type="checkbox" checked={chosen.includes(frame.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, frame.id] : chosen.filter((id) => id !== frame.id))} />{frame.label}</label>)}</div><div className="modal-actions"><button className="btn" onClick={() => setPicker(false)}>{t('Cancel')}</button><button className="btn primary" disabled={!chosen.length} onClick={() => { useStore.getState().addShotImages(shot.id, chosen); setPicker(false) }}>{t('Add images')}</button></div></div></div>}
  </section>
}
