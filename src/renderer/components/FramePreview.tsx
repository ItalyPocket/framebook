import { t } from '@shared/i18n'
import type { Frame } from '@shared/types'
import { Dialog } from './Controls'
import { StillImage } from '../panels/StillImage'

export function FramePreview({ frame, onClose }: { frame: Frame; onClose(): void }): JSX.Element {
  return <Dialog title={frame.label || t('Preview image')} onClose={onClose} wide><div className="frame-lightbox"><StillImage frame={frame} /></div></Dialog>
}
