import { FrameContext } from '../components/FrameContext'
import { t } from '@shared/i18n'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, currentProjectJson } from '../store'
import { useAbsUrl } from '../lib/useMediaUrl'
import { ensureStill, buildExportInputs, audioAbsPath } from '../lib/frameOps'
import { renderAnnotationsSvg } from '@shared/annotations'
import type { Frame } from '@shared/types'

function BoardCard({ frame, index }: { frame: Frame; index: number }): JSX.Element {
  const active = useStore((s) => s.selectedFrameId === frame.id)
  const still = useStore((s) => s.stills[frame.id])
  const removeFrame = useStore((s) => s.removeFrame)
  const reorderFrame = useStore((s) => s.reorderFrame)
  const folder = useStore((s) => s.projectFolder)
  const [context,setContext]=useState<{x:number;y:number} | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const url = useAbsUrl(still?.path ?? null)

  const onRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (frame.prompt && frame.prompt.text) {
        if (!window.confirm(t("Remove this frame and its saved data?"))) return
      }
      removeFrame(frame.id)
      const json = currentProjectJson()
      if (json && folder) void window.sbr.saveProject(folder, json)
    },
    [frame, removeFrame, folder]
  )

  return (
    <div
      className={`board-card ${active ? 'active' : ''} ${dragOver ? 'drag-over' : ''}`}
      draggable
      tabIndex={0}
      onContextMenu={(event) => {event.preventDefault();setContext({x:event.clientX,y:event.clientY})}}
      onKeyDown={(event) => {if(event.key==='ContextMenu' || (event.shiftKey && event.key==='F10')) {event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();setContext({x:rect.left,y:rect.bottom})}}}
      onClick={() => useStore.setState({selectedFrameId:frame.id,selectedMediaId:frame.mediaId,viewMode:'clip',seekTime:frame.timeS})}
      onDragStart={(e) => e.dataTransfer.setData('text/frame-id', frame.id)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = e.dataTransfer.getData('text/frame-id')
        if (id && id !== frame.id) {
          reorderFrame(id, index)
          const json = currentProjectJson()
          if (json && folder) void window.sbr.saveProject(folder, json)
        }
      }}
    >
      {context && <FrameContext frame={frame} point={context} onClose={() => setContext(null)} />}
      <button className="board-card-del" onClick={onRemove} title={t("Remove (⌫)")}>✕</button>
      <div className="board-card-thumb-wrap">
        {url ? <img className="board-card-thumb" src={url} alt={frame.label} /> : <div className="board-card-thumb" />}
        {frame.annotations.length > 0 && still && (
          <div
            className="board-card-anno"
            dangerouslySetInnerHTML={{ __html: renderAnnotationsSvg(frame, still.width, still.height) }}
          />
        )}
        <span className="board-card-dur">{frame.durationS.toFixed(1)}s</span>
      </div>
      <div className="board-card-body">
        <div className="board-card-label" title={frame.label}>{frame.label || t("(untitled)")}</div>
        <div className="board-card-meta">
          <span className="board-index">{String(index + 1).padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  )
}

export function Board(): JSX.Element {
  // Select the raw array (stable ref) and sort in a memo — returning a fresh
  // array from the selector would loop React (new ref every render).
  const rawFrames = useStore((s) => s.doc?.frames)
  const frames = useMemo(() => [...(rawFrames ?? [])].sort((a, b) => a.order - b.order), [rawFrames])
  const folder = useStore((s) => s.projectFolder)
  const projectName = useStore((s) => s.doc?.name ?? t("Storyboard"))
  const setPresentOpen = useStore((s) => s.setPresentOpen)
  const toast = useStore((s) => s.toast)
  const [exporting, setExporting] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportMenu) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setExportMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [exportMenu])

  const runExport = useCallback(
    async (kind: 'board' | 'animatic' | 'pdf' | 'shotlist') => {
      if (!folder || frames.length === 0) return
      setExportMenu(false)
      setExporting(true)
      try {
        for (const f of frames) await ensureStill(f.id)
        const inputs = await buildExportInputs()
        const exportsRoot = `${folder}${folder.includes('\\') ? '\\' : '/'}exports`
        const payload = { projectName, exportsRoot, frames: inputs }
        if (kind === 'board') {
          const res = await window.sbr.exportBoard(payload)
          toast(res.ok ? t("Board exported — revealed in Finder.") : t('Operation failed: {error}', { error: res.error ?? '' }), res.ok ? 'success' : 'error')
        } else if (kind === 'animatic') {
          const res = await window.sbr.exportAnimatic(payload, { burnLabel: true, audioPath: audioAbsPath() })
          toast(res.ok ? t("Animatic exported — revealed in Finder.") : t('Operation failed: {error}', { error: res.error ?? '' }), res.ok ? 'success' : 'error')
        } else if (kind === 'pdf') {
          const res = await window.sbr.exportPdf(payload)
          toast(res.ok ? t("PDF exported — revealed in Finder.") : t('Operation failed: {error}', { error: res.error ?? '' }), res.ok ? 'success' : 'error')
        } else {
          const res = await window.sbr.exportShotlist(payload)
          toast(res.ok ? t("Shot list exported — revealed in Finder.") : t('Operation failed: {error}', { error: res.error ?? '' }), res.ok ? 'success' : 'error')
        }
      } catch (error) {
        toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error')
      } finally {
        setExporting(false)
      }
    },
    [folder, frames, projectName, toast]
  )

  const onExport = useCallback(() => runExport('board'), [runExport])

  return (
    <div className="board">
      <div className="board-bar">
        <span className="panel-title" style={{ margin: 0 }}>{t("Frame gallery")}</span>
        <span className="board-count">{frames.length} {t("frames")}</span>
<button className="btn small" onClick={() => useStore.getState().setWorkspace('gallery')}>{t('Open gallery')} ↗</button>
        <button className="btn small" disabled={!frames.length} onClick={() => window.dispatchEvent(new CustomEvent('libtv-upload',{detail:{frameIds:frames.map((frame) => frame.id)}}))}>{t('Upload to LibTV')}</button>
        <div style={{ flex: 1 }} />
        <button className="btn small" onClick={() => setPresentOpen(true)} disabled={frames.length === 0} title={t("Present / play the board (P)")}>
          {t("▶ Present")}</button>

        <button className="btn small primary" onClick={onExport} disabled={exporting || frames.length === 0}>
          {exporting ? t("Exporting…") : t("Export board")}
        </button>
        <div className="export-menu-wrap" ref={menuRef}>
          <button className="btn small" onClick={() => setExportMenu((v) => !v)} disabled={exporting || frames.length === 0} title={t("More export formats")}>
            {t("Export ▾")}</button>
          {exportMenu && (
            <div className="export-menu">
              <button onClick={() => runExport('board')}>{t("Board package")}</button>
              <button onClick={() => runExport('animatic')}>{t("Animatic (MP4)")}</button>
              <button onClick={() => runExport('pdf')}>{t("PDF storyboard")}</button>
              <button onClick={() => runExport('shotlist')}>{t("Shot list (CSV)")}</button>
            </div>
          )}
        </div>
      </div>
      <div className="board-strip">
        {frames.length === 0 ? (
          <div className="board-empty">
            {t("Bookmark frames from a clip, add images, or Auto-board a section — they land here as cards.")}</div>
        ) : (
          frames.map((f, i) => <BoardCard key={f.id} frame={f} index={i} />)
        )}
      </div>
    </div>
  )
}
