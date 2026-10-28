import { useState } from 'react'
import type { StoryCell, StoryColumn, StoryColumnType } from '@shared/types'
import { t } from '@shared/i18n'
import { newId } from '@shared/schema'
import { useStore } from '../store'
import { Dialog, Menu, MenuItem } from './Controls'

const columnTypes: StoryColumnType[] = ['text', 'number', 'single', 'multi', 'date', 'checkbox', 'image']
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
      useStore
        .getState()
        .addStoryColumn({ id: newId('col'), ...next, width: type === 'image' ? 320 : 180, visible: true })
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
  update
}: {
  column: StoryColumn
  value: StoryCell
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
    option.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  )
  return (
    <Menu label={selected.join(' · ') || t('Choose…')} className="cell-choice">
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
            <span>{option}</span>
            {selected.includes(option) && <span>✓</span>}
          </button>
        ))}
      </div>
      {query.trim() && !column.options.includes(query.trim()) && (
        <button
          onClick={() => {
            const option = query.trim()
            useStore.getState().updateStoryColumn(column.id, { options: [...column.options, option] })
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
  rowNumber
}: {
  rowNumber?: number
  shotId: string
  column: StoryColumn
  value: StoryCell
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const update = (next: StoryCell): void => {
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
    return <ChoiceField column={column} value={value} update={update} />
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
        min={column.id === 'duration' || column.id === 'startS' || column.id === 'endS' ? 0 : undefined}
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
      {column.id === 'duration' && (
        <button
          className="text-button contextual"
          onClick={() => {
            const shot = useStore.getState().doc?.storyboard.shots.find((item) => item.id === shotId)
            if (shot?.startS !== null && shot?.endS !== null && shot && shot.endS >= shot.startS)
              update(Number((shot.endS - shot.startS).toFixed(2)))
          }}
        >
          {t('Calculate from in/out')}
        </button>
      )}
    </div>
  )
}
