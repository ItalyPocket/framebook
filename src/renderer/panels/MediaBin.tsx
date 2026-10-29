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
  onSelect
}: {
  item: MediaItem
  selected: boolean
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
        if (event.key === 'Enter') useStore.getState().selectMedia(item.id)
      }}
      className={`bin-item ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
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
  return (
    <div className="bin panel" data-import-folder={currentFolder ?? ''}>
      <div className="bin-actions">
        <button className="btn small" onClick={onImport}>
          {t('＋ Import')}
        </button>
        <button className="btn small" onClick={onPaste}>
          {t('⧉ Paste')}
        </button>
      </div>
      <div className="media-filters">
        {(['all', 'video', 'image'] as const).map((value) => (
          <button
            key={value}
            className={kind === value ? 'active' : ''}
            onClick={() => setKind(value)}
          >
            {t({ all: 'All', video: 'Videos', image: 'Images' }[value])}
          </button>
        ))}
        <button aria-label={t('Toggle media view')} onClick={() => setGrid(!grid)}>
          {grid ? '☷' : '▦'}
        </button>
      </div>
      <input
        className="media-search"
        aria-label={t('Search media')}
        placeholder={t('Search media')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
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
        <button className="text-button" onClick={() => setFolderDialog({ name: '' })}>
          {t('New folder')}
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
          doc!.media
            .filter(
              (item) =>
                (kind === 'all' || item.kind === kind) &&
                (search
                  ? item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
                  : (item.folderId ?? null) === currentFolder)
            )
            .map((m) => (
              <BinItem
                key={m.id}
                item={m}
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
