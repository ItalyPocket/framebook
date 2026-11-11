import type { ConversionSession, ConversionFormat, DraftEntry } from '../shared/conversion'
import type { LibTVFile, LibTVJob } from '../shared/libtv'
/**
 * Typed IPC bridge. The renderer sees exactly this surface as window.sbr —
 * nothing else from Node.
 */

import type { AppSettings, ProjectEntry, RecoveryEntry, ExportPreview } from '../shared/workspace'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DescribeResult } from '../shared/types'
import type { ExportFrameInput, StoryboardExportInput, FileExportResult } from '../shared/exports'
export type { ExportFrameInput } from '../shared/exports'

export interface ImportedMedia {
  kind: 'image' | 'video'
  sourceFile: string
  workingFile?: string
  externalPath?: string
  name: string
  width: number
  height: number
  durationS?: number
  fps?: number
}

export interface ImportedAudio {
  sourceFile: string
  name: string
}

export type RangeMode =
  | { kind: 'interval'; everyS: number }
  | { kind: 'scene'; threshold: number }
  | { kind: 'count'; n: number }

export interface ExtractRangeResult {
  ok: boolean
  error?: string
  frames: { time: number; path: string }[]
}

export interface ExportBoardInput {
  projectName: string
  exportsRoot: string
  frames: ExportFrameInput[]
}

export interface AnimaticOptions {
  burnLabel?: boolean
  audioPath?: string | null
}

export interface SbrAPI {
  libtvGenerate(input: import('../shared/libtvGeneration').LibTVGenerationInput): Promise<import('../shared/libtvGeneration').LibTVGenerationTask>
  libtvTasks(): Promise<import('../shared/libtvGeneration').LibTVGenerationTask[]>
  libtvDetach(id: string): Promise<void>
  libtvDownload(id: string, folder: string, watermark: boolean): Promise<ImportedMedia[]>
  moveArchive(folder: string, parent: string, json: string): Promise<string>
  resolveSync(folder: string): Promise<void>
  onProjectSync(cb: (value: { folder: string; state: string; error?: string }) => void): () => void
  libtvLogin(): Promise<{ state: string; error?: string }>
  libtvLoginStatus(): Promise<{ state: string; error?: string } | null>
  libtvAccount(): Promise<unknown>
  libtvWorkspaces(): Promise<unknown>
  libtvCanvases(workspace?: string, page?: number): Promise<{ id: string; name: string }[]>
  libtvModels(type: 'image' | 'video'): Promise<unknown>
  libtvSchema(model: string): Promise<unknown>
  clipsPrepare(folder: string, ids: string[], options?: import('../shared/clips').ClipExportOptions): Promise<import('../shared/clips').ClipExportJob>
  clipsStatus(id: string): Promise<import('../shared/clips').ClipExportJob | null>
  clipsRead(id: string, index: number): Promise<Uint8Array>
  clipsCancel(id: string): Promise<void>
  clipsConfirm(id: string): Promise<string | null>
  conversionKeyStatus(): Promise<boolean>
  conversionKeySave(value: string): Promise<void>
  conversionScan(custom?: boolean | string): Promise<DraftEntry[]>
  conversionOpen(path?: string, cloud?: boolean): Promise<ConversionSession | null>
  conversionRelink(id: string, path: string): Promise<ConversionSession>
  conversionPreview(id: string, format: ConversionFormat): Promise<{ text: string; bytes: number }>
  conversionExport(id: string, format: ConversionFormat): Promise<string | null>
  conversionClose(id: string): Promise<void>
  preparePreview(request: { projectFolder?: string; storyboard?: StoryboardExportInput; frames?: ExportBoardInput; format?: 'png' | 'jpg' }): Promise<ExportPreview>
  confirmPreview(id: string): Promise<string | null>
  cancelPreview(id: string): Promise<void>
  libtvRender(folder: string, input: ExportFrameInput, index: number): Promise<string>
  libtvConfigure(key: string): Promise<{ projectId: string }>
  libtvTargets(): Promise<string[]>
  libtvVerify(projectId?: string): Promise<{ projectId: string }>
  libtvInspect(folder: string, files: LibTVFile[]): Promise<LibTVFile[]>
  libtvUpload(folder: string, projectId: string, files: LibTVFile[]): Promise<string>
  libtvStatus(id: string): Promise<LibTVJob | null>
  libtvCancel(id: string): Promise<void>
  materializeCapture(folder: string, frameId: string, source: string): Promise<void>
  revealMedia(folder: string, id: string): Promise<void>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  chooseDirectory(): Promise<string | null>
  listProjects(): Promise<ProjectEntry[]>
  createProject(name: string): Promise<string>
  renameProject(folder: string, name: string, json: string): Promise<string>
  listBackups(folder: string): Promise<RecoveryEntry[]>
  readBackup(folder: string, file: string): Promise<string>
  shareProject(folder: string, json: string): Promise<string | null>

