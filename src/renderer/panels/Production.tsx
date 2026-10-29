import { useState } from 'react'
import { resolveLanguage, t } from '@shared/i18n'
import { newId } from '@shared/schema'
import { clock, schedule, type ShootDay, type ProductionItem, type Take } from '@shared/production'
import type { StoryColumn } from '@shared/types'
import type { ExportPreview } from '@shared/workspace'
import { useStore } from '../store'
import { Dialog } from '../components/Controls'
import { ExportPreviewDialog } from '../components/ExportPreview'
import { useLanguage } from '../language'

export function Production({ shooting = false }: { shooting?: boolean }): JSX.Element {
  const doc = useStore((s) => s.doc)!
  const folder = useStore((s) => s.projectFolder)!
  const preference = useLanguage((s) => s.preference)
  const language = resolveLanguage(preference, navigator.language)
  const [selected, select] = useState('')
  const [notice, showNotice] = useState(false)
  const [slate, setSlate] = useState<ProductionItem | null>(null)
  const [flash, setFlash] = useState(false)
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape')
  const [busy, setBusy] = useState(false)
  const day = doc.production.days.find((d) => d.id === selected) ?? doc.production.days[0]
  const edit = (fn: (d: ShootDay) => void): void => {
    if (day)
      useStore.getState().mutate('edit shooting day', (p) => {
        const d = p.production.days.find((d) => d.id === day.id)
        if (d) fn(d)
      })
  }
  const label = (item: ProductionItem): string => {
    const shot = doc.storyboard.shots.find((s) => s.id === item.shotId)
    return shot
      ? `${shot.cells.shotNo || doc.storyboard.shots.indexOf(shot) + 1} · ${shot.cells.description || ''}`
      : item.snapshot || item.title
  }
  const add = (shotId: string | null): void => {
    const shot = doc.storyboard.shots.find((s) => s.id === shotId)
    edit((d) =>
      d.items.push({
        id: newId(),
        shotId,
        snapshot: shot ? String(shot.cells.description || shot.cells.shotNo || '') : '',
        title: t('Break / travel'),
        minutes: 15,
        preparation: 0,
        owner: '',
        cast: '',
        equipment: '',
        notes: '',
        status: 'pending'
      })
    )
  }
  const times = day ? schedule(day.items, day.start) : []
  const move = (itemId: string, to: string, index?: number): void => {
    useStore.getState().mutate('move shooting item', (p) => {
      const source = p.production.days.find((d) => d.items.some((i) => i.id === itemId))
      const destination = p.production.days.find((d) => d.id === to)
      if (!source || !destination) return
      const item = source.items.splice(
        source.items.findIndex((i) => i.id === itemId),
        1
      )[0]!
      destination.items.splice(index ?? destination.items.length, 0, item)
    })
  }
  const addTake = (item: ProductionItem): void => {
    if (!day) return
    useStore
      .getState()
      .mutate('record take', (p) =>
        p.production.takes.push({
          id: newId(),
          dayId: day.id,
          itemId: item.id,
          number:
            Math.max(
              0,
              ...p.production.takes.filter((t) => t.itemId === item.id).map((t) => t.number)
            ) + 1,
          camera: 'A',
          filename: '',
          recorded: new Date().toISOString(),
          rating: 'alternate',
          notes: '',
          mediaIds: []
        })
      )
  }
  const exportDay = async (kind: 'pdf' | 'csv'): Promise<void> => {
    if (!day || busy) return
    setBusy(true)
    try {
      const rows: string[][] = notice
        ? [
            [t('Date'), day.date],
            [t('Location'), day.location],
            ...Object.entries(day.notice).map(([k, v]) => [t(k), v]),
            ...day.items.map((i, n) => [
              `${clock(times[n]!.start)}–${clock(times[n]!.end)}`,
              label(i)
            ])
          ]
        : shooting
          ? doc.production.takes
              .filter((take) => take.dayId === day.id)
              .map((take) => [
                label(
                  day.items.find((i) => i.id === take.itemId) ??
                    ({ snapshot: take.itemId } as ProductionItem)
                ),
                String(take.number),
                take.camera,
                take.filename,
                take.rating,
                take.notes,
                take.recorded
              ])
          : day.items.map((i, n) => [
              `${clock(times[n]!.start)}–${clock(times[n]!.end)}`,
              label(i),
              String(i.minutes),
              String(i.preparation),
              i.owner,
              i.cast,
              i.equipment,
              i.notes
            ])
      const names = notice
        ? ['Field', 'Content']
        : shooting
          ? ['Shot', 'Take', 'Camera', 'Filename', 'Rating', 'Notes', 'Recorded']
          : [
              'Time',
              'Shot',
              'Shooting minutes',
              'Preparation minutes',
              'Owner',
              'Cast',
              'Equipment',
              'Notes'
            ]
      const columns: StoryColumn[] = names.map((name, n) => ({
        id: `c${n}`,
        name: t(name),
        type: 'text',
        width: 150,
        visible: true,
        options: []
      }))
      setPreview(
        await window.sbr.preparePreview({
          storyboard: {
            projectName: `${doc.name}-${day.name}-${t(notice ? 'Call sheet' : shooting ? 'Take log' : 'Shooting plan')}`,
            title: `${doc.name} · ${day.name}`,
            description: `${day.date} ${day.location}`,
            exportsRoot: `${folder}/exports`,
            columns,
            shots: rows.map((row) => ({
              id: newId(),
              startS: null,
              endS: null,
              cells: Object.fromEntries(row.map((v, n) => [`c${n}`, v])),
              rendered: [],
              imageRoles: []
            })),
            language,
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
  const field = (
    name: string,
    value: string,
    change: (v: string) => void,
    type = 'text'
  ): JSX.Element => (
    <label className="field">
      {t(name)}
      <input type={type} value={value} onChange={(e) => change(e.target.value)} />
    </label>
  )
  const updateTake = (id: string, patch: Partial<Take>): void =>
    useStore.getState().mutate('edit take', (p) => {
      const take = p.production.takes.find((t) => t.id === id)
      if (take) Object.assign(take, patch)
    })
  return (
    <div className="production-workspace">
      <header className="production-header">
        <div>
          <span>FRAMEBOOK / {shooting ? 'ON SET' : 'PRODUCTION'}</span>
          <h1>{t(shooting ? 'On-set shooting' : 'Shooting plan')}</h1>
        </div>
        <button
          className="btn"
          onClick={() => {
            const id = newId()
            useStore
              .getState()
              .mutate('new shooting day', (p) =>
                p.production.days.push({
                  id,
                  name: `${t('Shooting day')} ${p.production.days.length + 1}`,
                  date: '',
                  location: '',
                  start: '09:00',
                  finish: '18:00',
                  items: [],
                  notice: { meeting: '', personnel: '', equipment: '', emergency: '', notes: '' }
                })
              )
            select(id)
          }}
        >
          {t('Add shooting day')}
        </button>
        <select
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as typeof orientation)}
        >
          <option value="landscape">{t('Landscape')}</option>
          <option value="portrait">{t('Portrait')}</option>
        </select>
        <button className="btn" disabled={!day || busy} onClick={() => void exportDay('pdf')}>
          {t('Preview PDF')}
        </button>
        <button className="btn" disabled={!day || busy} onClick={() => void exportDay('csv')}>
          CSV
        </button>
      </header>
      <div className="production-layout">
        <aside>
          {doc.production.days.map((d) => (
            <button
              key={d.id}
              className={`production-day ${d.id === day?.id ? 'active' : ''}`}
              onClick={() => select(d.id)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/framebook-plan')) e.preventDefault()
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('application/framebook-plan')
                if (id) {
                  e.preventDefault()
                  move(id, d.id)
                }
              }}
            >
              {d.name}
              <small>
                {d.date} · {d.items.length}
              </small>
            </button>
          ))}
          {!shooting && day && (
            <>
              <h3>{t('Unscheduled shots')}</h3>
              {doc.storyboard.shots
                .filter(
                  (s) => !doc.production.days.some((d) => d.items.some((i) => i.shotId === s.id))
                )
                .map((s, n) => (
                  <button className="production-day" key={s.id} onClick={() => add(s.id)}>
                    {String(s.cells.shotNo || n + 1)} · {String(s.cells.description || '')} ＋
                  </button>
                ))}
            </>
          )}
        </aside>
        <main>
          {!day ? (
            <p>{t('Create a shooting day to begin.')}</p>
          ) : (
            <>
              <div className="production-fields">
                {field('Name', day.name, (v) =>
                  edit((d) => {
                    d.name = v
                  })
                )}
                {field(
                  'Date',
                  day.date,
                  (v) =>
                    edit((d) => {
                      d.date = v
                    }),
                  'date'
                )}
                {field('Location', day.location, (v) =>
                  edit((d) => {
                    d.location = v
                  })
                )}
                {field(
                  'Start',
                  day.start,
                  (v) =>
                    edit((d) => {
                      d.start = v
                    }),
                  'time'
                )}
                {field(
                  'Finish',
                  day.finish,
                  (v) =>
                    edit((d) => {
                      d.finish = v
                    }),
                  'time'
                )}
              </div>
              <div className="production-tools">
                <button className="btn" onClick={() => showNotice(!notice)}>
                  {t(notice ? 'Schedule' : 'Call sheet')}
                </button>
                {!shooting && (
                  <button className="btn" onClick={() => add(null)}>
                    {t('Add break / travel')}
                  </button>
                )}
                <span>
                  {t('Completed')}: {day.items.filter((i) => i.status === 'done').length}/
                  {day.items.length} ·{' '}
                  {times.length ? times[times.length - 1]!.end - times[0]!.start : 0} {t('minutes')}
                </span>
                {times.length > 0 &&
                  day.finish &&
                  clock(times[times.length - 1]!.end) > day.finish && (
                    <strong className="error">{t('Schedule exceeds finish time')}</strong>
                  )}
              </div>
              {notice ? (
                <div className="notice-fields">
                  {Object.entries(day.notice).map(([key, value]) => (
                    <label className="field" key={key}>
                      {t(key)}
                      <textarea
                        rows={3}
                        value={value}
                        onChange={(e) =>
                          edit((d) => {
                            d.notice[key as keyof typeof d.notice] = e.target.value
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : (
                day.items.map((item, index) => (
                  <section
                    className="production-item"
                    key={item.id}
                    draggable={!shooting}
                    onDragStart={(e) => {
                      if ((e.target as HTMLElement).closest('input,textarea,select')) {
                        e.preventDefault()
                        return
                      }
                      e.dataTransfer.setData('application/framebook-plan', item.id)
                    }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/framebook-plan'))
                        e.preventDefault()
                    }}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData('application/framebook-plan')
                      if (id) {
                        e.preventDefault()
                        e.stopPropagation()
                        move(id, day.id, index)
                      }
                    }}
                  >
                    <div className="production-item-title">
                      <strong>
                        {clock(times[index]!.start)}—{clock(times[index]!.end)} · {label(item)}
                      </strong>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          edit((d) => {
                            d.items[index]!.status = e.target.value as ProductionItem['status']
                          })
                        }
                      >
                        {['pending', 'shooting', 'done', 'retake'].map((s) => (
                          <option key={s} value={s}>
                            {t(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!shooting ? (
                      <>
                        <div className="production-fields">
                          {(
                            [
                              'minutes',
                              'preparation',
                              'owner',
                              'cast',
                              'equipment',
                              'notes'
                            ] as const
                          ).map((key) =>
                            field(
                              {
                                minutes: 'Shooting minutes',
                                preparation: 'Preparation minutes',
                                owner: 'Owner',
                                cast: 'Cast',
                                equipment: 'Equipment',
                                notes: 'Notes'
                              }[key],
                              String(item[key]),
                              (v) =>
                                edit((d) => {
                                  if (key === 'minutes' || key === 'preparation')
                                    d.items[index]![key] = Math.max(0, Number(v) || 0)
                                  else d.items[index]![key] = v
                                }),
                              key === 'minutes' || key === 'preparation' ? 'number' : 'text'
                            )
                          )}
                        </div>
                        <div className="production-tools">
                          <select value={day.id} onChange={(e) => move(item.id, e.target.value)}>
                            {doc.production.days.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn"
                            disabled={!index}
                            onClick={() => move(item.id, day.id, index - 1)}
                          >
                            ↑
                          </button>
                          <button
                            className="btn"
                            disabled={index === day.items.length - 1}
                            onClick={() => move(item.id, day.id, index + 1)}
                          >
                            ↓
                          </button>
                          <button
                            className="btn"
                            onClick={() =>
                              edit((d) => {
                                d.items.splice(index, 1)
                              })
                            }
                          >
                            {t('Remove from schedule')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="production-tools">
                          <button className="btn primary" onClick={() => addTake(item)}>
                            {t('Record next take')}
                          </button>
                          <button className="btn" onClick={() => setSlate(item)}>
                            {t('Slate')}
                          </button>
                        </div>
                        {doc.production.takes
                          .filter((take) => take.itemId === item.id)
                          .map((take) => (
                            <div key={take.id} className="take-row">
                              <b>TAKE {take.number}</b>
                              {field('Camera', take.camera, (v) =>
                                updateTake(take.id, { camera: v })
                              )}
                              {field('Filename', take.filename, (v) =>
                                updateTake(take.id, { filename: v })
                              )}
                              <select
                                value={take.rating}
                                onChange={(e) =>
                                  updateTake(take.id, { rating: e.target.value as Take['rating'] })
                                }
                              >
                                {['good', 'alternate', 'reject'].map((r) => (
                                  <option key={r} value={r}>
                                    {t(r)}
                                  </option>
                                ))}
                              </select>
                              {field('Notes', take.notes, (v) => updateTake(take.id, { notes: v }))}
                              <select
                                multiple
                                aria-label={t('Linked media')}
                                value={take.mediaIds}
                                onChange={(e) =>
                                  updateTake(take.id, {
                                    mediaIds: Array.from(e.target.selectedOptions, (o) => o.value)
                                  })
                                }
                              >
                                {doc.media.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                              <small>{new Date(take.recorded).toLocaleString()}</small>
                            </div>
                          ))}
                      </>
                    )}
                  </section>
                ))
              )}
            </>
          )}
        </main>
      </div>
      {slate && day && (
        <Dialog title={t('Slate')} onClose={() => setSlate(null)} wide>
          <button
            className={`slate ${flash ? 'clapped' : ''}`}
            onClick={() => {
              setFlash(true)
              setTimeout(() => setFlash(false), 180)
            }}
          >
            <small>
              {doc.name} / {day.date}
            </small>
            <strong>{label(slate)}</strong>
            <span>
              TAKE{' '}
              {Math.max(
                0,
                ...doc.production.takes.filter((t) => t.itemId === slate.id).map((t) => t.number)
              ) + 1}
            </span>
            <small>{t('Click to clap')}</small>
          </button>
          <button className="btn primary" onClick={() => addTake(slate)}>
            {t('Record next take')}
          </button>
        </Dialog>
      )}
      {preview && <ExportPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
