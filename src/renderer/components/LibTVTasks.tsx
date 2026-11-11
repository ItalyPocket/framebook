import { useEffect, useState } from 'react'
import type { LibTVGenerationTask } from '@shared/libtvGeneration'
import { createFrame } from '@shared/schema'
import { t, errorMessage } from '@shared/i18n'
import { useStore, currentProjectJson } from '../store'
import { Dialog } from './Controls'

function TaskThumbnail({ task, active }: { task: LibTVGenerationTask; active: boolean }): JSX.Element {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!active || task.state === 'running') return
    let alive = true
    void window.sbr.libtvNodeDetail(task.projectId, task.node).then(value => { if (alive) setUrl(value.url ?? '') }).catch(() => {})
    return () => { alive = false }
  }, [active, task.node, task.state])
  return <div className="libtv-task-thumbnail">{url ? (task.type === 'video' ? <video src={url} preload="metadata" muted playsInline onError={() => setUrl('')} /> : <img src={url} loading="lazy" alt="" onError={() => setUrl('')} />) : <span>◇</span>}</div>
}

export function LibTVTasks({ active, revision, onLocate }: { active: boolean; revision: number; onLocate(node: string): void }): JSX.Element {
  const target = useStore(state => state.doc?.settings.libtv)
  const [tasks, setTasks] = useState<LibTVGenerationTask[]>([])
  const [watermark, setWatermark] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [choose, setChoose] = useState<string[] | null>(null)
  const [shot, setShot] = useState('')
  const [column, setColumn] = useState('')
  const doc = useStore(state => state.doc)
  useEffect(() => {
    if (!active || !target) return
    let alive = true
    const refresh = (): void => { void window.sbr.libtvTasks().then(result => { if (alive) setTasks(result.filter(task => task.projectId === target.projectId)) }).catch(error => { if (alive) setError(errorMessage(error)) }) }
    void window.sbr.libtvTasks().then(() => window.sbr.libtvRecoverTasks(target.projectId)).then(result => { if (alive) setTasks(result.filter(task => task.projectId === target.projectId)) }).catch(error => { if (alive) setError(errorMessage(error)) })
    const timer = setInterval(refresh, 1800)
    return () => { alive = false; clearInterval(timer) }
  }, [active, target?.projectId, revision])
  const refreshRemote = async (): Promise<void> => { if (!target) return; setBusy(true); try { await window.sbr.libtvTasks(); setTasks((await window.sbr.libtvRecoverTasks(target.projectId)).filter(task => task.projectId === target.projectId)) } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) } }
  const importResult = async (task: LibTVGenerationTask, destination: 'media' | 'gallery' | 'story'): Promise<void> => {
    const state = useStore.getState()
    if (!state.projectFolder) return
    setBusy(true); setError('')
    try {
      const json = currentProjectJson(); if (json) await window.sbr.saveProject(state.projectFolder, json)
      const imported = await window.sbr.libtvDownload(task.id, state.projectFolder, watermark)
      const items = imported.map(item => state.addMedia(item))
      const existing = useStore.getState().doc?.media.filter(media => media.libtvSource?.projectId === task.projectId && media.libtvSource.node === task.node) ?? []
      const selected = items.length ? items : existing
      if (!selected.length) throw new Error(t('No downloadable results yet'))
      if (destination === 'gallery') for (const item of selected.filter(item => item.kind === 'image')) {
        if (!useStore.getState().doc?.frames.some(frame => frame.mediaId === item.id)) state.addFrame(item.id, 0, item.name)
      }
      if (destination === 'story') { setChoose(selected.map(item => item.id)); setShot(''); setColumn('') }
      state.toast(t(items.length ? 'Downloaded to media library' : 'Using existing local results'), 'success')
    } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  return <section className="libtv-tasks"><header><h3>{t('Tasks and results')}</h3><button className="btn small" disabled={busy} onClick={() => void refreshRemote()}>{t('Recover cloud status')}</button><label className="setting-check"><input type="checkbox" checked={watermark} onChange={event => setWatermark(event.target.checked)} />{t('Download with community watermark (non-member accounts)')}</label></header>
    <div className="libtv-task-list">{!tasks.length && <p className="hint">{t('Generation and downloaded results will appear here.')}</p>}{tasks.map(task => <article className="libtv-task-card" key={task.id}><TaskThumbnail task={task} active={active} /><button className="text-button" onClick={() => onLocate(task.node)}>{task.model ?? task.node}</button><span className={`task-state state-${task.state}`}>{t(task.state === 'detached' ? 'Status unknown' : task.state)}</span>{task.prompt && <p>{task.prompt}</p>}{task.error && <p role="alert">{errorMessage(task.error)}</p>}<div className="toolbar-group">{task.state === 'failed' && <button className="btn small" disabled={busy} onClick={async () => { await refreshRemote(); onLocate(task.node) }}>{t('Check result and edit retry')}</button>}{task.state === 'running' ? <button className="btn small" onClick={() => void window.sbr.libtvDetach(task.id)}>{t('Stop waiting')}</button> : <><button className="btn small" disabled={busy} onClick={() => void importResult(task, 'media')}>{t('Add to media library')}</button><button className="btn small" disabled={busy} onClick={() => void importResult(task, 'gallery')}>{t('Add images to gallery')}</button><button className="btn small" disabled={busy} onClick={() => void importResult(task, 'story')}>{t('Add to storyboard')}</button></>}</div></article>)}</div>
    {error && <p role="alert">{error}</p>}
    {choose && <Dialog title={t('Add to storyboard')} onClose={() => setChoose(null)}><label className="field">{t('Shot')}<select value={shot} onChange={event => setShot(event.target.value)}><option value="">—</option>{doc?.storyboard.shots.map((item, index) => <option key={item.id} value={item.id}>{index + 1}</option>)}</select></label><label className="field">{t('Image column')}<select value={column} onChange={event => setColumn(event.target.value)}><option value="">—</option>{doc?.storyboard.columns.filter(item => item.type === 'image').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="btn primary" disabled={!shot || !column} onClick={() => {
      useStore.getState().mutate('add LibTV results to storyboard', project => {
        const targetShot = project.storyboard.shots.find(item => item.id === shot)
        if (!targetShot) return
        const images = choose.map(id => { const media = project.media.find(item => item.id === id)!; if (media.kind === 'video' && media.durationS && !media.clip) media.clip = { sourceMediaId: media.id, inS: 0, outS: media.durationS }; const linked = project.frames.find(frame => frame.mediaId === id); return { frame: { ...createFrame(id, 0, 0, media.name), origin: 'ai' as const }, sourceFrameId: linked?.id, role: 'Reference' } })
        const previous = targetShot.cells[column]
        targetShot.cells[column] = [...(Array.isArray(previous) ? previous : []), ...images] as import('@shared/types').StoryImage[]
      }); setChoose(null)
    }}>{t('Add')}</button></Dialog>}
  </section>
}
