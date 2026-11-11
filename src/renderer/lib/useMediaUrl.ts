import { ensureCapture } from './captureMedia'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { projectFileUrl, mimeForMedia } from './paths'
import type { MediaItem } from '@shared/types'

export function useMediaUrl(media: MediaItem | null, enabled = true): string | null {
  const folder = useStore((s) => s.projectFolder)
  const [url, setUrl] = useState<string | null>(null)
  const capturedStill=useStore((s) => media?.capturedFrameId ? s.stills[media.capturedFrameId] : undefined)
  useEffect(() => {
    let alive = true
    if (!media || !folder || !enabled) {
      setUrl(null)
      return
    }
    setUrl(null)
    void (media.capturedFrameId ? ensureCapture(media.capturedFrameId) : Promise.resolve()).then(() => projectFileUrl(folder, media.workingFile ?? media.externalPath ?? media.sourceFile, mimeForMedia(media.workingFile ?? media.name))).then((u) => {
      if (alive) setUrl(u)
    }).catch(() => { if (alive) setUrl(null) })
    return () => {
      alive = false
    }
  }, [media?.id, media?.externalPath, media?.workingFile, capturedStill?.path, folder, enabled])
  return url
}

export function useAbsUrl(absPath: string | null): string | null {
  const folder = useStore((s) => s.projectFolder)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!absPath || !folder) {
      setUrl(null)
      return
    }
    const rel = absPath.startsWith(folder) ? absPath.slice(folder.length).replace(/^[/\\]/, '') : absPath
    void projectFileUrl(folder, rel, 'image/png').then(value => { if (alive) setUrl(value) }).catch(() => { if (alive) setUrl(null) })
    return () => {
      alive = false
    }
  }, [absPath, folder])
  return url
}

export function useThumbnailUrl(media: MediaItem | null, enabled = true): string | null {
  const folder = useStore(state => state.projectFolder)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (media && folder && enabled) void (media.capturedFrameId ? ensureCapture(media.capturedFrameId) : Promise.resolve()).then(() => window.sbr.thumbnailUrl(folder, media.workingFile ?? media.externalPath ?? media.sourceFile, media.clip?.inS ?? 0)).then(value => { if (alive) setUrl(value) }).catch(() => {})
    return () => { alive = false }
  }, [folder, media?.id, media?.workingFile, media?.externalPath, media?.clip?.inS, enabled])
  return url
}
