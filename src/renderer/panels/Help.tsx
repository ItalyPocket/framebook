import { useState } from 'react'
import { t } from '@shared/i18n'
import { useStore } from '../store'
import { Credits } from '../App'

const cards = [
  ['01', 'Import reference', 'Import videos or images. Files are copied into your project.'],
  ['02', 'Pull frames', 'Use B to capture a frame, or extract by scene, interval or count.'],
  ['03', 'Reframe & annotate', 'Choose a frame to crop or annotate. Original proportions are kept by default.'],
  ['04', 'Present & export', 'Arrange the gallery, send frames to the storyboard, then export.']
]
const tasks = [
  ['How do I create a storyboard?', 'Select frames in Gallery and choose Add to storyboard. Choose separate shots or one shot with multiple images.'],
  ['How is the gallery sorted?', 'Frames start in source-time order. Drag to arrange them manually; Restore time order resets the sequence.'],
  ['Will removing a gallery frame change my storyboard?', 'No. Storyboard images are independent snapshots with their source time preserved.'],
  ['How do I save and reopen a project?', 'Press Command-S to save. Open the .sbref folder next time; autosave recovery is offered after a crash.'],
  ['How do I export?', 'Gallery exports numbered PNG or JPG images. Storyboard exports PDF pages or a CSV shot list.'],
  ['Are AI features required?', 'No. Capture, editing and export work locally. Only Generate prompt sends the selected image to the configured AI provider.']
]
const shortcuts = [['Space', 'Play / pause'], ['← / →', 'Previous / next frame'], ['I / O', 'Set range start / end'], ['B', 'Capture current frame'], ['⌘S', 'Save project'], ['⌘Z / ⇧⌘Z', 'Undo'], ['?', 'Help']]

export function HelpOverlay(): JSX.Element | null {
  const open = useStore((s) => s.helpOpen)
  const [query, setQuery] = useState('')
  if (!open) return null
  const close = (): void => useStore.getState().setHelpOpen(false)
  const filtered = tasks.filter((row) => row.map((text) => t(text)).join(' ').toLowerCase().includes(query.toLowerCase()))
  return <div className="help-backdrop" onClick={close}>
    <div className="help-modal" role="dialog" aria-label={t('Help')} onClick={(e) => e.stopPropagation()}>
      <div className="help-header"><h2>{t('Help & quick start')}</h2><button className="btn" onClick={close}>{t('Close')}</button></div>
      <div className="help-body">
        <div className="help-cards">{cards.map(([number, title, body]) => <div className="help-card" key={number}><div className="help-card-emoji">{number}</div><h3>{t(title!)}</h3><p>{t(body!)}</p></div>)}</div>
        <input className="help-search" placeholder={t('Search tasks…')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {filtered.map(([q, a]) => <div className="help-task" key={q}><h3>{t(q!)}</h3><p>{t(a!)}</p></div>)}
        <h3 className="help-section-title">{t('Shortcuts')}</h3>
        {shortcuts.map(([key, description]) => <div className="help-kbd-row" key={key}><kbd>{key}</kbd><span>{t(description!)}</span></div>)}
        <h3 className="help-section-title">{t('About')}</h3><Credits />
      </div>
    </div>
  </div>
}
