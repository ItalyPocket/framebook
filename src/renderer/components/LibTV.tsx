import { StillImage } from '../panels/StillImage'
import { useMediaUrl } from '../lib/useMediaUrl'
import type { MediaItem, Frame } from '@shared/types'
import { useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import type { LibTVFile, LibTVJob } from '@shared/libtv'
import { useStore, currentProjectJson } from '../store'
import { useSettings } from '../settings'
import { buildExportInputs } from '../lib/frameOps'
import { Dialog } from './Controls'

function UploadThumbnail({ file }: {file:LibTVFile}): JSX.Element {
  const frame=useStore((s) => s.doc?.frames.find((f) => f.id===file.id))
  const media=useStore((s) => s.doc?.media.find((m) => m.id===file.id))
  return frame ? <StillImage frame={frame as Frame} /> : media ? <MediaThumbnail media={media} /> : <span />
}
function MediaThumbnail({media}:{media:MediaItem}):JSX.Element { const url=useMediaUrl(media);return media.kind==='video'?<video muted src={url ?? ''} />:<img src={url ?? ''} alt={media.name} /> }

export function LibTVConnection(): JSX.Element {
  const target = useStore((s) => s.doc?.settings.libtv)
  const [secret, setSecret] = useState('')
  const [project, setProject] = useState(target?.projectId ?? '')
  const [name, setName] = useState(target?.name ?? 'LibTV')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const connect = async (): Promise<void> => {
    setBusy(true); setMessage('')
    try {
      const result = secret ? await window.sbr.libtvConfigure(secret) : await window.sbr.libtvVerify(project.includes('://') ? new URL(project).searchParams.get('projectId') ?? undefined : project || undefined)
      const projectId = project.includes('://') ? new URL(project).searchParams.get('projectId') : project.trim()
      if(projectId && projectId !== result.projectId) throw new Error(t('The access key belongs to a different LibTV project.'))
      useStore.getState().mutate('connect LibTV', (doc) => { doc.settings.libtv = {projectId:result.projectId,name:name.trim() || 'LibTV'} })
      setProject(result.projectId); setSecret(''); setMessage(t('Connection verified. Canvas visibility requires checking in LibTV.'))
    } catch(error) { setMessage(String(error)) } finally { setBusy(false) }
  }
  return <section className="libtv-settings"><h3>LibTV</h3><label className="field">{t('Project name')}<input value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field">{t('LibTV project URL or ID')}<input value={project} onChange={(e) => setProject(e.target.value)} /></label><label className="field">{t('Access key')}<input type="password" autoComplete="off" value={secret} placeholder={t('Leave empty to use saved key')} onChange={(e) => setSecret(e.target.value)} /></label><p className="hint">{t('Use the access key bound to the target project. No generation requests are sent.')}</p><button className="btn" disabled={busy} onClick={() => void connect()}>{t(busy ? 'Connecting…' : 'Verify and link project')}</button>{target && <button className="text-button" onClick={() => useStore.getState().mutate('disconnect LibTV',(doc) => { delete doc.settings.libtv })}>{t('Disconnect')}</button>}<p role="status">{message}</p></section>
}

export function LibTVUploads(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<LibTVFile[]>([])
  const [job, setJob] = useState<LibTVJob | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [targets,setTargets]=useState<string[]>([])
  const [configure,setConfigure]=useState(false)
  const [completed,setCompleted]=useState<LibTVJob['items']>([])
  const [confirmed, setConfirmed] = useState(false)
  const target = useStore((s) => s.doc?.settings.libtv)
  const ask = useSettings((s) => s.value?.askLibTV ?? false)
  useEffect(() => { if(target) {setTargetId(target.projectId);void window.sbr.libtvTargets().then(setTargets).catch(() => setTargets([]))} },[target?.projectId])
  useEffect(() => {
    const receive = (event: Event): void => {
      const detail = (event as CustomEvent<{mediaIds?: string[]; frameIds?: string[]}>).detail
      setOpen(true); setJob(null); setCompleted([]); void window.sbr.libtvTargets().then(setTargets).catch(() => setTargets([])); setError(''); setBusy(true); setConfirmed(false)
      const state = useStore.getState()
      setTargetId(state.doc?.settings.libtv?.projectId ?? '')
      void (async () => {
        if(!state.projectFolder || !state.doc) throw new Error(t('Open a project first.'))
        const json = currentProjectJson()
        if(json) await window.sbr.saveProject(state.projectFolder,json)
        const selected: LibTVFile[] = []
        if(detail.mediaIds) for(const media of state.doc.media.filter((m) => detail.mediaIds!.includes(m.id))) selected.push({id:media.id,name:media.name,path:media.externalPath ?? `${state.projectFolder}/${media.sourceFile}`})
        if(detail.frameIds) {
          const frames = state.orderedFrames().filter((f) => detail.frameIds!.includes(f.id))
          const inputs = await buildExportInputs(frames)
          for(const [index,input] of inputs.entries()) selected.push({id:frames[index]!.id,name:`${String(index+1).padStart(3,'0')}.png`,path:await window.sbr.libtvRender(state.projectFolder,input,index)})
        }
        setFiles(await window.sbr.libtvInspect(state.projectFolder,selected))
      })().catch((e) => setError(String(e))).finally(() => setBusy(false))
    }
    window.addEventListener('libtv-upload',receive)
    return () => window.removeEventListener('libtv-upload',receive)
  },[])
  useEffect(() => {
    if(!job || job.state !== 'running') return
    let active = true
    const timer = window.setInterval(() => { void window.sbr.libtvStatus(job.id).then((next) => { if(active && next) setJob(next) }).catch((e) => setError(String(e))) },500)
    return () => { active=false; clearInterval(timer) }
  },[job?.id,job?.state])
  const start = async (retry: boolean): Promise<void> => {
    const state = useStore.getState()
    if(!state.projectFolder) return
    setBusy(true); setError('')
    try {
      if(retry && job) setCompleted((previous) => [...previous,...job.items.filter((item) => item.state==='uploaded')])
      const id = await window.sbr.libtvUpload(state.projectFolder,targetId,retry ? files.filter((f) => job?.items.some((i) => i.id === f.id && i.state !== 'uploaded')) : files)
      setJob(await window.sbr.libtvStatus(id))
    } catch(e) { setError(String(e)) } finally { setBusy(false) }
  }
  if(!open) return null
  return <Dialog title={t('Upload to LibTV')} onClose={() => { if(job?.state === 'running') void window.sbr.libtvCancel(job.id); setOpen(false) }}>
    {!target ? <LibTVConnection /> : <>
      <p>{t('Target project')}: {target.name}</p>
      {ask ? <label className="field">{t('Choose target project')}<select value={targetId} onChange={(e) => { setTargetId(e.target.value); setConfirmed(false) }}>{[...new Set([targetId,...targets])].filter(Boolean).map((id) => <option key={id} value={id}>{id===target.projectId?target.name:id}</option>)}</select></label> : <code>{target.projectId}</code>}
      <p className="hint">{t('Uploads are stored in the linked project. Canvas visibility is not confirmed by the public API. No generation requests are sent.')}</p>
      <div className="libtv-file-list">{files.map((file) => <div key={file.id}><UploadThumbnail file={file} /><span>{file.name}</span><small>{((file.bytes ?? 0)/1024/1024).toFixed(2)} MB</small><span>{t([...completed,...(job?.items ?? [])].find((i) => i.id === file.id)?.state ?? 'pending')}</span><small>{[...completed,...(job?.items ?? [])].find((i) => i.id === file.id)?.error}</small></div>)}</div>
      <label className="setting-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{t('Upload these files to this LibTV project')}</label>
      <div className="modal-actions"><button className="btn primary" disabled={busy || !files.length || !confirmed || !targetId || !!job} onClick={() => void start(false)}>{t('Upload')}</button>{job?.state === 'running' && <button className="btn" onClick={() => void window.sbr.libtvCancel(job.id)}>{t('Cancel')}</button>}{job && job.state !== 'running' && job.items.some((i) => i.state !== 'uploaded') && <button className="btn" disabled={busy} onClick={() => void start(true)}>{t('Retry failed files')}</button>}<button className="btn" onClick={() => void window.sbr.openExternal(`https://www.liblib.tv/canvas?projectId=${encodeURIComponent(targetId)}`)}>{t('Open canvas')}</button>{job?.items.some((i) => i.url) && <button className="btn" onClick={() => void navigator.clipboard.writeText([...completed,...job.items].filter((i) => i.url).map((i) => i.url).join('\n'))}>{t('Copy resource links')}</button>}</div>
    </>}
    <button className="text-button" onClick={() => setConfigure(!configure)}>{t('Connect another project')}</button>
    {configure && target && <LibTVConnection />}
    <p role="alert">{error}</p>
  </Dialog>
}
