import { nativeImage } from 'electron'
import { readFile, readdir, stat } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { createHash } from 'crypto'
import type { DraftEntry, DraftSource, DraftStatus } from '../shared/conversion'

const names = ['draft_content.json', 'draft_info.json', 'template.json', 'draft_content.json.bak', 'draft_info.json.bak', 'template.json.bak', 'draft_content.plain.json', 'draft_info.plain.json']
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
async function inspect(path: string): Promise<{ status: DraftStatus; data?: Record<string, any>; fingerprint?: string }> {
  try {
    const info = await stat(path)
    if (info.size > 64 * 1024 * 1024 || !info.size) return { status: 'invalid' }
    const content = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
    const fingerprint = createHash('sha256').update(content).digest('hex')
    try {
      const data = JSON.parse(content)
      return data && Array.isArray(data.tracks) && data.materials
        ? { status: 'readable', data, fingerprint }
        : { status: 'invalid', fingerprint }
    } catch {
      return { status: /^[A-Za-z0-9+/=\r\n]+$/.test(content) ? 'encrypted' : 'invalid', fingerprint }
    }
  } catch { return { status: 'invalid' } }
}
async function source(folder: string): Promise<string | undefined> {
  const entries = new Set(await readdir(folder).catch(() => []))
  return names.find(name => entries.has(name))
}
async function entry(folder: string, file: string): Promise<DraftEntry> {
  const path = join(folder, file)
  const primary = await inspect(path)
  const sources: DraftSource[] = [{ path, name: 'Current draft', status: primary.status }]
  const fingerprints = new Set([primary.fingerprint])
  const files = new Set(await readdir(folder).catch(() => []))
  for (const filename of names) {
    if (filename === file || !files.has(filename)) continue
    const backup = await inspect(join(folder, filename))
    if (backup.status !== 'readable' || backup.fingerprint && fingerprints.has(backup.fingerprint)) continue
    fingerprints.add(backup.fingerprint)
    sources.push({ path: join(folder, filename), name: `Readable backup: ${filename}`, status: 'readable' })
  }
  const timelines = join(folder, 'Timelines')
  let timelineNames: Record<string, string> = {}
  try {
    const project = JSON.parse(await readFile(join(timelines, 'project.json'), 'utf8'))
    timelineNames = Object.fromEntries((project.timelines ?? []).filter((item: any) => !item.is_marked_delete).map((item: any) => [item.id, item.name]))
  } catch {}
  const children = await readdir(timelines, { withFileTypes: true }).catch(() => [])
  for (const child of children) {
    if (!child.isDirectory() || child.name.startsWith('.')) continue
    const parent = join(timelines, child.name)
    const filename = await source(parent)
    if (!filename) continue
    const timeline = await inspect(join(parent, filename))
    if (!timelineNames[child.name] && timeline.fingerprint && fingerprints.has(timeline.fingerprint)) continue
    fingerprints.add(timeline.fingerprint)
    sources.push({ path: join(parent, filename), name: timelineNames[child.name] || typeof timeline.data?.name === 'string' && timeline.data.name.trim() || `Timeline ${sources.length}`, status: timeline.status })
  }
  let name = basename(folder)
  try {
    const metaPath = join(folder, 'draft_meta_info.json')
    if ((await stat(metaPath)).size < 4 * 1024 * 1024) {
      const meta = JSON.parse((await readFile(metaPath, 'utf8')).replace(/^\uFEFF/, ''))
      if (typeof meta.draft_name === 'string' && meta.draft_name.trim()) name = meta.draft_name
    }
  } catch {}
  let cover: string | undefined
  try {
    const coverPath = join(folder, 'draft_cover.jpg')
    if ((await stat(coverPath)).size < 8 * 1024 * 1024) {
      const image = nativeImage.createFromPath(coverPath)
      if (!image.isEmpty()) cover = `data:image/jpeg;base64,${image.resize({ width: 320, height: 180, quality: 'good' }).toJPEG(70).toString('base64')}`
    }
  } catch {}
  return {
    path, folder, name, modified: (await stat(path)).mtimeMs, status: primary.status, cover,
    duration: number(primary.data?.duration), fps: number(primary.data?.fps),
    width: number(primary.data?.canvas_config?.width), height: number(primary.data?.canvas_config?.height), sources
  }
}
export async function draftFiles(root: string, depth = 0): Promise<DraftEntry[]> {
  if (depth > 6) return []
  const folder = resolve(root)
  const file = await source(folder)
  if (file) return [await entry(folder, file)]
  const children = await readdir(folder, { withFileTypes: true }).catch(() => [])
  const found: DraftEntry[] = []
  for (let index = 0; index < Math.min(children.length, 2000); index += 12) {
    const group = children.slice(index, index + 12).filter(child => child.isDirectory() && !child.name.startsWith('.') && !['Resources', 'node_modules', 'subdraft'].includes(child.name))
    const entries = await Promise.all(group.map(child => draftFiles(join(folder, child.name), depth + 1).catch(() => [])))
    found.push(...entries.flat())
  }
  try {
    const indexPath = join(folder, 'root_meta_info.json')
    if ((await stat(indexPath)).size < 32 * 1024 * 1024) {
      const index = JSON.parse((await readFile(indexPath, 'utf8')).replace(/^\uFEFF/, ''))
      const projects = new Map<string, Record<string, any>>()
      for (const project of Array.isArray(index.all_draft_store) ? index.all_draft_store : []) {
        if (typeof project?.draft_fold_path === 'string') projects.set(resolve(project.draft_fold_path), project)
      }
      for (const draft of found) {
        const project = projects.get(draft.folder)
        if (!project) continue
        if (typeof project.draft_name === 'string' && project.draft_name.trim()) draft.name = project.draft_name
        draft.duration ??= number(project.tm_duration)
        const modified = number(project.tm_draft_modified)
        if (modified) draft.modified = modified > 100000000000000 ? modified / 1000 : modified > 100000000000 ? modified : modified * 1000
      }
    }
  } catch {}
  return found.sort((a, b) => b.modified - a.modified)
}
