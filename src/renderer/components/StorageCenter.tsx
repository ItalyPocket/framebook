import { useEffect, useRef, useState } from 'react'
import { t, errorMessage } from '@shared/i18n'
import type { MigrationScan, MigrationJob, MigrationOptions } from '@shared/migration'
import type { CacheStats } from '@shared/libtvCanvas'
import { useStore, currentProjectJson } from '../store'
import { Dialog } from './Controls'

const size = (bytes: number): string => `${(bytes / 1024 ** 2).toFixed(1)} MB`
export function StorageCenter(): JSX.Element {
  const running = useRef(false)
  const [scan, setScan] = useState<MigrationScan | null>(null)
  const [job, setJob] = useState<MigrationJob | null>(null)
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmUpdate, setConfirmUpdate] = useState(false)
  const [destination, setDestination] = useState('')
  const [options, setOptions] = useState<Omit<MigrationOptions, 'destination'>>({ mode: 'copy', collectExternal: true, includeExports: false, allowMissing: false, collision: 'copy' })
  const folder = useStore(state => state.projectFolder)
  const refresh = (): void => { void window.sbr.cacheStats().then(setStats).catch(error => setError(errorMessage(error))) }
  useEffect(refresh, [])
  useEffect(() => {
    if (!job || job.state !== 'running') return
    const timer = setInterval(() => { void window.sbr.migrationStatus(job.id).then(setJob).catch(error => setError(errorMessage(error))) }, 300)
    return () => clearInterval(timer)
  }, [job?.id, job?.state])
  running.current = job?.state === 'running'
  useEffect(() => () => { if (scan && !running.current) void window.sbr.migrationRelease(scan.id) }, [scan?.id])
  const inspect = async (source?: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      if (source && source === folder) { const json = currentProjectJson(); if (json) { await window.sbr.saveProject(source, json); useStore.getState().markSaved(json) } }
      const next = await window.sbr.migrationScan(source)
      if (next) { setScan(next); setJob(null) }
    } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  const migrate = async (): Promise<void> => {
    if (!scan) return
    setConfirmUpdate(false)
    try { setError(''); setJob(await window.sbr.migrationRun(scan.id, { ...options, destination })) } catch (error) { setError(errorMessage(error)) }
  }
  return <section className="storage-center">
    <header className="section-heading"><div><p className="eyebrow">STORAGE / TRANSFER</p><h3>{t('Storage and migration')}</h3></div></header>
    <p className="hint">{t('Copy, verify, then switch. Original archives are preserved; internal project data remains media-free.')}</p>
    <div className="toolbar-group"><button className="btn primary" disabled={busy || job?.state === 'running'} onClick={() => void inspect()}>{t('Scan project or ZIP')}</button><button className="btn" disabled={!folder || busy || job?.state === 'running'} onClick={() => void inspect(folder ?? undefined)}>{t('Scan current project')}</button></div>
    {scan && <div className="migration-review"><h4>{scan.name}</h4><p>v{scan.version} · {scan.files.length} {t('files')} · {size(scan.bytes)}</p>
      {!scan.supported && <p role="alert">{t('This project requires a newer version of Framebook')}</p>}
      {scan.duplicate && <p className="hint">{t('A project with this ID already exists. Import as a separate copy by default.')}<br />{scan.existing?.name} · v{scan.existing?.version} · {scan.existing?.media} {t('Media')} · {scan.existing?.shots} {t('shots')} · {scan.existing && new Date(scan.existing.modified).toLocaleString()}</p>}
      <div className="migration-files">{scan.files.map(file => <div key={file.source}><span>{file.path}</span><span className={file.missing ? 'danger' : ''}>{file.missing ? <button className="text-button" disabled={job?.state === 'running'} onClick={async () => { try { setScan(await window.sbr.migrationRelink(scan.id, file.source)) } catch (error) { setError(errorMessage(error)) } }}>{t('Relink missing media')}</button> : size(file.bytes)}</span></div>)}</div>
      <div className="settings-grid"><label className="field">{t('Migration action')}<select disabled={job?.state === 'running'} value={options.mode} onChange={event => setOptions({ ...options, mode: event.target.value as MigrationOptions['mode'] })}><option value="copy">{t('Import as project')}</option><option value="upgrade">{t('Upgrade old archive')}</option><option value="move">{t('Change project folder')}</option><option value="package">{t('Portable ZIP package')}</option></select></label>
      {scan.duplicate && options.mode !== 'package' && <label className="field">{t('Existing project')}<select value={options.collision} onChange={event => setOptions({ ...options, collision: event.target.value as 'copy' | 'update' })}><option value="copy">{t('Import separate copy')}</option><option value="update">{t('Update existing project after comparison')}</option></select></label>}</div>
      {(['collectExternal', 'includeExports', 'allowMissing'] as const).map((key, index) => <label className="setting-check" key={key}><input type="checkbox" checked={options[key]} onChange={event => setOptions({ ...options, [key]: event.target.checked })} />{t(['Collect externally referenced media', 'Include export files', 'Allow incomplete project with missing media'][index]!)}</label>)}
      <div className="path-setting"><input readOnly placeholder={t('Destination folder')} value={destination} /><button className="btn" disabled={job?.state === 'running'} onClick={async () => { const path = await window.sbr.chooseDirectory(); if (path) setDestination(path) }}>{t('Choose folder')}</button></div>
      <div className="toolbar-group"><button className="btn primary" disabled={!scan.supported || !destination || job?.state === 'running' || (!options.allowMissing && scan.files.some(file => file.missing))} onClick={async () => {
        if (options.collision === 'update' && options.mode !== 'package') setConfirmUpdate(true)
        else await migrate()
      }}>{t('Start migration')}</button>{job?.state === 'running' && <button className="btn" onClick={() => void window.sbr.migrationCancel(job.id)}>{t('Cancel')}</button>}</div>
      {job && <div role="status"><p>{t(job.state)} · {job.completed}/{job.total}</p><progress value={job.completed} max={Math.max(1, job.total)} />{job.error && <p role="alert">{errorMessage(job.error)}</p>}{job.folder && <div className="toolbar-group"><button className="btn" onClick={() => void window.sbr.showFolder(job.folder!)}>{t('Show in Finder')}</button>{options.mode !== 'package' && <button className="btn" onClick={async () => { const result = await window.sbr.loadProject(job.folder!); if (result.json) useStore.getState().loadFromJson(result.folder ?? job.folder!, result.json) }}>{t('Open migrated project')}</button>}</div>}{job.report && <button className="text-button" onClick={() => void window.sbr.showFolder(job.report!)}>{t('Migration report')}</button>}</div>}
    </div>}
    <section className="cache-settings"><h3>{t('Performance and cache')}</h3>{stats && <><p>{t('Preview cache')} · {size(stats.bytes)} / {size(stats.limit)}</p><label className="field">{t('Disk cache limit')}<select value={Math.round(stats.limit / 1024 ** 3)} onChange={async event => { await window.sbr.cacheConfigure(Number(event.target.value) * 1024 ** 3); refresh() }}>{[1, 2, 4, 8].map(value => <option key={value} value={value}>{value} GB</option>)}</select></label><p className="hint">{t('Decoded image budget: 256 MB. Videos stream on demand. Originals and login are never cleared.')}</p><p className="hint">GPU: {stats.gpu.gpu_compositing ?? '—'}</p></>}
      <div className="toolbar-group"><button className="btn" onClick={async () => { await window.sbr.cacheClear(); refresh() }}>{t('Clear preview cache')}</button><button className="btn" onClick={async () => { await window.sbr.cacheClear(true); refresh(); useStore.getState().toast(t('GPU cache will rebuild after restarting Framebook'), 'success') }}>{t('Rebuild GPU cache on restart')}</button></div>
    </section>{confirmUpdate && <Dialog title={t('Update existing project')} onClose={() => setConfirmUpdate(false)}><p>{t('Update the existing internal project with this archive? A recovery copy will be kept.')}</p><div className="toolbar-group"><button className="btn" onClick={() => setConfirmUpdate(false)}>{t('Cancel')}</button><button className="btn primary" onClick={() => void migrate()}>{t('Confirm update')}</button></div></Dialog>}{error && <p role="alert">{error}</p>}
  </section>
}
