import { RelinkMedia } from '../components/RelinkMedia'
import { DockLayout } from '../components/DockLayout'
import { VideoViewer } from './Viewer'
import { useMediaUrl } from '../lib/useMediaUrl'
import type { ExportPreview } from '@shared/workspace'
import { ExportPreviewDialog } from '../components/ExportPreview'
import { useMemo, useState } from 'react'
import { t } from '@shared/i18n'
import { useStore } from '../store'
import { StillImage } from './StillImage'
import { ArtComposition } from '../components/ArtComposition'
import { buildExportInputs } from '../lib/frameOps'
import { Dialog, Menu, MenuItem, usePreference } from '../components/Controls'

export function Gallery(): JSX.Element {
  const previewId = useStore((s) => s.selectedFrameId)
  const previewFrame = useStore((s) => s.doc?.frames.find((frame) => frame.id === previewId))
  const previewMedia = useStore((s) => s.doc?.media.find((media) => media.id === previewFrame?.mediaId))
  const previewUrl = useMediaUrl(previewMedia ?? null)
  const [previewOpen, setPreviewOpen] = useState(true)
  const rawFrames = useStore((s) => s.doc?.frames)
  const frames = useMemo(
    () => [...(rawFrames ?? [])].sort((a, b) => a.order - b.order),
    [rawFrames]
  )
  const mode = useStore((s) => s.doc?.settings.gallerySort)
  const [selected, setSelected] = useState<string[]>([])
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null)
  const [exporting, setExporting] = useState(false)
  const [size, setSize] = usePreference('framebook.ui.gallerySize', '260', [
    '200',
    '260',
    '340'
  ] as const)
  const [removing, setRemoving] = useState<string | null>(null)
  const chosen = frames.filter((frame) => selected.includes(frame.id))
  const add = (grouped: boolean): void => {
    useStore.getState().addShots(
      chosen.map((frame) => frame.id),
      grouped
    )
    useStore.getState().setWorkspace('storyboard')
  }
  const importImages = async (): Promise<void> => {
    const s = useStore.getState()
    if (!s.projectFolder) return
    for (const path of await window.sbr.importImagesDialog()) {
      try {
        const item = await window.sbr.importMedia(s.projectFolder, path)
        const media = useStore.getState().addMedia(item)
        useStore.getState().addFrame(media.id, 0, item.name)
      } catch (error) {
        useStore
          .getState()
          .toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error')
      }
    }
  }
  const runExport = async (format: 'png' | 'jpg'): Promise<void> => {
    const s = useStore.getState()
    if (!s.projectFolder || !s.doc) return
    setExporting(true)
    try {
      const result = await window.sbr.preparePreview({
        frames: {
          projectName: s.doc.name,
          exportsRoot: `${s.projectFolder}/exports`,
          frames: await buildExportInputs(chosen.length ? chosen : frames)
        },
        format
      })
      setExportPreview(result)
    } catch (error) {
      s.toast(t('Operation failed: {error}', { error: (error as Error).message }), 'error')
    } finally {
      setExporting(false)
    }
  }
  return (
    <section className="gallery-workspace">
      {exportPreview && (
        <ExportPreviewDialog preview={exportPreview} onClose={() => setExportPreview(null)} />
      )}
      <ArtComposition />
      <header className="section-header">
        <div>
          <span className="eyebrow">02 / FRAME ARCHIVE</span>
          <h1>{t('Frame gallery')}</h1>
          <p>{t('Drag to arrange. Export in the order you see.')}</p>
        </div>
        <span className="big-count">{String(frames.length).padStart(3, '0')}</span>
      </header>
      <DockLayout name="gallery" panels={[
        { id:'preview',title:'Preview',content:previewMedia ? <section className="gallery-dock-preview">{previewOpen && (previewMedia.kind === 'video' ? <VideoViewer key={previewMedia.id} media={previewMedia} workspace="gallery" /> : previewUrl ? <img src={previewUrl} alt={previewMedia.name} /> : <RelinkMedia media={previewMedia} />)}</section> : <p className="hint">{t('Select a frame to preview its source.')}</p> },
        { id:'gallery',title:'Frame gallery',content:<>
      <div className="gallery-toolbar">
        <button className="btn" disabled={!frames.length} onClick={() => window.dispatchEvent(new CustomEvent('libtv-upload',{detail:{frameIds:(chosen.length?chosen:frames).map((f) => f.id)}}))}>{t('Upload to LibTV')}</button>
        <button className="btn primary" onClick={() => void importImages()}>
          {t('Import image')}
        </button>
        <button
          className="btn"
          onClick={() =>
            setSelected(chosen.length === frames.length ? [] : frames.map((frame) => frame.id))
          }
        >
          {t(chosen.length === frames.length && frames.length ? 'Deselect all' : 'Select all')}
        </button>
        <span>
          {chosen.length} {t('selected')}
        </span>
        <div className="spacer" />
        <label className="gallery-size">
          {t('Thumbnail size')}
          <select
            aria-label={t('Thumbnail size')}
            value={size}
            onChange={(event) => setSize(event.target.value as typeof size)}
          >
            <option value="200">{t('Small')}</option>
            <option value="260">{t('Medium')}</option>
            <option value="340">{t('Large')}</option>
          </select>
        </label>
        <span className="hint">{t(mode === 'time' ? 'Source time order' : 'Manual order')}</span>
        <button className="btn" onClick={() => useStore.getState().sortGallery()}>
          {t('Sort by source time')}
        </button>
      </div>
      <div
        className="gallery-grid"
        style={{ '--gallery-size': `${size}px` } as React.CSSProperties}
      >
        {!frames.length && (
          <div className="empty-editor">
            <h2>{t('Your next observation starts here.')}</h2>
            <p>{t('Capture a frame, then build your storyboard.')}</p>
            <button
              className="btn primary"
              onClick={() => useStore.getState().setWorkspace('capture')}
            >
              {t('Capture')}
            </button>
          </div>
        )}
        {frames.map((frame, index) => (
          <article
            className={`gallery-card ${selected.includes(frame.id) ? 'selected' : ''}`}
            key={frame.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/frame-id', frame.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/frame-id')
              if (id) useStore.getState().reorderFrame(id, index)
            }}
          >
            <div
              className="gallery-image"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('label, input, button')) return
                useStore.setState({ selectedFrameId: frame.id, selectedMediaId: frame.mediaId, seekTime: frame.timeS })
                setPreviewOpen(true)
              }}

            >
              <StillImage frame={frame} />
              <label className="gallery-check">
                <input
                  type="checkbox"
                  aria-label={`${t('Select')} ${index + 1}`}
                  checked={selected.includes(frame.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, frame.id]
                        : selected.filter((id) => id !== frame.id)
                    )
                  }
                />
              </label>
              <span className="image-index">{String(index + 1).padStart(3, '0')}</span>
            </div>
            <div className="gallery-caption">
              <input
                aria-label={t('Label')}
                value={frame.label}
                onChange={(e) => useStore.getState().setFrameLabel(frame.id, e.target.value)}
              />
              <span>{frame.timeS.toFixed(2)} s</span>
            </div>
            <div className="gallery-actions">
              <button
                className="btn small"
                disabled={!index}
                aria-label={t('Move up')}
                onClick={() => useStore.getState().reorderFrame(frame.id, index - 1)}
              >
                ←
              </button>
              <button
                className="btn small"
                disabled={index === frames.length - 1}
                aria-label={t('Move down')}
                onClick={() => useStore.getState().reorderFrame(frame.id, index + 1)}
              >
                →
              </button>
              <div className="spacer" />
              <button
                className="btn small"
                onClick={() => {
                  useStore.getState().selectFrame(frame.id)
                  useStore.getState().setWorkspace('capture')
                }}
              >
                {t('Edit')}
              </button>
              <button
                className="btn small danger"
                onClick={() => {
                  setRemoving(frame.id)
                }}
              >
                {t('Remove')}
              </button>
            </div>
          </article>
        ))}
      </div>
      <footer className="gallery-footer">
        {chosen.length > 0 && (
          <>
            <button className="btn primary" disabled={!chosen.length} onClick={() => add(false)}>
              {t('One frame per shot')}
            </button>
            <button className="btn" disabled={!chosen.length} onClick={() => add(true)}>
              {t('Combine into one shot')}
            </button>
          </>
        )}
        <div className="spacer" />
        <span className="hint">{t(chosen.length ? 'Export selected' : 'Export all')}</span>
        <Menu
          label={t(exporting ? 'Exporting…' : 'Export…')}
          disabled={!frames.length || exporting}
        >
          <MenuItem onClick={() => void runExport('png')}>{t('Numbered PNG')}</MenuItem>
          <MenuItem onClick={() => void runExport('jpg')}>{t('Numbered JPG')}</MenuItem>
        </Menu>
      </footer>
      </>}
      ]} />
      {removing && (
        <Dialog title={t('Remove')} onClose={() => setRemoving(null)}>
          <p className="dialog-description">
            {t('Remove this frame? Storyboard copies will remain.')}
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setRemoving(null)}>
              {t('Cancel')}
            </button>
            <button
              className="btn primary"
              onClick={() => {
                useStore.getState().removeFrame(removing)
                setSelected(selected.filter((id) => id !== removing))
                setRemoving(null)
              }}
            >
              {t('Remove')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
