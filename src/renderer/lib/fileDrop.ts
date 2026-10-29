import { useEffect } from 'react'
import { createFrame } from '@shared/schema'
import { t } from '@shared/i18n'
import { useStore } from '../store'

export function useFileDrop(): void {
  useEffect(() => {
    let highlighted: HTMLElement | null = null
    const clear = (): void => {
      highlighted?.classList.remove('file-drop-target')
      highlighted = null
    }
    const target = (event: DragEvent): HTMLElement | null =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('.story-cell-images, .bin, .workspace-page.active')
        : null
    const over = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      const next = target(event)
      if (next !== highlighted) {
        clear()
        highlighted = next
        highlighted?.classList.add('file-drop-target')
      }
    }
    const leave = (event: DragEvent): void => {
      if (!event.relatedTarget) clear()
    }
    const drop = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      const zone = target(event)
      clear()
      const state = useStore.getState()
      const folder = state.projectFolder
      if (
        !folder ||
        !zone ||
        ((state.workspace === 'planning' || state.workspace === 'callsheet') &&
          !zone.dataset.imageShot)
      )
        return
      const workspace = state.workspace
      const shotId = zone.dataset.imageShot
      const columnId = zone.dataset.imageColumn
      const folderId = zone.dataset.importFolder || undefined
      const files = Array.from(event.dataTransfer.files)
      void (async () => {
        let count = 0
        for (const file of files) {
          try {
            const path = window.sbr.pathForFile(file)
            if (!path) throw new Error(t('Could not open project'))
            if (
              (workspace === 'storyboard' || workspace === 'gallery' || workspace === 'planning') &&
              !/\.(png|jpe?g|heic|heif|webp|tiff?|bmp|gif)$/i.test(path)
            ) {
              throw new Error(t('Drop images here; import videos in Capture.'))
            }
            const imported = await window.sbr.importMedia(folder, path)
            if (useStore.getState().projectFolder !== folder) break
            const media = useStore.getState().addMedia({ ...imported, folderId })
            const current = useStore.getState()
            if (shotId && columnId) {
              current.addStoryImage(shotId, columnId, createFrame(media.id, 0, 0, media.name))
            } else if (workspace === 'gallery' || workspace === 'storyboard') {
              const frame = current.addFrame(media.id, 0, media.name)
              if (workspace === 'storyboard') current.addShots([frame.id], false)
            } else if (!count) current.selectMedia(media.id)
            count++
          } catch (error) {
            useStore
              .getState()
              .toast(t('Operation failed: {error}', { error: String(error) }), 'error')
          }
        }
        if (count) useStore.getState().toast(t('Imported {count} files.', { count }), 'success')
      })()
    }
    document.addEventListener('dragover', over, true)
    document.addEventListener('dragleave', leave, true)
    document.addEventListener('drop', drop, true)
    return () => {
      clear()
      document.removeEventListener('dragover', over, true)
      document.removeEventListener('dragleave', leave, true)
      document.removeEventListener('drop', drop, true)
    }
  }, [])
}
