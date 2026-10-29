import { SearchControl } from '../components/SearchControl'
import { t } from '@shared/i18n'
/**
 * Left rail: the media bin. Import (file dialog) + Paste (clipboard PNG),
 * thumbnails, click to open in the viewer.
 */

import { useCallback, useEffect, useState } from 'react'
import { useStore, currentProjectJson } from '../store'
import { useMediaUrl } from '../lib/useMediaUrl'
import { newId } from '@shared/schema'
import { Dialog } from '../components/Controls'
import type { MediaItem } from '@shared/types'

const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac']

function isAudioPath(p: string): boolean {
  const ext = p.toLowerCase().split('.').pop() ?? ''
  return AUDIO_EXTS.includes(ext)
}

function BinItem({
  item,
  selected,
  onSelect,
  onMenu
}: {
  item: MediaItem
  selected: boolean
  onMenu(event: React.MouseEvent | React.KeyboardEvent): void
  onSelect(event: React.MouseEvent): void
}): JSX.Element {
  const url = useMediaUrl(item)
  const active = useStore((s) => s.selectedMediaId === item.id)
  const dims = item.width && item.height ? `${item.width}×${item.height}` : '—'
  const dur = item.durationS ? ` · ${item.durationS.toFixed(1)}s` : ''
  return (
    <div
      draggable
      onDragStart={(event) => event.dataTransfer.setData('application/framebook-media', item.id)}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onMenu(event)
        if (event.key === 'Enter') useStore.getState().selectMedia(item.id)
      }}
      className={`bin-item ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
      onContextMenu={onMenu}
      onClick={onSelect}
    >
      {item.kind === 'video' ? (
        url ? (
          <video className="bin-thumb" src={url} muted preload="metadata" />
        ) : (
          <div className="bin-thumb" />
        )
      ) : url ? (
        <img className="bin-thumb" src={url} alt={item.name} />
      ) : (
        <div className="bin-thumb" />
      )}
      <div className="bin-meta">
        <div className="bin-name" title={item.name}>
          {item.name}
        </div>
        <div className="bin-sub">
          {dims}
          {dur}
        </div>
        <div className="bin-kind">
          {t(item.kind.toUpperCase())} {item.externalPath && '↗'}
          {!url && item.externalPath && (
            <button
              className="text-button"
              onClick={async (event) => {
                event.stopPropagation()
                const paths = await window.sbr.importMediaDialog()
                if (!paths[0]) return
                try {
                  const imported = await window.sbr.importMedia(
                    useStore.getState().projectFolder!,
                    paths[0]
                  )
                  useStore.getState().mutate('relink media', (doc) => {
                    const media = doc.media.find((media) => media.id === item.id)
                    if (media) Object.assign(media, imported)
                  })
                  useStore.setState({ stills: {} })
                } catch (error) {
                  useStore.getState().toast(String(error), 'error')
                }
              }}
            >
              {t('Relink')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function MediaBin(): JSX.Element {
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null)
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [orientation, setOrientation] = useState('all')
  const [storage, setStorage] = useState('all')
  const [kind, setKind] = useState<'all' | 'video' | 'image'>('all')
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [grid, setGrid] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [folderDialog, setFolderDialog] = useState<{ id?: string; name: string } | null>(null)
  const doc = useStore((s) => s.doc)
  const folder = useStore((s) => s.projectFolder)
  const addMedia = useStore((s) => s.addMedia)
  const setAudioFile = useStore((s) => s.setAudioFile)
  const audioFile = useStore((s) => s.doc?.settings.audioFile ?? null)
  const toast = useStore((s) => s.toast)

  // Remember the scratch track so the bin row can toggle it on/off without
  // losing the copied file (audioFile is the *active* animatic track).
  const [scratch, setScratch] = useState<{ sourceFile: string; name: string } | null>(null)
  useEffect(() => {
    if (audioFile) {
      setScratch((prev) =>
        prev && prev.sourceFile === audioFile
          ? prev
          : { sourceFile: audioFile, name: audioFile.split(/[/\\]/).pop() ?? audioFile }
      )
    }
  }, [audioFile])

  const onImport = useCallback(async () => {
    if (!folder) return
    const paths = await window.sbr.importMediaDialog()
    if (!paths.length) return
    let audioCount = 0
    let mediaCount = 0
    for (const p of paths) {
      try {
        if (isAudioPath(p)) {
          const a = await window.sbr.importAudio(folder, p)
          setScratch(a)
          setAudioFile(a.sourceFile)
          audioCount++
        } else {
          const imported = await window.sbr.importMedia(folder, p)
          addMedia({ ...imported, folderId: currentFolder ?? undefined })
          mediaCount++
        }
      } catch (e) {
        toast(t('Operation failed: {error}', { error: (e as Error).message }), 'error')
      }
    }
    const json = currentProjectJson()
    if (json) await window.sbr.saveProject(folder, json)
    if (mediaCount) toast(t('Imported {count} files.', { count: mediaCount }), 'success')
    if (audioCount) toast(t('Added scratch track.'), 'success')
  }, [folder, addMedia, setAudioFile, toast, currentFolder])

  const toggleScratch = useCallback(() => {
    if (!scratch) return
    setAudioFile(audioFile === scratch.sourceFile ? null : scratch.sourceFile)
    const json = currentProjectJson()
    if (json && folder) void window.sbr.saveProject(folder, json)
  }, [scratch, audioFile, setAudioFile, folder])

  const onPaste = useCallback(async () => {
    if (!folder) return
    try {
      const items = await navigator.clipboard.read()
      let n = 0
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        const blob = await it.getType(type)
        const buf = await blob.arrayBuffer()
        const imported = await window.sbr.pasteImage(folder, buf, ++n)
        addMedia(imported)
      }
      if (n === 0) {
        toast(t('No image found on the clipboard.'), 'error')
        return
      }
      const json = currentProjectJson()
      if (json) await window.sbr.saveProject(folder, json)
      toast(t('Pasted {count} images.', { count: n }), 'success')
    } catch (e) {
      toast(t('Operation failed: {error}', { error: (e as Error).message }), 'error')
    }
  }, [folder, addMedia, toast])

  useEffect(() => {
    const paste = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'v' &&
        !target.closest('input,textarea,[contenteditable="true"]')
      ) {
        event.preventDefault()
        void onPaste()
      }
    }
    window.addEventListener('keydown', paste)
    return () => window.removeEventListener('keydown', paste)
  }, [onPaste])

  const folders = doc?.mediaFolders ?? []
  const current = folders.find((item) => item.id === currentFolder)
  const trail: typeof folders = []
  let ancestor = current
  const visited = new Set<string>()
  while (ancestor && !visited.has(ancestor.id)) {
    visited.add(ancestor.id)
    trail.unshift(ancestor)
    ancestor = folders.find((item) => item.id === ancestor?.parentId)
  }
  const moveMedia = (ids: string[], target: string | null): void => {
    useStore.getState().mutate('move media to folder', (project) => {
      for (const item of project.media)
        if (ids.includes(item.id)) item.folderId = target ?? undefined
    })
    setSelected([])
  }
  const visibleMedia = doc?.media.filter((item) =>
    (kind === 'all' || item.kind === kind) &&
    (orientation === 'all' || (orientation === 'landscape' ? item.width > item.height : orientation === 'portrait' ? item.height > item.width : item.width === item.height)) &&
    (storage === 'all' || (storage === 'external') === !!item.externalPath) &&
    (search ? item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) : (item.folderId ?? null) === currentFolder)
  ) ?? []
  return (
    <div className="bin panel" data-import-folder={currentFolder ?? ''}>
      <div className="bin-actions">
        <button className="btn primary media-import" onClick={onImport}>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" />
          </svg>
          {t('Import')}
        </button>
      </div>
      <div className="media-filters">
        <button className={filterOpen || kind !== 'all' || orientation !== 'all' || storage !== 'all' ? 'active' : ''} aria-label={t('Filter media')} title={t('Filter media')} onClick={() => setFilterOpen(!filterOpen)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 4h18l-7 8v7l-4 2v-9z" /></svg></button>
        <div className="media-view-switch" role="group" aria-label={t('View')}>
          <button aria-pressed={grid} title={t('Thumbnails')} aria-label={t('Thumbnails')} onClick={() => setGrid(true)}>▦</button>
          <button aria-pressed={!grid} title={t('List')} aria-label={t('List')} onClick={() => setGrid(false)}>☷</button>
        </div>
      </div>
      {filterOpen && <div className="media-filter-panel">
        <label>{t('Type')}<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{['all','video','image'].map((v) => <option key={v} value={v}>{t({all:'All',video:'Videos',image:'Images'}[v]!)}</option>)}</select></label>
        <label>{t('Orientation')}<select value={orientation} onChange={(e) => setOrientation(e.target.value)}>{['all','landscape','portrait','square'].map((v) => <option key={v} value={v}>{t(v)}</option>)}</select></label>
        <label>{t('Storage')}<select value={storage} onChange={(e) => setStorage(e.target.value)}>{['all','internal','external'].map((v) => <option key={v} value={v}>{t(v)}</option>)}</select></label>
        <button className="text-button" onClick={() => { setKind('all'); setOrientation('all'); setStorage('all') }}>{t('Clear filters')}</button>
      </div>}
      <SearchControl label="Search media" value={search} onChange={setSearch} />
      <div
        className="media-breadcrumb"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const id = event.dataTransfer.getData('application/framebook-media')
          if (id) moveMedia(selected.includes(id) ? selected : [id], current?.parentId ?? null)
        }}
      >
        <button className="text-button" onClick={() => setCurrentFolder(null)}>
          {t('Media bin')}
        </button>
        {trail.map((item) => (
          <button className="text-button" key={item.id} onClick={() => setCurrentFolder(item.id)}>
            {' '}
            / {item.name}
          </button>
        ))}
      </div>
      <div className="media-folder-tools">
        <button
          className="icon-button"
          title={t('New folder')}
          aria-label={t('New folder')}
          onClick={() => setFolderDialog({ name: '' })}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 6h7l2 3h9v12H3zM15 11v7m-3-3h6" />
          </svg>
        </button>
        {current && (
          <>
            <button
              className="text-button"
              onClick={() => setFolderDialog({ id: current.id, name: current.name })}
            >
              {t('Rename')}
            </button>
            <button
              className="text-button"
              onClick={() => {
                useStore.getState().mutate('remove media folder', (project) => {
                  for (const item of project.media)
                    if (item.folderId === current.id) item.folderId = current.parentId ?? undefined
                  for (const item of project.mediaFolders)
                    if (item.parentId === current.id) item.parentId = current.parentId
                  project.mediaFolders = project.mediaFolders.filter(
                    (item) => item.id !== current.id
                  )
                })
                setCurrentFolder(current.parentId)
              }}
            >
              {t('Delete folder')}
            </button>
          </>
        )}
      </div>
      <div className="hint media-result-count">{visibleMedia.length} {t('results')}</div>
      {!!selected.length && (
        <div className="media-selection">
          <span>
            {selected.length} {t('selected')}
          </span>
          <select
            aria-label={t('Move to folder')}
            value=""
            onChange={(event) => {
              if (event.target.value)
                moveMedia(selected, event.target.value === 'root' ? null : event.target.value)
            }}
          >
            <option value="">{t('Move to folder')}</option>
            <option value="root">{t('Media bin')}</option>
            {folders.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button className="text-button" onClick={() => setSelected([])}>
            {t('Clear')}
          </button>
        </div>
      )}
      <div className={`bin-list ${grid ? 'media-grid' : ''}`}>
        {folders
          .filter(
            (item) =>
              item.parentId === currentFolder &&
              (!search || item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
          )
          .map((item) => (
            <button
              className="media-folder"
              key={item.id}
              onClick={() => {
                setCurrentFolder(item.id)
                setSelected([])
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.stopPropagation()
                const id = event.dataTransfer.getData('application/framebook-media')
                if (id) moveMedia(selected.includes(id) ? selected : [id], item.id)
              }}
            >
              <span>▰</span>
              <strong>{item.name}</strong>
              <small>{doc?.media.filter((media) => media.folderId === item.id).length}</small>
            </button>
          ))}
        {(doc?.media.length ?? 0) === 0 ? (
          <div className="hint" style={{ padding: 8 }}>
            {t(
              'Import videos, images, or an audio scratch track — or paste a screenshot — to start.'
            )}
          </div>
        ) : (
          visibleMedia
            .map((m) => (
              <BinItem
                key={m.id}
                item={m}
                onMenu={(event) => {
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  setContext({ id: m.id, x: 'clientX' in event ? event.clientX : rect.left, y: 'clientY' in event ? event.clientY : rect.bottom })
                }}
                selected={selected.includes(m.id)}
                onSelect={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey)
                    setSelected((previous) =>
                      previous.includes(m.id)
                        ? previous.filter((id) => id !== m.id)
                        : [...previous, m.id]
                    )
                  else {
                    setSelected([m.id])
                    useStore.getState().selectMedia(m.id)
                  }
                }}
              />
            ))
        )}
        {scratch && (
          <div
            className={`bin-item scratch ${audioFile === scratch.sourceFile ? 'active' : ''}`}
            onClick={toggleScratch}
            title={t('Click to set / unset as the animatic scratch track')}
          >
            <div className="bin-thumb scratch-thumb">♪</div>
            <div className="bin-meta">
              <div className="bin-name" title={scratch.name}>
                {scratch.name}
              </div>
              <div className="bin-sub">
                {audioFile === scratch.sourceFile ? t('scratch track') : t('audio (off)')}
              </div>
              <div className="bin-kind">{t('AUDIO')}</div>
            </div>
          </div>
        )}
      </div>
      {context && <div className="context-shield" onClick={() => setContext(null)} onContextMenu={(e) => { e.preventDefault(); setContext(null) }}>
        <div className="floating-menu media-context" role="menu" style={{left: Math.max(8, Math.min(context.x, window.innerWidth - 260)), top: Math.max(8, Math.min(context.y, window.innerHeight - 340))}} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if(e.key === 'Escape') setContext(null); if(e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const items=[...e.currentTarget.querySelectorAll<HTMLElement>('button,select')];const index=items.indexOf(document.activeElement as HTMLElement);items[(index+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus() } }}>
          <button autoFocus onClick={() => { useStore.getState().selectMedia(context.id); setContext(null) }}>{t('Open preview')}</button>
          <button onClick={() => { const item = doc!.media.find((m) => m.id === context.id)!; setRename({id:item.id,name:item.name}); setContext(null) }}>{t('Rename')}</button>
          <button onClick={() => { useStore.getState().mutate('duplicate media', (project) => { const item = project.media.find((m) => m.id === context.id); if(item) project.media.push({...item,id:newId('media'),name:`${item.name} ${t('Copy')}`}) }); setContext(null) }}>{t('Duplicate')}</button>
          <select aria-label={t('Move to folder')} value="" onChange={(e) => { if(e.target.value) { moveMedia([context.id], e.target.value === 'root' ? null : e.target.value); setContext(null) } }}><option value="">{t('Move to folder')}</option><option value="root">{t('Media bin')}</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <button onClick={() => { const item = doc!.media.find((m) => m.id === context.id)!; const json = currentProjectJson(); if(json) void window.sbr.saveProject(folder!,json).then(() => window.sbr.revealMedia(folder!, item.id)).catch((e) => toast(String(e),'error')); setContext(null) }}>{t('Show in Finder')}</button>
          <button onClick={async () => { const id=context.id;setContext(null);const paths=await window.sbr.importMediaDialog();if(!paths[0] || !folder) return;try { const replacement=await window.sbr.importMedia(folder,paths[0]);const original=doc!.media.find((m) => m.id===id)!;if(replacement.kind!==original.kind) throw new Error(t('Choose the same media type.'));useStore.getState().mutate('relink media',(p) => {for(const item of p.media) if(item.sourceFile===original.sourceFile && item.externalPath===original.externalPath) Object.assign(item,replacement)});useStore.setState({stills:{}}) } catch(e) {toast(String(e),'error')} }}>{t('Relink')}</button>
          <button onClick={() => { const item = doc!.media.find((m) => m.id === context.id)!; window.dispatchEvent(new CustomEvent('libtv-upload', {detail:{mediaIds:[item.id]}})); setContext(null) }}>{t('Upload to LibTV')}</button>
          <button onClick={() => {
            const state = useStore.getState(); const project = state.doc!
            const count = project.frames.filter((f) => f.mediaId === context.id).length + project.storyboard.shots.filter((shot) => Object.values(shot.cells).some((cell) => Array.isArray(cell) && cell.some((image) => typeof image === 'object' && image !== null && 'frame' in image && image.frame.mediaId === context.id))).length
            if(count) toast(t('Media is referenced by {count} items.',{count}), 'error')
            else { state.mutate('remove media', (p) => { p.media = p.media.filter((m) => m.id !== context.id) }); setSelected((ids) => ids.filter((id) => id !== context.id)); if(state.selectedMediaId === context.id) state.selectMedia(null) }
            setContext(null)
          }}>{t('Remove from project')}</button>
        </div>
      </div>}
      {rename && <Dialog title={t('Rename')} onClose={() => setRename(null)}><form onSubmit={(e) => { e.preventDefault(); if(!rename.name.trim()) return; useStore.getState().mutate('rename media', (p) => { const item = p.media.find((m) => m.id === rename.id); if(item) item.name = rename.name.trim() }); setRename(null) }}><input autoFocus value={rename.name} onChange={(e) => setRename({...rename,name:e.target.value})} /><button className="btn primary" disabled={!rename.name.trim()}>{t('Save')}</button></form></Dialog>}
      {folderDialog && (
        <Dialog
          title={t(folderDialog.id ? 'Rename folder' : 'New folder')}
          onClose={() => setFolderDialog(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!folderDialog.name.trim()) return
              useStore.getState().mutate('edit media folder', (project) => {
                const existing = project.mediaFolders.find((item) => item.id === folderDialog.id)
                if (existing) existing.name = folderDialog.name.trim()
                else
                  project.mediaFolders.push({
                    id: newId('folder'),
                    name: folderDialog.name.trim(),
                    parentId: currentFolder
                  })
              })
              setFolderDialog(null)
            }}
          >
            <label className="field">
              {t('Folder name')}
              <input
                required
                value={folderDialog.name}
                onChange={(event) => setFolderDialog({ ...folderDialog, name: event.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button className="btn primary" disabled={!folderDialog.name.trim()}>
                {t('Save')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
