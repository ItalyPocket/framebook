import { StoryImages } from '../components/StoryImages'
import { SearchControl } from '../components/SearchControl'
import { useState } from 'react'
import { resolveLanguage, t } from '@shared/i18n'
import {
  createFrame,
  newId,
  defaultStoryColumns,
  minimumColumnWidth,
  formatStoryDuration
} from '@shared/schema'
import type { ShootDay, ProductionItem } from '@shared/production'
import type { StoryColumn, StoryCell, StoryImage, StoryShot, StoryColumnType } from '@shared/types'
import type { ExportPreview } from '@shared/workspace'
import type { StoryboardExportInput } from '@shared/exports'
import { useStore } from '../store'
import { Dialog, Menu, MenuItem, usePreference } from '../components/Controls'
import { StoryField } from '../components/StoryFields'
import { ExportPreviewDialog } from '../components/ExportPreview'
import { StillImage } from './StillImage'
import { buildExportInputs } from '../lib/frameOps'
import { useLanguage } from '../language'

const planningFields: StoryColumn[] = [
  { id: 'plan:owner', name: 'Owner', type: 'text', width: 140, visible: true, options: [] },
  {
    id: 'plan:preparation',
    name: 'Preparation minutes',
    type: 'number',
    width: 120,
    visible: true,
    options: []
  },
  {
    id: 'plan:minutes',
    name: 'Shooting minutes',
    type: 'number',
    width: 120,
    visible: true,
    options: []
  }
]
const initialIds = ['shotNo', 'image', 'description', 'shotSize', 'lens']
const pictures = (shot?: StoryShot): StoryImage[] =>
  Object.values(shot?.cells ?? {}).flatMap((value) =>
    Array.isArray(value)
      ? value.filter(
          (item): item is StoryImage => typeof item === 'object' && item !== null && 'frame' in item
        )
      : []
  )

