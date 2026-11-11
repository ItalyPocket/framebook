import type { StoryColumn, StoryImage } from '@shared/types'
import { t } from '@shared/i18n'
import { imageOrigin } from '@shared/storyLinks'
import { StillImage } from '../panels/StillImage'
import { useState } from 'react'
import { useStore } from '../store'
import { createFrame } from '@shared/schema'
import { ClipPlayer } from './ClipPlayer'
import { Menu, MenuItem, Dialog } from './Controls'

export function StoryImages({
  shotId,
  column,
  images,
  onChange,
  onPreview,
  onGallery,
  onImport
}: {
  shotId: string
  column: StoryColumn
  images: StoryImage[]
  onChange(images: StoryImage[]): void
  onPreview(image: StoryImage): void
  onGallery(): void
  onImport(): void
}): JSX.Element {
  const [clipPicker, setClipPicker] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const media = useStore(state => state.doc?.media)
  const doc = useStore(state => state.doc)
  return (
    <div className="story-cell-images" data-image-shot={shotId} data-image-column={column.id}>
      {images.map((image, index) => (
        <div key={image.frame.id} className="story-cell-image">
          <button
            className="image-preview-button"
            aria-label={t('Preview image')}
            onClick={() => media?.find(item => item.id === image.frame.mediaId)?.clip ? setPlaying(image.frame.mediaId) : onPreview(image)}
          >
            <StillImage frame={image.frame} />
          </button>
          {doc && imageOrigin(doc, image) === 'ai' && <span className="origin-badge">{t('AI generated')}</span>}
          <div className="image-tools contextual">
            <Menu label={t('Image source')} className="origin-menu">{(['unknown', 'live', 'ai'] as const).map(origin => <MenuItem key={origin} onClick={() => { if (doc?.storyboard.shots.some(shot => shot.id === shotId)) useStore.getState().setImageOrigin(image.sourceFrameId ?? image.frame.id, origin); else onChange(images.map(item => item === image ? { ...item, frame: { ...item.frame, origin } } : item)) }}>{t({ unknown: 'Unmarked', live: 'Live action', ai: 'AI generated' }[origin])}</MenuItem>)}</Menu>
            <button
              className="icon-button"
              aria-label={t('Move left')}
              disabled={!index}
              onClick={() => {
                const next = [...images]
                ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                onChange(next)
              }}
            >
              ←
            </button>
            <button
              className="icon-button"
              aria-label={t('Move right')}
              disabled={index === images.length - 1}
              onClick={() => {
                const next = [...images]
                ;[next[index + 1], next[index]] = [next[index]!, next[index + 1]!]
                onChange(next)
              }}
            >
              →
            </button>
            <button
              className="icon-button danger"
              aria-label={t('Remove image')}
              onClick={() => onChange(images.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
          <span className="image-time">{media?.find(item => item.id === image.frame.mediaId)?.clip ? `▶ ${media.find(item => item.id === image.frame.mediaId)!.durationS?.toFixed(2)} s` : `${image.frame.timeS.toFixed(2)} s`}</span>
        </div>
      ))}
      {playing && <Dialog title={t('Video clip')} onClose={() => setPlaying(null)} wide><ClipPlayer mediaId={playing} /></Dialog>}
      {clipPicker && <Dialog title={t('Add video clip')} onClose={() => setClipPicker(false)} wide><div className="picker-grid">{media?.filter(item => item.clip).map(item => <button className="btn" key={item.id} onClick={() => {
        const frame = createFrame(item.id, item.clip!.inS, images.length, item.name)
        frame.origin = item.libtvSource ? 'ai' : 'unknown'
        frame.durationS = item.clip!.outS - item.clip!.inS
        onChange([...images, { frame, role: 'Reference' }]); setClipPicker(false)
      }}><StillImage frame={{ ...createFrame(item.id, item.clip!.inS, 0, item.name), id: `clip-cover-${item.id}` }} /><span>{item.name} · {item.durationS?.toFixed(2)} s</span></button>)}</div></Dialog>}
      <div className={`story-image-add ${images.length ? 'contextual' : 'empty-image'}`}>
        <Menu label={t('Add image')} className="image-add-trigger">
          <MenuItem onClick={() => setClipPicker(true)}>{t('Add video clip')}</MenuItem>
          <MenuItem onClick={() => onGallery()}>{t('Add from gallery')}</MenuItem>
          <MenuItem onClick={() => onImport()}>{t('Import image')}</MenuItem>
        </Menu>
      </div>
    </div>
  )
}
