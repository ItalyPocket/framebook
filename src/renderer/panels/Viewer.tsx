import { RelinkMedia } from '../components/RelinkMedia'
import { FrameMarkers } from '../components/FrameMarkers'
import { t } from '@shared/i18n'
/**
 * Center panel: the viewer. For a video — an HTML5 player with a custom
 * transport (frame step, scrub bar with draggable IN/OUT handles, time
 * readout), a Bookmark-frame button, and Auto-board (scene / interval / count
 * extraction into board frames). For an image — shown directly with Add to board.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore, currentProjectJson } from '../store'
import { useMediaUrl } from '../lib/useMediaUrl'
import { FrameStage } from './FrameStage'
import { ArtComposition } from '../components/ArtComposition'
import type { MediaItem } from '@shared/types'
import type { RangeMode } from '../../preload/index'

function fmt(t: number): string {
  if (!isFinite(t)) return '0:00.0'
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function ImageViewer({ media }: { media: MediaItem }): JSX.Element {
  const url = useMediaUrl(media)
  const addFrame = useStore((s) => s.addFrame)
  const toast = useStore((s) => s.toast)
  const folder = useStore((s) => s.projectFolder)
  const onAdd = useCallback(async () => {
    addFrame(media.id, 0, media.name.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 40))
    const json = currentProjectJson()
    if (json && folder) await window.sbr.saveProject(folder, json)
    toast(t("Added image to the board."), 'success')
  }, [media, addFrame, toast, folder])
  return (
    <div className="viewer">
      <div className="viewer-stage">{url ? <img src={url} alt={media.name} /> : null}</div>
      <div className="transport">
        <span className="time">{media.width}×{media.height}</span>
        <div style={{ flex: 1 }} />
        <button className="btn small primary" onClick={onAdd}>{t("＋ Add to board")}</button>
      </div>
    </div>
  )
}

export function VideoViewer({ media, workspace = 'capture' }: { media: MediaItem; workspace?: 'capture' | 'gallery' }): JSX.Element {
  const url = useMediaUrl(media)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(media.durationS ?? 0)
  const [playing, setPlaying] = useState(false)
  const [inS, setInS] = useState(0)
  const [outS, setOutS] = useState(media.durationS ?? 0)
  const [autoOpen, setAutoOpen] = useState(false)
  const seekTime = useStore((s) => s.seekTime)
  const activeWorkspace = useStore((s) => s.workspace)
  useEffect(() => {
    const video = videoRef.current
    if (activeWorkspace !== workspace || seekTime === null || !video || video.readyState < 1) return
    video.pause()
    setPlaying(false)
    video.currentTime = Math.max(0, Math.min(seekTime, video.duration || 0))
    setTime(video.currentTime)
    useStore.setState({ seekTime: null })
  }, [seekTime, media.id, activeWorkspace, workspace, url])
  useEffect(() => { if(activeWorkspace !== workspace) { videoRef.current?.pause(); setPlaying(false) } },[activeWorkspace, workspace])
  const fps = media.fps && media.fps > 1 ? media.fps : 24

  const addFrame = useStore((s) => s.addFrame)
  const toast = useStore((s) => s.toast)
  const folder = useStore((s) => s.projectFolder)

  useEffect(() => {
    setInS(0)
    setOutS(media.durationS ?? 0)
    setTime(0)
  }, [media.id])

  const step = useCallback((frames: number) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    setPlaying(false)
    v.currentTime = Math.max(0, Math.min(duration || v.duration || 0, v.currentTime + frames / fps))
  }, [duration, fps])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }, [])

  const bookmark = useCallback(async () => {
    const captureTime = Math.max(0, Math.min(videoRef.current?.currentTime ?? time, (duration || media.durationS || Infinity) - 1 / fps))
    addFrame(media.id, captureTime, t('SHOT @ {time}', { time: fmt(captureTime) }))
    const json = currentProjectJson()
    if (json && folder) await window.sbr.saveProject(folder, json)
    toast(t('Captured at {time}.', { time: fmt(captureTime) }), 'success')
  }, [media.id, media.durationS, duration, fps, time, addFrame, toast, folder])

  // Expose transport intent to the global keyboard map.
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>
    win.__sbrTransport = {
      togglePlay,
      step,
      bookmark,
      setIn: () => setInS(videoRef.current?.currentTime ?? time),
      setOut: () => setOutS(videoRef.current?.currentTime ?? time)
    }
    return () => {
      delete win.__sbrTransport
    }
  }, [togglePlay, step, bookmark, time])

  const dur = duration || media.durationS || 1
  const scrubRef = useRef<HTMLDivElement>(null)

  const seekFromClientX = useCallback((clientX: number) => {
    const el = scrubRef.current
    const v = videoRef.current
    if (!el || !v) return
    const rect = el.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = frac * dur
  }, [dur])

  const dragHandle = useCallback(
    (which: 'in' | 'out') => (e: React.MouseEvent) => {
      e.stopPropagation()
      const el = scrubRef.current
      if (!el) return
      const onMove = (ev: MouseEvent): void => {
        const rect = el.getBoundingClientRect()
        const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
        const t = frac * dur
        if (which === 'in') setInS(Math.min(t, outS))
        else setOutS(Math.max(t, inS))
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [dur, inS, outS]
  )

  return (
    <div className="viewer">
      <div className="viewer-stage">
        {url ? (
          <video
            ref={videoRef}
            src={url}
            onLoadedMetadata={(e) => {
              if (activeWorkspace === workspace && seekTime !== null) { e.currentTarget.currentTime = seekTime; useStore.setState({ seekTime: null }) }
              const d = e.currentTarget.duration
              setDuration(d)
              if (!media.durationS) setOutS(d)
            }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onEnded={() => setPlaying(false)}
          />
        ) : <RelinkMedia media={media} />}
      </div>
      <div className="transport">
        <button className="btn small" title={t("Frame back (←)")} onClick={() => step(-1)}>◀|</button>
        <button className="btn small" onClick={togglePlay} title={t("Play/Pause (Space)")}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="btn small" title={t("Frame forward (→)")} onClick={() => step(1)}>|▶</button>
        <span className="time">{fmt(time)} / {fmt(dur)} · {Math.round(fps)}fps</span>
        <div className="scrub" ref={scrubRef} onMouseDown={(e) => seekFromClientX(e.clientX)}>
          <div className="scrub-track" />
          <div className="scrub-inout" style={{ left: `${(inS / dur) * 100}%`, width: `${((outS - inS) / dur) * 100}%` }} />
          <div className="scrub-fill" style={{ width: `${(time / dur) * 100}%` }} />
          <FrameMarkers mediaId={media.id} duration={dur} />
          <div className="scrub-playhead" style={{ left: `${(time / dur) * 100}%` }} />
          <div className="scrub-handle in" style={{ left: `${(inS / dur) * 100}%` }} onMouseDown={dragHandle('in')} title={t("IN (I)")} />
          <div className="scrub-handle out" style={{ left: `${(outS / dur) * 100}%` }} onMouseDown={dragHandle('out')} title={t("OUT (O)")} />
        </div>
        <button className="btn small" onClick={() => setInS(time)} title={t("Set IN (I)")}>{t("IN")}</button>
        <button className="btn small" onClick={() => setOutS(time)} title={t("Set OUT (O)")}>{t("OUT")}</button>
        <button className="btn small primary" onClick={bookmark} title={t("Bookmark frame (B)")}>{t("📌 Bookmark")}</button>
        <button className="btn small" onClick={() => setAutoOpen(true)} title={t("Auto-board section")}>{t("▦ Auto-board")}</button>
      </div>
      {autoOpen && (
        <AutoBoardModal media={media} inS={inS} outS={outS} onClose={() => setAutoOpen(false)} />
      )}
    </div>
  )
}

function AutoBoardModal({
  media,
  inS,
  outS,
  onClose
}: {
  media: MediaItem
  inS: number
  outS: number
  onClose: () => void
}): JSX.Element {
  const [mode, setMode] = useState<'scene' | 'interval' | 'count'>('scene')
  const [threshold, setThreshold] = useState(0.35)
  const [everyS, setEveryS] = useState(2)
  const [count, setCount] = useState(6)
  const [running, setRunning] = useState(false)
  const folder = useStore((s) => s.projectFolder)
  const toast = useStore((s) => s.toast)
  const addFrame = useStore((s) => s.addFrame)
  const setStill = useStore((s) => s.setStill)

  const run = useCallback(async () => {
    const abs = useStore.getState().mediaAbsPath(media.id)
    if (!abs || !folder) return
    setRunning(true)
    try {
      const outDir = `${folder}${folder.includes('\\') ? '\\' : '/'}.frames`
      await window.sbr.ensureDir(outDir)
      const rangeMode: RangeMode =
        mode === 'scene'
          ? { kind: 'scene', threshold }
          : mode === 'interval'
            ? { kind: 'interval', everyS }
            : { kind: 'count', n: count }
      const res = await window.sbr.extractRange(abs, inS, outS, rangeMode, outDir)
      if (!res.ok) {
        toast(t('Operation failed: {error}', { error: res.error ?? '' }), 'error')
        setRunning(false)
        return
      }
      for (const { time, path } of res.frames) {
        const frame = addFrame(media.id, time, t('SHOT @ {time}', { time: fmt(time) }))
        // The extractRange output is already a full-res PNG we can reuse.
        setStill(frame.id, { path, width: media.width, height: media.height })
      }
      const json = currentProjectJson()
      if (json) await window.sbr.saveProject(folder, json)
      toast(t('Added {count} frames.', { count: res.frames.length }), 'success')
      onClose()
    } finally {
      setRunning(false)
    }
  }, [media, folder, mode, threshold, everyS, count, inS, outS, addFrame, setStill, toast, onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("Auto-board section")}</h2>
        <div className="modal-sub">
          {t("Extract frames from")}{fmt(inS)} {t("to")}{fmt(outS)} {t("and add them all to the board.")}</div>
        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={mode === 'scene' ? 'active' : ''} onClick={() => setMode('scene')}>{t("Scene detect")}</button>
          <button className={mode === 'interval' ? 'active' : ''} onClick={() => setMode('interval')}>{t("Every N sec")}</button>
          <button className={mode === 'count' ? 'active' : ''} onClick={() => setMode('count')}>{t("N frames")}</button>
        </div>
        {mode === 'scene' && (
          <div className="field">
            <label>{t("Sensitivity — lower finds more cuts (")}{threshold.toFixed(2)})</label>
            <input type="range" min={0.1} max={0.6} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>
        )}
        {mode === 'interval' && (
          <div className="field">
            <label>{t("Every N seconds")}</label>
            <input type="number" min={0.2} step={0.2} value={everyS} onChange={(e) => setEveryS(Number(e.target.value))} />
          </div>
        )}
        {mode === 'count' && (
          <div className="field">
            <label>{t("Number of evenly-spaced frames")}</label>
            <input type="number" min={1} step={1} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={running}>{t("Cancel")}</button>
          <button className="btn primary" onClick={run} disabled={running}>
            {running ? t("Extracting…") : t("Extract")}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Viewer(): JSX.Element {
  const selectedMediaId = useStore((s) => s.selectedMediaId)
  const media = useStore((s) => s.media(selectedMediaId))
  const viewMode = useStore((s) => s.viewMode)
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const selectedFrame = useStore((s) => s.frame(selectedFrameId))

  // Frame mode: the center stage shows the selected board card's full-res still
  // (crop overlay, guides, annotations). Clicking the clip in the bin or "back
  // to clip" returns to the video/image viewer.
  if (viewMode === 'frame' && selectedFrame) {
    return <FrameStage frame={selectedFrame} />
  }

  if (!media) {
    return (
      <div className="viewer">
        <div className="viewer-stage">
          <div className="viewer-empty">
            <ArtComposition/><div className="empty-frame-symbol" aria-hidden="true">⌗</div>
            {t("Select a clip or image from the bin to start pulling reference frames.")}</div>
        </div>
      </div>
    )
  }
  return media.kind === 'video' ? <VideoViewer media={media} /> : <ImageViewer media={media} />
}
