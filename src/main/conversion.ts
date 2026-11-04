import { draftFiles } from './draftLibrary'
import { getSettings } from './workspace'
import { app, dialog, ipcMain } from 'electron'
import { readFile, stat, access, writeFile, mkdir, rename, rm } from 'fs/promises'
import { join, basename, dirname, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { parseDraft, convertTimeline } from './draftConversion'
import { CONVERSION_FORMATS, type ConversionFormat, type ConversionSession } from '../shared/conversion'

const sessions = new Map<string, ConversionSession>()
const readable = async (path: string): Promise<boolean> => access(path).then(() => true, () => false)
export async function readDraft(path: string): Promise<ConversionSession> {
  const info = await stat(path)
  if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('Draft must be a JSON file smaller than 64 MB.')
  let raw
  try { raw = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) }
  catch { throw new Error('Encrypted or unreadable draft. Export a readable JSON draft; the Windows encrypted-draft helper cannot run on macOS.') }
  const timeline = parseDraft(raw, path, basename(dirname(path)))
  for (const clip of timeline.clips) {
    if (!clip.path || !['video', 'audio'].includes(clip.kind)) continue
    if (!isAbsolute(clip.path) && !/^[A-Za-z]:/.test(clip.path)) clip.path = join(dirname(path), clip.path)
    if (!await readable(clip.path)) timeline.missing.push(clip.path)
  }
  timeline.missing = [...new Set(timeline.missing)]
  if (path.endsWith('.bak') || path.endsWith('.plain.json') || basename(path).startsWith('template')) timeline.issues.push({ feature: 'Backup/template may differ from the latest saved draft', level: 'unverified', clips: [] })
  const session = { id: randomUUID(), timeline, timelines: [] }
  sessions.set(session.id, session)
  return session
}
export function setupConversion(): void {
  ipcMain.handle('conversion:scan', async (_event, custom?: boolean | string) => {
    if (typeof custom === 'string') return draftFiles(custom)
    if (custom) {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return result.canceled ? [] : draftFiles(result.filePaths[0])
    }
    const settings = await getSettings()
    const movies = app.getPath('videos')
    const roots = settings.draftRoot ? [settings.draftRoot] : ['JianyingPro', 'CapCut', 'Jianying'].map(name => join(movies, name))
    const drafts = (await Promise.all(roots.map(root => draftFiles(root)))).flat()
    return [...new Map(drafts.map(draft => [draft.folder, draft])).values()].sort((a,b) => b.modified-a.modified)
  })
  ipcMain.handle('conversion:open', async (_event, path?: string) => {
    if (!path) {
      const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json', 'bak'] }] })
      if (result.canceled) return null
      path = result.filePaths[0]
    }
    return readDraft(path)
  })
  ipcMain.handle('conversion:relink', async (_event, id: string, missing: string) => {
    const session = sessions.get(id)
    if (!session || !session.timeline.missing.includes(missing)) throw new Error('Unknown draft or media.')
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (!result.canceled) {
      session.timeline.clips.filter(c => c.path === missing).forEach(c => { c.path = result.filePaths[0] })
      session.timeline.missing = session.timeline.missing.filter(path => path !== missing)
    }
    return session
  })
  ipcMain.handle('conversion:preview', (_event, id: string, format: ConversionFormat) => {
    const session = sessions.get(id)
    if (!session || !CONVERSION_FORMATS.includes(format)) throw new Error('Unknown conversion.')
    const data = convertTimeline(session.timeline, format)
    return { text: typeof data === 'string' ? data : `EBU STL · ${data.length} bytes`, bytes: Buffer.byteLength(data) }
  })
  ipcMain.handle('conversion:export', async (_event, id: string, format: ConversionFormat) => {
    const session = sessions.get(id)
    if (!session || !CONVERSION_FORMATS.includes(format)) throw new Error('Unknown conversion.')
    const data = convertTimeline(session.timeline, format)
    const name = session.timeline.name.replace(/[\\/:*?"<>|]/g, '_').split('').map(c => c.charCodeAt(0) < 32 ? '_' : c).join('') || 'Timeline'
    const result = await dialog.showSaveDialog({ defaultPath: join((await getSettings()).conversionRoot, `${name}.${format}`), filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (result.canceled || !result.filePath) return null
    if (result.filePath === session.timeline.source || session.timeline.clips.some(c => c.path === result.filePath)) throw new Error('Cannot overwrite a source file.')
    await mkdir(dirname(result.filePath), { recursive: true })
    const temporary = `${result.filePath}.${randomUUID()}.tmp`
    try { await writeFile(temporary, data); await rename(temporary, result.filePath) }
    finally { await rm(temporary, { force: true }) }
    return result.filePath
  })
  ipcMain.handle('conversion:close', (_event, id: string) => { sessions.delete(id) })
}
