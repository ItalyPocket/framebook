import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { CONVERSION_FORMATS, CONVERSION_FORMAT_LABELS, type ConversionFormat, type ConversionSession, type DraftEntry, type DraftStatus } from '@shared/conversion'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { Dialog } from './Controls'
import { SearchControl } from './SearchControl'
import { ActionSymbol } from './TopActions'

const statuses: Record<DraftStatus, string> = { readable: 'Ready to convert', encrypted: 'Encrypted draft', invalid: 'Unreadable draft' }
const errors = [
  'Draft must be a JSON file smaller than 64 MB.',
  'Encrypted or unreadable draft. Export a readable JSON draft; the Windows encrypted-draft helper cannot run on macOS.',
  'Draft does not contain readable tracks and materials.', 'Unsupported timeline frame rate.',
  'Missing source path or source range. XML export would lose clips.',
  'EBU STL export currently supports ASCII subtitles only. Use SRT or ASS for Chinese.',
  'EBU STL requires a 25 or 30 fps timeline.', 'EBU STL subtitle exceeds 111 bytes. Use SRT or ASS.',
  'Cannot overwrite a source file.', 'Unknown draft or media.', 'Unknown conversion.'
]
function errorText(error: unknown): string {
  const text = String(error)
  const known = errors.find(value => text.includes(value))
  if (known) return t(known)
  if (text.includes('Invalid target time range:')) return t('A clip has an invalid time range. Check the original draft.')
  if (text.includes('ENOENT')) return t('The draft or media file could not be found. Refresh the library and try again.')
  if (text.includes('EACCES') || text.includes('EPERM')) return t('This folder cannot be accessed. Choose another folder or check its permissions.')
  return t('The operation could not be completed. Check the selected draft and folder, then try again.')
}
function duration(value?: number): string {
  if (value === undefined) return t('Duration unavailable')
  const seconds = Math.round(value / 1000000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function DraftCover({ draft }: { draft: DraftEntry }): JSX.Element {
  return <div className="draft-cover">{draft.cover ? <img src={draft.cover} alt="" /> : <ActionSymbol icon="convert" />}<span>{draft.width && draft.height ? `${draft.width} × ${draft.height}` : t('Draft project')}</span></div>
}
function sourceName(name: string): string {
  if (name === 'Current draft') return t(name)
  if (name.startsWith('Readable backup: ')) return t('Readable backup: {file}', { file: name.slice(17) })
  const match = /^Timeline (\d+)$/.exec(name)
  return match ? t('Timeline {number}', { number: match[1] ?? '' }) : name
}

export function DraftConverter({ onClose }: { onClose(): void }): JSX.Element {
  const settings = useSettings(state => state.value)
  const projectFolder = useStore(state => state.projectFolder)
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [step, setStep] = useState<'library' | 'conversion'>('library')
  const [session, setSession] = useState<ConversionSession | null>(null)
  const [search, setSearch] = useState('')
  const [format, setFormat] = useState<ConversionFormat>(settings?.conversionFormat ?? 'xml')
  const [preview, setPreview] = useState('')
  const [previewBytes, setPreviewBytes] = useState(0)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const current = useRef<string | null>(null)
  const generation = useRef(0)
  const scanGeneration = useRef(0)
  const root = settings?.draftRoot ?? ''
  const scan = useCallback(async (path?: string): Promise<void> => {
    const request = ++scanGeneration.current
    setScanning(true)
    try {
      const drafts = await window.sbr.conversionScan(path)
      if (request !== scanGeneration.current) return
      setEntries(drafts)
      setSelectedPath(previous => drafts.some(draft => draft.path === previous) ? previous : drafts[0]?.path ?? '')
    } catch (error) {
      if (request === scanGeneration.current) { setMessage(errorText(error)); setFailed(true) }
    } finally { if (request === scanGeneration.current) setScanning(false) }
  }, [])
  useEffect(() => { void scan(root || undefined) }, [root, scan])
  useEffect(() => () => {
    scanGeneration.current++
    generation.current++
    if (current.current) void window.sbr.conversionClose(current.current)
  }, [])
  const selected = entries.find(draft => draft.path === selectedPath)
  useEffect(() => { setSourcePath(selected?.path ?? '') }, [selected?.path])
  useEffect(() => {
    const request = ++generation.current
    setPreview('')
    setMessage('')
    if (session) void window.sbr.conversionPreview(session.id, format).then(result => {
      if (request === generation.current) { setPreview(result.text); setPreviewBytes(result.bytes) }
    }).catch(error => {
      if (request === generation.current) { setMessage(errorText(error)); setFailed(true) }
    })
  }, [session, format])
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setMessage('')
    setFailed(false)
    try { await action() } catch (error) { setMessage(errorText(error)); setFailed(true) } finally { setBusy(false) }
  }
  const open = (path?: string): void => {
    void run(async () => {
      const next = await window.sbr.conversionOpen(path)
      if (!next) return
      if (current.current) await window.sbr.conversionClose(current.current)
      current.current = next.id
      setSession(next)
      setStep('conversion')
    })
  }
  const chooseFolder = (): void => {
    void run(async () => {
      const path = await window.sbr.chooseDirectory()
      if (!path) return
      await useSettings.getState().update({ draftRoot: path })
      if (path === root) await scan()
    })
  }
  const visible = entries.filter(draft => `${draft.name} ${draft.folder}`.toLowerCase().includes(search.toLowerCase()))
  const source = selected?.sources.find(item => item.path === sourcePath)
  const timeline = session?.timeline
  return <Dialog title={t('Jianying / CapCut conversion')} onClose={onClose} wide>
    <div className="draft-converter" onDragOver={event => { event.preventDefault(); event.stopPropagation() }} onDrop={event => {
      event.preventDefault()
      event.stopPropagation()
      if (busy || scanning) return
      const file = event.dataTransfer.files[0]
      if (!file) return
      const path = window.sbr.pathForFile(file)
      if (/\.(json|bak)$/i.test(path)) open(path)
      else void run(async () => {
        await useSettings.getState().update({ draftRoot: path })
        setStep('library')
        if (path === root) await scan()
      })
    }}>
      <nav className="conversion-steps" aria-label={t('Conversion steps')}>
        <button className={step === 'library' ? 'active' : ''} onClick={() => setStep('library')}><span>01</span>{t('Draft library')}</button>
        <i />
        <button className={step === 'conversion' ? 'active' : ''} disabled={!session} onClick={() => setStep('conversion')}><span>02</span>{t('Convert and export')}</button>
      </nav>
      {step === 'library' ? <>
        <div className="draft-location"><ActionSymbol icon="library" /><div><small>{t('Draft search location')}</small><span title={root}>{root || t('Automatically detect Jianying and CapCut draft folders')}</span></div><button className="btn" disabled={busy || scanning} onClick={chooseFolder}>{t('Set draft folder')}</button></div>
        <div className="draft-library-toolbar"><div><h3>{t('Draft library')}</h3><span className="muted">{scanning ? t('Reading drafts…') : t('{count} drafts', { count: visible.length })}</span></div><SearchControl label="Search drafts" value={search} onChange={setSearch} /><button className="btn" disabled={busy || scanning} onClick={() => void scan()}>{t('Refresh')}</button><button className="btn" disabled={busy} onClick={() => open()}>{t('Open draft JSON')}</button></div>
        <div className="draft-library-layout" aria-busy={scanning}>
          <div className="draft-grid" role="group" aria-label={t('Drafts')}>
            {visible.map(draft => <button className={`draft-card ${selectedPath === draft.path ? 'selected' : ''}`} key={draft.path} disabled={busy} aria-pressed={selectedPath === draft.path} onClick={() => setSelectedPath(draft.path)}><DraftCover draft={draft} /><div className="draft-card-body"><strong title={draft.name}>{draft.name}</strong><span className={`draft-status ${draft.status}`}>{t(draft.status !== 'readable' && draft.sources.some(item => item.status === 'readable') ? 'Readable copy available' : statuses[draft.status])}</span><small>{new Date(draft.modified).toLocaleString()} · {duration(draft.duration)}</small></div></button>)}
            {!visible.length && <div className="draft-empty"><ActionSymbol icon="library" /><h3>{t(scanning ? 'Reading drafts…' : search ? 'No matching drafts' : 'No drafts found')}</h3><p>{t(search ? 'Try another search or clear the search.' : 'Set the folder containing your Jianying projects, or drop a draft folder here.')}</p>{!search && <button className="btn primary" disabled={busy || scanning} onClick={chooseFolder}>{t('Set draft folder')}</button>}</div>}
          </div>
          <aside className="draft-selection">{selected ? <>
            <DraftCover draft={selected} /><h3>{selected.name}</h3><span className={`draft-status ${source?.status ?? selected.status}`}>{t(statuses[source?.status ?? selected.status])}</span>
            <dl><div><dt>{t('Last modified')}</dt><dd>{new Date(selected.modified).toLocaleString()}</dd></div><div><dt>{t('Duration')}</dt><dd>{duration(selected.duration)}</dd></div><div><dt>{t('Timelines')}</dt><dd>{selected.sources.length}</dd></div></dl>
            <label className="field">{t('Select timeline')}<select aria-label={t('Select timeline')} value={sourcePath} disabled={busy} onChange={event => setSourcePath(event.target.value)}>{selected.sources.map(item => <option value={item.path} key={item.path}>{sourceName(item.name)} · {t(statuses[item.status])}</option>)}</select></label>
            <p className="draft-path" title={selected.folder}>{selected.folder}</p>
            {source?.status !== 'readable' && <p className="draft-notice">{t(source?.status === 'encrypted' ? 'This draft is encrypted. You can browse it here, but this version cannot convert it. Import readable draft JSON to continue.' : 'This file does not contain a readable timeline. Choose another timeline or import draft JSON.')}</p>}
            <button className="btn primary" disabled={busy || scanning || source?.status !== 'readable'} onClick={() => open(sourcePath)}>{t('Start conversion')}<span aria-hidden="true">↗</span></button>
          </> : <p className="muted">{t('Select a draft to view its details.')}</p>}</aside>
        </div>
        <p className="draft-footnote">{t('Drafts are read only. Changing this folder also updates General settings.')}</p>
      </> : timeline && <>
        <div className="conversion-heading"><div><small>02 / {t('Conversion preview')}</small><h3>{timeline.name}</h3><p>{timeline.width} × {timeline.height} · {t('{count} fps', { count: Number(timeline.fps.toFixed(3)) })} · {duration(timeline.duration)} · {t('{count} clips', { count: timeline.clips.length })}</p></div><button className="btn" disabled={busy} onClick={() => setStep('library')}>{t('Back to draft library')}</button></div>
        <div className="conversion-workflow">
          <section className="conversion-content">
            <h4>{t('Timeline overview')}</h4>
            <div className="conversion-timeline">{[...new Set(timeline.clips.map(clip => clip.track))].map(track => <div className="conversion-track-row" key={track}><small>{t('Track {number}', { number: track + 1 })}</small><div className="conversion-track">{timeline.clips.filter(clip => clip.track === track).map(clip => <span key={clip.id} title={`${clip.text || clip.name} · ${duration(clip.start)}`} style={{ left: `${clip.start / Math.max(1, timeline.duration) * 100}%`, width: `${clip.duration / Math.max(1, timeline.duration) * 100}%` }}>{clip.text || clip.name}</span>)}</div></div>)}</div>
            <details open={timeline.missing.length > 0}><summary>{t('Missing media')}<span>{timeline.missing.length}</span></summary>{timeline.missing.length === 0 && <p className="muted">{t('All referenced media is available.')}</p>}{timeline.missing.map(path => <div className="conversion-missing" key={path}><span title={path}>{path}</span><button className="btn" disabled={busy} onClick={() => void run(async () => setSession(await window.sbr.conversionRelink(session!.id, path)))}>{t('Relink')}</button></div>)}</details>
            <details open><summary>{t('Compatibility report')}<span>{timeline.issues.length}</span></summary><p className="muted">{t('Text styles, embedded video audio and unsupported effects require checking in the destination editor. JSON preserves the original draft data.')}</p><ul className="conversion-issues">{timeline.issues.map((issue, index) => <li key={index}><span className={`draft-status ${issue.level}`}>{t(issue.level)}</span><strong>{t(issue.feature)}</strong><small>{t('{count} clips', { count: issue.clips.length })}</small></li>)}</ul></details>
            <details><summary>{t('File content preview')}</summary><pre className="conversion-preview">{format === 'stl' ? t('Binary subtitle file · {count} bytes', { count: previewBytes }) : preview.slice(0, 200000)}</pre></details>
          </section>
          <aside className="conversion-export"><ActionSymbol icon="convert" /><h3>{t('Export settings')}</h3><label className="field">{t('Export format')}<select aria-label={t('Export format')} disabled={busy} value={format} onChange={event => setFormat(event.target.value as ConversionFormat)}>{CONVERSION_FORMATS.map(value => <option key={value} value={value}>{t(CONVERSION_FORMAT_LABELS[value])}</option>)}</select></label><p className="muted">{t('Preview size: {size} KB', { size: (previewBytes / 1024).toFixed(1) })}</p><p className="draft-notice">{t('Read-only conversion. Effects may differ in the destination editor; review the compatibility report before exporting.')}</p>
            {projectFolder && <button className="btn" disabled={busy} onClick={() => void run(async () => {
              const paths = [...new Set(timeline.clips.filter(clip => clip.kind === 'video' && clip.path && !timeline.missing.includes(clip.path)).map(clip => clip.path))]
              let count = 0
              for (const path of paths) {
                const imported = await window.sbr.importMedia(projectFolder, path)
                useStore.getState().addMedia(imported)
                count++
              }
              setMessage(t('Imported {count} media files', { count }))
            })}>{t('Add referenced media to this project')}</button>}
            <button className="btn primary" disabled={busy || !preview} onClick={() => void run(async () => {
              const path = await window.sbr.conversionExport(session!.id, format)
              if (path) setMessage(t('Export complete: {path}', { path }))
            })}>{t(busy ? 'Working…' : 'Confirm export')}<span aria-hidden="true">↗</span></button>
          </aside>
        </div>
      </>}
      {message && <p role={failed ? 'alert' : 'status'} className={`conversion-message ${failed ? 'error' : 'success'}`}>{message}</p>}
    </div>
  </Dialog>
}
