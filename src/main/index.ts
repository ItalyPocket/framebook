import { setupLibTV } from './libtv'
import { t, setLanguage, resolveLanguage, type LanguagePreference } from '../shared/i18n'
/**
 * Electron main process: window lifecycle, project folder I/O, media import
 * (copy into media/ + ffprobe), ffmpeg frame extraction, and board export. All filesystem + subprocess access lives here;
 * the renderer talks through the typed IPC surface in src/preload.
 */

import { mkdirSync } from 'fs'
import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron'
import { mkdir, readFile, writeFile, copyFile, stat } from 'fs/promises'
import { join, basename, extname, resolve, sep } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { startControlServer } from './control'
import { probeMedia } from './ffmpeg'
import { extractFrame, extractRange, type RangeMode } from './frames'
import {
  exportBoard,
  exportAnimatic,
  exportShotList,
  type ExportInput,
  type AnimaticOptions
} from './export'
import { exportPdf } from './pdf'
import { exportStoryboard, exportNumbered } from './storyboard'
import type { StoryboardExportInput } from '../shared/exports'
import { setupPreviews } from './preview'
import { getSettings, saveProject, registerProject, setupWorkspace } from './workspace'
import { version as APP_VERSION } from '../../package.json'

if (process.env.SBR_SMOKE_DIR) {
  const data = join(process.env.SBR_SMOKE_DIR, '.app-data')
  mkdirSync(data, { recursive: true }); app.setPath('userData', data)
}

const isDev = !!process.env.ELECTRON_RENDERER_URL

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    show: false,
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    title: '帧册 / Framebook',
    backgroundColor: '#1737d1',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (isDev) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Native About panel (macOS "About Storyboard Reference Studio").
  app.setAboutPanelOptions({
    applicationName: '帧册 / Framebook',
    applicationVersion: app.getVersion(),
    credits: 'Storyboard Reference Studio · Sam Wasserman · wassermanproductions.com',
    copyright: 'Apache-2.0'
  })
  setupWorkspace()
  setupPreviews()
  setupLibTV(resolveReadablePath)
  createWindow()
  void startControlServer(() => mainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ------------------------------- dialogs -------------------------------- */

const externalSources = new Map<string, Set<string>>()
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'gif']
const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm']
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac']

ipcMain.handle('dialog:newProject', async () => {
  if (process.env.SBR_SMOKE_DIR) {
    const folder = join(process.env.SBR_SMOKE_DIR, 'Smoke.sbref')
    await mkdir(join(folder, 'media'), { recursive: true })
    await mkdir(join(folder, 'exports'), { recursive: true })
    return folder
  }
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: t('Create Storyboard Project'),
    buttonLabel: t('Create'),
    nameFieldLabel: t('Project name'),
    defaultPath: join(app.getPath('documents'), 'Untitled.sbref')
  })
  if (result.canceled || !result.filePath) return null
  const folder = result.filePath.endsWith('.sbref') ? result.filePath : `${result.filePath}.sbref`
  await mkdir(join(folder, 'media'), { recursive: true })
  await mkdir(join(folder, 'exports'), { recursive: true })
  return folder
})

ipcMain.handle('dialog:openProject', async () => {
  if (process.env.SBR_SMOKE_DIR) {
    return join(process.env.SBR_SMOKE_DIR, 'Smoke.sbref')
  }
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('Open Storyboard Project'),
    properties: ['openDirectory'],
    message: t('Choose a .sbref project folder')
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:importMedia', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('Import media'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: t('Media'), extensions: [...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS] },
      { name: t('Images'), extensions: IMAGE_EXTS },
      { name: t('Videos'), extensions: VIDEO_EXTS },
      { name: t('Audio'), extensions: AUDIO_EXTS }
    ]
  })
  if (result.canceled) return []
  return result.filePaths
})

ipcMain.handle('dialog:importImages', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('Import image'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: t('Images'), extensions: IMAGE_EXTS }]
  })
  return result.canceled ? [] : result.filePaths
})

/* ---------------------------- project I/O ------------------------------- */

ipcMain.handle('project:save', (_e, folder: string, json: string) => saveProject(folder, json))

ipcMain.handle('project:saveBackup', async (_e, folder: string, json: string) => {
  await mkdir(join(folder, '.autosave'), { recursive: true })
  await writeFile(join(folder, '.autosave', 'project.autosave.json'), json, 'utf-8')
  return true
})

