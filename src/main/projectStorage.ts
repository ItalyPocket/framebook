import { app, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir, rename, readdir, stat, cp, rm } from 'fs/promises'
import { join, resolve, relative, isAbsolute, sep } from 'path'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import type { Project } from '../shared/types'

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
const registry = new Map<string, string>()
export const internalProjectRoot = (): string => join(app.getPath('userData'), 'Projects')
export function internalFolder(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid project ID')
  return join(internalProjectRoot(), `${id}.sbref`)
}
export async function primaryFolder(folder: string): Promise<string> {
  if (registry.has(resolve(folder))) return registry.get(resolve(folder))!
  const raw = await readFile(join(folder, 'project.json'), 'utf8').catch(() => null)
  if (!raw) {
    for (const entry of await readdir(internalProjectRoot(), { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !entry.name.endsWith('.sbref')) continue
      const primary = join(internalProjectRoot(), entry.name)
      const stored = await readFile(join(primary, 'project.json'), 'utf8').then(JSON.parse).catch(() => null) as Project | null
      if (stored?.settings.archiveFolder && resolve(stored.settings.archiveFolder) === resolve(folder)) { registry.set(resolve(folder), primary); return primary }
    }
    return folder
  }
  const doc = JSON.parse(raw) as Project
  const primary = internalFolder(doc.id)
  registry.set(resolve(folder), primary)
  return primary
}
export async function projectData(folder: string): Promise<string> {
  const primary = await primaryFolder(folder)
  return readFile(join(primary, 'project.json'), 'utf8').catch(() => readFile(join(folder, 'project.json'), 'utf8'))
}
export async function atomicJson(path: string, content: string): Promise<void> {
  const temporary = `${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(temporary, content)
  await rename(temporary, path)
}
export async function savePrimary(folder: string, json: string): Promise<{ primary: string; content: string; previous: string | null }> {
  const doc = JSON.parse(json) as Project
  const primary = internalFolder(doc.id)
  doc.settings.archiveFolder = folder
  const content = JSON.stringify(doc, null, 2)
  await mkdir(primary, { recursive: true })
  const previous = await readFile(join(primary, 'project.json'), 'utf8').catch(() => null)
  const original = previous ?? await readFile(join(folder, 'project.json'), 'utf8').catch(() => null)
  if (original) {
    const version = Number(JSON.parse(original).version ?? 1)
    if (version < doc.version) {
      const recovery = join(primary, '.migrations')
      await mkdir(recovery, { recursive: true })
      await writeFile(join(recovery, `schema-${version}-${digest(original).slice(0, 16)}.json`), original, { flag: 'wx' }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error })
    }
  }
  if (!previous && resolve(folder) !== resolve(primary)) {
    const recovery = join(folder, '.autosave')
    if (await stat(recovery).then(info => info.isDirectory()).catch(() => false)) await cp(recovery, join(primary, '.autosave'), { recursive: true, force: false })
  }
  registry.set(resolve(folder), primary)
  return { primary, content, previous }
}
export async function syncArchive(folder: string, primary: string, content: string, force = false): Promise<void> {
  const statePath = join(primary, '.sync.json')
  try {
    const external = await readFile(join(folder, 'project.json'), 'utf8').catch(() => null)
    const last = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => null) as { folder: string; hash: string } | null
    if (!force && last?.folder === folder && external && digest(external) !== last.hash && external !== content) throw new Error('外部项目副本已被修改。内部数据已保存，请在项目设置中处理同步冲突。')
    await stat(folder)
    if (external !== content) await atomicJson(join(folder, 'project.json'), content)
    await atomicJson(statePath, JSON.stringify({ folder, hash: digest(content) }))
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('project:sync', { folder, state: 'synced' })
  } catch (error) {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('project:sync', { folder, state: 'error', error: String(error) })
  }
}
async function mediaHash(path: string): Promise<string> { const value = createHash('sha256'); for await (const chunk of createReadStream(path)) value.update(chunk); return value.digest('hex') }
async function verifyCopy(source: string, destination: string): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (['.autosave', '.sync.json'].includes(entry.name)) continue
    if (entry.isSymbolicLink()) throw new Error('项目包含符号链接，请先将素材导入项目')
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (entry.isDirectory()) await verifyCopy(from, to)
    else if ((await stat(from)).size !== (await stat(to)).size || await mediaHash(from) !== await mediaHash(to)) throw new Error('媒体复制校验失败')
  }
}
export async function moveArchive(folder: string, destination: string, json: string): Promise<string> {
  const from = resolve(folder)
  const to = resolve(destination)
  if (from === to) return folder
  const nested = relative(from, to)
  if (!nested.startsWith(`..${sep}`) && nested !== '..' && !isAbsolute(nested)) throw new Error('新目录不能位于原项目内部')
  if (await stat(to).then(() => true).catch(() => false)) throw new Error('目标项目文件夹已存在，请选择其他位置')
  try {
    await cp(from, to, { recursive: true, errorOnExist: true, force: false, filter: path => !['.autosave', '.sync.json'].includes(path.split(sep).pop()!) })
    await verifyCopy(from, to)
    const doc = JSON.parse(json) as Project
    doc.settings.archiveFolder = to
    const primary = internalFolder(doc.id)
    await atomicJson(join(primary, 'project.json'), JSON.stringify(doc, null, 2))
    await syncArchive(to, primary, JSON.stringify(doc, null, 2), true)
    registry.set(to, primary)
    return to
  } catch (error) { await rm(to, { recursive: true, force: true }); throw error }
}
