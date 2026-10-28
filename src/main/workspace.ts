import { app, dialog, ipcMain } from 'electron'
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
  rm,
  cp,
  copyFile,
  mkdtemp
} from 'fs/promises'
import { join, dirname, basename, resolve } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AppSettings, ProjectEntry } from '../shared/workspace'
import type { Project } from '../shared/types'

const safeName = (name: string): string =>
  Array.from(name.trim())
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 100) || 'Untitled'
const writes = new Map<string, Promise<unknown>>()
let settingsCache: AppSettings | undefined
export async function getSettings(): Promise<AppSettings> {
  if (settingsCache) return settingsCache
  const defaults: AppSettings = {
    projectRoot: join(app.getPath('userData'), 'Projects'),
    libraryRoots: [],
    recentProjects: [],
    storyboardRoot: join(app.getPath('documents'), '帧册', '导出', '分镜本'),
    framesRoot: join(app.getPath('documents'), '帧册', '导出', '静帧'),
    askStoryboard: false,
    askFrames: false,
    autosave: true,
    autosaveSeconds: 60,
    backupLimit: 5,
    simplifyAnimations: false,
    copyMedia: true
  }
  const stored = await readFile(join(app.getPath('userData'), 'settings.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => ({}))
  settingsCache = { ...defaults, ...stored }
  return settingsCache!
}
async function writeSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const previous = await getSettings()
  const next = { ...previous, ...patch }
  next.autosaveSeconds = Math.max(10, Number(next.autosaveSeconds) || 60)
  next.backupLimit = Math.max(1, Math.floor(Number(next.backupLimit) || 5))
  next.libraryRoots = [
    ...new Set([...previous.libraryRoots, previous.projectRoot, next.projectRoot])
  ]
  await mkdir(app.getPath('userData'), { recursive: true })
  const target = join(app.getPath('userData'), 'settings.json')
  const temporary = `${target}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(temporary, JSON.stringify(next, null, 2))
  await rename(temporary, target)
  settingsCache = next
  return next
}
let settingsWrites: Promise<unknown> = Promise.resolve()
function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const task = settingsWrites.catch(() => {}).then(() => writeSettings(patch))
  settingsWrites = task
  return task
}
export async function registerProject(folder: string): Promise<void> {
  const settings = await getSettings()
  await setSettings({
    recentProjects: [...new Set([folder, ...settings.recentProjects])],
    libraryRoots: [...new Set([...settings.libraryRoots, dirname(folder)])]
  })
}
export async function saveProject(folder: string, json: string): Promise<boolean> {
  const task = (writes.get(folder) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await mkdir(folder, { recursive: true })
      const target = join(folder, 'project.json')
      const previous = await readFile(target, 'utf8').catch(() => null)
      if (previous === json) return true
      JSON.parse(json)
      const backupDir = join(folder, '.autosave')
      if (previous) {
        await mkdir(backupDir, { recursive: true })
        await writeFile(
          join(backupDir, `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
          previous
        )
      }
      const temporary = join(
        folder,
        `project.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
      )
      await writeFile(temporary, json)
      await rename(temporary, target)
      const limit = (await getSettings()).backupLimit
      const backups = (await readdir(backupDir).catch(() => []))
        .filter((file) => file.startsWith('recovery-'))
        .sort()
        .reverse()
      for (const file of backups.slice(limit)) await rm(join(backupDir, file))
      return true
    })
  writes.set(folder, task)
  try {
    return await task
  } finally {
    if (writes.get(folder) === task) writes.delete(folder)
  }
}
export async function createProject(name: string): Promise<string> {
  const root = process.env.SBR_SMOKE_DIR ?? (await getSettings()).projectRoot
  await mkdir(root, { recursive: true })
  const stem = safeName(name)
  let folder = join(root, `${stem}.sbref`)
  for (
    let index = 2;
    await stat(folder)
      .then(() => true)
      .catch(() => false);
    index++
  )
    folder = join(root, `${stem} ${index}.sbref`)
  await mkdir(join(folder, 'media'), { recursive: true })
  await registerProject(folder)
  return folder
}
export async function listProjects(): Promise<ProjectEntry[]> {
  const settings = await getSettings()
  const paths = new Set(settings.recentProjects)
  for (const root of new Set([settings.projectRoot, ...settings.libraryRoots])) {
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => []))
      if (entry.isDirectory() && entry.name.endsWith('.sbref')) paths.add(join(root, entry.name))
  }
  const entries = await Promise.all(
    [...paths].map(async (folder) => {
      try {
        const doc = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8')) as Project
        const cover = doc.media.find((media) => media.kind === 'image')
        const source = cover?.workingFile ?? (cover?.externalPath ? undefined : cover?.sourceFile)
        const coverBytes = source ? await readFile(join(folder, source)).catch(() => null) : null
        return {
          folder,
          name: doc.name,
          modified: (await stat(join(folder, 'project.json'))).mtimeMs,
          shots: doc.storyboard?.shots.length ?? 0,
          cover: coverBytes
            ? `data:image/${source?.endsWith('.png') ? 'png' : 'jpeg'};base64,${coverBytes.toString('base64')}`
            : undefined
        }
      } catch {
        return null
      }
    })
  )
  return entries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.modified - a.modified)
}
export function setupWorkspace(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => setSettings(patch))
  ipcMain.handle('settings:directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('library:list', () => listProjects())
  ipcMain.handle('library:create', (_e, name: string) => createProject(name))
  ipcMain.handle('library:rename', async (_e, folder: string, name: string, json: string) => {
    await writes.get(folder)
    const doc = JSON.parse(json) as Project
    const target = join(dirname(folder), `${safeName(name)}.sbref`)
    if (resolve(target) !== resolve(folder)) {
      if (
        await stat(target)
          .then(() => true)
          .catch(() => false)
      )
        throw new Error('A project with this name already exists.')
      await rename(folder, target)
    }
    try {
      doc.name = name.trim()
      doc.storyboard.title = name.trim()
      await saveProject(target, JSON.stringify(doc, null, 2))
    } catch (error) {
      if (target !== folder) await rename(target, folder)
      throw error
    }
    const settings = await getSettings()
    await setSettings({ recentProjects: settings.recentProjects.filter((path) => path !== folder) })
    await registerProject(target)
    return target
  })
  ipcMain.handle('library:backups', async (_e, folder: string) => {
    const dir = join(folder, '.autosave')
    return Promise.all(
      (await readdir(dir).catch(() => []))
        .filter((file) => /^recovery-.*\.json$/.test(file))
        .sort()
        .reverse()
        .map(async (file) => ({ file, modified: (await stat(join(dir, file))).mtimeMs }))
    )
  })
  ipcMain.handle('library:readBackup', (_e, folder: string, file: string) => {
    if (!/^recovery-[a-zA-Z0-9.-]+\.json$/.test(file)) throw new Error('Invalid backup')
    return readFile(join(folder, '.autosave', file), 'utf8')
  })
  ipcMain.handle('library:share', async (_e, folder: string, json: string) => {
    const doc = JSON.parse(json) as Project
    const destination = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('documents'), `${safeName(doc.name)}.zip`),
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    })
    if (destination.canceled || !destination.filePath) return null
    const staging = await mkdtemp(join(app.getPath('temp'), 'framebook-share-'))
    try {
      const packagePath = join(staging, `${safeName(doc.name)}.sbref`)
      await cp(folder, packagePath, {
        recursive: true,
        filter: (path) => !['exports', '.autosave', '.frames'].includes(basename(path))
      })
      for (const media of doc.media)
        if (media.externalPath) {
          const relative = join('media', `${media.id}-${basename(media.externalPath)}`)
          await mkdir(join(packagePath, 'media'), { recursive: true })
          await copyFile(media.externalPath, join(packagePath, relative))
          media.sourceFile = relative
          delete media.externalPath
        }
      await writeFile(join(packagePath, 'project.json'), JSON.stringify(doc, null, 2))
      await promisify(execFile)('/usr/bin/ditto', [
        '-c',
        '-k',
        '--keepParent',
        packagePath,
        destination.filePath
      ])
      return destination.filePath
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  })
}
