import { useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import type { LibTVGenerationTask } from '@shared/libtvGeneration'
import { useStore } from '../store'

interface Model { modelName: string; description?: string }
interface Property { displayName?: string; enum?: (string | number | { value: string | number; displayName?: string })[]; default?: string | number }
export function LibTVStudio(): JSX.Element {
  const target = useStore(state => state.doc?.settings.libtv)
  const [type, setType] = useState<'image' | 'video'>('image')
  const [models, setModels] = useState<Model[]>([])
  const [model, setModel] = useState('')
  const [properties, setProperties] = useState<Record<string, Property>>({})
  const [params, setParams] = useState<Record<string, string | number | boolean>>({})
  const [prompt, setPrompt] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [watermark, setWatermark] = useState(false)
  const [tasks, setTasks] = useState<LibTVGenerationTask[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setModel(''); setProperties({}); setParams({}); setConfirmed(false)
    void window.sbr.libtvModels(type).then(result => {
      if (active) setModels((result as { matches?: Model[] }).matches ?? [])
    }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [type])
  useEffect(() => {
    let active = true
    setParams({}); setProperties({}); setConfirmed(false)
    if (model) void window.sbr.libtvSchema(model).then(result => {
      if (!active) return
      const schema = (result as { schema?: { properties?: Record<string, Property> } }).schema
      const props = schema?.properties ?? {}
      setProperties(props)
      setParams(Object.fromEntries(Object.entries(props).filter(([, value]) => value && !Array.isArray(value) && value.enum && value.default !== undefined).map(([key, value]) => [key, value.default!])))
    }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [model])
  useEffect(() => {
    let active = true
    const refresh = (): void => { void window.sbr.libtvTasks().then(result => { if (active) setTasks(result) }).catch(error => { if (active) setError(String(error)) }) }
    refresh()
    const timer = setInterval(refresh, 1500)
    return () => { active = false; clearInterval(timer) }
  }, [])
  return <details className="libtv-studio"><summary>{t('LibTV image and video creation')}</summary>
    <p>{t('Target canvas')}: {target?.name ?? '—'}</p>
    <label className="field">{t('Type')}<select value={type} onChange={event => setType(event.target.value as 'image' | 'video')}><option value="image">{t('Image')}</option><option value="video">{t('Video')}</option></select></label>
    <label className="field">{t('Model')}<select value={model} onChange={event => setModel(event.target.value)}><option value="">—</option>{models.map(model => <option key={model.modelName} value={model.modelName}>{model.modelName}</option>)}</select></label>
    <label className="field">{t('Prompt')}<textarea rows={4} value={prompt} onChange={event => { setPrompt(event.target.value); setConfirmed(false) }} /></label>
    <div className="clip-export-options">{Object.entries(properties).filter(([, value]) => value && !Array.isArray(value) && Array.isArray(value.enum)).map(([key, property]) => <label key={key}>{property.displayName ?? t(key)}<select value={String(params[key] ?? '')} onChange={event => { setParams({ ...params, [key]: event.target.value }); setConfirmed(false) }}><option value="">—</option>{property.enum!.filter(item => key !== 'output_format' || ['png', 'jpeg', 'jpg', 'webp', 'gif'].includes(String(typeof item === 'object' ? item.value : item))).map(item => {
      const value = typeof item === 'object' ? item.value : item
      return <option key={String(value)} value={String(value)}>{typeof item === 'object' ? item.displayName ?? String(value) : String(item)}</option>
    })}</select></label>)}</div>
    {Array.isArray(properties.count) && <label className="field">{t('Count')}<select value={String(params.count ?? 1)} onChange={event => { setParams({ ...params, count: Number(event.target.value) }); setConfirmed(false) }}>{(properties.count as number[]).map(count => <option key={count} value={count}>{count}</option>)}</select></label>}
    <label className="setting-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t('I confirm the target, prompt and quantity. Generation uses my account credits; final charges are determined by LibTV.')}</label>
    <button className="btn primary" disabled={!confirmed || !model || !target || !prompt.trim() || busy} onClick={async () => {
      if (!target) return
      setBusy(true); setError('')
      try { const task = await window.sbr.libtvGenerate({ projectId: target.projectId, type, model, prompt, params, confirmed }); setTasks(previous => [...previous, task]); setConfirmed(false) } catch (error) { setError(String(error)) } finally { setBusy(false) }
    }}>{t('Start generation')}</button>
    <p className="hint">{t('Stopping local waiting does not cancel a running cloud generation or refund credits. Manage cloud tasks in LibTV.')}</p>
    <label className="setting-check"><input type="checkbox" checked={watermark} onChange={event => setWatermark(event.target.checked)} />{t('Download with community watermark (non-member accounts)')}</label>
    {tasks.filter(task => task.projectId === target?.projectId).map(task => <div className="clip-export-row" key={task.id}><span>{task.node}</span><span>{t(task.state)}</span>{task.error && <small>{task.error}</small>}
      {task.state === 'running' && <button className="btn small" onClick={() => void window.sbr.libtvDetach(task.id)}>{t('Stop waiting')}</button>}
      {['done', 'detached'].includes(task.state) && <button className="btn small" disabled={busy} onClick={async () => {
        const state = useStore.getState()
        if (!state.projectFolder) return
        setBusy(true)
        try { const imported = await window.sbr.libtvDownload(task.id, state.projectFolder, watermark); imported.forEach(item => state.addMedia(item)); state.toast(t('Downloaded to media library'), 'success') } catch (error) { setError(String(error)) } finally { setBusy(false) }
      }}>{t('Download to media library')}</button>}
      <button className="text-button" onClick={() => void window.sbr.openExternal(`https://www.liblib.tv/canvas?projectId=${encodeURIComponent(task.projectId)}`)}>{t('Open canvas')}</button>
    </div>)}
    {error && <p role="alert">{error}</p>}
  </details>
}
