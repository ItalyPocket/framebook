import { useStore } from '../store'
import { useMediaUrl } from '../lib/useMediaUrl'

export function ClipPlayer({ mediaId }: { mediaId: string }): JSX.Element {
  const media = useStore(state => state.doc?.media.find(item => item.id === mediaId) ?? null)
  const url = useMediaUrl(media)
  return <video className="clip-export-preview" controls src={url ?? undefined} onLoadedMetadata={event => { event.currentTarget.currentTime = media?.clip?.inS ?? 0 }} onTimeUpdate={event => {
    if (media?.clip && event.currentTarget.currentTime >= media.clip.outS) { event.currentTarget.pause(); event.currentTarget.currentTime = media.clip.inS }
  }} />
}