ipcMain.handle('project:load', async (_e, folder: string) => {
  await registerProject(folder)
  const main = join(folder, 'project.json')
  const backup = join(folder, '.autosave', 'project.autosave.json')
  const out: { json: string | null; backupJson: string | null; backupNewer: boolean; folder: string } = {
    json: null,
    backupJson: null,
    backupNewer: false,
    folder
  }
  let mainTime = 0
  let backupTime = 0
  try {
    out.json = await readFile(main, 'utf-8')
    mainTime = (await stat(main)).mtimeMs
  } catch {}
  try {
    out.backupJson = await readFile(backup, 'utf-8')
    backupTime = (await stat(backup)).mtimeMs
  } catch {}
  out.backupNewer = backupTime > mainTime + 1500 && out.backupJson !== out.json
  return out
})

function guardPath(folder: string, relativePath: string): string {
  const base = resolve(folder)
  const full = resolve(base, relativePath)
  if (full !== base && !full.startsWith(base + sep)) throw new Error('path escapes project folder')
  return full
}

/** Copy a source file into media/ and probe it. Returns the new MediaItem shape. */
ipcMain.handle('project:importMedia', async (_e, folder: string, sourcePath: string) => {
  const mediaDir = join(folder, 'media')
  await mkdir(mediaDir, { recursive: true })
  const ext = extname(sourcePath).toLowerCase()
  const kind = VIDEO_EXTS.includes(ext.replace('.', '')) ? 'video' : 'image'
  const name = `${Date.now().toString(36)}-${basename(sourcePath)}`
  const copied = (await getSettings()).copyMedia
  const dest = copied ? join(mediaDir, name) : sourcePath
  if (copied) await copyFile(sourcePath, dest)
  else { const paths = externalSources.get(folder) ?? new Set<string>(); paths.add(sourcePath); externalSources.set(folder, paths) }
  let workingFile: string | undefined
  let width = 0
  let height = 0
  if (kind === 'image') {
    const workingName = `${name.replace(/\.[^.]+$/, '')}.png`
    const workingPath = join(mediaDir, workingName)
    try {
      if (process.platform === 'darwin') {
        await promisify(execFile)('/usr/bin/sips', ['-s', 'format', 'png', dest, '--out', workingPath])
        workingFile = join('media', workingName)
        const info = await promisify(execFile)('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', workingPath])
        width = Number(info.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]) || 0
        height = Number(info.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]) || 0
      }
    } catch {}
  }
  if (!width || !height) {
    const info = await probeMedia(workingFile ? join(folder, workingFile) : dest)
    width = info.width
    height = info.height
  }
  const info = await probeMedia(workingFile ? join(folder, workingFile) : dest).catch(() => ({ durationS: undefined, fps: undefined }))
  return {
    kind,
    sourceFile: copied ? join('media', name) : '',
    externalPath: copied ? undefined : sourcePath,
    workingFile,
    name: basename(sourcePath),
    width,
    height,
    durationS: info.durationS,
    fps: info.fps
  }
})

/** Write pasted PNG bytes into media/pasted-<n>.png and probe. */
ipcMain.handle('project:pasteImage', async (_e, folder: string, data: ArrayBuffer, index: number) => {
  const mediaDir = join(folder, 'media')
  await mkdir(mediaDir, { recursive: true })
  const name = `pasted-${index}-${Date.now().toString(36)}.png`
  const dest = join(mediaDir, name)
  await writeFile(dest, Buffer.from(data))
  const info = await probeMedia(dest)
  return {
    kind: 'image' as const,
    sourceFile: join('media', name),
    name,
    width: info.width,
    height: info.height
  }
})

/** Copy an audio scratch track into media/ and return its project-relative path. */
ipcMain.handle('project:importAudio', async (_e, folder: string, sourcePath: string) => {
  const mediaDir = join(folder, 'media')
  await mkdir(mediaDir, { recursive: true })
  const name = `${Date.now().toString(36)}-${basename(sourcePath)}`
  const dest = join(mediaDir, name)
  await copyFile(sourcePath, dest)
  return { sourceFile: join('media', name), name: basename(sourcePath) }
})

ipcMain.handle('file:readProjectFile', async (_e, folder: string, relativePath: string) => {
  const full = await resolveReadablePath(folder, relativePath)
  const data = await readFile(full)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
})

/** Write base64 PNG bytes to a project-relative path (used for annotation composites). */
ipcMain.handle('file:writeProjectPng', async (_e, folder: string, relativePath: string, base64: string) => {
  const full = guardPath(folder, relativePath)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, Buffer.from(base64, 'base64'))
  return true
})

