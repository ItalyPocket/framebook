import { useEffect, useState } from 'react'
import type { Frame } from '@shared/types'
import { t } from '@shared/i18n'
import { useStore } from '../store'
import { ensureStill } from '../lib/frameOps'
import { useAbsUrl } from '../lib/useMediaUrl'

export function StillImage({ frame }: { frame: Frame }): JSX.Element {
  const clipTime = useStore(state => state.doc?.media.find(media => media.id === frame.mediaId)?.clip?.inS)
  const still = useStore((s) => s.stills[frame.id])
  const url = useAbsUrl(still?.path ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    if (!still || (clipTime !== undefined && still.timeS !== clipTime)) void ensureStill(frame.id, frame).then((path) => { if (active) setFailed(!path) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [frame.id, still, clipTime])
  return url ? <img src={url} alt={frame.label || t('frame still')} /> : <span className="still-placeholder">{t(failed ? 'Could not extract the frame image.' : 'Loading…')}</span>
}