  onHistory(cb: (action: 'undo' | 'redo') => void): () => void
  exportStoryboard(input: StoryboardExportInput): Promise<FileExportResult>
  exportNumbered(input: ExportBoardInput, format: 'png' | 'jpg'): Promise<FileExportResult>
  setLanguage(value: 'system' | 'zh-CN' | 'en'): Promise<void>
  newProjectDialog(): Promise<string | null>
  openProjectDialog(): Promise<string | null>
  pathForFile(file: File): string
  importMediaDialog(): Promise<string[]>
  importImagesDialog(): Promise<string[]>
  saveProject(folder: string, json: string): Promise<boolean>
  saveBackup(folder: string, json: string): Promise<boolean>
  loadProject(folder: string): Promise<{
    json: string | null
    backupJson: string | null
    backupNewer: boolean
    folder: string
  }>
  importMedia(folder: string, sourcePath: string): Promise<ImportedMedia>
  importAudio(folder: string, sourcePath: string): Promise<ImportedAudio>
  pasteImage(folder: string, data: ArrayBuffer, index: number): Promise<ImportedMedia>
  readProjectFile(folder: string, relativePath: string): Promise<ArrayBuffer>
  writeProjectPng(folder: string, relativePath: string, base64: string): Promise<boolean>
  showFolder(path: string): Promise<void>
  openExternal(url: string): Promise<boolean>
  extractFrame(
    mediaPath: string,
    timeS: number,
    outPng: string
  ): Promise<{ ok: boolean; error?: string; path: string }>
  extractRange(
    mediaPath: string,
    startS: number,
    endS: number,
    mode: RangeMode,
    outDir: string
  ): Promise<ExtractRangeResult>
  describeFrame(framePngPath: string, profileId: string, extraContext: string): Promise<DescribeResult>
  exportBoard(input: ExportBoardInput): Promise<{ ok: boolean; error?: string; packagePath: string }>
  exportAnimatic(
    input: ExportBoardInput,
    opts: AnimaticOptions
  ): Promise<{ ok: boolean; error?: string; videoPath: string }>
  exportPdf(input: ExportBoardInput): Promise<{ ok: boolean; error?: string; pdfPath: string }>
  exportShotlist(input: ExportBoardInput): Promise<{ ok: boolean; error?: string; csvPath: string }>
  ensureDir(path: string): Promise<boolean>
  tempDir(): Promise<string>
  versions(): Promise<{ app: string; electron: string; node: string }>
  onControlInvoke(cb: (id: string, action: string, params: unknown) => void): () => void
  controlResult(id: string, result: { ok: boolean; data?: unknown; error?: string }): void
}

