import type { ExportPreview } from '@shared/workspace'
import { ExportPreviewDialog } from '../components/ExportPreview'
import { useRef, useState } from 'react'
import {
  createFrame,
  newId,
  storyColumnPresets,
  minimumColumnWidth,
  formatStoryDuration
} from '@shared/schema'
import type { StoryColumn, StoryImage } from '@shared/types'
import { t, type Language } from '@shared/i18n'
import { useStore } from '../store'
import { StillImage } from './StillImage'
import { ArtComposition } from '../components/ArtComposition'
import { buildExportInputs } from '../lib/frameOps'
import { Dialog, Menu, MenuItem, usePreference } from '../components/Controls'
import { ColumnDialog, StoryField } from '../components/StoryFields'

const templateStorageKey = 'framebook.storyboard.templates.v1'
interface ColumnTemplate {
  id: string
  name: string
  columns: StoryColumn[]
}
function loadTemplates(): ColumnTemplate[] {
  try {
    const value = JSON.parse(localStorage.getItem(templateStorageKey) ?? '[]')
    return Array.isArray(value)
      ? value.filter(
          (item) =>
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            Array.isArray(item.columns)
        )
      : []
  } catch {
    return []
  }
}

export function StoryboardEditor(): JSX.Element | null {
  const doc = useStore((s) => s.doc)
  const folder = useStore((s) => s.projectFolder)
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [exporting, setExporting] = useState(false)
  const [language, setLanguage] = useState<Language>('zh-CN')
  const [density, setDensity] = usePreference('framebook.ui.density', 'medium', [
    'compact',
    'medium',
    'large'
  ] as const)
  const [picker, setPicker] = useState<{ shotId: string; columnId: string } | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [editingColumn, setEditingColumn] = useState<StoryColumn | null | undefined>()
  const [preview, setPreview] = useState<StoryImage | null>(null)
  const [panel, setPanel] = useState<'templates' | 'columns' | 'export' | 'addColumn' | null>(null)
  const [confirmation, setConfirmation] = useState<{ message: string; action(): void } | null>(null)
  const [templates, setTemplates] = useState<ColumnTemplate[]>(loadTemplates)
  const [templateId, setTemplateId] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [details, setDetails] = useState(false)
  const dragging = useRef<string | null>(null)
  if (!doc) return null
  const board = doc.storyboard
  const columns = board.columns.filter((column) => column.visible)
  const frozenId = columns.find((column) => column.id === 'shotNo')?.id
  const orderedColumns = frozenId
    ? [
        columns.find((column) => column.id === frozenId)!,
        ...columns.filter((column) => column.id !== frozenId)
      ]
    : columns
  const saveTemplates = (next: ColumnTemplate[]): void => {
    setTemplates(next)
    localStorage.setItem(templateStorageKey, JSON.stringify(next))
  }
  const confirm = (message: string, action: () => void): void =>
    setConfirmation({ message, action })
  const resizeColumn = (event: React.PointerEvent, column: StoryColumn): void => {
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const start = event.clientX
    const table = target.closest('table')!
    const col = table.querySelector<HTMLTableColElement>(
      `col[data-column="${CSS.escape(column.id)}"]`
    )!
    const originalWidth = table.getBoundingClientRect().width
    let width = column.width
    const move = (next: PointerEvent): void => {
      width = Math.max(
        minimumColumnWidth(column),
        Math.min(800, column.width + next.clientX - start)
      )
      col.style.width = `${width}px`
      table.style.width = `${originalWidth + width - column.width}px`
    }
    const finish = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', finish)
      target.removeEventListener('pointercancel', finish)
      useStore.getState().updateStoryColumn(column.id, { width })
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', finish)
    target.addEventListener('pointercancel', finish)
  }
  const runExport = async (kind: 'pdf' | 'csv'): Promise<void> => {
    if (!folder || !board.shots.length) return
    setExporting(true)
    try {
      const shots = []
      for (const shot of board.shots) {
        const renderedByColumn: Record<string, Awaited<ReturnType<typeof buildExportInputs>>> = {}
        const rolesByColumn: Record<string, string[]> = {}
        for (const column of columns.filter((item) => item.type === 'image')) {
          const images = (shot.cells[column.id] as StoryImage[]) ?? []
          renderedByColumn[column.id] = await buildExportInputs(images.map((image) => image.frame))
          rolesByColumn[column.id] = images.map((image) => image.role)
        }
        shots.push({ ...shot, rendered: [], imageRoles: [], renderedByColumn, rolesByColumn })
      }
      const result = await window.sbr.preparePreview({
        storyboard: {
          title: board.title,
          description: board.description,
          columns: orderedColumns,
          exportsRoot: `${folder}/exports`,
          shots,
          language,
          layout: 'table',
          orientation,
          kind
        }
      })
      setPanel(null)
      setExportPreview(result)
    } catch (error) {
      useStore
        .getState()
        .toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error')
    } finally {
      setExporting(false)
    }
  }
  const importToCell = async (shotId: string, columnId: string): Promise<void> => {
    if (!folder) return
    for (const path of await window.sbr.importImagesDialog()) {
      try {
        const item = await window.sbr.importMedia(folder, path)
        const media = useStore.getState().addMedia(item)
        useStore.getState().addStoryImage(shotId, columnId, createFrame(media.id, 0, 0, item.name))
      } catch (error) {
        useStore
          .getState()
          .toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error')
      }
    }
  }
  const showPicker = (shotId: string, columnId: string): void => {
    setPicker({ shotId, columnId })
    setChosen([])
  }
  const imageCell = (shotId: string, column: StoryColumn, images: StoryImage[]): JSX.Element => (
    <div className="story-cell-images">
      {images.map((image, index) => (
        <div key={image.frame.id} className="story-cell-image">
          <button
            className="image-preview-button"
            aria-label={t('Preview image')}
            onClick={() => setPreview(image)}
          >
            <StillImage frame={image.frame} />
          </button>
          <div className="image-tools contextual">
            <button
              className="icon-button"
              aria-label={t('Move left')}
              disabled={!index}
              onClick={() => {
                const next = [...images]
                ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                useStore.getState().updateStoryCell(shotId, column.id, next)
              }}
            >
              ←
            </button>
            <button
              className="icon-button"
              aria-label={t('Move right')}
              disabled={index === images.length - 1}
              onClick={() => {
                const next = [...images]
                ;[next[index + 1], next[index]] = [next[index]!, next[index + 1]!]
                useStore.getState().updateStoryCell(shotId, column.id, next)
              }}
            >
              →
            </button>
            <button
              className="icon-button danger"
              aria-label={t('Remove image')}
              onClick={() =>
                useStore.getState().updateStoryCell(
                  shotId,
                  column.id,
                  images.filter((_, i) => i !== index)
                )
              }
            >
              ×
            </button>
          </div>
          <span className="image-time">{image.frame.timeS.toFixed(2)} s</span>
        </div>
      ))}
      <div className={`story-image-add ${images.length ? 'contextual' : 'empty-image'}`}>
        <Menu label={t('Add image')} className="image-add-trigger">
          <MenuItem onClick={() => showPicker(shotId, column.id)}>{t('Add from gallery')}</MenuItem>
          <MenuItem onClick={() => void importToCell(shotId, column.id)}>
            {t('Import image')}
          </MenuItem>
        </Menu>
      </div>
    </div>
  )
  return (
    <section className={`storyboard-workspace density-${density}`}>
      <ArtComposition />
      <header className="section-header">
        <div className="section-title">
          <span className="eyebrow">03 / STORYBOARD</span>
          <h1>{t('Storyboard editor')}</h1>
        </div>
        <div className="toolbar">
          <Menu label={t('View settings')}>
            <span className="menu-label">{t('Row density')}</span>
            {(['compact', 'medium', 'large'] as const).map((value) => (
              <MenuItem key={value} onClick={() => setDensity(value)}>
                {density === value ? '✓ ' : ''}
                {t({ compact: 'Compact', medium: 'Comfortable', large: 'Large images' }[value])}
              </MenuItem>
            ))}
            <hr />
            <MenuItem onClick={() => setPanel('columns')}>{t('Manage columns')}</MenuItem>
            <MenuItem onClick={() => setPanel('templates')}>{t('Templates')}</MenuItem>
          </Menu>
          <button className="btn" disabled={!board.shots.length} onClick={() => setPanel('export')}>
            {t('Export…')}
          </button>
          <button className="btn primary" onClick={() => useStore.getState().addShots([], false)}>
            ＋ {t('New shot')}
          </button>
        </div>
      </header>
      <div className="storyboard-heading">
        <input
          aria-label={t('Storyboard title')}
          value={board.title}
          onChange={(event) =>
            useStore.getState().mutate('field:board:title', (next) => {
              next.storyboard.title = event.target.value
            })
          }
        />
        <button
          className="text-button"
          aria-expanded={details}
          onClick={() => setDetails(!details)}
        >
          {t('Synopsis')} {details ? '−' : '＋'}
        </button>
        {details && (
          <textarea
            aria-label={t('Synopsis')}
            placeholder={t('Synopsis')}
            value={board.description}
            onChange={(event) =>
              useStore.getState().mutate('field:board:description', (next) => {
                next.storyboard.description = event.target.value
              })
            }
          />
        )}
      </div>
      <div className="story-table-scroll">
        <table
          className="story-table"
          style={{ width: 40 + 56 + columns.reduce((sum, column) => sum + column.width, 0) }}
        >
          <colgroup>
            <col style={{ width: 40 }} />
            {orderedColumns.map((column) => (
              <col key={column.id} data-column={column.id} style={{ width: column.width }} />
            ))}
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="row-handle-cell">{t('Order')}</th>
              {orderedColumns.map((column) => (
                <th key={column.id} className={column.id === frozenId ? 'frozen-column' : ''}>
                  <div className="column-header">
                    <span title={column.name}>{t(column.name)}</span>
                    <Menu
                      label={t('Column menu') + ': ' + t(column.name)}
                      className="column-menu contextual"
                    >
                      <MenuItem onClick={() => setEditingColumn(column)}>
                        {t('Edit column')}
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          useStore.getState().updateStoryColumn(column.id, { visible: false })
                        }
                      >
                        {t('Hide column')}
                      </MenuItem>
                      <MenuItem
                        disabled={column.id === frozenId || board.columns.indexOf(column) === 0}
                        onClick={() =>
                          useStore
                            .getState()
                            .reorderStoryColumn(column.id, board.columns.indexOf(column) - 1)
                        }
                      >
                        {t('Move left')}
                      </MenuItem>
                      <MenuItem
                        disabled={
                          column.id === frozenId ||
                          board.columns.indexOf(column) === board.columns.length - 1
                        }
                        onClick={() =>
                          useStore
                            .getState()
                            .reorderStoryColumn(column.id, board.columns.indexOf(column) + 1)
                        }
                      >
                        {t('Move right')}
                      </MenuItem>
                      <hr />
                      <MenuItem
                        danger
                        onClick={() =>
                          confirm(t('Delete this column and its contents?'), () =>
                            useStore.getState().removeStoryColumn(column.id)
                          )
                        }
                      >
                        {t('Delete column')}
                      </MenuItem>
                    </Menu>
                  </div>
                  <div
                    className="column-resizer"
                    role="separator"
                    aria-label={t('Resize column') + ': ' + t(column.name)}
                    aria-orientation="vertical"
                    tabIndex={0}
                    onPointerDown={(event) => resizeColumn(event, column)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                        event.preventDefault()
                        useStore.getState().updateStoryColumn(column.id, {
                          width: Math.max(
                            minimumColumnWidth(column),
                            Math.min(800, column.width + (event.key === 'ArrowRight' ? 20 : -20))
                          )
                        })
                      }
                    }}
                  />
                </th>
              ))}
              <th>
                <button
                  className="icon-button add-column"
                  aria-label={t('Add column')}
                  onClick={() => setPanel('addColumn')}
                >
                  ＋
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {board.shots.map((shot, index) => (
              <tr
                key={shot.id}
                data-shot-id={shot.id}
                onDragOver={(event) => {
                  if (dragging.current) {
                    event.preventDefault()
                    event.currentTarget.classList.add('drag-over')
                  }
                }}
                onDragLeave={(event) => event.currentTarget.classList.remove('drag-over')}
                onDrop={(event) => {
                  event.preventDefault()
                  event.currentTarget.classList.remove('drag-over')
                  if (dragging.current) useStore.getState().reorderShot(dragging.current, index)
                  dragging.current = null
                }}
              >
                <td className="row-handle-cell">
                  <div className="row-context contextual">
                    <button
                      className="icon-button drag-handle"
                      aria-label={t('Drag shot')}
                      draggable
                      onDragStart={(event) => {
                        dragging.current = shot.id
                        event.dataTransfer.setData('text/shot-id', shot.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        dragging.current = null
                        document
                          .querySelectorAll('.drag-over')
                          .forEach((node) => node.classList.remove('drag-over'))
                      }}
                    >
                      ⠿
                    </button>
                    <Menu label={t('Shot menu')} className="row-menu">
                      <MenuItem
                        disabled={!index}
                        onClick={() => useStore.getState().reorderShot(shot.id, index - 1)}
                      >
                        {t('Move up')}
                      </MenuItem>
                      <MenuItem
                        disabled={index === board.shots.length - 1}
                        onClick={() => useStore.getState().reorderShot(shot.id, index + 1)}
                      >
                        {t('Move down')}
                      </MenuItem>
                      <MenuItem onClick={() => useStore.getState().duplicateShot(shot.id)}>
                        {t('Duplicate')}
                      </MenuItem>
                      <hr />
                      <MenuItem
                        danger
                        onClick={() =>
                          confirm(t('Delete this shot?'), () =>
                            useStore.getState().removeShot(shot.id)
                          )
                        }
                      >
                        {t('Remove')}
                      </MenuItem>
                    </Menu>
                  </div>
                </td>
                {orderedColumns.map((column) => (
                  <td
                    key={column.id}
                    className={`${column.type === 'image' ? 'image-cell' : ''} ${column.id === frozenId ? 'frozen-column' : ''}`}
                  >
                    {column.type === 'image' ? (
                      imageCell(shot.id, column, (shot.cells[column.id] as StoryImage[]) ?? [])
                    ) : (
                      <StoryField
                        rowNumber={index + 1}
                        shotId={shot.id}
                        column={column}
                        value={shot.cells[column.id] ?? ''}
                      />
                    )}
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        {!board.shots.length && (
          <div className="empty-editor">
            <span className="empty-symbol" aria-hidden="true">
              ＋
            </span>
            <h2>{t('Every shot starts with a frame.')}</h2>
            <p>{t('Add selected gallery frames or create a blank shot.')}</p>
            <button className="btn" onClick={() => useStore.getState().setWorkspace('gallery')}>
              {t('Open gallery')}
            </button>
          </div>
        )}
      </div>
      <footer className="storyboard-status">
        <span>
          {board.shots.length} {t('shots')}
        </span>
        {board.columns.some((column) => column.id === 'duration') &&
          (() => {
            const durations = board.shots
              .map((shot) => shot.cells.duration)
              .filter(
                (value) =>
                  value !== '' &&
                  value !== null &&
                  value !== undefined &&
                  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
              )
              .map(Number)
              .filter((value) => Number.isFinite(value) && value >= 0)
            return (
              <span>
                {t('Total duration')}:{' '}
                {formatStoryDuration(durations.reduce((sum, value) => sum + value, 0))}
                {durations.length < board.shots.length &&
                  ` · ${t('Filled')}: ${durations.length}/${board.shots.length}`}
              </span>
            )
          })()}
        <span>
          {columns.length} {t('columns')}
        </span>
        <div className="spacer" />
        <span>{t('Click a cell to edit · Drag the handle to reorder')}</span>
      </footer>
      {panel === 'addColumn' && (
        <Dialog title={t('Add column')} onClose={() => setPanel(null)}>
          <div className="preset-columns">
            {storyColumnPresets()
              .filter((preset) => !board.columns.some((column) => column.id === preset.id))
              .map((preset) => (
                <button
                  className="btn"
                  key={preset.id}
                  onClick={() => {
                    useStore.getState().addStoryColumn(preset)
                    setPanel(null)
                  }}
                >
                  {t(preset.name)}
                </button>
              ))}
          </div>
          <div className="modal-actions">
            <button
              className="btn primary"
              onClick={() => {
                setPanel(null)
                setEditingColumn(null)
              }}
            >
              {t('Custom column')}
            </button>
          </div>
        </Dialog>
      )}
      {editingColumn !== undefined && (
        <ColumnDialog column={editingColumn} onClose={() => setEditingColumn(undefined)} />
      )}
      {confirmation && (
        <Dialog title={t('Confirm change')} onClose={() => setConfirmation(null)}>
          <p className="dialog-description">{confirmation.message}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirmation(null)}>
              {t('Cancel')}
            </button>
            <button
              className="btn primary"
              onClick={() => {
                confirmation.action()
                setConfirmation(null)
              }}
            >
              {t('Confirm')}
            </button>
          </div>
        </Dialog>
      )}
      {preview && (
        <Dialog
          title={preview.frame.label || t('Preview image')}
          onClose={() => setPreview(null)}
          wide
        >
          <div className="large-preview">
            <StillImage frame={preview.frame} />
          </div>
          <p className="preview-source">
            {doc.media.find((media) => media.id === preview.frame.mediaId)?.name} ·{' '}
            {preview.frame.timeS.toFixed(2)} s
          </p>
        </Dialog>
      )}
      {picker && (
        <Dialog title={t('Add images from gallery')} onClose={() => setPicker(null)} wide>
          <div className="picker-grid">
            {[...doc.frames]
              .sort((a, b) => a.order - b.order)
              .map((frame) => (
                <label key={frame.id}>
                  <StillImage frame={frame} />
                  <span>
                    <input
                      type="checkbox"
                      checked={chosen.includes(frame.id)}
                      onChange={(event) =>
                        setChosen(
                          event.target.checked
                            ? [...chosen, frame.id]
                            : chosen.filter((id) => id !== frame.id)
                        )
                      }
                    />
                    {frame.label}
                  </span>
                </label>
              ))}
            {!doc.frames.length && (
              <p className="hint">{t('Your next observation starts here.')}</p>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setPicker(null)}>
              {t('Cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!chosen.length}
              onClick={() => {
                useStore.getState().addShotImages(picker.shotId, chosen, picker.columnId)
                setPicker(null)
              }}
            >
              {t('Add images')}
            </button>
          </div>
        </Dialog>
      )}
      {panel === 'columns' && (
        <Dialog title={t('Manage columns')} onClose={() => setPanel(null)}>
          <div className="column-list">
            {board.columns.map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={(event) =>
                    useStore
                      .getState()
                      .updateStoryColumn(column.id, { visible: event.target.checked })
                  }
                />
                <span>{t(column.name)}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setPanel(null)
                    setEditingColumn(column)
                  }}
                >
                  {t('Edit')}
                </button>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="btn primary"
              onClick={() => {
                setPanel('addColumn')
              }}
            >
              {t('Add column')}
            </button>
          </div>
        </Dialog>
      )}
      {panel === 'templates' && (
        <Dialog title={t('Templates')} onClose={() => setPanel(null)}>
          <label className="field">
            {t('Templates')}
            <select
              aria-label={t('Templates')}
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value)
                setTemplateName(
                  templates.find((item) => item.id === event.target.value)?.name ?? ''
                )
              }}
            >
              <option value="">{t('Save a new template')}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Template name')}
            <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
          </label>
          <p className="hint">
            {t('Templates store columns only. Existing shot contents remain in the project.')}
          </p>
          <div className="template-actions">
            <button
              className="btn"
              disabled={!templateName.trim()}
              onClick={() => {
                const template = {
                  id: newId('template'),
                  name: templateName.trim(),
                  columns: structuredClone(board.columns)
                }
                saveTemplates([...templates, template])
                setTemplateId(template.id)
              }}
            >
              {t('Save template')}
            </button>
            <button
              className="btn"
              disabled={!templateId || !templateName.trim()}
              onClick={() =>
                saveTemplates(
                  templates.map((item) =>
                    item.id === templateId ? { ...item, name: templateName.trim() } : item
                  )
                )
              }
            >
              {t('Rename')}
            </button>
            <button
              className="btn danger"
              disabled={!templateId}
              onClick={() => {
                saveTemplates(templates.filter((item) => item.id !== templateId))
                setTemplateId('')
                setTemplateName('')
              }}
            >
              {t('Delete')}
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="btn primary"
              disabled={!templateId}
              onClick={() => {
                const template = templates.find((item) => item.id === templateId)
                if (!template) return
                useStore.getState().mutate('apply storyboard template', (next) => {
                  const existing = next.storyboard.columns
                  const replacements = template.columns.map((column) => {
                    const old = existing.find((item) => item.id === column.id)
                    return old && old.type !== column.type
                      ? { ...column, id: newId('col') }
                      : structuredClone(column)
                  })
                  next.storyboard.columns = [
                    ...replacements,
                    ...existing
                      .filter((column) => !replacements.some((item) => item.id === column.id))
                      .map((column) => ({ ...column, visible: false }))
                  ]
                  for (const shot of next.storyboard.shots)
                    for (const column of replacements)
                      if (!(column.id in shot.cells))
                        shot.cells[column.id] =
                          column.type === 'image' || column.type === 'multi' ? [] : ''
                })
                setPanel(null)
              }}
            >
              {t('Apply')}
            </button>
          </div>
        </Dialog>
      )}
      {exportPreview && (
        <ExportPreviewDialog preview={exportPreview} onClose={() => setExportPreview(null)} />
      )}
      {panel === 'export' && (
        <Dialog
          title={t('Export storyboard')}
          onClose={() => {
            if (!exporting) setPanel(null)
          }}
        >
          <label className="field">
            {t('Export language')}
            <select
              aria-label={t('Export language')}
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            {t('Page orientation')}
            <select
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as 'portrait' | 'landscape')}
            >
              <option value="landscape">{t('Landscape')}</option>
              <option value="portrait">{t('Portrait')}</option>
            </select>
          </label>
          <p className="hint">{t('Export visible columns in their current order.')}</p>
          <div className="modal-actions">
            <button className="btn" disabled={exporting} onClick={() => void runExport('csv')}>
              {t('Shot list (CSV)')}
            </button>
            <button
              className="btn primary"
              disabled={exporting}
              onClick={() => void runExport('pdf')}
            >
              {t(exporting ? 'Exporting…' : 'PDF storyboard')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
