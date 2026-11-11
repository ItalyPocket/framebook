import { probeMedia } from './ffmpeg'
import { cloudKey, saveCloudKey, decryptDraft } from './draftCloud'
import { draftFiles } from './draftLibrary'
import { getSettings } from './workspace'
import { app, dialog, ipcMain } from 'electron'
import { readFile, stat, access, writeFile, mkdir, rename, rm } from 'fs/promises'
import { join, basename, dirname, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { parseDraft, convertTimeline } from './draftConversion'
import { CONVERSION_FORMATS, type ConversionFormat, type ConversionSession } from '../shared/conversion'

const sessions = new Map<string, ConversionSession>()
async function updateMedia(session: ConversionSession): Promise<void> {
  const timeline = session.timeline
  timeline.issues = timeline.issues.filter(issue => issue.feature !== 'Media metadata could not be verified')
  const probes = new Map<string, Awaited<ReturnType<typeof probeMedia>>>()
  for (const clip of timeline.clips) {
    if (clip.kind !== 'video' || !clip.path || timeline.missing.includes(clip.path)) continue
    try {
      if (!probes.has(clip.path)) probes.set(clip.path, await probeMedia(clip.path))
      const media = probes.get(clip.path)!
      if (media.width && media.height) { clip.width = media.width; clip.height = media.height }
      if (!/\.(png|jpe?g|heic|heif|webp|tiff?|bmp|gif)$/i.test(clip.path)) {
        if (media.fps) clip.fps = media.fps
        const duration = media.videoDurationS ?? media.durationS
        if (duration) clip.materialDuration = duration * 1000000
      }
    } catch { timeline.issues.push({ feature: 'Media metadata could not be verified', level: 'unverified', clips: [clip.id] }) }
  }
}
const readable = async (path: string): Promise<boolean> => access(path).then(() => true, () => false)
export async function readDraft(path: string, cloud = false): Promise<ConversionSession> {
  const info = await stat(path)
  if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('Draft must be a JSON file smaller than 64 MB.')
  const content = await readFile(path)
  let raw
  try { raw = JSON.parse(content.toString('utf8').replace(/^\uFEFF/, '')) }
  catch {
    if (!cloud) throw new Error('加密草稿需要确认云端转换。')
    raw = await decryptDraft(content)
  }
  let name = basename(dirname(path))
  let timelineName = ''
  try {
    const project = JSON.parse(await readFile(join(dirname(dirname(path)), 'project.json'), 'utf8'))
    timelineName = project.timelines?.find((item: { id: string }) => item.id === name)?.name || ''
    name = timelineName || name
  } catch {}
  const nested = raw.materials?.drafts?.[0]?.draft
  if (raw.duration === 0 && nested?.tracks) raw = nested
  const timeline = parseDraft(raw, path, name)
  if (timelineName) timeline.name = timelineName
  for (const clip of timeline.clips) {
    if (!clip.path || !['video', 'audio'].includes(clip.kind)) continue
    const preset = /^##_presetpath_placeholder_[^/]+_##\/(.+)$/.exec(clip.path)
    if (preset) {
      let folder = dirname(path)
      while (dirname(folder) !== folder && basename(folder) !== 'Combination') folder = dirname(folder)
      clip.path = join(folder, preset[1])
    }
    if (!isAbsolute(clip.path) && !/^[A-Za-z]:/.test(clip.path)) clip.path = join(dirname(path), clip.path)
    if (!await readable(clip.path)) timeline.missing.push(clip.path)
  }
  timeline.missing = [...new Set(timeline.missing)]
  if (path.endsWith('.bak') || path.endsWith('.plain.json') || basename(path).startsWith('template')) timeline.issues.push({ feature: 'Backup/template may differ from the latest saved draft', level: 'unverified', clips: [] })
  const session = { id: randomUUID(), timeline, timelines: [] }
  await updateMedia(session)
  sessions.set(session.id, session)
  return session
}
export function setupConversion(): void {
  ipcMain.handle('conversion:key-status', async () => Boolean(await cloudKey()))
  ipcMain.handle('conversion:key-save', (_event, value: string) => saveCloudKey(value))
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
  ipcMain.handle('conversion:open', async (_event, path?: string, cloud = false) => {
    if (!path) {
      const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json', 'bak'] }] })
      if (result.canceled) return null
      path = result.filePaths[0]
    }
    return readDraft(path, cloud)
  })
  ipcMain.handle('conversion:relink', async (_event, id: string, missing: string) => {
    const session = sessions.get(id)
    if (!session || !session.timeline.missing.includes(missing)) throw new Error('Unknown draft or media.')
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (!result.canceled) {
      session.timeline.clips.filter(c => c.path === missing).forEach(c => { c.path = result.filePaths[0] })
      session.timeline.missing = session.timeline.missing.filter(path => path !== missing)
      await updateMedia(session)
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
