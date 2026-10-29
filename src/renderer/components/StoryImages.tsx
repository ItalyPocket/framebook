import type { StoryColumn, StoryImage } from '@shared/types'
import { t } from '@shared/i18n'
import { StillImage } from '../panels/StillImage'
import { Menu, MenuItem } from './Controls'

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
  return (
    <div className="story-cell-images" data-image-shot={shotId} data-image-column={column.id}>
      {images.map((image, index) => (
        <div key={image.frame.id} className="story-cell-image">
          <button
            className="image-preview-button"
            aria-label={t('Preview image')}
            onClick={() => onPreview(image)}
          >
            <StillImage frame={image.frame} />
          </button>
          <div className="image-tools contextual">
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
          <span className="image-time">{image.frame.timeS.toFixed(2)} s</span>
        </div>
      ))}
      <div className={`story-image-add ${images.length ? 'contextual' : 'empty-image'}`}>
        <Menu label={t('Add image')} className="image-add-trigger">
          <MenuItem onClick={() => onGallery()}>{t('Add from gallery')}</MenuItem>
          <MenuItem onClick={() => onImport()}>{t('Import image')}</MenuItem>
        </Menu>
      </div>
    </div>
  )
}
