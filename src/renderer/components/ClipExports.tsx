import { useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import { defaultProjectExports } from '@shared/schema'
import type { ClipExportJob, ClipExportOptions } from '@shared/clips'
import { currentProjectJson, useStore } from '../store'
import { Dialog } from './Controls'

export function ClipExports(): JSX.Element | null {
  const [ids, setIds] = useState<string[] | null>(null)
  const [options, setOptions] = useState<ClipExportOptions>(defaultProjectExports().video)
  const [job, setJob] = useState<ClipExportJob | null>(null)
  const [url, setUrl] = useState('')
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const receive = (event: Event): void => {
      setIds((event as CustomEvent<string[]>).detail)
      setOptions(useStore.getState().doc?.settings.exports?.video ?? defaultProjectExports().video)
      setJob(null); setSelected(0); setError('')
    }
    window.addEventListener('clips-export', receive)
    return () => window.removeEventListener('clips-export', receive)
  }, [])
  useEffect(() => {
    if (!job || job.state !== 'running') return
    const timer = setInterval(() => { void window.sbr.clipsStatus(job.id).then(next => { if (next) setJob(next) }).catch(error => setError(String(error))) }, 500)
    return () => clearInterval(timer)
  }, [job?.id, job?.state])
  useEffect(() => {
    if (job?.state !== 'done' || !job.items.some(item => item.state === 'ready')) return
    let active = true
    let object = ''
    void window.sbr.clipsRead(job.id, selected).then(bytes => {
      if (active) { object = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/mp4' })); setUrl(object) }
    }).catch(error => setError(String(error)))
    return () => { active = false; URL.revokeObjectURL(object); setUrl('') }
  }, [job?.id, job?.state, selected])
  if (!ids) return null
  const close = (): void => { if (job) void window.sbr.clipsCancel(job.id); setIds(null); setJob(null) }
  return <Dialog title={t('Video export preview')} wide onClose={close}>
    <div className="clip-export-options">
      <label>{t('Format')}<select disabled={!!job} value={options.format} onChange={event => setOptions({ ...options, format: event.target.value as 'mp4' | 'mov' })}><option value="mp4">MP4 · H.264</option><option value="mov">MOV · ProRes 422</option></select></label>
      <label>{t('Resolution')}<select disabled={!!job} value={options.resolution} onChange={event => setOptions({ ...options, resolution: event.target.value as ClipExportOptions['resolution'] })}>{['native', '2160', '1080', '720'].map(value => <option key={value} value={value}>{value === 'native' ? t('Native resolution') : `${value}p`}</option>)}</select></label>
      <label><input type="checkbox" disabled={!!job} checked={options.muted} onChange={event => setOptions({ ...options, muted: event.target.checked })} />{t('Export without audio')}</label>
    </div>
    {url && <video className="clip-export-preview" src={url} controls />}
    {job?.items.map(item => <div key={item.id} className="clip-export-row"><span>{item.state === 'ready' ? <button className="text-button" onClick={() => setSelected(job.items.filter(entry => entry.state === 'ready').findIndex(entry => entry.id === item.id))}>{item.name}</button> : item.name}</span><progress value={item.progress} max="100" /><span>{t(item.state)}</span>{item.error && <small role="alert">{item.error}</small>}</div>)}
    {error && <p role="alert">{error}</p>}
    <div className="modal-actions">
      {!job && <button className="btn primary" disabled={busy} onClick={async () => {
        const state = useStore.getState()
        if (!state.projectFolder) return
        setBusy(true); setError('')
        try { await window.sbr.saveProject(state.projectFolder, currentProjectJson()!); setJob(await window.sbr.clipsPrepare(state.projectFolder, ids, options)) } catch (error) { setError(String(error)) } finally { setBusy(false) }
      }}>{t('Prepare preview')}</button>}
      {job?.state === 'done' && <button className="btn" onClick={() => { void window.sbr.clipsCancel(job.id); setJob(null) }}>{t('Change parameters')}</button>}
      {job?.state === 'done' && job.items.some(item => item.state === 'ready') && <button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true)
        try { const path = await window.sbr.clipsConfirm(job.id); if (path) { useStore.getState().toast(t('Export complete'), 'success'); close() } } catch (error) { setError(String(error)) } finally { setBusy(false) }
      }}>{t('Confirm export')}</button>}
      <button className="btn" disabled={busy} onClick={close}>{t('Cancel')}</button>
    </div>
  </Dialog>
}