ipcMain.handle('shell:showFolder', async (_e, path: string) => {
  shell.showItemInFolder(path)
})

const EXTERNAL_LINK_ALLOWLIST = new Set(['wassermanproductions.com', 'wasserman.ai', 'github.com', 'liblib.tv'])

ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^www\./, '')
  if (parsed.protocol !== 'https:' || !EXTERNAL_LINK_ALLOWLIST.has(host)) return false
  await shell.openExternal(url)
  return true
})

/* --------------------------- frame extraction --------------------------- */

ipcMain.handle('frames:extract', async (_e, mediaPath: string, timeS: number, outPng: string) => {
  return extractFrame(mediaPath, timeS, outPng)
})

ipcMain.handle(
  'frames:extractRange',
  async (_e, mediaPath: string, startS: number, endS: number, mode: RangeMode, outDir: string) => {
    return extractRange(mediaPath, startS, endS, mode, outDir)
  }
)

ipcMain.handle('ai:describeFrame', async () => ({ ok: false, error: t('AI features are temporarily disabled.') }))

/* -------------------------------- export -------------------------------- */

ipcMain.handle('export:board', async (_e, input: ExportInput) => {
  const out = await exportBoard(input)
  if (out.ok) shell.showItemInFolder(out.packagePath)
  return out
})

ipcMain.handle('export:animatic', async (_e, input: ExportInput, opts: AnimaticOptions) => {
  const out = await exportAnimatic(input, opts ?? {})
  if (out.ok) shell.showItemInFolder(out.videoPath)
  return out
})

ipcMain.handle('export:pdf', async (_e, input: ExportInput) => {
  const out = await exportPdf(input)
  if (out.ok) shell.showItemInFolder(out.pdfPath)
  return out
})

ipcMain.handle('export:shotlist', async (_e, input: ExportInput) => {
  const out = await exportShotList(input)
  if (out.ok) shell.showItemInFolder(out.csvPath)
  return out
})

/** Generic write used by the renderer for scratch frame extraction targets. */
ipcMain.handle('fs:ensureDir', async (_e, path: string) => {
  await mkdir(path, { recursive: true })
  return true
})

ipcMain.handle('app:versions', () => ({
  app: APP_VERSION,
  electron: process.versions.electron,
  node: process.versions.node
}))

ipcMain.handle('app:tempDir', () => app.getPath('temp'))

ipcMain.handle('app:setLanguage', (_e, preference: LanguagePreference) => {
  setLanguage(resolveLanguage(preference, app.getLocale()))
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '帧册', submenu: [{ role: 'about', label: t('About') }, { type: 'separator' }, { role: 'quit', label: t('Quit') }] },
    { label: t('Edit'), submenu: [{ label: t('Undo'), accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('history:action', 'undo') }, { label: t('Redo'), accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow?.webContents.send('history:action', 'redo') }, { type: 'separator' }, { role: 'cut', label: t('Cut') }, { role: 'copy', label: t('Copy') }, { role: 'paste', label: t('Paste') }, { role: 'selectAll', label: t('Select all') }] },
    { label: t('View'), submenu: [{ role: 'togglefullscreen', label: t('Fullscreen') }] },
    { label: t('Window'), submenu: [{ role: 'minimize', label: t('Minimize') }, { role: 'zoom', label: t('Zoom') }] }
  ]))
})

ipcMain.handle('export:storyboard', async (_e, input: StoryboardExportInput) => {
  const result = await exportStoryboard(input)
  if (result.ok) shell.showItemInFolder(result.path)
  return result
})
ipcMain.handle('export:numbered', async (_e, input: ExportInput, format: 'png' | 'jpg') => {
  const result = await exportNumbered(input, format)
  if (result.ok) shell.showItemInFolder(result.path)
  return result
})

async function resolveReadablePath(folder: string, path: string): Promise<string> {
  try { return guardPath(folder, path) } catch {
    if (externalSources.get(folder)?.has(path)) return path
    const project = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8'))
    if (project.media?.some((media: { externalPath?: string }) => media.externalPath === path)) return path
    throw new Error('File is not registered in this project')
  }
}

ipcMain.handle('media:reveal', async (_e, folder: string, id: string) => {
  const project = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8'))
  const media = project.media.find((item: { id: string }) => item.id === id)
  if (!media) throw new Error('Media not found. Save the project first.')
  shell.showItemInFolder(await resolveReadablePath(folder, media.externalPath ?? media.sourceFile))
})
