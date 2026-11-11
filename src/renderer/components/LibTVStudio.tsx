import { useEffect, useState } from 'react'
import { t, errorMessage } from '@shared/i18n'
import type { LibTVNode } from '@shared/libtvCanvas'
import { useStore } from '../store'
import { Dialog } from './Controls'

interface Model { modelName: string; modelKey?: string; description?: string }
interface Property { displayName?: string; type?: string; enum?: (string | number | { value: string | number; displayName?: string })[]; default?: string | number | boolean; minimum?: number; maximum?: number; min?: number; max?: number; step?: number; items?: Record<string, number[]>; activeWhen?: Record<string, unknown>; lockedWhen?: Record<string, unknown>; lockedHint?: string }
export function LibTVStudio({ node, references = [], onSubmitted, active = true }: { node?: LibTVNode; references?: string[]; onSubmitted?(): void; active?: boolean }): JSX.Element {
  const target = useStore(state => state.doc?.settings.libtv)
  const draftKey = `libtv-draft-${target?.projectId ?? 'unbound'}-${node?.id ?? 'new'}`
  const [draft] = useState(() => { try { return JSON.parse(localStorage.getItem(draftKey) ?? 'null') as { prompt?: string; model?: string; params?: Record<string, string | number | boolean> } | null } catch { return null } })
  const [type, setType] = useState<'image' | 'video'>(node?.type === 'video' ? 'video' : 'image')
  const [models, setModels] = useState<Model[]>([])
  const [model, setModel] = useState(draft?.model ?? String(node?.params?.model ?? ''))
  const [properties, setProperties] = useState<Record<string, Property | number[]>>({})
  const [params, setParams] = useState<Record<string, string | number | boolean>>(draft?.params ?? {})
  const [prompt, setPrompt] = useState(draft?.prompt ?? node?.prompt ?? '')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cacheTime, setCacheTime] = useState(0)
  const [stale, setStale] = useState(false)
  useEffect(() => {
    if (!active) return
    let alive = true
    setError('')
    void window.sbr.libtvCachedRead('models', type).then(result => { if (alive) { const items = (result.value as { matches?: Model[] }).matches ?? []; setModels(items); setModel(previous => items.find(item => item.modelKey === previous)?.modelName ?? previous); setCacheTime(result.fetchedAt); setStale(!!result.stale) } }).catch(error => { if (alive) setError(errorMessage(error)) })
    return () => { alive = false }
  }, [type, active])
  useEffect(() => {
    if (!model || !active) return
    let alive = true
    setError('')
    void window.sbr.libtvCachedRead('schema', model).then(result => {
      if (!alive) return
      const props = (result.value as { schema?: { properties?: Record<string, Property | number[]> } }).schema?.properties ?? {}
      setProperties(props)
      setStale(!!result.stale)
      const defaults: Record<string, string | number | boolean> = {}
      for (const [key, value] of Object.entries(props)) if (!Array.isArray(value) && value.default !== undefined) defaults[key] = value.default
      for (const [key, value] of Object.entries(node?.params ?? {})) if (key in props && ['string', 'number', 'boolean'].includes(typeof value)) defaults[key] = value as string | number | boolean
      const mode = props.modeType as Property | undefined
      if (mode?.items && !defaults.modeType) { const valid = Object.entries(mode.items).find(([, limits]) => references.length >= (limits[0] ?? 0) && references.length <= (limits[1] ?? Infinity)); if (valid) defaults.modeType = valid[0] }
      setParams(previous => ({ ...defaults, ...(draft?.model === model ? draft.params : {}), ...Object.fromEntries(Object.entries(previous).filter(([key]) => key in props)) }))
    }).catch(error => { if (alive) setError(errorMessage(error)) })
    return () => { alive = false }
  }, [model, active])
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify({ prompt, model, params })) }, [draftKey, prompt, model, params])
  const modeProperty = properties.modeType as Property | undefined
  const limits = modeProperty?.items?.[String(params.modeType ?? '')]
  const invalidReferences = !!limits && (references.length < (limits[0] ?? 0) || references.length > (limits[1] ?? Infinity))
  const matches = (conditions: Record<string, unknown> | undefined): boolean => !!conditions && Object.entries(conditions).every(([key, value]) => Array.isArray(value) ? value.includes(params[key]) : params[key] === value)
  const changed = (key: string, value: string | number | boolean): void => { setParams(previous => ({ ...previous, [key]: value })); setConfirm(false) }
  const submit = async (): Promise<void> => {
    if (!target) return
    setBusy(true); setError('')
    try { await window.sbr.libtvGenerate({ projectId: target.projectId, nodeKey: node?.id, type, model, prompt, params, references, confirmed: true }); setConfirm(false); onSubmitted?.() } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  const common = ['ratio', 'aspect_ratio', 'resolution', 'duration', 'count', 'modeType']
  const renderProperty = ([key, property]: [string, Property | number[]]): JSX.Element | null => {
      if (Array.isArray(property)) return key === 'count' ? <label className="field" key={key}>{t('Count')}<select value={String(params.count ?? 1)} onChange={event => changed('count', Number(event.target.value))}>{property.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null
      if (property.activeWhen && !matches(property.activeWhen)) return null
      if (property.items && key === 'modeType') return <label className="field" key={key}>{t('Generation mode')}<select value={String(params.modeType ?? '')} onChange={event => changed('modeType', event.target.value)}>{Object.entries(property.items).map(([mode, limit]) => <option key={mode} value={mode}>{t(mode)} · {limit[0]}–{limit[1]} {t('references')}</option>)}</select></label>
      if (property.enum) return <label className="field" key={key}>{t(property.displayName ?? key)}<select disabled={matches(property.lockedWhen)} title={matches(property.lockedWhen) ? property.lockedHint : undefined} value={String(params[key] ?? '')} onChange={event => { const option = property.enum!.find(item => String(typeof item === 'object' ? item.value : item) === event.target.value); changed(key, typeof option === 'object' ? option.value : option ?? '') }}><option value="">—</option>{property.enum.filter(item => key !== 'output_format' || ['png', 'jpeg', 'jpg', 'webp', 'gif'].includes(String(typeof item === 'object' ? item.value : item))).map(item => { const value = typeof item === 'object' ? item.value : item; return <option key={String(value)} value={String(value)}>{typeof item === 'object' ? item.displayName ?? String(value) : String(item)}</option> })}</select></label>
      if (property.type === 'number' || property.type === 'integer' || typeof property.min === 'number' || typeof property.max === 'number') return <label className="field" key={key}>{t(property.displayName ?? key)}<input type="number" min={property.minimum ?? property.min} max={property.maximum ?? property.max} step={property.step ?? (property.type === 'integer' ? 1 : 'any')} value={String(params[key] ?? '')} onChange={event => changed(key, Number(event.target.value))} /></label>
      if (property.type === 'boolean') return <label className="setting-check" key={key}><input type="checkbox" checked={params[key] === true} onChange={event => changed(key, event.target.checked)} />{t(property.displayName ?? key)}</label>
      return null
    
  }
  return <section className="libtv-generator">
    <h3>{t(node ? 'Node generation settings' : 'Create image or video')}</h3>
    {!node && <label className="field">{t('Type')}<select value={type} onChange={event => { setType(event.target.value as 'image' | 'video'); setModel(''); setParams({}); setProperties({}) }}><option value="image">{t('Image')}</option><option value="video">{t('Video')}</option></select></label>}
    <label className="field">{t('Model')}<select disabled={busy} value={model} onChange={event => { setModel(event.target.value); setParams({}); setConfirm(false) }}><option value="">—</option>{models.map(item => <option key={item.modelName} value={item.modelName}>{item.modelName}</option>)}</select></label>
    {models.find(item => item.modelName === model)?.description && <p className="hint">{models.find(item => item.modelName === model)?.description}</p>}
    <label className="field">{t('Prompt')}<textarea rows={5} value={prompt} onChange={event => { setPrompt(event.target.value); setConfirm(false) }} /></label>
    <div className="libtv-param-grid">{Object.entries(properties).filter(([key]) => common.includes(key)).map(renderProperty)}</div><details className="advanced-parameters"><summary>{t('Advanced parameters')}</summary><div className="libtv-param-grid">{Object.entries(properties).filter(([key]) => !common.includes(key) && !['prompt', 'model'].includes(key)).map(renderProperty)}</div>
    </details>
    {invalidReferences && <p role="alert">{t('Reference count does not match the selected mode.')} {limits?.[0]}–{limits?.[1]}</p>}
    <p className="hint">{t('Reference media')}: {references.length} · {t('Unsupported modes and reference limits are validated by the selected model before submission.')}</p>
    <div className="toolbar-group">{node && <button className="btn" disabled={busy} onClick={async () => { if (!target) return; try { await window.sbr.libtvEditNode(target.projectId, node.id, { prompt, params: { ...params, model } }); useStore.getState().toast(t('Node settings saved without generation'), 'success'); onSubmitted?.() } catch (error) { setError(errorMessage(error)) } }}>{t('Save settings')}</button>}<button className="btn primary" disabled={!model || !target || !prompt.trim() || invalidReferences || busy} onClick={() => setConfirm(true)}>{t('Review generation')}</button></div>
    {stale && <p role="status" className="hint">{t('Offline model information. Refresh the connection before generating.')}</p>}
    {cacheTime > 0 && <small className="hint">{t('Model information cached at')} {new Date(cacheTime).toLocaleTimeString()}</small>}
    {error && <p role="alert">{error}</p>}
    {confirm && <Dialog title={t('Confirm generation')} onClose={() => { if (!busy) setConfirm(false) }}><dl className="generation-summary"><dt>{t('Target canvas')}</dt><dd>{target?.name}</dd><dt>{t('Model')}</dt><dd>{model}</dd><dt>{t('Prompt')}</dt><dd>{prompt}</dd><dt>{t('Reference media')}</dt><dd>{references.length}</dd><dt>{t('Parameters')}</dt><dd>{JSON.stringify(params)}</dd></dl><p>{t('Generation uses your account credits. Final charges are determined by LibTV.')}</p><p className="hint">{t('Stopping local waiting does not cancel a running cloud generation or refund credits. Manage cloud tasks in LibTV.')}</p><button className="btn primary" disabled={busy} onClick={() => void submit()}>{t('Confirm and generate')}</button></Dialog>}
  </section>
}