export function Production({ callSheet = false }: { callSheet?: boolean }): JSX.Element {
  const doc = useStore((s) => s.doc)!
  const folder = useStore((s) => s.projectFolder)!
  const preference = useLanguage((s) => s.preference)
  const groups = doc.production.groups
  const [selected, select] = useState('')
  const [picker, setPicker] = useState<string | null>(null)
  const [query, search] = useState('')
  const [chosen, choose] = useState<string[]>([])
  const [duplicate, allowDuplicate] = useState(false)
  const [columnPanel, showColumns] = useState(false)
  const [editing, editColumn] = useState<StoryColumn | null>(null)
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [imageTarget, setImageTarget] = useState<{ item: string; column: StoryColumn } | null>(null)
  const [gallerySelection, setGallerySelection] = useState<string[]>([])
  const [large, enlarge] = useState<StoryImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [orientation, orient] = useState<'portrait' | 'landscape'>('landscape')
  const [density, setDensity] = usePreference('framebook.plan.density', 'medium', [
    'compact',
    'medium',
    'large'
  ] as const)
  const savedColumns = doc.production.columns
  const configured = savedColumns.length
    ? savedColumns
    : initialIds.flatMap((id) => {
        const col =
          doc.storyboard.columns.find((c) => c.id === id) ??
          defaultStoryColumns().find((c) => c.id === id)
        return col ? [{ ...col, visible: true }] : []
      })
  const columns = configured
    .filter((c) => c.visible)
    .map((c) => {
      const source = doc.storyboard.columns.find((s) => s.id === c.id)
      return source ? { ...source, width: c.width, visible: true } : c
    })
  const flexibleId =
    columns.find((c) => c.type === 'text')?.id ?? columns.find((c) => c.type === 'image')?.id
  const group = groups.find((g) => g.id === selected) ?? groups[0]
  const mutate = useStore.getState().mutate
  const changeColumns = (fn: (columns: StoryColumn[]) => void): void =>
    mutate('edit plan columns', (p) => {
      if (!p.production.columns.length) p.production.columns = structuredClone(configured)
      fn(p.production.columns)
    })
  const editGroup = (id: string, fn: (group: ShootDay) => void): void =>
    mutate('edit plan group', (p) => {
      const current = p.production.groups.find((g) => g.id === id)
      if (current) fn(current)
    })
  const newGroup = (): void => {
    const id = newId('group')
    mutate('add plan group', (p) =>
      p.production.groups.push({
        id,
        name: `${t('Scene')} ${groups.length + 1}`,
        date: '',
        location: '',
        start: '09:00',
        finish: '',
        items: [],
        notice: { meeting: '', personnel: '', equipment: '', emergency: '', notes: '' }
      })
    )
    select(id)
  }
  const moveItem = (id: string, target: string, before?: string): void =>
    mutate('move plan shot', (p) => {
      const source = p.production.groups.find((g) => g.items.some((i) => i.id === id))
      const destination = p.production.groups.find((g) => g.id === target)
      if (!source || !destination || id === before) return
      const item = source.items.splice(
        source.items.findIndex((i) => i.id === id),
        1
      )[0]!
      const at = before
        ? destination.items.findIndex((i) => i.id === before)
        : destination.items.length
      destination.items.splice(at < 0 ? destination.items.length : at, 0, item)
    })
  const addShots = (target: string, ids: string[]): void => {
    if (!duplicate && ids.some((id) => groups.some((g) => g.items.some((i) => i.shotId === id)))) {
      allowDuplicate(true)
      return
    }
    editGroup(target, (g) => {
      for (const id of ids)
        if (doc.storyboard.shots.some((s) => s.id === id))
          g.items.push({
            id: newId('plan'),
            shotId: id,
            snapshot: '',
            title: '',
            minutes: 15,
            preparation: 0,
            owner: '',
            cast: '',
            equipment: '',
            notes: '',
            status: 'pending',
            cells: {}
          })
    })
    setPicker(null)
    choose([])
    allowDuplicate(false)
  }
  const cellValue = (item: ProductionItem, column: StoryColumn): StoryCell => {
    if (column.id.startsWith('plan:'))
      return item[column.id.slice(5) as 'owner' | 'minutes' | 'preparation']
    const shot = doc.storyboard.shots.find((s) => s.id === item.shotId)
    return shot?.cells[column.id] ?? item.cells?.[column.id] ?? ''
  }
  const updateCell = (itemId: string, column: StoryColumn, value: StoryCell): void =>
    mutate(`field:plan:${itemId}:${column.id}`, (p) => {
      const item = p.production.groups.flatMap((g) => g.items).find((i) => i.id === itemId)
      if (!item) return
      if (column.id.startsWith('plan:')) {
        if (column.id === 'plan:owner') item.owner = String(value ?? '')
        else
          item[column.id === 'plan:minutes' ? 'minutes' : 'preparation'] = Math.max(
            0,
            Number(value) || 0
          )
        return
      }
      const shot = p.storyboard.shots.find((s) => s.id === item.shotId)
      if (shot && p.storyboard.columns.some((c) => c.id === column.id)) {
        shot.cells[column.id] = value
        if (column.id === 'startS' || column.id === 'endS')
          shot[column.id] = value === '' ? null : Number(value)
      } else {
        item.cells ??= {}
        item.cells[column.id] = value
      }
    })
  const exportPlan = async (kind: 'pdf' | 'csv'): Promise<void> => {
    setBusy(true)
    try {
      const exportColumns = callSheet
        ? [
            {
              id: 'label',
              name: t('Field'),
              type: 'text' as const,
              width: 120,
              visible: true,
              options: []
            },
            {
              id: 'value',
              name: t('Content'),
              type: 'text' as const,
              width: 400,
              visible: true,
              options: []
            }
          ]
        : columns
      const shots: StoryboardExportInput['shots'] = []
      const exportingGroups = callSheet ? (group ? [group] : []) : groups
      for (const g of exportingGroups) {
        const heading = [g.name, g.date, g.start, g.location].filter(Boolean).join(' · ')
        if (callSheet) {
          for (const [key, value] of Object.entries(g.notice))
            shots.push({
              id: newId(),
              cells: { label: t(key), value },
              startS: null,
              endS: null,
              rendered: [],
              imageRoles: [],
              groupTitle: heading
            })
        } else
          for (const item of g.items) {
            const shot = doc.storyboard.shots.find((s) => s.id === item.shotId)
            const renderedByColumn: Record<
              string,
              Awaited<ReturnType<typeof buildExportInputs>>
            > = {}
            const rolesByColumn: Record<string, string[]> = {}
            for (const col of columns.filter((c) => c.type === 'image')) {
              const value = cellValue(item, col)
              const images = Array.isArray(value)
                ? value.filter(
                    (v): v is StoryImage => typeof v === 'object' && v !== null && 'frame' in v
                  )
                : []
              renderedByColumn[col.id] = await buildExportInputs(images.map((i) => i.frame))
              rolesByColumn[col.id] = images.map((i) => i.role)
            }
            shots.push({
              id: item.id,
              startS: shot?.startS ?? null,
              endS: shot?.endS ?? null,
              cells: Object.fromEntries(columns.map((c) => [c.id, cellValue(item, c)])),
              rendered: [],
              imageRoles: [],
              renderedByColumn,
              rolesByColumn,
              groupTitle: heading
            })
          }
      }
      if (!shots.length) throw new Error(t('No shots to export'))
      setPreview(
        await window.sbr.preparePreview({
          storyboard: {
            projectName: doc.name,
            documentLabel: t(callSheet ? 'Call sheet' : 'Shooting plan'),
            title: `${doc.name} · ${t(callSheet ? 'Call sheet' : 'Shooting plan')}`,
            description: '',
            exportsRoot: `${folder}/exports`,
            columns: exportColumns,
            shots,
            language: resolveLanguage(preference, navigator.language),
            layout: 'table',
            orientation,
            kind
          }
        })
      )
    } catch (error) {
      useStore.getState().toast(String(error), 'error')
    } finally {
      setBusy(false)
    }
  }
  const resize = (event: React.PointerEvent, column: StoryColumn): void => {
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const start = event.clientX
    const move = (e: PointerEvent): void => {
      const width = Math.max(minimumColumnWidth(column), column.width + e.clientX - start)
      target
        .closest('table')
        ?.querySelector<HTMLElement>(`col[data-column="${column.id}"]`)
        ?.style.setProperty('width', `${width}px`)
    }
    const end = (e: PointerEvent): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', cancel)
      changeColumns((cols) => {
        const c = cols.find((c) => c.id === column.id)
        if (c) c.width = Math.max(minimumColumnWidth(column), column.width + e.clientX - start)
      })
    }
    const cancel = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', cancel)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', cancel)
  }
  const available = [...doc.storyboard.columns, ...planningFields].filter(
    (c) => !configured.some((current) => current.id === c.id)
  )
  return (
    <div className={`plan-workspace density-${density}`}>
      <header className="production-header">
        <div>
          <span className="eyebrow">{callSheet ? '05 / CALL SHEET' : '04 / SHOOTING PLAN'}</span>
          <h1>{t(callSheet ? 'Call sheet' : 'Shooting plan')}</h1>
        </div>
        <div className="spacer" />
        {!callSheet && (
          <Menu label={t('View settings')}>
            <MenuItem onClick={() => showColumns(true)}>{t('Manage columns')}</MenuItem>
            {(['compact', 'medium', 'large'] as const).map((d) => (
              <MenuItem key={d} onClick={() => setDensity(d)}>
                {t({ compact: 'Compact', medium: 'Comfortable', large: 'Large images' }[d])}
              </MenuItem>
            ))}
          </Menu>
        )}
        <select
          aria-label={t('Orientation')}
          value={orientation}
          onChange={(e) => orient(e.target.value as typeof orientation)}
        >
          <option value="landscape">{t('Landscape')}</option>
          <option value="portrait">{t('Portrait')}</option>
        </select>
        <Menu label={t('Export…')}>
          <MenuItem disabled={busy} onClick={() => void exportPlan('pdf')}>
            {t('Preview PDF')}
          </MenuItem>
          <MenuItem disabled={busy} onClick={() => void exportPlan('csv')}>
            CSV
          </MenuItem>
        </Menu>
        <button className="btn primary" onClick={newGroup}>
          ＋ {t('New group')}
        </button>
      </header>
      {callSheet && (
        <div className="call-group-tabs">
          {groups.map((g) => (
            <button
              className={g.id === group?.id ? 'btn primary' : 'btn'}
              key={g.id}
              onClick={() => select(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
      <div className="plan-scroll">
        {(callSheet ? (group ? [group] : []) : groups).map((g, index) => (
          <section
            className="plan-group"
            key={g.id}
            onDragOver={(e) => {
              if (
                e.dataTransfer.types.includes('text/plan-item') ||
                e.dataTransfer.types.includes('text/plan-shot')
              )
                e.preventDefault()
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('text/plan-item')
              const shot = e.dataTransfer.getData('text/plan-shot')
              if (id) {
                e.preventDefault()
                moveItem(id, g.id)
              } else if (shot) {
                e.preventDefault()
                addShots(g.id, [shot])
              }
            }}
          >
            <header className="plan-group-heading">
              <button
                className="icon-button group-handle contextual"
                draggable
                aria-label={t('Drag group')}
                onDragStart={(e) => e.dataTransfer.setData('text/plan-group', g.id)}
              >
                ⠿
              </button>
              <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>
              <input
                aria-label={t('Group name')}
                value={g.name}
                onChange={(e) =>
                  editGroup(g.id, (g) => {
                    g.name = e.target.value
                  })
                }
              />
              <input
                aria-label={t('Date')}
                type="date"
                value={g.date}
                onChange={(e) =>
                  editGroup(g.id, (g) => {
                    g.date = e.target.value
                  })
                }
              />
              <input
                aria-label={t('Start time')}
                type="time"
                value={g.start}
                onChange={(e) =>
                  editGroup(g.id, (g) => {
                    g.start = e.target.value
                  })
                }
              />
              <input
                aria-label={t('Location')}
                placeholder={t('Location')}
                value={g.location}
                onChange={(e) =>
                  editGroup(g.id, (g) => {
                    g.location = e.target.value
                  })
                }
              />
              <Menu className="group-menu contextual" label={t('Group menu')}>
                <MenuItem
                  disabled={!index}
                  onClick={() =>
                    mutate('reorder group', (p) => {
                      const list = p.production.groups
                      list.splice(index - 1, 0, list.splice(index, 1)[0]!)
                    })
                  }
                >
                  {t('Move up')}
                </MenuItem>
                <MenuItem
                  disabled={index === groups.length - 1}
                  onClick={() =>
                    mutate('reorder group', (p) => {
                      const list = p.production.groups
                      list.splice(index + 1, 0, list.splice(index, 1)[0]!)
                    })
                  }
                >
                  {t('Move down')}
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    if (g.items.length || Object.values(g.notice).some(Boolean)) {
                      useStore.getState().toast(t('Empty the group before deleting it.'), 'error')
                      return
                    }
                    mutate('delete group', (p) => {
                      p.production.groups = p.production.groups.filter((group) => group.id !== g.id)
                    })
                  }}
                >
                  {t('Delete')}
                </MenuItem>
              </Menu>
            </header>
            {callSheet ? (
              <div className="call-sheet-fields">
                {Object.entries(g.notice).map(([key, value]) => (
                  <label className="field" key={key}>
                    {t(key)}
                    <textarea
                      aria-label={t(key)}
                      value={value}
                      onChange={(e) =>
                        editGroup(g.id, (g) => {
                          g.notice[key as keyof typeof g.notice] = e.target.value
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ) : (
              <>
                <div className="story-table-scroll">
                  <table
                    className="story-table"
                    style={{
                      width: `max(100%, ${40 + columns.reduce((sum, c) => sum + c.width, 0)}px)`
                    }}
                  >
                    <colgroup>
                      <col style={{ width: 40 }} />
                      {columns.map((c) => (
                        <col
                          key={c.id}
                          data-column={c.id}
                          style={{ width: c.id === flexibleId ? 'auto' : c.width }}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{t('Order')}</th>
                        {columns.map((c) => (
                          <th key={c.id}>
                            <div className="column-header">
                              <span>{t(c.name)}</span>
                              <Menu
                                className="column-menu contextual"
                                label={`${t('Column menu')}: ${t(c.name)}`}
                              >
                                <MenuItem onClick={() => editColumn(c)}>
                                  {t('Edit column')}
                                </MenuItem>
                                <MenuItem
                                  onClick={() =>
                                    changeColumns((cols) => {
                                      cols.find((col) => col.id === c.id)!.visible = false
                                    })
                                  }
                                >
                                  {t('Hide column')}
                                </MenuItem>
                                <MenuItem
                                  onClick={() =>
                                    changeColumns((cols) => {
                                      const at = cols.findIndex((col) => col.id === c.id)
                                      if (at > 0) cols.splice(at - 1, 0, cols.splice(at, 1)[0]!)
                                    })
                                  }
                                >
                                  {t('Move left')}
                                </MenuItem>
                                <MenuItem
                                  onClick={() =>
                                    changeColumns((cols) => {
                                      const at = cols.findIndex((col) => col.id === c.id)
                                      if (at < cols.length - 1)
                                        cols.splice(at + 1, 0, cols.splice(at, 1)[0]!)
                                    })
                                  }
                                >
                                  {t('Move right')}
                                </MenuItem>
                              </Menu>
                              <button
                                className="column-resizer"
                                aria-label={t('Resize column')}
                                onPointerDown={(e) => resize(e, c)}
                              />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((item, n) => {
                        const shot = doc.storyboard.shots.find((s) => s.id === item.shotId)
                        return (
                          <tr
                            key={item.id}
                            onDragOver={(e) => {
                              if (e.dataTransfer.types.includes('text/plan-item'))
                                e.preventDefault()
                            }}
                            onDrop={(e) => {
                              const movingGroup = e.dataTransfer.getData('text/plan-group')
                              if (movingGroup) {
                                e.preventDefault()
                                mutate('move plan group', (p) => {
                                  const list = p.production.groups
                                  const from = list.findIndex((group) => group.id === movingGroup)
                                  const to = list.findIndex((group) => group.id === g.id)
                                  if (from >= 0 && to >= 0 && from !== to)
                                    list.splice(to, 0, list.splice(from, 1)[0]!)
                                })
                                return
                              }
                              const id = e.dataTransfer.getData('text/plan-item')
                              if (id) {
                                e.preventDefault()
                                e.stopPropagation()
                                moveItem(id, g.id, item.id)
                              }
                            }}
                          >
                            <td className="row-handle-cell">
                              <Menu className="row-menu contextual" label={t('Shot menu')}>
                                <MenuItem
                                  onClick={() =>
                                    editGroup(g.id, (g) => {
                                      const at = g.items.findIndex((i) => i.id === item.id)
                                      if (at > 0)
                                        g.items.splice(at - 1, 0, g.items.splice(at, 1)[0]!)
                                    })
                                  }
                                >
                                  {t('Move up')}
                                </MenuItem>
                                {groups
                                  .filter((other) => other.id !== g.id)
                                  .map((other) => (
                                    <MenuItem
                                      key={other.id}
                                      onClick={() => moveItem(item.id, other.id)}
                                    >
                                      {t('Move to')} {other.name}
                                    </MenuItem>
                                  ))}
                                <MenuItem
                                  danger
                                  onClick={() =>
                                    editGroup(g.id, (g) => {
                                      g.items = g.items.filter((i) => i.id !== item.id)
                                    })
                                  }
                                >
                                  {t('Remove')}
                                </MenuItem>
                              </Menu>
                              <button
                                className="icon-button contextual"
                                draggable
                                aria-label={t('Drag shot')}
                                onDragStart={(e) =>
                                  e.dataTransfer.setData('text/plan-item', item.id)
                                }
                              >
                                ⠿
                              </button>
                            </td>
                            {columns.map((c) => {
                              const value = cellValue(item, c)
                              return (
                                <td key={c.id}>
                                  {c.type === 'image' ? (
                                    <StoryImages
                                      shotId={shot?.id ?? ''}
                                      column={c}
                                      images={(Array.isArray(value) ? value : []).filter(
                                        (v): v is StoryImage =>
                                          typeof v === 'object' && v !== null && 'frame' in v
                                      )}
                                      onChange={(images) => updateCell(item.id, c, images)}
                                      onPreview={enlarge}
                                      onGallery={() => {
                                        setImageTarget({ item: item.id, column: c })
                                        setGallerySelection([])
                                      }}
                                      onImport={() =>
                                        void (async () => {
                                          try {
                                            for (const path of await window.sbr.importImagesDialog()) {
                                              const imported = await window.sbr.importMedia(
                                                folder,
                                                path
                                              )
                                              const media = useStore.getState().addMedia(imported)
                                              const current = useStore
                                                .getState()
                                                .doc!.production.groups.flatMap((g) => g.items)
                                                .find((i) => i.id === item.id)!
                                              const currentShot = useStore
                                                .getState()
                                                .doc!.storyboard.shots.find(
                                                  (s) => s.id === current.shotId
                                                )
                                              const old =
                                                currentShot?.cells[c.id] ??
                                                current.cells?.[c.id] ??
                                                []
                                              updateCell(item.id, c, [
                                                ...(Array.isArray(old)
                                                  ? (old as StoryImage[])
                                                  : []),
                                                {
                                                  frame: createFrame(media.id, 0, 0, media.name),
                                                  role: 'Reference'
                                                }
                                              ])
                                            }
                                          } catch (error) {
                                            useStore.getState().toast(String(error), 'error')
                                          }
                                        })()
                                      }
                                    />
                                  ) : (
                                    <StoryField
                                      shotId={shot?.id ?? item.id}
                                      column={c}
                                      value={value}
                                      rowNumber={
                                        shot ? doc.storyboard.shots.indexOf(shot) + 1 : n + 1
                                      }
                                      onUpdate={(v) => updateCell(item.id, c, v)}
                                      onOptions={(options) => {
                                        if (doc.storyboard.columns.some((col) => col.id === c.id))
                                          useStore.getState().updateStoryColumn(c.id, { options })
                                        else
                                          changeColumns((cols) => {
                                            cols.find((col) => col.id === c.id)!.options = options
                                          })
                                      }}
                                    />
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <footer className="plan-group-footer">
                  <span>
                    {g.items.length} {t('shots')}
                    {doc.storyboard.columns.some((c) => c.id === 'duration')
                      ? ` · ${formatStoryDuration(g.items.reduce((sum, i) => sum + (Number(doc.storyboard.shots.find((s) => s.id === i.shotId)?.cells.duration) || 0), 0))}`
                      : ''}{' '}
                    · {t('Shooting minutes')}:{' '}
                    {g.items.reduce((sum, i) => sum + i.minutes + i.preparation, 0)}
                  </span>
                  <button
                    className="btn small"
                    onClick={() => {
                      setPicker(g.id)
                      choose([])
                      search('')
                      allowDuplicate(false)
                    }}
                  >
                    ＋ {t('Add shots')}
                  </button>
                </footer>
              </>
            )}
          </section>
        ))}
        {!groups.length && (
          <div className="empty-state">
            <h2>{t('Organize shots by scene')}</h2>
            <button className="btn primary" onClick={newGroup}>
              ＋ {t('New group')}
            </button>
          </div>
        )}
      </div>
      {picker && (
        <Dialog title={t('Add shots')} onClose={() => setPicker(null)} modeless>
          <SearchControl label="Search shots" value={query} onChange={search} />
          <div className="shot-picker-grid">
            {doc.storyboard.shots
              .filter((s, n) =>
                `${s.cells.shotNo || n + 1} ${s.cells.description || ''}`
                  .toLowerCase()
                  .includes(query.toLowerCase())
              )
              .map((shot, n) => {
                const image = pictures(shot)[0]
                const assigned = groups
                  .filter((g) => g.items.some((i) => i.shotId === shot.id))
                  .map((g) => g.name)
                  .join(', ')
                return (
                  <div
                    className={`shot-picker-card ${chosen.includes(shot.id) ? 'selected' : ''}`}
                    key={shot.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plan-shot', shot.id)}
                  >
                    <button
                      aria-pressed={chosen.includes(shot.id)}
                      onClick={() =>
                        choose(
                          chosen.includes(shot.id)
                            ? chosen.filter((id) => id !== shot.id)
                            : [...chosen, shot.id]
                        )
                      }
                    >
                      {image ? (
                        <StillImage frame={image.frame} />
                      ) : (
                        <span className="still-placeholder">—</span>
                      )}
                      <strong>
                        {String(shot.cells.shotNo || n + 1)} ·{' '}
                        {String(shot.cells.description || '')}
                      </strong>
                      <small>{assigned || t('Unscheduled shots')}</small>
                    </button>
                    {image && (
                      <button
                        className="icon-button contextual"
                        aria-label={t('Preview')}
                        onClick={() => enlarge(image)}
                      >
                        ↗
                      </button>
                    )}
                  </div>
                )
              })}
          </div>
          {duplicate && (
            <p role="alert">{t('Some shots are already scheduled. Add another occurrence?')}</p>
          )}
          <div className="modal-actions">
            <button
              className="btn primary"
              disabled={!chosen.length}
              onClick={() => addShots(picker, chosen)}
            >
              {t(duplicate ? 'Add again' : 'Add shots')} ({chosen.length})
            </button>
          </div>
        </Dialog>
      )}
      {columnPanel && (
        <Dialog title={t('Manage columns')} onClose={() => showColumns(false)}>
          <div className="plan-column-list">
            {configured.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={c.visible}
                  onChange={(e) =>
                    changeColumns((cols) => {
                      cols.find((col) => col.id === c.id)!.visible = e.target.checked
                    })
                  }
                />
                {t(c.name)}
                <button
                  className="icon-button"
                  aria-label={t('Delete')}
                  onClick={() =>
                    changeColumns((cols) => {
                      cols.splice(
                        cols.findIndex((col) => col.id === c.id),
                        1
                      )
                    })
                  }
                >
                  ×
                </button>
              </label>
            ))}
          </div>
          <Menu label={t('Add column')}>
            {available.map((c) => (
              <MenuItem
                key={c.id}
                onClick={() => changeColumns((cols) => cols.push({ ...c, visible: true }))}
              >
                {t(c.name)}
              </MenuItem>
            ))}
            <MenuItem
              onClick={() =>
                editColumn({
                  id: newId('plan-column'),
                  name: '',
                  type: 'text',
                  width: 180,
                  visible: true,
                  options: []
                })
              }
            >
              {t('Custom column')}
            </MenuItem>
          </Menu>
        </Dialog>
      )}
      {editing && (
        <PlanColumnDialog
          column={editing}
          shared={doc.storyboard.columns.some((c) => c.id === editing.id)}
          onClose={() => editColumn(null)}
          onSave={(c) => {
            if (doc.storyboard.columns.some((col) => col.id === c.id))
              useStore.getState().updateStoryColumn(c.id, c)
            else
              changeColumns((cols) => {
                const at = cols.findIndex((col) => col.id === c.id)
                if (at < 0) cols.push(c)
                else cols[at] = c
              })
            editColumn(null)
          }}
        />
      )}
      {large && (
        <Dialog title={large.frame.label || t('Preview')} onClose={() => enlarge(null)} wide>
          <div className="image-preview">
            <StillImage frame={large.frame} />
          </div>
        </Dialog>
      )}
      {imageTarget && (
        <Dialog title={t('Add images from gallery')} onClose={() => setImageTarget(null)} wide>
          <div className="shot-picker-grid">
            {doc.frames.map((frame) => (
              <label className="shot-picker-card" key={frame.id}>
                <StillImage frame={frame} />
                <input
                  type="checkbox"
                  checked={gallerySelection.includes(frame.id)}
                  onChange={(e) =>
                    setGallerySelection(
                      e.target.checked
                        ? [...gallerySelection, frame.id]
                        : gallerySelection.filter((id) => id !== frame.id)
                    )
                  }
                />
                {frame.label}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="btn primary"
              disabled={!gallerySelection.length}
              onClick={() => {
                const item = groups.flatMap((g) => g.items).find((i) => i.id === imageTarget.item)
                if (item) {
                  const old = cellValue(item, imageTarget.column)
                  updateCell(item.id, imageTarget.column, [
                    ...(Array.isArray(old) ? (old as StoryImage[]) : []),
                    ...doc.frames
                      .filter((f) => gallerySelection.includes(f.id))
                      .map((frame) => ({ frame: structuredClone(frame), role: 'Reference' }))
                  ])
                }
                setImageTarget(null)
              }}
            >
              {t('Add images')}
            </button>
          </div>
        </Dialog>
      )}
      {preview && <ExportPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function PlanColumnDialog({
  column,
  shared,
  onSave,
  onClose
}: {
  column: StoryColumn
  shared: boolean
  onSave(column: StoryColumn): void
  onClose(): void
}): JSX.Element {
  const [name, setName] = useState(column.name)
  const [type, setType] = useState(column.type)
  const [options, setOptions] = useState(column.options.join('\n'))
  return (
    <Dialog title={t('Edit column')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            ...column,
            name: name.trim(),
            type,
            options: [
              ...new Set(
                options
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            ]
          })
        }}
      >
        <label className="field">
          {t('Column name')}
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          {t('Column type')}
          <select
            disabled={shared || column.id.startsWith('plan:')}
            value={type}
            onChange={(e) => setType(e.target.value as StoryColumnType)}
          >
            {['text', 'number', 'single', 'multi', 'date', 'checkbox'].map((type) => (
              <option key={type} value={type}>
                {t(type)}
              </option>
            ))}
          </select>
        </label>
        {shared && <p>{t('Shared with storyboard. Edit the field type in Storyboard.')}</p>}
        {(type === 'single' || type === 'multi') && (
          <label className="field">
            {t('Options')}
            <textarea value={options} onChange={(e) => setOptions(e.target.value)} />
          </label>
        )}
        <div className="modal-actions">
          <button className="btn primary" disabled={!name.trim()}>
            {t('Save')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
