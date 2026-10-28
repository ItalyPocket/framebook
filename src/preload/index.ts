/**
 * Typed IPC bridge. The renderer sees exactly this surface as window.sbr —
 * nothing else from Node.
 */

import type { AppSettings, ProjectEntry, RecoveryEntry, ExportPreview } from '../shared/workspace'
import { contextBridge, ipcRenderer } from 'electron'
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
  preparePreview(request: { storyboard?: StoryboardExportInput; frames?: ExportBoardInput; format?: 'png' | 'jpg' }): Promise<ExportPreview>
  confirmPreview(id: string): Promise<string | null>
  cancelPreview(id: string): Promise<void>
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
  preparePreview: (request) => ipcRenderer.invoke('preview:prepare', request),
  confirmPreview: (id) => ipcRenderer.invoke('preview:confirm', id),
  cancelPreview: (id) => ipcRenderer.invoke('preview:cancel', id),
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
