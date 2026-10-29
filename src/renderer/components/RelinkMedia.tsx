import { t } from '@shared/i18n'
import { useStore } from '../store'
import type { MediaItem } from '@shared/types'

export function RelinkMedia({ media }: { media: MediaItem }): JSX.Element {
  return <div className="empty-editor"><p>{t('Source media is unavailable.')}</p><button className="btn" onClick={async () => {
    const state=useStore.getState()
    if(!state.projectFolder) return
    const paths=await window.sbr.importMediaDialog()
    if(!paths[0]) return
    try {
      const replacement=await window.sbr.importMedia(state.projectFolder,paths[0])
      if(replacement.kind!==media.kind) throw new Error(t('Choose the same media type.'))
      state.mutate('relink media',(doc) => { for(const item of doc.media) if(item.sourceFile===media.sourceFile && item.externalPath===media.externalPath) Object.assign(item,replacement) })
      useStore.setState({stills:{}})
    } catch(error) { state.toast(String(error),'error') }
  }}>{t('Relink')}</button></div>
}
