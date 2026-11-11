import { useTransfers, uploadDirect } from '../lib/libtvTransfer'
import { useItemSelection } from '../lib/useItemSelection'
import { useVisible } from '../lib/useVisible'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LibTVGraph, LibTVNode } from '@shared/libtvCanvas'
import type { MediaItem } from '@shared/types'
import { t, errorMessage } from '@shared/i18n'
import { useStore } from '../store'
import { useThumbnailUrl } from '../lib/useMediaUrl'
import { StillImage } from './StillImage'
import { LibTVConnection } from '../components/LibTV'
import { LibTVStudio } from '../components/LibTVStudio'
import { LibTVTasks } from '../components/LibTVTasks'
import { DockLayout } from '../components/DockLayout'
import { ContextMenu, Dialog, Menu, MenuItem } from '../components/Controls'
import { SearchControl } from '../components/SearchControl'

function LocalAsset({ media, selected, ids, onSelect }: { media: MediaItem; selected: boolean; ids: string[]; onSelect(event: React.MouseEvent): void }): JSX.Element {
  const [ref, visible] = useVisible<HTMLButtonElement>()
  const url = useThumbnailUrl(media, visible)
  return <button ref={ref} className={`libtv-local-asset ${selected ? 'selected' : ''}`} data-select-id={media.id} draggable onDragStart={event => { event.dataTransfer.setData('application/framebook-media', media.id); event.dataTransfer.setData('application/framebook-media-list', JSON.stringify(ids.includes(media.id) ? ids : [media.id])) }} title={t('Drag to canvas to upload')} onClick={onSelect}>{url && (<img src={url} loading="lazy" alt="" />)}<span>{media.name}</span></button>
}
export function LibTVWorkspace({ active }: { active: boolean }): JSX.Element {
  const target = useStore(state => state.doc?.settings.libtv)
  const media = useStore(state => state.doc?.media)
  const frames = useStore(state => state.doc?.frames)
  const transfers = useTransfers(state => state.transfers)
  const [localSelection, setLocalSelection] = useState<string[]>([])
  const [graph, setGraph] = useState<LibTVGraph | null>(null)
  const [details, setDetails] = useState<Record<string, Partial<LibTVNode>>>({})
  const [selected, setSelected] = useState('')
  const [composerClosed, setComposerClosed] = useState(false)
  useEffect(() => setComposerClosed(false), [selected])
  const [search, setSearch] = useState('')
  const [assetTab, setAssetTab] = useState<'nodes' | 'media' | 'frames'>('nodes')
  const [connection, setConnection] = useState(false)
  const [canvasPicker, setCanvasPicker] = useState(false)
  const [canvasSearch, setCanvasSearch] = useState('')
  const [canvasPage, setCanvasPage] = useState(1)
  const [moreCanvases, setMoreCanvases] = useState(false)
  const [create, setCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [account, setAccount] = useState('')
  const [canvases, setCanvases] = useState<{ id: string; name: string }[]>([])
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [workspace, setWorkspace] = useState('')
  const [cacheTime, setCacheTime] = useState(0)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [viewport, setViewport] = useState({ x: 60, y: 60, zoom: .6 })
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null)
  const [connecting, setConnecting] = useState('')
  const [deleteNode, setDeleteNode] = useState<LibTVNode | null>(null)
  const [preview, setPreview] = useState<LibTVNode | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const fitted = useRef('')
  const projectRef = useRef(target?.projectId)
  projectRef.current = target?.projectId
  const node = useMemo(() => { const value = graph?.nodes.find(item => item.id === selected); return value ? { ...value, ...details[value.id] } : undefined }, [graph, details, selected])
  const references = graph?.edges.filter(edge => edge.target === selected).map(edge => edge.source) ?? []
  const run = async (operation: () => Promise<void>): Promise<void> => { setBusy(true); setError(''); try { await operation() } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) } }
  const fit = useCallback((value: LibTVGraph): void => {
    const bounds = surface.current?.getBoundingClientRect()
    if (!bounds || !value.nodes.length) return
    const minX = Math.min(...value.nodes.map(item => item.x)), minY = Math.min(...value.nodes.map(item => item.y))
    const maxX = Math.max(...value.nodes.map(item => item.x + 260)), maxY = Math.max(...value.nodes.map(item => item.y + 220))
    const zoom = Math.max(.12, Math.min(1, (bounds.width - 60) / (maxX - minX), (bounds.height - 60) / (maxY - minY)))
    setViewport({ zoom, x: 30 - minX * zoom, y: 30 - minY * zoom })
  }, [])
  const refresh = useCallback(async (): Promise<void> => {
    const project = target?.projectId
    if (!project) return
    const value = await window.sbr.libtvGraph(project)
    if (projectRef.current !== project) return
    setGraph(value)
    if (fitted.current !== project) {
      fitted.current = project
      try { const saved = JSON.parse(localStorage.getItem(`libtv-view-${project}`) ?? 'null'); if (saved) setViewport(saved); else fit(value) } catch { fit(value) }
    }
  }, [target?.projectId, fit])
  const loadNavigation = useCallback(async (force = false): Promise<void> => {
    const results = await Promise.all([window.sbr.libtvAccount(), window.sbr.libtvCachedRead('canvases', workspace, force), window.sbr.libtvCachedRead('workspaces', '', force)])
    const info = results[0] as { activeAccount?: { accountName?: string }; user?: { nickname?: string } }
    setAccount(info.activeAccount?.accountName ?? info.user?.nickname ?? 'LibTV')
    const list = results[1].value as { projects?: unknown[]; list?: unknown[] }
    const collect = (value: unknown): Record<string, unknown>[] => { if (Array.isArray(value)) return value.flatMap(collect); if (!value || typeof value !== 'object') return []; const item = value as Record<string, unknown>; return [item, ...Object.values(item).filter(value => value && typeof value === 'object').flatMap(collect)] }
    setCanvases(collect(list).filter(item => typeof item.uuid === 'string' || typeof item.projectUuid === 'string').map(item => ({ id: String(item.uuid ?? item.projectUuid), name: String(item.name ?? item.title ?? item.projectName ?? item.uuid) })))
    setWorkspaces(((results[2].value as { folders?: { id: string; name: string }[] }).folders ?? []).map(item => ({ id: String(item.id), name: item.name })))
    setCanvasPage(1); setMoreCanvases(collect(list).filter(item => typeof item.uuid === 'string' || typeof item.projectUuid === 'string').length === 50)
    setCacheTime(results[1].fetchedAt); setStale(!!results[1].stale)
  }, [workspace])
  useEffect(() => { if (active) void loadNavigation().catch(error => setError(errorMessage(error))) }, [active, loadNavigation])
  useEffect(() => {
    setGraph(null); setDetails({}); setSelected(''); fitted.current = ''
  }, [target?.projectId])
  useEffect(() => { if (active && target) void refresh().catch(error => setError(errorMessage(error))) }, [active, refresh])
  useEffect(() => {
    if (!active || !graph || graph.stale) return
    const project = graph.projectId
    let alive = true, index = 0
    const work = async (): Promise<void> => {
      while (alive && index < graph.nodes.length) {
        const item = graph.nodes[index++]!
        if (details[item.id]) continue
        try { const detail = await window.sbr.libtvNodeDetail(project, item.id); if (alive && projectRef.current === project) setDetails(previous => ({ ...previous, [item.id]: detail })) } catch {}
      }
    }
    void Promise.all([work(), work(), work()])
    return () => { alive = false }
  }, [graph?.fetchedAt, active])
  useEffect(() => { if (target) localStorage.setItem(`libtv-view-${target.projectId}`, JSON.stringify(viewport)) }, [viewport, target?.projectId])
  useEffect(() => {
    const uploaded = (): void => { if (active) void refresh().catch(error => setError(errorMessage(error))) }
    window.addEventListener('libtv-changed', uploaded)
    return () => window.removeEventListener('libtv-changed', uploaded)
  }, [active, refresh])
  useEffect(() => {
    const element = surface.current
    if (!element || !active) return
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      const bounds = element.getBoundingClientRect()
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top
      setViewport(previous => {
        if (!event.ctrlKey) return { ...previous, x: previous.x - event.deltaX, y: previous.y - event.deltaY }
        const zoom = Math.max(.1, Math.min(3, previous.zoom * Math.exp(-event.deltaY * .01)))
        return { zoom, x: x - (x - previous.x) * zoom / previous.zoom, y: y - (y - previous.y) * zoom / previous.zoom }
      })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [active])
  const locate = (id: string): void => {
    const item = graph?.nodes.find(item => item.id === id || item.name === id)
    if (!item) { void refresh().catch(error => setError(errorMessage(error))); return }
    setSelected(item.id)
    const bounds = surface.current?.getBoundingClientRect()
    if (bounds) setViewport(previous => ({ ...previous, x: bounds.width / 2 - (item.x + 130) * previous.zoom, y: bounds.height / 2 - (item.y + 110) * previous.zoom }))
  }
  const connect = async (source: string, destination: string): Promise<void> => {
    if (!target || !graph || graph.stale || source === destination) return
    const previous = graph.edges.filter(edge => edge.target === destination).map(edge => edge.source)
    await run(async () => { setGraph(await window.sbr.libtvEditNode(target.projectId, destination, { references: [...previous, source], expectedReferences: previous })); setConnecting('') })
  }
  const pan = (event: React.PointerEvent): void => {
    if ((event.target as HTMLElement).closest('.libtv-node,button,input')) return
    const start = { x: event.clientX, y: event.clientY, view: viewport }
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent): void => setViewport({ ...start.view, x: start.view.x + e.clientX - start.x, y: start.view.y + e.clientY - start.y })
    const end = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true })
  }
  const moveNode = (event: React.PointerEvent, item: LibTVNode): void => {
    if ((event.target as HTMLElement).closest('button,input') || busy || graph?.stale || !target) return
    event.stopPropagation(); setSelected(item.id); setComposerClosed(false); event.currentTarget.setPointerCapture(event.pointerId)
    const project = target.projectId, start = { x: event.clientX, y: event.clientY }; let x = item.x, y = item.y
    const move = (e: PointerEvent): void => { x = Math.round(item.x + (e.clientX - start.x) / viewport.zoom); y = Math.round(item.y + (e.clientY - start.y) / viewport.zoom); setGraph(previous => previous ? { ...previous, nodes: previous.nodes.map(node => node.id === item.id ? { ...node, x, y } : node) } : previous) }
    const end = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); if (x !== item.x || y !== item.y) void run(async () => { setGraph(await window.sbr.libtvEditNode(project, item.id, { x, y })) }) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true })
  }
  const localIds = (assetTab === 'frames' ? frames?.filter(item => item.label.toLowerCase().includes(search.toLowerCase())) : media?.filter(item => item.name.toLowerCase().includes(search.toLowerCase())))?.map(item => item.id) ?? []
  const localSelect = useItemSelection(localIds, localSelection, setLocalSelection)
  const navigation = <div className="libtv-navigation"><div className="segmented-control">{(['nodes', 'media', 'frames'] as const).map(tab => <button key={tab} aria-pressed={assetTab === tab} onClick={() => setAssetTab(tab)}>{t({ nodes: 'Nodes', media: 'Media', frames: 'Frames' }[tab])}</button>)}</div><SearchControl label="Search nodes and media" value={search} onChange={setSearch} />
    {assetTab === 'nodes' && <div className="libtv-node-list">{graph?.nodes.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <button className={selected === item.id ? 'active' : ''} key={item.id} onClick={() => locate(item.id)}><span>{item.type === 'image' ? '▧' : item.type === 'video' ? '▷' : '◇'}</span>{item.name}</button>)}</div>}
    {assetTab === 'media' && <div className="libtv-local-assets selectable-surface" tabIndex={0} onKeyDown={localSelect.keyDown} onPointerDown={localSelect.pointerDown}>{localSelect.rectangle && <div className="selection-rectangle" style={localSelect.rectangle} />}{media?.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <LocalAsset key={item.id} media={item} selected={localSelection.includes(item.id)} ids={localSelection} onSelect={event => localSelect.click(item.id, event)} />)}</div>}
    {assetTab === 'frames' && <div className="libtv-local-assets selectable-surface" tabIndex={0} onKeyDown={localSelect.keyDown} onPointerDown={localSelect.pointerDown}>{localSelect.rectangle && <div className="selection-rectangle" style={localSelect.rectangle} />}{frames?.filter(item => item.label.toLowerCase().includes(search.toLowerCase())).map(frame => <button className={`libtv-local-asset ${localSelection.includes(frame.id) ? 'selected' : ''}`} data-select-id={frame.id} key={frame.id} draggable onDragStart={event => { event.dataTransfer.setData('text/frame-id', frame.id); event.dataTransfer.setData('application/framebook-frame-list', JSON.stringify(localSelection.includes(frame.id) ? localSelection : [frame.id])) }} onClick={event => localSelect.click(frame.id, event)}><StillImage frame={frame} /><span>{frame.label}</span></button>)}</div>}
    <p className="hint">{t('Drag selected media onto the canvas to upload without generating.')}</p></div>
  const referenceEditor = node && target ? <><h3>{t('Reference media')}</h3><div className="reference-list">{references.map((id, index) => <div key={id}><button className="reference-preview" onClick={() => { const item = graph?.nodes.find(item => item.id === id); if (item && details[id]?.url) setPreview({ ...item, ...details[id] }) }}>{details[id]?.url && <img src={details[id]?.url} alt="" />}<span>{graph?.nodes.find(item => item.id === id)?.name ?? id}</span></button><button className="icon-button" aria-label={t('Move up')} disabled={!index || busy} onClick={() => void run(async () => { const next = [...references]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; setGraph(await window.sbr.libtvEditNode(target.projectId, node.id, { references: next, expectedReferences: references })) })}>↑</button><button className="icon-button" aria-label={t('Remove reference')} disabled={busy} onClick={() => { if (window.confirm(t('Remove this cloud connection? Local undo does not apply.'))) void run(async () => setGraph(await window.sbr.libtvEditNode(target.projectId, node.id, { references: references.filter(value => value !== id), expectedReferences: references }))) }}>×</button></div>)}</div></> : null
  const composer = !composerClosed && node && target && ['image', 'video'].includes(node.type) ? <div className="libtv-floating-composer"><header><strong>{node.name}</strong><span>{t('Reference media')}: {references.length}</span><button className="icon-button" aria-label={t('Close editor')} onClick={() => setComposerClosed(true)}>×</button></header>{referenceEditor}{details[node.id] ? <LibTVStudio key={node.id} active={active} node={node} references={references} onSubmitted={() => { setRevision(value => value + 1); setDetails(previous => { const next = { ...previous }; delete next[node.id]; return next }); void refresh().catch(error => setError(errorMessage(error))) }} /> : <p className="hint">{t('Loading…')}</p>}</div> : null
  const canvas = <div className="libtv-canvas-container"><div className="canvas-controls"><button className="btn small" aria-label={t('Zoom out')} onClick={() => setViewport(value => ({ ...value, zoom: Math.max(.1, value.zoom / 1.2) }))}>−</button><span>{Math.round(viewport.zoom * 100)}%</span><button className="btn small" aria-label={t('Zoom in')} onClick={() => setViewport(value => ({ ...value, zoom: Math.min(2, value.zoom * 1.2) }))}>＋</button><button className="btn small" onClick={() => { if (graph) fit(graph) }}>{t('Fit canvas')}</button><Menu label={t('New node')}><MenuItem onClick={() => { if (target) void run(async () => { const result = await window.sbr.libtvCreateNode(target.projectId, 'image', (100 - viewport.x) / viewport.zoom, (80 - viewport.y) / viewport.zoom); setGraph(result.graph); setSelected(result.node) }) }}>{t('Image')}</MenuItem><MenuItem onClick={() => { if (target) void run(async () => { const result = await window.sbr.libtvCreateNode(target.projectId, 'video', (100 - viewport.x) / viewport.zoom, (80 - viewport.y) / viewport.zoom); setGraph(result.graph); setSelected(result.node) }) }}>{t('Video')}</MenuItem></Menu></div>
    <div className="libtv-canvas" ref={surface} onContextMenu={event => { if ((event.target as HTMLElement).closest('.libtv-node')) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setNodeMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 130), worldX: (event.clientX - bounds.left - viewport.x) / viewport.zoom, worldY: (event.clientY - bounds.top - viewport.y) / viewport.zoom }) }} onPointerDown={pan} onDragOver={event => { if (event.dataTransfer.types.some(type => ['application/framebook-media', 'text/frame-id', 'application/framebook-media-list', 'application/framebook-frame-list'].includes(type))) event.preventDefault() }} onDrop={event => { event.preventDefault(); const mediaId = event.dataTransfer.getData('application/framebook-media'), frameId = event.dataTransfer.getData('text/frame-id'); if (mediaId || frameId) { const bounds = event.currentTarget.getBoundingClientRect(); const read = (type: string, fallback: string): string[] => { try { const value = JSON.parse(event.dataTransfer.getData(type)); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [fallback] } catch { return [fallback] } }; window.dispatchEvent(new CustomEvent('libtv-upload', { detail: { ...(mediaId ? { mediaIds: read('application/framebook-media-list', mediaId) } : { frameIds: read('application/framebook-frame-list', frameId) }), direct: true, position: { x: (event.clientX - bounds.left - viewport.x) / viewport.zoom, y: (event.clientY - bounds.top - viewport.y) / viewport.zoom } } })) } }}>
      {!target && <div className="empty-editor"><p className="eyebrow">CONNECT / CREATE</p><h2>{t('Your creative canvas starts here.')}</h2><button className="btn primary" onClick={() => setConnection(true)}>{t('Connect LibTV')}</button></div>}
      {target && !graph && <div className="empty-editor"><h3>{t(busy ? 'Loading…' : 'Canvas is not loaded')}</h3><button className="btn" onClick={() => void run(refresh)}>{t('Refresh')}</button></div>}
      <div className="libtv-world" style={{ transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})` }}><svg className="libtv-edges" width="1" height="1">{graph?.edges.map(edge => { const source = graph.nodes.find(item => item.id === edge.source), destination = graph.nodes.find(item => item.id === edge.target); if (!source || !destination) return null; return <path key={edge.id} d={`M${source.x + 260},${source.y + 100} C${source.x + 360},${source.y + 100} ${destination.x - 100},${destination.y + 100} ${destination.x},${destination.y + 100}`} /> })}</svg>
      {graph?.nodes.map(item => { const detail = details[item.id]; return <article tabIndex={0} aria-label={item.name} className={`libtv-node ${selected === item.id ? 'selected' : ''}`} key={item.id} style={{ left: item.x, top: item.y }} onPointerDown={event => moveNode(event, item)} onFocus={() => setSelected(item.id)} onDoubleClick={() => { if (detail?.url) setPreview({ ...item, ...detail }) }}>
        <header><span>{t(item.type === 'image' ? 'Image' : item.type === 'video' ? 'Video' : 'Node')}</span><button className="icon-button contextual" aria-label={t('Delete node')} onClick={() => setDeleteNode(item)}>×</button></header><div className="libtv-node-media">{detail?.url ? item.type === 'video' ? <video src={detail.url} preload="metadata" muted /> : <img src={detail.url} loading="lazy" alt="" /> : <span>{item.type === 'video' ? '▷' : '◇'}<small>{t('No preview available')}</small></span>}</div><h4>{item.name}</h4>
        <button className="node-port input" title={t('Connect reference here')} aria-label={t('Connect reference here')} onClick={() => { if (connecting) void connect(connecting, item.id) }} onDragOver={event => event.preventDefault()} onDrop={event => { event.stopPropagation(); const source = event.dataTransfer.getData('application/framebook-node'); if (source) void connect(source, item.id) }}>●</button><button className={`node-port output ${connecting === item.id ? 'active' : ''}`} draggable onDragStart={event => event.dataTransfer.setData('application/framebook-node', item.id)} title={t('Use as reference')} aria-label={t('Use as reference')} onClick={() => setConnecting(connecting === item.id ? '' : item.id)}>●</button>
      </article> })}{transfers.filter(transfer => transfer.projectId === target?.projectId).flatMap(transfer => transfer.files.map((file, index) => { const item = transfer.job?.items.find(item => item.id === file.id); if (item?.state === 'uploaded') return null; return <article className="libtv-node transfer-node" key={`${transfer.id}:${file.id}`} style={{ left: file.x ?? index * 300, top: file.y ?? 0 }}><header>{file.name}</header><p role="status">{transfer.error ?? item?.error ?? t(item?.state ?? 'uploading')}</p>{(item?.state === 'failed' || transfer.error || transfer.job?.state === 'cancelled') && <button className="btn small" onClick={() => { const folder = useStore.getState().projectFolder; if (folder) void uploadDirect(folder, transfer.projectId, transfer.files.filter(source => transfer.job?.items.find(entry => entry.id === source.id)?.state !== 'uploaded').map(source => ({ ...source, nodeKey: transfer.job?.items.find(entry => entry.id === source.id)?.nodeKey })), transfer.id) }}>{t('Retry failed files')}</button>}</article> }))}</div>
    </div>{composer}{connecting && <p className="canvas-hint">{t('Select the input port of the target node to connect.')} <button className="text-button" onClick={() => setConnecting('')}>{t('Cancel')}</button></p>}
  </div>

  const inspector = <div className="libtv-inspector">{node && target ? <><label className="field">{t('Node name')}<input key={node.id + node.name} defaultValue={node.name} onBlur={event => { const name = event.target.value.trim(); if (name && name !== node.name) void run(async () => setGraph(await window.sbr.libtvEditNode(target.projectId, node.id, { name }))) }} /></label>

      <button className="btn" onClick={() => void run(async () => { await window.sbr.libtvTrackNode(target.projectId, node.id); setRevision(value => value + 1) })}>{t('Add result to tasks')}</button>
    </> : <div className="empty-editor"><h3>{t('Select a node')}</h3><p>{t('Connect media, edit parameters, then review generation.')}</p></div>}</div>
  return <div className="libtv-workspace"><header className="editor-header section-header"><div><p className="eyebrow">06 / LIBTV STUDIO</p><h2>{t('LibTV studio')}</h2><small>{account || t('Not connected')} · {target?.name ?? t('No canvas linked')}</small></div><div className="toolbar-group"><button className="btn" onClick={() => setConnection(true)}>{t(account ? 'Account and connection' : 'Sign in to LibTV')}</button><select aria-label={t('Workspace')} value={workspace} onChange={event => setWorkspace(event.target.value)}><option value="">{t('All workspaces')}</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="btn canvas-picker-trigger" onClick={() => setCanvasPicker(true)}>{target?.name ?? t('Select canvas')} ⌄</button><button className="btn" onClick={() => setCreate(true)}>{t('New canvas')}</button><button className="icon-button" title={t('Refresh')} aria-label={t('Refresh')} disabled={busy} onClick={() => void run(async () => { await loadNavigation(true); await refresh() })}>↻</button>{target && <button className="btn" onClick={() => void window.sbr.openExternal(`https://www.liblib.tv/canvas?projectId=${encodeURIComponent(target.projectId)}`)}>{t('Open canvas')} ↗</button>}</div></header>
    {(error || graph?.stale || stale) && <div className="workspace-notice" role="status">{error || t('Showing cached data. Refresh before changing the cloud canvas.')} <button className="text-button" onClick={() => setConnection(true)}>{t('Connection help')}</button></div>}
    {cacheTime > 0 && <small className="canvas-cache-time">{t('Canvas list updated')} {new Date(cacheTime).toLocaleTimeString()}</small>}
    <DockLayout name="libtv" panels={[{ id: 'navigation', title: 'Canvas and media', content: navigation }, { id: 'canvas', title: 'Canvas', content: canvas }, { id: 'properties', title: 'Properties', content: inspector }, { id: 'tasks', title: 'Tasks and results', content: <LibTVTasks active={active} revision={revision} onLocate={locate} /> }]} />
    {nodeMenu && <ContextMenu x={nodeMenu.x} y={nodeMenu.y} onClose={() => setNodeMenu(null)}>{(['image', 'video'] as const).map(type => <button role="menuitem" key={type} onClick={() => { if (!target) { setConnection(true); setNodeMenu(null); return } const point = nodeMenu; setNodeMenu(null); void run(async () => { const result = await window.sbr.libtvCreateNode(target.projectId, type, point.worldX, point.worldY); setGraph(result.graph); setSelected(result.node) }) }}>{t(type === 'image' ? 'Image' : 'Video')}</button>)}</ContextMenu>}
    {connection && <Dialog title={t('Account and connection')} onClose={() => { setConnection(false); void loadNavigation().catch(error => setError(errorMessage(error))) }} wide><LibTVConnection /></Dialog>}
    {canvasPicker && <Dialog title={t('Select canvas')} onClose={() => setCanvasPicker(false)} wide><SearchControl label="Search canvases" value={canvasSearch} onChange={setCanvasSearch} initiallyOpen /><div className="canvas-picker-grid">{canvases.filter(item => item.name.toLowerCase().includes(canvasSearch.toLowerCase())).map(item => <button className={`canvas-picker-card ${target?.projectId === item.id ? 'selected' : ''}`} key={item.id} disabled={busy} onClick={() => void run(async () => { await window.sbr.libtvVerify(item.id); useStore.getState().mutate('bind LibTV canvas', doc => { doc.settings.libtv = { projectId: item.id, name: item.name } }); setCanvasPicker(false) })}><span>▧</span><strong>{item.name}</strong><small>{item.id.slice(0, 12)}</small></button>)}</div>{moreCanvases && <button className="btn" onClick={() => void run(async () => { const next = await window.sbr.libtvCanvases(workspace || undefined, canvasPage + 1); setCanvases(previous => [...previous, ...next.filter(item => !previous.some(old => old.id === item.id))]); setCanvasPage(value => value + 1); setMoreCanvases(next.length === 50) })}>{t('Load more')}</button>}</Dialog>}
    {create && <Dialog title={t('New canvas')} onClose={() => setCreate(false)}><label className="field">{t('Canvas name')}<input value={newName} onChange={event => setNewName(event.target.value)} /></label><button className="btn primary" disabled={!newName.trim() || busy} onClick={() => void run(async () => { const created = await window.sbr.libtvCreateCanvas(newName, workspace || undefined); useStore.getState().mutate('create LibTV canvas', doc => { doc.settings.libtv = { projectId: created.id, name: created.name } }); setCreate(false); setNewName(''); await loadNavigation(true) })}>{t('Create')}</button></Dialog>}
    {deleteNode && target && <Dialog title={t('Delete node')} onClose={() => setDeleteNode(null)}><p>{t('Delete this cloud node and all its connections? Local project undo cannot restore it.')}</p><p>{deleteNode.name}</p><button className="btn danger" disabled={busy} onClick={() => void run(async () => { setGraph(await window.sbr.libtvDeleteNode(target.projectId, deleteNode.id)); setDeleteNode(null); setSelected('') })}>{t('Delete')}</button></Dialog>}
    {preview && <Dialog title={preview.name} onClose={() => setPreview(null)} wide>{preview.type === 'video' ? <video className="libtv-result-preview" controls src={preview.url} /> : <img className="libtv-result-preview" src={preview.url} alt={preview.name} />}</Dialog>}
  </div>
}
