import { uploadDirect } from '../lib/libtvTransfer'
import { StillImage } from '../panels/StillImage'
import { useMediaUrl } from '../lib/useMediaUrl'
import type { MediaItem, Frame } from '@shared/types'
import { useEffect, useState } from 'react'
import { t, errorMessage } from '@shared/i18n'
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
  const target = useStore(state => state.doc?.settings.libtv)
  const [account, setAccount] = useState('')
  const [accounts, setAccounts] = useState<{ accountId: string; accountName: string; isActive?: boolean }[]>([])
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [workspace, setWorkspace] = useState('')
  const [canvasPage, setCanvasPage] = useState(1)
  const [moreCanvases, setMoreCanvases] = useState(false)
  const [canvases, setCanvases] = useState<{ id: string; name: string }[]>([])
  const [project, setProject] = useState(target?.projectId ?? '')
  const [message, setMessage] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const refresh = async (): Promise<void> => {
    setBusy(true)
    try { const info = await window.sbr.libtvAccount() as { activeAccount?: { accountName?: string }; user?: { nickname?: string } }; setAccount(info.activeAccount?.accountName ?? info.user?.nickname ?? 'LibTV'); const available = await window.sbr.libtvAccounts() as { accounts?: { accountId: string; accountName: string; isActive?: boolean }[] }; setAccounts(available.accounts ?? []); const list = await window.sbr.libtvWorkspaces() as { folders?: { id: string; name: string }[] }; setWorkspaces((list.folders ?? []).map(item => ({ id: String(item.id), name: item.name || `${t('Workspace')} ${item.id}` }))); const canvases = await window.sbr.libtvCanvases(workspace || undefined); setCanvases(canvases); setCanvasPage(1); setMoreCanvases(canvases.length === 50); setMessage(t('LibTV signed in')) } catch (error) { setMessage(errorMessage(error)) } finally { setBusy(false) }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => { void window.sbr.libtvLoginStatus().then(status => {
      if (status?.state === 'done') { setWaiting(false); void refresh() }
      if (status?.state === 'failed') { setWaiting(false); setMessage(status.error ?? t('Login failed')) }
    }).catch(error => { setWaiting(false); setMessage(errorMessage(error)) }) }, 1000)
    return () => clearInterval(timer)
  }, [waiting])
  return <section className="libtv-settings"><h3>LibTV</h3>
    <p className="hint">{t('Sign in with your browser, then choose a canvas to link. No access key is required.')}</p>
    <button className="btn" disabled={waiting} onClick={async () => { try { await window.sbr.libtvLogin(); setWaiting(true); setMessage(t('Complete login in your browser')) } catch (error) { setMessage(errorMessage(error)) } }}>{t(waiting ? 'Waiting for browser login…' : 'Sign in to LibTV')}</button>
    <button className="btn" disabled={busy} onClick={() => void refresh()}>{t('Refresh')}</button>
    {account && <p>{t('Account')}: {account}</p>}
    {accounts.length > 1 && <label className="field">{t('Personal account or team')}<select disabled={busy} value={String(accounts.find(item => item.isActive)?.accountId ?? '')} onChange={async event => { setBusy(true); try { await window.sbr.libtvUseAccount(event.target.value); setWorkspace(''); setProject(''); await refresh(); setMessage(t('Account changed. Select and link a canvas in this account.')) } catch (error) { setMessage(errorMessage(error)) } finally { setBusy(false) } }}>{accounts.map(item => <option key={item.accountId} value={item.accountId}>{item.accountName}</option>)}</select></label>}

    <label className="field">{t('Workspace')}<select value={workspace} onChange={async event => { const value = event.target.value; setWorkspace(value); setProject(''); try { const canvases = await window.sbr.libtvCanvases(value || undefined); setCanvases(canvases); setCanvasPage(1); setMoreCanvases(canvases.length === 50) } catch (error) { setMessage(errorMessage(error)) } }}><option value="">{t('All workspaces')}</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="field">{t('Target canvas')}<select value={project} onChange={event => setProject(event.target.value)}><option value="">{t('Choose a canvas')}</option>{canvases.map(canvas => <option key={canvas.id} value={canvas.id}>{canvas.name}</option>)}</select></label>
    {moreCanvases && <button className="text-button" onClick={async () => {
      try { const next = await window.sbr.libtvCanvases(workspace || undefined, canvasPage + 1); setCanvases(previous => [...previous, ...next]); setCanvasPage(canvasPage + 1); setMoreCanvases(next.length === 50) } catch (error) { setMessage(errorMessage(error)) }
    }}>{t('Load more')}</button>}
    <button className="btn primary" disabled={busy || !project} onClick={async () => {
      setBusy(true)
      try { await window.sbr.libtvVerify(project); useStore.getState().mutate('connect LibTV', doc => { doc.settings.libtv = { projectId: project, name: canvases.find(canvas => canvas.id === project)?.name ?? project } }); setMessage(t('Canvas linked')) } catch (error) { setMessage(errorMessage(error)) } finally { setBusy(false) }
    }}>{t('Link canvas')}</button>
    {target && <button className="text-button" onClick={() => useStore.getState().mutate('disconnect LibTV', doc => { delete doc.settings.libtv })}>{t('Disconnect')}</button>}
    <details><summary>{t('Login and linking guide')}</summary><ol><li>{t('Click Sign in to LibTV and finish signing in on the official website.')}</li><li>{t('Return here, refresh the canvas list, then select and link your target canvas.')}</li><li>{t('Credentials stay on this computer and are not included in project files.')}</li></ol></details>
    {target && <button className="btn" onClick={() => useStore.getState().setWorkspace('libtv')}>{t('Open LibTV studio')}</button>}
    <p role="status">{message}</p>
  </section>
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
      const detail = (event as CustomEvent<{mediaIds?: string[]; frameIds?: string[]; direct?: boolean; position?: { x: number; y: number }}>).detail
      setOpen(!detail.direct || !useStore.getState().doc?.settings.libtv); setJob(null); setCompleted([]); void window.sbr.libtvTargets().then(setTargets).catch(() => setTargets([])); setError(''); setBusy(true); setConfirmed(false)
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
        const inspected = await window.sbr.libtvInspect(state.projectFolder, selected)
        if (detail.position) inspected.forEach((file, index) => { file.x = detail.position!.x + (index % 4) * 300; file.y = detail.position!.y + Math.floor(index / 4) * 260 })
        setFiles(inspected)
        if (detail.direct && state.doc.settings.libtv) await uploadDirect(state.projectFolder, state.doc.settings.libtv.projectId, inspected)
      })().catch((e) => setError(String(e))).finally(() => setBusy(false))
    }
    window.addEventListener('libtv-upload',receive)
    return () => window.removeEventListener('libtv-upload',receive)
  },[])
  useEffect(() => {
    if(!job || job.state !== 'running') return
    let active = true
    const timer = window.setInterval(() => { void window.sbr.libtvStatus(job.id).then((next) => { if(active && next) { setJob(next); if(next.state === 'done') window.dispatchEvent(new Event('libtv-changed')) } }).catch((e) => setError(String(e))) },500)
    return () => { active=false; clearInterval(timer) }
  },[job?.id,job?.state])
  const start = async (retry: boolean): Promise<void> => {
    const state = useStore.getState()
    if(!state.projectFolder) return
    setBusy(true); setError('')
    try {
      if(retry && job) setCompleted((previous) => [...previous,...job.items.filter((item) => item.state==='uploaded')])
      const id = await window.sbr.libtvUpload(state.projectFolder,targetId,retry ? files.filter((f) => job?.items.some((i) => i.id === f.id && i.state !== 'uploaded')).map(file => ({ ...file, nodeKey: job?.items.find(item => item.id === file.id)?.nodeKey })) : files)
      setJob(await window.sbr.libtvStatus(id))
    } catch(e) { setError(String(e)) } finally { setBusy(false) }
  }
  if(!open) return null
  return <Dialog title={t('Upload to LibTV')} onClose={() => { if(job?.state === 'running') void window.sbr.libtvCancel(job.id); setOpen(false) }}>
    {!target ? <LibTVConnection /> : <>
      <p>{t('Target project')}: {target.name}</p>
      {ask ? <label className="field">{t('Choose target project')}<select value={targetId} onChange={(e) => { setTargetId(e.target.value); setConfirmed(false) }}>{[...new Set([targetId,...targets])].filter(Boolean).map((id) => <option key={id} value={id}>{id===target.projectId?target.name:id}</option>)}</select></label> : <code>{target.projectId}</code>}
      <p className="hint">{t('Uploads create resource nodes in the linked canvas. Uploading does not trigger generation.')}</p>
      <div className="libtv-file-list">{files.map((file) => <div key={file.id}><UploadThumbnail file={file} /><span>{file.name}</span><small>{((file.bytes ?? 0)/1024/1024).toFixed(2)} MB</small><span>{t([...completed,...(job?.items ?? [])].find((i) => i.id === file.id)?.state ?? 'pending')}</span><small>{[...completed,...(job?.items ?? [])].find((i) => i.id === file.id)?.error}</small></div>)}</div>
      <label className="setting-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{t('Upload these files to this LibTV project')}</label>
      <div className="modal-actions"><button className="btn primary" disabled={busy || !files.length || !confirmed || !targetId || !!job} onClick={() => void start(false)}>{t('Upload')}</button>{job?.state === 'running' && <button className="btn" onClick={() => void window.sbr.libtvCancel(job.id)}>{t('Cancel')}</button>}{job && job.state !== 'running' && job.items.some((i) => i.state !== 'uploaded') && <button className="btn" disabled={busy} onClick={() => void start(true)}>{t('Retry failed files')}</button>}<button className="btn" onClick={() => void window.sbr.openExternal(`https://www.liblib.tv/canvas?projectId=${encodeURIComponent(targetId)}`)}>{t('Open canvas')}</button>{job?.items.some((i) => i.url) && <button className="btn" onClick={() => void navigator.clipboard.writeText([...completed,...job.items].filter((i) => i.url).map((i) => i.url).join('\n'))}>{t('Copy resource links')}</button>}</div>
    </>}
    <button className="text-button" onClick={() => setConfigure(!configure)}>{t('Connect another project')}</button>
    {configure && target && <LibTVConnection />}
    <p role="alert">{error}</p>
  </Dialog>
}
