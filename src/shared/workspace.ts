export interface AppSettings {
  projectRoot: string
  libraryRoots: string[]
  recentProjects: string[]
  storyboardRoot: string
  framesRoot: string
  askStoryboard: boolean
  askFrames: boolean
  autosave: boolean
  autosaveSeconds: number
  backupLimit: number
  motionStyle: 'standard' | 'cinematic'
  simplifyAnimations: boolean
  copyMedia: boolean
}
export interface ProjectEntry {
  folder: string
  name: string
  modified: number
  shots: number
  cover?: string
}
export interface RecoveryEntry {
  file: string
  modified: number
}
export interface ExportPreview {
  id: string
  kind: 'pdf' | 'csv' | 'png' | 'jpg'
  files: string[]
  pdf?: Uint8Array
  rows?: string
  images?: { name: string; bytes: Uint8Array }[]
}
