import { useState } from 'react'
import { newId } from '@shared/schema'
import type { StoryCell, StoryColumn, StoryColumnType, StoryImage } from '@shared/types'
import { t, type Language } from '@shared/i18n'
import { useStore } from '../store'
import { StillImage } from './StillImage'
import { buildExportInputs } from '../lib/frameOps'

const types: StoryColumnType[] = ['text', 'number', 'single', 'multi', 'date', 'checkbox', 'image']
const templateStorageKey = 'framebook.storyboard.templates.v1'
interface ColumnTemplate { id: string; name: string; columns: StoryColumn[] }

function loadTemplates(): ColumnTemplate[] {
  try { const value = JSON.parse(localStorage.getItem(templateStorageKey) ?? '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}

export function StoryboardEditor(): JSX.Element | null {
  const doc = useStore((s) => s.doc)
  const folder = useStore((s) => s.projectFolder)
  const [exporting, setExporting] = useState(false)
  const [language, setLanguage] = useState<Language>('zh-CN')
  const [picker, setPicker] = useState<{ shotId: string; columnId: string } | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [hiddenColumn, setHiddenColumn] = useState('')
  const [templates, setTemplates] = useState<ColumnTemplate[]>(loadTemplates)
  const [templateId, setTemplateId] = useState('')
  if (!doc) return null
  const board = doc.storyboard
  const columns = board.columns.filter((column) => column.visible)
  const runExport = async (kind: 'pdf' | 'csv'): Promise<void> => {
    if (!folder || !board.shots.length) return
    setExporting(true)
    try {
      const shots = []
      for (const shot of board.shots) {
        const images = board.columns.filter((column) => column.type === 'image').flatMap((column) => (shot.cells[column.id] as StoryImage[] | undefined) ?? [])
        shots.push({ ...shot, rendered: await buildExportInputs(images.map((image) => image.frame)), imageRoles: images.map((image) => image.role) })
      }
      const result = await window.sbr.exportStoryboard({ title: board.title, description: board.description, columns: board.columns.filter((column) => column.visible), exportsRoot: `${folder}/exports`, shots, language, layout: 'table', orientation: 'landscape', kind })
      if (!result.ok) throw new Error(result.error)
      useStore.getState().toast(t('Export complete.'), 'success')
    } catch (error) { useStore.getState().toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error') }
    finally { setExporting(false) }
  }
  const addColumn = (): void => {
    const name = window.prompt(t('Column name'))?.trim()
    if (!name) return
    const labels: Record<string, StoryColumnType> = { 文本: 'text', 数字: 'number', 单选: 'single', 多选: 'multi', 日期: 'date', 勾选: 'checkbox', 图片: 'image' }
    const selectedType = window.prompt(`${t('Column type')}: 文本 / 数字 / 单选 / 多选 / 日期 / 勾选 / 图片`, '文本')
    const type = selectedType ? labels[selectedType] ?? selectedType as StoryColumnType : null
    if (!type || !types.includes(type)) return
    const options = ['single', 'multi'].includes(type) ? (window.prompt(t('Options, separated by commas'), '大远景,远景,全景,中景,近景,特写') ?? '').split(',').map((item) => item.trim()).filter(Boolean) : []
    useStore.getState().addStoryColumn({ id: newId('col'), name, type, width: 160, visible: true, options })
  }
  const saveTemplate = (): void => {
    const name = window.prompt(t('Template name'))?.trim()
    if (!name) return
    const template = { id: newId('template'), name, columns: structuredClone(board.columns) }
    const next = [...templates, template]
    setTemplates(next); localStorage.setItem(templateStorageKey, JSON.stringify(next)); setTemplateId(template.id)
  }
  const applyTemplate = (): void => {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    useStore.getState().mutate('apply storyboard template', (next) => {
      next.storyboard.columns = structuredClone(template.columns)
      for (const shot of next.storyboard.shots) for (const column of template.columns) if (!(column.id in shot.cells)) shot.cells[column.id] = column.type === 'image' ? [] : ''
    })
  }
  const renameTemplate = (): void => {
    const name = window.prompt(t('Template name'), templates.find((item) => item.id === templateId)?.name ?? '')?.trim()
    if (!name) return
    const next = templates.map((item) => item.id === templateId ? { ...item, name } : item)
    setTemplates(next); localStorage.setItem(templateStorageKey, JSON.stringify(next))
  }
  const deleteTemplate = (): void => {
    if (!templateId || !window.confirm(t('Delete this template?'))) return
    const next = templates.filter((item) => item.id !== templateId)
    setTemplates(next); localStorage.setItem(templateStorageKey, JSON.stringify(next)); setTemplateId('')
  }
  const importToCell = async (paths: string[], shotId: string, columnId: string): Promise<void> => {
    for (const path of paths) {
      try {
        const item = await window.sbr.importMedia(folder!, path)
        const media = useStore.getState().addMedia(item)
        const frame = useStore.getState().addFrame(media.id, 0, item.name)
        useStore.getState().addStoryImage(shotId, columnId, frame)
      } catch (error) { useStore.getState().toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error') }
    }
  }
  const cellInput = (shotId: string, column: StoryColumn, value: StoryCell): JSX.Element => {
    const update = (next: StoryCell): void => useStore.getState().updateStoryCell(shotId, column.id, next)
    if (column.type === 'image') {
      const images = (value as StoryImage[] | undefined) ?? []
      return <div className="story-cell-images">{images.map((image, index) => <div key={image.frame.id} className="story-cell-image"><StillImage frame={image.frame}/><button aria-label={t('Remove image')} onClick={() => update(images.filter((_, i) => i !== index))}>×</button></div>)}<div className="story-image-add"><button className="btn small" onClick={() => { setPicker({ shotId, columnId: column.id }); setChosen([]) }}>{t('Add from gallery')}</button><button className="btn small" onClick={() => void window.sbr.importImagesDialog().then((paths) => importToCell(paths, shotId, column.id))}>{t('Import image')}</button></div></div>
    }
    if (column.type === 'checkbox') return <input aria-label={column.name} type="checkbox" checked={value === true} onChange={(event) => update(event.target.checked)}/>
    if (column.type === 'single') return <div className="story-single"><select aria-label={column.name} value={typeof value === 'string' ? value : ''} onChange={(event) => update(event.target.value)}><option value=""/>{column.options.map((option) => <option key={option}>{option}</option>)}</select><button className="text-button" onClick={() => { const option = window.prompt(t('New option')); if (option?.trim()) { useStore.getState().updateStoryColumn(column.id, { options: [...column.options, option.trim()] }); update(option.trim()) } }}>{t('Add option')}</button></div>
    if (column.type === 'multi') {
      const selected = Array.isArray(value) && (!value.length || typeof value[0] === 'string') ? value as string[] : []
      return <div className="story-multi">{column.options.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => update(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))}/>{option}</label>)}<button className="text-button" onClick={() => { const option = window.prompt(t('New option')); if (option?.trim()) { useStore.getState().updateStoryColumn(column.id, { options: [...column.options, option.trim()] }); update([...selected, option.trim()]) } }}>{t('Add option')}</button></div>
    }
    return <input aria-label={column.name} type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={(event) => update(column.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)}/>
  }
  return <section className="storyboard-workspace">
    <header className="section-header"><div><span className="eyebrow">03 / STORYBOARD</span><h1>{t('Storyboard editor')}</h1></div><div className="toolbar"><select aria-label={t('Templates')} value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">{t('Templates')}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><button className="btn" disabled={!templateId} onClick={applyTemplate}>{t('Apply')}</button><button className="btn" onClick={saveTemplate}>{t('Save template')}</button><button className="btn" disabled={!templateId} onClick={renameTemplate}>{t('Rename')}</button><button className="btn" disabled={!templateId} onClick={deleteTemplate}>{t('Delete')}</button><select aria-label={t('Show column')} value={hiddenColumn} onChange={(event) => setHiddenColumn(event.target.value)}><option value="">{t('Hidden columns')}</option>{board.columns.filter((column) => !column.visible).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select><button className="btn" disabled={!hiddenColumn} onClick={() => { useStore.getState().updateStoryColumn(hiddenColumn, { visible: true }); setHiddenColumn('') }}>{t('Show')}</button><button className="btn" onClick={addColumn}>{t('Add column')}</button><button className="btn primary" onClick={() => useStore.getState().addShots([], false)}>{t('New shot')}</button></div></header>
    <div className="storyboard-heading"><input aria-label={t('Storyboard title')} value={board.title} onChange={(event) => useStore.getState().mutate('field:board:title', (next) => { next.storyboard.title = event.target.value })}/><textarea aria-label={t('Synopsis')} placeholder={t('Synopsis')} value={board.description} onChange={(event) => useStore.getState().mutate('field:board:description', (next) => { next.storyboard.description = event.target.value })}/></div>
    <div className="story-table-scroll"><table className="story-table"><thead><tr>{columns.map((column, index) => <th key={column.id} style={{ width: column.width }}><span title={t('Click to rename')} onClick={() => { const name = window.prompt(t('Column name'), column.name); if (name?.trim()) useStore.getState().updateStoryColumn(column.id, { name: name.trim() }) }}>{column.name}</span><span className="column-tools"><button aria-label={t('Move left')} disabled={!index} onClick={() => useStore.getState().reorderStoryColumn(column.id, index - 1)}>←</button><button aria-label={t('Move right')} disabled={index === columns.length - 1} onClick={() => useStore.getState().reorderStoryColumn(column.id, index + 1)}>→</button><button aria-label={t('Delete column')} onClick={() => useStore.getState().removeStoryColumn(column.id)}>×</button></span></th>)}<th>{t('Actions')}</th></tr></thead><tbody>{board.shots.map((shot, index) => <tr key={shot.id}>{columns.map((column) => <td key={column.id} style={{ width: column.width }}>{cellInput(shot.id, column, shot.cells[column.id] ?? (column.type === 'image' ? [] : ''))}</td>)}<td><div className="story-row-tools"><button aria-label={t('Move up')} disabled={!index} onClick={() => useStore.getState().reorderShot(shot.id, index - 1)}>↑</button><button aria-label={t('Move down')} disabled={index === board.shots.length - 1} onClick={() => useStore.getState().reorderShot(shot.id, index + 1)}>↓</button><button aria-label={t('Duplicate')} onClick={() => useStore.getState().duplicateShot(shot.id)}>⧉</button><button aria-label={t('Remove')} onClick={() => useStore.getState().removeShot(shot.id)}>×</button></div></td></tr>)}</tbody></table>{!board.shots.length && <div className="empty-editor"><h2>{t('Every shot starts with a frame.')}</h2><p>{t('Add selected gallery frames or create a blank shot.')}</p><button className="btn primary" onClick={() => useStore.getState().setWorkspace('gallery')}>{t('Open gallery')}</button></div>}</div>
    <footer className="storyboard-export"><span>{board.shots.length} {t('shots')}</span><div className="spacer"/><select aria-label={t('Export language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="zh-CN">简体中文</option><option value="en">English</option></select><button className="btn" disabled={exporting || !board.shots.length} onClick={() => void runExport('csv')}>{t('Shot list (CSV)')}</button><button className="btn primary" disabled={exporting || !board.shots.length} onClick={() => void runExport('pdf')}>{t(exporting ? 'Exporting…' : 'PDF storyboard')}</button></footer>
    {picker && <div className="modal-backdrop"><div className="modal image-picker"><h2>{t('Add images from gallery')}</h2><div className="picker-grid">{[...doc.frames].sort((a, b) => a.order - b.order).map((frame) => <label key={frame.id}><StillImage frame={frame}/><input type="checkbox" checked={chosen.includes(frame.id)} onChange={(event) => setChosen(event.target.checked ? [...chosen, frame.id] : chosen.filter((id) => id !== frame.id))}/>{frame.label}</label>)}</div><div className="modal-actions"><button className="btn" onClick={() => setPicker(null)}>{t('Cancel')}</button><button className="btn primary" disabled={!chosen.length} onClick={() => { useStore.getState().addShotImages(picker.shotId, chosen); setPicker(null) }}>{t('Add images')}</button></div></div></div>}
  </section>
}
