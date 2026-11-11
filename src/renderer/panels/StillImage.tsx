import { useEffect, useState } from 'react'
import type { Frame } from '@shared/types'
import { t } from '@shared/i18n'
import { useStore } from '../store'
import { ensureCapture } from '../lib/captureMedia'
import { useVisible } from '../lib/useVisible'

export function StillImage({ frame }: { frame: Frame }): JSX.Element {
  const folder = useStore(state => state.projectFolder)
  const media = useStore(state => state.doc?.media.find(item => item.id === frame.mediaId))
  const [visibleRef, visible] = useVisible<HTMLImageElement>()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setUrl(null); setFailed(false)
    if (!visible || !folder || !media) return
    const source = media.workingFile ?? media.externalPath ?? media.sourceFile
    void (media.capturedFrameId ? ensureCapture(media.capturedFrameId) : Promise.resolve()).then(() => window.sbr.thumbnailUrl(folder, source, media.kind === 'image' ? 0 : media.clip?.inS ?? frame.timeS)).then(value => { if (alive) setUrl(value) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [visible, folder, media?.id, media?.workingFile, media?.externalPath, media?.clip?.inS, frame.timeS])
  return <img ref={visibleRef} src={visible && url ? url : undefined} width={media?.width || 320} height={media?.height || 180} loading="lazy" alt={failed ? t('Could not extract the frame image.') : frame.label || t('frame still')} />
}
