import { useState } from 'react'
import type { StoryCell, StoryColumn, StoryColumnType } from '@shared/types'
import { t } from '@shared/i18n'
import { newId } from '@shared/schema'
import { useStore } from '../store'
import { Dialog, Menu, MenuItem } from './Controls'

const columnTypes: StoryColumnType[] = [
  'text',
  'number',
  'single',
  'multi',
  'date',
  'checkbox',
  'image'
]
const typeLabels: Record<StoryColumnType, string> = {
  text: 'Text',
  number: 'Number',
  single: 'Single select',
  multi: 'Multiple select',
  date: 'Date',
  checkbox: 'Checkbox',
  image: 'Image'
}

export function ColumnDialog({
  column,
  onClose
}: {
  column: StoryColumn | null
  onClose(): void
}): JSX.Element {
  const [name, setName] = useState(column?.name ?? '')
  const [type, setType] = useState<StoryColumnType>(column?.type ?? 'text')
  const [options, setOptions] = useState(column?.options.join('\n') ?? '')
  const [confirmed, setConfirmed] = useState(false)
  const changingType = !!column && column.type !== type
  const save = (): void => {
    const next = {
      name: name.trim(),
      type,
      options: [
        ...new Set(
          options
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ]
    }
    if (column) {
      useStore.getState().mutate('edit story column', (doc) => {
        const current = doc.storyboard.columns.find((item) => item.id === column.id)
        if (!current) return
        Object.assign(current, next)
        if (changingType)
          for (const shot of doc.storyboard.shots)
            shot.cells[column.id] =
              type === 'image' || type === 'multi' ? [] : type === 'checkbox' ? false : ''
      })
    } else
      useStore.getState().addStoryColumn({
        id: newId('col'),
        ...next,
        width: type === 'image' ? 320 : 180,
        visible: true
      })
    onClose()
  }
  return (
    <Dialog title={t(column ? 'Edit column' : 'Add column')} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <label className="field">
          {t('Column name')}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          {t('Column type')}
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as StoryColumnType)
              setConfirmed(false)
            }}
          >
            {columnTypes.map((item) => (
              <option key={item} value={item}>
                {t(typeLabels[item])}
              </option>
            ))}
          </select>
        </label>
        {(type === 'single' || type === 'multi') && (
          <label className="field">
            {t('Options, one per line')}
            <textarea
              rows={7}
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              placeholder={t('Shot options example')}
            />
          </label>
        )}
        {changingType && (
          <label className="warning-field">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {t('Changing the field type clears its current cells. You can undo this change.')}
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn primary" disabled={!name.trim() || (changingType && !confirmed)}>
            {t('Save')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function ChoiceField({
  column,
  value,
  update,
  onOptions
}: {
  column: StoryColumn
  value: StoryCell
  onOptions?(options: string[]): void
  update(value: StoryCell): void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const selected =
    column.type === 'multi' && Array.isArray(value)
      ? (value as string[])
      : typeof value === 'string' && value
        ? [value]
        : []
  const choose = (option: string): void =>
    update(
      column.type === 'multi'
        ? selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected, option]
        : option
    )
  const options = [...new Set([...column.options, ...selected])].filter((option) =>
    `${option} ${t(option)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  )
  return (
    <Menu label={selected.map((option) => t(option)).join(' · ') || '-'} className="cell-choice">
      <input
        aria-label={t('Search or add an option')}
        placeholder={t('Search or add an option')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="choice-list">
        {options.map((option) => (
          <button
            key={option}
            data-close={column.type === 'single' ? '' : undefined}
            aria-pressed={selected.includes(option)}
            onClick={() => choose(option)}
          >
            <span>{t(option)}</span>
            {selected.includes(option) && <span>✓</span>}
          </button>
        ))}
      </div>
      {query.trim() && !column.options.includes(query.trim()) && (
        <button
          onClick={() => {
            const option = query.trim()
            if (onOptions) onOptions([...column.options, option])
            else
              useStore
                .getState()
                .updateStoryColumn(column.id, { options: [...column.options, option] })
            choose(option)
            setQuery('')
          }}
        >
          ＋ {t('Add option')}: {query.trim()}
        </button>
      )}
      <MenuItem onClick={() => update(column.type === 'multi' ? [] : '')}>{t('Clear')}</MenuItem>
    </Menu>
  )
}

export function StoryField({
  shotId,
  column,
  value,
  rowNumber,
  onUpdate,
  onOptions
}: {
  onOptions?(options: string[]): void
  onUpdate?(value: StoryCell): void
  rowNumber?: number
  shotId: string
  column: StoryColumn
  value: StoryCell
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const update = (next: StoryCell): void => {
    if (onUpdate) {
      onUpdate(next)
      return
    }
    if (column.id === 'startS' || column.id === 'endS') {
      useStore.getState().mutate(`field:${shotId}:${column.id}`, (doc) => {
        const shot = doc.storyboard.shots.find((item) => item.id === shotId)
        if (!shot) return
        shot.cells[column.id] = next
        shot[column.id as 'startS' | 'endS'] = next === '' ? null : Number(next)
      })
    } else useStore.getState().updateStoryCell(shotId, column.id, next)
  }
  if (column.type === 'checkbox')
    return (
      <input
        aria-label={column.name}
        type="checkbox"
        checked={value === true}
        onChange={(event) => update(event.target.checked)}
      />
    )
  if (column.type === 'single' || column.type === 'multi')
    return <ChoiceField column={column} value={value} update={update} onOptions={onOptions} />
  const text = typeof value === 'number' || typeof value === 'string' ? value : ''
  if (column.type === 'text')
    return (
      <div className="text-cell">
        <textarea
          aria-label={column.name}
          value={text}
          placeholder="—"
          onChange={(event) => update(event.target.value)}
        />
        <button
          className="icon-button contextual expand-cell"
          aria-label={t('Expand text')}
          onClick={() => setExpanded(true)}
        >
          ↗
        </button>
        {expanded && (
          <Dialog title={column.name} onClose={() => setExpanded(false)} wide>
            <textarea
              className="expanded-text"
              aria-label={column.name}
              value={text}
              onChange={(event) => update(event.target.value)}
            />
            <div className="modal-actions">
              <button className="btn primary" onClick={() => setExpanded(false)}>
                {t('Done')}
              </button>
            </div>
          </Dialog>
        )}
      </div>
    )
  return (
    <div className="number-cell">
      <input
        aria-label={column.name}
        type={column.type === 'date' ? 'date' : 'number'}
        step="any"
        min={
          column.id === 'duration' || column.id === 'startS' || column.id === 'endS' ? 0 : undefined
        }
        value={text}
        placeholder={column.id === 'shotNo' ? String(rowNumber ?? '') : '—'}
        onChange={(event) =>
          update(
            column.type === 'number'
              ? event.target.value === ''
                ? ''
                : Number(event.target.value)
              : event.target.value
          )
        }
      />
      {calculating && <DurationDialog shotId={shotId} onClose={() => setCalculating(false)} />}
      {column.id === 'duration' && (
        <button className="text-button contextual" onClick={() => setCalculating(true)}>
          {t('Calculate duration')}
        </button>
      )}
    </div>
  )
}

function DurationDialog({ shotId, onClose }: { shotId: string; onClose(): void }): JSX.Element {
  const shot = useStore.getState().doc?.storyboard.shots.find((item) => item.id === shotId)
  const [start, setStart] = useState(shot?.startS?.toString() ?? '')
  const [end, setEnd] = useState(shot?.endS?.toString() ?? '')
  const valid =
    start !== '' &&
    end !== '' &&
    Number.isFinite(Number(start)) &&
    Number.isFinite(Number(end)) &&
    Number(start) >= 0 &&
    Number(end) >= Number(start)
  const duration = Number((Number(end) - Number(start)).toFixed(2))
  return (
    <Dialog title={t('Calculate duration')} onClose={onClose}>
      <p>{t('Duration = out point − in point (seconds)')}</p>
      <label className="field">
        {t('In point (seconds)')}
        <input
          type="number"
          min="0"
          step="any"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label className="field">
        {t('Out point (seconds)')}
        <input
          type="number"
          min="0"
          step="any"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <p role="status">
        {valid
          ? `${t('Duration')}: ${duration}s`
          : t('Enter both points; the out point must not precede the in point.')}
      </p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            useStore.getState().mutate('calculate shot duration', (doc) => {
              const current = doc.storyboard.shots.find((item) => item.id === shotId)
              if (!current) return
              current.startS = Number(start)
              current.endS = Number(end)
              current.cells.duration = duration
              if (doc.storyboard.columns.some((column) => column.id === 'startS'))
                current.cells.startS = Number(start)
              if (doc.storyboard.columns.some((column) => column.id === 'endS'))
                current.cells.endS = Number(end)
            })
            onClose()
          }}
        >
          {t('Apply')}
        </button>
      </div>
    </Dialog>
  )
}