const api: SbrAPI = {
  libtvGenerate: (input) => ipcRenderer.invoke('libtv:generate', input),
  libtvTasks: () => ipcRenderer.invoke('libtv:tasks'),
  libtvDetach: (id) => ipcRenderer.invoke('libtv:detach', id),
  libtvDownload: (id, folder, watermark) => ipcRenderer.invoke('libtv:download', id, folder, watermark),
  moveArchive: (folder, parent, json) => ipcRenderer.invoke('project:moveArchive', folder, parent, json),
  resolveSync: (folder) => ipcRenderer.invoke('project:resolveSync', folder),
  onProjectSync: (cb) => {
    const listener = (_event: unknown, value: { folder: string; state: string; error?: string }): void => cb(value)
    ipcRenderer.on('project:sync', listener)
    return () => ipcRenderer.removeListener('project:sync', listener)
  },
  libtvLogin: () => ipcRenderer.invoke('libtv:login'),
  libtvLoginStatus: () => ipcRenderer.invoke('libtv:loginStatus'),
  libtvAccount: () => ipcRenderer.invoke('libtv:account'),
  libtvWorkspaces: () => ipcRenderer.invoke('libtv:workspaces'),
  libtvCanvases: (workspace, page) => ipcRenderer.invoke('libtv:canvases', workspace, page),
  libtvModels: (type) => ipcRenderer.invoke('libtv:models', type),
  libtvSchema: (model) => ipcRenderer.invoke('libtv:schema', model),
  clipsPrepare: (folder, ids, options) => ipcRenderer.invoke('clips:prepare', folder, ids, options),
  clipsStatus: (id) => ipcRenderer.invoke('clips:status', id),
  clipsRead: (id, index) => ipcRenderer.invoke('clips:read', id, index),
  clipsCancel: (id) => ipcRenderer.invoke('clips:cancel', id),
  clipsConfirm: (id) => ipcRenderer.invoke('clips:confirm', id),
  conversionKeyStatus: () => ipcRenderer.invoke('conversion:key-status'),
  conversionKeySave: (value) => ipcRenderer.invoke('conversion:key-save', value),
  conversionScan: (custom) => ipcRenderer.invoke('conversion:scan', custom),
  conversionOpen: (path, cloud) => ipcRenderer.invoke('conversion:open', path, cloud),
  conversionRelink: (id, path) => ipcRenderer.invoke('conversion:relink', id, path),
  conversionPreview: (id, format) => ipcRenderer.invoke('conversion:preview', id, format),
  conversionExport: (id, format) => ipcRenderer.invoke('conversion:export', id, format),
  conversionClose: (id) => ipcRenderer.invoke('conversion:close', id),
  preparePreview: (request) => ipcRenderer.invoke('preview:prepare', request),
  confirmPreview: (id) => ipcRenderer.invoke('preview:confirm', id),
  cancelPreview: (id) => ipcRenderer.invoke('preview:cancel', id),
  libtvRender: (folder, input, index) => ipcRenderer.invoke('libtv:render', folder, input, index),
  libtvConfigure: (key) => ipcRenderer.invoke('libtv:configure', key),
  libtvTargets: () => ipcRenderer.invoke('libtv:targets'),
  libtvVerify: (projectId) => ipcRenderer.invoke('libtv:verify', projectId),
  libtvInspect: (folder, files) => ipcRenderer.invoke('libtv:inspect', folder, files),
  libtvUpload: (folder, projectId, files) => ipcRenderer.invoke('libtv:upload', folder, projectId, files),
  libtvStatus: (id) => ipcRenderer.invoke('libtv:status', id),
  libtvCancel: (id) => ipcRenderer.invoke('libtv:cancel', id),
  materializeCapture: (folder, frameId, source) => ipcRenderer.invoke('media:materializeCapture',folder,frameId,source),
  revealMedia: (folder, id) => ipcRenderer.invoke('media:reveal', folder, id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  chooseDirectory: () => ipcRenderer.invoke('settings:directory'),
  listProjects: () => ipcRenderer.invoke('library:list'),
  createProject: (name) => ipcRenderer.invoke('library:create', name),
  renameProject: (folder, name, json) => ipcRenderer.invoke('library:rename', folder, name, json),
  listBackups: (folder) => ipcRenderer.invoke('library:backups', folder),
  readBackup: (folder, file) => ipcRenderer.invoke('library:readBackup', folder, file),
  shareProject: (folder, json) => ipcRenderer.invoke('library:share', folder, json),
  onHistory: (cb) => {
    const listener = (_event: unknown, action: 'undo' | 'redo'): void => cb(action)
    ipcRenderer.on('history:action', listener)
    return () => ipcRenderer.removeListener('history:action', listener)
  },
  exportStoryboard: (input) => ipcRenderer.invoke('export:storyboard', input),
  exportNumbered: (input, format) => ipcRenderer.invoke('export:numbered', input, format),
  setLanguage: (value) => ipcRenderer.invoke('app:setLanguage', value),
  newProjectDialog: () => ipcRenderer.invoke('dialog:newProject'),
  openProjectDialog: () => ipcRenderer.invoke('dialog:openProject'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  importMediaDialog: () => ipcRenderer.invoke('dialog:importMedia'),
  importImagesDialog: () => ipcRenderer.invoke('dialog:importImages'),
  saveProject: (folder, json) => ipcRenderer.invoke('project:save', folder, json),
  saveBackup: (folder, json) => ipcRenderer.invoke('project:saveBackup', folder, json),
  loadProject: (folder) => ipcRenderer.invoke('project:load', folder),
  importMedia: (folder, sourcePath) => ipcRenderer.invoke('project:importMedia', folder, sourcePath),
  importAudio: (folder, sourcePath) => ipcRenderer.invoke('project:importAudio', folder, sourcePath),
  pasteImage: (folder, data, index) => ipcRenderer.invoke('project:pasteImage', folder, data, index),
  readProjectFile: (folder, rel) => ipcRenderer.invoke('file:readProjectFile', folder, rel),
  writeProjectPng: (folder, rel, base64) => ipcRenderer.invoke('file:writeProjectPng', folder, rel, base64),
  showFolder: (path) => ipcRenderer.invoke('shell:showFolder', path),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  extractFrame: (mediaPath, timeS, outPng) => ipcRenderer.invoke('frames:extract', mediaPath, timeS, outPng),
  extractRange: (mediaPath, startS, endS, mode, outDir) =>
    ipcRenderer.invoke('frames:extractRange', mediaPath, startS, endS, mode, outDir),
  describeFrame: (framePngPath, profileId, extraContext) =>
    ipcRenderer.invoke('ai:describeFrame', framePngPath, profileId, extraContext),
  exportBoard: (input) => ipcRenderer.invoke('export:board', input),
  exportAnimatic: (input, opts) => ipcRenderer.invoke('export:animatic', input, opts),
  exportPdf: (input) => ipcRenderer.invoke('export:pdf', input),
  exportShotlist: (input) => ipcRenderer.invoke('export:shotlist', input),
  ensureDir: (path) => ipcRenderer.invoke('fs:ensureDir', path),
  tempDir: () => ipcRenderer.invoke('app:tempDir'),
  versions: () => ipcRenderer.invoke('app:versions'),
  onControlInvoke: (cb) => {
    const listener = (_e: unknown, id: string, action: string, params: unknown) => cb(id, action, params)
    ipcRenderer.on('control:invoke', listener)
    return () => ipcRenderer.removeListener('control:invoke', listener)
  },
  controlResult: (id, result) => ipcRenderer.send('control:result', id, result)
}

contextBridge.exposeInMainWorld('sbr', api)
