import { useSettings } from '../settings'
import { useStore } from '../store'
import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { CONVERSION_FORMATS, type ConversionFormat, type ConversionSession, type DraftEntry } from '@shared/conversion'
import { Dialog } from './Controls'

export function DraftConverter({ onClose }: { onClose(): void }): JSX.Element {
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [session, setSession] = useState<ConversionSession | null>(null)
  const [search, setSearch] = useState('')
  const [format, setFormat] = useState<ConversionFormat>(useSettings.getState().value?.conversionFormat ?? 'xml')
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const current = useRef<string | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    void window.sbr.conversionScan().then(setEntries).catch(error => setMessage(String(error)))
    return () => { if (current.current) void window.sbr.conversionClose(current.current) }
  }, [])
  useEffect(() => {
    const request = ++generation.current
    setPreview('')
    if (session) void window.sbr.conversionPreview(session.id, format).then(result => {
      if (request === generation.current) { setPreview(result.text); setMessage('') }
    }).catch(error => { if (request === generation.current) setMessage(String(error)) })
  }, [session, format])
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(String(error)) } finally { setBusy(false) }
  }
  const open = (path?: string): void => {
    void run(async () => {
      const next = await window.sbr.conversionOpen(path)
      if (!next) return
      if (current.current) await window.sbr.conversionClose(current.current)
      current.current = next.id
      setSession(next)
    })
  }
  const timeline = session?.timeline
  return <Dialog title={t('Jianying / CapCut conversion')} onClose={onClose} wide>
    <div className="conversion-toolbar">
      <button className="btn" disabled={busy} onClick={() => open()}>{t('Open draft JSON')}</button>
      <button className="btn" disabled={busy} onClick={() => void run(async () => setEntries(await window.sbr.conversionScan(true)))}>{t('Choose draft folder')}</button>
      <button className="btn" disabled={busy} onClick={() => void run(async () => setEntries(await window.sbr.conversionScan()))}>{t('Refresh')}</button>
    </div>
    <p className="muted">{t('Read-only conversion. Encrypted macOS drafts are not supported. Effects may not transfer to Resolve; review the compatibility report.')}</p>
    <div className="conversion-layout" onDragOver={event => { event.preventDefault(); event.stopPropagation() }} onDrop={event => {
      event.preventDefault(); event.stopPropagation()
      const file = event.dataTransfer.files[0]
      if (file) {
        const path = window.sbr.pathForFile(file)
        if (/\.(json|bak)$/i.test(path)) open(path)
        else void run(async () => setEntries(await window.sbr.conversionScan(path)))
      }
    }}>
      <aside><input aria-label={t('Search drafts')} placeholder={t('Search drafts')} value={search} onChange={event => setSearch(event.target.value)} />
        <div className="conversion-drafts">{entries.filter(entry => entry.name.toLowerCase().includes(search.toLowerCase())).map(entry => <button key={entry.path} disabled={busy} className={timeline?.source === entry.path ? 'active' : ''} onClick={() => open(entry.path)}><strong>{entry.name}</strong><small>{new Date(entry.modified).toLocaleString()}</small></button>)}{!entries.length && <p>{t('No drafts found. Choose a folder or JSON file.')}</p>}</div>
      </aside>
      <main>{timeline ? <>
        <h3>{timeline.name}</h3>
        {useStore.getState().projectFolder && <button className="btn" disabled={busy} onClick={() => void run(async () => {
          const state = useStore.getState()
          const folder = state.projectFolder!
          const paths = [...new Set(timeline.clips.filter(clip => clip.kind === 'video' && clip.path && !timeline.missing.includes(clip.path)).map(clip => clip.path))]
          let count = 0
          for (const path of paths) {
            const imported = await window.sbr.importMedia(folder, path)
            useStore.getState().addMedia(imported)
            count++
          }
          setMessage(`${t('Imported media')}: ${count}`)
        })}>{t('Add referenced media to this project')}</button>}<p>{timeline.width} × {timeline.height} · {Number(timeline.fps.toFixed(3))} fps · {(timeline.duration / 1000000).toFixed(2)} s · {timeline.clips.length} {t('Clips')}</p>
        <div className="conversion-timeline">{[...new Set(timeline.clips.map(clip => clip.track))].map(track => <div key={track} className="conversion-track">{timeline.clips.filter(clip => clip.track === track).map(clip => <span key={clip.id} title={`${clip.name} · ${(clip.start / 1000000).toFixed(3)} s`} style={{ left: `${clip.start / Math.max(1, timeline.duration) * 100}%`, width: `${clip.duration / Math.max(1, timeline.duration) * 100}%` }}>{clip.text || clip.name}</span>)}</div>)}</div>
        <details open={timeline.missing.length > 0}><summary>{t('Missing media')} ({timeline.missing.length})</summary>{timeline.missing.map(path => <div className="conversion-missing" key={path}><span>{path}</span><button className="btn" disabled={busy} onClick={() => void run(async () => setSession(await window.sbr.conversionRelink(session!.id, path)))}>{t('Relink')}</button></div>)}</details>
        <details open><summary>{t('Compatibility report')} ({timeline.issues.length})</summary><p className="muted">{t('Text styles, embedded video audio and unsupported effects require checking in the destination editor. JSON preserves the original draft data.')}</p>{timeline.issues.map((issue, index) => <p key={index}>{t(issue.level)} · {t(issue.feature)} · {issue.clips.length}</p>)}</details>
        <label className="conversion-format">{t('Export format')}<select value={format} onChange={event => setFormat(event.target.value as ConversionFormat)}>{CONVERSION_FORMATS.map(value => <option key={value} value={value}>{value === 'xml' ? 'Final Cut Pro 7 XML' : value.toUpperCase()}</option>)}</select></label>
        <details><summary>{t('Output preview')}</summary><pre className="conversion-preview">{preview.slice(0, 200000)}</pre></details>
        <button className="btn primary" disabled={busy || !preview} onClick={() => void run(async () => { const path = await window.sbr.conversionExport(session!.id, format); if (path) setMessage(`${t('Export complete')}: ${path}`) })}>{t('Export')}</button>
      </> : <p>{t('Select a draft to preview its tracks, source ranges and compatibility.')}</p>}</main>
    </div>
    {message && <p role="status" className="conversion-message">{message}</p>}
  </Dialog>
}
