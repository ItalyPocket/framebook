import { t } from '@shared/i18n'
import { defaultProjectExports } from '@shared/schema'
import { useStore } from '../store'
import type { ProjectExportSettings } from '@shared/types'

export function ProjectExports(): JSX.Element {
  const settings = useStore(state => state.doc?.settings.exports)
  const value = settings ?? defaultProjectExports()
  const update = (change: (next: ProjectExportSettings) => void): void => useStore.getState().mutate('project export settings', project => {
    project.settings.exports ??= defaultProjectExports()
    change(project.settings.exports)
  })
  return <details className="project-export-settings"><summary>{t('Project exports')}</summary>
    {(['storyboard', 'frames', 'clips'] as const).map(category => <div key={category}>
      <label className="field">{t({ storyboard: 'Storyboard export location', frames: 'Frame export location', clips: 'Video clip export location' }[category])}<div className="path-setting"><input value={value[category].directory} onChange={event => update(next => { next[category].directory = event.target.value })} /><button className="btn" onClick={async () => { const directory = await window.sbr.chooseDirectory(); if (directory) update(next => { next[category].directory = directory }) }}>{t('Choose folder')}</button></div></label>
      <label className="setting-check"><input type="checkbox" checked={value[category].ask} onChange={event => update(next => { next[category].ask = event.target.checked })} />{t('Ask for export location each time')}</label>
    </div>)}
    <label className="field">{t('Video format')}<select value={value.video.format} onChange={event => update(next => { next.video.format = event.target.value as 'mp4' | 'mov' })}><option value="mp4">MP4 · H.264</option><option value="mov">MOV · ProRes 422</option></select></label>
    <label className="field">{t('Resolution')}<select value={value.video.resolution} onChange={event => update(next => { next.video.resolution = event.target.value as ProjectExportSettings['video']['resolution'] })}>{['native', '2160', '1080', '720'].map(resolution => <option key={resolution} value={resolution}>{resolution === 'native' ? t('Native resolution') : `${resolution}p`}</option>)}</select></label>
    <label className="setting-check"><input type="checkbox" checked={value.video.muted} onChange={event => update(next => { next.video.muted = event.target.checked })} />{t('Export without audio')}</label>
  </details>
}
