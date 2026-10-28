import { app, dialog, ipcMain, shell } from 'electron'
import { mkdir, mkdtemp, readFile, readdir, rm, cp } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { randomUUID } from 'crypto'
import { exportStoryboard, exportNumbered } from './storyboard'
import { getSettings } from './workspace'
import type { StoryboardExportInput } from '../shared/exports'
import type { ExportInput } from './export'
import type { ExportPreview } from '../shared/workspace'

const previews = new Map<
  string,
  { root: string; path: string; category: 'storyboard' | 'frames' }
>()
export function setupPreviews(): void {
  ipcMain.handle(
    'preview:prepare',
    async (
      _event,
      request: { storyboard?: StoryboardExportInput; frames?: ExportInput; format?: 'png' | 'jpg' }
    ) => {
      const root = await mkdtemp(join(app.getPath('temp'), 'framebook-preview-'))
      try {
        const category = request.storyboard ? 'storyboard' : 'frames'
        const result = request.storyboard
          ? await exportStoryboard({ ...request.storyboard, exportsRoot: root })
          : request.frames
            ? await exportNumbered(
                { ...request.frames, exportsRoot: root },
                request.format ?? 'png'
              )
            : null
        if (!result?.ok) throw new Error(result?.error ?? 'Invalid preview request')
        const id = randomUUID()
        const kind = request.storyboard?.kind ?? request.format ?? 'png'
        const preview: ExportPreview = { id, kind, files: [] }
        if (kind === 'pdf') {
          preview.pdf = await readFile(result.path)
          preview.files = [basename(result.path)]
        } else if (kind === 'csv') {
          preview.rows = await readFile(result.path, 'utf8')
          preview.files = [basename(result.path)]
        } else {
          preview.files = (await readdir(result.path))
            .filter((file) => file.endsWith(`.${kind}`))
            .sort()
          preview.images = await Promise.all(
            preview.files.map(async (name) => ({
              name,
              bytes: await readFile(join(result.path, name))
            }))
          )
        }
        previews.set(id, { root, path: result.path, category })
        return preview
      } catch (error) {
        await rm(root, { recursive: true, force: true })
        throw error
      }
    }
  )
  ipcMain.handle('preview:cancel', async (_e, id: string) => {
    const preview = previews.get(id)
    if (preview) {
      previews.delete(id)
      await rm(preview.root, { recursive: true, force: true })
    }
  })
  ipcMain.handle('preview:confirm', async (_e, id: string) => {
    const preview = previews.get(id)
    if (!preview) throw new Error('Preview expired')
    const settings = await getSettings()
    let root = preview.category === 'storyboard' ? settings.storyboardRoot : settings.framesRoot
    if (preview.category === 'storyboard' ? settings.askStoryboard : settings.askFrames) {
      const result = await dialog.showOpenDialog({
        defaultPath: root,
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled) return null
      root = result.filePaths[0]!
    }
    await mkdir(root, { recursive: true })
    const destination = await mkdtemp(join(root, `${preview.category}-`))
    const path =
      preview.category === 'storyboard' ? join(destination, basename(preview.path)) : destination
    try {
      await cp(preview.path, path, { recursive: true })
    } catch (error) {
      await rm(destination, { recursive: true, force: true })
      throw error
    }
    if (preview.category === 'storyboard')
      await rm(join(dirname(preview.path), 'storyboard.html'), { force: true })
    previews.delete(id)
    await rm(preview.root, { recursive: true, force: true })
    shell.showItemInFolder(path)
    return path
  })
  app.on('will-quit', () => {
    for (const preview of previews.values()) void rm(preview.root, { recursive: true, force: true })
  })
}
